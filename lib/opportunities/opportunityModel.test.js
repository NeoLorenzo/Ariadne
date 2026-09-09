import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_TYPES,
  compareOpportunityDeadlines,
  createOpportunityRecord,
  isExpiredOpportunity,
  isOpportunityValid,
  isValidDateOnly,
  makeOpportunityId,
  normalizeOpportunity,
  sortOpportunitiesByDeadline,
  validateOpportunity
} from "./opportunityModel";

describe("opportunity model", () => {
  it("defines the canonical opportunity types", () => {
    expect(OPPORTUNITY_TYPES).toEqual([
      "job",
      "internship",
      "fellowship",
      "masters",
      "course",
      "program",
      "other"
    ]);
  });

  it("normalizes user and database-shaped opportunity data", () => {
    expect(normalizeOpportunity({
      id: " opportunity-1 ",
      title: "  Research Fellowship  ",
      type: " FELLOWSHIP ",
      organization: "  Example Institute ",
      url: " https://example.com/apply ",
      description: "  Description  ",
      requirements: "  Requirements  ",
      deadline: "2026-10-31",
      start_date: "2027-01-15",
      archived: 1,
      created_at: "2026-09-09T12:00:00.000Z",
      updated_at: "2026-09-09T13:00:00.000Z"
    })).toEqual({
      id: "opportunity-1",
      title: "Research Fellowship",
      type: "fellowship",
      organization: "Example Institute",
      url: "https://example.com/apply",
      description: "Description",
      requirements: "Requirements",
      deadline: "2026-10-31",
      startDate: "2027-01-15",
      archived: true,
      createdAt: "2026-09-09T12:00:00.000Z",
      updatedAt: "2026-09-09T13:00:00.000Z"
    });
  });

  it("normalizes invalid legacy types and dates safely", () => {
    const normalized = normalizeOpportunity({
      title: "Legacy record",
      type: "scholarship",
      deadline: "2026-02-31",
      startDate: "not-a-date"
    });

    expect(normalized.type).toBe("other");
    expect(normalized.deadline).toBe("");
    expect(normalized.startDate).toBe("");
  });

  it("creates records with client-generated IDs and timestamps", () => {
    const now = new Date("2026-09-09T16:45:00.000Z");
    const record = createOpportunityRecord({
      title: "Policy internship",
      type: "internship"
    }, now);

    expect(record.id).toMatch(/^opportunity-/);
    expect(record.createdAt).toBe("2026-09-09T16:45:00.000Z");
    expect(record.updatedAt).toBe("2026-09-09T16:45:00.000Z");
    expect(record.archived).toBe(false);
  });

  it("generates distinct opportunity IDs", () => {
    const first = makeOpportunityId();
    const second = makeOpportunityId();
    expect(first).toMatch(/^opportunity-/);
    expect(second).toMatch(/^opportunity-/);
    expect(second).not.toBe(first);
  });

  it("validates required fields, type, URL, and date-only values", () => {
    expect(validateOpportunity({
      title: "   ",
      type: "scholarship",
      url: "ftp://example.com/file",
      deadline: "2026-02-31",
      startDate: "31/10/2026"
    })).toEqual({
      title: "Title is required.",
      type: "Choose a valid opportunity type.",
      url: "URL must use http or https.",
      deadline: "Deadline must be a valid date.",
      startDate: "Start date must be a valid date."
    });

    expect(isOpportunityValid({
      title: "Master's in Public Policy",
      type: "masters",
      url: "https://example.edu/mpp",
      deadline: "2027-01-15",
      startDate: "2027-09-01"
    })).toBe(true);
  });

  it("accepts valid calendar dates and rejects impossible ones", () => {
    expect(isValidDateOnly("2028-02-29")).toBe(true);
    expect(isValidDateOnly("2027-02-29")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
    expect(isValidDateOnly("2026-10-32")).toBe(false);
  });

  it("treats an opportunity as expired only after its deadline day", () => {
    const opportunity = { deadline: "2026-09-09" };

    expect(isExpiredOpportunity(opportunity, "2026-09-08")).toBe(false);
    expect(isExpiredOpportunity(opportunity, "2026-09-09")).toBe(false);
    expect(isExpiredOpportunity(opportunity, "2026-09-10")).toBe(true);
    expect(isExpiredOpportunity({ deadline: "" }, "2026-09-10")).toBe(false);
  });

  it("sorts concrete deadlines first without mutating the source array", () => {
    const source = [
      { id: "none", title: "No deadline", deadline: "" },
      { id: "later", title: "Later", deadline: "2026-12-01" },
      { id: "early-b", title: "Beta", deadline: "2026-10-01" },
      { id: "early-a", title: "Alpha", deadline: "2026-10-01" }
    ];

    const sorted = sortOpportunitiesByDeadline(source);

    expect(sorted.map((item) => item.id)).toEqual([
      "early-a",
      "early-b",
      "later",
      "none"
    ]);
    expect(source.map((item) => item.id)).toEqual([
      "none",
      "later",
      "early-b",
      "early-a"
    ]);
    expect(compareOpportunityDeadlines(source[2], source[3])).toBeGreaterThan(0);
  });
});
