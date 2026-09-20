import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADZUNA_QUERIES,
  buildAdzunaSearchUrl,
  evaluateAdzunaCandidate,
  extractMinimumExperienceYears,
  normalizeAdzunaJob,
  normalizeRequestedQueries
} from "./adzuna";

function sampleAdzunaJob(overrides = {}) {
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

describe("Adzuna discovery normalization", () => {
  it("builds the official UK search endpoint without leaking credentials into code defaults", () => {
    const url = new URL(buildAdzunaSearchUrl({
      appId: "app id",
      appKey: "secret/key",
      query: "policy analyst",
      resultsPerPage: 15
    }));

    expect(url.origin).toBe("https://api.adzuna.com");
    expect(url.pathname).toBe("/v1/api/jobs/gb/search/1");
    expect(url.searchParams.get("app_id")).toBe("app id");
    expect(url.searchParams.get("app_key")).toBe("secret/key");
    expect(url.searchParams.get("what")).toBe("policy analyst");
    expect(url.searchParams.get("results_per_page")).toBe("15");
  });

  it("normalizes an Adzuna result into the Opportunity candidate contract", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob(), {
      query: "research assistant",
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

describe("Adzuna relevance filter", () => {
  it("keeps plausible entry-level jobs", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob(), {
      randomUUID: () => "entry-id"
    });

    expect(evaluateAdzunaCandidate(candidate)).toMatchObject({
      keep: true,
      reasons: []
    });
  });

  it("filters explicit senior titles", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob({
      title: "Senior Policy Analyst"
    }), {
      randomUUID: () => "senior-id"
    });

    expect(evaluateAdzunaCandidate(candidate)).toMatchObject({
      keep: false,
      reasons: expect.arrayContaining(["senior_title"])
    });
  });

  it("filters hard five-plus-years experience requirements", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob({
      description: "Candidates must have at least 5 years experience in consulting."
    }), {
      randomUUID: () => "experienced-id"
    });

    expect(extractMinimumExperienceYears(candidate.description)).toBe(5);
    expect(evaluateAdzunaCandidate(candidate)).toMatchObject({
      keep: false,
      reasons: expect.arrayContaining(["requires_5_plus_years"])
    });
  });

  it("does not reject three years of experience", () => {
    const candidate = normalizeAdzunaJob(sampleAdzunaJob({
      description: "Requires 3 years of relevant experience."
    }), {
      randomUUID: () => "three-years-id"
    });

    expect(evaluateAdzunaCandidate(candidate).keep).toBe(true);
  });
});

describe("Adzuna query configuration", () => {
  it("uses the broad default query families when no override is supplied", () => {
    const queries = normalizeRequestedQueries(undefined);

    expect(queries).toEqual([...DEFAULT_ADZUNA_QUERIES]);
    expect(queries).toContain("research assistant");
    expect(queries).toContain("founder's associate");
    expect(queries).toContain("AI governance");
  });

  it("normalizes, deduplicates, and caps custom queries", () => {
    const queries = normalizeRequestedQueries([
      "  Policy Analyst ",
      "policy analyst",
      "",
      "Research Assistant"
    ]);

    expect(queries).toEqual(["Policy Analyst", "Research Assistant"]);
  });
});
