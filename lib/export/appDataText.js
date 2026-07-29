import { loadDirectionState } from "@/lib/directions/directionRepository";
import {
  calculateGoalProgress,
  loadOutcomeGoalRevisions,
  loadOutcomeGoals
} from "@/lib/goals/outcomeGoalRepository";
import { loadStrategicObjectives } from "@/lib/objectives/strategicObjectiveRepository";
import { supabase } from "@/lib/supabase/client";
import {
  orderTasksForDisplay,
  readSavedTaskSortMode
} from "@/lib/tasks/taskOrdering";

const TASK_STORAGE_KEY = "fabbro_tasks_v1";

export async function buildFullAppDataText({
  userId,
  projects,
  noticeBoardItems,
  signals
}) {
  const [directionState, tasks] = await Promise.all([
    loadDirectionState(userId),
    loadTasksForExport(userId)
  ]);
  const objectives = await loadStrategicObjectives(directionState.direction?.id, userId);
  const goalEntries = await Promise.all(
    objectives.map(async (objective) => [
      objective.id,
      await loadOutcomeGoals(objective.id, userId)
    ])
  );
  const goalsByObjectiveId = Object.fromEntries(goalEntries);
  const goalRevisionsByGoalId = Object.fromEntries(
    await Promise.all(
      goalEntries
        .flatMap(([, goals]) => goals)
        .map(async (goal) => [
          goal.id,
          await loadOutcomeGoalRevisions(goal.id, userId)
        ])
    )
  );

  return [
    "# Fabbro Factory — Full App Data",
    "",
    `*Exported: ${new Date().toLocaleString("en-GB")}*`,
    "",
    formatStrategyHierarchyContext(),
    "",
    formatDirection(directionState),
    "",
    formatObjectives(objectives, goalsByObjectiveId, goalRevisionsByGoalId),
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
    "### Direction",
    "",
    "The current direction is intentionally broad. It points towards the general direction of travel and describes where I want to move overall. It is not a goal, does not need to be directly actionable, and should not be interpreted as a concrete commitment or measurable outcome.",
    "",
    "### Strategic Objectives",
    "",
    "Strategic objectives make the direction more specific and actionable, and each objective must meaningfully serve the current direction. They should not contain metrics or detailed targets; measurement is reserved for outcome goals.",
    "",
    "I am limited to three active strategic objectives. This constraint protects depth and sustained focus because I have a tendency to prioritise breadth over depth. Consequently, every strategic objective represents an important and meaningful priority rather than one item in a broad collection of interests.",
    "",
    "### Outcome Goals",
    "",
    "The goals beneath each strategic objective should be fully actionable and measurable, with a defined start date and target/end date. Each goal should be concrete enough to break down into executable tasks, which belong in the task manager.",
    "",
    "Goals may change when circumstances or understanding change. However, repeated changes to the same goal should be treated as a warning that the goal may be poorly defined, unstable, unrealistic, or insufficiently aligned with its strategic objective.",
    "",
    "### Good-Faith Interpretation",
    "",
    "These are private personal goals and should be evaluated under a good-faith assumption. Do not focus on technical loopholes, edge cases, or ways the metrics could be gamed unless there is evidence that ambiguity is causing real execution problems. Assess goals primarily on alignment, realism, clarity, sustainability, and usefulness—not on whether their wording is resistant to deliberate cheating.",
    "",
    "### Tasks",
    "",
    "Tasks are the concrete execution layer. They should break outcome goals into manageable actions and deliverables that can be completed through the task manager."
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

function formatDirection({ direction, revisions }) {
  const safeDirection = direction || {};
  const lines = [
    "## Current Direction",
    "",
    field("Title", safeDirection.title),
    field("Statement", safeDirection.statement),
    field("Status", safeDirection.isActive === false ? "Inactive" : "Active"),
    field("Created", formatDateTime(safeDirection.createdAt)),
    field("Updated", formatDateTime(safeDirection.updatedAt))
  ];

  if (!Array.isArray(revisions) || revisions.length === 0) {
    return lines.join("\n");
  }

  lines.push("", "### Direction History", "");
  revisions.forEach((revision, index) => {
    lines.push(
      `#### ${index + 1}. ${valueOrDash(revision.title)}`,
      "",
      field("Statement", revision.statement),
      field("Reason for change", revision.changeReason || "No reason recorded"),
      field("Changed", formatDateTime(revision.createdAt)),
      ""
    );
  });
  return lines.join("\n");
}

function formatObjectives(objectives, goalsByObjectiveId, goalRevisionsByGoalId) {
  const orderedObjectives = [...safeArray(objectives)].sort(
    (left, right) => Number(left.position || 0) - Number(right.position || 0)
  );
  const lines = ["## Strategic Objectives and Outcome Goals", ""];

  if (!orderedObjectives.length) {
    lines.push("- No strategic objectives saved.");
    return lines.join("\n");
  }

  orderedObjectives.forEach((objective, objectiveIndex) => {
    const goals = [...safeArray(goalsByObjectiveId?.[objective.id])].sort(
      (left, right) => Number(left.position || 0) - Number(right.position || 0)
    );
    lines.push(
      `### ${objectiveIndex + 1}. ${valueOrDash(objective.title)}`,
      "",
      field("Status", String(objective.status || "unknown").toUpperCase()),
      field("Description", objective.description),
      field("Success condition", objective.successCondition),
      field("Created", formatDateTime(objective.createdAt)),
      field("Updated", formatDateTime(objective.updatedAt)),
      "",
      "#### Outcome Goals",
      ""
    );

    if (!goals.length) {
      lines.push("- None saved.", "");
      return;
    }

    goals.forEach((goal, goalIndex) => {
      const revisions = safeArray(goalRevisionsByGoalId?.[goal.id]);
      lines.push(
        `##### Goal ${goalIndex + 1}: ${valueOrDash(goal.title)}`,
        "",
        field("Status", String(goal.status || "unknown").toUpperCase()),
        field("Description", goal.description),
        field("Measure", "Count"),
        field("Current", goal.currentValue),
        field("Target", goal.targetValue),
        field("Bare minimum", goal.bareMinimum),
        field("Displayed on todo list", goal.displayOnTodoList ? "Yes" : "No"),
        field("Progress", `${Math.round(calculateGoalProgress(goal))}%`),
        field("Start date", goal.startDate),
        field("Target date", goal.targetDate),
        field("Created", formatDateTime(goal.createdAt)),
        field("Updated", formatDateTime(goal.updatedAt))
      );

      if (!revisions.length) {
        lines.push("");
        return;
      }

      lines.push("", "**Revision history**", "");
      revisions.forEach((revision, revisionIndex) => {
        lines.push(
          `${revisionIndex + 1}. **Previous title:** ${valueOrDash(revision.previousTitle)}`,
          indent(field("Previous metric type", revision.previousMetricType)),
          indent(field("Previous target", revision.previousTargetValue)),
          indent(field("Previous bare minimum", revision.previousBareMinimum)),
          indent(field("Previous start date", revision.previousStartDate)),
          indent(field("Previous target date", revision.previousTargetDate)),
          indent(field("Reason for change", revision.changeReason)),
          indent(field("Changed", formatDateTime(revision.createdAt))),
          ""
        );
      });
    });
  });
  return lines.join("\n");
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
  if (project?.isArchived) {
    return "Archived";
  }

  if (String(project?.completionStatus || "").trim().toLowerCase() === "completed") {
    return "Completed";
  }

  const repoStatus = String(project?.repoStatusTag || "").trim().toLowerCase();
  if (repoStatus === "paused") {
    return "Paused";
  }
  if (repoStatus === "maintained") {
    return "Maintained";
  }
  if (repoStatus === "not-started") {
    return "Not started";
  }
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
    "### Lorenzo Roque Substack",
    "",
    field("Latest post", formatDateTime(signals?.substackLatestPostTimestamp)),
    field("Days since post", signals?.substackDaysSinceLastPublication),
    "",
    "### ProtoLorenzo",
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

  safeTasks.forEach((task) => {
    const subtasks = safeArray(task.subtasks);
    const taskFields = [];
    const description = String(task.description || "").trim();

    if (description) {
      taskFields.push(field("Description", description));
    }

    if (!task.completed) {
      const priority = isDirectionalGoalTask(task)
        ? 1
        : normalizeTaskPriority(task.priority, task.materialConsequence);
      if (String(task.dueDate || "").trim()) {
        taskFields.push(field("Due date", task.dueDate));
      }
      if (String(task.dueTime || "").trim()) {
        taskFields.push(field("Due time", task.dueTime));
      }
      if (priority > 0) {
        taskFields.push(field("Priority", priority));
      }
      if (String(task.estimatedHours ?? "").trim()) {
        taskFields.push(field("Estimated hours", task.estimatedHours));
      }
    }

    taskFields.push(
      field("Connected to directional goal", isDirectionalGoalTask(task) ? "Yes" : "No"),
      field("Created", formatDateTime(task.createdAt)),
      field("Updated", formatDateTime(task.updatedAt))
    );

    lines.push(
      `- [${task.completed ? "x" : " "}] **${valueOrDash(task.title)}**`,
      ...taskFields.map((taskField) => indent(taskField))
    );

    if (!subtasks.length) {
      lines.push("");
      return;
    }

    lines.push(indent("- **Subtasks:**"));
    subtasks.forEach((subtask) => {
      lines.push(
        indent(`- [${subtask.completed ? "x" : " "}] ${valueOrDash(subtask.title)}`),
        indent(field("Description", subtask.description), 2)
      );
    });
    lines.push("");
  });
  return lines.join("\n");
}

function formatDateTime(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const numericValue = Number(value);
  const date = new Date(Number.isFinite(numericValue) && String(value).trim() !== "" ? numericValue : value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("en-GB");
}

function formatDayCount(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }
  const count = Number(value);
  return `${count} day${count === 1 ? "" : "s"}`;
}

function field(label, value) {
  return `- **${label}:** ${valueOrDash(value).replace(/\r?\n/g, "\n  ")}`;
}

function valueOrDash(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "-";
  }
  return String(value);
}

function indent(value, level = 1) {
  return `${"    ".repeat(level)}${value}`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTaskPriority(value, legacyConsequence) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 4) {
    return numeric;
  }
  const legacy = String(legacyConsequence || value || "").trim().toLowerCase();
  return legacy && legacy !== "0" && legacy !== "0:none" && legacy !== "none" ? 1 : 0;
}

function isDirectionalGoalTask(task) {
  return Boolean(task?.sourceGoalId)
    || String(task?.id || "").startsWith("directional-goal-task-");
}
