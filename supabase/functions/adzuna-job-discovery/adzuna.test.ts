import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADZUNA_SEARCH_PROFILES,
  buildAdzunaDetailsUrl,
  buildAdzunaSearchUrl,
  calculateAdzunaDescriptionRetryAt,
  classifyAdzunaDetailHttpFailure,
  enrichAdzunaCandidateDescription,
  evaluateAdzunaCandidate,
  extractAdzunaDetailDescription,
  getAdzunaDescriptionEnrichmentDecision,
  extractMinimumExperienceYears,
  isUsefulAdzunaDetailDescription,
  normalizeAdzunaJob,
  normalizeRequestedSearchProfiles,
  type AdzunaSearchProfile
} from "./adzuna";

function profile(id: string): AdzunaSearchProfile {
  const found = DEFAULT_ADZUNA_SEARCH_PROFILES.find((item) => item.id === id);
  if (!found) throw new Error(`Missing profile fixture: ${id}`);
  return found;
}

function sampleAdzunaJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "12345",
    title: "Research Assistant",
    description: "Support policy research and quantitative analysis.",
    redirect_url: "https://www.adzuna.co.uk/jobs/land/ad/12345#tracking",
    created: "2026-09-20T08:30:00Z",
    company: { display_name: "Example Institute" },
    location: {
      display_name: "London, UK",
      area: ["UK", "London"]
    },
    category: {
      label: "Scientific & QA Jobs",
      tag: "scientific-qa-jobs"
    },
    contract_type: "permanent",
    salary_min: 30000,
    salary_max: 36000,
    ...overrides
  };
}

function evaluateFixture(
  overrides: Record<string, unknown>,
  profileId: string
) {
  const searchProfile = profile(profileId);
  const candidate = normalizeAdzunaJob(sampleAdzunaJob(overrides), {
    query: searchProfile.query,
    profileId: searchProfile.id,
    now: new Date("2026-09-20T12:00:00.000Z"),
    randomUUID: () => `${profileId}-fixture`
  });
  return evaluateAdzunaCandidate(candidate, searchProfile);
}

describe("Adzuna discovery normalization", () => {
  it("builds the official UK search endpoint and supports API-side exclusions", () => {
    const url = new URL(buildAdzunaSearchUrl({
      appId: "app id",
      appKey: "secret/key",
      query: "graduate strategy consultant",
      whatExclude: "recruitment",
      resultsPerPage: 15
    }));

    expect(url.origin).toBe("https://api.adzuna.com");
    expect(url.pathname).toBe("/v1/api/jobs/gb/search/1");
    expect(url.searchParams.get("app_id")).toBe("app id");
    expect(url.searchParams.get("app_key")).toBe("secret/key");
    expect(url.searchParams.get("what")).toBe("graduate strategy consultant");
    expect(url.searchParams.get("what_exclude")).toBe("recruitment");
    expect(url.searchParams.get("results_per_page")).toBe("15");
  });

  it("normalizes an Adzuna result into the Opportunity candidate contract with search provenance", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob(), {
      query: "research assistant",
      profileId: "research-assistant",
      now: new Date("2026-09-20T12:00:00.000Z"),
      randomUUID: () => "fixed-id"
    });

    expect(candidate).toMatchObject({
      id: "opportunity-candidate-fixed-id",
      title: "Research Assistant",
      type: "job",
      organization: "Example Institute",
      sourceType: "api",
      sourceName: "Adzuna",
      sourceExternalId: "12345",
      sourceUrl: "https://www.adzuna.co.uk/jobs/land/ad/12345",
      canonicalUrl: "",
      discoveredAt: "2026-09-20T12:00:00.000Z",
      lastSeenAt: "2026-09-20T12:00:00.000Z"
    });
    expect(candidate.contentHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    expect(candidate.sourcePayload).toMatchObject({
      discovery_query: "research assistant",
      discovery_profile: "research-assistant",
      description_is_excerpt: true,
      description_completeness: "excerpt",
      description_excerpt_source: "adzuna_search_api",
      location: "London, UK",
      category: "Scientific & QA Jobs",
      salary_min: 30000,
      salary_max: 36000
    });
  });

  it("classifies internships without creating a separate Adzuna-specific type", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob({
      title: "Policy Research Intern"
    }), {
      randomUUID: () => "intern-id"
    });

    expect(candidate.type).toBe("internship");
  });
});

