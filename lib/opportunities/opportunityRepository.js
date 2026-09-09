"use client";

import { supabase } from "@/lib/supabase/client";
import {
  createOpportunityRecord,
  normalizeOpportunity,
  sortOpportunitiesByDeadline,
  validateOpportunity
} from "./opportunityModel";

export const OPPORTUNITY_STORAGE_KEY = "ariadne_opportunities_v1";
export const OPPORTUNITY_PENDING_STORAGE_KEY = "ariadne_opportunity_pending_v1";
export const OPPORTUNITY_SYNC_PENDING = "OPPORTUNITY_SYNC_PENDING";
export const OPPORTUNITY_SYNC_CONFLICT = "OPPORTUNITY_SYNC_CONFLICT";

const OPPORTUNITY_SELECT = [
  "id",
  "user_id",
  "title",
  "type",
  "organization",
  "url",
  "description",
  "requirements",
  "standardized_requirements",
  "misc_requirements",
  "deadline",
  "start_date",
  "archived",
  "created_at",
  "updated_at"
].join(",");

function readJson(storageKey, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Local persistence failures should not turn a cloud-sync attempt into data loss.
  }
}

function normalizeCollection(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizeOpportunity(item))
    .filter((item) => Boolean(item.id));
}

function readLocalOpportunities(userId = "") {
  const stored = readJson(OPPORTUNITY_STORAGE_KEY, null);
  if (Array.isArray(stored)) return normalizeCollection(stored);
  if (!stored || typeof stored !== "object") return [];

  const storedUserId = String(stored.userId || "").trim();
  const requestedUserId = String(userId || "").trim();
  if (storedUserId && requestedUserId && storedUserId !== requestedUserId) return [];
  return normalizeCollection(stored.opportunities);
}

function writeLocalOpportunities(userId, opportunities) {
  const normalized = normalizeCollection(opportunities);
  writeJson(OPPORTUNITY_STORAGE_KEY, {
    version: 2,
    userId: String(userId || "").trim(),
    opportunities: normalized
  });
  return normalized;
}

function readPendingOperations(userId = "") {
  const stored = readJson(OPPORTUNITY_PENDING_STORAGE_KEY, null);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return [];

  const storedUserId = String(stored.userId || "").trim();
  const requestedUserId = String(userId || "").trim();
  if (storedUserId && requestedUserId && storedUserId !== requestedUserId) return [];

  return (Array.isArray(stored.operations) ? stored.operations : [])
    .filter((operation) => operation && operation.id && operation.entityId && operation.kind)
    .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0));
}

function writePendingOperations(userId, operations) {
  writeJson(OPPORTUNITY_PENDING_STORAGE_KEY, {
    version: 2,
    userId: String(userId || "").trim(),
    operations: Array.isArray(operations) ? operations : []
  });
}

function makeOperationId() {
  const value = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `opportunity-op-${value}`;
}

function getErrorText(error) {
  return [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);
}

function makeRepositoryError(code, cause, details = null) {
  const error = new Error(code);
  error.cause = cause;
  if (details) error.details = details;
  return error;
}

function makeConflictError(entityId, cause = null) {
  return makeRepositoryError(OPPORTUNITY_SYNC_CONFLICT, cause, { entityId });
}

function fromRow(row) {
  return normalizeOpportunity({
    id: row?.id,
    title: row?.title,
    type: row?.type,
    organization: row?.organization,
    url: row?.url,
    description: row?.description,
    requirements: row?.requirements,
    standardized_requirements: row?.standardized_requirements,
    misc_requirements: row?.misc_requirements,
    deadline: row?.deadline,
    start_date: row?.start_date,
    archived: row?.archived,
    created_at: row?.created_at,
    updated_at: row?.updated_at
  });
}

function requirementPayload(opportunity) {
  const miscRequirements = opportunity.miscRequirements ?? opportunity.requirements ?? "";
  return {
    requirements: miscRequirements || null,
    standardized_requirements: opportunity.standardizedRequirements || [],
    misc_requirements: miscRequirements || null
  };
}

function toCreateRow(opportunity, userId) {
  return {
    id: opportunity.id,
    user_id: userId,
    title: opportunity.title,
    type: opportunity.type,
    organization: opportunity.organization || null,
    url: opportunity.url || null,
    description: opportunity.description || null,
    ...requirementPayload(opportunity),
    deadline: opportunity.deadline || null,
    start_date: opportunity.startDate || null,
    archived: Boolean(opportunity.archived),
    created_at: opportunity.createdAt
  };
}

function toUpdateRow(opportunity) {
  return {
    title: opportunity.title,
    type: opportunity.type,
    organization: opportunity.organization || null,
    url: opportunity.url || null,
    description: opportunity.description || null,
    ...requirementPayload(opportunity),
    deadline: opportunity.deadline || null,
    start_date: opportunity.startDate || null,
    archived: Boolean(opportunity.archived)
  };
}

function replaceLocalOpportunity(userId, opportunity) {
  const local = readLocalOpportunities(userId);
  const exists = local.some((item) => item.id === opportunity.id);
  const next = exists
    ? local.map((item) => item.id === opportunity.id ? opportunity : item)
    : [...local, opportunity];
  return writeLocalOpportunities(userId, next);
}

