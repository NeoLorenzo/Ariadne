import { describe, expect, it } from "vitest";
import { orderTasksForDisplay } from "./taskOrdering";

function task(id, priority, extra = {}) {
  return { id, title: id, priority, createdAt: 1, ...extra };
}

describe("task priority ordering", () => {
  it("orders P1 through P4 before no-priority tasks", () => {
    const tasks = [
      task("none", 0),
      task("p4", 4),
      task("p2", 2),
      task("p1", 1),
      task("p3", 3)
    ];

    expect(orderTasksForDisplay(tasks, "priority").map((item) => item.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "none"
    ]);
  });

  it("does not give legacy directional metadata special ordering", () => {
    const tasks = [
      task("legacy-directional", 0, { sourceGoalId: "goal-1", sourceType: "directional-goal" }),
      task("p1", 1),
      task("p2", 2)
    ];

    expect(orderTasksForDisplay(tasks, "priority").map((item) => item.id)).toEqual([
      "p1",
      "p2",
      "legacy-directional"
    ]);
  });

  it("uses due date as the tie-break inside the same numeric priority", () => {
    const tasks = [
      task("later", 2, { dueDate: "2026-09-10" }),
      task("earlier", 2, { dueDate: "2026-09-08" })
    ];

    expect(orderTasksForDisplay(tasks, "priority").map((item) => item.id)).toEqual([
      "earlier",
      "later"
    ]);
  });
});
