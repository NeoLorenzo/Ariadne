import { describe, expect, it } from "vitest";
import {
  getKleosVectorState,
  isKleosSnapshotStale,
  normalizeKleosVectorSnapshot
} from "./vectorStateRepository";

describe("Kleos vector state read model", () => {
  it("normalizes assessed and explicit unknown vectors without treating unknown as zero", () => {
    const snapshot = normalizeKleosVectorSnapshot({
      id: "snapshot-1",
      evaluated_at: "2026-09-07T10:00:00Z",
      evaluator: "kleos-bot",
      methodology_version: "1.0.0",
      created_at: "2026-09-07T10:01:00Z",
      results: [
        { vector_id: "physical", status: "assessed", score: 72, confidence: "medium", commentary: "Physical evidence." },
        { vector_id: "psychological", status: "unknown", score: null, confidence: "unknown", commentary: "Insufficient evidence." }
      ]
    });

    expect(getKleosVectorState(snapshot, "physical")).toMatchObject({ status: "assessed", score: 72 });
    expect(getKleosVectorState(snapshot, "psychological")).toEqual({
      vectorId: "psychological",
      status: "unknown",
      score: null,
      confidence: "unknown",
      commentary: "Insufficient evidence."
    });
  });

  it("tolerates partial snapshot results so missing Kleos state cannot block Ariadne", () => {
    const snapshot = normalizeKleosVectorSnapshot({
      evaluated_at: "2026-09-07T10:00:00Z",
      evaluator: "kleos-bot",
      methodology_version: "1.0.0",
      results: [
        { vector_id: "professional", status: "assessed", score: 80, confidence: "medium", commentary: "Professional evidence." }
      ]
    });

    expect(getKleosVectorState(snapshot, "professional")?.score).toBe(80);
    expect(getKleosVectorState(snapshot, "creative")).toBeNull();
  });

  it("drops malformed or non-canonical result rows instead of inventing state", () => {
    const snapshot = normalizeKleosVectorSnapshot({
      evaluated_at: "2026-09-07T10:00:00Z",
      results: [
        { vector_id: "not-a-vector", status: "assessed", score: 99, confidence: "high" },
        { vector_id: "financial", status: "assessed", score: 120, confidence: "high" }
      ]
    });

    expect(snapshot.results).toEqual([]);
  });

  it("marks snapshots older than two weekly cycles as stale while retaining their values", () => {
    const snapshot = normalizeKleosVectorSnapshot({
      evaluated_at: "2026-08-20T10:00:00Z",
      results: [
        { vector_id: "intellectual", status: "assessed", score: 89, confidence: "high", commentary: "Evidence." }
      ]
    });

    expect(isKleosSnapshotStale(snapshot, new Date("2026-09-07T10:00:00Z"))).toBe(true);
    expect(getKleosVectorState(snapshot, "intellectual")?.score).toBe(89);
  });

  it("does not mark a recent weekly snapshot stale", () => {
    const snapshot = normalizeKleosVectorSnapshot({
      evaluated_at: "2026-09-01T10:00:00Z",
      results: []
    });

    expect(isKleosSnapshotStale(snapshot, new Date("2026-09-07T10:00:00Z"))).toBe(false);
  });
});
