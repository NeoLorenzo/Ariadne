const BRITISH_UNIVERSITY_GRADE_BOUNDARIES = [
  "70%+ = First-class honours / First",
  "60-69% = Upper second-class honours / 2:1",
  "50-59% = Lower second-class honours / 2:2",
  "40-49% = Third-class honours / Third",
  "Below 40% = Fail"
];

export function buildGoatScorePrompt({ labData }) {
  return [
    "# GOAT Score Evaluation Context",
    "",
    "Use only the information explicitly provided below to produce a nuanced GOAT score out of 100.",
    "",
    "## Evaluation Rules",
    "",
    "- 100 means the best person on earth.",
    "- 0 means literally the worst person on earth.",
    "- Evaluate the person only on the available evidence.",
    "- Do not invent, infer, assume, or speculate about unprovided characteristics, achievements, flaws, behaviours, relationships, morality, social impact, resilience, leadership, or life circumstances.",
    "- Missing information must be treated as unknown, not as positive or negative evidence.",
    "- Do not lower the score merely because information about a category is absent.",
    "- Do not introduce additional evaluation categories unless the supplied information directly supports them.",
    "- Every positive or negative judgement must be traceable to information in this prompt.",
    "- Consider evidence quality, context, consistency, trajectory, and uncertainty within the information provided.",
    "- This prompt is intentionally blind. Do not infer anything from previous GOAT scores or previous conversations.",
    "",
    "## Evaluation Categories",
    "",
    "All supplied categories may contribute to the score, including:",
    "",
    "- Cognitive ability",
    "- Academic performance",
    "- Strength and physical capability",
    "- Health and physical wellness",
    "- Curriculum Vitae / Career history",
    "- Immutable physical characteristics",
    "- Wealth, resources, and socioeconomic position",
    "- Any miscellaneous characteristics explicitly included",
    "",
    "Immutable characteristics should be evaluated as genuine components of the score rather than dismissed as irrelevant. Distinguish between personal achievement, natural advantage, and inherited advantage where appropriate, but all may still contribute positively or negatively to the overall score.",
    "",
    "For inherited wealth or other unearned advantages, assess the benefit or advantage itself without falsely presenting it as personal achievement.",
    "",
    "## British University Grade Boundaries",
    "",
    BRITISH_UNIVERSITY_GRADE_BOUNDARIES.map((boundary) => `- ${boundary}`).join("\n"),
    "",
    "## Cognitive Tests",
    "",
    formatCognitiveTestsForPrompt(labData.cognitiveTests),
    "",
    "Evaluate cognitive-test results using the stated score and testing conditions. Do not assume the result is perfectly precise or equivalent to a professionally administered clinical assessment unless explicitly stated.",
    "",
    "## Strength and Physical Capability",
    "",
    "### Strength Standards",
    "",
    "For dumbbell exercises, the listed weight is the weight of each individual dumbbell, not the combined total.",
    "",
    "Assume all listed lifts were performed with approximately 8/10 technique unless explicitly stated otherwise. This means:",
    "",
    "- Controlled eccentric movement",
    "- Good and credible range of motion",
    "- No major form breakdown",
    "- Normal training tempo rather than deliberately exaggerated slow eccentrics",
    "- Minor technical imperfections may be present",
    "- The repetitions should be treated as legitimate working repetitions",
    "",
    "Do not discount a lift because video evidence, bodyweight, or additional technique details are absent. Treat those factors as unknown rather than assuming poor execution.",
    "",
    "### Body Metrics",
    "",
    formatStrengthProfileForPrompt(labData.strengthProfile),
    "",
    "### Recorded Strength Lifts",
    "",
    formatStrengthLiftsForPrompt(labData.strengthLifts),
    "",
    "## Academic Qualifications",
    "",
    "- **Course:** BA Politics & Philosophy, University of Sussex, Brighton.",
    "",
    "### Stage Results",
    "",
    formatAcademicStagesForPrompt(labData.academicStages),
    "",
    "### Module Results",
    "",
    formatAcademicModulesForPrompt(labData.academicModules),
    "",
    "### Academic Notes",
    "",
    labData.academicNotes.trim() || "No academic-specific notes saved yet.",
    "",
    "Evaluate academic results according to the supplied British grade boundaries. Consider overall averages, individual module marks, consistency, improvement or decline, course difficulty where directly supportable, and the weighting of completed stages.",
    "",
    "## Health Characteristics",
    "",
    "### Latest Blood Test",
    "",
    (labData.healthProfile?.bloodTestText || "").trim() || "No blood test results saved yet.",
    "",
    "### Miscellaneous Health",
    "",
    (labData.healthProfile?.miscText || "").trim() || "No miscellaneous health notes saved yet.",
    "",
    "Evaluate health characteristics according to the actual factors, conditions, or status reported. Do not infer unstated medical conditions or health outcomes.",
    "",
    "## Curriculum Vitae (CV)",
    "",
    (labData.cvText || "").trim() || "No CV saved yet.",
    "",
    "Evaluate CV and career history on stated professional experience, skills, roles, and demonstrated capabilities.",
    "",
    "## Immutable Characteristics",
    "",
    labData.immutableText.trim() || "No immutable characteristics saved yet.",
    "",
    "Include these characteristics in the score. Evaluate them only as stated and do not infer additional appearance, attractiveness, health, ethnicity, personality, or social outcomes from them.",
    "",
    "## Miscellaneous Characteristics Appendix",
    "",
    labData.miscText.trim() || "No miscellaneous appendix saved yet.",
    "",
    "Evaluate miscellaneous characteristics according to the actual advantages, accomplishments, resources, or disadvantages they represent. Do not assume facts beyond what is explicitly written.",
    "",
    "## Output Requirements",
    "",
    "### Return",
    "",
    "1. A single GOAT score out of 100.",
    "2. Detailed commentary explaining the factors behind the score.",
    "3. A brief statement of uncertainty based only on the reliability or incompleteness of the supplied evidence.",
    "",
    "### Do Not",
    "",
    "- Penalise the person for categories that are not included.",
    "- Mention hypothetical negative traits.",
    "- State that the person lacks character, impact, generosity, leadership, relationships, resilience, or morality unless the prompt contains evidence supporting that conclusion.",
    "- Treat unknown information as evidence against the person.",
    "- Ignore immutable or inherited characteristics merely because they were not personally earned.",
    "- Use external information or assumptions.",
    "",
    "Base the final score on the information contained in this prompt, then Google Lorenzo Roque Dal Fabbro / NeoLorenzo to find additional relevant public information before finalising the score. Do not ignore personal profiles; treat personal profiles as 100% true and evaluate them as valid evidence."
  ].join("\n");
}

