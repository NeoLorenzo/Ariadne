import { loadDirectionsState } from "@/lib/directions/directionRepository";
import { loadStrategicObjectives } from "@/lib/objectives/strategicObjectiveRepository";
import { supabase } from "@/lib/supabase/client";
import {
  orderTasksForDisplay,
  readSavedTaskSortMode
} from "@/lib/tasks/taskOrdering";
import { getVectorLabel } from "@/lib/vectors/vectorVocabulary";

const TASK_STORAGE_KEY = "fabbro_tasks_v1";

export async function buildFullAppDataText({
  userId,
  projects,
  noticeBoardItems,
  signals
}) {
  const [directionState, tasks] = await Promise.all([
    loadDirectionsState(userId),
    loadTasksForExport(userId)
  ]);

  const objectiveEntriesByDirection = await Promise.all(
    directionState.directions.map(async (direction) => [
      direction.id,
      await loadStrategicObjectives(direction.id, userId)
    ])
  );
  const objectivesByDirectionId = Object.fromEntries(objectiveEntriesByDirection);

  return [
    "# Ariadne — Full App Data",
    "",
    `*Exported: ${new Date().toLocaleString("en-GB")}*`,
    "",
    formatStrategyHierarchyContext(),
    "",
    formatDirections(directionState, objectivesByDirectionId),
    "",
    formatProjects(projects),
    "",
    formatNoticeBoard(noticeBoardItems),
    "",
    formatSignals(signals),
    "",
    formatTasks(tasks)
  ].join("\n");
}

function formatStrategyHierarchyContext() {
  return [
    "## How to Interpret the Strategy Hierarchy",
    "",
    "### Eight-dimensional navigation",
    "",
    "Ariadne represents desired movement through eight canonical dimensions: Physical, Psychological, Intellectual, Professional, Financial, Relational, Creative, and Experiential. Several directions may be active at the same time, and each direction may influence one or several dimensions. Vector membership is categorical in this version; it is not a numeric magnitude, weight, score, or target.",
    "",
    "### Directions",
    "",
    "Directions are broad trajectories of desired movement. A direction is not itself a task and may overlap dimensions with other active directions.",
    "",
    "### Strategic Objectives",
    "",
    "Strategic objectives decompose a direction into the major changes required to advance it. Each objective belongs to exactly one direction. Strategic objectives are the lowest-level persistent strategy entity.",
    "",
    "### Tasks",
    "",
    "Tasks are the concrete execution layer. Ari Bot can infer how tasks contribute to enabled directions and active strategic objectives and use that strategic relevance, together with urgency, leverage, obligations, and actionability, when assigning numeric priority."
  ].join("\n");
}

export async function copyTextToClipboard(text) {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard access is unavailable.");
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  const didCopy = document.execCommand("copy");
  textArea.remove();

  if (!didCopy) {
    throw new Error("The browser denied clipboard access.");
  }
}

