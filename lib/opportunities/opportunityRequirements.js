export const OPPORTUNITY_REQUIREMENT_TYPES = [
  "completed_education",
  "current_education",
  "time_commitment",
  "professional_experience",
  "citizenship",
  "language_proficiency",
  "academic_performance",
  "work_authorization",
  "work_mode"
];

export const OPPORTUNITY_REQUIREMENT_TYPE_LABELS = {
  completed_education: "Completed education",
  current_education: "Current education",
  time_commitment: "Time commitment",
  professional_experience: "Professional experience",
  citizenship: "Citizenship",
  language_proficiency: "Language proficiency",
  academic_performance: "Academic performance",
  work_authorization: "Work authorization",
  work_mode: "Work mode"
};

export const REQUIREMENT_NECESSITIES = ["required", "preferred", "advantageous", "permitted_exception"];
export const REQUIREMENT_NECESSITY_LABELS = {
  required: "Required",
  preferred: "Preferred",
  advantageous: "Advantageous",
  permitted_exception: "Permitted exception"
};

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
export const WORK_AUTHORIZATION_REQUIREMENTS = ["must_already_have", "must_be_eligible_to_obtain", "can_require_sponsorship", "not_required", "unknown"];
export const SPONSORSHIP_STATUSES = ["available", "not_available", "case_by_case", "not_applicable", "unknown"];
export const WORK_MODES = ["in_person", "hybrid", "remote", "remote_with_travel", "location_flexible"];

