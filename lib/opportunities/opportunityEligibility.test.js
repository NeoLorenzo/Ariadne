import { describe, expect, it } from "vitest";
import {
  deriveOpportunityEligibility,
  deriveRequirementNodeEligibility,
  getEffectiveRequirementAssessment,
  getRequirementEligibilityStatus,
  normalizeRequirementAssessment
} from "./opportunityEligibility";

describe("opportunity eligibility", () => {
  it("prefers a user assessment over AI for the same requirement", () => {
    const assessments = [
      { requirementId: "r1", status: "not_met", assessedBy: "ai", updatedAt: "2026-09-09T10:00:00Z" },
      { requirementId: "r1", status: "met", assessedBy: "user", updatedAt: "2026-09-09T09:00:00Z" }
    ];
    expect(getEffectiveRequirementAssessment(assessments, "r1")).toMatchObject({ status: "met", assessedBy: "user" });
  });

  it("derives hard eligibility only from hard requirements while accepting legacy required", () => {
    const requirements = [
      { id: "required", type: "age", necessity: "required" },
      { id: "preferred", type: "research_experience", necessity: "preferred" }
    ];
    expect(deriveOpportunityEligibility(requirements, [
      { requirementId: "required", status: "met", assessedBy: "ai" },
      { requirementId: "preferred", status: "not_met", assessedBy: "ai" }
    ])).toBe("met");
  });

  it("evaluates OR groups without turning one failed branch into hard ineligibility", () => {
    const group = {
      id: "language-group",
      kind: "group",
      operator: "OR",
      necessity: "hard_requirement",
      children: [
        { id: "english", kind: "requirement", type: "language_proficiency", necessity: "hard_requirement" },
        { id: "french", kind: "requirement", type: "language_proficiency", necessity: "hard_requirement" }
      ]
    };
    const assessments = [
      { requirementId: "english", status: "not_met", assessedBy: "ai" },
      { requirementId: "french", status: "met", assessedBy: "ai" }
    ];
    expect(deriveRequirementNodeEligibility(group, assessments)).toBe("met");
    expect(deriveOpportunityEligibility([group], assessments)).toBe("met");
  });

  it("evaluates AT_LEAST_N groups conservatively", () => {
    const group = {
      id: "skills",
      kind: "group",
      operator: "AT_LEAST_N",
      minimumCount: 2,
      necessity: "hard_requirement",
      children: [
        { id: "a", kind: "requirement", type: "technical_skill" },
        { id: "b", kind: "requirement", type: "technical_skill" },
        { id: "c", kind: "requirement", type: "technical_skill" }
      ]
    };
    expect(deriveRequirementNodeEligibility(group, [
      { requirementId: "a", status: "met", assessedBy: "ai" },
      { requirementId: "b", status: "not_met", assessedBy: "ai" }
    ])).toBe("uncertain");
  });

  it("treats explicit unrestricted criteria as automatically met", () => {
    expect(getRequirementEligibilityStatus({ id: "degree", kind: "requirement", requirementState: "unrestricted" }, [])).toBe("met");
  });

  it("normalizes confidence and snake-case database rows", () => {
    expect(normalizeRequirementAssessment({
      id: "x", user_id: "u", entity_type: "candidate", entity_id: "c", requirement_id: "r",
      status: "met", assessed_by: "ai", confidence: 0.9, evidence: { source: "kleos" }
    })).toMatchObject({ userId: "u", entityType: "candidate", entityId: "c", requirementId: "r", status: "met", assessedBy: "ai", confidence: 0.9 });
  });
});
