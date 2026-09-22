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

function normalizeDateOnly(value) {
  const normalized = asTrimmedString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

export function normalizeOpportunityApplicationSnapshot(input = {}, fallbackId = "") {
  const id = asTrimmedString(input.id || fallbackId);
  return {
    id,
    title: asTrimmedString(input.title),
    type: asTrimmedString(input.type) || "other",
    organization: asTrimmedString(input.organization),
    url: asTrimmedString(input.url),
    deadline: normalizeDateOnly(input.deadline),
    startDate: normalizeDateOnly(input.startDate ?? input.start_date),
    historical: true
  };
}

export function makeOpportunityApplicationId() {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `application-${randomPart}`;
}

export function normalizeOpportunityApplication(input = {}) {
  const status = asTrimmedString(input.status).toLowerCase();
  const historicalOpportunityId = asTrimmedString(
    input.historicalOpportunityId
      ?? input.historical_opportunity_id
      ?? input.opportunityId
      ?? input.opportunity_id
  );
  const hasExplicitLiveId = Object.prototype.hasOwnProperty.call(input, "liveOpportunityId")
    || Object.prototype.hasOwnProperty.call(input, "live_opportunity_id")
    || Object.prototype.hasOwnProperty.call(input, "opportunity_id");
  const liveOpportunityId = asTrimmedString(
    hasExplicitLiveId
      ? (input.liveOpportunityId ?? input.live_opportunity_id ?? input.opportunity_id)
      : historicalOpportunityId
  );
  const rawSnapshot = input.opportunitySnapshot ?? input.opportunity_snapshot ?? {};

  return {
    id: asTrimmedString(input.id),
    opportunityId: historicalOpportunityId,
    liveOpportunityId,
    opportunitySnapshot: normalizeOpportunityApplicationSnapshot(rawSnapshot, historicalOpportunityId),
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

export function resolveApplicationOpportunity(application, opportunityById = {}) {
  if (!application) return null;
  const liveOpportunityId = asTrimmedString(application.liveOpportunityId);
  if (liveOpportunityId && opportunityById[liveOpportunityId]) {
    return opportunityById[liveOpportunityId];
  }

  const snapshot = normalizeOpportunityApplicationSnapshot(
    application.opportunitySnapshot,
    application.opportunityId
  );
  if (!snapshot.id && !snapshot.title) return null;
  return snapshot;
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
