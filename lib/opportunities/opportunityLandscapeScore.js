export const OPPORTUNITY_LANDSCAPE_SCORE_METHOD_VERSION = "2";
export const OPPORTUNITY_LANDSCAPE_LEGACY_SCORE_METHOD_VERSION = "1";
export const OPPORTUNITY_LANDSCAPE_HIGH_THRESHOLD = 75;

export const OPPORTUNITY_LANDSCAPE_STRATEGIC_DIMENSIONS = [
  "strategicRelevance",
  "upside",
  "optionValue",
  "opportunityCostEfficiency"
];

export const OPPORTUNITY_LANDSCAPE_ATTAINABILITY_V2_DIMENSIONS = [
  "capabilityMatch",
  "relevantExperience",
  "evidenceStrength",
  "domainFit",
  "competitiveBarFit",
  "differentiation"
];

export const OPPORTUNITY_LANDSCAPE_SCORE_DIMENSIONS = [
  ...OPPORTUNITY_LANDSCAPE_STRATEGIC_DIMENSIONS,
  "eligibility",
  ...OPPORTUNITY_LANDSCAPE_ATTAINABILITY_V2_DIMENSIONS
];

const ELIGIBILITY_MULTIPLIERS = {
  0: 0,
  1: 0.4,
  2: 0.7,
  3: 0.9,
  4: 1
};

const COMPETITIVE_STRENGTH_WEIGHTS = {
  capabilityMatch: 0.25,
  relevantExperience: 0.20,
  evidenceStrength: 0.20,
  domainFit: 0.15,
  competitiveBarFit: 0.15,
  differentiation: 0.05
};

function scoreDimension(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 4 ? number : null;
}

function coordinateFromDimensions(values) {
  if (values.some((value) => value === null)) return null;
  return (values.reduce((sum, value) => sum + value, 0) / (values.length * 4)) * 100;
}

export function eligibilityMultiplier(value) {
  const score = scoreDimension(value);
  return score === null ? null : ELIGIBILITY_MULTIPLIERS[score];
}

export function calculateCompetitiveStrength(input = {}) {
  const values = {
    capabilityMatch: scoreDimension(input.capabilityMatch ?? input.capability_match),
    relevantExperience: scoreDimension(input.relevantExperience ?? input.relevant_experience),
    evidenceStrength: scoreDimension(input.evidenceStrength ?? input.evidence_strength),
    domainFit: scoreDimension(input.domainFit ?? input.domain_fit),
    competitiveBarFit: scoreDimension(input.competitiveBarFit ?? input.competitive_bar_fit),
    differentiation: scoreDimension(input.differentiation)
  };
  if (Object.values(values).some((value) => value === null)) return null;

  const weighted = Object.entries(COMPETITIVE_STRENGTH_WEIGHTS)
    .reduce((sum, [key, weight]) => sum + values[key] * weight, 0);
  return (weighted / 4) * 100;
}

export function calculateOpportunityLandscapeCoordinates(input = {}) {
  const strategic = [
    scoreDimension(input.strategicRelevance ?? input.strategic_relevance),
    scoreDimension(input.upside),
    scoreDimension(input.optionValue ?? input.option_value),
    scoreDimension(input.opportunityCostEfficiency ?? input.opportunity_cost_efficiency)
  ];
  const legacyAttainable = [
    scoreDimension(input.eligibility),
    scoreDimension(input.competitiveness),
    scoreDimension(input.careerStageFit ?? input.career_stage_fit),
    scoreDimension(input.timingActionability ?? input.timing_actionability)
  ];

  const methodologyVersion = String(input.methodologyVersion ?? input.methodology_version ?? OPPORTUNITY_LANDSCAPE_LEGACY_SCORE_METHOD_VERSION);
  const competitiveStrength = calculateCompetitiveStrength(input);
  const multiplier = eligibilityMultiplier(input.eligibility);
  const v2Attainability = competitiveStrength === null || multiplier === null
    ? null
    : competitiveStrength * multiplier;

  return {
    strategicValue: coordinateFromDimensions(strategic),
    legacyAttainability: coordinateFromDimensions(legacyAttainable),
    competitiveStrength,
    eligibilityMultiplier: multiplier,
    attainability: methodologyVersion === "2"
      ? v2Attainability
      : coordinateFromDimensions(legacyAttainable)
  };
}

