import { describe, expect, it } from "vitest";
import { createOpportunityRecord, normalizeOpportunity } from "./opportunityModel";

describe("opportunity requirement compatibility", () => {
  it("keeps legacy free-text requirements accessible without changing the enumerable cache shape", () => {
    const normalized = normalizeOpportunity({
      id: "legacy",
      title: "Legacy opportunity",
      type: "job",
      requirements: "Existing work authorization"
    });

    expect(normalized.requirements).toBe("Existing work authorization");
    expect(normalized.miscRequirements).toBe("Existing work authorization");
    expect(normalized.standardizedRequirements).toEqual([]);
    expect(Object.keys(normalized)).not.toContain("miscRequirements");
    expect(Object.keys(normalized)).not.toContain("standardizedRequirements");
  });

  it("preserves legacy requirements through record creation for repository writes", () => {
    const record = createOpportunityRecord({
      title: "Legacy opportunity",
      type: "job",
      requirements: "Existing language requirement"
    }, new Date("2026-09-09T20:00:00.000Z"));

    expect(record.miscRequirements).toBe("Existing language requirement");
    expect(record.standardizedRequirements).toEqual([]);
  });

  it("makes the new fields enumerable for records that explicitly use the structured schema", () => {
    const normalized = normalizeOpportunity({
      title: "Structured opportunity",
      type: "fellowship",
      standardizedRequirements: [{ type: "work_mode", mode: "remote", necessity: "required" }],
      miscRequirements: "Travel once per year"
    });

    expect(Object.keys(normalized)).toContain("standardizedRequirements");
    expect(Object.keys(normalized)).toContain("miscRequirements");
    expect(normalized.standardizedRequirements[0]).toMatchObject({ type: "work_mode", mode: "remote" });
    expect(normalized.miscRequirements).toBe("Travel once per year");
  });
});
