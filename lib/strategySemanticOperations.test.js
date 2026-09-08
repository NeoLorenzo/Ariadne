import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), events: [] }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { rpc: state.rpc, from: state.from }
}));

import { updateDirection } from "./directions/directionRepository";
import { saveStrategicObjective } from "./objectives/strategicObjectiveRepository";

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
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  return values;
}

describe("strategy semantic operation orchestration", () => {
  beforeEach(() => {
    installBrowserState();
    state.rpc.mockReset();
    state.from.mockReset();
    state.events.length = 0;
    state.rpc.mockImplementation(async (name, args) => ({
      data: {
        id: args.direction_id || args.objective_record?.id,
        updated_at: "2026-09-06T12:00:00.000Z"
      },
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

  it("persists Strategic Objectives directly below Directions through the semantic RPC", async () => {
    const objective = {
      id: "strategic-objective-1",
      directionId: "direction-1",
      title: "Build technical credibility",
      description: "Demonstrate credible AI work",
      successCondition: "Public technical work is legible and defensible",
      status: "active",
      position: 0,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-06T10:00:00.000Z"
    };

    await saveStrategicObjective({
      objectives: [objective],
      objective: { ...objective, description: "Demonstrate credible ML and AI work" },
      directionId: "direction-1",
      userId: "user-1"
    });

    expect(state.rpc).toHaveBeenCalledWith("save_strategic_objective_semantic", {
      objective_record: expect.objectContaining({
        id: "strategic-objective-1",
        direction_id: "direction-1",
        title: "Build technical credibility",
        description: "Demonstrate credible ML and AI work",
        success_condition: "Public technical work is legible and defensible",
        status: "active",
        position: 0
      }),
      expected_updated_at: objective.updatedAt
    });
    expect(state.from).not.toHaveBeenCalled();
  });
});
