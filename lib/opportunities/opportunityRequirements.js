export const OPPORTUNITY_REQUIREMENT_TYPES = [
  "age",
  "completed_education",
  "current_education",
  "degree_subject",
  "academic_performance",
  "graduation_timing",
  "professional_experience",
  "research_experience",
  "technical_skill",
  "quantitative_ability",
  "domain_knowledge",
  "language_proficiency",
  "citizenship",
  "residency",
  "work_authorization",
  "security_clearance",
  "work_mode",
  "travel_requirement",
  "time_commitment",
  "availability_window",
  "concurrent_study",
  "institutional_affiliation",
  "application_geography",
  "prior_prerequisite",
  "evidence"
];

export const OPPORTUNITY_REQUIREMENT_TYPE_LABELS = {
  age: "Age",
  completed_education: "Completed education",
  current_education: "Current education",
  degree_subject: "Degree subject",
  academic_performance: "Academic performance",
  graduation_timing: "Graduation timing",
  professional_experience: "Professional experience",
  research_experience: "Research experience",
  technical_skill: "Technical skill",
  quantitative_ability: "Quantitative ability",
  domain_knowledge: "Domain knowledge",
  language_proficiency: "Language proficiency",
  citizenship: "Citizenship",
  residency: "Residency",
  work_authorization: "Work authorization",
  security_clearance: "Security clearance",
  work_mode: "Work mode",
  travel_requirement: "Travel requirement",
  time_commitment: "Time commitment",
  availability_window: "Availability window",
  concurrent_study: "Concurrent study",
  institutional_affiliation: "Institutional affiliation",
  application_geography: "Application geography",
  prior_prerequisite: "Prior course / prerequisite",
  evidence: "Portfolio / evidence"
};

export const REQUIREMENT_NECESSITIES = ["hard_requirement", "preferred", "competitive_signal", "allowed_exception"];
export const REQUIREMENT_NECESSITY_LABELS = {
  hard_requirement: "Hard requirement",
  preferred: "Preferred",
  competitive_signal: "Competitive signal",
  allowed_exception: "Allowed exception"
};

export const LEGACY_REQUIREMENT_NECESSITY_ALIASES = {
  required: "hard_requirement",
  preferred: "preferred",
  advantageous: "competitive_signal",
  permitted_exception: "allowed_exception"
};

export const REQUIREMENT_STATES = ["constraint", "unrestricted"];
export const REQUIREMENT_STATE_LABELS = { constraint: "Constraint", unrestricted: "No restriction" };
export const REQUIREMENT_EVALUATION_TIMES = ["unspecified", "application_date", "programme_start", "throughout_programme", "programme_end", "specific_date"];
export const REQUIREMENT_EVALUATION_TIME_LABELS = {
  unspecified: "Timing unspecified",
  application_date: "At application",
  programme_start: "At programme start",
  throughout_programme: "Throughout programme",
  programme_end: "At programme end",
  specific_date: "On a specific date"
};
export const REQUIREMENT_GROUP_OPERATORS = ["AND", "OR", "AT_LEAST_N"];

