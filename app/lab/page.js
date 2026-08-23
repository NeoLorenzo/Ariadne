"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase/client";
import {
  AUTHORIZED_LAB_EMAIL,
  createEmptyLabData,
  loadGoatLabData
} from "@/lib/lab/goatLabData";
import { buildGoatScorePrompt } from "@/lib/lab/goatPrompt";

const STRENGTH_EXERCISES = [
  "Flat Barbell Bench",
  "Seated Dumbbell Hammer Curls",
  "Overhead Dumbbell Tricep Extensions",
  "Seated Dumbbell Lateral Raises",
  "Seated Dumbbell Overhead Press"
];
const COGNITIVE_TESTS = [
  "Mensa Norway",
  "Forward Digit Span",
  "Backward Digit Span",
  "Sequential Digit Span"
];

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function getDateTimeLocalValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function createDefaultScoreForm() {
  return {
    score: "",
    entryDate: getTodayDateValue(),
    commentary: ""
  };
}

function createDefaultLiftForm() {
  return {
    exerciseName: STRENGTH_EXERCISES[0],
    weightKg: "",
    reps: "",
    performedAt: getTodayDateValue()
  };
}

function createDefaultCognitiveForm() {
  return {
    testName: COGNITIVE_TESTS[0],
    score: "",
    takenAt: getDateTimeLocalValue(),
    hunger: "",
    distractions: "",
    wakefulness: "",
    mood: ""
  };
}

