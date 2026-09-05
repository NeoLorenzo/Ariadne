import { describe, expect, it } from "vitest";
import { updateLinkedTask } from "./goalTaskSync";

const goal = {
  id: "goal-1",
  title: "Ship directional work",
  description: "Stay aligned with the active direction.",
  targetDate: "2026-09-20"
};

describe("directional goal task synchronization", () => {
  it("creates a Directional task without persisting it as P1", () => {
    const [linkedTask] = updateLinkedTask([], goal, true);

    expect(linkedTask.id).toBe("directional-goal-task-goal-1");
    expect(linkedTask.priority).toBe(0);
    expect(linkedTask.sourceType).toBe("directional-goal");
    expect(linkedTask.sourceGoalId).toBe("goal-1");
    expect(linkedTask.tags).toEqual(["directional-goal"]);
  });

  it("clears the legacy forced P1 value when a linked task is refreshed", () => {
    const existing = {
      id: "directional-goal-task-goal-1",
      title: "Old title",
      priority: 1,
      sourceType: "directional-goal",
      sourceGoalId: "goal-1",
      tags: ["directional-goal"],
      completed: true,
      dueTime: "09:30",
      estimatedHours: "2",
      subtasks: [{ id: "sub-1", title: "Keep me" }],
      createdAt: 10,
      updatedAt: 10
    };

    const [linkedTask] = updateLinkedTask([existing], goal, true);

    expect(linkedTask.priority).toBe(0);
    expect(linkedTask.completed).toBe(true);
    expect(linkedTask.dueTime).toBe("09:30");
    expect(linkedTask.estimatedHours).toBe("2");
    expect(linkedTask.subtasks).toEqual(existing.subtasks);
    expect(linkedTask.sourceGoalId).toBe("goal-1");
  });
});
