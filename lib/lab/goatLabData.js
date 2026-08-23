import { supabase } from "@/lib/supabase/client";

export const AUTHORIZED_LAB_EMAIL = "theneolorenzo@gmail.com";

export function createEmptyLabData() {
  return {
    scoreEntries: [],
    strengthLifts: [],
    cognitiveTests: [],
    academicStages: [],
    academicModules: [],
    academicNotes: "",
    strengthProfile: {
      bodyWeightKg: "",
      heightCm: ""
    },
    healthProfile: {
      bloodTestText: "",
      miscText: ""
    },
    cvText: "",
    immutableText: "",
    miscText: ""
  };
}

export async function loadGoatLabData(userId) {
  if (!supabase || !userId) {
    throw new Error("The GOAT Lab is unavailable without an authenticated cloud session.");
  }

  const [
    scoreEntriesResult,
    strengthLiftsResult,
    cognitiveTestsResult,
    academicStagesResult,
    academicModulesResult,
    academicNotesResult,
    strengthProfileResult,
    healthResult,
    cvResult,
    immutableResult,
    miscResult
  ] = await Promise.all([
    supabase
      .from("goat_score_entries")
      .select("id,score,entry_date,llm_commentary,created_at")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("goat_strength_lifts")
      .select("id,exercise_name,weight_kg,reps,performed_at,created_at")
      .eq("user_id", userId)
      .order("performed_at", { ascending: false }),
    supabase
      .from("goat_cognitive_tests")
      .select("id,test_name,score_text,taken_at,hunger,distractions,wakefulness,mood,created_at")
      .eq("user_id", userId)
      .order("taken_at", { ascending: false }),
    supabase
      .from("goat_academic_stage_results")
      .select("id,academic_year,stage,exam_board,stage_mean,weighting,credits,stage_result")
      .eq("user_id", userId)
      .order("academic_year", { ascending: false }),
    supabase
      .from("goat_academic_module_results")
      .select("id,academic_year,stage,module_name,module_code,term,attempt,assessed_by,mark,result,credits")
      .eq("user_id", userId)
      .order("academic_year", { ascending: false })
      .order("module_name", { ascending: true }),
    supabase
      .from("goat_academic_notes")
      .select("content")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_strength_profile")
      .select("body_weight_kg,height_cm")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_health_characteristics")
      .select("blood_test_content,misc_content,content")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_cv_characteristics")
      .select("content")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_immutable_characteristics")
      .select("content")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goat_misc_characteristics")
      .select("content")
      .eq("user_id", userId)
      .maybeSingle()
  ]);

  const firstError = [
    scoreEntriesResult.error,
    strengthLiftsResult.error,
    cognitiveTestsResult.error,
    academicStagesResult.error,
    academicModulesResult.error,
    academicNotesResult.error,
    strengthProfileResult.error,
    healthResult.error,
    cvResult.error,
    immutableResult.error,
    miscResult.error
  ].find(Boolean);

  if (firstError) {
    throw firstError;
  }

  return {
    scoreEntries: scoreEntriesResult.data || [],
    strengthLifts: strengthLiftsResult.data || [],
    cognitiveTests: cognitiveTestsResult.data || [],
    academicStages: academicStagesResult.data || [],
    academicModules: academicModulesResult.data || [],
    academicNotes: academicNotesResult.data?.content || "",
    strengthProfile: {
      bodyWeightKg: strengthProfileResult.data?.body_weight_kg ?? "",
      heightCm: strengthProfileResult.data?.height_cm ?? ""
    },
    healthProfile: {
      bloodTestText: healthResult.data?.blood_test_content || "",
      miscText: healthResult.data?.misc_content || healthResult.data?.content || ""
    },
    cvText: cvResult.data?.content || "",
    immutableText: immutableResult.data?.content || "",
    miscText: miscResult.data?.content || ""
  };
}