export default function LabPage() {
  const [accessState, setAccessState] = useState("loading");
  const [user, setUser] = useState(null);
  const [labData, setLabData] = useState(createEmptyLabData);
  const [scoreForm, setScoreForm] = useState(createDefaultScoreForm);
  const [liftForm, setLiftForm] = useState(createDefaultLiftForm);
  const [cognitiveForm, setCognitiveForm] = useState(createDefaultCognitiveForm);
  const [strengthProfileForm, setStrengthProfileForm] = useState({
    bodyWeightKg: "",
    heightCm: ""
  });
  const [academicNotesDraft, setAcademicNotesDraft] = useState("");
  const [healthForm, setHealthForm] = useState({
    bloodTestText: "",
    miscText: ""
  });
  const [cvDraft, setCvDraft] = useState("");
  const [immutableDraft, setImmutableDraft] = useState("");
  const [miscDraft, setMiscDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const latestScoreEntry = useMemo(
    () => [...labData.scoreEntries].sort(compareScoreEntries)[0] || null,
    [labData.scoreEntries]
  );
  const llmContextPrompt = useMemo(
    () => buildGoatScorePrompt({ labData }),
    [labData]
  );

  useEffect(() => {
    if (!supabase) {
      setAccessState("unconfigured");
      return undefined;
    }

    let isMounted = true;
    const handleAuthUser = async (nextUser) => {
      if (!isMounted) {
        return;
      }

      const email = String(nextUser?.email || "").trim().toLowerCase();
      if (!nextUser) {
        setUser(null);
        setAccessState("signed-out");
        setStatusMessage("");
        return;
      }

      if (email !== AUTHORIZED_LAB_EMAIL) {
        setUser(nextUser);
        setAccessState("unauthorized");
        setStatusMessage("This Lab is locked to the authorized account.");
        return;
      }

      setUser(nextUser);
      setAccessState("authorized");
      await loadLabData(nextUser.id, { isMounted: () => isMounted });
    };

    void supabase.auth.getUser().then(({ data }) => {
      void handleAuthUser(data?.user || null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void handleAuthUser(session?.user || null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadLabData = async (userId, options = {}) => {
    const isMounted = options.isMounted || (() => true);
    setStatusMessage("Loading private Lab data...");

    try {
      const nextLabData = await loadGoatLabData(userId);

      if (isMounted()) {
        setLabData(nextLabData);
        setAcademicNotesDraft(nextLabData.academicNotes);
        setStrengthProfileForm({
          bodyWeightKg:
            nextLabData.strengthProfile.bodyWeightKg === ""
              ? ""
              : String(nextLabData.strengthProfile.bodyWeightKg),
          heightCm:
            nextLabData.strengthProfile.heightCm === ""
              ? ""
              : String(nextLabData.strengthProfile.heightCm)
        });
        setHealthForm({
          bloodTestText: nextLabData.healthProfile?.bloodTestText || "",
          miscText: nextLabData.healthProfile?.miscText || ""
        });
        setCvDraft(nextLabData.cvText || "");
        setImmutableDraft(nextLabData.immutableText);
        setMiscDraft(nextLabData.miscText);
        setStatusMessage("");
      }
    } catch (error) {
      if (isMounted()) {
        setStatusMessage(`Lab data failed to load: ${getErrorMessage(error)}`);
      }
    }
  };

  const signInWithGoogle = async () => {
    if (!supabase) {
      return;
    }

    setStatusMessage("");
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}${basePath || ""}/lab`
        : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });
    if (error) {
      setStatusMessage(error.message || "Google sign-in failed.");
    }
  };

  const saveScoreEntry = async (event) => {
    event.preventDefault();
    if (!user?.id || isSaving) {
      return;
    }

    const scoreValue = Number(scoreForm.score);
    if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100 || !scoreForm.entryDate) {
      setStatusMessage("Enter a GOAT score from 0 to 100 and a date.");
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_score_entries")
      .insert({
        user_id: user.id,
        score: scoreValue,
        entry_date: scoreForm.entryDate,
        llm_commentary: scoreForm.commentary.trim()
      })
      .select("id,score,entry_date,llm_commentary,created_at")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`GOAT score save failed: ${error.message}`);
      return;
    }

    setLabData((current) => ({
      ...current,
      scoreEntries: [data, ...current.scoreEntries].sort(compareScoreEntries)
    }));
    setScoreForm(createDefaultScoreForm());
    setStatusMessage("GOAT score entry saved.");
  };

  const saveStrengthLift = async (event) => {
    event.preventDefault();
    if (!user?.id || isSaving) {
      return;
    }

    const weightKg = Number(liftForm.weightKg);
    const reps = Number(liftForm.reps);
    if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isInteger(reps) || reps <= 0) {
      setStatusMessage("Enter a positive KG weight and whole-number reps.");
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_strength_lifts")
      .insert({
        user_id: user.id,
        exercise_name: liftForm.exerciseName,
        weight_kg: weightKg,
        reps,
        performed_at: new Date(`${liftForm.performedAt}T00:00:00`).toISOString()
      })
      .select("id,exercise_name,weight_kg,reps,performed_at,created_at")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Lift save failed: ${error.message}`);
      return;
    }

    setLabData((current) => ({
      ...current,
      strengthLifts: [data, ...current.strengthLifts].sort(compareDatedRows("performed_at"))
    }));
    setLiftForm(createDefaultLiftForm());
    setStatusMessage("Lift saved.");
  };

  const saveCognitiveTest = async (event) => {
    event.preventDefault();
    if (!user?.id || isSaving) {
      return;
    }

    const conditionScores = ["hunger", "distractions", "wakefulness", "mood"].reduce(
      (scores, key) => ({ ...scores, [key]: Number(cognitiveForm[key]) }),
      {}
    );
    const hasInvalidCondition = Object.values(conditionScores).some(
      (score) => !Number.isInteger(score) || score < 0 || score > 10
    );
    if (!cognitiveForm.score.trim() || hasInvalidCondition) {
      setStatusMessage("Enter the cognitive score and every condition rating from 0 to 10.");
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_cognitive_tests")
      .insert({
        user_id: user.id,
        test_name: cognitiveForm.testName,
        score_text: cognitiveForm.score.trim(),
        taken_at: new Date(cognitiveForm.takenAt).toISOString(),
        ...conditionScores
      })
      .select("id,test_name,score_text,taken_at,hunger,distractions,wakefulness,mood,created_at")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Cognitive test save failed: ${error.message}`);
      return;
    }

    setLabData((current) => ({
      ...current,
      cognitiveTests: [data, ...current.cognitiveTests].sort(compareDatedRows("taken_at"))
    }));
    setCognitiveForm(createDefaultCognitiveForm());
    setStatusMessage("Cognitive test saved.");
  };

  const saveMiscText = async () => {
    if (!user?.id || isSaving) {
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_misc_characteristics")
      .upsert(
        {
          user_id: user.id,
          content: miscDraft,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Miscellaneous appendix save failed: ${error.message}`);
      return;
    }

    setLabData((current) => ({ ...current, miscText: data?.content || "" }));
    setStatusMessage("Miscellaneous appendix saved.");
  };

  const saveAcademicNotes = async () => {
    if (!user?.id || isSaving) {
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_academic_notes")
      .upsert(
        {
          user_id: user.id,
          content: academicNotesDraft,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Academic notes save failed: ${error.message}`);
      return;
    }

    setLabData((current) => ({ ...current, academicNotes: data?.content || "" }));
    setStatusMessage("Academic notes saved.");
  };

  const saveStrengthProfile = async () => {
    if (!user?.id || isSaving) {
      return;
    }

    const bodyWeightKg =
      strengthProfileForm.bodyWeightKg === "" ? null : Number(strengthProfileForm.bodyWeightKg);
    const heightCm = strengthProfileForm.heightCm === "" ? null : Number(strengthProfileForm.heightCm);
    if (
      (bodyWeightKg !== null && (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0)) ||
      (heightCm !== null && (!Number.isFinite(heightCm) || heightCm <= 0))
    ) {
      setStatusMessage("Body weight and height must be positive numbers when provided.");
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_strength_profile")
      .upsert(
        {
          user_id: user.id,
          body_weight_kg: bodyWeightKg,
          height_cm: heightCm,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("body_weight_kg,height_cm")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Strength profile save failed: ${error.message}`);
      return;
    }

    setLabData((current) => ({
      ...current,
      strengthProfile: {
        bodyWeightKg: data?.body_weight_kg ?? "",
        heightCm: data?.height_cm ?? ""
      }
    }));
    setStatusMessage("Strength profile saved.");
  };

  const saveHealthForm = async () => {
    if (!user?.id || isSaving) {
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_health_characteristics")
      .upsert(
        {
          user_id: user.id,
          blood_test_content: healthForm.bloodTestText,
          misc_content: healthForm.miscText,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("blood_test_content,misc_content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Health save failed: ${error.message}`);
      return;
    }

    setLabData((current) => ({
      ...current,
      healthProfile: {
        bloodTestText: data?.blood_test_content || "",
        miscText: data?.misc_content || ""
      }
    }));
    setStatusMessage("Health characteristics saved.");
  };

  const saveCvText = async () => {
    if (!user?.id || isSaving) {
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_cv_characteristics")
      .upsert(
        {
          user_id: user.id,
          content: cvDraft,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`CV save failed: ${error.message}`);
      return;
    }

    setLabData((current) => ({ ...current, cvText: data?.content || "" }));
    setStatusMessage("CV saved.");
  };

  const saveImmutableText = async () => {
    if (!user?.id || isSaving) {
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_immutable_characteristics")
      .upsert(
        {
          user_id: user.id,
          content: immutableDraft,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Immutable characteristics save failed: ${error.message}`);
      return;
    }

    setLabData((current) => ({ ...current, immutableText: data?.content || "" }));
    setStatusMessage("Immutable characteristics saved.");
  };

  const copyLlmContext = async () => {
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(llmContextPrompt);
      setCopyStatus("Copied LLM context.");
    } catch (error) {
      setCopyStatus(`Copy failed: ${getErrorMessage(error)}`);
    }
  };

  return (
    <AppShell activeNavItem="lab">
      <section className="lab-workspace">
        <section className="lab-board-modal">
          <header className="lab-board-header">
            <div>
              <p className="lab-board-kicker">Private Tracker</p>
              <h2 className="lab-board-title">GOAT Lab</h2>
            </div>
            {accessState === "authorized" ? (
              <button type="button" className="lab-secondary-btn" onClick={copyLlmContext}>
                Copy LLM Context
              </button>
            ) : null}
          </header>

          {renderAccessGate({
            accessState,
            user,
            statusMessage,
            onSignIn: signInWithGoogle
          }) || (
            <div className="goat-lab-scroll">
              <section className="goat-score-panel">
                <div className="goat-score-readout">
                  <span>Current GOAT Score</span>
                  <strong>{latestScoreEntry ? `${formatNumber(latestScoreEntry.score)} / 100` : "-- / 100"}</strong>
                  <em>{latestScoreEntry ? formatDate(latestScoreEntry.entry_date) : "No score yet"}</em>
                </div>
                <form className="goat-score-form" onSubmit={saveScoreEntry}>
                  <label>
                    Score
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={scoreForm.score}
                      onChange={(event) =>
                        setScoreForm((current) => ({ ...current, score: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Date
                    <input
                      type="date"
                      value={scoreForm.entryDate}
                      onChange={(event) =>
                        setScoreForm((current) => ({ ...current, entryDate: event.target.value }))
                      }
                    />
                  </label>
                  <label className="goat-score-commentary-field">
                    LLM commentary
                    <textarea
                      rows={3}
                      value={scoreForm.commentary}
                      onChange={(event) =>
                        setScoreForm((current) => ({ ...current, commentary: event.target.value }))
                      }
                    />
                  </label>
                  <button type="submit" className="lab-primary-btn" disabled={isSaving}>
                    Update Score
                  </button>
                </form>
              </section>

              <div className="goat-lab-grid">
                <section className="goat-lab-card">
                  <div className="goat-section-header">
                    <h3>Cognitive Tests</h3>
                  </div>
                  <form className="goat-compact-form" onSubmit={saveCognitiveTest}>
                    <label>
                      Test
                      <select
                        value={cognitiveForm.testName}
                        onChange={(event) =>
                          setCognitiveForm((current) => ({
                            ...current,
                            testName: event.target.value
                          }))
                        }
                      >
                        {COGNITIVE_TESTS.map((testName) => (
                          <option key={testName} value={testName}>
                            {testName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Score
                      <input
                        value={cognitiveForm.score}
                        onChange={(event) =>
                          setCognitiveForm((current) => ({ ...current, score: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Date/time
                      <input
                        type="datetime-local"
                        value={cognitiveForm.takenAt}
                        onChange={(event) =>
                          setCognitiveForm((current) => ({ ...current, takenAt: event.target.value }))
                        }
                      />
                    </label>
                    {["hunger", "distractions", "wakefulness", "mood"].map((fieldName) => (
                      <label key={fieldName}>
                        {capitalize(fieldName)} /10
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="1"
                          value={cognitiveForm[fieldName]}
                          onChange={(event) =>
                            setCognitiveForm((current) => ({
                              ...current,
                              [fieldName]: event.target.value
                            }))
                          }
                        />
                      </label>
                    ))}
                    <button type="submit" className="lab-primary-btn" disabled={isSaving}>
                      Save Test
                    </button>
                  </form>
                  <CompactTable
                    columns={["Test", "Score", "Date", "Context"]}
                    rows={labData.cognitiveTests.map((test) => [
                      test.test_name,
                      test.score_text,
                      formatDateTime(test.taken_at),
                      `H ${test.hunger}/10, D ${test.distractions}/10, W ${test.wakefulness}/10, M ${test.mood}/10`
                    ])}
                    emptyText="No cognitive tests recorded yet."
                  />
                </section>

                <section className="goat-lab-card">
                  <div className="goat-section-header">
                    <h3>Strength Standards</h3>
                    <p>Dumbbell weights are per dumbbell, not total.</p>
                  </div>
                  <div className="goat-inline-form">
                    <label>
                      Body Weight KG
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={strengthProfileForm.bodyWeightKg}
                        onChange={(event) =>
                          setStrengthProfileForm((current) => ({
                            ...current,
                            bodyWeightKg: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      Height CM
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={strengthProfileForm.heightCm}
                        onChange={(event) =>
                          setStrengthProfileForm((current) => ({
                            ...current,
                            heightCm: event.target.value
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="lab-primary-btn"
                      onClick={saveStrengthProfile}
                      disabled={isSaving}
                    >
                      Save Stats
                    </button>
                  </div>
                  <form className="goat-compact-form" onSubmit={saveStrengthLift}>
                    <label>
                      Exercise
                      <select
                        value={liftForm.exerciseName}
                        onChange={(event) =>
                          setLiftForm((current) => ({ ...current, exerciseName: event.target.value }))
                        }
                      >
                        {STRENGTH_EXERCISES.map((exerciseName) => (
                          <option key={exerciseName} value={exerciseName}>
                            {exerciseName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label title="For dumbbell exercises, enter the weight of one dumbbell, not the combined total.">
                      KG
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={liftForm.weightKg}
                        onChange={(event) =>
                          setLiftForm((current) => ({ ...current, weightKg: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Reps
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={liftForm.reps}
                        onChange={(event) =>
                          setLiftForm((current) => ({ ...current, reps: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Date
                      <input
                        type="date"
                        value={liftForm.performedAt}
                        onChange={(event) =>
                          setLiftForm((current) => ({ ...current, performedAt: event.target.value }))
                        }
                      />
                    </label>
                    <button type="submit" className="lab-primary-btn" disabled={isSaving}>
                      Save Lift
                    </button>
                  </form>
                  <CompactTable
                    columns={["Exercise", "Lift", "Date"]}
                    rows={labData.strengthLifts.map((lift) => [
                      lift.exercise_name,
                      `${formatNumber(lift.weight_kg)} KG${isDumbbellExercise(lift.exercise_name) ? " per dumbbell" : ""} x ${lift.reps}`,
                      formatDate(lift.performed_at)
                    ])}
                    emptyText="No lifts recorded yet."
                  />
                </section>

                <section className="goat-lab-card is-wide">
                  <div className="goat-section-header">
                    <h3>Academic Qualifications</h3>
                    <p>University of Sussex, Brighton - BA Politics & Philosophy</p>
                  </div>
                  <CompactTable
                    columns={["Year", "Stage", "Mean", "Weighting", "Credits", "Result"]}
                    rows={labData.academicStages.map((stage) => [
                      stage.academic_year,
                      stage.stage,
                      stage.stage_mean === null ? "-" : `${formatNumber(stage.stage_mean)}%`,
                      stage.weighting === null ? "-" : `${formatNumber(stage.weighting)}%`,
                      stage.credits || "-",
                      stage.stage_result || "-"
                    ])}
                    emptyText="Academic stage data is not available."
                  />
                  <CompactTable
                    columns={["Year", "Module", "Mark", "Credits"]}
                    rows={labData.academicModules.map((module) => [
                      module.academic_year,
                      module.module_name,
                      `${formatNumber(module.mark)}% ${module.result}`,
                      module.credits
                    ])}
                    emptyText="Academic module data is not available."
                  />
                  <textarea
                    className="goat-misc-textarea"
                    value={academicNotesDraft}
                    onChange={(event) => setAcademicNotesDraft(event.target.value)}
                    placeholder="Academic-specific notes for the LLM context prompt."
                  />
                  <button
                    type="button"
                    className="lab-primary-btn"
                    onClick={saveAcademicNotes}
                    disabled={isSaving}
                  >
                    Save Academic Notes
                  </button>
                </section>

                <section className="goat-lab-card">
                  <div className="goat-section-header">
                    <h3>Health Characteristics</h3>
                  </div>
                  <div className="goat-stacked-form">
                    <label>
                      Latest Blood Test
                      <textarea
                        className="goat-misc-textarea"
                        value={healthForm.bloodTestText}
                        onChange={(event) =>
                          setHealthForm((current) => ({
                            ...current,
                            bloodTestText: event.target.value
                          }))
                        }
                        placeholder="Plain-text latest blood test results for the LLM context prompt."
                      />
                    </label>
                    <label>
                      Miscellaneous Health
                      <textarea
                        className="goat-misc-textarea"
                        value={healthForm.miscText}
                        onChange={(event) =>
                          setHealthForm((current) => ({
                            ...current,
                            miscText: event.target.value
                          }))
                        }
                        placeholder="Plain-text miscellaneous health details for the LLM context prompt."
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="lab-primary-btn"
                    onClick={saveHealthForm}
                    disabled={isSaving}
                  >
                    Save Health
                  </button>
                </section>

                <section className="goat-lab-card">
                  <div className="goat-section-header">
                    <h3>CV</h3>
                  </div>
                  <textarea
                    className="goat-misc-textarea"
                    value={cvDraft}
                    onChange={(event) => setCvDraft(event.target.value)}
                    placeholder="Paste plain-text CV for the LLM context prompt."
                  />
                  <button
                    type="button"
                    className="lab-primary-btn"
                    onClick={saveCvText}
                    disabled={isSaving}
                  >
                    Save CV
                  </button>
                </section>

                <section className="goat-lab-card">
                  <div className="goat-section-header">
                    <h3>Immutable Characteristics</h3>
                  </div>
                  <textarea
                    className="goat-misc-textarea"
                    value={immutableDraft}
                    onChange={(event) => setImmutableDraft(event.target.value)}
                    placeholder="Plain-text immutable characteristics for the LLM context prompt."
                  />
                  <button
                    type="button"
                    className="lab-primary-btn"
                    onClick={saveImmutableText}
                    disabled={isSaving}
                  >
                    Save Immutable
                  </button>
                </section>

                <section className="goat-lab-card">
                  <div className="goat-section-header">
                    <h3>Miscellaneous Characteristics</h3>
                  </div>
                  <textarea
                    className="goat-misc-textarea"
                    value={miscDraft}
                    onChange={(event) => setMiscDraft(event.target.value)}
                    placeholder="Plain-text appendix for the LLM context prompt."
                  />
                  <button type="button" className="lab-primary-btn" onClick={saveMiscText} disabled={isSaving}>
                    Save Appendix
                  </button>
                </section>

                <section className="goat-lab-card is-wide">
                  <div className="goat-section-header">
                    <h3>GOAT Score History</h3>
                  </div>
                  <CompactTable
                    columns={["Score", "Date", "LLM Commentary"]}
                    rows={labData.scoreEntries.map((entry) => [
                      `${formatNumber(entry.score)} / 100`,
                      formatDate(entry.entry_date),
                      entry.llm_commentary || "-"
                    ])}
                    emptyText="No GOAT score entries yet."
                  />
                </section>
              </div>

              {statusMessage || copyStatus ? (
                <p className="goat-status-line">{copyStatus || statusMessage}</p>
              ) : null}
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}

function renderAccessGate({ accessState, user, statusMessage, onSignIn }) {
  if (accessState === "authorized") {
    return null;
  }

  const titleByState = {
    loading: "Checking Lab Access",
    unconfigured: "Supabase Required",
    "signed-out": "Private Lab",
    unauthorized: "Access Denied"
  };
  const bodyByState = {
    loading: "Verifying the signed-in account before loading any Lab data.",
    unconfigured: "This page requires Supabase because Lab data is server-side only.",
    "signed-out": `Sign in with ${AUTHORIZED_LAB_EMAIL} to open the Lab.`,
    unauthorized: `${user?.email || "This account"} is not authorized for the Lab.`
  };

  return (
    <section className="lab-access-panel">
      <h3>{titleByState[accessState] || "Private Lab"}</h3>
      <p>{statusMessage || bodyByState[accessState]}</p>
      {accessState === "signed-out" ? (
        <button type="button" className="lab-primary-btn" onClick={onSignIn}>
          Sign In With Google
        </button>
      ) : null}
    </section>
  );
}

function CompactTable({ columns, rows, emptyText }) {
  return (
    <div className="goat-table-wrap">
      <table className="goat-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join("|")}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cellIndex}-${cell}`}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function compareScoreEntries(left, right) {
  const rightDate = new Date(`${right.entry_date || ""}T00:00:00`).getTime();
  const leftDate = new Date(`${left.entry_date || ""}T00:00:00`).getTime();
  if (rightDate !== leftDate) {
    return rightDate - leftDate;
  }
  return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
}

function compareDatedRows(dateKey) {
  return (left, right) => new Date(right[dateKey] || 0).getTime() - new Date(left[dateKey] || 0).getTime();
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function formatNumber(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return "-";
  }
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(1);
}

function getErrorMessage(error) {
  return error?.message || (error instanceof Error ? error.message : "Unknown error");
}

function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function isDumbbellExercise(exerciseName) {
  return String(exerciseName || "").toLowerCase().includes("dumbbell");
}
