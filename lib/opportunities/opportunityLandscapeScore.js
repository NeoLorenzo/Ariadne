export const OPPORTUNITY_LANDSCAPE_SCORE_METHOD_VERSION = "1";

export const OPPORTUNITY_LANDSCAPE_SCORE_DIMENSIONS = [
  "strategicRelevance",
  "upside",
  "optionValue",
  "opportunityCostEfficiency",
  "eligibility",
  "competitiveness",
  "careerStageFit",
  "timingActionability"
];

function scoreDimension(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 4 ? number : null;
}

function coordinateFromDimensions(values) {
  if (values.some((value) => value === null)) return null;
  return (values.reduce((sum, value) => sum + value, 0) / 16) * 100;
}

export function calculateOpportunityLandscapeCoordinates(input = {}) {
  const strategic = [
    scoreDimension(input.strategicRelevance ?? input.strategic_relevance),
    scoreDimension(input.upside),
    scoreDimension(input.optionValue ?? input.option_value),
    scoreDimension(input.opportunityCostEfficiency ?? input.opportunity_cost_efficiency)
  ];
  const attainable = [
    scoreDimension(input.eligibility),
    scoreDimension(input.competitiveness),
    scoreDimension(input.careerStageFit ?? input.career_stage_fit),
    scoreDimension(input.timingActionability ?? input.timing_actionability)
  ];

  return {
    strategicValue: coordinateFromDimensions(strategic),
    attainability: coordinateFromDimensions(attainable)
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
    timingActionability: scoreDimension(row.timingActionability ?? row.timing_actionability)
  };
  const derived = calculateOpportunityLandscapeCoordinates(dimensions);
  const strategicValue = Number(row.strategicValue ?? row.strategic_value);
  const attainability = Number(row.attainability);

  return {
    opportunityId: String(row.opportunityId ?? row.opportunity_id ?? "").trim(),
    userId: String(row.userId ?? row.user_id ?? "").trim(),
    ...dimensions,
    strategicValue: Number.isFinite(strategicValue) ? strategicValue : derived.strategicValue,
    attainability: Number.isFinite(attainability) ? attainability : derived.attainability,
    strategicValueRationale: String(row.strategicValueRationale ?? row.strategic_value_rationale ?? "").trim(),
    attainabilityRationale: String(row.attainabilityRationale ?? row.attainability_rationale ?? "").trim(),
    methodologyVersion: String(row.methodologyVersion ?? row.methodology_version ?? OPPORTUNITY_LANDSCAPE_SCORE_METHOD_VERSION),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? "")
  };
}
