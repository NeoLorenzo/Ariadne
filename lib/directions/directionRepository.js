import { supabase } from "@/lib/supabase/client";
import {
  enqueueStrategyOperation,
  flushStrategyOperations,
  getStrategyBaseUpdatedAt,
  setStrategyBaseUpdatedAt,
  setStrategyBaseUpdatedAtBatch,
  supersedeStrategyConflicts,
  toStrategySyncError
} from "@/lib/strategy/pendingOperations";
import { normalizeVectorIds } from "@/lib/vectors/vectorVocabulary";

const STORAGE_KEY = "ariadne_directions_v2";
const LEGACY_STORAGE_KEY = "fabbro_direction_v1";
const STRATEGY_DOMAIN = "direction";
const ROOT_SCOPE = "root";
export const DIRECTION_STATUSES = ["active", "paused", "archived"];
const EMPTY_STATE = () => ({ directions: [], revisionsByDirectionId: {} });

function makeId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function normalizeDirection(direction, fallbackPosition = 0) {
  if (!direction?.id || !String(direction.title || "").trim() || !String(direction.statement || "").trim()) {
    return null;
  }
  const status = DIRECTION_STATUSES.includes(direction.status)
    ? direction.status
    : direction.isActive === false ? "paused" : "active";
  const position = Number.isInteger(Number(direction.position)) && Number(direction.position) >= 0
    ? Number(direction.position)
    : fallbackPosition;
  return {
    ...direction,
    title: String(direction.title).trim(),
    statement: String(direction.statement).trim(),
    status,
    position,
    isActive: status === "active",
    vectorIds: normalizeVectorIds(direction.vectorIds)
  };
}

function normalizeRevision(revision) {
  if (!revision?.id || !revision?.directionId) return null;
  return {
    ...revision,
    vectorIds: revision.vectorIds === null || revision.vectorIds === undefined
      ? null
      : normalizeVectorIds(revision.vectorIds)
  };
}

function normalizeState(value) {
  const directions = (Array.isArray(value?.directions) ? value.directions : [])
    .map((direction, index) => normalizeDirection(direction, index))
    .filter(Boolean)
    .sort(compareDirections);
  const revisionsByDirectionId = {};
  for (const direction of directions) {
    revisionsByDirectionId[direction.id] = (Array.isArray(value?.revisionsByDirectionId?.[direction.id])
      ? value.revisionsByDirectionId[direction.id]
      : []).map(normalizeRevision).filter(Boolean);
  }
  return { directions, revisionsByDirectionId };
}

function migrateLegacyState(rawValue) {
  if (!rawValue?.direction) return EMPTY_STATE();
  const direction = normalizeDirection({
    ...rawValue.direction,
    status: rawValue.direction.isActive === false ? "paused" : "active",
    position: 0,
    vectorIds: []
  });
  if (!direction) return EMPTY_STATE();
  const revisions = (Array.isArray(rawValue.revisions) ? rawValue.revisions : [])
    .map((revision) => normalizeRevision({ ...revision, directionId: revision.directionId || direction.id, vectorIds: null }))
    .filter(Boolean);
  return {
    directions: [direction],
    revisionsByDirectionId: { [direction.id]: revisions }
  };
}

function readLocalState() {
  if (typeof window === "undefined") return EMPTY_STATE();
  try {
    const currentRaw = window.localStorage.getItem(STORAGE_KEY);
    if (currentRaw !== null) return normalizeState(JSON.parse(currentRaw));
  } catch {
    // Fall through to the legacy snapshot rather than breaking dashboard startup.
  }

  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw === null) return EMPTY_STATE();
    const migrated = migrateLegacyState(JSON.parse(legacyRaw));
    writeLocalState(migrated);
    return migrated;
  } catch {
    return EMPTY_STATE();
  }
}

function writeLocalState(state) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  }
}

