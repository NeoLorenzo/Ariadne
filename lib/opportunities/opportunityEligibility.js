import {
  getRequirementCriteriaNodes,
  normalizeRequirementNecessity
} from "./opportunityRequirements";

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

function text(value) { return typeof value === "string" ? value.trim() : ""; }

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

function timestamp(value) { const parsed = Date.parse(String(value || "")); return Number.isNaN(parsed) ? 0 : parsed; }

export function getEffectiveRequirementAssessment(assessments = [], requirementId = "") {
  const matching = (Array.isArray(assessments) ? assessments : [])
    .map(normalizeRequirementAssessment)
    .filter((assessment) => assessment.requirementId === requirementId);

  const manual = matching.filter((assessment) => assessment.assessedBy === "user")
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0];
  if (manual) return manual;
  return matching.filter((assessment) => assessment.assessedBy === "ai")
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0] || null;
}

export function indexEffectiveRequirementAssessments(assessments = []) {
  const ids = [...new Set((Array.isArray(assessments) ? assessments : []).map((assessment) => text(assessment?.requirementId ?? assessment?.requirement_id)).filter(Boolean))];
  return Object.fromEntries(ids.map((requirementId) => [requirementId, getEffectiveRequirementAssessment(assessments, requirementId)]));
}

export function getRequirementEligibilityStatus(requirement, assessments = []) {
  if (requirement?.kind === "requirement" && requirement?.requirementState === "unrestricted") return "met";
  return getEffectiveRequirementAssessment(assessments, requirement?.id)?.status || "unassessed";
}

export function deriveRequirementNodeEligibility(node, assessments = []) {
  if (!node) return "unassessed";
  if (node.kind !== "group") return getRequirementEligibilityStatus(node, assessments);
  const statuses = (node.children || []).map((child) => deriveRequirementNodeEligibility(child, assessments));
  if (!statuses.length) return "unassessed";

  if (node.operator === "AND") {
    if (statuses.includes("not_met")) return "not_met";
    if (statuses.every((status) => status === "met")) return "met";
    return "uncertain";
  }

  if (node.operator === "AT_LEAST_N") {
    const needed = Math.max(1, Number(node.minimumCount) || 1);
    const met = statuses.filter((status) => status === "met").length;
    const potentiallyMet = statuses.filter((status) => status !== "not_met").length;
    if (met >= needed) return "met";
    if (potentiallyMet < needed) return "not_met";
    return "uncertain";
  }

  if (statuses.includes("met")) return "met";
  if (statuses.every((status) => status === "not_met")) return "not_met";
  return "uncertain";
}

export function deriveOpportunityEligibility(requirements = [], assessments = []) {
  const criteria = getRequirementCriteriaNodes(requirements);
  const hardRequirements = criteria.filter((node) => normalizeRequirementNecessity(node?.necessity) === "hard_requirement");
  if (!hardRequirements.length) return "unassessed";
  const statuses = hardRequirements.map((node) => deriveRequirementNodeEligibility(node, assessments));
  if (statuses.includes("not_met")) return "not_met";
  if (statuses.every((status) => status === "met")) return "met";
  return "uncertain";
}
