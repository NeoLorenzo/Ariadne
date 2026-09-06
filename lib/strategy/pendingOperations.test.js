import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  STRATEGY_SYNC_CONFLICT,
  enqueueStrategyOperation,
  flushStrategyOperations,
  getStrategyBaseUpdatedAt,
  getStrategySyncState,
  hasPendingStrategyOperations,
  setStrategyBaseUpdatedAt,
  supersedeStrategyConflicts,
  toStrategySyncError
} from "./pendingOperations";

function installBrowserState() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    },
    dispatchEvent: vi.fn()
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  return values;
}

describe("durable strategy operation journal", () => {
  beforeEach(() => installBrowserState());

  it("keeps a failed operation pending so a later cloud load cannot silently discard it", async () => {
    enqueueStrategyOperation({
      domain: "direction",
      kind: "update",
      entityId: "direction-1",
      scopeIds: ["root"],
      payload: { patch: { title: "Local title" } }
    });

    const result = await flushStrategyOperations({
      domain: "direction",
      scopeId: "root",
      execute: async () => { throw new Error("offline"); }
    });

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(false);
    expect(hasPendingStrategyOperations({ domain: "direction", scopeId: "root" })).toBe(true);
    expect(getStrategySyncState({ domain: "direction" })).toMatchObject({ pendingCount: 1, conflictCount: 0 });
  });

  it("marks optimistic-concurrency failures as conflicts and does not retry them automatically", async () => {
    enqueueStrategyOperation({
      domain: "outcome-goal",
      kind: "update",
      entityId: "goal-1",
      scopeIds: ["objective-1"],
      payload: {}
    });
    const conflict = Object.assign(new Error(STRATEGY_SYNC_CONFLICT), {
      code: "40001",
      details: JSON.stringify({ entity_id: "goal-1", updated_at: "2026-09-06T10:00:00.000Z" })
    });

    await flushStrategyOperations({
      domain: "outcome-goal",
      scopeId: "objective-1",
      execute: async () => { throw conflict; }
    });
    const secondExecutor = vi.fn();
    const second = await flushStrategyOperations({
      domain: "outcome-goal",
      scopeId: "objective-1",
      execute: secondExecutor
    });

    expect(second.ok).toBe(false);
    expect(second.conflict).toBe(true);
    expect(secondExecutor).not.toHaveBeenCalled();
    expect(getStrategySyncState({ domain: "outcome-goal" }).conflictCount).toBe(1);
  });

  it("rebases a conflicted operation for an explicit later retry without dropping the original intent", async () => {
    enqueueStrategyOperation({ domain: "strategic-objective", kind: "update", entityId: "objective-1", scopeIds: ["direction-1"] });
    const conflict = Object.assign(new Error(STRATEGY_SYNC_CONFLICT), {
      details: JSON.stringify({ entity_id: "objective-1", updated_at: "2026-09-06T11:00:00.000Z" })
    });
    await flushStrategyOperations({
      domain: "strategic-objective",
      scopeId: "direction-1",
      execute: async () => { throw conflict; }
    });

    expect(supersedeStrategyConflicts({ domain: "strategic-objective", entityId: "objective-1" })).toBe(1);
    expect(getStrategyBaseUpdatedAt("strategic-objective", "objective-1")).toBe("2026-09-06T11:00:00.000Z");
    expect(getStrategySyncState({ domain: "strategic-objective" })).toMatchObject({ pendingCount: 1, conflictCount: 0 });

    const executor = vi.fn(async () => ({ updated_at: "2026-09-06T11:05:00.000Z" }));
    await expect(flushStrategyOperations({
      domain: "strategic-objective",
      scopeId: "direction-1",
      execute: executor
    })).resolves.toMatchObject({ ok: true });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(hasPendingStrategyOperations({ domain: "strategic-objective" })).toBe(false);
  });

  it("tracks the last known cloud timestamp separately from optimistic local timestamps", () => {
    setStrategyBaseUpdatedAt("direction", "direction-1", "2026-09-06T09:00:00.000Z");
    expect(getStrategyBaseUpdatedAt("direction", "direction-1", "fallback")).toBe("2026-09-06T09:00:00.000Z");
  });

  it("wraps cloud failures without losing conflict classification", () => {
    const ordinary = toStrategySyncError(new Error("offline"));
    const conflict = toStrategySyncError(Object.assign(new Error(STRATEGY_SYNC_CONFLICT), { code: "40001" }));
    expect(ordinary.message).toBe("STRATEGY_SYNC_PENDING");
    expect(conflict.message).toBe(STRATEGY_SYNC_CONFLICT);
  });
});
