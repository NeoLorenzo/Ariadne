import { describe, expect, it } from "vitest";
import {
  getRequirementExtractionCoverage,
  inferApplicationComponentType,
  repairLegacyApplicationComponentTuple,
  repairRequirementDocument,
  validateRequirementDocumentIntegrity
} from "./opportunityRequirementIntegrity";

describe("opportunity requirement integrity", () => {
  it("maps common legacy application labels to canonical component types", () => {
    expect(inferApplicationComponentType("CV/resume")).toBe("cv_resume");
    expect(inferApplicationComponentType("degree transcripts")).toBe("transcript");
    expect(inferApplicationComponentType("two referees")).toBe("references");
    expect(inferApplicationComponentType("online application")).toBe("application_form");
    expect(inferApplicationComponentType("personal statement questions")).toBe("other");
  });

  it("repairs legacy tuple application components", () => {
    expect(repairLegacyApplicationComponentTuple([
      "two referees",
      { kind: "application_component" }
    ], 0)).toMatchObject({
      kind: "application_component",
      componentType: "references",
      count: 2,
      sourceText: "two referees"
    });
  });

  it("repairs and deduplicates a mixed requirement document without discarding criteria", () => {
    const criterion = {
      id: "degree",
      kind: "requirement",
      type: "completed_education",
      necessity: "hard_requirement",
      sourceText: "Bachelor's degree required."
    };

    const repaired = repairRequirementDocument({
      standardizedRequirements: [
        ["CV", { kind: "application_component" }],
        criterion,
        { id: "requirements-source", kind: "source_text", rawText: "Bachelor's degree required; CV." }
      ],
      applicationComponents: [
        ["CV", { kind: "application_component" }]
      ]
    });

    expect(repaired.repairedCount).toBe(2);
    expect(repaired.standardizedRequirements).toContainEqual(criterion);
    expect(repaired.applicationComponents).toHaveLength(1);
    expect(repaired.applicationComponents[0]).toMatchObject({
      componentType: "cv_resume",
      sourceText: "CV"
    });
    expect(repaired.rawRequirementsText).toBe("Bachelor's degree required; CV.");
    expect(validateRequirementDocumentIntegrity(repaired)).toEqual([]);
  });

  it("rejects legacy tuple/array nodes as structurally invalid", () => {
    expect(validateRequirementDocumentIntegrity({
      standardizedRequirements: [
        ["CV", { kind: "application_component" }]
      ],
      applicationComponents: []
    })).toEqual([
      "standardizedRequirements[0] must be an object; legacy tuple/array nodes are not allowed."
    ]);
  });

  it("treats incomplete source descriptions as unknown extraction coverage", () => {
    expect(getRequirementExtractionCoverage({
      standardizedRequirements: [],
      rawRequirementsText: "",
      descriptionIsExcerpt: true
    })).toMatchObject({ status: "unknown" });
  });

  it("marks source text without structured eligibility criteria as incomplete", () => {
    expect(getRequirementExtractionCoverage({
      standardizedRequirements: [
        { id: "requirements-source", kind: "source_text", rawText: "Bachelor's degree required." }
      ]
    })).toMatchObject({ status: "incomplete" });
  });
});
