type UnknownRecord = Record<string, unknown>;

export type AdzunaSearchProfile = {
  id: string;
  family: string;
  query: string;
  whatExclude?: string;
  titleSignals: string[];
  descriptionSignals: string[];
  positiveCategories: string[];
  negativeCategories?: string[];
  negativeTitleSignals?: string[];
  threshold?: number;
};

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

export type AdzunaCandidateEvaluation = {
  keep: boolean;
  score: number;
  threshold: number;
  reasons: string[];
  minimumExperience: number;
  matchedTitleSignals: string[];
  matchedDescriptionSignals: string[];
  senioritySignals: string[];
  negativeTitleSignals: string[];
};

const DEFAULT_THRESHOLD = 6;
const MAX_SEARCHES_PER_RUN = 24;

const KNOWLEDGE_WORK_CATEGORIES = [
  "admin-jobs",
  "accounting-finance-jobs",
  "consultancy-jobs",
  "creative-design-jobs",
  "graduate-jobs",
  "it-jobs",
  "legal-jobs",
  "pr-advertising-marketing-jobs",
  "scientific-qa-jobs",
  "teaching-jobs"
];

const RESEARCH_CATEGORIES = [
  "scientific-qa-jobs",
  "consultancy-jobs",
  "graduate-jobs",
  "pr-advertising-marketing-jobs",
  "it-jobs",
  "admin-jobs",
  "teaching-jobs",
  "accounting-finance-jobs"
];

const POLICY_CATEGORIES = [
  "consultancy-jobs",
  "pr-advertising-marketing-jobs",
  "graduate-jobs",
  "it-jobs",
  "admin-jobs",
  "accounting-finance-jobs",
  "scientific-qa-jobs"
];

const EDITORIAL_CATEGORIES = [
  "creative-design-jobs",
  "pr-advertising-marketing-jobs",
  "admin-jobs",
  "legal-jobs",
  "scientific-qa-jobs",
  "teaching-jobs",
  "graduate-jobs"
];

const CONSULTING_CATEGORIES = [
  "consultancy-jobs",
  "graduate-jobs",
  "it-jobs",
  "accounting-finance-jobs",
  "pr-advertising-marketing-jobs"
];

const STARTUP_CATEGORIES = [
  "it-jobs",
  "graduate-jobs",
  "pr-advertising-marketing-jobs",
  "accounting-finance-jobs",
  "sales-jobs",
  "consultancy-jobs"
];

const AI_POLICY_CATEGORIES = [
  "it-jobs",
  "scientific-qa-jobs",
  "consultancy-jobs",
  "pr-advertising-marketing-jobs",
  "graduate-jobs",
  "accounting-finance-jobs"
];

const POLITICAL_RISK_CATEGORIES = [
  "pr-advertising-marketing-jobs",
  "graduate-jobs",
  "consultancy-jobs",
  "accounting-finance-jobs",
  "scientific-qa-jobs"
];

const GLOBALLY_IMPLAUSIBLE_CATEGORIES = [
  "hospitality-catering-jobs",
  "logistics-warehouse-jobs",
  "trade-construction-jobs",
  "domestic-help-cleaning-jobs"
];

const SENIOR_TITLE_SIGNALS = [
  "senior",
  "director",
  "head of",
  "head ",
  "vice president",
  "vp",
  "principal",
  "chief",
  "partner",
  "manager",
  "lead",
  "expert",
  "subject matter expert",
  "sme",
  "staff engineer",
  "staff scientist",
  "staff researcher",
  "staff analyst",
  "staff consultant"
];

const ENTRY_TITLE_SIGNALS = [
  "graduate",
  "junior",
  "intern",
  "internship",
  "trainee",
  "entry level",
  "entry-level",
  "assistant",
  "apprentice"
];

const EXPERIENCE_PATTERNS = [
  /(?:minimum\s+(?:of\s+)?)?(\d{1,2})\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+)?experience/gi,
  /(?:at\s+least|minimum)\s+(\d{1,2})\s*(?:years?|yrs?)/gi
];

function makeProfile(input: AdzunaSearchProfile): AdzunaSearchProfile {
  return {
    threshold: DEFAULT_THRESHOLD,
    negativeCategories: GLOBALLY_IMPLAUSIBLE_CATEGORIES,
    negativeTitleSignals: [],
    ...input
  };
}

