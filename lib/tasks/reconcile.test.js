import { describe, expect, it } from "vitest";
import { createTaskSignatureMap, getTaskSyncSignature, reconcileTaskSnapshots, sanitizeTaskList } from "./reconcile";

const task = (id, title, updatedAt, extra = {}) => ({ id, title, updatedAt, createdAt: 1, ...extra });
const baseline = (items) => createTaskSignatureMap(items);

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
    expect(reconcileTaskSnapshots([task("l", "L", 2)], [task("r", "R", 2)], {} ).map((x) => x.id)).toEqual(["l", "r"]);
  });
  it("derives directional status without persisting the legacy P1 coercion", () => {
    const [directional] = sanitizeTaskList([
      task("directional-goal-task-goal-1", "Direction-linked", 2, {
        priority: 1,
        sourceGoalId: "goal-1"
      })
    ]);

    expect(directional.priority).toBe(0);
    expect(directional.sourceGoalId).toBe("goal-1");
    expect(directional.sourceType).toBe("directional-goal");
    expect(directional.tags).toEqual(["directional-goal"]);

    const reconciled = reconcileTaskSnapshots([directional], [directional], baseline([directional]));
    expect(reconciled[0].priority).toBe(0);
    expect(reconciled[0].sourceGoalId).toBe("goal-1");
  });
  it("retains rich task data and invalid input is safe", () => {
    const rich = task("a", "A", 2, { priority: 3, dueDate: "2026-08-31", dueTime: "09:30", subtasks: [{ id: "s2", title: "Two" }, { id: "s1", title: "One" }] });
    const result = reconcileTaskSnapshots([rich], [task("a", "A", 1)], baseline([task("a", "A", 1)]))[0];
    expect(result.subtasks.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(result.priority).toBe(3);
    expect(sanitizeTaskList(null)).toEqual([]);
    expect(getTaskSyncSignature(result)).toBe(getTaskSyncSignature(result));
  });
});
