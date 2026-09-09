import {
  normalizeStandardizedRequirements,
  validateStandardizedRequirements
} from "./opportunityRequirements";

export const OPPORTUNITY_TYPES = [
  "job",
  "internship",
  "fellowship",
  "masters",
  "course",
  "program",
  "other"
];

export const OPPORTUNITY_TYPE_LABELS = {
  job: "Job",
  internship: "Internship",
  fellowship: "Fellowship",
  masters: "Master's",
  course: "Course",
  program: "Program",
  other: "Other"
};

const OPPORTUNITY_TYPE_SET = new Set(OPPORTUNITY_TYPES);
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOpportunityType(value) {
  const normalized = asTrimmedString(value).toLowerCase();
  return OPPORTUNITY_TYPE_SET.has(normalized) ? normalized : "other";
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function defineRequirementFields(target, structuredRequirements, miscRequirements, enumerable) {
  Object.defineProperties(target, {
    standardizedRequirements: {
      value: structuredRequirements,
      enumerable,
      writable: true,
      configurable: true
    },
    miscRequirements: {
      value: miscRequirements,
      enumerable,
      writable: true,
      configurable: true
    }
  });
  return target;
}

export function isValidDateOnly(value) {
  const normalized = asTrimmedString(value);
  if (!DATE_ONLY_PATTERN.test(normalized)) return false;

  const [year, month, day] = normalized.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function normalizeDateOnly(value) {
  const normalized = asTrimmedString(value);
  return isValidDateOnly(normalized) ? normalized : "";
}

function normalizeTimestamp(value) {
  const normalized = asTrimmedString(value);
  return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : "";
}

function toTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const normalized = normalizeTimestamp(value);
  return normalized || new Date().toISOString();
}

function toReferenceDateOnly(value) {
  if (typeof value === "string" && isValidDateOnly(value)) return value;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function makeOpportunityId() {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `opportunity-${randomPart}`;
}

export function normalizeOpportunity(input = {}) {
  const hasStructuredRequirements = hasOwn(input, "standardizedRequirements") || hasOwn(input, "standardized_requirements");
  const hasMiscRequirements = hasOwn(input, "miscRequirements") || hasOwn(input, "misc_requirements");
  const hasNewRequirementFields = hasStructuredRequirements || hasMiscRequirements;
  const miscRequirements = asTrimmedString(input.miscRequirements ?? input.misc_requirements ?? input.requirements);
  const structuredRequirements = normalizeStandardizedRequirements(input.standardizedRequirements ?? input.standardized_requirements);
  const normalized = {
    id: asTrimmedString(input.id),
    title: asTrimmedString(input.title),
    type: normalizeOpportunityType(input.type),
    organization: asTrimmedString(input.organization),
    url: asTrimmedString(input.url),
    description: asTrimmedString(input.description),
    requirements: miscRequirements,
    deadline: normalizeDateOnly(input.deadline),
    startDate: normalizeDateOnly(input.startDate ?? input.start_date),
    archived: Boolean(input.archived),
    createdAt: normalizeTimestamp(input.createdAt ?? input.created_at),
    updatedAt: normalizeTimestamp(input.updatedAt ?? input.updated_at)
  };

  return defineRequirementFields(normalized, structuredRequirements, miscRequirements, hasNewRequirementFields);
}

export function createOpportunityRecord(input = {}, now = new Date()) {
  const normalized = normalizeOpportunity(input);
  const timestamp = toTimestamp(now);
  const record = {
    ...normalized,
    id: normalized.id || makeOpportunityId(),
    createdAt: normalized.createdAt || timestamp,
    updatedAt: normalized.updatedAt || timestamp
  };
  const requirementFieldsAreEnumerable = Object.prototype.propertyIsEnumerable.call(normalized, "miscRequirements");
  return defineRequirementFields(
    record,
    normalized.standardizedRequirements,
    normalized.miscRequirements,
    requirementFieldsAreEnumerable
  );
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateOpportunity(input = {}) {
  const errors = {};
  const title = asTrimmedString(input.title);
  const type = asTrimmedString(input.type).toLowerCase();
  const url = asTrimmedString(input.url);
  const deadline = asTrimmedString(input.deadline);
  const startDate = asTrimmedString(input.startDate ?? input.start_date);

  if (!title) errors.title = "Title is required.";
  if (!OPPORTUNITY_TYPE_SET.has(type)) errors.type = "Choose a valid opportunity type.";
  if (url && !isHttpUrl(url)) errors.url = "URL must use http or https.";
  if (deadline && !isValidDateOnly(deadline)) errors.deadline = "Deadline must be a valid date.";
  if (startDate && !isValidDateOnly(startDate)) errors.startDate = "Start date must be a valid date.";

  const requirementErrors = validateStandardizedRequirements(input.standardizedRequirements ?? input.standardized_requirements ?? []);
  if (requirementErrors.length) errors.standardizedRequirements = requirementErrors.join(" ");
  return errors;
}

export function isOpportunityValid(input = {}) {
  return Object.keys(validateOpportunity(input)).length === 0;
}

export function isExpiredOpportunity(opportunity, referenceDate = new Date()) {
  const deadline = normalizeDateOnly(opportunity?.deadline);
  const today = toReferenceDateOnly(referenceDate);
  if (!deadline || !today) return false;
  return deadline < today;
}

export function compareOpportunityDeadlines(left, right) {
  const leftDeadline = normalizeDateOnly(left?.deadline);
  const rightDeadline = normalizeDateOnly(right?.deadline);
  if (leftDeadline && rightDeadline && leftDeadline !== rightDeadline) return leftDeadline.localeCompare(rightDeadline);
  if (leftDeadline && !rightDeadline) return -1;
  if (!leftDeadline && rightDeadline) return 1;
  const leftTitle = asTrimmedString(left?.title);
  const rightTitle = asTrimmedString(right?.title);
  return leftTitle.localeCompare(rightTitle, undefined, { sensitivity: "base" });
}

export function sortOpportunitiesByDeadline(opportunities = []) {
  return [...opportunities].sort(compareOpportunityDeadlines);
}
