export const TASK_TOMBSTONE_RETENTION_MS = 24 * 60 * 60 * 1000;

export function isTaskDeleted(task) {
  return Boolean(task?.deleted);
}

export function markTaskDeleted(task, deletedAt = Date.now()) {
  const normalizedDeletedAt = normalizeTimestamp(deletedAt) || Date.now();
  return {
    ...task,
    deleted: true,
    deletedAt: normalizedDeletedAt,
    updatedAt: normalizedDeletedAt
  };
}

export function restoreDeletedTask(task, restoredAt = Date.now()) {
  const normalizedRestoredAt = normalizeTimestamp(restoredAt) || Date.now();
  return {
    ...task,
    deleted: false,
    deletedAt: 0,
    updatedAt: normalizedRestoredAt
  };
}

export function purgeExpiredTaskTombstones(taskList, now = Date.now()) {
  const cutoff = normalizeTimestamp(now) - TASK_TOMBSTONE_RETENTION_MS;
  return (Array.isArray(taskList) ? taskList : []).filter((task) => {
    if (!isTaskDeleted(task)) {
      return true;
    }

    const deletedAt = normalizeTimestamp(task?.deletedAt) || normalizeTimestamp(task?.updatedAt);
    return !deletedAt || deletedAt > cutoff;
  });
}

export function normalizeTaskTombstone(task) {
  const deleted = isTaskDeleted(task);
  const deletedAt = deleted
    ? normalizeTimestamp(task?.deletedAt) || normalizeTimestamp(task?.updatedAt)
    : 0;
  return { deleted, deletedAt };
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}