function fromDirectionRow(row, vectorIds = []) {
  return normalizeDirection({
    id: row.id,
    title: row.title,
    statement: row.statement,
    status: row.status || (row.is_active === false ? "paused" : "active"),
    position: row.position,
    isActive: (row.status || (row.is_active === false ? "paused" : "active")) === "active",
    vectorIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function fromRevisionRow(row) {
  return normalizeRevision({
    id: row.id,
    directionId: row.direction_id,
    title: row.title,
    statement: row.statement,
    vectorIds: row.vector_ids ?? null,
    changeReason: row.change_reason || "",
    createdAt: row.created_at
  });
}

async function executeDirectionOperation(operation) {
  if (operation.kind === "create") {
    const { data, error } = await supabase.rpc("create_direction_semantic", {
      direction_record: operation.payload.row
    });
    if (error) throw error;
    if (data?.updated_at) setStrategyBaseUpdatedAt(STRATEGY_DOMAIN, operation.entityId, data.updated_at);
    return data;
  }

  if (operation.kind === "update") {
    const expectedUpdatedAt = getStrategyBaseUpdatedAt(
      STRATEGY_DOMAIN,
      operation.entityId,
      operation.payload.baseUpdatedAt
    );
    const { data, error } = await supabase.rpc("update_direction_semantic", {
      direction_id: operation.entityId,
      patch: operation.payload.patch,
      change_reason: operation.payload.changeReason || null,
      revision_id: operation.payload.revisionId || null,
      expected_updated_at: expectedUpdatedAt || null
    });
    if (error) throw error;
    if (data?.updated_at) setStrategyBaseUpdatedAt(STRATEGY_DOMAIN, operation.entityId, data.updated_at);
    return data;
  }

  if (operation.kind === "reorder") {
    const positions = Object.fromEntries(operation.payload.items.map((item) => [item.id, item.position]));
    const expectedById = Object.fromEntries(operation.payload.items.map((item) => [
      item.id,
      getStrategyBaseUpdatedAt(STRATEGY_DOMAIN, item.id, item.baseUpdatedAt)
    ]).filter(([, value]) => Boolean(value)));
    const { data, error } = await supabase.rpc("reorder_directions_semantic", {
      positions,
      expected_updated_at_by_id: expectedById
    });
    if (error) throw error;
    setStrategyBaseUpdatedAtBatch(STRATEGY_DOMAIN, data);
    return data;
  }

  if (operation.kind === "delete-revision") {
    const { data, error } = await supabase.rpc("delete_direction_revision_semantic", {
      direction_id: operation.entityId,
      revision_id: operation.payload.revisionId
    });
    if (error) throw error;
    return data;
  }

  throw new Error(`UNSUPPORTED_DIRECTION_OPERATION:${operation.kind}`);
}

async function flushDirectionOperations(userId) {
  if (!supabase || !userId) return { ok: true, deferred: true };
  return flushStrategyOperations({
    domain: STRATEGY_DOMAIN,
    scopeId: ROOT_SCOPE,
    execute: executeDirectionOperation
  });
}

export async function loadDirectionsState(userId) {
  const localState = readLocalState();
  if (!supabase || !userId) return localState;

  const syncResult = await flushDirectionOperations(userId);
  if (!syncResult.ok) return localState;

  const { data: directionRows, error } = await supabase
    .from("directions")
    .select("id,title,statement,status,position,is_active,created_at,updated_at")
    .eq("user_id", userId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return localState;

  const rows = directionRows || [];
  if (!rows.length) {
    // An empty cloud must not silently erase a valid migrated/local snapshot. Ariadne has no
    // direction-delete operation, so local state is the safer source until it can be reconciled.
    if (localState.directions.length) return localState;
    const empty = EMPTY_STATE();
    writeLocalState(empty);
    return empty;
  }

  const [{ data: linkRows, error: linkError }, { data: revisionRows, error: revisionError }] = await Promise.all([
    supabase.from("direction_vector_links").select("direction_id,vector_id"),
    supabase
      .from("direction_revisions")
      .select("id,direction_id,title,statement,vector_ids,change_reason,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
  ]);
  if (linkError) return localState;

  const vectorIdsByDirectionId = {};
  for (const link of linkRows || []) {
    if (!vectorIdsByDirectionId[link.direction_id]) vectorIdsByDirectionId[link.direction_id] = [];
    vectorIdsByDirectionId[link.direction_id].push(link.vector_id);
  }

  const revisionsByDirectionId = {};
  for (const row of revisionError ? [] : (revisionRows || [])) {
    const revision = fromRevisionRow(row);
    if (!revision) continue;
    if (!revisionsByDirectionId[revision.directionId]) revisionsByDirectionId[revision.directionId] = [];
    revisionsByDirectionId[revision.directionId].push(revision);
  }

  const directions = rows.map((row, index) => {
    setStrategyBaseUpdatedAt(STRATEGY_DOMAIN, row.id, row.updated_at);
    return fromDirectionRow(row, vectorIdsByDirectionId[row.id] || [], index);
  }).filter(Boolean).sort(compareDirections);

  for (const direction of directions) {
    if (revisionError) {
      revisionsByDirectionId[direction.id] = localState.revisionsByDirectionId?.[direction.id] || [];
    } else if (!revisionsByDirectionId[direction.id]) {
      revisionsByDirectionId[direction.id] = [];
    }
  }

  const state = { directions, revisionsByDirectionId };
  writeLocalState(state);
  return state;
}

// Transitional adapter for any still-unmigrated consumer. New code should use loadDirectionsState.
export async function loadDirectionState(userId) {
  const state = await loadDirectionsState(userId);
  const direction = state.directions.find((item) => item.status === "active") || state.directions[0] || null;
  return {
    direction,
    revisions: direction ? (state.revisionsByDirectionId[direction.id] || []) : []
  };
}

export async function createDirection({ state = EMPTY_STATE(), title, statement, vectorIds, userId, onLocalUpdate }) {
  const trimmedTitle = String(title || "").trim();
  const trimmedStatement = String(statement || "").trim();
  const normalizedVectors = normalizeVectorIds(vectorIds);
  if (!trimmedTitle || !trimmedStatement) throw new Error("DIRECTION_TITLE_AND_STATEMENT_REQUIRED");
  if (!normalizedVectors.length) throw new Error("DIRECTION_VECTOR_REQUIRED");

  const current = normalizeState(state);
  const createdAt = new Date().toISOString();
  const nextPosition = Math.max(-1, ...current.directions.map((item) => Number(item.position || 0))) + 1;
  const direction = {
    id: makeId("direction"),
    title: trimmedTitle,
    statement: trimmedStatement,
    status: "active",
    position: nextPosition,
    isActive: true,
    vectorIds: normalizedVectors,
    createdAt,
    updatedAt: createdAt
  };
  const nextState = {
    directions: [...current.directions, direction].sort(compareDirections),
    revisionsByDirectionId: { ...current.revisionsByDirectionId, [direction.id]: [] }
  };

  writeLocalState(nextState);
  onLocalUpdate?.(nextState);
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "create",
    entityId: direction.id,
    scopeIds: [ROOT_SCOPE, direction.id],
    payload: {
      row: {
        id: direction.id,
        user_id: userId || null,
        title: direction.title,
        statement: direction.statement,
        status: direction.status,
        position: direction.position,
        is_active: true,
        vector_ids: direction.vectorIds,
        created_at: createdAt
      }
    }
  });

  const syncResult = await flushDirectionOperations(userId);
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return nextState;
}

export async function updateDirection({
  state,
  directionId,
  title,
  statement,
  vectorIds,
  changeReason,
  userId,
  onLocalUpdate
}) {
  const current = normalizeState(state);
  const direction = current.directions.find((item) => item.id === directionId);
  if (!direction) throw new Error("DIRECTION_NOT_FOUND");

  const trimmedTitle = String(title || "").trim();
  const trimmedStatement = String(statement || "").trim();
  const normalizedVectors = normalizeVectorIds(vectorIds);
  if (!trimmedTitle || !trimmedStatement) throw new Error("DIRECTION_TITLE_AND_STATEMENT_REQUIRED");
  if (!normalizedVectors.length) throw new Error("DIRECTION_VECTOR_REQUIRED");

  const vectorsChanged = JSON.stringify(direction.vectorIds) !== JSON.stringify(normalizedVectors);
  const meaningfulChange = direction.title !== trimmedTitle
    || direction.statement !== trimmedStatement
    || vectorsChanged;
  if (!meaningfulChange) return current;

  const resolvedReason = String(changeReason || "").trim()
    || (!direction.vectorIds.length ? "Classified legacy direction vectors" : "");
  if (!resolvedReason) throw new Error("REVISION_REASON_REQUIRED");

  supersedeStrategyConflicts({ domain: STRATEGY_DOMAIN, entityId: direction.id });
  const changedAt = new Date().toISOString();
  const revision = {
    id: makeId("direction-revision"),
    directionId: direction.id,
    title: direction.title,
    statement: direction.statement,
    vectorIds: [...direction.vectorIds],
    changeReason: resolvedReason,
    createdAt: changedAt
  };
  const nextDirection = {
    ...direction,
    title: trimmedTitle,
    statement: trimmedStatement,
    vectorIds: normalizedVectors,
    updatedAt: changedAt
  };
  const nextState = {
    directions: current.directions.map((item) => item.id === direction.id ? nextDirection : item).sort(compareDirections),
    revisionsByDirectionId: {
      ...current.revisionsByDirectionId,
      [direction.id]: [revision, ...(current.revisionsByDirectionId[direction.id] || [])]
    }
  };

  writeLocalState(nextState);
  onLocalUpdate?.(nextState);
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "update",
    entityId: direction.id,
    scopeIds: [ROOT_SCOPE, direction.id],
    payload: {
      baseUpdatedAt: direction.updatedAt || "",
      patch: {
        title: nextDirection.title,
        statement: nextDirection.statement,
        vector_ids: nextDirection.vectorIds
      },
      changeReason: revision.changeReason,
      revisionId: revision.id
    }
  });

  const syncResult = await flushDirectionOperations(userId);
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return nextState;
}

export async function setDirectionStatus({ state, directionId, status, userId, onLocalUpdate }) {
  if (!DIRECTION_STATUSES.includes(status)) throw new Error("INVALID_DIRECTION_STATUS");
  const current = normalizeState(state);
  const direction = current.directions.find((item) => item.id === directionId);
  if (!direction) throw new Error("DIRECTION_NOT_FOUND");
  if (direction.status === status) return current;

  supersedeStrategyConflicts({ domain: STRATEGY_DOMAIN, entityId: direction.id });
  const changedAt = new Date().toISOString();
  const nextDirection = { ...direction, status, isActive: status === "active", updatedAt: changedAt };
  const nextState = {
    ...current,
    directions: current.directions.map((item) => item.id === direction.id ? nextDirection : item).sort(compareDirections)
  };
  writeLocalState(nextState);
  onLocalUpdate?.(nextState);

  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "update",
    entityId: direction.id,
    scopeIds: [ROOT_SCOPE, direction.id],
    payload: {
      baseUpdatedAt: direction.updatedAt || "",
      patch: { status },
      changeReason: null,
      revisionId: null
    }
  });

  const syncResult = await flushDirectionOperations(userId);
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return nextState;
}

