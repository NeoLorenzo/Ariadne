import { describe, expect, it } from "vitest";
import { createTaskWriteCoordinator } from "./writeCoordinator";

describe("task write coordinator", () => {
  it("serializes writes and coalesces pending requests", () => {
    const gate = createTaskWriteCoordinator();
    expect(gate.start()).toBe(true);
    expect(gate.start()).toBe(false);
    expect(gate.start()).toBe(false);
    expect(gate.finish()).toBe(true);
    expect(gate.pending).toBe(false);
    expect(gate.finish()).toBe(false);
    expect(gate.start()).toBe(true);
  });
});
