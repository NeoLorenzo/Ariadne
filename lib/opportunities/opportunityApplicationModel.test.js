import { describe, expect, it } from "vitest";
import {
  ACTIVE_OPPORTUNITY_APPLICATION_STATUSES,
  OPPORTUNITY_APPLICATION_STATUSES,
  createOpportunityApplicationRecord,
  isApplicationActive,
  normalizeOpportunityApplication,
  resolveApplicationOpportunity,
  sortOpportunityApplications,
  validateOpportunityApplication
} from "./opportunityApplicationModel";

describe("opportunity application model", () => {
  it("defines the canonical application statuses", () => {
    expect(OPPORTUNITY_APPLICATION_STATUSES).toEqual([
      "submitted",
      "interviewing",
      "waitlisted",
      "offer",
      "accepted",
      "rejected",
      "withdrawn",
      "declined"
    ]);
    expect([...ACTIVE_OPPORTUNITY_APPLICATION_STATUSES]).toEqual([
      "submitted",
      "interviewing",
      "waitlisted",
      "offer"
    ]);
  });

  it("normalizes database-shaped applications", () => {
    expect(normalizeOpportunityApplication({
      id: " application-1 ",
      opportunity_id: " opportunity-1 ",
      submitted_at: "2026-09-15T12:00:00.000Z",
      status: " INTERVIEWING ",
      status_updated_at: "2026-09-20T12:00:00.000Z",
      notes: "  next round  ",
      created_at: "2026-09-15T12:00:00.000Z",
      updated_at: "2026-09-20T12:00:00.000Z"
    })).toEqual({
      id: "application-1",
      opportunityId: "opportunity-1",
      liveOpportunityId: "opportunity-1",
      opportunitySnapshot: {
        id: "opportunity-1",
        title: "",
        type: "other",
        organization: "",
        url: "",
        deadline: "",
        startDate: "",
        historical: true
      },
      submittedAt: "2026-09-15T12:00:00.000Z",
      status: "interviewing",
      statusUpdatedAt: "2026-09-20T12:00:00.000Z",
      notes: "next round",
      createdAt: "2026-09-15T12:00:00.000Z",
      updatedAt: "2026-09-20T12:00:00.000Z"
    });
  });

  it("preserves a historical Opportunity snapshot after the live Landscape link is gone", () => {
    const application = normalizeOpportunityApplication({
      id: "application-history",
      opportunity_id: null,
      historical_opportunity_id: "opportunity-expired",
      opportunity_snapshot: {
        id: "opportunity-expired",
        title: "Expired programme",
        type: "program",
        organization: "Example Institute",
        deadline: "2026-09-01"
      },
      submitted_at: "2026-08-01T12:00:00.000Z",
      status: "interviewing"
    });

    expect(application.liveOpportunityId).toBe("");
    expect(resolveApplicationOpportunity(application, {})).toMatchObject({
      id: "opportunity-expired",
      title: "Expired programme",
      organization: "Example Institute",
      historical: true
    });
  });

  it("prefers the current Landscape record while the live link still exists", () => {
    const application = normalizeOpportunityApplication({
      id: "application-live",
      opportunity_id: "opportunity-live",
      historical_opportunity_id: "opportunity-live",
      opportunity_snapshot: { id: "opportunity-live", title: "Snapshot title" },
      submitted_at: "2026-09-15T12:00:00.000Z",
      status: "submitted"
    });
    const live = { id: "opportunity-live", title: "Current title", type: "program" };
    expect(resolveApplicationOpportunity(application, { "opportunity-live": live })).toBe(live);
  });

  it("creates submitted applications with stable timestamps", () => {
    const now = new Date("2026-09-15T16:00:00.000Z");
    const record = createOpportunityApplicationRecord({ opportunityId: "opportunity-1", submittedAt: "2026-09-15T12:00:00.000Z", status: "submitted" }, now);
    expect(record.id).toMatch(/^application-/);
    expect(record.status).toBe("submitted");
    expect(record.statusUpdatedAt).toBe("2026-09-15T16:00:00.000Z");
    expect(record.createdAt).toBe("2026-09-15T16:00:00.000Z");
  });

  it("validates opportunity, submitted date, and status", () => {
    expect(validateOpportunityApplication({ opportunityId: "", submittedAt: "not-a-date", status: "drafting" })).toEqual({
      opportunityId: "A linked opportunity is required.",
      submittedAt: "A valid submission date is required.",
      status: "Choose a valid application status."
    });
  });

  it("classifies active and closed states", () => {
    expect(isApplicationActive({ status: "submitted" })).toBe(true);
    expect(isApplicationActive({ status: "offer" })).toBe(true);
    expect(isApplicationActive({ status: "accepted" })).toBe(false);
    expect(isApplicationActive({ status: "rejected" })).toBe(false);
  });

  it("sorts most recent submissions first", () => {
    const sorted = sortOpportunityApplications([
      { id: "old", submittedAt: "2026-09-01T12:00:00.000Z" },
      { id: "new", submittedAt: "2026-09-15T12:00:00.000Z" }
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["new", "old"]);
  });
});
