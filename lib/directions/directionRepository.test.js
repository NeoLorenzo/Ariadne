import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: cloud.from, rpc: cloud.rpc }
}));

import { createDirection, loadDirectionState, updateDirection } from "./directionRepository";

const STORAGE_KEY = "fabbro_direction_v1";

function installBrowserState(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(STORAGE_KEY, initialValue);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    }
  };
  return values;
}

function query(result) {
  const chain = {};
  for (const method of ["select", "eq", "maybeSingle", "order"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.insert = vi.fn();
  chain.then = (resolve) => Promise.resolve(result).then(resolve);
  return chain;
}

describe("direction repository privacy and bootstrap", () => {
  beforeEach(() => {
    installBrowserState();
    cloud.from.mockReset();
    cloud.rpc.mockReset();
    cloud.rpc.mockResolvedValue({ error: null });
  });

  it("keeps a fresh browser empty when an empty cloud lookup succeeds without inserting a direction", async () => {
    installBrowserState("{malformed");
    const directions = query({ data: null, error: null });
    cloud.from.mockImplementation((table) => {
      expect(table).toBe("directions");
      return directions;
    });

    await expect(loadDirectionState("owner-1")).resolves.toEqual({ direction: null, revisions: [] });
    expect(directions.insert).not.toHaveBeenCalled();
    expect(cloud.from).toHaveBeenCalledTimes(1);
  });

  it("preserves a valid locally created direction when cloud lookup fails", async () => {
    const local = {
      direction: { id: "direction-local", title: "Local direction", statement: "Persisted locally", isActive: true },
      revisions: []
    };
    installBrowserState(JSON.stringify(local));
    cloud.from.mockReturnValue(query({ data: null, error: new Error("offline") }));

    await expect(loadDirectionState("owner-1")).resolves.toEqual(local);
  });

  it("loads an existing cloud direction and its revisions", async () => {
    const directionRow = {
      id: "direction-cloud", title: "Cloud direction", statement: "Real owner data", is_active: true,
      created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z"
    };
    const revisionRows = [{
      id: "revision-1", direction_id: "direction-cloud", title: "Previous", statement: "Earlier version",
      change_reason: "Refined", created_at: "2026-09-01T00:00:00.000Z"
    }];
    cloud.from.mockImplementation((table) => query(table === "directions"
      ? { data: directionRow, error: null }
      : { data: revisionRows, error: null }));

    await expect(loadDirectionState("owner-1")).resolves.toEqual({
      direction: {
        id: "direction-cloud", title: "Cloud direction", statement: "Real owner data", isActive: true,
        createdAt: directionRow.created_at, updatedAt: directionRow.updated_at
      },
      revisions: [{
        id: "revision-1", directionId: "direction-cloud", title: "Previous", statement: "Earlier version",
        changeReason: "Refined", createdAt: revisionRows[0].created_at
      }]
    });
  });

  it("creates the first user direction locally and inserts that exact owner-scoped row without a revision", async () => {
    const values = installBrowserState();
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    cloud.from.mockReturnValue({ insert });

    const state = await createDirection({ title: "  My direction  ", statement: "  My statement  ", userId: "owner-1" });

    expect(state.direction).toMatchObject({
      id: expect.stringMatching(/^direction-/), title: "My direction", statement: "My statement", isActive: true
    });
    expect(state.revisions).toEqual([]);
    expect(JSON.parse(values.get(STORAGE_KEY))).toEqual(state);
    expect(insert).toHaveBeenCalledWith({
      id: state.direction.id, user_id: "owner-1", title: "My direction", statement: "My statement", is_active: true
    });
  });

  it("keeps the first user direction locally when cloud insertion fails", async () => {
    const values = installBrowserState();
    const insert = vi.fn(() => Promise.resolve({ error: new Error("offline") }));
    cloud.from.mockReturnValue({ insert });

    await expect(createDirection({ title: "My direction", statement: "My statement", userId: "owner-1" })).rejects.toThrow("offline");
    expect(JSON.parse(values.get(STORAGE_KEY))).toMatchObject({
      direction: { title: "My direction", statement: "My statement", isActive: true }, revisions: []
    });
  });

  it("retains existing edit and revision semantics", async () => {
    const direction = { id: "direction-1", title: "Old", statement: "Old statement", isActive: true };
    const next = await updateDirection({
      direction, revisions: [], title: "New", statement: "New statement", changeReason: "Clarified", userId: "owner-1"
    });

    expect(next.direction).toMatchObject({ id: "direction-1", title: "New", statement: "New statement" });
    expect(next.revisions).toEqual([expect.objectContaining({ directionId: "direction-1", title: "Old", changeReason: "Clarified" })]);
    expect(cloud.rpc).toHaveBeenCalledWith("update_direction_semantic", expect.objectContaining({ direction_id: "direction-1" }));
  });
});