async function loadTasksForExport(userId) {
  const localSnapshot = readLocalTaskSnapshot();
  if (localSnapshot.exists) {
    return localSnapshot.tasks;
  }

  if (!supabase || !userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_tasks")
    .select("tasks")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return [];
  }
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

function readLocalTaskSnapshot() {
  if (typeof window === "undefined") {
    return { exists: false, tasks: [] };
  }

  try {
    const raw = window.localStorage.getItem(TASK_STORAGE_KEY);
    if (raw === null) {
      return { exists: false, tasks: [] };
    }
    const parsed = JSON.parse(raw);
    return { exists: true, tasks: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { exists: false, tasks: [] };
  }
}

export function formatDirections(
  { directions, revisionsByDirectionId },
  objectivesByDirectionId = {}
) {
  const orderedDirections = [...safeArray(directions)].sort(compareDirectionsForExport);
  const lines = ["## Directions", ""];
  if (!orderedDirections.length) {
    lines.push("- No directions set.");
    return lines.join("\n");
  }

  orderedDirections.forEach((direction, index) => {
    lines.push(
      formatDirectionSection({
        direction,
        revisions: safeArray(revisionsByDirectionId?.[direction.id]),
        index,
        headingLevel: 3
      }),
      "",
      formatObjectives(safeArray(objectivesByDirectionId?.[direction.id]), { headingLevel: 4 }),
      ""
    );
  });

  return lines.join("\n").trimEnd();
}

export function formatDirection({ direction, revisions }) {
  if (!direction) {
    return ["## Direction", "", "- No direction set."].join("\n");
  }
  return formatDirectionSection({ direction, revisions: safeArray(revisions), headingLevel: 2 });
}

function formatDirectionSection({ direction, revisions, index = null, headingLevel }) {
  const vectorLabels = safeArray(direction.vectorIds).map(getVectorLabel);
  const titlePrefix = Number.isInteger(index) ? `${index + 1}. ` : "";
  const lines = [
    heading(headingLevel, `${titlePrefix}${valueOrDash(direction.title)}`),
    "",
    field("Statement", direction.statement),
    field("Status", capitalize(direction.status || (direction.isActive === false ? "paused" : "active"))),
    field("Vectors", vectorLabels.length ? vectorLabels.join(" · ") : "Unclassified"),
    field("Created", formatDateTime(direction.createdAt)),
    field("Updated", formatDateTime(direction.updatedAt))
  ];

  if (!revisions.length) return lines.join("\n");

  lines.push("", heading(Math.min(6, headingLevel + 1), "Direction History"), "");
  revisions.forEach((revision, revisionIndex) => {
    const revisionVectors = revision.vectorIds === null || revision.vectorIds === undefined
      ? null
      : safeArray(revision.vectorIds).map(getVectorLabel);
    lines.push(
      `${revisionIndex + 1}. **${valueOrDash(revision.title)}**`,
      indent(field("Statement", revision.statement)),
      ...(revisionVectors === null
        ? []
        : [indent(field("Vectors", revisionVectors.length ? revisionVectors.join(" · ") : "Unclassified"))]),
      indent(field("Reason for change", revision.changeReason || "No reason recorded")),
      indent(field("Changed", formatDateTime(revision.createdAt))),
      ""
    );
  });
  return lines.join("\n").trimEnd();
}

function formatObjectives(objectives, options = {}) {
  const headingLevel = Number(options.headingLevel || 2);
  const orderedObjectives = [...safeArray(objectives)].sort(
    (left, right) => Number(left.position || 0) - Number(right.position || 0)
  );
  const lines = [heading(headingLevel, "Strategic Objectives"), ""];

  if (!orderedObjectives.length) {
    lines.push("- No strategic objectives saved.");
    return lines.join("\n");
  }

  orderedObjectives.forEach((objective, objectiveIndex) => {
    lines.push(
      heading(Math.min(6, headingLevel + 1), `${objectiveIndex + 1}. ${valueOrDash(objective.title)}`),
      "",
      field("Status", capitalize(objective.status || "unknown")),
      field("Description", objective.description),
      field("Success condition", objective.successCondition),
      field("Created", formatDateTime(objective.createdAt)),
      field("Updated", formatDateTime(objective.updatedAt)),
      ""
    );
  });

  return lines.join("\n").trimEnd();
}

function formatProjects(projects) {
  const lines = ["## Coding Projects", ""];
  const safeProjects = safeArray(projects);
  if (!safeProjects.length) {
    lines.push("- No projects saved.");
    return lines.join("\n");
  }

  safeProjects.forEach((project, index) => {
    lines.push(
      `### ${index + 1}. ${valueOrDash(project.title)}`,
      "",
      field("Description", project.desc),
      field("Repository", project.repoUrl),
      field("Status", getProjectExportStatus(project)),
      field("Last commit", formatDateTime(project.lastCommitAt)),
      field("Created", formatDateTime(project.createdAt)),
      ""
    );
  });
  return lines.join("\n");
}

function getProjectExportStatus(project) {
  if (project?.isArchived) return "Archived";
  if (String(project?.completionStatus || "").trim().toLowerCase() === "completed") return "Completed";
  const repoStatus = String(project?.repoStatusTag || "").trim().toLowerCase();
  if (repoStatus === "paused") return "Paused";
  if (repoStatus === "maintained") return "Maintained";
  if (repoStatus === "not-started") return "Not started";
  return "Active";
}

function formatNoticeBoard(noticeBoardItems) {
  const lines = ["## Notice Board", ""];
  const notices = safeArray(noticeBoardItems);
  if (!notices.length) {
    lines.push("- No current notices.");
    return lines.join("\n");
  }

  notices.forEach((notice, index) => {
    const severity = String(notice.severity || notice.title || "notice").toUpperCase();
    lines.push(`${index + 1}. [${severity}] - ${valueOrDash(notice.text)}`);
  });
  return lines.join("\n");
}

function formatSignals(signals) {
  return [
    "## Signals",
    "",
    "### Substack",
    "",
    field("Latest post", formatDateTime(signals?.substackLatestPostTimestamp)),
    field("Days since post", signals?.substackDaysSinceLastPublication),
    "",
    "### Video journal",
    "",
    field("Latest scheduled", signals?.protoLorenzoLatestScheduledDate),
    field("Backlog", formatDayCount(signals?.protoLorenzoVideoBacklogDays))
  ].join("\n");
}

function formatTasks(tasks) {
  const lines = ["## Full Todo List", ""];
  const safeTasks = orderTasksForDisplay(tasks, readSavedTaskSortMode());
  if (!safeTasks.length) {
    lines.push("- No tasks saved.");
    return lines.join("\n");
  }

  safeTasks.forEach((task, index) => {
    const subtasks = safeArray(task.subtasks);
    const state = task.completed ? "Completed" : "Open";
    lines.push(
      `### ${index + 1}. ${valueOrDash(task.title)}`,
      "",
      field("State", state),
      field("Priority", normalizePriority(task.priority)),
      field("Due date", task.dueDate),
      field("Due time", task.dueTime),
      field("Estimated hours", task.estimatedHours),
      field("Description", task.description)
    );

    if (task.githubRepositoryFullName) {
      lines.push(field("Repository", task.githubRepositoryFullName));
    }
    if (task.githubIssueNumber) {
      lines.push(field("GitHub issue", `#${task.githubIssueNumber}`));
    }

    if (subtasks.length) {
      lines.push("", "**Subtasks**", "");
      subtasks.forEach((subtask) => {
        lines.push(`- [${subtask.completed ? "x" : " "}] ${valueOrDash(subtask.title)}`);
      });
    }
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

function compareDirectionsForExport(left, right) {
  const positionDifference = Number(left?.position || 0) - Number(right?.position || 0);
  if (positionDifference) return positionDifference;
  return String(left?.createdAt || "").localeCompare(String(right?.createdAt || ""));
}

function normalizePriority(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 4 ? numeric : 0;
}

function heading(level, text) {
  return `${"#".repeat(Math.max(1, Math.min(6, level)))} ${text}`;
}

function field(label, value) {
  return `- **${label}:** ${valueOrDash(value)}`;
}

function valueOrDash(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  return String(value);
}

function indent(value, depth = 1) {
  return `${"  ".repeat(depth)}${value}`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function capitalize(value) {
  const normalized = String(value || "");
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "—";
}

function formatDateTime(value) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== ""
    ? new Date(numeric)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return valueOrDash(value);
  return date.toISOString();
}

function formatDayCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric} day${Math.abs(numeric) === 1 ? "" : "s"}`;
}
