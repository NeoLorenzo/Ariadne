import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compactSyncCacheSignature,
  readSyncCacheEntry,
  upsertSyncCacheEntryIfChanged
} from "./syncCache";

const SYNC_CACHE_STORAGE_KEY = "fabbro_sync_cache_v1";

function installLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem: vi.fn((key) => store.has(key) ? store.get(key) : null),
    setItem: vi.fn((key, value) => { store.set(key, String(value)); }),
    removeItem: vi.fn((key) => { store.delete(key); })
  };
  globalThis.window = { localStorage };
  return { store, localStorage };
}

describe("sync cache storage", () => {
  beforeEach(() => {
    delete globalThis.window;
  });

  it("stores a bounded signature instead of the full supplied task signature", () => {
    const { store } = installLocalStorage();
    const hugeSignature = JSON.stringify({ tasks: Array.from({ length: 2000 }, (_, index) => ({ index, description: "x".repeat(200) })) });
    const payload = { version: 7, tasks: [{ id: "task-1", title: "One" }] };

    const result = upsertSyncCacheEntryIfChanged({
      namespace: "tasks.resolved_cloud",
      userId: "user-1",
      payload,
      signature: hugeSignature
    });

    const stored = JSON.parse(store.get(SYNC_CACHE_STORAGE_KEY));
    const entry = stored["tasks.resolved_cloud::user-1"];
    expect(result.changed).toBe(true);
    expect(entry.payload).toEqual(payload);
    expect(entry.signature).toBe(compactSyncCacheSignature(hugeSignature));
    expect(entry.signature.length).toBeLessThan(64);
    expect(entry.signature.length).toBeLessThan(hugeSignature.length / 1000);
  });

  it("compacts an existing legacy expanded signature on the next equivalent upsert", () => {
    const legacySignature = JSON.stringify({ tasks: [{ id: "task-1", description: "x".repeat(20000) }] });
    const payload = { version: 4, tasks: [{ id: "task-1" }] };
    const key = "tasks.resolved_cloud::user-1";
    const initialStore = {
      [key]: {
        payload,
        signature: legacySignature,
        updatedAt: 1
      }
    };
    const { store } = installLocalStorage({
      [SYNC_CACHE_STORAGE_KEY]: JSON.stringify(initialStore)
    });

    const result = upsertSyncCacheEntryIfChanged({
      namespace: "tasks.resolved_cloud",
      userId: "user-1",
      payload,
      signature: legacySignature
    });

    const stored = JSON.parse(store.get(SYNC_CACHE_STORAGE_KEY));
    expect(result.changed).toBe(true);
    expect(stored[key].signature).toBe(compactSyncCacheSignature(legacySignature));
    expect(stored[key].signature.length).toBeLessThan(64);
  });

  it("does not throw when browser storage rejects a cache write", () => {
    const { localStorage } = installLocalStorage();
    localStorage.setItem.mockImplementation(() => {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    });

    expect(() => upsertSyncCacheEntryIfChanged({
      namespace: "tasks.resolved_cloud",
      userId: "user-1",
      payload: { version: 1, tasks: [] }
    })).not.toThrow();
  });

  it("continues to read payloads from legacy entries", () => {
    const key = "tasks.resolved_cloud::user-1";
    const payload = { version: 3, tasks: [{ id: "task-1", title: "Preserved" }] };
    installLocalStorage({
      [SYNC_CACHE_STORAGE_KEY]: JSON.stringify({
        [key]: { payload, signature: "legacy-expanded-signature", updatedAt: 123 }
      })
    });

    expect(readSyncCacheEntry({ namespace: "tasks.resolved_cloud", userId: "user-1" })).toEqual({
      payload,
      signature: "legacy-expanded-signature",
      updatedAt: 123
    });
  });
});