describe("Adzuna detail-page description enrichment", () => {
  const detailHtml = `
    <html>
      <body>
        <section class="adp-body mx-4 mb-4 text-sm">
          <p>Support policy research and quantitative analysis for a growing institute.</p>
          <p><strong>Responsibilities:</strong></p>
          <ul>
            <li><p>Produce research briefings &amp; policy analysis.</p></li>
            <li><p>Work with senior researchers.</p></li>
          </ul>
          <p><strong>Requirements:</strong></p>
          <ul>
            <li><p>Excellent written English.</p></li>
            <li><p>Strong research skills and attention to detail.</p></li>
          </ul>
          <p>This is a deliberately longer fixture so the enrichment guard accepts it as a full description rather than a search snippet. It contains enough additional detail to exceed the excerpt by more than fifty characters.</p>
        </section>
      </body>
    </html>
  `;

  it("builds a stable Adzuna details URL from the external id", () => {
    expect(buildAdzunaDetailsUrl("5889029805")).toBe(
      "https://www.adzuna.co.uk/jobs/details/5889029805"
    );
  });

  it("extracts and cleans the visible adp-body description", () => {
    const extracted = extractAdzunaDetailDescription(detailHtml);

    expect(extracted).toContain("Responsibilities:");
    expect(extracted).toContain("- Produce research briefings & policy analysis.");
    expect(extracted).toContain("Requirements:");
    expect(extracted).not.toContain("<p>");
  });

  it("only accepts detail-page text that is materially fuller than the API excerpt", () => {
    const excerpt = "Support policy research and quantitative analysis for a growing institute.";
    const full = extractAdzunaDetailDescription(detailHtml);

    expect(isUsefulAdzunaDetailDescription(full, excerpt)).toBe(true);
    expect(isUsefulAdzunaDetailDescription(excerpt, excerpt)).toBe(false);
  });

  it("replaces the excerpt, preserves it as provenance, and recomputes the fingerprint", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob({
      description: "Support policy research and quantitative analysis for a growing institute."
    }), {
      now: new Date("2026-09-20T12:00:00.000Z"),
      randomUUID: () => "detail-id"
    });
    const originalHash = candidate.contentHash;
    const full = extractAdzunaDetailDescription(detailHtml);

    const enriched = enrichAdzunaCandidateDescription(
      candidate,
      full,
      new Date("2026-09-20T15:29:20.000Z")
    );

    expect(enriched.description).toBe(full);
    expect(enriched.contentHash).not.toBe(originalHash);
    expect(enriched.sourcePayload).toMatchObject({
      api_description_excerpt: "Support policy research and quantitative analysis for a growing institute.",
      description_is_excerpt: false,
      description_completeness: "full",
      description_source: "adzuna_detail_page",
      description_detail_url: "https://www.adzuna.co.uk/jobs/details/12345",
      description_fetched_at: "2026-09-20T15:29:20.000Z"
    });
  });
});

