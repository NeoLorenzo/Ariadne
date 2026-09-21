import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_LANDSCAPE_SCORE_METHOD_VERSION,
  calculateOpportunityLandscapeCoordinates,
  normalizeOpportunityLandscapeScore
} from "./opportunityLandscapeScore";

describe("opportunity landscape scoring", () => {
  it("calculates the canonical coordinates from four equally weighted 0-4 dimensions", () => {
    expect(calculateOpportunityLandscapeCoordinates({
      strategicRelevance: 4,
      upside: 3,
      optionValue: 2,
      opportunityCostEfficiency: 1,
      eligibility: 4,
      competitiveness: 4,
      careerStageFit: 3,
      timingActionability: 1
    })).toEqual({
      strategicValue: 62.5,
      attainability: 75
    });
  });

  it("returns null rather than manufacturing a coordinate when any dimension is invalid", () => {
    expect(calculateOpportunityLandscapeCoordinates({
      strategicRelevance: 5,
      upside: 3,
      optionValue: 2,
      opportunityCostEfficiency: 1
    }).strategicValue).toBeNull();
  });

  it("normalizes database rows and preserves database-generated coordinates", () => {
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
      attainability: "75.00",
      methodology_version: "1"
    })).toMatchObject({
      opportunityId: "opp-1",
      strategicValue: 87.5,
      attainability: 75,
      methodologyVersion: OPPORTUNITY_LANDSCAPE_SCORE_METHOD_VERSION
    });
  });
});
