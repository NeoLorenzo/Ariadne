export const REQUIREMENT_ASSESSMENT_STATUSES = ["met", "not_met", "uncertain"];
export const REQUIREMENT_ASSESSMENT_SOURCES = ["user", "ai"];

export const REQUIREMENT_ASSESSMENT_LABELS = {
  met: "Meets",
  not_met: "Does not meet",
  uncertain: "Uncertain",
  unassessed: "Unassessed"
};

export const OPPORTUNITY_ELIGIBILITY_LABELS = {
  met: "Meets known requirements",
  not_met: "Definitely ineligible",
  uncertain: "Eligibility uncertain",
  unassessed: "Unassessed"
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeRequirementAssessment(input = {}) {
  const status = text(input.status).toLowerCase();
  const assessedBy = text(input.assessedBy ?? input.assessed_by).toLowerCase();
  const confidenceValue = input.confidence === null || input.confidence === undefined ? null : Number(input.confidence);
  return {
    id: text(input.id),
    userId: text(input.userId ?? input.user_id),
    entityType: text(input.entityType ?? input.entity_type),
    entityId: text(input.entityId ?? input.entity_id),
    requirementId: text(input.requirementId ?? input.requirement_id),
    status: REQUIREMENT_ASSESSMENT_STATUSES.includes(status) ? status : "uncertain",
    assessedBy: REQUIREMENT_ASSESSMENT_SOURCES.includes(assessedBy) ? assessedBy : "ai",
    confidence: Number.isFinite(confidenceValue) && confidenceValue >= 0 && confidenceValue <= 1 ? confidenceValue : null,
    rationale: text(input.rationale),
    evidence: input.evidence && typeof input.evidence === "object" && !Array.isArray(input.evidence) ? input.evidence : {},
    createdAt: text(input.createdAt ?? input.created_at),
    updatedAt: text(input.updatedAt ?? input.updated_at)
  };
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getEffectiveRequirementAssessment(assessments = [], requirementId = "") {
  const matching = (Array.isArray(assessments) ? assessments : [])
    .map(normalizeRequirementAssessment)
    .filter((assessment) => assessment.requirementId === requirementId);

  const manual = matching
    .filter((assessment) => assessment.assessedBy === "user")
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0];
  if (manual) return manual;

  return matching
    .filter((assessment) => assessment.assessedBy === "ai")
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0] || null;
}

export function indexEffectiveRequirementAssessments(assessments = []) {
  const ids = [...new Set((Array.isArray(assessments) ? assessments : []).map((assessment) => text(assessment?.requirementId ?? assessment?.requirement_id)).filter(Boolean))];
  return Object.fromEntries(ids.map((requirementId) => [requirementId, getEffectiveRequirementAssessment(assessments, requirementId)]));
}

export function deriveOpportunityEligibility(requirements = [], assessments = []) {
  const required = (Array.isArray(requirements) ? requirements : []).filter((requirement) => requirement?.necessity === "required");
  if (!required.length) return "unassessed";

  const statuses = required.map((requirement) => getEffectiveRequirementAssessment(assessments, requirement.id)?.status || "unassessed");
  if (statuses.includes("not_met")) return "not_met";
  if (statuses.every((status) => status === "met")) return "met";
  return "uncertain";
}
