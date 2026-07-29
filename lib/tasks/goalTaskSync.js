import { supabase } from "@/lib/supabase/client";
import { upsertSyncCacheEntryIfChanged } from "@/lib/storage/syncCache";
import {
  isTaskDeleted,
  markTaskDeleted
} from "@/lib/tasks/taskTombstones";

const TASK_STORAGE_KEY = "fabbro_tasks_v1";
const TASKS_SYNC_CACHE_NAMESPACE = "tasks.resolved_cloud";
const LINKED_TASK_TYPE = "directional-goal";

function linkedTaskId(goalId) {
  return `directional-goal-task-${goalId}`;
}

export function hasLocalGoalTask(goalId) {
  return readLocalTasks().some(
    (task) => task?.id === linkedTaskId(goalId) || task?.sourceGoalId === goalId
  );
}

function readLocalTasks() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalTasks(tasks) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  window.dispatchEvent(new CustomEvent("fabbro:tasks-changed"));
}

function cacheCloudTasks(userId, tasks, version) {
  const payload = { tasks, version };
  upsertSyncCacheEntryIfChanged({
    namespace: TASKS_SYNC_CACHE_NAMESPACE,
    userId,
    payload,
    signature: JSON.stringify(payload)
  });
}

function createUniqueTitle(baseTitle, tasks, excludedTaskId) {
  const normalizedBase = String(baseTitle || "").trim() || "Untitled goal";
  const existingTitles = new Set(
    tasks
      .filter((task) => task?.id !== excludedTaskId && !isTaskDeleted(task))
      .map((task) => String(task?.title || "").trim().toLocaleLowerCase())
  );
  if (!existingTitles.has(normalizedBase.toLocaleLowerCase())) return normalizedBase;

  let suffix = 1;
  while (existingTitles.has(`${normalizedBase} (${suffix})`.toLocaleLowerCase())) {
    suffix += 1;
  }
  return `${normalizedBase} (${suffix})`;
}

function updateLinkedTask(tasks, goal, enabled) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const taskId = linkedTaskId(goal.id);
  const existing = safeTasks.find(
    (task) => task?.id === taskId || task?.sourceGoalId === goal.id
  );
  if (!enabled) {
    const now = Date.now();
    return safeTasks.map((task) =>
      task?.id === taskId || task?.sourceGoalId === goal.id
        ? markTaskDeleted(task, now)
        : task
    );
  }

  const withoutLinkedTask = safeTasks.filter(
    (task) => task?.id !== taskId && task?.sourceGoalId !== goal.id
  );

  const now = Date.now();
  const resolvedId = existing?.id || taskId;
  const title = createUniqueTitle(goal.title, safeTasks, resolvedId);
  const linkedTask = {
    ...(existing || {}),
    id: resolvedId,
    completed: Boolean(existing?.completed),
    title,
    description: String(goal.description || "").trim(),
    dueDate: goal.targetDate || "",
    dueTime: existing?.dueTime || "",
    priority: 1,
    estimatedHours: existing?.estimatedHours || "",
    subtasks: Array.isArray(existing?.subtasks) ? existing.subtasks : [],
    sourceType: LINKED_TASK_TYPE,
    sourceGoalId: goal.id,
    tags: [LINKED_TASK_TYPE],
    deleted: false,
    deletedAt: 0,
    createdAt: Number.isFinite(Number(existing?.createdAt)) ? Number(existing.createdAt) : now,
    updatedAt: now
  };
  return [...withoutLinkedTask, linkedTask];
}

function normalizePriority(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 4 ? numeric : 0;
}

async function syncCloudTasks(userId, mutate) {
  if (!supabase || !userId) return;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: row, error: readError } = await supabase
      .from("user_tasks")
      .select("tasks,version")
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;

    const currentTasks = Array.isArray(row?.tasks) ? row.tasks : readLocalTasks();
    const nextTasks = mutate(currentTasks);

    if (!row) {
      const { error: insertError } = await supabase
        .from("user_tasks")
        .insert({ user_id: userId, tasks: nextTasks, version: 1 });
      if (!insertError) {
        writeLocalTasks(nextTasks);
        cacheCloudTasks(userId, nextTasks, 1);
        return;
      }
      continue;
    }

    const version = Number(row.version);
    const { data: updated, error: updateError } = await supabase
      .from("user_tasks")
      .update({
        tasks: nextTasks,
        version: version + 1,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("version", version)
      .select("version")
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated) {
      writeLocalTasks(nextTasks);
      cacheCloudTasks(userId, nextTasks, Number(updated.version));
      return;
    }
  }

  throw new Error("TASK_SYNC_VERSION_CONFLICT");
}

export async function syncGoalTask({ goal, userId }) {
  const mutate = (tasks) => updateLinkedTask(tasks, goal, Boolean(goal.displayOnTodoList));
  writeLocalTasks(mutate(readLocalTasks()));
  await syncCloudTasks(userId, mutate);
}

export async function removeGoalTask({ goalId, userId }) {
  const mutate = (tasks) => {
    const now = Date.now();
    return (Array.isArray(tasks) ? tasks : []).map((task) =>
      task?.id === linkedTaskId(goalId) || task?.sourceGoalId === goalId
        ? markTaskDeleted(task, now)
        : task
    );
  };
  writeLocalTasks(mutate(readLocalTasks()));
  await syncCloudTasks(userId, mutate);
}
