"use client";

import { supabase } from "@/lib/supabase/client";
import {
  createOpportunityRecord,
  normalizeOpportunity,
  validateOpportunity
} from "./opportunityModel";
import {
  createOpportunityCandidateRecord,
  findOpportunityCandidateDuplicate,
  makeOpportunityCandidateFingerprint,
  normalizeOpportunityCandidate,
  sortOpportunityCandidates,
  validateOpportunityCandidate
} from "./opportunityCandidateModel";

export const OPPORTUNITY_CANDIDATE_STORAGE_KEY = "ariadne_opportunity_candidates_v1";
export const OPPORTUNITY_CANDIDATE_CLOUD_UNAVAILABLE = "OPPORTUNITY_CANDIDATE_CLOUD_UNAVAILABLE";
export const OPPORTUNITY_CANDIDATE_CONFLICT = "OPPORTUNITY_CANDIDATE_CONFLICT";

const CANDIDATE_SELECT = [
  "id", "user_id", "source_type", "source_name", "source_external_id", "source_url", "canonical_url", "source_payload",
  "title", "type", "organization", "description", "requirements", "standardized_requirements", "misc_requirements",
  "deadline", "start_date", "discovered_at", "last_seen_at", "content_hash", "review_status", "rejection_reason",
  "matched_opportunity_id", "created_at", "updated_at"
].join(",");

function readJson(storageKey, fallback) {
  if (typeof window === "undefined") return fallback;
  try { const raw = window.localStorage.getItem(storageKey); if (!raw) return fallback; return JSON.parse(raw) ?? fallback; } catch { return fallback; }
}

function writeJson(storageKey, value) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* resilience cache only */ }
}

function normalizeCollection(value) {
  return (Array.isArray(value) ? value : []).map((item) => normalizeOpportunityCandidate(item)).filter((item) => Boolean(item.id));
}

function readLocalCandidates(userId = "") {
  const stored = readJson(OPPORTUNITY_CANDIDATE_STORAGE_KEY, null);
  if (Array.isArray(stored)) return normalizeCollection(stored);
  if (!stored || typeof stored !== "object") return [];
  const storedUserId = String(stored.userId || "").trim();
  const requestedUserId = String(userId || "").trim();
  if (storedUserId && requestedUserId && storedUserId !== requestedUserId) return [];
  return normalizeCollection(stored.candidates);
}

function writeLocalCandidates(userId, candidates) {
  const normalized = sortOpportunityCandidates(normalizeCollection(candidates));
  writeJson(OPPORTUNITY_CANDIDATE_STORAGE_KEY, { version: 2, userId: String(userId || "").trim(), candidates: normalized });
  return normalized;
}

function notifyLocalUpdate(onLocalUpdate, candidates) { onLocalUpdate?.(candidates); }

function fromRow(row) {
  return normalizeOpportunityCandidate({
    id: row?.id,
    source_type: row?.source_type,
    source_name: row?.source_name,
    source_external_id: row?.source_external_id,
    source_url: row?.source_url,
    canonical_url: row?.canonical_url,
    source_payload: row?.source_payload,
    title: row?.title,
    type: row?.type,
    organization: row?.organization,
    description: row?.description,
    requirements: row?.requirements,
    standardized_requirements: row?.standardized_requirements,
    misc_requirements: row?.misc_requirements,
    deadline: row?.deadline,
    start_date: row?.start_date,
    discovered_at: row?.discovered_at,
    last_seen_at: row?.last_seen_at,
    content_hash: row?.content_hash,
    review_status: row?.review_status,
    rejection_reason: row?.rejection_reason,
    matched_opportunity_id: row?.matched_opportunity_id,
    created_at: row?.created_at,
    updated_at: row?.updated_at
  });
}

function toCreateRow(candidate, userId) {
  return {
    id: candidate.id,
    user_id: userId,
    source_type: candidate.sourceType,
    source_name: candidate.sourceName,
    source_external_id: candidate.sourceExternalId || null,
    source_url: candidate.sourceUrl || null,
    canonical_url: candidate.canonicalUrl || null,
    source_payload: candidate.sourcePayload || {},
    title: candidate.title,
    type: candidate.type,
    organization: candidate.organization || null,
    description: candidate.description || null,
    requirements: candidate.miscRequirements || null,
    standardized_requirements: candidate.standardizedRequirements || [],
    misc_requirements: candidate.miscRequirements || null,
    deadline: candidate.deadline || null,
    start_date: candidate.startDate || null,
    discovered_at: candidate.discoveredAt,
    last_seen_at: candidate.lastSeenAt,
    content_hash: candidate.contentHash,
    review_status: candidate.reviewStatus,
    rejection_reason: candidate.rejectionReason || null,
    matched_opportunity_id: candidate.matchedOpportunityId || null,
    created_at: candidate.createdAt
  };
}

function replaceLocalCandidate(userId, candidate) {
  const local = readLocalCandidates(userId);
  const exists = local.some((item) => item.id === candidate.id);
  return writeLocalCandidates(userId, exists ? local.map((item) => item.id === candidate.id ? candidate : item) : [...local, candidate]);
}