export function normalizeOpportunityLandscapeScore(row = {}) {
  const dimensions = {
    strategicRelevance: scoreDimension(row.strategicRelevance ?? row.strategic_relevance),
    upside: scoreDimension(row.upside),
    optionValue: scoreDimension(row.optionValue ?? row.option_value),
    opportunityCostEfficiency: scoreDimension(row.opportunityCostEfficiency ?? row.opportunity_cost_efficiency),
    eligibility: scoreDimension(row.eligibility),
    competitiveness: scoreDimension(row.competitiveness),
    careerStageFit: scoreDimension(row.careerStageFit ?? row.career_stage_fit),
    timingActionability: scoreDimension(row.timingActionability ?? row.timing_actionability),
    capabilityMatch: scoreDimension(row.capabilityMatch ?? row.capability_match),
    relevantExperience: scoreDimension(row.relevantExperience ?? row.relevant_experience),
    evidenceStrength: scoreDimension(row.evidenceStrength ?? row.evidence_strength),
    domainFit: scoreDimension(row.domainFit ?? row.domain_fit),
    competitiveBarFit: scoreDimension(row.competitiveBarFit ?? row.competitive_bar_fit),
    differentiation: scoreDimension(row.differentiation)
  };
  const methodologyVersion = String(
    row.methodologyVersion
      ?? row.methodology_version
      ?? OPPORTUNITY_LANDSCAPE_LEGACY_SCORE_METHOD_VERSION
  );
  const derived = calculateOpportunityLandscapeCoordinates({ ...dimensions, methodologyVersion });
  const strategicValue = Number(row.strategicValue ?? row.strategic_value);
  const legacyAttainability = Number(row.legacyAttainability ?? row.legacy_attainability);
  const competitiveStrength = Number(row.competitiveStrength ?? row.competitive_strength);
  const attainability = Number(row.attainability);

  return {
    opportunityId: String(row.opportunityId ?? row.opportunity_id ?? "").trim(),
    userId: String(row.userId ?? row.user_id ?? "").trim(),
    ...dimensions,
    strategicValue: Number.isFinite(strategicValue) ? strategicValue : derived.strategicValue,
    legacyAttainability: Number.isFinite(legacyAttainability) ? legacyAttainability : derived.legacyAttainability,
    competitiveStrength: Number.isFinite(competitiveStrength) ? competitiveStrength : derived.competitiveStrength,
    eligibilityMultiplier: derived.eligibilityMultiplier,
    attainability: Number.isFinite(attainability) ? attainability : derived.attainability,
    strategicValueRationale: String(row.strategicValueRationale ?? row.strategic_value_rationale ?? "").trim(),
    attainabilityRationale: String(row.attainabilityRationale ?? row.attainability_rationale ?? "").trim(),
    eligibilityRationale: String(row.eligibilityRationale ?? row.eligibility_rationale ?? "").trim(),
    capabilityMatchRationale: String(row.capabilityMatchRationale ?? row.capability_match_rationale ?? "").trim(),
    relevantExperienceRationale: String(row.relevantExperienceRationale ?? row.relevant_experience_rationale ?? "").trim(),
    evidenceStrengthRationale: String(row.evidenceStrengthRationale ?? row.evidence_strength_rationale ?? "").trim(),
    domainFitRationale: String(row.domainFitRationale ?? row.domain_fit_rationale ?? "").trim(),
    competitiveBarFitRationale: String(row.competitiveBarFitRationale ?? row.competitive_bar_fit_rationale ?? "").trim(),
    differentiationRationale: String(row.differentiationRationale ?? row.differentiation_rationale ?? "").trim(),
    methodologyVersion,
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? "")
  };
}
