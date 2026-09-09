"use client";

import { supabase } from "@/lib/supabase/client";
import {
  REQUIREMENT_ASSESSMENT_STATUSES,
  normalizeRequirementAssessment
} from "./opportunityEligibility";

const ENTITY_TYPES = ["candidate", "opportunity"];
const SELECT = "id,user_id,entity_type,entity_id,requirement_id,status,assessed_by,confidence,rationale,evidence,created_at,updated_at";

function validateEntityType(value) {
  if (!ENTITY_TYPES.includes(value)) throw new Error("INVALID_ASSESSMENT_ENTITY_TYPE");
}

export async function loadRequirementAssessments({ userId, entityType, entityIds = [] }) {
  if (!supabase || !userId || !entityIds.length) return [];
  validateEntityType(entityType);
  const { data, error } = await supabase
    .from("opportunity_requirement_assessments")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .in("entity_id", entityIds);
  if (error) throw error;
  return (data || []).map(normalizeRequirementAssessment);
}

export async function setUserRequirementAssessment({ userId, entityType, entityId, requirementId, status, rationale = "" }) {
  validateEntityType(entityType);
  if (!REQUIREMENT_ASSESSMENT_STATUSES.includes(status)) throw new Error("INVALID_ASSESSMENT_STATUS");
  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    requirement_id: requirementId,
    status,
    assessed_by: "user",
    confidence: null,
    rationale: String(rationale || "").trim() || null,
    evidence: {},
    updated_at: now
  };
  const { data, error } = await supabase
    .from("opportunity_requirement_assessments")
    .upsert(payload, { onConflict: "user_id,entity_type,entity_id,requirement_id,assessed_by" })
    .select(SELECT)
    .single();
  if (error) throw error;
  return normalizeRequirementAssessment(data);
}

export async function clearUserRequirementAssessment({ userId, entityType, entityId, requirementId }) {
  validateEntityType(entityType);
  const { error } = await supabase
    .from("opportunity_requirement_assessments")
    .delete()
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("requirement_id", requirementId)
    .eq("assessed_by", "user");
  if (error) throw error;
}