function removeLocalOpportunity(userId, opportunityId) {
  const next = readLocalOpportunities(userId).filter((item) => item.id !== opportunityId);
  return writeLocalOpportunities(userId, next);
}

function notifyLocalUpdate(onLocalUpdate, opportunities) {
  onLocalUpdate?.(opportunities);
}

function enqueueSaveOperation(userId, record, { isCreate, baseUpdatedAt = "" }) {
  const operations = readPendingOperations(userId);
  const lastIndex = operations.findLastIndex((operation) => operation.entityId === record.id);
  const previous = lastIndex >= 0 ? operations[lastIndex] : null;

  if (previous?.kind === "save") {
    const replacement = {
      ...previous,
      payload: {
        record,
        isCreate: Boolean(previous.payload?.isCreate || isCreate),
        baseUpdatedAt: previous.payload?.baseUpdatedAt || baseUpdatedAt || ""
      },
      status: "pending",
      lastError: ""
    };
    const next = [...operations];
    next[lastIndex] = replacement;
    writePendingOperations(userId, next);
    return replacement;
  }

  const operation = {
    id: makeOperationId(),
    kind: "save",
    entityId: record.id,
    payload: { record, isCreate: Boolean(isCreate), baseUpdatedAt: baseUpdatedAt || "" },
    status: "pending",
    attempts: 0,
    lastError: "",
    createdAt: Date.now()
  };
  writePendingOperations(userId, [...operations, operation]);
  return operation;
}

function enqueueDeleteOperation(userId, record) {
  const operation = {
    id: makeOperationId(),
    kind: "delete",
    entityId: record.id,
    payload: { baseUpdatedAt: record.updatedAt || "" },
    status: "pending",
    attempts: 0,
    lastError: "",
    createdAt: Date.now()
  };
  const operations = readPendingOperations(userId);
  writePendingOperations(userId, [...operations, operation]);
  return operation;
}

function removePendingOperation(userId, operationId) {
  writePendingOperations(
    userId,
    readPendingOperations(userId).filter((operation) => operation.id !== operationId)
  );
}

function markPendingOperationFailed(userId, operation, error) {
  const operations = readPendingOperations(userId);
  const next = operations.map((candidate) => candidate.id === operation.id
    ? {
        ...candidate,
        status: error?.message === OPPORTUNITY_SYNC_CONFLICT ? "conflict" : "pending",
        attempts: Number(candidate.attempts || 0) + 1,
        lastError: getErrorText(error)
      }
    : candidate);
  writePendingOperations(userId, next);
}

