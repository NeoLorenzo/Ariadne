const PENDING_STORAGE_KEY = "ariadne_strategy_pending_v1";
const BASE_STORAGE_KEY = "ariadne_strategy_sync_bases_v1";

export const STRATEGY_SYNC_CONFLICT = "STRATEGY_SYNC_CONFLICT";
export const STRATEGY_SYNC_PENDING = "STRATEGY_SYNC_PENDING";

function makeId() {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `strategy-op-${value}`;
}

function readJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  try {
    window.dispatchEvent(new CustomEvent("ariadne:strategy-sync-changed"));
  } catch {
    // Storage must remain usable in tests/non-browser shims without CustomEvent.
  }
}

function readOperations() {
  const operations = readJson(PENDING_STORAGE_KEY, []);
  return Array.isArray(operations) ? operations : [];
}

function writeOperations(operations) {
  writeJson(PENDING_STORAGE_KEY, Array.isArray(operations) ? operations : []);
}

function normalizeScopeIds(scopeIds) {
  return [...new Set((Array.isArray(scopeIds) ? scopeIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function matchesFilter(operation, { domain, scopeId, entityId } = {}) {
  if (domain && operation.domain !== domain) return false;
  if (entityId && operation.entityId !== entityId) return false;
  if (scopeId) {
    const scopes = normalizeScopeIds(operation.scopeIds);
    if (!scopes.includes(scopeId)) return false;
  }
  return true;
}

export function enqueueStrategyOperation({ domain, kind, entityId, scopeIds = [], payload = {} }) {
  const operation = {
    id: makeId(),
    domain: String(domain || ""),
    kind: String(kind || ""),
    entityId: String(entityId || ""),
    scopeIds: normalizeScopeIds(scopeIds),
    payload,
    status: "pending",
    attempts: 0,
    lastError: "",
    conflictEntityId: "",
    remoteUpdatedAt: "",
    createdAt: Date.now()
  };
  if (!operation.domain || !operation.kind || !operation.entityId) {
    throw new Error("INVALID_STRATEGY_OPERATION");
  }
  writeOperations([...readOperations(), operation]);
  return operation;
}

export function listStrategyOperations(filter = {}) {
  return readOperations()
    .filter((operation) => matchesFilter(operation, filter))
    .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0));
}

export function hasPendingStrategyOperations(filter = {}) {
  return listStrategyOperations(filter).length > 0;
}

export function getStrategySyncState(filter = {}) {
  const operations = listStrategyOperations(filter);
  return {
    pendingCount: operations.filter((operation) => operation.status !== "conflict").length,
    conflictCount: operations.filter((operation) => operation.status === "conflict").length,
    operations
  };
}

export function removeStrategyOperation(operationId) {
  const next = readOperations().filter((operation) => operation.id !== operationId);
  writeOperations(next);
}

function updateStrategyOperation(operationId, patch) {
  const operations = readOperations();
  const next = operations.map((operation) => operation.id === operationId ? { ...operation, ...patch } : operation);
  writeOperations(next);
  return next.find((operation) => operation.id === operationId) || null;
}

function getErrorText(error) {
  return [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ");
}

export function isStrategyConflictError(error) {
  return getErrorText(error).includes(STRATEGY_SYNC_CONFLICT);
}

function parseConflictDetails(error) {
  const details = String(error?.details || "").trim();
  if (!details) return {};
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function toStrategySyncError(error) {
  if (error?.message === STRATEGY_SYNC_CONFLICT || error?.message === STRATEGY_SYNC_PENDING) {
    return error;
  }
  const wrapped = new Error(isStrategyConflictError(error) ? STRATEGY_SYNC_CONFLICT : STRATEGY_SYNC_PENDING);
  wrapped.cause = error;
  wrapped.details = error?.details || "";
  return wrapped;
}

export function getStrategyBaseUpdatedAt(domain, entityId, fallback = "") {
  const bases = readJson(BASE_STORAGE_KEY, {});
  const key = `${domain}:${entityId}`;
  return String(bases?.[key] || fallback || "");
}

export function setStrategyBaseUpdatedAt(domain, entityId, updatedAt) {
  if (!domain || !entityId || !updatedAt) return;
  const bases = readJson(BASE_STORAGE_KEY, {});
  writeJson(BASE_STORAGE_KEY, { ...bases, [`${domain}:${entityId}`]: String(updatedAt) });
}

export function clearStrategyBaseUpdatedAt(domain, entityId) {
  const bases = { ...readJson(BASE_STORAGE_KEY, {}) };
  delete bases[`${domain}:${entityId}`];
  writeJson(BASE_STORAGE_KEY, bases);
}

export function setStrategyBaseUpdatedAtBatch(domain, rows) {
  for (const row of Array.isArray(rows) ? rows : []) {
    const entityId = row?.id;
    const updatedAt = row?.updated_at || row?.updatedAt;
    if (entityId && updatedAt) setStrategyBaseUpdatedAt(domain, entityId, updatedAt);
  }
}

export async function flushStrategyOperations({ domain, scopeId, entityId, execute }) {
  const operations = listStrategyOperations({ domain, scopeId, entityId });
  const results = [];

  for (const operation of operations) {
    if (operation.status === "conflict") {
      return { ok: false, conflict: true, operation, error: new Error(STRATEGY_SYNC_CONFLICT), results };
    }

    try {
      const result = await execute(operation);
      removeStrategyOperation(operation.id);
      results.push({ operationId: operation.id, result });
    } catch (error) {
      const conflict = isStrategyConflictError(error);
      const details = conflict ? parseConflictDetails(error) : {};
      const updated = updateStrategyOperation(operation.id, {
        status: conflict ? "conflict" : "pending",
        attempts: Number(operation.attempts || 0) + 1,
        lastError: getErrorText(error).slice(0, 1000),
        conflictEntityId: String(details.entity_id || ""),
        remoteUpdatedAt: String(details.updated_at || "")
      });
      return { ok: false, conflict, operation: updated || operation, error, results };
    }
  }

  return { ok: true, conflict: false, operation: null, error: null, results };
}

export function supersedeStrategyConflicts({ domain, entityId, scopeId } = {}) {
  const conflicts = listStrategyOperations({ domain, entityId, scopeId })
    .filter((operation) => operation.status === "conflict");
  if (!conflicts.length) return 0;

  for (const operation of conflicts) {
    if (operation.conflictEntityId && operation.remoteUpdatedAt) {
      setStrategyBaseUpdatedAt(domain, operation.conflictEntityId, operation.remoteUpdatedAt);
    } else if (operation.entityId && operation.remoteUpdatedAt) {
      setStrategyBaseUpdatedAt(domain, operation.entityId, operation.remoteUpdatedAt);
    }
    updateStrategyOperation(operation.id, {
      status: "pending",
      lastError: "",
      conflictEntityId: "",
      remoteUpdatedAt: ""
    });
  }
  return conflicts.length;
}
