import { describe, expect, it } from "vitest";
import {
  buildReconciledIssueTasks,
  getTaskGitHubIssueId
} from "./githubIssueTasks";

const issue = (overrides: Record<string, unknown> = {}) => ({
  id: 1001,
  number: 22,
  title: "Sync GitHub issues",
  body: "Implementation details",
  state: "open",
  html_url: "https://github.com/NeoLorenzo/Ariadne/issues/22",
  created_at: "2026-09-06T13:35:37Z",
  updated_at: "2026-09-06T13:35:37Z",
  closed_at: null,
  repository: {
    id: 1223499763,
    full_name: "NeoLorenzo/Ariadne"
  },
  ...overrides
});

describe("GitHub issue task reconciliation", () => {
  it("creates one GitHub-backed task for an open issue without changing native tasks", () => {
    const native = { id: "native-1", title: "Native task", priority: 2 };
    const result = buildReconciledIssueTasks([native], [issue()]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(native);
    expect(result[1]).toMatchObject({
      id: "github-issue-1001",
      sourceType: "github-issue",
      title: "Sync GitHub issues",
      description: "Implementation details",
      completed: false,
      completedAt: null,
      githubIssueId: 1001,
      githubRepositoryId: 1223499763,
      githubRepositoryFullName: "NeoLorenzo/Ariadne",
      githubIssueNumber: 22,
      githubIssueUrl: "https://github.com/NeoLorenzo/Ariadne/issues/22",
      githubIssueState: "open"
    });
  });

  it("is idempotent and does not duplicate repeated deliveries", () => {
    const first = buildReconciledIssueTasks([], [issue()]);
    const second = buildReconciledIssueTasks(first, [issue(), issue()]);

    expect(second).toHaveLength(1);
    expect(getTaskGitHubIssueId(second[0])).toBe(1001);
  });

  it("updates GitHub-owned fields while preserving Ariadne-owned metadata", () => {
    const [created] = buildReconciledIssueTasks([], [issue()]);
    const customized = {
      ...created,
      priority: 3,
      description: "Locally edited description",
      dueDate: "2026-09-10",
      estimatedHours: "2.5",
      subtasks: [{ id: "s1", title: "Local subtask", completed: false }],
      updatedAt: 123456789
    };

    const closedAt = "2026-09-06T14:59:30Z";
    const [closed] = buildReconciledIssueTasks([customized], [
      issue({
        title: "Renamed on GitHub",
        body: "Updated GitHub body",
        state: "closed",
        closed_at: closedAt,
        updated_at: "2026-09-06T15:00:00Z"
      })
    ]);

    expect(closed).toMatchObject({
      id: "github-issue-1001",
      title: "Renamed on GitHub",
      description: "Updated GitHub body",
      completed: true,
      completedAt: Date.parse(closedAt),
      githubIssueState: "closed",
      priority: 3,
      dueDate: "2026-09-10",
      estimatedHours: "2.5",
      updatedAt: 123456789
    });
    expect((closed as any).subtasks).toEqual(customized.subtasks);

    const [reopened] = buildReconciledIssueTasks([closed], [
      issue({
        title: "Renamed on GitHub",
        body: "Updated GitHub body",
        state: "open",
        updated_at: "2026-09-06T16:00:00Z"
      })
    ]);
    expect(reopened).toMatchObject({
      id: "github-issue-1001",
      completed: false,
      completedAt: null,
      githubIssueState: "open",
      priority: 3,
      description: "Updated GitHub body"
    });
  });

  it("preserves a stable completion timestamp while an issue remains closed", () => {
    const closedAt = "2026-09-06T14:59:30Z";
    const [created] = buildReconciledIssueTasks([], [issue()]);
    const [closed] = buildReconciledIssueTasks([created], [
      issue({ state: "closed", closed_at: closedAt, updated_at: "2026-09-06T15:00:00Z" })
    ]);
    const [editedWhileClosed] = buildReconciledIssueTasks([closed], [
      issue({
        state: "closed",
        closed_at: closedAt,
        title: "Edited after close",
        updated_at: "2026-09-06T18:00:00Z"
      })
    ]);

    expect((editedWhileClosed as any).completedAt).toBe(Date.parse(closedAt));
  });

  it("falls back to the GitHub issue update time when close time is unavailable", () => {
    const [created] = buildReconciledIssueTasks([], [issue()]);
    const updatedAt = "2026-09-06T15:00:00Z";
    const [closed] = buildReconciledIssueTasks([created], [
      issue({ state: "closed", closed_at: null, updated_at: updatedAt })
    ]);

    expect((closed as any).completedAt).toBe(Date.parse(updatedAt));
  });

  it("does not infer a historical timestamp for an already-closed legacy task", () => {
    const legacyClosed = {
      id: "github-issue-1001",
      sourceType: "github-issue",
      githubIssueId: 1001,
      title: "Legacy closed issue",
      description: "Legacy body",
      completed: true,
      githubIssueState: "closed",
      githubIssueUpdatedAt: Date.parse("2026-09-06T15:00:00Z")
    };

    const [reconciled] = buildReconciledIssueTasks([legacyClosed], [
      issue({ state: "closed", closed_at: null, updated_at: "2026-09-06T19:00:00Z" })
    ]);

    expect((reconciled as any).completedAt).toBeNull();
  });

  it("updates a task when only the GitHub issue body changes", () => {
    const [created] = buildReconciledIssueTasks([], [issue()]);
    const [updated] = buildReconciledIssueTasks([created], [
      issue({
        body: "Body changed on GitHub",
        updated_at: "2026-09-06T14:00:00Z"
      })
    ]);

    expect(updated).toMatchObject({
      title: "Sync GitHub issues",
      description: "Body changed on GitHub",
      completed: false,
      completedAt: null
    });
  });

  it("preserves the last synced description when GitHub redacts the body", () => {
    const [created] = buildReconciledIssueTasks([], [issue()]);
    const [updated] = buildReconciledIssueTasks([created], [
      issue({
        body: null,
        title: "Renamed while body is redacted",
        updated_at: "2026-09-06T14:30:00Z"
      })
    ]);

    expect(updated).toMatchObject({
      title: "Renamed while body is redacted",
      description: "Implementation details"
    });
  });

  it("does not import historical closed issues that were never represented in Ariadne", () => {
    const result = buildReconciledIssueTasks([], [
      issue({ state: "closed", closed_at: "2026-09-06T16:59:30Z", updated_at: "2026-09-06T17:00:00Z" })
    ]);
    expect(result).toEqual([]);
  });

  it("collapses accidental duplicate task records for the same GitHub issue", () => {
    const duplicateA = {
      id: "github-issue-1001",
      sourceType: "github-issue",
      githubIssueId: 1001,
      title: "Old A"
    };
    const duplicateB = {
      id: "legacy-copy",
      sourceType: "github-issue",
      githubIssueId: 1001,
      title: "Old B"
    };

    const result = buildReconciledIssueTasks([duplicateA, duplicateB], [issue()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "github-issue-1001",
      title: "Sync GitHub issues",
      description: "Implementation details"
    });
  });

  it("repairs stale GitHub-owned fields during a later full reconciliation", () => {
    const stale = {
      id: "github-issue-1001",
      sourceType: "github-issue",
      githubIssueId: 1001,
      githubRepositoryId: 1223499763,
      githubRepositoryFullName: "NeoLorenzo/Ariadne",
      githubIssueNumber: 22,
      githubIssueUrl: "https://github.com/NeoLorenzo/Ariadne/issues/22",
      githubIssueState: "open",
      githubIssueUpdatedAt: 1,
      title: "Stale title",
      completed: false,
      completedAt: null,
      priority: 4,
      description: "Stale description"
    };

    const closedAt = "2026-09-06T17:59:30Z";
    const [repaired] = buildReconciledIssueTasks([stale], [
      issue({
        title: "Authoritative title",
        body: "Authoritative body",
        state: "closed",
        closed_at: closedAt,
        updated_at: "2026-09-06T18:00:00Z"
      })
    ]);

    expect(repaired).toMatchObject({
      title: "Authoritative title",
      description: "Authoritative body",
      completed: true,
      completedAt: Date.parse(closedAt),
      githubIssueState: "closed",
      priority: 4
    });
  });
});
