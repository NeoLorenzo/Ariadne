import { describe, expect, it } from "vitest";
import { orderTasksForDisplay } from "./taskOrdering";

function task(id, priority, extra = {}) {
  return { id, title: id, priority, createdAt: 1, ...extra };
}

describe("task priority ordering", () => {
  it("orders Directional before P1 through P4 and no priority", () => {
    const tasks = [
      task("none", 0),
      task("p4", 4),
      task("p2", 2),
      task("directional", 0, { sourceGoalId: "goal-1" }),
      task("p1", 1),
      task("p3", 3)
    ];

    expect(orderTasksForDisplay(tasks, "priority").map((item) => item.id)).toEqual([
      "directional",
      "p1",
      "p2",
      "p3",
      "p4",
      "none"
    ]);
  });

  it("keeps due-date tie-breaking inside the directional group", () => {
    const tasks = [
      task("later", 0, { sourceGoalId: "goal-2", dueDate: "2026-09-10" }),
      task("earlier", 0, { sourceGoalId: "goal-1", dueDate: "2026-09-08" })
    ];

    expect(orderTasksForDisplay(tasks, "priority").map((item) => item.id)).toEqual([
      "earlier",
      "later"
    ]);
  });
});
