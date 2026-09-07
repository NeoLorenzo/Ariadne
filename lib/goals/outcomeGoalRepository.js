import { supabase } from "@/lib/supabase/client";
import { getGoalOutcomeStatus } from "@/lib/goals/goalTiming";
import { hasLocalGoalTask, syncLocalGoalTask } from "@/lib/tasks/goalTaskSync";
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

const STORAGE_KEY = "fabbro_outcome_goals_v1";
const REVISION_STORAGE_KEY = "fabbro_outcome_goal_revisions_v1";
const STRATEGY_DOMAIN = "outcome-goal";
const REVISION_FIELDS = ["title", "targetValue", "bareMinimum", "startDate", "targetDate"];

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function readArray(key) {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function writeArray(key, value) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}

function fromGoalRow(row) {
  return normalizeGoalRecord({ id: row.id, strategicObjectiveId: row.strategic_objective_id, title: row.title,
    description: row.description || "", metricType: row.metric_type,
    currentValue: Number(row.current_value), targetValue: Number(row.target_value),
    bareMinimum: Number(row.bare_minimum ?? 0),
    displayOnTodoList: Boolean(row.display_on_todo_list),
    startDate: row.start_date || "", targetDate: row.target_date || "", status: row.status,
    position: row.position, createdAt: row.created_at, updatedAt: row.updated_at });
}

function fromRevisionRow(row) {
  return { id: row.id, outcomeGoalId: row.outcome_goal_id, previousTitle: row.previous_title,
    previousMetricType: row.previous_metric_type, previousTargetValue: Number(row.previous_target_value),
    previousBareMinimum: Number(row.previous_bare_minimum ?? 0),
    previousStartDate: row.previous_start_date || "", previousTargetDate: row.previous_target_date || "",
    changeReason: row.change_reason, createdAt: row.created_at };
}

function normalizeGoalRecord(goal) {
  const targetValue = normalizeCount(goal?.targetValue, 1);
  const normalized = {
    ...goal,
    metricType: "count",
    currentValue: normalizeCount(goal?.currentValue, 0),
    targetValue,
    bareMinimum: Math.min(normalizeCount(goal?.bareMinimum, 0), targetValue),
    displayOnTodoList: Boolean(goal?.displayOnTodoList)
  };
  return {
    ...normalized,
    status: getGoalOutcomeStatus(normalized)
  };
}

function normalizeCount(value, minimum) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return minimum;
  return Math.max(minimum, Math.trunc(numericValue));
}

function toGoalRow(goal) {
  return {
    id: goal.id,
    strategic_objective_id: goal.strategicObjectiveId,
    title: goal.title,
    description: goal.description || "",
    metric_type: goal.metricType,
    current_value: goal.currentValue,
    target_value: goal.targetValue,
    bare_minimum: goal.bareMinimum,
    display_on_todo_list: goal.displayOnTodoList,
    start_date: goal.startDate || "",
    target_date: goal.targetDate || "",
    status: goal.status,
    position: goal.position,
    created_at: goal.createdAt
  };
}

export function calculateGoalProgress(goal) {
  const currentValue = normalizeCount(goal?.currentValue, 0);
  const targetValue = normalizeCount(goal?.targetValue, 1);
  return Math.max((currentValue / targetValue) * 100, 0);
}

export function calculateObjectiveProgress(goals) {
  const included = goals.filter((goal) => goal.status !== "failed");
  if (!included.length) return null;
  return included.reduce((sum, goal) => sum + calculateGoalProgress(goal), 0) / included.length;
}

