import { supabase } from "@/lib/supabase/client";

const STORAGE_KEY = "fabbro_strategic_objectives_v1";
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

export async function loadStrategicObjectives(directionId, userId) {
  const local = readLocal().filter((objective) => objective.directionId === directionId);
  if (!supabase || !userId || !directionId) return local;

  const { data, error } = await supabase
    .from("strategic_objectives")
    .select("id,direction_id,title,description,success_condition,status,position,created_at,updated_at")
    .eq("user_id", userId)
    .eq("direction_id", directionId)
    .order("position", { ascending: true });
  if (error) return local;

  const remote = (data || []).map(fromRow);
  const otherDirections = readLocal().filter((objective) => objective.directionId !== directionId);
  writeLocal([...otherDirections, ...remote]);
  return remote;
}

function commitLocal(directionId, nextForDirection, onLocalUpdate) {
  const otherDirections = readLocal().filter((objective) => objective.directionId !== directionId);
  writeLocal([...otherDirections, ...nextForDirection]);
  onLocalUpdate?.(nextForDirection);
}

export async function saveStrategicObjective({ objectives, objective, directionId, userId, onLocalUpdate }) {
  const now = new Date().toISOString();
  const isEditing = Boolean(objective.id);
  const previous = isEditing ? objectives.find((item) => item.id === objective.id) : null;
  const activeCountWithoutCurrent = objectives.filter(
    (item) => item.status === "active" && item.id !== objective.id
  ).length;
  if (objective.status === "active" && activeCountWithoutCurrent >= 3) {
    throw new Error("ACTIVE_OBJECTIVE_LIMIT");
  }

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

  if (supabase && userId) {
    const row = {
      id: nextObjective.id,
      user_id: userId,
      direction_id: nextObjective.directionId,
      title: nextObjective.title,
      description: nextObjective.description || null,
      success_condition: nextObjective.successCondition,
      status: nextObjective.status,
      position: nextObjective.position,
      created_at: nextObjective.createdAt,
      updated_at: nextObjective.updatedAt
    };
    const { error } = isEditing
      ? await supabase.from("strategic_objectives").update(row).eq("id", nextObjective.id).eq("user_id", userId)
      : await supabase.from("strategic_objectives").insert(row);
    if (error) throw error;
  }
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

  if (supabase && userId) {
    const results = await Promise.all(active.map((item, itemIndex) => supabase
      .from("strategic_objectives")
      .update({ position: itemIndex, updated_at: now })
      .eq("id", item.id)
      .eq("user_id", userId)));
    if (results.some((result) => result.error)) throw new Error("REORDER_SYNC_FAILED");
  }
  return next;
}

export async function deleteStrategicObjective({ objectives, objectiveId, directionId, userId, onLocalUpdate }) {
  const next = objectives.filter((item) => item.id !== objectiveId);
  commitLocal(directionId, next, onLocalUpdate);
  if (supabase && userId) {
    const { error } = await supabase.from("strategic_objectives").delete().eq("id", objectiveId).eq("user_id", userId);
    if (error) throw error;
  }
  return next;
}
