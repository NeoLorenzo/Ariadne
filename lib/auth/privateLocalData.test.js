import { beforeEach, describe, expect, it, vi } from "vitest";

const syncCache = vi.hoisted(() => ({
  clearAllSyncCache: vi.fn(),
  writeLastKnownSyncUserId: vi.fn()
}));

vi.mock("@/lib/storage/syncCache", () => syncCache);

import { clearLocalPrivateData } from "./privateLocalData";

function installLocalStorage({ throwOn = "" } = {}) {
  const removeItem = vi.fn((key) => {
    if (key === throwOn) throw new Error("storage failure");
  });

  globalThis.window = {
    localStorage: { removeItem }
  };

  return removeItem;
}

describe("private local data cleanup", () => {
  beforeEach(() => {
    syncCache.clearAllSyncCache.mockReset();
    syncCache.writeLastKnownSyncUserId.mockReset();
  });

  it("clears Opportunity Landscape caches, pending operations, and candidate inbox", () => {
    const removeItem = installLocalStorage();

    clearLocalPrivateData();

    expect(removeItem).toHaveBeenCalledWith("ariadne_opportunities_v1");
    expect(removeItem).toHaveBeenCalledWith("ariadne_opportunity_pending_v1");
    expect(removeItem).toHaveBeenCalledWith("ariadne_opportunity_candidates_v1");
    expect(syncCache.clearAllSyncCache).toHaveBeenCalledTimes(1);
    expect(syncCache.writeLastKnownSyncUserId).toHaveBeenCalledWith(null);
  });

  it("continues cleanup when removing one storage key throws", () => {
    const removeItem = installLocalStorage({ throwOn: "ariadne_opportunities_v1" });

    expect(() => clearLocalPrivateData()).not.toThrow();

    expect(removeItem).toHaveBeenCalledWith("ariadne_opportunities_v1");
    expect(removeItem).toHaveBeenCalledWith("ariadne_opportunity_pending_v1");
    expect(removeItem).toHaveBeenCalledWith("ariadne_opportunity_candidates_v1");
    expect(syncCache.clearAllSyncCache).toHaveBeenCalledTimes(1);
    expect(syncCache.writeLastKnownSyncUserId).toHaveBeenCalledWith(null);
  });
});
