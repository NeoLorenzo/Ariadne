import { describe, expect, it } from "vitest";
import {
  VECTOR_IDS,
  getVectorDefinition,
  isVectorId,
  normalizeVectorIds
} from "./vectorVocabulary";

describe("vector vocabulary", () => {
  it("exposes the canonical interoperable identifiers in stable order", () => {
    expect(VECTOR_IDS).toEqual([
      "physical",
      "psychological",
      "intellectual",
      "professional",
      "financial",
      "relational",
      "creative",
      "experiential"
    ]);
  });

  it("normalizes membership without inventing weights or duplicate components", () => {
    expect(normalizeVectorIds(["professional", "intellectual", "professional", "unknown", "creative"]))
      .toEqual(["intellectual", "professional", "creative"]);
  });

  it("provides labels/descriptions for every canonical vector", () => {
    for (const vectorId of VECTOR_IDS) {
      expect(isVectorId(vectorId)).toBe(true);
      expect(getVectorDefinition(vectorId)).toMatchObject({ id: vectorId });
      expect(getVectorDefinition(vectorId)?.label).toBeTruthy();
      expect(getVectorDefinition(vectorId)?.description).toBeTruthy();
    }
  });
});
