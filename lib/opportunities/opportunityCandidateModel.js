import {
  OPPORTUNITY_TYPES,
  isValidDateOnly
} from "./opportunityModel";
import {
  normalizeStandardizedRequirements,
  validateStandardizedRequirements
} from "./opportunityRequirements";

export const OPPORTUNITY_CANDIDATE_SOURCE_TYPES = ["manual", "agent", "scraper", "api", "import"];
export const OPPORTUNITY_CANDIDATE_SOURCE_LABELS = { manual: "Manual", agent: "Agent", scraper: "Scraper", api: "API", import: "Import" };
export const OPPORTUNITY_CANDIDATE_REVIEW_STATUSES = ["pending", "accepted", "rejected", "duplicate"];
export const OPPORTUNITY_CANDIDATE_REVIEW_LABELS = { pending: "Pending", accepted: "Accepted", rejected: "Rejected", duplicate: "Duplicate" };

const SOURCE_TYPE_SET = new Set(OPPORTUNITY_CANDIDATE_SOURCE_TYPES);
const REVIEW_STATUS_SET = new Set(OPPORTUNITY_CANDIDATE_REVIEW_STATUSES);
const OPPORTUNITY_TYPE_SET = new Set(OPPORTUNITY_TYPES);

function asTrimmedString(value) { return typeof value === "string" ? value.trim() : ""; }
function normalizeWhitespace(value) { return asTrimmedString(value).replace(/\s+/g, " "); }
function normalizeKey(value) { return normalizeWhitespace(value).toLowerCase(); }
function normalizeDateOnly(value) { const normalized = asTrimmedString(value); return isValidDateOnly(normalized) ? normalized : ""; }
function normalizeTimestamp(value) { const normalized = asTrimmedString(value); return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : ""; }
function toTimestamp(value) { if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString(); return normalizeTimestamp(value) || new Date().toISOString(); }

function normalizeUrl(value) {
  const normalized = asTrimmedString(value);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.hash = "";
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch { return ""; }
}

function normalizeSourcePayload(value) { return !value || typeof value !== "object" || Array.isArray(value) ? {} : value; }
function fnv1a(value) { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return (hash >>> 0).toString(16).padStart(8, "0"); }

export function makeOpportunityCandidateId() {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `opportunity-candidate-${value}`;
}

export function makeOpportunityCandidateFingerprint(input = {}) {
  const normalized = normalizeOpportunityCandidate(input);
  const fingerprintRequirements = normalized.standardizedRequirements.map((requirement) => Object.fromEntries(
    Object.entries(requirement).filter(([key]) => key !== "id")
  ));
  const identity = [
    normalizeKey(normalized.title),
    normalizeKey(normalized.organization),
    normalized.type,
    normalizeKey(normalized.canonicalUrl || normalized.sourceUrl),
    normalizeKey(normalized.description),
    normalizeKey(normalized.miscRequirements),
    JSON.stringify(fingerprintRequirements),
    normalized.deadline,
    normalized.startDate
  ].join("|");
  return `fnv1a-${fnv1a(identity)}`;
}

export function normalizeOpportunityCandidate(input = {}) {
  const sourceType = normalizeKey(input.sourceType ?? input.source_type);
  const reviewStatus = normalizeKey(input.reviewStatus ?? input.review_status);
  const type = normalizeKey(input.type);
  const sourceUrl = normalizeUrl(input.sourceUrl ?? input.source_url);
  const canonicalUrl = normalizeUrl(input.canonicalUrl ?? input.canonical_url);
  const miscRequirements = asTrimmedString(input.miscRequirements ?? input.misc_requirements ?? input.requirements);

  return {
    id: asTrimmedString(input.id),
    title: normalizeWhitespace(input.title),
    type: OPPORTUNITY_TYPE_SET.has(type) ? type : "other",
    organization: normalizeWhitespace(input.organization),
    description: asTrimmedString(input.description),
    requirements: miscRequirements,
    standardizedRequirements: normalizeStandardizedRequirements(input.standardizedRequirements ?? input.standardized_requirements),
    miscRequirements,
    deadline: normalizeDateOnly(input.deadline),
    startDate: normalizeDateOnly(input.startDate ?? input.start_date),
    sourceType: SOURCE_TYPE_SET.has(sourceType) ? sourceType : "manual",
    sourceName: normalizeWhitespace(input.sourceName ?? input.source_name),
    sourceExternalId: asTrimmedString(input.sourceExternalId ?? input.source_external_id),
    sourceUrl,
    canonicalUrl,
    sourcePayload: normalizeSourcePayload(input.sourcePayload ?? input.source_payload),
    discoveredAt: normalizeTimestamp(input.discoveredAt ?? input.discovered_at),
    lastSeenAt: normalizeTimestamp(input.lastSeenAt ?? input.last_seen_at),
    contentHash: asTrimmedString(input.contentHash ?? input.content_hash),
    reviewStatus: REVIEW_STATUS_SET.has(reviewStatus) ? reviewStatus : "pending",
    rejectionReason: asTrimmedString(input.rejectionReason ?? input.rejection_reason),
    matchedOpportunityId: asTrimmedString(input.matchedOpportunityId ?? input.matched_opportunity_id),
    createdAt: normalizeTimestamp(input.createdAt ?? input.created_at),
    updatedAt: normalizeTimestamp(input.updatedAt ?? input.updated_at)
  };
}

