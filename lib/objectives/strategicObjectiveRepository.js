import { supabase } from "@/lib/supabase/client";
import {
  clearStrategyBaseUpdatedAt,
  enqueueStrategyOperation,
  flushStrategyOperations,
  getStrategyBaseUpdatedAt,
  setStrategyBaseUpdatedAt,
  setStrategyBaseUpdatedAtBatch,
  supersedeStrategyConflicts,
  toStrategySyncError
} from "@/lib/strategy/pendingOperations";

const STORAGE_KEY = "fabbro_strategic_objectives_v1";
const STRATEGY_DOMAIN = "strategic-objective";
export const OBJECTIVE_STATUSES = ["active", "completed", "paused", "abandoned"];

function makeId() {
  return `strategic-objective-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function readLocal() {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocal(objectives) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(objectives));
  }
}

function fromRow(row) {
  return {
    id: row.id,
    directionId: row.direction_id,
    title: row.title,
    description: row.description || "",
    successCondition: row.success_condition,
    status: row.status,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRow(objective) {
  return {
    id: objective.id,
    direction_id: objective.directionId,
    title: objective.title,
    description: objective.description || "",
    success_condition: objective.successCondition,
    status: objective.status,
    position: objective.position,
    created_at: objective.createdAt
  };
}

function commitLocal(directionId, nextForDirection, onLocalUpdate) {
  const otherDirections = readLocal().filter((objective) => objective.directionId !== directionId);
  writeLocal([...otherDirections, ...nextForDirection]);
  onLocalUpdate?.(nextForDirection);
}

async function executeObjectiveOperation(operation) {
  if (operation.kind === "save") {
    const expectedUpdatedAt = operation.payload.isEditing
      ? getStrategyBaseUpdatedAt(STRATEGY_DOMAIN, operation.entityId, operation.payload.baseUpdatedAt)
      : "";
    const { data, error } = await supabase.rpc("save_strategic_objective_semantic", {
      objective_record: operation.payload.row,
      expected_updated_at: expectedUpdatedAt || null
    });
    if (error) throw error;
    if (data?.updated_at) setStrategyBaseUpdatedAt(STRATEGY_DOMAIN, operation.entityId, data.updated_at);
    return data;
  }

  if (operation.kind === "delete") {
    const expectedUpdatedAt = getStrategyBaseUpdatedAt(
      STRATEGY_DOMAIN,
      operation.entityId,
      operation.payload.baseUpdatedAt
    );
    const { data, error } = await supabase.rpc("delete_strategic_objective_semantic", {
      objective_id: operation.entityId,
      expected_updated_at: expectedUpdatedAt || null
    });
    if (error) throw error;
    clearStrategyBaseUpdatedAt(STRATEGY_DOMAIN, operation.entityId);
    return data;
  }

  if (operation.kind === "reorder") {
    const positions = Object.fromEntries(operation.payload.items.map((item) => [item.id, item.position]));
    const expectedById = Object.fromEntries(operation.payload.items.map((item) => [
      item.id,
      getStrategyBaseUpdatedAt(STRATEGY_DOMAIN, item.id, item.baseUpdatedAt)
    ]).filter(([, value]) => Boolean(value)));
    const { data, error } = await supabase.rpc("reorder_strategic_objectives_semantic", {
      direction_id: operation.payload.directionId,
      positions,
      expected_updated_at_by_id: expectedById
    });
    if (error) throw error;
    setStrategyBaseUpdatedAtBatch(STRATEGY_DOMAIN, data);
    return data;
  }

  throw new Error(`UNSUPPORTED_OBJECTIVE_OPERATION:${operation.kind}`);
}

async function flushObjectiveOperations({ userId, directionId, entityId }) {
  if (!supabase || !userId) return { ok: true, deferred: true };
  return flushStrategyOperations({
    domain: STRATEGY_DOMAIN,
    scopeId: directionId,
    entityId,
    execute: executeObjectiveOperation
  });
}

export async function loadStrategicObjectives(directionId, userId) {
  const local = readLocal().filter((objective) => objective.directionId === directionId);
  if (!supabase || !userId || !directionId) return local;

  const syncResult = await flushObjectiveOperations({ userId, directionId });
  if (!syncResult.ok) return local;

  const { data, error } = await supabase
    .from("strategic_objectives")
    .select("id,direction_id,title,description,success_condition,status,position,created_at,updated_at")
    .eq("user_id", userId)
    .eq("direction_id", directionId)
    .order("position", { ascending: true });
  if (error) return local;

  const rows = data || [];
  setStrategyBaseUpdatedAtBatch(STRATEGY_DOMAIN, rows);
  const remote = rows.map(fromRow);
  const otherDirections = readLocal().filter((objective) => objective.directionId !== directionId);
  writeLocal([...otherDirections, ...remote]);
  return remote;
}

export async function saveStrategicObjective({ objectives, objective, directionId, userId, onLocalUpdate }) {
  const now = new Date().toISOString();
  const isEditing = Boolean(objective.id);
  const previous = isEditing ? objectives.find((item) => item.id === objective.id) : null;

  if (previous) supersedeStrategyConflicts({ domain: STRATEGY_DOMAIN, entityId: previous.id });

  const nextObjective = {
    id: objective.id || makeId(),
    directionId: previous?.directionId || directionId,
    title: objective.title.trim(),
    description: objective.description.trim(),
    successCondition: objective.successCondition.trim(),
    status: objective.status,
    position: previous?.position ?? Math.max(-1, ...objectives.map((item) => item.position)) + 1,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
  const next = isEditing
    ? objectives.map((item) => item.id === nextObjective.id ? nextObjective : item)
    : [...objectives, nextObjective];
  commitLocal(directionId, next, onLocalUpdate);

  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "save",
    entityId: nextObjective.id,
    scopeIds: [nextObjective.directionId],
    payload: {
      isEditing,
      baseUpdatedAt: previous?.updatedAt || "",
      row: toRow(nextObjective)
    }
  });

  const syncResult = await flushObjectiveOperations({ userId, directionId: nextObjective.directionId });
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return next;
}

export async function changeObjectiveStatus(args) {
  const current = args.objectives.find((item) => item.id === args.objectiveId);
  if (!current) return args.objectives;
  return saveStrategicObjective({ ...args, objective: { ...current, status: args.status } });
}

export async function reorderStrategicObjectives({ objectives, objectiveId, offset, directionId, userId, onLocalUpdate }) {
  const active = objectives.filter((item) => item.status === "active").sort((a, b) => a.position - b.position);
  const index = active.findIndex((item) => item.id === objectiveId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= active.length) return objectives;
  [active[index], active[target]] = [active[target], active[index]];
  const positions = new Map(active.map((item, itemIndex) => [item.id, itemIndex]));
  const now = new Date().toISOString();
  const next = objectives.map((item) => positions.has(item.id)
    ? { ...item, position: positions.get(item.id), updatedAt: now }
    : item);
  commitLocal(directionId, next, onLocalUpdate);

  const reorderEntityId = `reorder:${directionId}`;
  supersedeStrategyConflicts({ domain: STRATEGY_DOMAIN, entityId: reorderEntityId });
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "reorder",
    entityId: reorderEntityId,
    scopeIds: [directionId],
    payload: {
      directionId,
      items: active.map((item, itemIndex) => ({
        id: item.id,
        position: itemIndex,
        baseUpdatedAt: item.updatedAt || ""
      }))
    }
  });

  const syncResult = await flushObjectiveOperations({ userId, directionId });
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return next;
}

export async function deleteStrategicObjective({ objectives, objectiveId, directionId, userId, onLocalUpdate }) {
  const existing = objectives.find((item) => item.id === objectiveId);
  const next = objectives.filter((item) => item.id !== objectiveId);
  commitLocal(directionId, next, onLocalUpdate);

  supersedeStrategyConflicts({ domain: STRATEGY_DOMAIN, entityId: objectiveId });
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "delete",
    entityId: objectiveId,
    scopeIds: [directionId],
    payload: { baseUpdatedAt: existing?.updatedAt || "" }
  });

  const syncResult = await flushObjectiveOperations({ userId, directionId });
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return next;
}