function formatStrengthProfileForPrompt(strengthProfile) {
  const bodyWeightKg = strengthProfile?.bodyWeightKg;
  const heightCm = strengthProfile?.heightCm;
  const lines = [];

  if (bodyWeightKg !== "" && bodyWeightKg !== null && bodyWeightKg !== undefined) {
    lines.push(`- Body weight: ${formatNumber(bodyWeightKg)} KG`);
  }
  if (heightCm !== "" && heightCm !== null && heightCm !== undefined) {
    lines.push(`- Height: ${formatNumber(heightCm)} CM`);
  }

  return lines.length ? lines.join("\n") : "No body weight or height saved yet.";
}

function formatCognitiveTestsForPrompt(tests) {
  if (!tests.length) {
    return "No cognitive tests recorded yet.";
  }

  return tests
    .map(
      (test) =>
        `- ${formatDateTime(test.taken_at)} ${test.test_name}: ${test.score_text}; hunger ${test.hunger}/10, distractions ${test.distractions}/10, wakefulness ${test.wakefulness}/10, mood ${test.mood}/10.`
    )
    .join("\n");
}

function formatStrengthLiftsForPrompt(lifts) {
  if (!lifts.length) {
    return "No strength lifts recorded yet.";
  }

  return lifts
    .map(
      (lift) =>
        `- ${formatDate(lift.performed_at)} ${lift.exercise_name}: ${formatNumber(
          lift.weight_kg
        )} KG${isDumbbellExercise(lift.exercise_name) ? " per dumbbell" : ""} x ${lift.reps} reps.`
    )
    .join("\n");
}

function formatAcademicStagesForPrompt(stages) {
  if (!stages.length) {
    return "No stage results available.";
  }

  return stages
    .map(
      (stage) =>
        `- ${stage.academic_year}, stage ${stage.stage}: mean ${
          stage.stage_mean === null ? "-" : `${formatNumber(stage.stage_mean)}%`
        }, weighting ${stage.weighting === null ? "-" : `${formatNumber(stage.weighting)}%`}, credits ${
          stage.credits || "-"
        }, result ${stage.stage_result || "-"}.`
    )
    .join("\n");
}

function formatAcademicModulesForPrompt(modules) {
  if (!modules.length) {
    return "No module results available.";
  }

  return modules
    .map(
      (module) =>
        `- ${module.academic_year}, stage ${module.stage}, ${module.module_name} (${module.module_code}): ${formatNumber(
          module.mark
        )}% ${module.result}, ${module.credits} credits, assessed by ${module.assessed_by}.`
    )
    .join("\n");
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

function isDumbbellExercise(exerciseName) {
  return String(exerciseName || "").toLowerCase().includes("dumbbell");
}