export function createOpportunityCandidateRecord(input = {}, now = new Date()) {
  const timestamp = toTimestamp(now);
  const normalized = normalizeOpportunityCandidate(input);
  const record = {
    ...normalized,
    id: normalized.id || makeOpportunityCandidateId(),
    sourceName: normalized.sourceName || (normalized.sourceType === "manual" ? "Manual" : ""),
    discoveredAt: normalized.discoveredAt || timestamp,
    lastSeenAt: normalized.lastSeenAt || timestamp,
    createdAt: normalized.createdAt || timestamp,
    updatedAt: normalized.updatedAt || timestamp
  };
  return { ...record, contentHash: record.contentHash || makeOpportunityCandidateFingerprint(record) };
}

function isHttpUrl(value) { if (!asTrimmedString(value)) return true; return Boolean(normalizeUrl(value)); }

export function validateOpportunityCandidate(input = {}) {
  const errors = {};
  const title = asTrimmedString(input.title);
  const type = normalizeKey(input.type);
  const sourceType = normalizeKey(input.sourceType ?? input.source_type);
  const sourceName = asTrimmedString(input.sourceName ?? input.source_name);
  const reviewStatus = normalizeKey(input.reviewStatus ?? input.review_status);
  const deadline = asTrimmedString(input.deadline);
  const startDate = asTrimmedString(input.startDate ?? input.start_date);
  if (!title) errors.title = "Title is required.";
  if (!OPPORTUNITY_TYPE_SET.has(type)) errors.type = "Choose a valid opportunity type.";
  if (!SOURCE_TYPE_SET.has(sourceType)) errors.sourceType = "Choose a valid source type.";
  if (!sourceName) errors.sourceName = "Source name is required.";
  if (!REVIEW_STATUS_SET.has(reviewStatus)) errors.reviewStatus = "Choose a valid review status.";
  if (!isHttpUrl(input.sourceUrl ?? input.source_url)) errors.sourceUrl = "Source URL must use http or https.";
  if (!isHttpUrl(input.canonicalUrl ?? input.canonical_url)) errors.canonicalUrl = "Canonical URL must use http or https.";
  if (deadline && !isValidDateOnly(deadline)) errors.deadline = "Deadline must be a valid date.";
  if (startDate && !isValidDateOnly(startDate)) errors.startDate = "Start date must be a valid date.";
  const requirementErrors = validateStandardizedRequirements(input.standardizedRequirements ?? input.standardized_requirements ?? []);
  if (requirementErrors.length) errors.standardizedRequirements = requirementErrors.join(" ");
  return errors;
}

function sameNormalizedText(left, right) { return Boolean(normalizeKey(left)) && normalizeKey(left) === normalizeKey(right); }
function compatibleDates(left, right) { if (left.deadline && right.deadline && left.deadline !== right.deadline) return false; if (left.startDate && right.startDate && left.startDate !== right.startDate) return false; return true; }

export function findOpportunityCandidateDuplicate(candidates = [], input = {}) {
  const candidate = createOpportunityCandidateRecord(input);
  const normalized = (Array.isArray(candidates) ? candidates : []).map(normalizeOpportunityCandidate);
  if (candidate.sourceExternalId) {
    const byExternalId = normalized.find((item) => item.sourceExternalId && item.sourceExternalId === candidate.sourceExternalId && normalizeKey(item.sourceType) === normalizeKey(candidate.sourceType) && normalizeKey(item.sourceName) === normalizeKey(candidate.sourceName));
    if (byExternalId) return { candidate: byExternalId, reason: "source_external_id" };
  }
  if (candidate.canonicalUrl) {
    const byCanonicalUrl = normalized.find((item) => item.canonicalUrl === candidate.canonicalUrl);
    if (byCanonicalUrl) return { candidate: byCanonicalUrl, reason: "canonical_url" };
  }
  if (candidate.title && candidate.organization) {
    const byIdentity = normalized.find((item) => sameNormalizedText(item.title, candidate.title) && sameNormalizedText(item.organization, candidate.organization) && compatibleDates(item, candidate));
    if (byIdentity) return { candidate: byIdentity, reason: "organization_title" };
  }
  const fingerprint = candidate.contentHash || makeOpportunityCandidateFingerprint(candidate);
  const byFingerprint = normalized.find((item) => item.contentHash && item.contentHash === fingerprint);
  if (byFingerprint) return { candidate: byFingerprint, reason: "content_hash" };
  return null;
}

export function sortOpportunityCandidates(candidates = []) {
  const statusRank = { pending: 0, accepted: 1, rejected: 2, duplicate: 3 };
  return [...candidates].sort((leftInput, rightInput) => {
    const left = normalizeOpportunityCandidate(leftInput);
    const right = normalizeOpportunityCandidate(rightInput);
    const statusDifference = (statusRank[left.reviewStatus] ?? 9) - (statusRank[right.reviewStatus] ?? 9);
    if (statusDifference) return statusDifference;
    if (left.deadline && right.deadline && left.deadline !== right.deadline) return left.deadline.localeCompare(right.deadline);
    if (left.deadline && !right.deadline) return -1;
    if (!left.deadline && right.deadline) return 1;
    return right.lastSeenAt.localeCompare(left.lastSeenAt) || left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  });
}
