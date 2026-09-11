import { describe, expect, it } from "vitest";
import {
  applyCompletionTransition,
  createTaskSignatureMap,
  getTaskSyncSignature,
  isGitHubIssueTask,
  isLegacyDirectionalTask,
  reconcileTaskSnapshots,
  sanitizeTaskList
} from "./reconcile";

const task = (id, title, updatedAt, extra = {}) => ({ id, title, updatedAt, createdAt: 1, ...extra });
const baseline = (items) => createTaskSignatureMap(items);
const githubTask = (extra = {}) => ({
  id: "github-issue-1001",
  title: "Canonical title",
  completed: false,
  completedAt: null,
  priority: 1,
  description: "Canonical body",
  updatedAt: 10,
  createdAt: 1,
  sourceType: "github-issue",
  githubIssueId: 1001,
  githubRepositoryId: 1223499763,
  githubRepositoryFullName: "NeoLorenzo/Ariadne",
  githubIssueNumber: 22,
  githubIssueUrl: "https://github.com/NeoLorenzo/Ariadne/issues/22",
  githubIssueState: "open",
  githubIssueUpdatedAt: 100,
  ...extra
});

describe("task synchronization reconciliation", () => {
  it("keeps independent local and remote edits", () => {
    const b = [task("a", "A", 1), task("b", "B", 1)];
    expect(reconcileTaskSnapshots([task("a", "local", 2), b[1]], [b[0], task("b", "remote", 3)], baseline(b)).map((x) => [x.id, x.title])).toEqual([["a", "local"], ["b", "remote"]]);
  });

  it("accepts one-sided edits", () => {
    const b = [task("a", "A", 1)];
    expect(reconcileTaskSnapshots(b, [task("a", "remote", 2)], baseline(b))[0].title).toBe("remote");
    expect(reconcileTaskSnapshots([task("a", "local", 2)], b, baseline(b))[0].title).toBe("local");
  });

  it("uses updatedAt and remote on an exact tie", () => {
    const b = [task("a", "A", 1)];
    expect(reconcileTaskSnapshots([task("a", "local", 3)], [task("a", "remote", 2)], baseline(b))[0].title).toBe("local");
    expect(reconcileTaskSnapshots([task("a", "local", 3)], [task("a", "remote", 3)], baseline(b))[0].title).toBe("remote");
  });

  it("preserves tombstones and additions", () => {
    const b = [task("a", "A", 1)];
    const tombstone = task("a", "A", 2, { deleted: true, deletedAt: 2 });
    expect(reconcileTaskSnapshots([tombstone], b, baseline(b))[0].deleted).toBe(true);
    expect(reconcileTaskSnapshots([task("l", "L", 2)], [task("r", "R", 2)], {}).map((x) => x.id)).toEqual(["l", "r"]);
  });

  it("converts legacy directional-goal tasks into ordinary numeric-priority tasks", () => {
    const legacy = task("directional-goal-task-goal-1", "Direction-linked", 2, {
      priority: 2,
      sourceGoalId: "goal-1",
      sourceType: "directional-goal",
      tags: ["directional-goal", "keep-me"]
    });

    expect(isLegacyDirectionalTask(legacy)).toBe(true);
    const [normalized] = sanitizeTaskList([legacy]);

    expect(normalized).toMatchObject({
      id: "task-goal-1",
      title: "Direction-linked",
      priority: 2,
      sourceGoalId: "",
      sourceType: "",
      tags: ["keep-me"]
    });
    expect(normalized.id).not.toContain("directional-goal-task-");

    const reconciled = reconcileTaskSnapshots([legacy], [legacy], baseline([legacy]));
    expect(reconciled[0]).toMatchObject({
      id: "task-goal-1",
      sourceGoalId: "",
      sourceType: "",
      priority: 2
    });
  });

  it("normalizes legacy completion metadata without inventing historical timestamps", () => {
    const [normalized] = sanitizeTaskList([task("a", "Legacy complete", 999, {
      completed: true,
      subtasks: [{
        id: "s1",
        title: "Legacy subtask",
        completed: true,
        createdAt: 2,
        updatedAt: 888
      }]
    })]);

    expect(normalized.completedAt).toBeNull();
    expect(normalized.subtasks[0].completedAt).toBeNull();
  });

  it("sets, preserves, and clears completion timestamps on explicit transitions", () => {
    const incomplete = task("a", "A", 1, { completed: false, completedAt: null });
    const completed = applyCompletionTransition(incomplete, true, 1000);
    expect(completed).toMatchObject({ completed: true, completedAt: 1000, updatedAt: 1000 });

    const editedWhileComplete = applyCompletionTransition(completed, true, 2000);
    expect(editedWhileComplete).toMatchObject({ completed: true, completedAt: 1000, updatedAt: 2000 });

    const reopened = applyCompletionTransition(editedWhileComplete, false, 3000);
    expect(reopened).toMatchObject({ completed: false, completedAt: null, updatedAt: 3000 });
  });

  it("retains rich task data and invalid input is safe", () => {
    const rich = task("a", "A", 2, {
      priority: 3,
      dueDate: "2026-08-31",
      dueTime: "09:30",
      tags: ["research"],
      subtasks: [{ id: "s2", title: "Two" }, { id: "s1", title: "One" }]
    });
    const result = reconcileTaskSnapshots([rich], [task("a", "A", 1)], baseline([task("a", "A", 1)]))[0];
    expect(result.subtasks.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(result.priority).toBe(3);
    expect(result.tags).toEqual(["research"]);
    expect(sanitizeTaskList(null)).toEqual([]);
    expect(getTaskSyncSignature(result)).toBe(getTaskSyncSignature(result));
  });

  it("preserves bounded GitHub issue provenance through sanitization", () => {
    const [result] = sanitizeTaskList([githubTask({ tags: ["keep-me"], deleted: true, deletedAt: 999 })]);
    expect(isGitHubIssueTask(result)).toBe(true);
    expect(result).toMatchObject({
      id: "github-issue-1001",
      sourceType: "github-issue",
      sourceGoalId: "",
      githubIssueId: 1001,
      githubRepositoryId: 1223499763,
      githubRepositoryFullName: "NeoLorenzo/Ariadne",
      githubIssueNumber: 22,
      githubIssueUrl: "https://github.com/NeoLorenzo/Ariadne/issues/22",
      githubIssueState: "open",
      githubIssueUpdatedAt: 100,
      completedAt: null,
      deleted: false,
      deletedAt: 0,
      tags: ["keep-me"]
    });
  });

  it("accepts newer GitHub title/state/body while preserving newer Ariadne execution metadata", () => {
    const base = githubTask({
      title: "Old GitHub title",
      priority: 1,
      description: "Old GitHub body",
      updatedAt: 10,
      githubIssueUpdatedAt: 100
    });
    const local = githubTask({
      title: "Old GitHub title",
      priority: 4,
      description: "Locally edited body",
      dueDate: "2026-09-10",
      updatedAt: 300,
      githubIssueUpdatedAt: 100
    });
    const remote = githubTask({
      title: "Renamed on GitHub",
      completed: true,
      completedAt: 350,
      githubIssueState: "closed",
      priority: 1,
      description: "Updated GitHub body",
      updatedAt: 10,
      githubIssueUpdatedAt: 400
    });

    const [result] = reconcileTaskSnapshots([local], [remote], baseline([base]));
    expect(result).toMatchObject({
      title: "Renamed on GitHub",
      description: "Updated GitHub body",
      completed: true,
      completedAt: 350,
      githubIssueState: "closed",
      githubIssueUpdatedAt: 400,
      priority: 4,
      dueDate: "2026-09-10",
      updatedAt: 300
    });
  });

  it("rejects local GitHub-owned field divergence when the GitHub revision is unchanged", () => {
    const base = githubTask();
    const local = githubTask({
      title: "Locally renamed incorrectly",
      description: "Locally edited description",
      completed: true,
      completedAt: 500,
      githubIssueState: "closed",
      priority: 3,
      updatedAt: 500,
      githubIssueUpdatedAt: 100
    });
    const remote = githubTask({
      title: "Canonical title",
      description: "Canonical body",
      completed: false,
      completedAt: null,
      githubIssueState: "open",
      priority: 1,
      updatedAt: 10,
      githubIssueUpdatedAt: 100
    });

    const [result] = reconcileTaskSnapshots([local], [remote], baseline([base]));
    expect(result).toMatchObject({
      title: "Canonical title",
      description: "Canonical body",
      completed: false,
      completedAt: null,
      githubIssueState: "open",
      priority: 3,
      updatedAt: 500
    });
  });
});
