export const DEFAULT_ADZUNA_QUERIES = [
  "research assistant",
  "research analyst",
  "policy analyst",
  "policy intern",
  "research intern",
  "editorial assistant",
  "assistant editor",
  "content writer",
  "strategy analyst",
  "graduate consultant",
  "business analyst",
  "founder's associate",
  "startup operations",
  "AI policy",
  "AI governance",
  "technology policy",
  "political risk",
  "geopolitical analyst",
  "AI consultant"
] as const;

const SENIOR_TITLE_PATTERN =
  /\b(senior|sr\.?|director|head\s+of|vice\s+president|vp|principal|chief|staff\s+(?:engineer|scientist|researcher|analyst|consultant))\b/i;

const EXPERIENCE_PATTERNS = [
  /(?:minimum\s+(?:of\s+)?)?(\d{1,2})\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+)?experience/gi,
  /(?:at\s+least|minimum)\s+(\d{1,2})\s*(?:years?|yrs?)/gi
];

type UnknownRecord = Record<string, unknown>;

export type NormalizedAdzunaCandidate = {
  id: string;
  title: string;
  type: "job" | "internship";
  organization: string;
  description: string;
  requirements: string;
  sourceType: "api";
  sourceName: "Adzuna";
  sourceExternalId: string;
  sourceUrl: string;
  canonicalUrl: string;
  sourcePayload: UnknownRecord;
  discoveredAt: string;
  lastSeenAt: string;
  contentHash: string;
};

export function buildAdzunaSearchUrl({
  appId,
  appKey,
  query,
  page = 1,
  resultsPerPage = 10,
  country = "gb"
}: {
  appId: string;
  appKey: string;
  query: string;
  page?: number;
  resultsPerPage?: number;
  country?: string;
}) {
  const normalizedCountry = String(country || "gb").trim().toLowerCase();
  const normalizedPage = clampInteger(page, 1, 50, 1);
  const normalizedResults = clampInteger(resultsPerPage, 1, 50, 10);
  const url = new URL(
    `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(normalizedCountry)}/search/${normalizedPage}`
  );
  url.searchParams.set("app_id", String(appId || "").trim());
  url.searchParams.set("app_key", String(appKey || "").trim());
  url.searchParams.set("results_per_page", String(normalizedResults));
  url.searchParams.set("what", normalizeWhitespace(query));
  url.searchParams.set("content-type", "application/json");
  return url.toString();
}

export function normalizeAdzunaJob(
  rawInput: unknown,
  {
    query = "",
    now = new Date(),
    randomUUID = () => crypto.randomUUID()
  }: {
    query?: string;
    now?: Date;
    randomUUID?: () => string;
  } = {}
): NormalizedAdzunaCandidate {
  const raw = asRecord(rawInput);
  const title = cleanText(raw.title);
  const description = cleanText(raw.description);
  const organization = cleanText(asRecord(raw.company).display_name);
  const sourceExternalId = cleanText(raw.id);
  const sourceUrl = normalizeHttpUrl(raw.redirect_url);
  const created = normalizeTimestamp(raw.created);
  const observedAt = now.toISOString();
  const type = inferOpportunityType(title, description);
  const location = asRecord(raw.location);
  const locationArea = Array.isArray(location.area) ? location.area : [];
  const category = asRecord(raw.category);

  const sourcePayload = compactObject({
    discovery_query: normalizeWhitespace(query),
    adzuna_id: sourceExternalId,
    location: cleanText(location.display_name),
    location_area: locationArea.map((value) => cleanText(value)).filter(Boolean),
    category: cleanText(category.label),
    category_tag: cleanText(category.tag),
    contract_type: cleanText(raw.contract_type),
    contract_time: cleanText(raw.contract_time),
    salary_min: finiteNumberOrNull(raw.salary_min),
    salary_max: finiteNumberOrNull(raw.salary_max),
    salary_is_predicted: finiteNumberOrNull(raw.salary_is_predicted),
    latitude: finiteNumberOrNull(raw.latitude),
    longitude: finiteNumberOrNull(raw.longitude),
    adzuna_created_at: created
  });

  const base = {
    id: `opportunity-candidate-${randomUUID()}`,
    title,
    type,
    organization,
    description,
    requirements: "",
    sourceType: "api" as const,
    sourceName: "Adzuna" as const,
    sourceExternalId,
    sourceUrl,
    canonicalUrl: "",
    sourcePayload,
    discoveredAt: observedAt,
    lastSeenAt: observedAt
  };

  return {
    ...base,
    contentHash: makeCandidateFingerprint(base)
  };
}

export function evaluateAdzunaCandidate(candidateInput: Partial<NormalizedAdzunaCandidate>) {
  const title = normalizeWhitespace(candidateInput.title);
  const description = normalizeWhitespace(candidateInput.description);
  const reasons: string[] = [];

  if (!title) reasons.push("missing_title");
  if (!normalizeWhitespace(candidateInput.sourceExternalId)) reasons.push("missing_external_id");
  if (!normalizeHttpUrl(candidateInput.sourceUrl)) reasons.push("missing_source_url");
  if (SENIOR_TITLE_PATTERN.test(title)) reasons.push("senior_title");

  const minimumExperience = extractMinimumExperienceYears(description);
  if (minimumExperience >= 5) reasons.push("requires_5_plus_years");

  return {
    keep: reasons.length === 0,
    reasons,
    minimumExperience
  };
}

export function normalizeRequestedQueries(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_ADZUNA_QUERIES];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of value) {
    const query = normalizeWhitespace(raw).slice(0, 120);
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(query);
    if (normalized.length >= 25) break;
  }
  return normalized.length ? normalized : [...DEFAULT_ADZUNA_QUERIES];
}

export function makeCandidateFingerprint(input: {
  title?: unknown;
  organization?: unknown;
  type?: unknown;
  canonicalUrl?: unknown;
  sourceUrl?: unknown;
  description?: unknown;
  requirements?: unknown;
  deadline?: unknown;
  startDate?: unknown;
}) {
  const identity = [
    normalizeKey(input.title),
    normalizeKey(input.organization),
    normalizeKey(input.type),
    normalizeKey(normalizeHttpUrl(input.canonicalUrl) || normalizeHttpUrl(input.sourceUrl)),
    normalizeKey(input.description),
    normalizeKey(input.requirements),
    "[]",
    normalizeWhitespace(input.deadline),
    normalizeWhitespace(input.startDate)
  ].join("|");
  return `fnv1a-${fnv1a(identity)}`;
}

export function extractMinimumExperienceYears(description: unknown) {
  const text = normalizeWhitespace(description);
  let maximum = 0;
  for (const pattern of EXPERIENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const years = Number(match[1]);
      if (Number.isFinite(years)) maximum = Math.max(maximum, years);
    }
  }
  return maximum;
}

function inferOpportunityType(title: string, description: string): "job" | "internship" {
  return /\b(intern|internship|trainee|traineeship)\b/i.test(`${title} ${description}`)
    ? "internship"
    : "job";
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function normalizeWhitespace(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value: unknown) {
  return normalizeWhitespace(value).toLowerCase();
}

function cleanText(value: unknown) {
  return decodeCommonEntities(
    normalizeWhitespace(String(value ?? "").replace(/<[^>]*>/g, " "))
  );
}

function decodeCommonEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeHttpUrl(value: unknown) {
  const raw = normalizeWhitespace(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeTimestamp(value: unknown) {
  const raw = normalizeWhitespace(value);
  if (!raw || Number.isNaN(Date.parse(raw))) return "";
  return new Date(raw).toISOString();
}

function finiteNumberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactObject(input: UnknownRecord) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
