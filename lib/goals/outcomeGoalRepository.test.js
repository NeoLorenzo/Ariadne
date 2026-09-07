import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { from: cloud.from, rpc: cloud.rpc } }));

import {
  loadOutcomeGoalRevisions,
  loadOutcomeGoals,
  reorderOutcomeGoals,
  saveOutcomeGoal
} from "./outcomeGoalRepository";

function installBrowserState({ goals = [], revisions = [], tasks = [] } = {}) {
  const values = new Map([
    ["fabbro_outcome_goals_v1", JSON.stringify(goals)],
    ["fabbro_outcome_goal_revisions_v1", JSON.stringify(revisions)],
    ["fabbro_tasks_v1", JSON.stringify(tasks)]
  ]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    },
    dispatchEvent: vi.fn()
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  return values;
}

const goalA = {
  id: "goal-a", strategicObjectiveId: "objective-1", title: "A", description: "",
  metricType: "count", currentValue: 1, targetValue: 10, bareMinimum: 5, displayOnTodoList: false,
  startDate: "2026-09-01", targetDate: "2026-10-01", status: "active", position: 0,
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-06T09:00:00.000Z"
};
const goalB = { ...goalA, id: "goal-b", title: "B", position: 1 };

describe("outcome goal reconciliation", () => {
  beforeEach(() => {
    installBrowserState();
    cloud.from.mockReset();
    cloud.rpc.mockReset();
  });

  it("keeps a newly created displayed goal and linked task locally when the transactional cloud write fails", async () => {
    const values = installBrowserState();
    cloud.rpc.mockResolvedValue({ data: null, error: new Error("offline") });

    await expect(saveOutcomeGoal({
      goals: [],
      goal: { ...goalA, id: "", title: "Local goal", displayOnTodoList: true },
      objectiveId: "objective-1",
      userId: "owner-1",
      revisionReason: ""
    })).rejects.toThrow("STRATEGY_SYNC_PENDING");

    const goals = JSON.parse(values.get("fabbro_outcome_goals_v1"));
    const tasks = JSON.parse(values.get("fabbro_tasks_v1"));
    expect(goals).toEqual([expect.objectContaining({ title: "Local goal", displayOnTodoList: true })]);
    expect(tasks).toEqual([expect.objectContaining({ sourceGoalId: goals[0].id, deleted: false })]);

    await expect(loadOutcomeGoals("objective-1", "owner-1")).resolves.toEqual(goals);
    expect(cloud.from).not.toHaveBeenCalled();
  });

  it("applies goal reorder as one RPC with per-row optimistic baselines", async () => {
    installBrowserState({ goals: [goalA, goalB] });
    cloud.rpc.mockResolvedValue({
      data: [
        { id: "goal-b", position: 0, updated_at: "2026-09-06T09:10:00.000Z" },
        { id: "goal-a", position: 1, updated_at: "2026-09-06T09:10:00.000Z" }
      ],
      error: null
    });

    const next = await reorderOutcomeGoals({
      goals: [goalA, goalB], goalId: "goal-b", offset: -1,
      objectiveId: "objective-1", userId: "owner-1"
    });

    expect(next.find((goal) => goal.id === "goal-b").position).toBe(0);
    expect(cloud.rpc).toHaveBeenCalledTimes(1);
    expect(cloud.rpc).toHaveBeenCalledWith("reorder_outcome_goals_semantic", {
      objective_id: "objective-1",
      positions: { "goal-b": 0, "goal-a": 1 },
      expected_updated_at_by_id: {
        "goal-b": goalB.updatedAt,
        "goal-a": goalA.updatedAt
      }
    });
    expect(cloud.from).not.toHaveBeenCalled();
  });

  it("retains a conflicted goal edit and its local revision on later goal/history loads", async () => {
    const values = installBrowserState({ goals: [goalA] });
    cloud.rpc.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("STRATEGY_SYNC_CONFLICT"), {
        code: "40001",
        details: JSON.stringify({ entity_id: "goal-a", updated_at: "2026-09-06T09:30:00.000Z" })
      })
    });

    await expect(saveOutcomeGoal({
      goals: [goalA], goal: { ...goalA, targetValue: 20 }, objectiveId: "objective-1",
      userId: "owner-1", revisionReason: "Raised target"
    })).rejects.toThrow("STRATEGY_SYNC_CONFLICT");

    const localGoals = JSON.parse(values.get("fabbro_outcome_goals_v1"));
    const localRevisions = JSON.parse(values.get("fabbro_outcome_goal_revisions_v1"));
    expect(localGoals[0].targetValue).toBe(20);
    expect(localRevisions).toEqual([expect.objectContaining({ outcomeGoalId: "goal-a", previousTargetValue: 10 })]);

    await expect(loadOutcomeGoals("objective-1", "owner-1")).resolves.toEqual(localGoals);
    await expect(loadOutcomeGoalRevisions("goal-a", "owner-1")).resolves.toEqual(localRevisions);
    expect(cloud.from).not.toHaveBeenCalled();
  });
});
