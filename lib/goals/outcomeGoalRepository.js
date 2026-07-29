import { supabase } from "@/lib/supabase/client";
import { getGoalOutcomeStatus } from "@/lib/goals/goalTiming";
import { hasLocalGoalTask, removeGoalTask, syncGoalTask } from "@/lib/tasks/goalTaskSync";

const STORAGE_KEY = "fabbro_outcome_goals_v1";
const REVISION_STORAGE_KEY = "fabbro_outcome_goal_revisions_v1";
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
  if (!Number.isFinite(numericValue)) {
    return minimum;
  }
  return Math.max(minimum, Math.trunc(numericValue));
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

export async function loadOutcomeGoals(objectiveId, userId) {
  const local = readArray(STORAGE_KEY)
    .filter((goal) => goal.strategicObjectiveId === objectiveId)
    .map(normalizeGoalRecord);
  await repairMissingGoalTasks(local, userId);
  if (!supabase || !userId) return local;
  const { data, error } = await supabase.from("outcome_goals")
    .select("id,strategic_objective_id,title,description,metric_type,current_value,target_value,bare_minimum,display_on_todo_list,start_date,target_date,status,position,created_at,updated_at")
    .eq("user_id", userId).eq("strategic_objective_id", objectiveId).order("position", { ascending: true });
  if (error) return local;
  const remote = (data || []).map(fromGoalRow);
  await repairMissingGoalTasks(remote, userId);
  const statusUpdates = remote
    .filter((goal, index) => goal.status !== data[index]?.status)
    .map((goal) => supabase
      .from("outcome_goals")
      .update({ status: goal.status, metric_type: "count", bare_minimum: goal.bareMinimum })
      .eq("id", goal.id)
      .eq("user_id", userId));
  if (statusUpdates.length) {
    await Promise.all(statusUpdates);
  }
  writeArray(STORAGE_KEY, [...readArray(STORAGE_KEY).filter((goal) => goal.strategicObjectiveId !== objectiveId), ...remote]);
  return remote;
}

async function repairMissingGoalTasks(goals, userId) {
  for (const goal of goals) {
    if (goal.displayOnTodoList && !hasLocalGoalTask(goal.id)) {
      try {
        await syncGoalTask({ goal, userId });
      } catch {
        // The local linked task is created before cloud synchronization is attempted.
      }
    }
  }
}

export async function loadOutcomeGoalRevisions(goalId, userId) {
  const local = readArray(REVISION_STORAGE_KEY).filter((revision) => revision.outcomeGoalId === goalId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!supabase || !userId) return local;
  const { data, error } = await supabase.from("outcome_goal_revisions")
    .select("id,outcome_goal_id,previous_title,previous_metric_type,previous_target_value,previous_bare_minimum,previous_start_date,previous_target_date,change_reason,created_at")
    .eq("user_id", userId).eq("outcome_goal_id", goalId).order("created_at", { ascending: false });
  if (error) return local;
  const remote = (data || []).map(fromRevisionRow);
  writeArray(REVISION_STORAGE_KEY, [...readArray(REVISION_STORAGE_KEY).filter((revision) => revision.outcomeGoalId !== goalId), ...remote]);
  return remote;
}

