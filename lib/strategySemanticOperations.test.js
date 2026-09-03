import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  events: [],
  taskWrites: []
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { rpc: state.rpc, from: state.from }
}));

import { updateDirection } from "./directions/directionRepository";
import { saveOutcomeGoal } from "./goals/outcomeGoalRepository";
import { linkedTaskId, updateLinkedTask } from "./tasks/goalTaskSync";

function installBrowserState() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    },
    dispatchEvent: (event) => state.events.push(event)
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
}

function successChain(result = { error: null }) {
  const chain = {};
  for (const name of ["insert", "update", "select", "eq", "maybeSingle"]) {
    chain[name] = vi.fn(() => chain);
  }
  chain.then = (resolve) => Promise.resolve(result).then(resolve);
  return chain;
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
    state.taskWrites.length = 0;
    state.rpc.mockResolvedValue({ error: null });
  });

  it("uses the direction semantic RPC instead of remote revision and row writes", async () => {
    await updateDirection({ direction: { id: "direction-1", title: "Old", statement: "Old statement" }, revisions: [],
      title: "New", statement: "New statement", changeReason: "Refined direction", userId: "user-1" });

    expect(state.rpc).toHaveBeenCalledWith("update_direction_semantic", {
      direction_id: "direction-1", patch: { title: "New", statement: "New statement" }, change_reason: "Refined direction"
    });
    expect(state.from).not.toHaveBeenCalled();
  });

  it("uses the goal semantic RPC with a reason for a meaningful existing-goal edit", async () => {
    await saveOutcomeGoal({ goals: [baseGoal], goal: { ...baseGoal, targetValue: 20 }, objectiveId: "objective-1",
      userId: "user-1", revisionReason: "Expanded target" });

    expect(state.rpc).toHaveBeenCalledWith("update_outcome_goal_semantic", expect.objectContaining({
      goal_id: "goal-1", change_reason: "Expanded target",
      patch: expect.objectContaining({ target_value: 20, bare_minimum: 6, display_on_todo_list: true })
    }));
    expect(state.from).not.toHaveBeenCalled();
  });

  it("allows a progress-only existing-goal update without a revision reason", async () => {
    await saveOutcomeGoal({ goals: [baseGoal], goal: { ...baseGoal, currentValue: 2 }, objectiveId: "objective-1",
      userId: "user-1", revisionReason: "" });

    expect(state.rpc).toHaveBeenCalledWith("update_outcome_goal_semantic", expect.objectContaining({
      change_reason: null,
      patch: expect.objectContaining({ current_value: 2 })
    }));
  });

  it("updates an existing displayed goal's linked task locally without cloud task synchronization", async () => {
    await saveOutcomeGoal({ goals: [baseGoal], goal: { ...baseGoal, title: "Write better essays" }, objectiveId: "objective-1",
      userId: "user-1", revisionReason: "Clarified scope" });

    expect(JSON.parse(window.localStorage.getItem("fabbro_tasks_v1"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: linkedTaskId("goal-1"), title: "Write better essays", deleted: false })
    ]));
    expect(state.from).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps cloud linked-task creation for a newly created displayed goal", async () => {
    const remoteTasks = [];
    state.from.mockImplementation((table) => {
      if (table === "user_tasks") {
        const read = successChain({ data: { tasks: remoteTasks, version: 1 }, error: null });
        read.update.mockImplementation((payload) => {
          state.taskWrites.push(payload);
          return successChain({ data: { version: 2 }, error: null });
        });
        return read;
      }
      return successChain({ error: null });
    });

    await saveOutcomeGoal({ goals: [], goal: { ...baseGoal, id: "", title: "New displayed goal" }, objectiveId: "objective-1",
      userId: "user-1", revisionReason: "" });

    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.from).toHaveBeenCalledWith("user_tasks");
    expect(state.from).toHaveBeenCalledWith("outcome_goals");
    expect(state.taskWrites).toEqual([expect.objectContaining({
      tasks: [expect.objectContaining({ sourceGoalId: expect.any(String), sourceType: "directional-goal", deleted: false })]
    })]);
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