const TYPE_SET = new Set(OPPORTUNITY_REQUIREMENT_TYPES);
const NECESSITY_SET = new Set(REQUIREMENT_NECESSITIES);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function enumValue(value, allowed, fallback = "") {
  const normalized = text(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function stringList(value) {
  const values = Array.isArray(value) ? value : text(value).split(",");
  return [...new Set(values.map(text).filter(Boolean))];
}

function pretty(value) {
  return text(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function makeOpportunityRequirementId() {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `requirement-${value}`;
}

export function createOpportunityRequirement(type = "completed_education") {
  return normalizeOpportunityRequirement({ id: makeOpportunityRequirementId(), type, necessity: "required" });
}

export function normalizeOpportunityRequirement(input = {}) {
  const type = text(input.type).toLowerCase();
  if (!TYPE_SET.has(type)) return null;

  const base = {
    id: text(input.id) || makeOpportunityRequirementId(),
    type,
    necessity: NECESSITY_SET.has(text(input.necessity)) ? text(input.necessity) : "required",
    sourceText: text(input.sourceText ?? input.source_text)
  };

  switch (type) {
    case "completed_education":
      return {
        ...base,
        level: enumValue(input.level, COMPLETED_EDUCATION_LEVELS),
        operator: enumValue(input.operator, EDUCATION_OPERATORS, "at_least")
      };
    case "current_education":
      return {
        ...base,
        level: enumValue(input.level, CURRENT_EDUCATION_LEVELS),
        status: enumValue(input.status, CURRENT_EDUCATION_STATUSES)
      };
    case "time_commitment":
      return {
        ...base,
        commitmentType: enumValue(input.commitmentType ?? input.commitment_type, TIME_COMMITMENT_TYPES),
        minHoursPerWeek: numberOrNull(input.minHoursPerWeek ?? input.min_hours_per_week),
        maxHoursPerWeek: numberOrNull(input.maxHoursPerWeek ?? input.max_hours_per_week),
        durationValue: numberOrNull(input.durationValue ?? input.duration_value),
        durationUnit: text(input.durationUnit ?? input.duration_unit),
        fixedSchedule: text(input.fixedSchedule ?? input.fixed_schedule)
      };
    case "professional_experience":
      return {
        ...base,
        minYears: numberOrNull(input.minYears ?? input.min_years),
        maxYears: numberOrNull(input.maxYears ?? input.max_years),
        careerStage: enumValue(input.careerStage ?? input.career_stage, PROFESSIONAL_CAREER_STAGES, "unspecified"),
        experienceArea: text(input.experienceArea ?? input.experience_area)
      };
    case "citizenship":
      return {
        ...base,
        jurisdictions: stringList(input.jurisdictions),
        matchMode: enumValue(input.matchMode ?? input.match_mode, CITIZENSHIP_MATCH_MODES, "any_of")
      };
    case "language_proficiency":
      return {
        ...base,
        language: text(input.language),
        minimumLevel: enumValue(input.minimumLevel ?? input.minimum_level, CEFR_LEVELS),
        framework: text(input.framework) || ((input.minimumLevel ?? input.minimum_level) ? "CEFR" : ""),
        skillScope: enumValue(input.skillScope ?? input.skill_scope, LANGUAGE_SKILL_SCOPES, "general"),
        rawLevel: text(input.rawLevel ?? input.raw_level)
      };
    case "academic_performance":
      return {
        ...base,
        gradingSystem: enumValue(input.gradingSystem ?? input.grading_system, ACADEMIC_GRADING_SYSTEMS, "INSTITUTION_DEFINED"),
        threshold: text(input.threshold),
        operator: enumValue(input.operator, COMPARISON_OPERATORS, "at_least"),
        equivalentAllowed: input.equivalentAllowed ?? input.equivalent_allowed ?? true
      };
    case "work_authorization":
      return {
        ...base,
        jurisdiction: text(input.jurisdiction),
        authorizationRequirement: enumValue(input.authorizationRequirement ?? input.authorization_requirement, WORK_AUTHORIZATION_REQUIREMENTS, "unknown"),
        sponsorship: enumValue(input.sponsorship, SPONSORSHIP_STATUSES, "unknown"),
        relocationSupport: text(input.relocationSupport ?? input.relocation_support)
      };
    case "work_mode":
      return {
        ...base,
        mode: enumValue(input.mode, WORK_MODES),
        primaryLocation: text(input.primaryLocation ?? input.primary_location),
        requiredTravel: text(input.requiredTravel ?? input.required_travel),
        attendanceFrequency: text(input.attendanceFrequency ?? input.attendance_frequency)
      };
    default:
      return null;
  }
}

export function normalizeStandardizedRequirements(value = []) {
  return (Array.isArray(value) ? value : [])
    .map(normalizeOpportunityRequirement)
    .filter(Boolean);
}

export function validateStandardizedRequirements(value = []) {
  if (!Array.isArray(value)) return ["Standardized requirements must be a list."];
  const errors = [];
  value.forEach((requirement, index) => {
    if (!TYPE_SET.has(text(requirement?.type).toLowerCase())) errors.push(`Requirement ${index + 1} has an invalid type.`);
    if (requirement?.necessity && !NECESSITY_SET.has(text(requirement.necessity))) errors.push(`Requirement ${index + 1} has an invalid necessity.`);
  });
  return errors;
}

function educationLevelLabel(value) {
  const labels = {
    none: "No completed degree",
    secondary: "Secondary education",
    associate_or_equivalent: "Associate or equivalent",
    bachelors: "Bachelor's",
    masters: "Master's",
    doctorate: "Doctorate",
    professional_degree: "Professional degree"
  };
  return labels[value] || pretty(value);
}

function operatorSuffix(operator) {
  if (operator === "at_least") return " or higher";
  if (operator === "at_most") return " or lower";
  return "";
}

export function formatOpportunityRequirement(input = {}) {
  const requirement = normalizeOpportunityRequirement(input);
  if (!requirement) return "";

  switch (requirement.type) {
    case "completed_education":
      return requirement.level ? `${educationLevelLabel(requirement.level)}${operatorSuffix(requirement.operator)}` : "Completed education";
    case "current_education":
      return [pretty(requirement.level), pretty(requirement.status)].filter(Boolean).join(" · ") || "Current education";
    case "time_commitment": {
      const hours = requirement.minHoursPerWeek !== null
        ? `${requirement.minHoursPerWeek}${requirement.maxHoursPerWeek !== null ? `–${requirement.maxHoursPerWeek}` : "+"} hrs/week`
        : "";
      const duration = requirement.durationValue !== null ? `${requirement.durationValue} ${requirement.durationUnit || "units"}` : "";
      return [pretty(requirement.commitmentType), hours, duration].filter(Boolean).join(" · ") || "Time commitment";
    }
    case "professional_experience": {
      const years = requirement.minYears !== null
        ? `${requirement.minYears}${requirement.maxYears !== null ? `–${requirement.maxYears}` : "+"} years`
        : "";
      return [years, requirement.careerStage !== "unspecified" ? pretty(requirement.careerStage) : "", requirement.experienceArea].filter(Boolean).join(" · ") || "Professional experience";
    }
    case "citizenship":
      return requirement.jurisdictions.length ? requirement.jurisdictions.join(", ") : "Citizenship";
    case "language_proficiency":
      return [requirement.language, requirement.minimumLevel || requirement.rawLevel].filter(Boolean).join(" · ") || "Language proficiency";
    case "academic_performance":
      return [pretty(requirement.gradingSystem), requirement.threshold ? `${requirement.threshold}${operatorSuffix(requirement.operator)}` : ""].filter(Boolean).join(" · ") || "Academic performance";
    case "work_authorization":
      return [requirement.jurisdiction, pretty(requirement.authorizationRequirement), pretty(requirement.sponsorship)].filter(Boolean).join(" · ") || "Work authorization";
    case "work_mode":
      return [pretty(requirement.mode), requirement.primaryLocation].filter(Boolean).join(" · ") || "Work mode";
    default:
      return "";
  }
}

export function summarizeOpportunityRequirements(opportunity = {}, limit = 3) {
  const structured = normalizeStandardizedRequirements(opportunity.standardizedRequirements ?? opportunity.standardized_requirements);
  const summaries = structured.map(formatOpportunityRequirement).filter(Boolean);
  const shown = summaries.slice(0, limit);
  if (summaries.length > limit) shown.push(`+${summaries.length - limit} more`);
  if (shown.length) return shown.join("; ");
  return text(opportunity.miscRequirements ?? opportunity.misc_requirements ?? opportunity.requirements);
}
