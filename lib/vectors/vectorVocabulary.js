export const VECTOR_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "physical",
    label: "Physical",
    description: "Health, strength, endurance, body composition, sleep, nutrition, and mobility."
  }),
  Object.freeze({
    id: "psychological",
    label: "Psychological",
    description: "Wellbeing, emotional regulation, resilience, agency, self-esteem, motivation, and psychological coherence."
  }),
  Object.freeze({
    id: "intellectual",
    label: "Intellectual",
    description: "Knowledge, reasoning, mental models, learning ability, expertise, and critical thinking."
  }),
  Object.freeze({
    id: "professional",
    label: "Professional",
    description: "Career capital, qualifications, portfolio, experience, reputation, employability, and professional network."
  }),
  Object.freeze({
    id: "financial",
    label: "Financial",
    description: "Income, assets, savings, liquidity, financial independence, and earning capacity."
  }),
  Object.freeze({
    id: "relational",
    label: "Relational",
    description: "Romantic relationship, friendships, family, community, social connection, and relationship quality."
  }),
  Object.freeze({
    id: "creative",
    label: "Creative",
    description: "Writing, filmmaking, photography, design, artistic skill, and creative output."
  }),
  Object.freeze({
    id: "experiential",
    label: "Experiential",
    description: "Travel, novelty, adventure, environments, events, memorable experiences, and breadth of lived life."
  })
]);

export const VECTOR_IDS = Object.freeze(VECTOR_DEFINITIONS.map((vector) => vector.id));
const VECTOR_ID_SET = new Set(VECTOR_IDS);
const VECTOR_BY_ID = new Map(VECTOR_DEFINITIONS.map((vector) => [vector.id, vector]));

export function isVectorId(value) {
  return VECTOR_ID_SET.has(String(value || "").trim().toLowerCase());
}

export function getVectorDefinition(vectorId) {
  return VECTOR_BY_ID.get(String(vectorId || "").trim().toLowerCase()) || null;
}

export function normalizeVectorIds(values) {
  const requested = new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter((value) => VECTOR_ID_SET.has(value)));
  return VECTOR_IDS.filter((vectorId) => requested.has(vectorId));
}

export function getVectorLabel(vectorId) {
  return getVectorDefinition(vectorId)?.label || String(vectorId || "");
}
