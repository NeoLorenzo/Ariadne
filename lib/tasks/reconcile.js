import { normalizeTaskTombstone } from "./taskTombstones";

function createTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDateInput(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalizeTimeInput(value) {
  const match = String(value || "").trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function normalizePriority(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 4 ? numeric : 0;
}

function getDirectionalGoalId(task) {
  const explicit = String(task?.sourceGoalId || "").trim();
  if (explicit) return explicit;
  const id = String(task?.id || "");
  return id.startsWith("directional-goal-task-") ? id.slice("directional-goal-task-".length) : "";
}

function normalizeEstimatedHours(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return "";
  return String(Math.round(numeric * 100) / 100);
}

function sanitizeSubtaskList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== "object" || !String(item.title || "").trim()) return null;
    const createdAt = Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : 0;
    return { id: String(item.id || createTaskId()), title: String(item.title).trim(), description: String(item.description || "").trim(), completed: Boolean(item.completed), createdAt, updatedAt: Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : createdAt };
  }).filter(Boolean);
}

export function sanitizeTask(task) {
  if (!task || typeof task !== "object" || !String(task.title || "").trim()) return null;
  const directionalGoalId = getDirectionalGoalId(task);
  const createdAt = Number.isFinite(Number(task.createdAt)) ? Number(task.createdAt) : 0;
  const tombstone = normalizeTaskTombstone(task);
  return { id: String(task.id || createTaskId()), completed: Boolean(task.completed), title: String(task.title).trim(), description: String(task.description || "").trim(), dueDate: normalizeDateInput(task.dueDate), dueTime: normalizeTimeInput(task.dueTime), priority: directionalGoalId ? 1 : normalizePriority(task.priority), estimatedHours: normalizeEstimatedHours(task.estimatedHours), subtasks: sanitizeSubtaskList(task.subtasks), sourceType: directionalGoalId ? "directional-goal" : "", sourceGoalId: directionalGoalId, tags: directionalGoalId ? ["directional-goal"] : [], deleted: tombstone.deleted, deletedAt: tombstone.deletedAt, createdAt, updatedAt: Number.isFinite(Number(task.updatedAt)) ? Number(task.updatedAt) : createdAt };
}

export function sanitizeTaskList(tasks) { return Array.isArray(tasks) ? tasks.map(sanitizeTask).filter(Boolean) : []; }

export function getTaskSyncSignature(task) {
  const t = sanitizeTask(task);
  if (!t) return "";
  return JSON.stringify(t);
}

export function createTaskSignatureMap(tasks) {
  return Object.fromEntries(sanitizeTaskList(tasks).map((task) => [task.id, getTaskSyncSignature(task)]));
}

export function mergeTaskSnapshots(preferredTasks, fallbackTasks) {
  const merged = new Map(sanitizeTaskList(fallbackTasks).map((task) => [task.id, task]));
  sanitizeTaskList(preferredTasks).forEach((task) => {
    const existing = merged.get(task.id);
    if (!existing || Number(task.updatedAt || 0) >= Number(existing.updatedAt || 0)) merged.set(task.id, task);
  });
  return [...merged.values()];
}

export function reconcileTaskSnapshots(localTasks, remoteTasks, baselineSignaturesByTaskId = {}) {
  const local = new Map(sanitizeTaskList(localTasks).map((task) => [task.id, task]));
  const remote = new Map(sanitizeTaskList(remoteTasks).map((task) => [task.id, task]));
  const baseline = baselineSignaturesByTaskId && typeof baselineSignaturesByTaskId === "object" ? baselineSignaturesByTaskId : {};
  const ids = new Set([...local.keys(), ...remote.keys(), ...Object.keys(baseline)]);
  const result = [];
  ids.forEach((id) => {
    const l = local.get(id) || null, r = remote.get(id) || null, b = String(baseline[id] || "");
    const lc = l ? getTaskSyncSignature(l) !== b : "" !== b, rc = r ? getTaskSyncSignature(r) !== b : "" !== b;
    if (lc && !rc) { if (l) result.push(l); return; }
    if (rc && !lc) { if (r) result.push(r); return; }
    if (lc && rc && l && r) { result.push(Number(l.updatedAt || 0) > Number(r.updatedAt || 0) ? l : r); return; }
    if (r) result.push(r); else if (l && lc) result.push(l);
  });
  return result;
}
