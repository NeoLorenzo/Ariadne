import { describe, expect, it } from "vitest";
import { reconcileProjectCollections } from "./reconcile";
import { createProjectWriteCoordinator } from "./writeCoordinator";

describe("project write coordinator", () => {
  it("serializes B behind A and starts B after A advances the version", () => {
    const gate = createProjectWriteCoordinator();
    let version = 7;
    const writes = [];
    const write = (snapshot) => writes.push({ snapshot, expectedVersion: version });

    expect(gate.start()).toBe(true); write("A");
    expect(gate.start()).toBe(false);
    expect(writes).toEqual([{ snapshot: "A", expectedVersion: 7 }]);
    version = 8;
    expect(gate.finish()).toBe(true);
    expect(gate.start()).toBe(true); write("B");
    expect(writes).toEqual([
      { snapshot: "A", expectedVersion: 7 },
      { snapshot: "B", expectedVersion: 8 }
    ]);
  });

  it("retries a conflict reconciliation against the refreshed version", () => {
    const gate = createProjectWriteCoordinator();
    const baseline = [{ id: "a", name: "A" }];
    const local = [{ id: "a", name: "B" }];
    const remote = [{ id: "a", name: "A" }, { id: "c", name: "C" }];
    let version = 10;
    const writes = [];
    expect(gate.start()).toBe(true);
    writes.push({ expectedVersion: version, projects: local });
    const reconciled = reconcileProjectCollections(baseline, local, remote);
    version = 11;
    expect(gate.finish()).toBe(false);
    expect(gate.start()).toBe(true);
    writes.push({ expectedVersion: version, projects: reconciled });
    expect(writes[1]).toEqual({ expectedVersion: 11, projects: [{ id: "a", name: "B" }, { id: "c", name: "C" }] });
  });
});
