export const OPPORTUNITY_APPLICATION_STATUSES = [
  "submitted",
  "interviewing",
  "waitlisted",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
  "declined"
];

export const OPPORTUNITY_APPLICATION_STATUS_LABELS = {
  submitted: "Submitted",
  interviewing: "Interviewing",
  waitlisted: "Waitlisted",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  declined: "Declined"
};

export const ACTIVE_OPPORTUNITY_APPLICATION_STATUSES = new Set([
  "submitted",
  "interviewing",
  "waitlisted",
  "offer"
]);

const STATUS_SET = new Set(OPPORTUNITY_APPLICATION_STATUSES);

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestamp(value) {
  const normalized = asTrimmedString(value);
  return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : "";
}

export function makeOpportunityApplicationId() {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `application-${randomPart}`;
}

export function normalizeOpportunityApplication(input = {}) {
  const status = asTrimmedString(input.status).toLowerCase();
  return {
    id: asTrimmedString(input.id),
    opportunityId: asTrimmedString(input.opportunityId ?? input.opportunity_id),
    submittedAt: normalizeTimestamp(input.submittedAt ?? input.submitted_at),
    status: STATUS_SET.has(status) ? status : "submitted",
    statusUpdatedAt: normalizeTimestamp(input.statusUpdatedAt ?? input.status_updated_at),
    notes: asTrimmedString(input.notes),
    createdAt: normalizeTimestamp(input.createdAt ?? input.created_at),
    updatedAt: normalizeTimestamp(input.updatedAt ?? input.updated_at)
  };
}

export function createOpportunityApplicationRecord(input = {}, now = new Date()) {
  const normalized = normalizeOpportunityApplication(input);
  const timestamp = now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : new Date().toISOString();
  return {
    ...normalized,
    id: normalized.id || makeOpportunityApplicationId(),
    submittedAt: normalized.submittedAt || timestamp,
    status: normalized.status || "submitted",
    statusUpdatedAt: normalized.statusUpdatedAt || timestamp,
    createdAt: normalized.createdAt || timestamp,
    updatedAt: normalized.updatedAt || timestamp
  };
}

export function validateOpportunityApplication(input = {}) {
  const errors = {};
  const opportunityId = asTrimmedString(input.opportunityId ?? input.opportunity_id);
  const status = asTrimmedString(input.status).toLowerCase();
  const submittedAt = normalizeTimestamp(input.submittedAt ?? input.submitted_at);

  if (!opportunityId) errors.opportunityId = "A linked opportunity is required.";
  if (!submittedAt) errors.submittedAt = "A valid submission date is required.";
  if (!STATUS_SET.has(status)) errors.status = "Choose a valid application status.";
  return errors;
}

export function isApplicationActive(application) {
  return ACTIVE_OPPORTUNITY_APPLICATION_STATUSES.has(application?.status);
}

export function compareOpportunityApplications(left, right) {
  const leftDate = Date.parse(left?.submittedAt || "") || 0;
  const rightDate = Date.parse(right?.submittedAt || "") || 0;
  if (leftDate !== rightDate) return rightDate - leftDate;
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

export function sortOpportunityApplications(applications = []) {
  return [...applications].sort(compareOpportunityApplications);
}
