import { describe, expect, it } from "vitest";
import { formatDirection } from "./appDataText";

describe("formatDirection", () => {
  it("exports an explicit no-direction state without fabricating an active status", () => {
    const text = formatDirection({ direction: null, revisions: [] });

    expect(text).toBe("## Current Direction\n\n- No direction set.");
    expect(text).not.toContain("Status: Active");
    expect(text).not.toContain("Title:");
  });

  it("preserves active direction export formatting and revision history", () => {
    const text = formatDirection({
      direction: {
        title: "Current", statement: "Current statement", isActive: true,
        createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z"
      },
      revisions: [{
        title: "Previous", statement: "Previous statement", changeReason: "Refined",
        createdAt: "2026-08-01T00:00:00.000Z"
      }]
    });

    expect(text).toContain("- **Status:** Active");
    expect(text).toContain("### Direction History");
    expect(text).toContain("#### 1. Previous");
    expect(text).toContain("- **Reason for change:** Refined");
  });

  it("preserves inactive direction status", () => {
    const text = formatDirection({
      direction: { title: "Inactive", statement: "Archived", isActive: false },
      revisions: []
    });

    expect(text).toContain("- **Status:** Inactive");
  });
});
