"use client";

import { supabase } from "@/lib/supabase/client";
import { normalizeOpportunityLandscapeScore } from "./opportunityLandscapeScore";

const SELECT = [
  "opportunity_id",
  "user_id",
  "strategic_relevance",
  "upside",
  "option_value",
  "opportunity_cost_efficiency",
  "eligibility",
  "competitiveness",
  "career_stage_fit",
  "timing_actionability",
  "strategic_value",
  "attainability",
  "strategic_value_rationale",
  "attainability_rationale",
  "methodology_version",
  "created_at",
  "updated_at"
].join(",");

export async function loadOpportunityLandscapeScores({ userId, opportunityIds = [] }) {
  if (!supabase || !userId || !opportunityIds.length) return [];

  const { data, error } = await supabase
    .from("opportunity_landscape_scores")
    .select(SELECT)
    .eq("user_id", userId)
    .in("opportunity_id", opportunityIds);

  if (error) throw error;
  return (data || []).map(normalizeOpportunityLandscapeScore);
}