export const COMPLETED_EDUCATION_LEVELS = ["none", "secondary", "associate_or_equivalent", "bachelors", "masters", "doctorate", "professional_degree"];
export const CURRENT_EDUCATION_LEVELS = ["secondary", "undergraduate", "masters", "doctoral", "postdoctoral", "any_student"];
export const CURRENT_EDUCATION_STATUSES = ["currently_enrolled", "must_remain_enrolled", "final_year", "graduating", "not_currently_studying"];
export const EDUCATION_OPERATORS = ["exactly", "at_least", "at_most"];
export const TIME_COMMITMENT_TYPES = ["full_time", "part_time", "flexible", "occasional", "project_based"];
export const PROFESSIONAL_CAREER_STAGES = ["no_experience_required", "student", "entry_level", "early_career", "mid_career", "senior", "executive", "unspecified"];
export const CITIZENSHIP_MATCH_MODES = ["any_of", "all_of", "none_of"];
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "native_or_bilingual"];
export const LANGUAGE_SKILL_SCOPES = ["general", "spoken", "written", "reading", "professional"];
export const ACADEMIC_GRADING_SYSTEMS = ["UK_HONOURS", "GPA_4", "GPA_5", "PERCENTAGE", "CLASS_RANK", "INSTITUTION_DEFINED"];
export const COMPARISON_OPERATORS = ["exactly", "at_least", "at_most"];
export const DATE_COMPARISON_OPERATORS = ["on", "before", "after", "on_or_before", "on_or_after"];
export const WORK_AUTHORIZATION_REQUIREMENTS = ["must_already_have", "must_be_eligible_to_obtain", "can_require_sponsorship", "not_required", "unknown"];
export const SPONSORSHIP_STATUSES = ["available", "not_available", "case_by_case", "not_applicable", "unknown"];
export const WORK_MODES = ["in_person", "hybrid", "remote", "remote_with_travel", "location_flexible"];
export const SKILL_LEVELS = ["basic", "intermediate", "proficient", "advanced", "expert"];
export const SECURITY_CLEARANCE_REQUIREMENTS = ["must_hold", "eligible_to_obtain"];
export const EVIDENCE_TYPES = ["publication", "portfolio", "completed_project", "prototype", "work_sample", "other"];
export const APPLICATION_COMPONENT_TYPES = ["cv_resume", "cover_letter", "references", "writing_sample", "research_proposal", "abstract", "transcript", "portfolio", "screencast", "application_form", "other"];
export const APPLICATION_COMPONENT_TYPE_LABELS = {
  cv_resume: "CV / résumé",
  cover_letter: "Cover letter",
  references: "References",
  writing_sample: "Writing sample",
  research_proposal: "Research proposal",
  abstract: "Abstract",
  transcript: "Transcript",
  portfolio: "Portfolio",
  screencast: "Screencast",
  application_form: "Application form",
  other: "Other"
};

