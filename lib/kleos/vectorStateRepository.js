import { supabase } from "@/lib/supabase/client";
import { VECTOR_IDS, isVectorId } from "@/lib/vectors/vectorVocabulary";

const SNAPSHOT_SELECT = `
  id,
  evaluated_at,
  evaluator,
  methodology_version,
  overall_score,
  created_at,
  results:kleos_vector_snapshot_results(
    vector_id,
    status,
    score,
    confidence,
    commentary
  )
`;

export async function loadLatestKleosVectorSnapshot(userId) {
  if (!supabase || !userId) {
    throw new Error("Kleos current state requires an authenticated Supabase session.");
  }

  const { data, error } = await supabase
    .from("kleos_vector_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("user_id", userId)
    .order("evaluated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeKleosVectorSnapshot(data) : null;
}

export function normalizeKleosVectorSnapshot(row) {
  if (!row || typeof row !== "object") return null;

  const evaluatedAt = normalizeTimestamp(row.evaluated_at ?? row.evaluatedAt);
  if (!evaluatedAt) return null;

  const resultsByVectorId = {};
  for (const rawResult of row.results ?? row.kleos_vector_snapshot_results ?? []) {
    const result = normalizeResult(rawResult);
    if (!result) continue;
    resultsByVectorId[result.vectorId] = result;
  }

  return {
    id: row.id || null,
    evaluatedAt,
    evaluator: String(row.evaluator || "").trim(),
    methodologyVersion: String(row.methodology_version ?? row.methodologyVersion ?? "").trim(),
    overallScore: normalizeOptionalScore(row.overall_score ?? row.overallScore),
    createdAt: normalizeTimestamp(row.created_at ?? row.createdAt),
    results: VECTOR_IDS.map((vectorId) => resultsByVectorId[vectorId]).filter(Boolean),
    resultsByVectorId
  };
}

export function isKleosSnapshotStale(snapshot, now = new Date(), maxAgeDays = 14) {
  if (!snapshot?.evaluatedAt) return false;
  const evaluatedAt = new Date(snapshot.evaluatedAt).getTime();
  const nowValue = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(evaluatedAt) || !Number.isFinite(nowValue)) return false;
  return nowValue - evaluatedAt > maxAgeDays * 86400000;
}

export function getKleosVectorState(snapshot, vectorId) {
  return snapshot?.resultsByVectorId?.[vectorId] || null;
}

function normalizeResult(rawResult) {
  if (!rawResult || typeof rawResult !== "object") return null;
  const vectorId = String(rawResult.vector_id ?? rawResult.vectorId ?? "").trim().toLowerCase();
  if (!isVectorId(vectorId)) return null;

  const status = String(rawResult.status || "").trim().toLowerCase();
  const commentary = String(rawResult.commentary || "").trim();
  if (status === "unknown") {
    return {
      vectorId,
      status: "unknown",
      score: null,
      confidence: "unknown",
      commentary
    };
  }

  const score = Number(rawResult.score);
  const confidence = String(rawResult.confidence || "").trim().toLowerCase();
  if (
    status !== "assessed" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100 ||
    !new Set(["low", "medium", "high"]).has(confidence)
  ) {
    return null;
  }

  return { vectorId, status: "assessed", score, confidence, commentary };
}

function normalizeOptionalScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