describe("Adzuna detail enrichment state", () => {
  const now = new Date("2026-09-20T16:00:00.000Z");

  it("skips candidates that are already full or permanently unavailable", () => {
    expect(getAdzunaDescriptionEnrichmentDecision({
      description_completeness: "full",
      detail_enrichment_attempt_count: 1
    }, now)).toEqual({
      action: "skip_full",
      attemptCount: 1
    });

    expect(getAdzunaDescriptionEnrichmentDecision({
      detail_enrichment_status: "unavailable",
      detail_enrichment_attempt_count: 2
    }, now)).toEqual({
      action: "skip_unavailable",
      attemptCount: 2
    });
  });

  it("honors retry backoff and releases the candidate after the retry time", () => {
    const payload = {
      detail_enrichment_status: "retry_later",
      detail_enrichment_attempt_count: 2,
      detail_enrichment_next_retry_at: "2026-09-20T22:00:00.000Z"
    };

    expect(getAdzunaDescriptionEnrichmentDecision(payload, now)).toEqual({
      action: "skip_backoff",
      attemptCount: 2,
      nextRetryAt: "2026-09-20T22:00:00.000Z"
    });

    expect(getAdzunaDescriptionEnrichmentDecision(
      payload,
      new Date("2026-09-20T22:00:01.000Z")
    )).toEqual({
      action: "fetch",
      attemptCount: 2
    });
  });

  it("uses exponential retry backoff capped at 72 hours", () => {
    expect(calculateAdzunaDescriptionRetryAt({
      attemptCount: 0,
      now
    })).toBe("2026-09-20T22:00:00.000Z");

    expect(calculateAdzunaDescriptionRetryAt({
      attemptCount: 2,
      now
    })).toBe("2026-09-21T16:00:00.000Z");

    expect(calculateAdzunaDescriptionRetryAt({
      attemptCount: 10,
      now
    })).toBe("2026-09-23T16:00:00.000Z");
  });

  it("respects Retry-After and classifies permanent vs transient HTTP failures", () => {
    expect(calculateAdzunaDescriptionRetryAt({
      attemptCount: 0,
      retryAfter: "3600",
      now
    })).toBe("2026-09-20T17:00:00.000Z");

    expect(classifyAdzunaDetailHttpFailure(404)).toEqual({
      status: "unavailable",
      reason: "http_404"
    });
    expect(classifyAdzunaDetailHttpFailure(429)).toEqual({
      status: "retry_later",
      reason: "http_429"
    });
    expect(classifyAdzunaDetailHttpFailure(503)).toEqual({
      status: "retry_later",
      reason: "http_503"
    });
  });
});