async function executeGoalOperation(operation) {
  if (operation.kind === "create") {
    const { data, error } = await supabase.rpc("create_outcome_goal_semantic", {
      goal_record: operation.payload.row
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
    const { data, error } = await supabase.rpc("update_outcome_goal_semantic", {
      goal_id: operation.entityId,
      patch: operation.payload.patch,
      change_reason: operation.payload.changeReason || null,
      revision_id: operation.payload.revisionId || null,
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
    const { data, error } = await supabase.rpc("delete_outcome_goal_semantic", {
      goal_id: operation.entityId,
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
    const { data, error } = await supabase.rpc("reorder_outcome_goals_semantic", {
      objective_id: operation.payload.objectiveId,
      positions,
      expected_updated_at_by_id: expectedById
    });
    if (error) throw error;
    setStrategyBaseUpdatedAtBatch(STRATEGY_DOMAIN, data);
    return data;
  }

  if (operation.kind === "delete-revision") {
    const { data, error } = await supabase.rpc("delete_outcome_goal_revision_semantic", {
      goal_id: operation.entityId,
      revision_id: operation.payload.revisionId
    });
    if (error) throw error;
    return data;
  }

  throw new Error(`UNSUPPORTED_OUTCOME_GOAL_OPERATION:${operation.kind}`);
}

async function flushGoalOperations({ userId, objectiveId, entityId }) {
  if (!supabase || !userId) return { ok: true, deferred: true };
  return flushStrategyOperations({
    domain: STRATEGY_DOMAIN,
    scopeId: objectiveId,
    entityId,
    execute: executeGoalOperation
  });
}

async function flushGoalScopes(userId, scopeIds) {
  const uniqueScopes = [...new Set((scopeIds || []).filter(Boolean))];
  for (const objectiveId of uniqueScopes) {
    const result = await flushGoalOperations({ userId, objectiveId });
    if (!result.ok) return result;
  }
  return { ok: true };
}

async function repairMissingGoalTasks(goals, userId, syncCloud) {
  for (const goal of goals) {
    if (!goal.displayOnTodoList || hasLocalGoalTask(goal.id)) continue;
    syncLocalGoalTask(goal);
    if (syncCloud && supabase && userId) {
      try {
        await supabase.rpc("sync_outcome_goal_task_semantic", { goal_id: goal.id });
      } catch {
        // Local repair is enough for this load; a future load retries the server-side repair.
      }
    }
  }
}

export async function loadOutcomeGoals(objectiveId, userId) {
  const local = readArray(STORAGE_KEY)
    .filter((goal) => goal.strategicObjectiveId === objectiveId)
    .map(normalizeGoalRecord);
  await repairMissingGoalTasks(local, userId, false);
  if (!supabase || !userId) return local;

  const syncResult = await flushGoalOperations({ userId, objectiveId });
  if (!syncResult.ok) return local;

  const { data, error } = await supabase.from("outcome_goals")
    .select("id,strategic_objective_id,title,description,metric_type,current_value,target_value,bare_minimum,display_on_todo_list,start_date,target_date,status,position,created_at,updated_at")
    .eq("user_id", userId).eq("strategic_objective_id", objectiveId).order("position", { ascending: true });
  if (error) return local;

  const rows = data || [];
  setStrategyBaseUpdatedAtBatch(STRATEGY_DOMAIN, rows);
  const remote = rows.map(fromGoalRow);
  await repairMissingGoalTasks(remote, userId, true);
  const statusUpdates = remote
    .filter((goal, index) => goal.status !== rows[index]?.status)
    .map((goal) => supabase
      .from("outcome_goals")
      .update({ status: goal.status, metric_type: "count", bare_minimum: goal.bareMinimum })
      .eq("id", goal.id)
      .eq("user_id", userId));
  if (statusUpdates.length) await Promise.all(statusUpdates);

  writeArray(STORAGE_KEY, [...readArray(STORAGE_KEY).filter((goal) => goal.strategicObjectiveId !== objectiveId), ...remote]);
  return remote;
}

export async function loadOutcomeGoalRevisions(goalId, userId) {
  const local = readArray(REVISION_STORAGE_KEY).filter((revision) => revision.outcomeGoalId === goalId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!supabase || !userId) return local;

  const syncResult = await flushGoalOperations({ userId, entityId: goalId });
  if (!syncResult.ok) return local;

  const { data, error } = await supabase.from("outcome_goal_revisions")
    .select("id,outcome_goal_id,previous_title,previous_metric_type,previous_target_value,previous_bare_minimum,previous_start_date,previous_target_date,change_reason,created_at")
    .eq("user_id", userId).eq("outcome_goal_id", goalId).order("created_at", { ascending: false });
  if (error) return local;
  const remote = (data || []).map(fromRevisionRow);
  writeArray(REVISION_STORAGE_KEY, [...readArray(REVISION_STORAGE_KEY).filter((revision) => revision.outcomeGoalId !== goalId), ...remote]);
  return remote;
}

export async function deleteOutcomeGoalRevision({ goalId, revisionId, userId, onLocalUpdate }) {
  const allRevisions = readArray(REVISION_STORAGE_KEY);
  const nextRevisions = allRevisions
    .filter((revision) => revision.id !== revisionId)
    .filter((revision) => revision.outcomeGoalId === goalId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  writeArray(REVISION_STORAGE_KEY, allRevisions.filter((revision) => revision.id !== revisionId));
  onLocalUpdate?.(nextRevisions);
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "delete-revision",
    entityId: goalId,
    scopeIds: [],
    payload: { revisionId }
  });

  const syncResult = await flushGoalOperations({ userId, entityId: goalId });
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return nextRevisions;
}

function commitGoals(objectiveId, next, onLocalUpdate) {
  writeArray(STORAGE_KEY, [...readArray(STORAGE_KEY).filter((goal) => goal.strategicObjectiveId !== objectiveId), ...next]);
  onLocalUpdate?.(next);
}

export function hasMeaningfulGoalChanges(previous, draft) {
  if (!previous) return false;
  return REVISION_FIELDS.some((field) => String(previous[field] ?? "") !== String(draft[field] ?? ""));
}

export function toOutcomeGoalSemanticPatch(goal) {
  return {
    strategic_objective_id: goal.strategicObjectiveId,
    title: goal.title,
    description: goal.description || "",
    metric_type: goal.metricType,
    current_value: goal.currentValue,
    target_value: goal.targetValue,
    bare_minimum: goal.bareMinimum,
    display_on_todo_list: goal.displayOnTodoList,
    start_date: goal.startDate || "",
    target_date: goal.targetDate || "",
    status: goal.status,
    position: goal.position
  };
}

export async function saveOutcomeGoal({ goals, goal, objectiveId, userId, revisionReason, onLocalUpdate }) {
  const now = new Date().toISOString();
  const previous = goal.id ? goals.find((item) => item.id === goal.id) : null;
  const meaningfulChange = hasMeaningfulGoalChanges(previous, goal);
  if (meaningfulChange && !String(revisionReason || "").trim()) throw new Error("REVISION_REASON_REQUIRED");

  if (previous) supersedeStrategyConflicts({ domain: STRATEGY_DOMAIN, entityId: previous.id });

  const targetObjectiveId = previous?.strategicObjectiveId === goal.strategicObjectiveId
    ? previous.strategicObjectiveId : (goal.strategicObjectiveId || objectiveId);
  const targetValue = normalizeCount(goal.targetValue, 1);
  const normalizedGoal = { id: goal.id || makeId("outcome-goal"), strategicObjectiveId: targetObjectiveId,
    title: goal.title.trim(), description: goal.description.trim(), metricType: "count",
    currentValue: normalizeCount(goal.currentValue, 0), targetValue,
    bareMinimum: Math.min(normalizeCount(goal.bareMinimum, 0), targetValue),
    displayOnTodoList: Boolean(goal.displayOnTodoList),
    startDate: goal.startDate || "", targetDate: goal.targetDate || "",
    position: previous?.position ?? Math.max(-1, ...goals.map((item) => item.position)) + 1,
    createdAt: previous?.createdAt || now, updatedAt: now };
  const nextGoal = { ...normalizedGoal, status: getGoalOutcomeStatus(normalizedGoal) };
  const revision = meaningfulChange ? { id: makeId("outcome-goal-revision"), outcomeGoalId: previous.id,
    previousTitle: previous.title, previousMetricType: previous.metricType, previousTargetValue: previous.targetValue,
    previousBareMinimum: previous.bareMinimum,
    previousStartDate: previous.startDate, previousTargetDate: previous.targetDate,
    changeReason: String(revisionReason || "").trim(), createdAt: now } : null;

  const next = previous ? goals.map((item) => item.id === nextGoal.id ? nextGoal : item) : [...goals, nextGoal];
  commitGoals(objectiveId, next.filter((item) => item.strategicObjectiveId === objectiveId), onLocalUpdate);
  if (targetObjectiveId !== objectiveId) {
    const all = readArray(STORAGE_KEY).filter((item) => item.id !== nextGoal.id);
    writeArray(STORAGE_KEY, [...all, nextGoal]);
  }
  if (revision) writeArray(REVISION_STORAGE_KEY, [revision, ...readArray(REVISION_STORAGE_KEY)]);

  const linkedDefinitionChanged = Boolean(previous) && (
    previous.title !== nextGoal.title
    || previous.description !== nextGoal.description
    || previous.targetDate !== nextGoal.targetDate
  );
  const shouldSyncTask = (!previous && nextGoal.displayOnTodoList)
    || (Boolean(previous) && previous.displayOnTodoList !== nextGoal.displayOnTodoList)
    || (nextGoal.displayOnTodoList && linkedDefinitionChanged)
    || (nextGoal.displayOnTodoList && !hasLocalGoalTask(nextGoal.id));
  if (shouldSyncTask) syncLocalGoalTask(nextGoal);

  const scopeIds = [...new Set([objectiveId, targetObjectiveId].filter(Boolean))];
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: previous ? "update" : "create",
    entityId: nextGoal.id,
    scopeIds,
    payload: {
      baseUpdatedAt: previous?.updatedAt || "",
      row: toGoalRow(nextGoal),
      patch: toOutcomeGoalSemanticPatch(nextGoal),
      changeReason: revision?.changeReason || null,
      revisionId: revision?.id || null
    }
  });

  const syncResult = await flushGoalScopes(userId, scopeIds);
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ariadne:outcome-goals-changed", { detail: { objectiveId: targetObjectiveId } }));
  }
  return next;
}

export async function adjustOutcomeGoalCurrentValue({ goals, goalId, delta, objectiveId, userId, onLocalUpdate }) {
  const goal = goals.find((item) => item.id === goalId);
  if (!goal) return goals;
  return saveOutcomeGoal({
    goals,
    goal: { ...goal, currentValue: Math.max(0, normalizeCount(goal.currentValue, 0) + Math.trunc(Number(delta) || 0)) },
    objectiveId,
    userId,
    revisionReason: "",
    onLocalUpdate
  });
}

export async function reorderOutcomeGoals({ goals, goalId, offset, objectiveId, userId, onLocalUpdate }) {
  const ordered = [...goals].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((goal) => goal.id === goalId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= ordered.length) return goals;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  const now = new Date().toISOString();
  const next = ordered.map((goal, position) => ({ ...goal, position, updatedAt: now }));
  commitGoals(objectiveId, next, onLocalUpdate);

  const reorderEntityId = `reorder:${objectiveId}`;
  supersedeStrategyConflicts({ domain: STRATEGY_DOMAIN, entityId: reorderEntityId });
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "reorder",
    entityId: reorderEntityId,
    scopeIds: [objectiveId],
    payload: {
      objectiveId,
      items: ordered.map((goal, position) => ({ id: goal.id, position, baseUpdatedAt: goal.updatedAt || "" }))
    }
  });

  const syncResult = await flushGoalOperations({ userId, objectiveId });
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return next;
}

export async function deleteOutcomeGoal({ goals, goalId, objectiveId, userId, onLocalUpdate }) {
  const existing = goals.find((goal) => goal.id === goalId);
  const next = goals.filter((goal) => goal.id !== goalId);
  commitGoals(objectiveId, next, onLocalUpdate);
  syncLocalGoalTask({ id: goalId, displayOnTodoList: false });

  supersedeStrategyConflicts({ domain: STRATEGY_DOMAIN, entityId: goalId });
  enqueueStrategyOperation({
    domain: STRATEGY_DOMAIN,
    kind: "delete",
    entityId: goalId,
    scopeIds: [objectiveId],
    payload: { baseUpdatedAt: existing?.updatedAt || "" }
  });

  const syncResult = await flushGoalOperations({ userId, objectiveId });
  if (!syncResult.ok) throw toStrategySyncError(syncResult.error);
  return next;
}
