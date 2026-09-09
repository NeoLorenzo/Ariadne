import { describe, expect, it } from "vitest";
import {
  deriveOpportunityEligibility,
  getEffectiveRequirementAssessment,
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

  it("derives hard eligibility only from required requirements", () => {
    const requirements = [
      { id: "required", necessity: "required" },
      { id: "preferred", necessity: "preferred" }
    ];
    expect(deriveOpportunityEligibility(requirements, [
      { requirementId: "required", status: "met", assessedBy: "ai" },
      { requirementId: "preferred", status: "not_met", assessedBy: "ai" }
    ])).toBe("met");
  });

  it("returns not_met on a definite failed required requirement and uncertain for gaps", () => {
    const requirements = [{ id: "a", necessity: "required" }, { id: "b", necessity: "required" }];
    expect(deriveOpportunityEligibility(requirements, [
      { requirementId: "a", status: "met", assessedBy: "ai" },
      { requirementId: "b", status: "not_met", assessedBy: "ai" }
    ])).toBe("not_met");
    expect(deriveOpportunityEligibility(requirements, [
      { requirementId: "a", status: "met", assessedBy: "ai" }
    ])).toBe("uncertain");
  });

  it("normalizes confidence and snake-case database rows", () => {
    expect(normalizeRequirementAssessment({
      id: "x", user_id: "u", entity_type: "candidate", entity_id: "c", requirement_id: "r",
      status: "met", assessed_by: "ai", confidence: 0.9, evidence: { source: "kleos" }
    })).toMatchObject({ userId: "u", entityType: "candidate", entityId: "c", requirementId: "r", status: "met", assessedBy: "ai", confidence: 0.9 });
  });
});