const TYPE_SET = new Set(OPPORTUNITY_REQUIREMENT_TYPES);
const NECESSITY_SET = new Set(REQUIREMENT_NECESSITIES);
const GROUP_OPERATOR_SET = new Set(REQUIREMENT_GROUP_OPERATORS);

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function enumValue(value, allowed, fallback = "") { const normalized = text(value); return allowed.includes(normalized) ? normalized : fallback; }
function numberOrNull(value) { if (value === "" || value === null || value === undefined) return null; const normalized = Number(value); return Number.isFinite(normalized) && normalized >= 0 ? normalized : null; }
function boolOrDefault(value, fallback = false) { return value === true || value === false ? value : fallback; }
function stringList(value) { const values = Array.isArray(value) ? value : text(value).split(","); return [...new Set(values.map(text).filter(Boolean))]; }
function pretty(value) { return text(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function dateOnly(value) { const normalized = text(value); return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ""; }

export function normalizeRequirementNecessity(value) {
  const normalized = text(value).toLowerCase();
  if (NECESSITY_SET.has(normalized)) return normalized;
  return LEGACY_REQUIREMENT_NECESSITY_ALIASES[normalized] || "hard_requirement";
}

export function makeOpportunityRequirementId(prefix = "requirement") {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

export function createOpportunityRequirement(type = "completed_education") {
  return normalizeOpportunityRequirement({ id: makeOpportunityRequirementId(), kind: "requirement", type, necessity: "hard_requirement" });
}

export function createRequirementGroup(operator = "OR") {
  return normalizeRequirementNode({ id: makeOpportunityRequirementId("requirement-group"), kind: "group", operator, necessity: "hard_requirement", children: [] });
}

export function createApplicationComponent(componentType = "cv_resume") {
  return normalizeRequirementNode({ id: makeOpportunityRequirementId("application-component"), kind: "application_component", componentType, count: 1 });
}

export function createRequirementSource(rawText = "") {
  return { id: "requirements-source", kind: "source_text", rawText: text(rawText) };
}

function normalizeBaseRequirement(input, type) {
  return {
    id: text(input.id) || makeOpportunityRequirementId(),
    kind: "requirement",
    type,
    necessity: normalizeRequirementNecessity(input.necessity),
    requirementState: enumValue(input.requirementState ?? input.requirement_state, REQUIREMENT_STATES, "constraint"),
    evaluationTime: enumValue(input.evaluationTime ?? input.evaluation_time, REQUIREMENT_EVALUATION_TIMES, "unspecified"),
    evaluationDate: dateOnly(input.evaluationDate ?? input.evaluation_date),
    sourceText: text(input.sourceText ?? input.source_text)
  };
}

export function normalizeOpportunityRequirement(input = {}) {
  const type = text(input.type).toLowerCase();
  if (!TYPE_SET.has(type)) return null;
  const base = normalizeBaseRequirement(input, type);

  switch (type) {
    case "age": return { ...base, minAge: numberOrNull(input.minAge ?? input.min_age), maxAge: numberOrNull(input.maxAge ?? input.max_age) };
    case "completed_education": return { ...base, level: enumValue(input.level, COMPLETED_EDUCATION_LEVELS), operator: enumValue(input.operator, EDUCATION_OPERATORS, "at_least") };
    case "current_education": return { ...base, level: enumValue(input.level, CURRENT_EDUCATION_LEVELS), status: enumValue(input.status, CURRENT_EDUCATION_STATUSES) };
    case "degree_subject": return { ...base, subjects: stringList(input.subjects), matchMode: enumValue(input.matchMode ?? input.match_mode, CITIZENSHIP_MATCH_MODES, "any_of") };
    case "academic_performance": return { ...base, gradingSystem: enumValue(input.gradingSystem ?? input.grading_system, ACADEMIC_GRADING_SYSTEMS, "INSTITUTION_DEFINED"), threshold: text(input.threshold), operator: enumValue(input.operator, COMPARISON_OPERATORS, "at_least"), equivalentAllowed: boolOrDefault(input.equivalentAllowed ?? input.equivalent_allowed, true) };
    case "graduation_timing": return { ...base, operator: enumValue(input.operator, DATE_COMPARISON_OPERATORS, "on_or_before"), date: dateOnly(input.date), year: numberOrNull(input.year) };
    case "professional_experience": return { ...base, minYears: numberOrNull(input.minYears ?? input.min_years), maxYears: numberOrNull(input.maxYears ?? input.max_years), careerStage: enumValue(input.careerStage ?? input.career_stage, PROFESSIONAL_CAREER_STAGES, "unspecified"), experienceArea: text(input.experienceArea ?? input.experience_area) };
    case "research_experience": return { ...base, minYears: numberOrNull(input.minYears ?? input.min_years), area: text(input.area), publicationRequired: boolOrDefault(input.publicationRequired ?? input.publication_required, false) };
    case "technical_skill": return { ...base, skill: text(input.skill), minimumLevel: enumValue(input.minimumLevel ?? input.minimum_level, SKILL_LEVELS), evidenceRequired: boolOrDefault(input.evidenceRequired ?? input.evidence_required, false) };
    case "quantitative_ability": return { ...base, areas: stringList(input.areas), minimumLevel: enumValue(input.minimumLevel ?? input.minimum_level, SKILL_LEVELS) };
    case "domain_knowledge": return { ...base, domains: stringList(input.domains), minimumLevel: enumValue(input.minimumLevel ?? input.minimum_level, SKILL_LEVELS) };
    case "language_proficiency": return { ...base, language: text(input.language), minimumLevel: enumValue(input.minimumLevel ?? input.minimum_level, CEFR_LEVELS), framework: text(input.framework) || ((input.minimumLevel ?? input.minimum_level) ? "CEFR" : ""), skillScope: enumValue(input.skillScope ?? input.skill_scope, LANGUAGE_SKILL_SCOPES, "general"), rawLevel: text(input.rawLevel ?? input.raw_level) };
    case "citizenship": return { ...base, jurisdictions: stringList(input.jurisdictions), matchMode: enumValue(input.matchMode ?? input.match_mode, CITIZENSHIP_MATCH_MODES, "any_of") };
    case "residency": return { ...base, jurisdiction: text(input.jurisdiction), minYears: numberOrNull(input.minYears ?? input.min_years), windowYears: numberOrNull(input.windowYears ?? input.window_years), currentRequired: boolOrDefault(input.currentRequired ?? input.current_required, false) };
    case "work_authorization": return { ...base, jurisdiction: text(input.jurisdiction), authorizationRequirement: enumValue(input.authorizationRequirement ?? input.authorization_requirement, WORK_AUTHORIZATION_REQUIREMENTS, "unknown"), sponsorship: enumValue(input.sponsorship, SPONSORSHIP_STATUSES, "unknown"), relocationSupport: text(input.relocationSupport ?? input.relocation_support) };
    case "security_clearance": return { ...base, jurisdiction: text(input.jurisdiction), clearance: text(input.clearance), clearanceRequirement: enumValue(input.clearanceRequirement ?? input.clearance_requirement, SECURITY_CLEARANCE_REQUIREMENTS, "eligible_to_obtain") };
    case "work_mode": return { ...base, mode: enumValue(input.mode, WORK_MODES), primaryLocation: text(input.primaryLocation ?? input.primary_location), requiredTravel: text(input.requiredTravel ?? input.required_travel), attendanceFrequency: text(input.attendanceFrequency ?? input.attendance_frequency) };
    case "travel_requirement": return { ...base, destination: text(input.destination), frequency: text(input.frequency), minimumTrips: numberOrNull(input.minimumTrips ?? input.minimum_trips) };
    case "time_commitment": return { ...base, commitmentType: enumValue(input.commitmentType ?? input.commitment_type, TIME_COMMITMENT_TYPES), minHoursPerWeek: numberOrNull(input.minHoursPerWeek ?? input.min_hours_per_week), maxHoursPerWeek: numberOrNull(input.maxHoursPerWeek ?? input.max_hours_per_week), durationValue: numberOrNull(input.durationValue ?? input.duration_value), durationUnit: text(input.durationUnit ?? input.duration_unit), fixedSchedule: text(input.fixedSchedule ?? input.fixed_schedule) };
    case "availability_window": return { ...base, startDate: dateOnly(input.startDate ?? input.start_date), endDate: dateOnly(input.endDate ?? input.end_date), minDurationValue: numberOrNull(input.minDurationValue ?? input.min_duration_value), minDurationUnit: text(input.minDurationUnit ?? input.min_duration_unit) };
    case "concurrent_study": return { ...base, studyAllowed: boolOrDefault(input.studyAllowed ?? input.study_allowed, false) };
    case "institutional_affiliation": return { ...base, affiliations: stringList(input.affiliations), matchMode: enumValue(input.matchMode ?? input.match_mode, CITIZENSHIP_MATCH_MODES, "any_of") };
    case "application_geography": return { ...base, jurisdictions: stringList(input.jurisdictions), matchMode: enumValue(input.matchMode ?? input.match_mode, CITIZENSHIP_MATCH_MODES, "any_of") };
    case "prior_prerequisite": return { ...base, prerequisite: text(input.prerequisite), equivalentAllowed: boolOrDefault(input.equivalentAllowed ?? input.equivalent_allowed, true) };
    case "evidence": return { ...base, evidenceType: enumValue(input.evidenceType ?? input.evidence_type, EVIDENCE_TYPES, "other"), minCount: numberOrNull(input.minCount ?? input.min_count), topic: text(input.topic) };
    default: return null;
  }
}

export function normalizeRequirementNode(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const kind = text(input.kind).toLowerCase();
  if (kind === "group") {
    const operator = GROUP_OPERATOR_SET.has(text(input.operator).toUpperCase()) ? text(input.operator).toUpperCase() : "OR";
    return {
      id: text(input.id) || makeOpportunityRequirementId("requirement-group"),
      kind: "group",
      operator,
      minimumCount: operator === "AT_LEAST_N" ? Math.max(1, Number(input.minimumCount ?? input.minimum_count) || 1) : null,
      necessity: normalizeRequirementNecessity(input.necessity),
      label: text(input.label),
      sourceText: text(input.sourceText ?? input.source_text),
      children: (Array.isArray(input.children) ? input.children : []).map(normalizeRequirementNode).filter((node) => node && node.kind !== "source_text" && node.kind !== "application_component")
    };
  }
  if (kind === "application_component") {
    return {
      id: text(input.id) || makeOpportunityRequirementId("application-component"),
      kind: "application_component",
      componentType: enumValue(input.componentType ?? input.component_type, APPLICATION_COMPONENT_TYPES, "other"),
      count: Math.max(1, Number(input.count) || 1),
      details: text(input.details),
      sourceText: text(input.sourceText ?? input.source_text)
    };
  }
  if (kind === "source_text") {
    return { id: text(input.id) || "requirements-source", kind: "source_text", rawText: text(input.rawText ?? input.raw_text) };
  }
  return normalizeOpportunityRequirement(input);
}

export function normalizeStandardizedRequirements(value = []) {
  return (Array.isArray(value) ? value : []).map(normalizeRequirementNode).filter(Boolean);
}

export function getRequirementCriteriaNodes(value = []) {
  return normalizeStandardizedRequirements(value).filter((node) => node.kind === "requirement" || node.kind === "group");
}

export function flattenOpportunityRequirements(value = []) {
  const output = [];
  const visit = (node) => {
    if (!node) return;
    if (node.kind === "requirement") output.push(node);
    else if (node.kind === "group") node.children.forEach(visit);
  };
  getRequirementCriteriaNodes(value).forEach(visit);
  return output;
}

export function getApplicationComponents(value = []) {
  return normalizeStandardizedRequirements(value).filter((node) => node.kind === "application_component");
}

export function getRawRequirementsText(value = []) {
  return normalizeStandardizedRequirements(value).find((node) => node.kind === "source_text")?.rawText || "";
}

export function buildRequirementDocument({ criteria = [], applicationComponents = [], rawRequirementsText = "" } = {}) {
  const normalizedCriteria = (Array.isArray(criteria) ? criteria : []).map(normalizeRequirementNode).filter((node) => node && (node.kind === "requirement" || node.kind === "group"));
  const normalizedComponents = (Array.isArray(applicationComponents) ? applicationComponents : []).map(normalizeRequirementNode).filter((node) => node?.kind === "application_component");
  const source = text(rawRequirementsText) ? [createRequirementSource(rawRequirementsText)] : [];
  return [...normalizedCriteria, ...normalizedComponents, ...source];
}

function validateNode(node, path, errors) {
  if (!node) { errors.push(`${path} is invalid.`); return; }
  if (node.kind === "group") {
    if (!GROUP_OPERATOR_SET.has(node.operator)) errors.push(`${path} has an invalid group operator.`);
    if (!node.children.length) errors.push(`${path} must contain at least one requirement.`);
    if (node.operator === "AT_LEAST_N" && (!node.minimumCount || node.minimumCount > node.children.length)) errors.push(`${path} has an invalid minimum count.`);
    node.children.forEach((child, index) => validateNode(child, `${path}.${index + 1}`, errors));
    return;
  }
  if (node.kind === "application_component" || node.kind === "source_text") return;
  if (node.kind !== "requirement" || !TYPE_SET.has(node.type)) errors.push(`${path} has an invalid type.`);
  if (!NECESSITY_SET.has(node.necessity)) errors.push(`${path} has an invalid necessity.`);
}

export function validateStandardizedRequirements(value = []) {
  if (!Array.isArray(value)) return ["Standardized requirements must be a list."];
  const errors = [];
  normalizeStandardizedRequirements(value).forEach((node, index) => validateNode(node, `Requirement ${index + 1}`, errors));
  return errors;
}

function tokens(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 2); }
function sourceCoversClause(source, clause) {
  const sourceSet = new Set(tokens(source));
  const clauseTokens = tokens(clause);
  if (!sourceSet.size || clauseTokens.length < 2) return false;
  const overlap = clauseTokens.filter((token) => sourceSet.has(token)).length;
  return overlap / clauseTokens.length >= 0.85;
}

export function deriveResidualRequirementsText(value = "", standardizedRequirements = []) {
  const original = text(value);
  if (!original) return "";
  const sources = flattenOpportunityRequirements(standardizedRequirements).map((item) => item.sourceText).filter(Boolean)
    .concat(getApplicationComponents(standardizedRequirements).map((item) => item.sourceText).filter(Boolean));
  if (!sources.length) return original;
  const clauses = original.split(/(?<=[.!?])\s+|\s*;\s*/).map(text).filter(Boolean);
  const residual = clauses.filter((clause) => !sources.some((source) => sourceCoversClause(source, clause)));
  return residual.join(" ").replace(/\s+([,.!?])/g, "$1").trim();
}

function educationLevelLabel(value) {
  const labels = { none: "No completed degree", secondary: "Secondary education", associate_or_equivalent: "Associate or equivalent", bachelors: "Bachelor's", masters: "Master's", doctorate: "Doctorate", professional_degree: "Professional degree" };
  return labels[value] || pretty(value);
}
function operatorSuffix(operator) { if (operator === "at_least") return " or higher"; if (operator === "at_most") return " or lower"; return ""; }
function unrestrictedLabel(type) { return `No ${OPPORTUNITY_REQUIREMENT_TYPE_LABELS[type]?.toLowerCase() || "requirement"} restriction`; }

export function formatOpportunityRequirement(input = {}) {
  const requirement = normalizeOpportunityRequirement(input);
  if (!requirement) return "";
  if (requirement.requirementState === "unrestricted") return unrestrictedLabel(requirement.type);
  switch (requirement.type) {
    case "age": return requirement.minAge !== null || requirement.maxAge !== null ? `Age ${requirement.minAge ?? ""}${requirement.minAge !== null && requirement.maxAge !== null ? "–" : requirement.minAge !== null ? "+" : `≤${requirement.maxAge}`}${requirement.minAge !== null && requirement.maxAge !== null ? requirement.maxAge : ""}` : "Age";
    case "completed_education": return requirement.level ? `${educationLevelLabel(requirement.level)}${operatorSuffix(requirement.operator)}` : "Completed education";
    case "current_education": return [pretty(requirement.level), pretty(requirement.status)].filter(Boolean).join(" · ") || "Current education";
    case "degree_subject": return requirement.subjects.length ? `Degree: ${requirement.subjects.join(" / ")}` : "Degree subject";
    case "academic_performance": return [pretty(requirement.gradingSystem), requirement.threshold ? `${requirement.threshold}${operatorSuffix(requirement.operator)}` : ""].filter(Boolean).join(" · ") || "Academic performance";
    case "graduation_timing": return `Graduate ${pretty(requirement.operator)} ${requirement.date || requirement.year || "specified date"}`;
    case "professional_experience": { const years = requirement.minYears !== null ? `${requirement.minYears}${requirement.maxYears !== null ? `–${requirement.maxYears}` : "+"} years` : ""; return [years, requirement.careerStage !== "unspecified" ? pretty(requirement.careerStage) : "", requirement.experienceArea].filter(Boolean).join(" · ") || "Professional experience"; }
    case "research_experience": return [requirement.minYears !== null ? `${requirement.minYears}+ years research` : "Research experience", requirement.area, requirement.publicationRequired ? "Publication required" : ""].filter(Boolean).join(" · ");
    case "technical_skill": return [requirement.skill || "Technical skill", pretty(requirement.minimumLevel), requirement.evidenceRequired ? "Evidence required" : ""].filter(Boolean).join(" · ");
    case "quantitative_ability": return [requirement.areas.join(" / ") || "Quantitative ability", pretty(requirement.minimumLevel)].filter(Boolean).join(" · ");
    case "domain_knowledge": return [requirement.domains.join(" / ") || "Domain knowledge", pretty(requirement.minimumLevel)].filter(Boolean).join(" · ");
    case "language_proficiency": return [requirement.language, requirement.minimumLevel || requirement.rawLevel].filter(Boolean).join(" · ") || "Language proficiency";
    case "citizenship": return requirement.jurisdictions.length ? `Citizen: ${requirement.jurisdictions.join(" / ")}` : "Citizenship";
    case "residency": return [requirement.jurisdiction || "Residency", requirement.minYears !== null ? `${requirement.minYears}+ of ${requirement.windowYears || requirement.minYears} years` : "", requirement.currentRequired ? "Current resident" : ""].filter(Boolean).join(" · ");
    case "work_authorization": return [requirement.jurisdiction, pretty(requirement.authorizationRequirement), requirement.sponsorship !== "unknown" ? pretty(requirement.sponsorship) : ""].filter(Boolean).join(" · ") || "Work authorization";
    case "security_clearance": return [requirement.clearance || "Security clearance", requirement.jurisdiction, pretty(requirement.clearanceRequirement)].filter(Boolean).join(" · ");
    case "work_mode": return [pretty(requirement.mode), requirement.primaryLocation].filter(Boolean).join(" · ") || "Work mode";
    case "travel_requirement": return ["Travel", requirement.destination, requirement.frequency, requirement.minimumTrips !== null ? `${requirement.minimumTrips}+ trips` : ""].filter(Boolean).join(" · ");
    case "time_commitment": { const hours = requirement.minHoursPerWeek !== null ? `${requirement.minHoursPerWeek}${requirement.maxHoursPerWeek !== null ? `–${requirement.maxHoursPerWeek}` : "+"} hrs/week` : ""; const duration = requirement.durationValue !== null ? `${requirement.durationValue} ${requirement.durationUnit || "units"}` : ""; return [pretty(requirement.commitmentType), hours, duration].filter(Boolean).join(" · ") || "Time commitment"; }
    case "availability_window": return ["Available", requirement.startDate && requirement.endDate ? `${requirement.startDate} → ${requirement.endDate}` : requirement.startDate || requirement.endDate, requirement.minDurationValue !== null ? `${requirement.minDurationValue} ${requirement.minDurationUnit}` : ""].filter(Boolean).join(" · ");
    case "concurrent_study": return requirement.studyAllowed ? "Concurrent study allowed" : "Cannot study concurrently";
    case "institutional_affiliation": return requirement.affiliations.length ? `Affiliation: ${requirement.affiliations.join(" / ")}` : "Institutional affiliation";
    case "application_geography": return requirement.jurisdictions.length ? `Application geography: ${requirement.jurisdictions.join(" / ")}` : "Application geography";
    case "prior_prerequisite": return requirement.prerequisite || "Prior course / prerequisite";
    case "evidence": return [pretty(requirement.evidenceType), requirement.minCount !== null ? `${requirement.minCount}+` : "", requirement.topic].filter(Boolean).join(" · ") || "Portfolio / evidence";
    default: return "";
  }
}

export function summarizeOpportunityRequirements(opportunity = {}, limit = 3) {
  const structured = flattenOpportunityRequirements(opportunity.standardizedRequirements ?? opportunity.standardized_requirements);
  const summaries = structured.map(formatOpportunityRequirement).filter(Boolean);
  const shown = summaries.slice(0, limit);
  if (summaries.length > limit) shown.push(`+${summaries.length - limit} more`);
  if (shown.length) return shown.join("; ");
  return deriveResidualRequirementsText(opportunity.miscRequirements ?? opportunity.misc_requirements ?? opportunity.requirements, opportunity.standardizedRequirements ?? opportunity.standardized_requirements);
}