function timestampValue(value) { const parsed = Date.parse(String(value || "")); return Number.isNaN(parsed) ? 0 : parsed; }

function mergeRemoteWithLocal(local, remote) {
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const merged = remote.map((remoteItem) => {
    const localItem = local.find((item) => item.id === remoteItem.id);
    if (!localItem) return remoteItem;
    return timestampValue(localItem.updatedAt) > timestampValue(remoteItem.updatedAt) ? localItem : remoteItem;
  });
  for (const localItem of local) if (!remoteById.has(localItem.id)) merged.push(localItem);
  return sortOpportunityCandidates(merged);
}

function requireCloud(userId) { if (supabase && userId) return; throw new Error(OPPORTUNITY_CANDIDATE_CLOUD_UNAVAILABLE); }
function throwValidationError(input) { const errors = validateOpportunityCandidate(input); if (!Object.keys(errors).length) return; const error = new Error("INVALID_OPPORTUNITY_CANDIDATE"); error.validationErrors = errors; throw error; }
function makeConflictError(candidateId) { const error = new Error(OPPORTUNITY_CANDIDATE_CONFLICT); error.details = { candidateId }; return error; }

export async function loadOpportunityCandidatesState(userId) {
  const local = readLocalCandidates(userId);
  if (!supabase || !userId) return { candidates: sortOpportunityCandidates(local), cloudAvailable: false, source: "cache", error: null };
  const { data, error } = await supabase.from("opportunity_candidates").select(CANDIDATE_SELECT).eq("user_id", userId);
  if (error) return { candidates: sortOpportunityCandidates(local), cloudAvailable: false, source: "cache", error };
  const remote = normalizeCollection((data || []).map(fromRow));
  if (remote.length === 0 && local.length > 0) return { candidates: sortOpportunityCandidates(local), cloudAvailable: true, source: "cache-preserved", error: null };
  const merged = mergeRemoteWithLocal(local, remote);
  writeLocalCandidates(userId, merged);
  return { candidates: merged, cloudAvailable: true, source: "cloud", error: null };
}

export async function loadOpportunityCandidates(userId) { return (await loadOpportunityCandidatesState(userId)).candidates; }

