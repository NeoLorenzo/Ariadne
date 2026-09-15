"use client";

import { supabase } from "@/lib/supabase/client";
import {
  createOpportunityApplicationRecord,
  normalizeOpportunityApplication,
  sortOpportunityApplications,
  validateOpportunityApplication
} from "./opportunityApplicationModel";

export const OPPORTUNITY_APPLICATION_STORAGE_KEY = "ariadne_opportunity_applications_v1";

const APPLICATION_SELECT = [
  "id",
  "user_id",
  "opportunity_id",
  "submitted_at",
  "status",
  "status_updated_at",
  "notes",
  "created_at",
  "updated_at"
].join(",");

function readJson(storageKey, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey, value) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* best effort */ }
}

function normalizeCollection(value) {
  return sortOpportunityApplications((Array.isArray(value) ? value : [])
    .map((item) => normalizeOpportunityApplication(item))
    .filter((item) => item.id && item.opportunityId));
}

function readLocalApplications(userId = "") {
  const stored = readJson(OPPORTUNITY_APPLICATION_STORAGE_KEY, null);
  if (Array.isArray(stored)) return normalizeCollection(stored);
  if (!stored || typeof stored !== "object") return [];
  const storedUserId = String(stored.userId || "").trim();
  const requestedUserId = String(userId || "").trim();
  if (storedUserId && requestedUserId && storedUserId !== requestedUserId) return [];
  return normalizeCollection(stored.applications);
}

function writeLocalApplications(userId, applications) {
  const normalized = normalizeCollection(applications);
  writeJson(OPPORTUNITY_APPLICATION_STORAGE_KEY, {
    version: 1,
    userId: String(userId || "").trim(),
    applications: normalized
  });
  return normalized;
}

function fromRow(row) {
  return normalizeOpportunityApplication(row);
}

function toRow(application, userId) {
  return {
    id: application.id,
    user_id: userId,
    opportunity_id: application.opportunityId,
    submitted_at: application.submittedAt,
    status: application.status,
    status_updated_at: application.statusUpdatedAt,
    notes: application.notes || null,
    created_at: application.createdAt
  };
}

function throwValidationError(input) {
  const errors = validateOpportunityApplication(input);
  if (Object.keys(errors).length === 0) return;
  const error = new Error("INVALID_OPPORTUNITY_APPLICATION");
  error.validationErrors = errors;
  throw error;
}

function rollback(userId, applications, onLocalUpdate) {
  const restored = writeLocalApplications(userId, applications);
  onLocalUpdate?.(restored);
}

export async function loadOpportunityApplications(userId) {
  const local = readLocalApplications(userId);
  if (!supabase || !userId) return local;

  const { data, error } = await supabase
    .from("opportunity_applications")
    .select(APPLICATION_SELECT)
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false });

  if (error) return local;
  const remote = normalizeCollection((data || []).map(fromRow));
  writeLocalApplications(userId, remote);
  return remote;
}

export async function createOpportunityApplication({ application, userId, onLocalUpdate }) {
  throwValidationError(application);
  const current = readLocalApplications(userId);
  if (current.some((item) => item.opportunityId === application.opportunityId)) {
    throw new Error("OPPORTUNITY_APPLICATION_EXISTS");
  }

  const record = createOpportunityApplicationRecord(application);
  const optimistic = writeLocalApplications(userId, [...current, record]);
  onLocalUpdate?.(optimistic);

  if (!supabase || !userId) {
    rollback(userId, current, onLocalUpdate);
    throw new Error("SUPABASE_UNAVAILABLE");
  }

  const { data, error } = await supabase
    .from("opportunity_applications")
    .insert(toRow(record, userId))
    .select(APPLICATION_SELECT)
    .single();

  if (error) {
    rollback(userId, current, onLocalUpdate);
    throw error;
  }

  const saved = fromRow(data);
  const synced = writeLocalApplications(userId, optimistic.map((item) => item.id === record.id ? saved : item));
  onLocalUpdate?.(synced);
  return saved;
}

export async function updateOpportunityApplication({ applicationId, patch, userId, onLocalUpdate }) {
  const currentApplications = readLocalApplications(userId);
  const current = currentApplications.find((item) => item.id === applicationId);
  if (!current) throw new Error("OPPORTUNITY_APPLICATION_NOT_FOUND");

  const statusChanged = patch.status && patch.status !== current.status;
  const candidate = {
    ...current,
    ...patch,
    id: current.id,
    opportunityId: current.opportunityId,
    createdAt: current.createdAt,
    statusUpdatedAt: statusChanged ? new Date().toISOString() : current.statusUpdatedAt,
    updatedAt: new Date().toISOString()
  };
  throwValidationError(candidate);
  const updated = normalizeOpportunityApplication(candidate);
  const optimistic = writeLocalApplications(userId, currentApplications.map((item) => item.id === applicationId ? updated : item));
  onLocalUpdate?.(optimistic);

  if (!supabase || !userId) {
    rollback(userId, currentApplications, onLocalUpdate);
    throw new Error("SUPABASE_UNAVAILABLE");
  }

  const { data, error } = await supabase
    .from("opportunity_applications")
    .update({
      submitted_at: updated.submittedAt,
      status: updated.status,
      status_updated_at: updated.statusUpdatedAt,
      notes: updated.notes || null
    })
    .eq("id", applicationId)
    .eq("user_id", userId)
    .select(APPLICATION_SELECT)
    .single();

  if (error) {
    rollback(userId, currentApplications, onLocalUpdate);
    throw error;
  }

  const saved = fromRow(data);
  const synced = writeLocalApplications(userId, optimistic.map((item) => item.id === applicationId ? saved : item));
  onLocalUpdate?.(synced);
  return saved;
}