async function executeSaveOperation(userId, operation) {
  const record = normalizeOpportunity(operation.payload?.record);
  if (!record.id) throw new Error("INVALID_OPPORTUNITY_OPERATION");

  if (operation.payload?.isCreate) {
    const { data, error } = await supabase
      .from("opportunities")
      .insert(toCreateRow(record, userId))
      .select(OPPORTUNITY_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw makeConflictError(record.id);
    return fromRow(data);
  }

  let query = supabase
    .from("opportunities")
    .update(toUpdateRow(record))
    .eq("id", record.id)
    .eq("user_id", userId);

  const baseUpdatedAt = String(operation.payload?.baseUpdatedAt || "").trim();
  if (baseUpdatedAt) query = query.eq("updated_at", baseUpdatedAt);

  const { data, error } = await query.select(OPPORTUNITY_SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw makeConflictError(record.id);
  return fromRow(data);
}

async function executeDeleteOperation(userId, operation) {
  let query = supabase
    .from("opportunities")
    .delete()
    .eq("id", operation.entityId)
    .eq("user_id", userId);

  const baseUpdatedAt = String(operation.payload?.baseUpdatedAt || "").trim();
  if (baseUpdatedAt) query = query.eq("updated_at", baseUpdatedAt);

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw makeConflictError(operation.entityId);
  return data;
}

export function getOpportunitySyncState(userId) {
  const operations = readPendingOperations(userId);
  return {
    pendingCount: operations.filter((operation) => operation.status !== "conflict").length,
    conflictCount: operations.filter((operation) => operation.status === "conflict").length,
    operations
  };
}

export async function flushOpportunityOperations(userId) {
  if (!supabase || !userId) return { ok: true, deferred: true, results: [] };

  const results = [];
  for (const operation of readPendingOperations(userId)) {
    if (operation.status === "conflict") {
      return { ok: false, conflict: true, operation, error: makeConflictError(operation.entityId), results };
    }

    try {
      if (operation.kind === "save") {
        const saved = await executeSaveOperation(userId, operation);
        replaceLocalOpportunity(userId, saved);
        results.push({ operationId: operation.id, result: saved });
      } else if (operation.kind === "delete") {
        const deleted = await executeDeleteOperation(userId, operation);
        removeLocalOpportunity(userId, operation.entityId);
        results.push({ operationId: operation.id, result: deleted });
      } else {
        throw new Error(`UNSUPPORTED_OPPORTUNITY_OPERATION:${operation.kind}`);
      }
      removePendingOperation(userId, operation.id);
    } catch (error) {
      const wrapped = error?.message === OPPORTUNITY_SYNC_CONFLICT
        ? error
        : makeRepositoryError(OPPORTUNITY_SYNC_PENDING, error);
      markPendingOperationFailed(userId, operation, wrapped);
      return {
        ok: false,
        conflict: wrapped.message === OPPORTUNITY_SYNC_CONFLICT,
        operation,
        error: wrapped,
        results
      };
    }
  }

  return { ok: true, deferred: false, conflict: false, results };
}

function timestampValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeRemoteWithLocal(local, remote) {
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const merged = remote.map((remoteItem) => {
    const localItem = local.find((item) => item.id === remoteItem.id);
    if (!localItem) return remoteItem;
    return timestampValue(localItem.updatedAt) > timestampValue(remoteItem.updatedAt)
      ? localItem
      : remoteItem;
  });

  for (const localItem of local) {
    if (!remoteById.has(localItem.id)) merged.push(localItem);
  }

  return sortOpportunitiesByDeadline(merged);
}

export async function loadOpportunities(userId) {
  const local = readLocalOpportunities(userId);
  if (!supabase || !userId) return sortOpportunitiesByDeadline(local);

  const syncResult = await flushOpportunityOperations(userId);
  if (!syncResult.ok) return sortOpportunitiesByDeadline(readLocalOpportunities(userId));

  const localAfterFlush = readLocalOpportunities(userId);
  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .eq("user_id", userId);

  if (error) return sortOpportunitiesByDeadline(localAfterFlush);

  const remote = normalizeCollection((data || []).map(fromRow));
  if (remote.length === 0 && localAfterFlush.length > 0) {
    return sortOpportunitiesByDeadline(localAfterFlush);
  }

  const merged = mergeRemoteWithLocal(localAfterFlush, remote);
  writeLocalOpportunities(userId, merged);
  return merged;
}

function throwValidationError(input) {
  const errors = validateOpportunity(input);
  if (Object.keys(errors).length === 0) return;
  const error = new Error("INVALID_OPPORTUNITY");
  error.validationErrors = errors;
  throw error;
}

function throwSyncFailure(syncResult) {
  if (syncResult.ok) return;
  throw syncResult.error || new Error(OPPORTUNITY_SYNC_PENDING);
}

export async function createOpportunity({ opportunity, userId, onLocalUpdate }) {
  throwValidationError(opportunity);
  const record = createOpportunityRecord(opportunity);
  const next = writeLocalOpportunities(userId, [...readLocalOpportunities(userId), record]);
  notifyLocalUpdate(onLocalUpdate, next);
  enqueueSaveOperation(userId, record, { isCreate: true });

  const syncResult = await flushOpportunityOperations(userId);
  throwSyncFailure(syncResult);
  const synced = readLocalOpportunities(userId);
  notifyLocalUpdate(onLocalUpdate, synced);
  return synced;
}

export async function updateOpportunity({ opportunityId, patch, userId, onLocalUpdate }) {
  const current = readLocalOpportunities(userId).find((item) => item.id === opportunityId);
  if (!current) throw new Error("OPPORTUNITY_NOT_FOUND");

  const candidate = {
    ...current,
    standardizedRequirements: current.standardizedRequirements || [],
    miscRequirements: current.miscRequirements ?? current.requirements ?? "",
    ...patch,
    id: current.id,
    createdAt: current.createdAt
  };
  throwValidationError(candidate);
  const updated = {
    ...normalizeOpportunity(candidate),
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  const local = readLocalOpportunities(userId);
  const next = writeLocalOpportunities(
    userId,
    local.map((item) => item.id === opportunityId ? updated : item)
  );
  notifyLocalUpdate(onLocalUpdate, next);
  enqueueSaveOperation(userId, updated, {
    isCreate: false,
    baseUpdatedAt: current.updatedAt
  });

  const syncResult = await flushOpportunityOperations(userId);
  throwSyncFailure(syncResult);
  const synced = readLocalOpportunities(userId);
  notifyLocalUpdate(onLocalUpdate, synced);
  return synced;
}

export async function setOpportunityArchived({ opportunityId, archived, userId, onLocalUpdate }) {
  return updateOpportunity({
    opportunityId,
    patch: { archived: Boolean(archived) },
    userId,
    onLocalUpdate
  });
}

export async function deleteOpportunity({ opportunityId, userId, onLocalUpdate }) {
  const local = readLocalOpportunities(userId);
  const current = local.find((item) => item.id === opportunityId);
  if (!current) return local;

  const next = writeLocalOpportunities(userId, local.filter((item) => item.id !== opportunityId));
  notifyLocalUpdate(onLocalUpdate, next);
  enqueueDeleteOperation(userId, current);

  const syncResult = await flushOpportunityOperations(userId);
  throwSyncFailure(syncResult);
  const synced = readLocalOpportunities(userId);
  notifyLocalUpdate(onLocalUpdate, synced);
  return synced;
}