export async function createOpportunityCandidate({ candidate, userId, onLocalUpdate }) {
  requireCloud(userId);
  const record = createOpportunityCandidateRecord(candidate);
  throwValidationError(record);
  const { data, error } = await supabase.from("opportunity_candidates").insert(toCreateRow(record, userId)).select(CANDIDATE_SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw makeConflictError(record.id);
  const saved = fromRow(data);
  const next = replaceLocalCandidate(userId, saved);
  notifyLocalUpdate(onLocalUpdate, next);
  return saved;
}

const EDITABLE_FIELDS = new Set([
  "title", "type", "organization", "description", "requirements", "standardizedRequirements", "miscRequirements",
  "deadline", "startDate", "canonicalUrl"
]);

function editablePatch(patch = {}) { return Object.fromEntries(Object.entries(patch).filter(([key]) => EDITABLE_FIELDS.has(key))); }

function toEditableUpdateRow(candidate) {
  return {
    title: candidate.title,
    type: candidate.type,
    organization: candidate.organization || null,
    description: candidate.description || null,
    requirements: candidate.miscRequirements || null,
    standardized_requirements: candidate.standardizedRequirements || [],
    misc_requirements: candidate.miscRequirements || null,
    deadline: candidate.deadline || null,
    start_date: candidate.startDate || null,
    canonical_url: candidate.canonicalUrl || null
  };
}

export async function updateOpportunityCandidate({ candidateId, patch, userId, onLocalUpdate }) {
  requireCloud(userId);
  const current = readLocalCandidates(userId).find((item) => item.id === candidateId);
  if (!current) throw new Error("OPPORTUNITY_CANDIDATE_NOT_FOUND");
  if (current.reviewStatus !== "pending") throw new Error("OPPORTUNITY_CANDIDATE_ALREADY_REVIEWED");

  const updated = { ...current, ...editablePatch(patch), id: current.id, updatedAt: current.updatedAt };
  throwValidationError(updated);
  const normalized = normalizeOpportunityCandidate(updated);

  let query = supabase.from("opportunity_candidates").update(toEditableUpdateRow(normalized)).eq("id", candidateId).eq("user_id", userId);
  if (current.updatedAt) query = query.eq("updated_at", current.updatedAt);
  const { data, error } = await query.select(CANDIDATE_SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw makeConflictError(candidateId);
  const saved = fromRow(data);
  const next = replaceLocalCandidate(userId, saved);
  notifyLocalUpdate(onLocalUpdate, next);
  return saved;
}

export async function setOpportunityCandidateReview({ candidateId, reviewStatus, rejectionReason = "", userId, onLocalUpdate }) {
  requireCloud(userId);
  if (reviewStatus !== "rejected" && reviewStatus !== "duplicate") throw new Error("INVALID_OPPORTUNITY_CANDIDATE_REVIEW_TRANSITION");
  const current = readLocalCandidates(userId).find((item) => item.id === candidateId);
  if (!current) throw new Error("OPPORTUNITY_CANDIDATE_NOT_FOUND");
  if (current.reviewStatus !== "pending") throw new Error("OPPORTUNITY_CANDIDATE_ALREADY_REVIEWED");

  let query = supabase.from("opportunity_candidates").update({ review_status: reviewStatus, rejection_reason: String(rejectionReason || "").trim() || null }).eq("id", candidateId).eq("user_id", userId);
  if (current.updatedAt) query = query.eq("updated_at", current.updatedAt);
  const { data, error } = await query.select(CANDIDATE_SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw makeConflictError(candidateId);
  const saved = fromRow(data);
  const next = replaceLocalCandidate(userId, saved);
  notifyLocalUpdate(onLocalUpdate, next);
  return saved;
}

export async function acceptOpportunityCandidate({ candidateId, candidatePatch = {}, userId, onLocalUpdate }) {
  requireCloud(userId);
  const current = readLocalCandidates(userId).find((item) => item.id === candidateId);
  if (!current) throw new Error("OPPORTUNITY_CANDIDATE_NOT_FOUND");
  if (current.reviewStatus !== "pending") throw new Error("OPPORTUNITY_CANDIDATE_ALREADY_REVIEWED");

  const normalizedCandidate = normalizeOpportunityCandidate({ ...current, ...editablePatch(candidatePatch) });
  throwValidationError(normalizedCandidate);

  const opportunityInput = {
    title: normalizedCandidate.title,
    type: normalizedCandidate.type,
    organization: normalizedCandidate.organization,
    url: normalizedCandidate.canonicalUrl || normalizedCandidate.sourceUrl,
    description: normalizedCandidate.description,
    standardizedRequirements: normalizedCandidate.standardizedRequirements,
    miscRequirements: normalizedCandidate.miscRequirements,
    deadline: normalizedCandidate.deadline,
    startDate: normalizedCandidate.startDate
  };
  const opportunityErrors = validateOpportunity(opportunityInput);
  if (Object.keys(opportunityErrors).length) { const error = new Error("INVALID_OPPORTUNITY"); error.validationErrors = opportunityErrors; throw error; }
  const opportunity = createOpportunityRecord(opportunityInput);

  const { data, error } = await supabase.rpc("accept_opportunity_candidate", {
    p_candidate_id: candidateId,
    p_opportunity_id: opportunity.id,
    p_title: opportunity.title,
    p_type: opportunity.type,
    p_organization: opportunity.organization || null,
    p_url: opportunity.url || null,
    p_description: opportunity.description || null,
    p_requirements: opportunity.miscRequirements || null,
    p_deadline: opportunity.deadline || null,
    p_start_date: opportunity.startDate || null,
    p_standardized_requirements: opportunity.standardizedRequirements || [],
    p_misc_requirements: opportunity.miscRequirements || null
  });

  if (error) throw error;
  if (!data?.candidate || !data?.opportunity) throw makeConflictError(candidateId);
  const savedCandidate = fromRow(data.candidate);
  const savedOpportunity = normalizeOpportunity(data.opportunity);
  const next = replaceLocalCandidate(userId, savedCandidate);
  notifyLocalUpdate(onLocalUpdate, next);
  return { candidate: savedCandidate, opportunity: savedOpportunity };
}

function observationUpdateRow(existing, incoming, now) {
  return {
    last_seen_at: now,
    source_url: incoming.sourceUrl || existing.sourceUrl || null,
    canonical_url: existing.canonicalUrl || incoming.canonicalUrl || null,
    source_payload: incoming.sourcePayload || {},
    content_hash: incoming.contentHash || makeOpportunityCandidateFingerprint(incoming)
  };
}

export async function ingestOpportunityCandidate({ candidate, userId, onLocalUpdate, now = new Date() }) {
  requireCloud(userId);
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const incoming = createOpportunityCandidateRecord({
    ...candidate,
    reviewStatus: "pending",
    discoveredAt: candidate?.discoveredAt || timestamp,
    lastSeenAt: timestamp
  }, now);
  throwValidationError(incoming);

  const existing = await loadOpportunityCandidates(userId);
  const duplicate = findOpportunityCandidateDuplicate(existing, incoming);
  if (!duplicate) {
    const created = await createOpportunityCandidate({ candidate: incoming, userId, onLocalUpdate });
    return { candidate: created, created: true, duplicateReason: null };
  }

  const current = duplicate.candidate;
  let query = supabase.from("opportunity_candidates").update(observationUpdateRow(current, incoming, timestamp)).eq("id", current.id).eq("user_id", userId);
  if (current.updatedAt) query = query.eq("updated_at", current.updatedAt);
  const { data, error } = await query.select(CANDIDATE_SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw makeConflictError(current.id);
  const refreshed = fromRow(data);
  const next = replaceLocalCandidate(userId, refreshed);
  notifyLocalUpdate(onLocalUpdate, next);
  return { candidate: refreshed, created: false, duplicateReason: duplicate.reason };
}
