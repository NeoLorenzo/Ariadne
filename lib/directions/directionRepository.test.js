import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: cloud.from, rpc: cloud.rpc }
}));

import {
  createDirection,
  loadDirectionsState,
  reorderDirections,
  setDirectionStatus,
  updateDirection
} from "./directionRepository";

const STORAGE_KEY = "ariadne_directions_v2";
const LEGACY_STORAGE_KEY = "fabbro_direction_v1";

function installBrowserState(initial = {}) {
  const values = new Map(Object.entries(initial));
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

function query(result) {
  const chain = {};
  for (const method of ["select", "eq", "maybeSingle", "order"]) chain[method] = vi.fn(() => chain);
  chain.then = (resolve) => Promise.resolve(result).then(resolve);
  return chain;
}

function localState(directions, revisionsByDirectionId = {}) {
  return { directions, revisionsByDirectionId };
}

function sampleDirection(overrides = {}) {
  return {
    id: "direction-local",
    title: "Local direction",
    statement: "Persisted locally",
    status: "active",
    position: 0,
    isActive: true,
    vectorIds: ["intellectual"],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides
  };
}

describe("multidirectional direction repository", () => {
  beforeEach(() => {
    installBrowserState();
    cloud.from.mockReset();
    cloud.rpc.mockReset();
  });

  it("migrates the legacy singleton locally without guessing vector membership", async () => {
    const values = installBrowserState({
      [LEGACY_STORAGE_KEY]: JSON.stringify({
        direction: {
          id: "direction-legacy",
          title: "Legacy",
          statement: "Preserve me",
          isActive: true,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:00.000Z"
        },
        revisions: []
      })
    });

    const state = await loadDirectionsState(null);
    expect(state.directions).toEqual([
      expect.objectContaining({ id: "direction-legacy", status: "active", position: 0, vectorIds: [] })
    ]);
    expect(JSON.parse(values.get(STORAGE_KEY))).toEqual(state);
    expect(values.get(LEGACY_STORAGE_KEY)).toBeTruthy();
  });

  it("does not silently discard valid local directions when the authenticated cloud is empty", async () => {
    const local = localState([sampleDirection()], { "direction-local": [] });
    installBrowserState({ [STORAGE_KEY]: JSON.stringify(local) });
    cloud.from.mockReturnValue(query({ data: [], error: null }));

    await expect(loadDirectionsState("owner-1")).resolves.toEqual(local);
    expect(cloud.from).toHaveBeenCalledTimes(1);
  });

  it("preserves valid local directions when the cloud lookup fails", async () => {
    const local = localState([sampleDirection()], { "direction-local": [] });
    installBrowserState({ [STORAGE_KEY]: JSON.stringify(local) });
    cloud.from.mockReturnValue(query({ data: null, error: new Error("offline") }));

    await expect(loadDirectionsState("owner-1")).resolves.toEqual(local);
  });

  it("loads multiple cloud directions with vector links and per-direction revisions", async () => {
    const directionRows = [
      {
        id: "direction-a", title: "A", statement: "Alpha", status: "active", position: 0, is_active: true,
        created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z"
      },
      {
        id: "direction-b", title: "B", statement: "Beta", status: "active", position: 1, is_active: true,
        created_at: "2026-09-01T01:00:00.000Z", updated_at: "2026-09-02T01:00:00.000Z"
      }
    ];
    cloud.from.mockImplementation((table) => {
      if (table === "directions") return query({ data: directionRows, error: null });
      if (table === "direction_vector_links") return query({
        data: [
          { direction_id: "direction-a", vector_id: "intellectual" },
          { direction_id: "direction-a", vector_id: "professional" },
          { direction_id: "direction-b", vector_id: "professional" }
        ], error: null
      });
      return query({
        data: [{
          id: "revision-a", direction_id: "direction-a", title: "Old A", statement: "Earlier",
          vector_ids: ["intellectual"], change_reason: "Expanded", created_at: "2026-09-01T12:00:00.000Z"
        }], error: null
      });
    });

    const state = await loadDirectionsState("owner-1");
    expect(state.directions).toHaveLength(2);
    expect(state.directions[0].vectorIds).toEqual(["intellectual", "professional"]);
    expect(state.directions[1].vectorIds).toEqual(["professional"]);
    expect(state.revisionsByDirectionId["direction-a"][0].vectorIds).toEqual(["intellectual"]);
  });

  it("creates multiple active directions with explicit multidimensional membership", async () => {
    const values = installBrowserState();
    cloud.rpc.mockImplementation(async (_name, args) => ({
      data: { ...(args.direction_record || {}), updated_at: "2026-09-07T00:10:00.000Z" }, error: null
    }));

    let state = await createDirection({
      state: localState([], {}),
      title: "Researcher",
      statement: "Become a strong researcher",
      vectorIds: ["professional", "intellectual", "creative"],
      userId: "owner-1"
    });
    state = await createDirection({
      state,
      title: "Physical capacity",
      statement: "Build robust physical capacity",
      vectorIds: ["physical", "psychological"],
      userId: "owner-1"
    });

    expect(state.directions).toHaveLength(2);
    expect(state.directions.every((direction) => direction.status === "active")).toBe(true);
    expect(JSON.parse(values.get(STORAGE_KEY)).directions).toHaveLength(2);
    expect(cloud.rpc).toHaveBeenNthCalledWith(1, "create_direction_semantic", {
      direction_record: expect.objectContaining({
        title: "Researcher",
        status: "active",
        vector_ids: ["intellectual", "professional", "creative"]
      })
    });
  });

  it("retries a failed create before accepting the later cloud collection", async () => {
    const values = installBrowserState();
    cloud.rpc
      .mockResolvedValueOnce({ data: null, error: new Error("offline") })
      .mockImplementationOnce(async (_name, args) => ({
        data: { ...args.direction_record, updated_at: "2026-09-07T00:15:00.000Z" }, error: null
      }));

    await expect(createDirection({
      state: localState([], {}),
      title: "Local",
      statement: "Must survive",
      vectorIds: ["professional"],
      userId: "owner-1"
    })).rejects.toThrow("STRATEGY_SYNC_PENDING");

    const local = JSON.parse(values.get(STORAGE_KEY));
    const created = local.directions[0];
    const directionRow = {
      id: created.id,
      title: created.title,
      statement: created.statement,
      status: created.status,
      position: created.position,
      is_active: true,
      created_at: created.createdAt,
      updated_at: "2026-09-07T00:15:00.000Z"
    };
    cloud.from.mockImplementation((table) => {
      if (table === "directions") return query({ data: [directionRow], error: null });
      if (table === "direction_vector_links") return query({
        data: [{ direction_id: created.id, vector_id: "professional" }], error: null
      });
      return query({ data: [], error: null });
    });

    await expect(loadDirectionsState("owner-1")).resolves.toMatchObject({
      directions: [expect.objectContaining({ id: created.id, title: "Local", vectorIds: ["professional"] })]
    });
    expect(cloud.rpc).toHaveBeenCalledTimes(2);
  });

  it("records vector metadata changes in direction history and optimistic sync", async () => {
    const direction = {
      id: "direction-1", title: "Research", statement: "Build expertise", status: "active", position: 0,
      isActive: true, vectorIds: ["intellectual", "professional"], updatedAt: "2026-09-06T09:00:00.000Z"
    };
    cloud.rpc.mockResolvedValue({
      data: { id: direction.id, updated_at: "2026-09-06T09:05:00.000Z" }, error: null
    });

    const next = await updateDirection({
      state: localState([direction], { [direction.id]: [] }),
      directionId: direction.id,
      title: direction.title,
      statement: direction.statement,
      vectorIds: ["intellectual", "professional", "creative"],
      changeReason: "Creative output is part of the direction",
      userId: "owner-1"
    });

    expect(next.revisionsByDirectionId[direction.id][0]).toMatchObject({
      vectorIds: ["intellectual", "professional"],
      changeReason: "Creative output is part of the direction"
    });
    expect(cloud.rpc).toHaveBeenCalledWith("update_direction_semantic", expect.objectContaining({
      direction_id: direction.id,
      patch: {
        title: "Research",
        statement: "Build expertise",
        vector_ids: ["intellectual", "professional", "creative"]
      },
      expected_updated_at: direction.updatedAt
    }));
  });

  it("keeps a conflicted local edit and revision instead of replacing them with cloud state", async () => {
    const values = installBrowserState();
    const direction = sampleDirection({
      id: "direction-1",
      title: "Old",
      statement: "Old statement",
      vectorIds: ["intellectual"],
      updatedAt: "2026-09-06T09:00:00.000Z"
    });
    cloud.rpc.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("STRATEGY_SYNC_CONFLICT"), {
        code: "40001",
        details: JSON.stringify({ entity_id: direction.id, updated_at: "2026-09-06T09:10:00.000Z" })
      })
    });

    await expect(updateDirection({
      state: localState([direction], { [direction.id]: [] }),
      directionId: direction.id,
      title: "Local edit",
      statement: "Local intent",
      vectorIds: ["intellectual", "creative"],
      changeReason: "Local reason",
      userId: "owner-1"
    })).rejects.toThrow("STRATEGY_SYNC_CONFLICT");

    const localAfterConflict = JSON.parse(values.get(STORAGE_KEY));
    await expect(loadDirectionsState("owner-1")).resolves.toEqual(localAfterConflict);
    expect(localAfterConflict.directions[0].title).toBe("Local edit");
    expect(localAfterConflict.revisionsByDirectionId[direction.id]).toHaveLength(1);
    expect(cloud.from).not.toHaveBeenCalled();
  });

  it("can pause one direction without deactivating another", async () => {
    const directions = [
      { id: "a", title: "A", statement: "A", status: "active", position: 0, isActive: true, vectorIds: ["physical"], updatedAt: "2026-09-01T00:00:00Z" },
      { id: "b", title: "B", statement: "B", status: "active", position: 1, isActive: true, vectorIds: ["professional"], updatedAt: "2026-09-01T00:00:00Z" }
    ];
    cloud.rpc.mockResolvedValue({ data: { updated_at: "2026-09-07T00:20:00Z" }, error: null });

    const next = await setDirectionStatus({
      state: localState(directions, { a: [], b: [] }), directionId: "a", status: "paused", userId: "owner-1"
    });
    expect(next.directions.find((item) => item.id === "a").status).toBe("paused");
    expect(next.directions.find((item) => item.id === "b").status).toBe("active");
  });

  it("reorders active directions atomically", async () => {
    const directions = [
      { id: "a", title: "A", statement: "A", status: "active", position: 0, isActive: true, vectorIds: ["physical"], updatedAt: "2026-09-01T00:00:00Z" },
      { id: "b", title: "B", statement: "B", status: "active", position: 1, isActive: true, vectorIds: ["professional"], updatedAt: "2026-09-01T00:00:01Z" }
    ];
    cloud.rpc.mockResolvedValue({ data: [], error: null });

    const next = await reorderDirections({
      state: localState(directions, { a: [], b: [] }), directionId: "b", offset: -1, userId: "owner-1"
    });
    expect(next.directions.map((item) => item.id)).toEqual(["b", "a"]);
    expect(cloud.rpc).toHaveBeenCalledWith("reorder_directions_semantic", expect.objectContaining({
      positions: { b: 0, a: 1 }
    }));
  });
});