export async function deleteOutcomeGoalRevision({
  goalId,
  revisionId,
  userId,
  onLocalUpdate
}) {
  const allRevisions = readArray(REVISION_STORAGE_KEY);
  const nextRevisions = allRevisions
    .filter((revision) => revision.id !== revisionId)
    .filter((revision) => revision.outcomeGoalId === goalId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  writeArray(
    REVISION_STORAGE_KEY,
    allRevisions.filter((revision) => revision.id !== revisionId)
  );
  onLocalUpdate?.(nextRevisions);

  if (supabase && userId) {
    const { data, error } = await supabase
      .from("outcome_goal_revisions")
      .delete()
      .eq("id", revisionId)
      .eq("user_id", userId)
      .eq("outcome_goal_id", goalId)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("OUTCOME_GOAL_REVISION_DELETE_NOT_CONFIRMED");
  }

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

export async function saveOutcomeGoal({ goals, goal, objectiveId, userId, revisionReason, onLocalUpdate }) {
  const now = new Date().toISOString();
  const previous = goal.id ? goals.find((item) => item.id === goal.id) : null;
  const meaningfulChange = hasMeaningfulGoalChanges(previous, goal);
  if (meaningfulChange && !String(revisionReason || "").trim()) throw new Error("REVISION_REASON_REQUIRED");
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
  if (shouldSyncTask) {
    await syncGoalTask({ goal: nextGoal, userId });
  }

  if (supabase && userId) {
    if (revision) {
      const { error } = await supabase.from("outcome_goal_revisions").insert({ id: revision.id, user_id: userId,
        outcome_goal_id: revision.outcomeGoalId, previous_title: revision.previousTitle,
        previous_metric_type: revision.previousMetricType, previous_target_value: revision.previousTargetValue,
        previous_bare_minimum: revision.previousBareMinimum,
        previous_start_date: revision.previousStartDate || null, previous_target_date: revision.previousTargetDate || null,
        change_reason: revision.changeReason, created_at: revision.createdAt });
      if (error) throw error;
    }
    const row = { id: nextGoal.id, user_id: userId, strategic_objective_id: nextGoal.strategicObjectiveId,
      title: nextGoal.title, description: nextGoal.description || null, metric_type: nextGoal.metricType,
      current_value: nextGoal.currentValue, target_value: nextGoal.targetValue, bare_minimum: nextGoal.bareMinimum,
      display_on_todo_list: nextGoal.displayOnTodoList,
      start_date: nextGoal.startDate || null, target_date: nextGoal.targetDate || null,
      status: nextGoal.status, position: nextGoal.position, created_at: nextGoal.createdAt, updated_at: nextGoal.updatedAt };
    const { error } = previous
      ? await supabase.from("outcome_goals").update(row).eq("id", nextGoal.id).eq("user_id", userId)
      : await supabase.from("outcome_goals").insert(row);
    if (error) throw error;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("fabbro:outcome-goals-changed", { detail: { objectiveId: targetObjectiveId } }));
  return next;
}

export async function adjustOutcomeGoalCurrentValue({
  goals,
  goalId,
  delta,
  objectiveId,
  userId,
  onLocalUpdate
}) {
  const goal = goals.find((item) => item.id === goalId);
  if (!goal) return goals;
  return saveOutcomeGoal({
    goals,
    goal: {
      ...goal,
      currentValue: Math.max(0, normalizeCount(goal.currentValue, 0) + Math.trunc(Number(delta) || 0))
    },
    objectiveId,
    userId,
    revisionReason: "",
    onLocalUpdate
  });
}

export async function reorderOutcomeGoals({ goals, goalId, offset, objectiveId, userId, onLocalUpdate }) {
  const ordered = [...goals].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((goal) => goal.id === goalId); const target = index + offset;
  if (index < 0 || target < 0 || target >= ordered.length) return goals;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  const now = new Date().toISOString(); const next = ordered.map((goal, position) => ({ ...goal, position, updatedAt: now }));
  commitGoals(objectiveId, next, onLocalUpdate);
  if (supabase && userId) {
    const results = await Promise.all(next.map((goal) => supabase.from("outcome_goals").update({ position: goal.position, updated_at: now }).eq("id", goal.id).eq("user_id", userId)));
    if (results.some((result) => result.error)) throw new Error("REORDER_SYNC_FAILED");
  }
  return next;
}

export async function deleteOutcomeGoal({ goals, goalId, objectiveId, userId, onLocalUpdate }) {
  const next = goals.filter((goal) => goal.id !== goalId); commitGoals(objectiveId, next, onLocalUpdate);
  if (supabase && userId) { const { error } = await supabase.from("outcome_goals").delete().eq("id", goalId).eq("user_id", userId); if (error) throw error; }
  await removeGoalTask({ goalId, userId });
  return next;
}
