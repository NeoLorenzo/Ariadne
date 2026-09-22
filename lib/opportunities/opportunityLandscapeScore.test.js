import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_LANDSCAPE_LEGACY_SCORE_METHOD_VERSION,
  OPPORTUNITY_LANDSCAPE_SCORE_METHOD_VERSION,
  calculateCompetitiveStrength,
  calculateOpportunityLandscapeCoordinates,
  eligibilityMultiplier,
  normalizeOpportunityLandscapeScore
} from "./opportunityLandscapeScore";

describe("opportunity landscape scoring", () => {
  it("preserves methodology v1 coordinate semantics for legacy rows", () => {
    expect(calculateOpportunityLandscapeCoordinates({
      methodologyVersion: "1",
      strategicRelevance: 4,
      upside: 3,
      optionValue: 2,
      opportunityCostEfficiency: 1,
      eligibility: 4,
      competitiveness: 4,
      careerStageFit: 3,
      timingActionability: 1
    })).toMatchObject({
      strategicValue: 62.5,
      legacyAttainability: 75,
      attainability: 75
    });
  });

  it("calculates competitive strength from the v2 weighted dimensions", () => {
    expect(calculateCompetitiveStrength({
      capabilityMatch: 2,
      relevantExperience: 1,
      evidenceStrength: 2,
      domainFit: 3,
      competitiveBarFit: 1,
      differentiation: 3
    })).toBeCloseTo(46.25);
  });

  it("applies eligibility as a v2 constraint rather than an equal-weight component", () => {
    expect(eligibilityMultiplier(4)).toBe(1);
    expect(eligibilityMultiplier(3)).toBe(0.9);
    expect(eligibilityMultiplier(2)).toBe(0.7);
    expect(eligibilityMultiplier(1)).toBe(0.4);
    expect(eligibilityMultiplier(0)).toBe(0);

    expect(calculateOpportunityLandscapeCoordinates({
      methodologyVersion: OPPORTUNITY_LANDSCAPE_SCORE_METHOD_VERSION,
      strategicRelevance: 4,
      upside: 3,
      optionValue: 2,
      opportunityCostEfficiency: 1,
      eligibility: 2,
      capabilityMatch: 2,
      relevantExperience: 1,
      evidenceStrength: 2,
      domainFit: 3,
      competitiveBarFit: 1,
      differentiation: 3
    })).toMatchObject({
      strategicValue: 62.5,
      competitiveStrength: 46.25,
      eligibilityMultiplier: 0.7,
      attainability: 32.375
    });
  });

  it("returns null rather than manufacturing a coordinate when required dimensions are invalid", () => {
    expect(calculateOpportunityLandscapeCoordinates({
      strategicRelevance: 5,
      upside: 3,
      optionValue: 2,
      opportunityCostEfficiency: 1
    }).strategicValue).toBeNull();

    expect(calculateOpportunityLandscapeCoordinates({
      methodologyVersion: "2",
      eligibility: 4,
      capabilityMatch: 2
    }).attainability).toBeNull();
  });

  it("normalizes legacy database rows without relabelling them as v2", () => {
    expect(normalizeOpportunityLandscapeScore({
      opportunity_id: "opp-1",
      user_id: "user-1",
      strategic_relevance: 4,
      upside: 4,
      option_value: 3,
      opportunity_cost_efficiency: 3,
      eligibility: 3,
      competitiveness: 2,
      career_stage_fit: 4,
      timing_actionability: 3,
      strategic_value: "87.50",
      legacy_attainability: "75.00",
      attainability: "75.00",
      methodology_version: "1"
    })).toMatchObject({
      opportunityId: "opp-1",
      strategicValue: 87.5,
      legacyAttainability: 75,
      attainability: 75,
      methodologyVersion: OPPORTUNITY_LANDSCAPE_LEGACY_SCORE_METHOD_VERSION
    });
  });

  it("normalizes v2 generated coordinates and component rationales", () => {
    expect(normalizeOpportunityLandscapeScore({
      opportunity_id: "opp-2",
      eligibility: 2,
      capability_match: 2,
      relevant_experience: 1,
      evidence_strength: 2,
      domain_fit: 3,
      competitive_bar_fit: 1,
      differentiation: 3,
      competitive_strength: "46.25",
      attainability: "32.38",
      capability_match_rationale: "Relevant but incomplete capability evidence.",
      methodology_version: "2"
    })).toMatchObject({
      opportunityId: "opp-2",
      eligibility: 2,
      capabilityMatch: 2,
      relevantExperience: 1,
      evidenceStrength: 2,
      domainFit: 3,
      competitiveBarFit: 1,
      differentiation: 3,
      competitiveStrength: 46.25,
      attainability: 32.38,
      capabilityMatchRationale: "Relevant but incomplete capability evidence.",
      methodologyVersion: OPPORTUNITY_LANDSCAPE_SCORE_METHOD_VERSION
    });
  });
});