export const DEFAULT_ADZUNA_SEARCH_PROFILES: AdzunaSearchProfile[] = [
  makeProfile({
    id: "research-assistant",
    family: "research",
    query: "research assistant",
    titleSignals: ["research assistant", "research associate", "research officer"],
    descriptionSignals: ["research", "analysis", "policy", "economics", "social science", "technology", "data"],
    positiveCategories: RESEARCH_CATEGORIES
  }),
  makeProfile({
    id: "policy-research-assistant",
    family: "research",
    query: "policy research assistant",
    titleSignals: ["research assistant", "policy research", "research associate", "research officer"],
    descriptionSignals: ["policy", "research", "government", "regulation", "economics", "public affairs"],
    positiveCategories: RESEARCH_CATEGORIES
  }),
  makeProfile({
    id: "research-analyst",
    family: "research",
    query: "research analyst",
    titleSignals: ["research analyst", "junior research analyst", "research associate", "technology research analyst"],
    descriptionSignals: ["research", "analysis", "policy", "economics", "technology", "data"],
    positiveCategories: RESEARCH_CATEGORIES
  }),
  makeProfile({
    id: "junior-research-analyst",
    family: "research",
    query: "junior research analyst",
    titleSignals: ["junior research analyst", "research analyst", "research associate"],
    descriptionSignals: ["research", "analysis", "policy", "economics", "technology", "data"],
    positiveCategories: RESEARCH_CATEGORIES
  }),
  makeProfile({
    id: "policy-analyst",
    family: "policy",
    query: "policy analyst",
    titleSignals: ["policy analyst", "research & policy analyst", "research policy analyst", "policy researcher", "policy consultant"],
    descriptionSignals: ["policy", "public affairs", "government", "regulation", "regulatory", "economics", "geopolitics"],
    positiveCategories: POLICY_CATEGORIES
  }),
  makeProfile({
    id: "research-policy-analyst",
    family: "policy",
    query: "research policy analyst",
    titleSignals: ["research & policy analyst", "research policy analyst", "policy analyst", "policy researcher"],
    descriptionSignals: ["policy", "research", "public affairs", "government", "regulation", "economics"],
    positiveCategories: POLICY_CATEGORIES
  }),
  makeProfile({
    id: "policy-internship",
    family: "policy",
    query: "policy internship",
    titleSignals: ["policy intern", "policy internship", "public policy", "policy research", "research policy"],
    descriptionSignals: ["policy", "public affairs", "government", "regulation", "research"],
    positiveCategories: POLICY_CATEGORIES,
    negativeTitleSignals: ["human resources", "hr adviser", "apprentice liaison", "early years", "engineer"]
  }),
  makeProfile({
    id: "research-internship",
    family: "research",
    query: "research internship",
    titleSignals: [
      "research intern",
      "research internship",
      "researcher intern",
      "researcher internship",
      "quant research intern",
      "quantitative research intern",
      "technology research intern"
    ],
    descriptionSignals: ["research", "analysis", "policy", "technology", "data", "economics"],
    positiveCategories: RESEARCH_CATEGORIES
  }),
  makeProfile({
    id: "editorial-assistant",
    family: "editorial",
    query: "editorial assistant",
    titleSignals: ["editorial assistant", "editorial associate", "digital content assistant"],
    descriptionSignals: ["editorial", "publishing", "writing", "content", "newsroom", "journalism", "copy"],
    positiveCategories: EDITORIAL_CATEGORIES,
    negativeTitleSignals: ["executive assistant", "events executive", "account executive"]
  }),
  makeProfile({
    id: "assistant-editor",
    family: "editorial",
    query: "assistant editor",
    titleSignals: ["assistant editor"],
    descriptionSignals: ["editorial", "publishing", "writing", "content", "newsroom", "journalism", "editing"],
    positiveCategories: EDITORIAL_CATEGORIES
  }),
  makeProfile({
    id: "content-writer",
    family: "editorial",
    query: "content writer",
    titleSignals: ["content writer", "copywriter", "writer", "editorial writer"],
    descriptionSignals: ["writing", "content", "editorial", "publishing", "copy", "journalism"],
    positiveCategories: EDITORIAL_CATEGORIES
  }),
  makeProfile({
    id: "graduate-strategy-consultant",
    family: "consulting",
    query: "graduate strategy consultant",
    whatExclude: "recruitment",
    titleSignals: ["strategy consultant", "graduate consultant", "consulting analyst", "strategy consulting"],
    descriptionSignals: ["strategy", "consulting", "management consulting", "business strategy", "analysis"],
    positiveCategories: CONSULTING_CATEGORIES,
    negativeTitleSignals: ["recruitment", "actuarial"]
  }),
  makeProfile({
    id: "graduate-management-consultant",
    family: "consulting",
    query: "graduate management consultant",
    whatExclude: "recruitment",
    titleSignals: ["management consultant", "graduate consultant", "consulting analyst", "strategy consultant"],
    descriptionSignals: ["consulting", "management consulting", "strategy", "business transformation", "analysis"],
    positiveCategories: CONSULTING_CATEGORIES,
    negativeTitleSignals: ["recruitment", "actuarial"]
  }),
  makeProfile({
    id: "strategy-analyst",
    family: "strategy",
    query: "strategy analyst",
    titleSignals: ["strategy analyst", "strategic analyst", "strategy associate", "business strategy"],
    descriptionSignals: ["strategy", "analysis", "consulting", "business", "operations"],
    positiveCategories: CONSULTING_CATEGORIES
  }),
  makeProfile({
    id: "graduate-business-analyst",
    family: "strategy",
    query: "graduate business analyst",
    titleSignals: ["business analyst", "business analysis"],
    descriptionSignals: ["business analysis", "strategy", "consulting", "technology", "operations"],
    positiveCategories: CONSULTING_CATEGORIES,
    negativeTitleSignals: ["recruitment"]
  }),
  makeProfile({
    id: "founders-associate",
    family: "startup",
    query: "founder's associate",
    titleSignals: ["founders associate", "founder associate"],
    descriptionSignals: ["startup", "founder", "strategy", "operations", "growth", "chief of staff"],
    positiveCategories: STARTUP_CATEGORIES
  }),
  makeProfile({
    id: "business-operations-associate",
    family: "startup",
    query: "business operations associate",
    titleSignals: ["business operations", "operations associate", "strategy & operations", "strategy operations", "business ops"],
    descriptionSignals: ["startup", "operations", "strategy", "business operations", "growth"],
    positiveCategories: STARTUP_CATEGORIES,
    negativeTitleSignals: ["software engineer", "developer", "recruitment"]
  }),
  makeProfile({
    id: "ai-policy-analyst",
    family: "ai-policy",
    query: "AI policy analyst",
    whatExclude: "driver",
    titleSignals: ["ai policy", "policy analyst", "ai governance", "responsible ai", "ai safety"],
    descriptionSignals: ["artificial intelligence", "ai governance", "ai policy", "ai safety", "responsible ai", "regulation"],
    positiveCategories: AI_POLICY_CATEGORIES,
    negativeTitleSignals: ["driver", "chef", "housekeeper", "insurance policy administration", "software engineer", "developer"]
  }),
  makeProfile({
    id: "ai-governance-analyst",
    family: "ai-policy",
    query: "AI governance analyst",
    titleSignals: ["ai governance", "responsible ai", "ai policy", "ai safety", "artificial intelligence governance"],
    descriptionSignals: ["artificial intelligence", "ai governance", "responsible ai", "policy", "regulation", "safety"],
    positiveCategories: AI_POLICY_CATEGORIES,
    negativeTitleSignals: ["driver", "chef", "housekeeper", "software engineer", "developer"]
  }),
  makeProfile({
    id: "responsible-ai-governance",
    family: "ai-policy",
    query: "responsible AI governance",
    titleSignals: ["responsible ai", "ai governance", "ai policy", "ai safety"],
    descriptionSignals: ["responsible ai", "ai governance", "artificial intelligence", "policy", "regulation", "safety"],
    positiveCategories: AI_POLICY_CATEGORIES,
    negativeTitleSignals: ["driver", "chef", "housekeeper", "software engineer", "developer"]
  }),
  makeProfile({
    id: "technology-policy-analyst",
    family: "policy",
    query: "technology policy analyst",
    titleSignals: ["technology policy", "tech policy", "digital policy", "policy analyst", "policy consultant", "research analyst"],
    descriptionSignals: ["technology policy", "digital policy", "policy", "regulation", "technology", "research"],
    positiveCategories: POLICY_CATEGORIES,
    negativeTitleSignals: ["driver", "chef", "housekeeper", "software engineer", "developer", "technology support"]
  }),
  makeProfile({
    id: "political-risk-analyst",
    family: "political-risk",
    query: "political risk analyst",
    titleSignals: ["political risk", "political analyst", "country risk", "elections forecasting"],
    descriptionSignals: ["political risk", "geopolitical", "elections", "international affairs", "country risk", "forecasting"],
    positiveCategories: POLITICAL_RISK_CATEGORIES,
    negativeTitleSignals: ["underwriter", "underwriting"]
  }),
  makeProfile({
    id: "geopolitical-analyst",
    family: "political-risk",
    query: "geopolitical analyst",
    titleSignals: ["geopolitical analyst", "geopolitics analyst", "political analyst", "political risk analyst", "intelligence analyst"],
    descriptionSignals: ["geopolitical", "political risk", "international affairs", "intelligence", "forecasting"],
    positiveCategories: POLITICAL_RISK_CATEGORIES,
    negativeTitleSignals: ["underwriter", "underwriting"]
  }),
  makeProfile({
    id: "ai-consultant",
    family: "ai-consulting",
    query: "AI consultant",
    titleSignals: ["ai consultant", "ai consulting", "artificial intelligence consultant", "ai advisory", "ai solutions consultant"],
    descriptionSignals: ["artificial intelligence", "ai", "consulting", "advisory", "machine learning"],
    positiveCategories: CONSULTING_CATEGORIES,
    negativeTitleSignals: ["recruitment", "sales engineer"]
  })
];

