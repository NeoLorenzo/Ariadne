import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), events: [] }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { rpc: state.rpc, from: state.from }
}));

import { updateDirection } from "./directions/directionRepository";
import { deleteOutcomeGoal, saveOutcomeGoal } from "./goals/outcomeGoalRepository";
import { linkedTaskId, updateLinkedTask } from "./tasks/goalTaskSync";

function installBrowserState() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    },
    dispatchEvent: (event) => state.events.push(event)
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  return values;
}

const baseGoal = {
  id: "goal-1", strategicObjectiveId: "objective-1", title: "Write essays", description: "Weekly work",
  metricType: "count", currentValue: 1, targetValue: 12, bareMinimum: 6, displayOnTodoList: true,
  startDate: "2026-01-01", targetDate: "2026-12-31", position: 0,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", status: "active"
};

describe("strategy semantic operation orchestration", () => {
  beforeEach(() => {
    installBrowserState();
    state.rpc.mockReset();
    state.from.mockReset();
    state.events.length = 0;
    state.rpc.mockImplementation(async (name, args) => ({
      data: name === "create_outcome_goal_semantic"
        ? { ...args.goal_record, updated_at: "2026-09-06T12:00:00.000Z" }
        : name === "delete_outcome_goal_semantic"
          ? { id: args.goal_id, deleted: true }
          : { id: args.direction_id || args.goal_id, updated_at: "2026-09-06T12:00:00.000Z" },
      error: null
    }));
  });

  it("uses the checked direction semantic RPC with a stable revision id, vectors, and baseline", async () => {
    const direction = {
      id: "direction-1",
      title: "Old",
      statement: "Old statement",
      status: "active",
      isActive: true,
      position: 0,
      vectorIds: ["professional"],
      updatedAt: "2026-09-06T10:00:00.000Z"
    };
    await updateDirection({
      state: {
        directions: [direction],
        revisionsByDirectionId: { [direction.id]: [] }
      },
      directionId: direction.id,
      title: "New",
      statement: "New statement",
      vectorIds: ["professional", "intellectual"],
      changeReason: "Refined direction",
      userId: "user-1"
    });

    expect(state.rpc).toHaveBeenCalledWith("update_direction_semantic", {
      direction_id: "direction-1",
      patch: {
        title: "New",
        statement: "New statement",
        vector_ids: ["intellectual", "professional"]
      },
      change_reason: "Refined direction",
      revision_id: expect.stringMatching(/^direction-revision-/),
      expected_updated_at: direction.updatedAt
    });
    expect(state.from).not.toHaveBeenCalled();
  });

  it("uses the checked goal semantic RPC with a reason for a meaningful existing-goal edit", async () => {
    await saveOutcomeGoal({ goals: [baseGoal], goal: { ...baseGoal, targetValue: 20 }, objectiveId: "objective-1",
      userId: "user-1", revisionReason: "Expanded target" });

    expect(state.rpc).toHaveBeenCalledWith("update_outcome_goal_semantic", expect.objectContaining({
      goal_id: "goal-1",
      change_reason: "Expanded target",
      revision_id: expect.stringMatching(/^outcome-goal-revision-/),
      expected_updated_at: baseGoal.updatedAt,
      patch: expect.objectContaining({ strategic_objective_id: "objective-1", target_value: 20, bare_minimum: 6, display_on_todo_list: true })
    }));
    expect(state.from).not.toHaveBeenCalled();
  });

  it("allows a progress-only existing-goal update without a revision reason", async () => {
    await saveOutcomeGoal({ goals: [baseGoal], goal: { ...baseGoal, currentValue: 2 }, objectiveId: "objective-1",
      userId: "user-1", revisionReason: "" });

    expect(state.rpc).toHaveBeenCalledWith("update_outcome_goal_semantic", expect.objectContaining({
      change_reason: null,
      revision_id: null,
      patch: expect.objectContaining({ current_value: 2 })
    }));
  });

  it("updates an existing displayed goal's linked task locally while the semantic RPC owns the cloud task change", async () => {
    await saveOutcomeGoal({ goals: [baseGoal], goal: { ...baseGoal, title: "Write better essays" }, objectiveId: "objective-1",
      userId: "user-1", revisionReason: "Clarified scope" });

    expect(JSON.parse(window.localStorage.getItem("fabbro_tasks_v1"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: linkedTaskId("goal-1"), title: "Write better essays", deleted: false })
    ]));
    expect(state.from).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc.mock.calls[0][0]).toBe("update_outcome_goal_semantic");
  });

  it("creates a displayed goal and its cloud linked task through one transactional RPC", async () => {
    const values = installBrowserState();
    await saveOutcomeGoal({ goals: [], goal: { ...baseGoal, id: "", title: "New displayed goal" }, objectiveId: "objective-1",
      userId: "user-1", revisionReason: "" });

    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith("create_outcome_goal_semantic", {
      goal_record: expect.objectContaining({
        id: expect.stringMatching(/^outcome-goal-/),
        strategic_objective_id: "objective-1",
        title: "New displayed goal",
        display_on_todo_list: true
      })
    });
    expect(state.from).not.toHaveBeenCalled();
    expect(JSON.parse(values.get("fabbro_tasks_v1"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceGoalId: expect.any(String), sourceType: "directional-goal", deleted: false })
    ]));
  });

  it("deletes a goal and tombstones its cloud linked task through one transactional RPC", async () => {
    const values = installBrowserState();
    values.set("fabbro_tasks_v1", JSON.stringify([updateLinkedTask([], baseGoal, true)[0]]));

    await deleteOutcomeGoal({ goals: [baseGoal], goalId: "goal-1", objectiveId: "objective-1", userId: "user-1" });

    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith("delete_outcome_goal_semantic", {
      goal_id: "goal-1",
      expected_updated_at: baseGoal.updatedAt
    });
    expect(state.from).not.toHaveBeenCalled();
    expect(JSON.parse(values.get("fabbro_tasks_v1"))[0]).toMatchObject({ deleted: true, deletedAt: expect.any(Number) });
  });

  it("preserves updateLinkedTask linked-task semantics", () => {
    const existing = { id: linkedTaskId("goal-1"), title: "Old", completed: true, dueTime: "09:30",
      estimatedHours: "2", subtasks: [{ id: "subtask-1" }], createdAt: 123, deleted: true, deletedAt: 999 };
    const [updated] = updateLinkedTask([existing], baseGoal, true);
    expect(updated).toMatchObject({ id: existing.id, completed: true, dueTime: "09:30", estimatedHours: "2",
      subtasks: existing.subtasks, createdAt: 123, sourceType: "directional-goal", tags: ["directional-goal"], deleted: false });
    expect(updateLinkedTask([updated], baseGoal, false)[0]).toMatchObject({ deleted: true, deletedAt: expect.any(Number) });
  });
});