describe("Adzuna relevance scoring", () => {
  it("keeps a plausible research assistant", () => {
    const evaluation = evaluateFixture({}, "research-assistant");

    expect(evaluation.keep).toBe(true);
    expect(evaluation.score).toBeGreaterThanOrEqual(evaluation.threshold);
    expect(evaluation.reasons).toContain("exact_query_in_title");
  });

  it("rejects a senior AI governance lead from the first live scan", () => {
    const evaluation = evaluateFixture({
      title: "AI Governance Lead",
      description: "Lead responsible AI governance frameworks and policy.",
      category: { label: "IT Jobs", tag: "it-jobs" }
    }, "ai-governance-analyst");

    expect(evaluation.keep).toBe(false);
    expect(evaluation.reasons).toContain("seniority_penalty");
  });

  it("rejects the HGV driver false positive from the first live scan", () => {
    const evaluation = evaluateFixture({
      title: "HGV Driver",
      description: "Construction logistics role.",
      category: { label: "Trade & Construction Jobs", tag: "trade-construction-jobs" }
    }, "ai-policy-analyst");

    expect(evaluation.keep).toBe(false);
    expect(evaluation.reasons).toEqual(expect.arrayContaining([
      "no_target_role_in_title",
      "wrong_occupation",
      "wrong_category"
    ]));
  });

  it("rejects the head-chef false positive from the first live scan", () => {
    const evaluation = evaluateFixture({
      title: "Head Chef",
      description: "Manage a kitchen and menus.",
      category: { label: "Hospitality & Catering Jobs", tag: "hospitality-catering-jobs" }
    }, "technology-policy-analyst");

    expect(evaluation.keep).toBe(false);
    expect(evaluation.reasons).toEqual(expect.arrayContaining([
      "no_target_role_in_title",
      "wrong_occupation",
      "wrong_category"
    ]));
  });

  it("rejects political-risk underwriting while retaining political-risk graduate work", () => {
    const underwriting = evaluateFixture({
      title: "Political & Financial Risk Underwriter",
      description: "Experienced underwriter for a Lloyd's insurer.",
      category: { label: "Accounting & Finance Jobs", tag: "accounting-finance-jobs" }
    }, "political-risk-analyst");

    const graduate = evaluateFixture({
      title: "Credit & Political Risk Graduate Programme 2027",
      description: "Graduate programme covering political risk and international markets.",
      category: { label: "Graduate Jobs", tag: "graduate-jobs" }
    }, "political-risk-analyst");

    expect(underwriting.keep).toBe(false);
    expect(underwriting.reasons).toContain("wrong_occupation");
    expect(graduate.keep).toBe(true);
    expect(graduate.reasons).toContain("entry_signal");
  });

  it("keeps useful policy/research edge cases from the first live scan", () => {
    const policyConsultant = evaluateFixture({
      title: "Policy Consultant",
      description: "Advise technology companies on policy and public affairs.",
      category: { label: "IT Jobs", tag: "it-jobs" }
    }, "technology-policy-analyst");

    const biotechResearch = evaluateFixture({
      title: "Research Analyst - Emerging Biotechnology",
      description: "Independent research to improve policy and decision-making.",
      category: { label: "Scientific & QA Jobs", tag: "scientific-qa-jobs" }
    }, "technology-policy-analyst");

    expect(policyConsultant.keep).toBe(true);
    expect(biotechResearch.keep).toBe(true);
  });

  it("keeps founder-associate and strategy-intern roles", () => {
    const foundersAssociate = evaluateFixture({
      title: "Founder's Associate",
      description: "Seed-stage startup role supporting the founder across strategy and operations.",
      category: { label: "IT Jobs", tag: "it-jobs" }
    }, "founders-associate");

    const strategyIntern = evaluateFixture({
      title: "Strategy Analyst Intern",
      description: "Ten-week strategy analyst internship supporting business analysis.",
      category: { label: "IT Jobs", tag: "it-jobs" }
    }, "strategy-analyst");

    expect(foundersAssociate.keep).toBe(true);
    expect(strategyIntern.keep).toBe(true);
  });

  it("rejects recruitment consulting from graduate consulting searches", () => {
    const evaluation = evaluateFixture({
      title: "Graduate / Trainee Recruitment Consultant (Engineering)",
      description: "Launch a career in recruitment consulting.",
      category: { label: "Graduate Jobs", tag: "graduate-jobs" }
    }, "graduate-strategy-consultant");

    expect(evaluation.keep).toBe(false);
    expect(evaluation.reasons).toContain("wrong_occupation");
  });

  it("filters hard five-plus-years experience requirements", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob({
      description: "Candidates must have at least 5 years experience in consulting."
    }), {
      query: "research assistant",
      profileId: "research-assistant",
      randomUUID: () => "experienced-id"
    });

    expect(extractMinimumExperienceYears(candidate.description)).toBe(5);
    expect(evaluateAdzunaCandidate(candidate, profile("research-assistant"))).toMatchObject({
      keep: false,
      reasons: expect.arrayContaining(["requires_5_plus_years"])
    });
  });

  it("does not reject three years of experience by itself", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob({
      description: "Requires 3 years of relevant experience."
    }), {
      query: "research assistant",
      profileId: "research-assistant",
      randomUUID: () => "three-years-id"
    });

    expect(evaluateAdzunaCandidate(candidate, profile("research-assistant")).keep).toBe(true);
  });
});

describe("Adzuna query configuration", () => {
  it("uses 24 precise default searches to stay inside the default per-minute API budget", () => {
    const profiles = normalizeRequestedSearchProfiles(undefined);

    expect(profiles).toHaveLength(24);
    expect(profiles.map((item) => item.query)).toEqual(expect.arrayContaining([
      "research assistant",
      "policy analyst",
      "graduate strategy consultant",
      "founder's associate",
      "AI policy analyst",
      "technology policy analyst",
      "political risk analyst",
      "AI consultant"
    ]));
    expect(profiles.map((item) => item.query)).not.toContain("startup operations");
    expect(profiles.map((item) => item.query)).not.toContain("technology policy");
    expect(profiles.map((item) => item.query)).not.toContain("AI policy");
  });

  it("normalizes, deduplicates, and caps custom searches", () => {
    const profiles = normalizeRequestedSearchProfiles([
      "  Policy Analyst ",
      "policy analyst",
      "",
      "Research Assistant"
    ]);

    expect(profiles.map((item) => item.query)).toEqual([
      "Policy Analyst",
      "Research Assistant"
    ]);
    expect(profiles.every((item) => item.family === "custom")).toBe(true);
  });
});
