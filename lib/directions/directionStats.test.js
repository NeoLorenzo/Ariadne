import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadStrategicObjectives: vi.fn(),
  loadOutcomeGoals: vi.fn(),
  getGoalTiming: vi.fn()
}));

vi.mock("@/lib/objectives/strategicObjectiveRepository", () => ({
  loadStrategicObjectives: mocks.loadStrategicObjectives
}));
vi.mock("@/lib/goals/outcomeGoalRepository", () => ({
  loadOutcomeGoals: mocks.loadOutcomeGoals
}));
vi.mock("@/lib/goals/goalTiming", () => ({
  getGoalTiming: mocks.getGoalTiming
}));

import { loadDirectionSummaryStats } from "./directionStats";

describe("direction summary stats", () => {
  beforeEach(() => {
    mocks.loadStrategicObjectives.mockReset();
    mocks.loadOutcomeGoals.mockReset();
    mocks.getGoalTiming.mockReset();
    mocks.getGoalTiming.mockImplementation((goal) => ({ tone: goal.overdue ? "overdue" : "on-track" }));
  });

  it("calculates progress independently for each direction rather than using a singleton root", async () => {
    mocks.loadStrategicObjectives.mockImplementation(async (directionId) => directionId === "direction-a"
      ? [
          { id: "objective-a1", status: "active" },
          { id: "objective-a2", status: "active" },
          { id: "objective-a3", status: "completed" }
        ]
      : [{ id: "objective-b1", status: "active" }]);
    mocks.loadOutcomeGoals.mockImplementation(async (objectiveId) => ({
      "objective-a1": [
        { id: "goal-a1", status: "active", overdue: true },
        { id: "goal-a2", status: "completed" }
      ],
      "objective-a2": [{ id: "goal-a3", status: "active", overdue: false }],
      "objective-b1": [{ id: "goal-b1", status: "active", overdue: true }]
    })[objectiveId] || []);

    await expect(loadDirectionSummaryStats("direction-a", "owner-1")).resolves.toEqual({
      activeObjectivesCount: 2,
      activeGoalsCount: 2,
      overdueCount: 1,
      completedCount: 1
    });
    await expect(loadDirectionSummaryStats("direction-b", "owner-1")).resolves.toEqual({
      activeObjectivesCount: 1,
      activeGoalsCount: 1,
      overdueCount: 1,
      completedCount: 0
    });

    expect(mocks.loadStrategicObjectives).toHaveBeenCalledWith("direction-a", "owner-1");
    expect(mocks.loadStrategicObjectives).toHaveBeenCalledWith("direction-b", "owner-1");
  });
});