export async function reorderDirections({ state, directionId, offset, userId, onLocalUpdate }) {
  const current = normalizeState(state);
  const active = current.directions.filter((item) => item.status === "active").sort(compareDirections);
  const index = active.findIndex((item) => item.id === directionId);
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= active.length) return current;

  const currentItem = active[index];
  const targetItem = active[targetIndex];
  const changedAt = new Date().toISOString();
  const nextDirections = current.directions.map((item) => {
    if (item.id === currentItem.id) return { ...item, position: targetItem.position, updatedAt: changedAt };
    if (item.id === targetItem.id) return { ...item, position: currentItem.position, updatedAt: changedAt };
    return item;
  }).sort(compareDirections);
  const nextState = { ...current, directions: nextDirections };
  writeLocalState(nextState);
  onLocalUpdate?.(nextState);

  const reorderEntityId = "reorder:directions";
  supersedeStrategyConflicts({ domain: STRATEGY_DOMAIN, entityId: reorderEntityId });
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "reorder",
    entityId: reorderEntityId,
    scopeIds: [ROOT_SCOPE],
    payload: {
      items: [currentItem, targetItem].map((item) => ({
        id: item.id,
        position: item.id === currentItem.id ? targetItem.position : currentItem.position,
        baseUpdatedAt: item.updatedAt || ""
      }))
    }
  });

  const syncResult = await flushDirectionOperations(userId);
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return nextState;
}

export async function deleteDirectionRevision({
  state,
  directionId,
  revisionId,
  userId,
  onLocalUpdate
}) {
  const current = normalizeState(state);
  const direction = current.directions.find((item) => item.id === directionId);
  if (!direction) throw new Error("DIRECTION_NOT_FOUND");
  const nextState = {
    ...current,
    revisionsByDirectionId: {
      ...current.revisionsByDirectionId,
      [directionId]: (current.revisionsByDirectionId[directionId] || [])
        .filter((revision) => revision.id !== revisionId)
    }
  };

  writeLocalState(nextState);
  onLocalUpdate?.(nextState);
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "delete-revision",
    entityId: direction.id,
    scopeIds: [ROOT_SCOPE, direction.id],
    payload: { revisionId }
  });

  const syncResult = await flushDirectionOperations(userId);
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return nextState;
}

function compareDirections(left, right) {
  const positionDelta = Number(left?.position || 0) - Number(right?.position || 0);
  if (positionDelta) return positionDelta;
  const createdDelta = new Date(left?.createdAt || 0) - new Date(right?.createdAt || 0);
  if (createdDelta) return createdDelta;
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}
