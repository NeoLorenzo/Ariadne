import { describe, expect, it } from "vitest";
import {
  buildRequirementDocument,
  createApplicationComponent,
  createRequirementGroup,
  deriveResidualRequirementsText,
  flattenOpportunityRequirements,
  formatOpportunityRequirement,
  getApplicationComponents,
  getRawRequirementsText,
  normalizeOpportunityRequirement,
  normalizeStandardizedRequirements,
  validateStandardizedRequirements
} from "./opportunityRequirements";

describe("opportunity requirements", () => {
  it("normalizes legacy necessity values into the v2 vocabulary", () => {
    expect(normalizeOpportunityRequirement({ type: "age", minAge: 18, necessity: "required" }).necessity).toBe("hard_requirement");
    expect(normalizeOpportunityRequirement({ type: "research_experience", necessity: "advantageous" }).necessity).toBe("competitive_signal");
  });

  it("supports the expanded requirement families without inventing qualitative levels", () => {
    const language = normalizeOpportunityRequirement({ type: "language_proficiency", language: " English ", rawLevel: "excellent", necessity: "hard_requirement" });
    const residency = normalizeOpportunityRequirement({ type: "residency", jurisdiction: "UK", minYears: 3, windowYears: 5 });
    expect(language).toMatchObject({ language: "English", minimumLevel: "", rawLevel: "excellent", framework: "" });
    expect(residency).toMatchObject({ jurisdiction: "UK", minYears: 3, windowYears: 5 });
  });

  it("normalizes recursive AND/OR groups and flattens eligibility leaves", () => {
    const group = createRequirementGroup("OR");
    group.children = [
      { id: "english", type: "language_proficiency", language: "English", necessity: "required" },
      { id: "french", type: "language_proficiency", language: "French", necessity: "required" }
    ];
    const document = normalizeStandardizedRequirements([group]);
    expect(document[0]).toMatchObject({ kind: "group", operator: "OR", necessity: "hard_requirement" });
    expect(flattenOpportunityRequirements(document).map((item) => item.id)).toEqual(["english", "french"]);
  });

  it("keeps application components and raw source text outside eligibility leaves", () => {
    const component = createApplicationComponent("cv_resume");
    const document = buildRequirementDocument({
      criteria: [{ id: "degree", type: "completed_education", level: "bachelors" }],
      applicationComponents: [component],
      rawRequirementsText: "Bachelor's degree. Submit a CV."
    });
    expect(flattenOpportunityRequirements(document)).toHaveLength(1);
    expect(getApplicationComponents(document)).toHaveLength(1);
    expect(getRawRequirementsText(document)).toBe("Bachelor's degree. Submit a CV.");
  });

  it("removes only source clauses substantially covered by structured data", () => {
    const document = buildRequirementDocument({
      criteria: [{ id: "degree", type: "completed_education", level: "bachelors", sourceText: "Applicants must hold a bachelor's degree." }]
    });
    expect(deriveResidualRequirementsText("Applicants must hold a bachelor's degree. Strong writing is preferred.", document)).toBe("Strong writing is preferred.");
    expect(deriveResidualRequirementsText("Python fluency and full-time participation.", [{ id: "time", type: "time_commitment", sourceText: "Full-time participation" }])).toBe("Python fluency and full-time participation.");
  });

  it("formats unrestricted criteria explicitly", () => {
    expect(formatOpportunityRequirement({ type: "completed_education", requirementState: "unrestricted" })).toBe("No completed education restriction");
  });

  it("validates malformed groups", () => {
    expect(validateStandardizedRequirements([{ kind: "group", operator: "OR", children: [] }])[0]).toContain("at least one requirement");
  });
});
