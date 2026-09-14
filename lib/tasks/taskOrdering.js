"use client";

import { isTaskDeleted } from "@/lib/tasks/taskTombstones";

export const TASK_SORT_STORAGE_KEY = "fabbro_tasks_sort_v1";

export function readSavedTaskSortMode() {
  if (typeof window === "undefined") {
    return "due-date";
  }

  try {
    const saved = window.localStorage.getItem(TASK_SORT_STORAGE_KEY);
    return saved === "priority" || saved === "target-date" ? saved : "due-date";
  } catch {
    return "due-date";
  }
}

export function orderTasksForDisplay(taskList, sortMode) {
  const sortFunction = sortMode === "priority"
    ? sortTasksByPriority
    : sortMode === "target-date"
      ? sortTasksByTargetDate
      : sortTasksByDueDate;
  const sortedTasks = (Array.isArray(taskList) ? taskList : [])
    .filter((task) => !isTaskDeleted(task))
    .sort(sortFunction);
  return [
    ...sortedTasks.filter((task) => !task?.completed),
    ...sortedTasks.filter((task) => Boolean(task?.completed))
  ];
}

function sortTasksByDueDate(first, second) {
  const firstDueTimestamp = getDueTimestamp(first?.dueDate, first?.dueTime);
  const secondDueTimestamp = getDueTimestamp(second?.dueDate, second?.dueTime);

  if (firstDueTimestamp === null && secondDueTimestamp === null) {
    return Number(first?.createdAt || 0) - Number(second?.createdAt || 0);
  }
  if (firstDueTimestamp === null) return 1;
  if (secondDueTimestamp === null) return -1;
  if (firstDueTimestamp !== secondDueTimestamp) {
    return firstDueTimestamp - secondDueTimestamp;
  }
  return Number(first?.createdAt || 0) - Number(second?.createdAt || 0);
}

function sortTasksByTargetDate(first, second) {
  const firstTargetTimestamp = getDateTimestamp(first?.targetDate);
  const secondTargetTimestamp = getDateTimestamp(second?.targetDate);

  if (firstTargetTimestamp === null && secondTargetTimestamp === null) {
    return Number(first?.createdAt || 0) - Number(second?.createdAt || 0);
  }
  if (firstTargetTimestamp === null) return 1;
  if (secondTargetTimestamp === null) return -1;
  if (firstTargetTimestamp !== secondTargetTimestamp) {
    return firstTargetTimestamp - secondTargetTimestamp;
  }
  return Number(first?.createdAt || 0) - Number(second?.createdAt || 0);
}

function sortTasksByPriority(first, second) {
  const firstPriority = normalizePriority(first?.priority, first?.materialConsequence);
  const secondPriority = normalizePriority(second?.priority, second?.materialConsequence);
  if (firstPriority !== secondPriority) {
    if (firstPriority === 0) return 1;
    if (secondPriority === 0) return -1;
    return firstPriority - secondPriority;
  }
  return sortTasksByDueDate(first, second);
}

function normalizePriority(value, legacyConsequence) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 4) {
    return numeric;
  }
  const legacy = String(legacyConsequence || value || "").trim().toLowerCase();
  return legacy && legacy !== "0" && legacy !== "0:none" && legacy !== "none" ? 1 : 0;
}

function getDueTimestamp(dueDate, dueTime) {
  const normalizedDate = normalizeDateInput(dueDate);
  if (!normalizedDate) return null;
  const normalizedTime = normalizeTimeInput(dueTime) || "23:59";
  const timestamp = new Date(`${normalizedDate}T${normalizedTime}:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getDateTimestamp(date) {
  const normalizedDate = normalizeDateInput(date);
  if (!normalizedDate) return null;
  const timestamp = new Date(`${normalizedDate}T23:59:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function normalizeDateInput(rawValue) {
  if (!rawValue) return "";
  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalizeTimeInput(rawValue) {
  const match = String(rawValue || "").trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : "";
}
