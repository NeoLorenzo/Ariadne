import { describe, expect, it } from "vitest";
import {
  formatOpportunityRequirement,
  normalizeOpportunityRequirement,
  normalizeStandardizedRequirements,
  summarizeOpportunityRequirements,
  validateStandardizedRequirements
} from "./opportunityRequirements";

describe("opportunity requirements", () => {
  it("normalizes the supported requirement families without inventing qualitative levels", () => {
    const language = normalizeOpportunityRequirement({
      type: "language_proficiency",
      language: " English ",
      rawLevel: "excellent",
      necessity: "required"
    });
    expect(language).toMatchObject({ language: "English", minimumLevel: "", rawLevel: "excellent", framework: "" });
  });

  it("normalizes arrays and drops unknown types", () => {
    const requirements = normalizeStandardizedRequirements([
      { type: "completed_education", level: "bachelors", operator: "at_least" },
      { type: "made_up", value: "x" }
    ]);
    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({ type: "completed_education", level: "bachelors", operator: "at_least" });
  });

  it("keeps citizenship groups as normalized lists", () => {
    const citizenship = normalizeOpportunityRequirement({ type: "citizenship", jurisdictions: "EU_MEMBER_STATE, EEA, EU_MEMBER_STATE" });
    expect(citizenship.jurisdictions).toEqual(["EU_MEMBER_STATE", "EEA"]);
  });

  it("formats structured requirements and falls back to miscellaneous legacy text", () => {
    expect(formatOpportunityRequirement({ type: "completed_education", level: "bachelors", operator: "at_least" }))
      .toBe("Bachelor's or higher");
    expect(summarizeOpportunityRequirements({ requirements: "Must be available in June." })).toBe("Must be available in June.");
  });

  it("rejects a non-list structured requirement payload", () => {
    expect(validateStandardizedRequirements({ type: "work_mode" })).toEqual(["Standardized requirements must be a list."]);
  });
});