export function buildAdzunaSearchUrl({
  appId,
  appKey,
  query,
  whatExclude = "",
  page = 1,
  resultsPerPage = 10,
  country = "gb"
}: {
  appId: string;
  appKey: string;
  query: string;
  whatExclude?: string;
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
  if (normalizeWhitespace(whatExclude)) {
    url.searchParams.set("what_exclude", normalizeWhitespace(whatExclude));
  }
  url.searchParams.set("content-type", "application/json");
  return url.toString();
}

export function normalizeAdzunaJob(
  rawInput: unknown,
  {
    query = "",
    profileId = "",
    now = new Date(),
    randomUUID = () => crypto.randomUUID()
  }: {
    query?: string;
    profileId?: string;
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
    discovery_profile: normalizeWhitespace(profileId),
    adzuna_id: sourceExternalId,
    description_is_excerpt: true,
    description_completeness: "excerpt",
    description_excerpt_source: "adzuna_search_api",
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

export function evaluateAdzunaCandidate(
  candidateInput: Partial<NormalizedAdzunaCandidate>,
  profileInput?: AdzunaSearchProfile
): AdzunaCandidateEvaluation {
  const queryFromPayload = asRecord(candidateInput.sourcePayload).discovery_query;
  const profile = profileInput || makeCustomSearchProfile(queryFromPayload);
  const title = normalizeWhitespace(candidateInput.title);
  const description = normalizeWhitespace(candidateInput.description);
  const categoryTag = normalizeKey(asRecord(candidateInput.sourcePayload).category_tag);
  const threshold = Number.isFinite(profile.threshold) ? Number(profile.threshold) : DEFAULT_THRESHOLD;
  const reasons: string[] = [];

  const missingTitle = !title;
  const missingExternalId = !normalizeWhitespace(candidateInput.sourceExternalId);
  const missingSourceUrl = !normalizeHttpUrl(candidateInput.sourceUrl);
  if (missingTitle) reasons.push("missing_title");
  if (missingExternalId) reasons.push("missing_external_id");
  if (missingSourceUrl) reasons.push("missing_source_url");

  const queryInTitle = containsPhrase(title, profile.query);
  const matchedTitleSignals = matchingPhrases(title, profile.titleSignals || []);
  const matchedDescriptionSignals = matchingPhrases(description, profile.descriptionSignals || []);
  const senioritySignals = matchingPhrases(title, SENIOR_TITLE_SIGNALS);
  const negativeTitleSignals = matchingPhrases(title, profile.negativeTitleSignals || []);
  const entrySignals = matchingPhrases(title, ENTRY_TITLE_SIGNALS);
  const positiveCategory = Boolean(categoryTag && (profile.positiveCategories || []).includes(categoryTag));
  const negativeCategory = Boolean(
    categoryTag &&
    [...GLOBALLY_IMPLAUSIBLE_CATEGORIES, ...(profile.negativeCategories || [])].includes(categoryTag)
  );
  const minimumExperience = extractMinimumExperienceYears(description);
  const hasTargetTitleMatch = queryInTitle || matchedTitleSignals.length > 0;

  let score = 0;

  if (queryInTitle) {
    score += 8;
    reasons.push("exact_query_in_title");
  } else if (matchedTitleSignals.length) {
    score += 5;
    reasons.push("target_role_in_title");
  } else {
    reasons.push("no_target_role_in_title");
  }

  if (entrySignals.length) {
    score += 2;
    reasons.push("entry_signal");
  }
  if (positiveCategory) {
    score += 2;
    reasons.push("supporting_category");
  }
  if (matchedDescriptionSignals.length) {
    score += 1;
    reasons.push("supporting_description");
  }
  if (senioritySignals.length) {
    score -= 8;
    reasons.push("seniority_penalty");
  }
  if (minimumExperience >= 5) {
    score -= 8;
    reasons.push("requires_5_plus_years");
  }
  if (negativeTitleSignals.length) {
    score -= 10;
    reasons.push("wrong_occupation");
  }
  if (negativeCategory) {
    score -= 8;
    reasons.push("wrong_category");
  }

  const malformed = missingTitle || missingExternalId || missingSourceUrl;
  const keep = !malformed && hasTargetTitleMatch && score >= threshold;
  if (!keep && !malformed && score < threshold) reasons.push("below_threshold");

  return {
    keep,
    score,
    threshold,
    reasons,
    minimumExperience,
    matchedTitleSignals,
    matchedDescriptionSignals,
    senioritySignals,
    negativeTitleSignals
  };
}

export function annotateCandidateEvaluation(
  candidate: NormalizedAdzunaCandidate,
  evaluation: AdzunaCandidateEvaluation,
  profile: AdzunaSearchProfile
): NormalizedAdzunaCandidate {
  return {
    ...candidate,
    sourcePayload: {
      ...candidate.sourcePayload,
      discovery_profile: profile.id,
      discovery_family: profile.family,
      relevance_score: evaluation.score,
      relevance_threshold: evaluation.threshold,
      relevance_reasons: evaluation.reasons,
      matched_title_signals: evaluation.matchedTitleSignals,
      matched_description_signals: evaluation.matchedDescriptionSignals,
      seniority_signals: evaluation.senioritySignals,
      negative_title_signals: evaluation.negativeTitleSignals,
      minimum_experience_years: evaluation.minimumExperience || 0
    }
  };
}

export function normalizeRequestedSearchProfiles(value: unknown): AdzunaSearchProfile[] {
  if (!Array.isArray(value)) {
    return DEFAULT_ADZUNA_SEARCH_PROFILES.map((profile) => ({ ...profile }));
  }

  const seen = new Set<string>();
  const profiles: AdzunaSearchProfile[] = [];

  for (const raw of value) {
    const query = normalizeWhitespace(raw).slice(0, 120);
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    profiles.push(makeCustomSearchProfile(query));
    if (profiles.length >= MAX_SEARCHES_PER_RUN) break;
  }

  return profiles.length
    ? profiles
    : DEFAULT_ADZUNA_SEARCH_PROFILES.map((profile) => ({ ...profile }));
}

export function makeCustomSearchProfile(queryInput: unknown): AdzunaSearchProfile {
  const query = normalizeWhitespace(queryInput).slice(0, 120);
  const titleSignals = meaningfulQuerySignals(query);

  return makeProfile({
    id: query ? `custom-${fnv1a(normalizeKey(query))}` : "custom-empty",
    family: "custom",
    query,
    titleSignals,
    descriptionSignals: titleSignals,
    positiveCategories: KNOWLEDGE_WORK_CATEGORIES
  });
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

function meaningfulQuerySignals(query: string) {
  const stopWords = new Set([
    "and",
    "or",
    "the",
    "a",
    "an",
    "at",
    "for",
    "of",
    "in",
    "on",
    "to",
    "job",
    "jobs",
    "role",
    "roles",
    "uk",
    "united",
    "kingdom"
  ]);

  const normalized = normalizeForMatch(query);
  const signals = normalized
    .split(" ")
    .filter((token) => token.length >= 3 && !stopWords.has(token));

  return [...new Set([query, ...signals].filter(Boolean))];
}

function matchingPhrases(value: unknown, phrases: string[]) {
  return [...new Set((phrases || []).filter((phrase) => containsPhrase(value, phrase)))];
}

function containsPhrase(value: unknown, phrase: unknown) {
  const haystack = normalizeForMatch(value);
  const needle = normalizeForMatch(phrase);
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function normalizeForMatch(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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
