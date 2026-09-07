import { describe, expect, it } from "vitest";
import { formatDirection, formatDirections } from "./appDataText";

describe("multidirectional strategy export", () => {
  it("exports an explicit no-direction state without fabricating an active status", () => {
    const text = formatDirection({ direction: null, revisions: [] });

    expect(text).toBe("## Direction\n\n- No direction set.");
    expect(text).not.toContain("Status: Active");
    expect(text).not.toContain("Title:");
  });

  it("exports vector membership, lifecycle status, and revision history for one direction", () => {
    const text = formatDirection({
      direction: {
        title: "Researcher",
        statement: "Build serious AI/economics research ability",
        status: "active",
        vectorIds: ["intellectual", "professional", "creative"],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z"
      },
      revisions: [{
        title: "Previous",
        statement: "Previous statement",
        vectorIds: ["intellectual", "professional"],
        changeReason: "Expanded creative output",
        createdAt: "2026-08-01T00:00:00.000Z"
      }]
    });

    expect(text).toContain("- **Status:** Active");
    expect(text).toContain("- **Vectors:** Intellectual · Professional · Creative");
    expect(text).toContain("### Direction History");
    expect(text).toContain("**Previous**");
    expect(text).toContain("Expanded creative output");
  });

  it("exports all concurrent directions rather than selecting a singleton root", () => {
    const text = formatDirections({
      directions: [
        {
          id: "direction-a",
          title: "Research",
          statement: "Build research capacity",
          status: "active",
          position: 0,
          vectorIds: ["intellectual", "professional"]
        },
        {
          id: "direction-b",
          title: "Physical capacity",
          statement: "Build robust physical capacity",
          status: "paused",
          position: 1,
          vectorIds: ["physical", "psychological"]
        }
      ],
      revisionsByDirectionId: { "direction-a": [], "direction-b": [] }
    });

    expect(text).toContain("### 1. Research");
    expect(text).toContain("### 2. Physical capacity");
    expect(text).toContain("- **Vectors:** Intellectual · Professional");
    expect(text).toContain("- **Vectors:** Physical · Psychological");
    expect(text).toContain("- **Status:** Paused");
  });
});
