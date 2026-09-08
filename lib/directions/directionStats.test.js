import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadStrategicObjectives: vi.fn()
}));

vi.mock("@/lib/objectives/strategicObjectiveRepository", () => ({
  loadStrategicObjectives: mocks.loadStrategicObjectives
}));

import { loadDirectionSummaryStats } from "./directionStats";

describe("direction summary stats", () => {
  beforeEach(() => {
    mocks.loadStrategicObjectives.mockReset();
  });

  it("counts active strategic objectives independently for each direction", async () => {
    mocks.loadStrategicObjectives.mockImplementation(async (directionId) => directionId === "direction-a"
      ? [
          { id: "objective-a1", status: "active" },
          { id: "objective-a2", status: "active" },
          { id: "objective-a3", status: "completed" }
        ]
      : [{ id: "objective-b1", status: "active" }]);

    await expect(loadDirectionSummaryStats("direction-a", "owner-1")).resolves.toEqual({
      activeObjectivesCount: 2
    });
    await expect(loadDirectionSummaryStats("direction-b", "owner-1")).resolves.toEqual({
      activeObjectivesCount: 1
    });

    expect(mocks.loadStrategicObjectives).toHaveBeenCalledWith("direction-a", "owner-1");
    expect(mocks.loadStrategicObjectives).toHaveBeenCalledWith("direction-b", "owner-1");
  });

  it("returns an empty summary without a direction", async () => {
    await expect(loadDirectionSummaryStats("", "owner-1")).resolves.toEqual({
      activeObjectivesCount: 0
    });
    expect(mocks.loadStrategicObjectives).not.toHaveBeenCalled();
  });
});
