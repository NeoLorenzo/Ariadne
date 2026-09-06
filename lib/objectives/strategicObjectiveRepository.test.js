import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { from: cloud.from, rpc: cloud.rpc } }));

import {
  loadStrategicObjectives,
  reorderStrategicObjectives,
  saveStrategicObjective
} from "./strategicObjectiveRepository";

function installBrowserState(initial = []) {
  const values = new Map([["fabbro_strategic_objectives_v1", JSON.stringify(initial)]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    },
    dispatchEvent: vi.fn()
  };
  globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };
  return values;
}

function query(result) {
  const chain = {};
  for (const method of ["select", "eq", "order"]) chain[method] = vi.fn(() => chain);
  chain.then = (resolve) => Promise.resolve(result).then(resolve);
  return chain;
}

const objectiveA = {
  id: "objective-a", directionId: "direction-1", title: "A", description: "",
  successCondition: "Ship A", status: "active", position: 0,
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-06T09:00:00.000Z"
};
const objectiveB = {
  id: "objective-b", directionId: "direction-1", title: "B", description: "",
  successCondition: "Ship B", status: "active", position: 1,
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-06T09:00:00.000Z"
};

describe("strategic objective reconciliation", () => {
  beforeEach(() => {
    installBrowserState();
    cloud.from.mockReset();
    cloud.rpc.mockReset();
  });

  it("retains a locally accepted create while its cloud write is unavailable", async () => {
    const values = installBrowserState();
    cloud.rpc.mockResolvedValue({ data: null, error: new Error("offline") });

    await expect(saveStrategicObjective({
      objectives: [],
      objective: { title: "Local objective", description: "", successCondition: "Done", status: "active" },
      directionId: "direction-1",
      userId: "owner-1"
    })).rejects.toThrow("STRATEGY_SYNC_PENDING");

    const local = JSON.parse(values.get("fabbro_strategic_objectives_v1"));
    expect(local).toEqual([expect.objectContaining({ title: "Local objective" })]);

    await expect(loadStrategicObjectives("direction-1", "owner-1")).resolves.toEqual(local);
    expect(cloud.from).not.toHaveBeenCalled();
  });

  it("retries a failed create before replacing the local collection from cloud", async () => {
    const values = installBrowserState();
    cloud.rpc
      .mockResolvedValueOnce({ data: null, error: new Error("offline") })
      .mockImplementationOnce(async (_name, args) => ({
        data: { ...args.objective_record, updated_at: "2026-09-06T10:00:00.000Z" }, error: null
      }));

    await expect(saveStrategicObjective({
      objectives: [],
      objective: { title: "Local objective", description: "", successCondition: "Done", status: "active" },
      directionId: "direction-1",
      userId: "owner-1"
    })).rejects.toThrow("STRATEGY_SYNC_PENDING");
    const local = JSON.parse(values.get("fabbro_strategic_objectives_v1"));
    const remoteRow = {
      id: local[0].id, direction_id: "direction-1", title: "Local objective", description: null,
      success_condition: "Done", status: "active", position: 0,
      created_at: local[0].createdAt, updated_at: "2026-09-06T10:00:00.000Z"
    };
    cloud.from.mockReturnValue(query({ data: [remoteRow], error: null }));

    await expect(loadStrategicObjectives("direction-1", "owner-1")).resolves.toEqual([
      expect.objectContaining({ id: local[0].id, title: "Local objective" })
    ]);
    expect(cloud.rpc).toHaveBeenCalledTimes(2);
    expect(cloud.from).toHaveBeenCalledTimes(1);
  });

  it("applies a reorder through one atomic RPC rather than per-row writes", async () => {
    installBrowserState([objectiveA, objectiveB]);
    cloud.rpc.mockResolvedValue({
      data: [
        { id: "objective-b", position: 0, updated_at: "2026-09-06T09:10:00.000Z" },
        { id: "objective-a", position: 1, updated_at: "2026-09-06T09:10:00.000Z" }
      ],
      error: null
    });

    const next = await reorderStrategicObjectives({
      objectives: [objectiveA, objectiveB], objectiveId: "objective-b", offset: -1,
      directionId: "direction-1", userId: "owner-1"
    });

    expect(next.find((item) => item.id === "objective-b").position).toBe(0);
    expect(cloud.rpc).toHaveBeenCalledTimes(1);
    expect(cloud.rpc).toHaveBeenCalledWith("reorder_strategic_objectives_semantic", {
      direction_id: "direction-1",
      positions: { "objective-b": 0, "objective-a": 1 },
      expected_updated_at_by_id: {
        "objective-b": objectiveB.updatedAt,
        "objective-a": objectiveA.updatedAt
      }
    });
    expect(cloud.from).not.toHaveBeenCalled();
  });

  it("preserves a local edit when the server reports a concurrent objective change", async () => {
    const values = installBrowserState([objectiveA]);
    cloud.rpc.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("STRATEGY_SYNC_CONFLICT"), {
        code: "40001",
        details: JSON.stringify({ entity_id: "objective-a", updated_at: "2026-09-06T09:30:00.000Z" })
      })
    });

    await expect(saveStrategicObjective({
      objectives: [objectiveA],
      objective: { ...objectiveA, title: "Local edit" },
      directionId: "direction-1",
      userId: "owner-1"
    })).rejects.toThrow("STRATEGY_SYNC_CONFLICT");

    const local = JSON.parse(values.get("fabbro_strategic_objectives_v1"));
    await expect(loadStrategicObjectives("direction-1", "owner-1")).resolves.toEqual(local);
    expect(local[0].title).toBe("Local edit");
    expect(cloud.from).not.toHaveBeenCalled();
  });
});
