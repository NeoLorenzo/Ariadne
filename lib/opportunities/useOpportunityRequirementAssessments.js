"use client";

import { useEffect, useMemo, useState } from "react";
import {
  clearUserRequirementAssessment,
  loadRequirementAssessments,
  setUserRequirementAssessment
} from "./opportunityRequirementAssessmentRepository";

export function useOpportunityRequirementAssessments({ userId, entityType, entityIds }) {
  const [assessments, setAssessments] = useState([]);
  const [error, setError] = useState(null);
  const entityKey = useMemo(() => [...new Set(entityIds || [])].sort().join("|"), [entityIds]);

  useEffect(() => {
    let active = true;
    const ids = entityKey ? entityKey.split("|") : [];
    if (!userId || !ids.length) {
      setAssessments([]);
      return undefined;
    }

    void loadRequirementAssessments({ userId, entityType, entityIds: ids })
      .then((rows) => {
        if (!active) return;
        setAssessments(rows);
        setError(null);
      })
      .catch((nextError) => {
        if (!active) return;
        setError(nextError);
      });
    return () => { active = false; };
  }, [entityKey, entityType, userId]);

  const assessmentsByEntity = useMemo(() => {
    const grouped = {};
    assessments.forEach((assessment) => {
      if (!grouped[assessment.entityId]) grouped[assessment.entityId] = [];
      grouped[assessment.entityId].push(assessment);
    });
    return grouped;
  }, [assessments]);

  const setManualAssessment = async ({ entityId, requirementId, status, rationale = "" }) => {
    const saved = await setUserRequirementAssessment({ userId, entityType, entityId, requirementId, status, rationale });
    setAssessments((current) => [
      ...current.filter((assessment) => !(assessment.entityId === entityId && assessment.requirementId === requirementId && assessment.assessedBy === "user")),
      saved
    ]);
    return saved;
  };

  const clearManualAssessment = async ({ entityId, requirementId }) => {
    await clearUserRequirementAssessment({ userId, entityType, entityId, requirementId });
    setAssessments((current) => current.filter((assessment) => !(assessment.entityId === entityId && assessment.requirementId === requirementId && assessment.assessedBy === "user")));
  };

  return { assessments, assessmentsByEntity, error, setManualAssessment, clearManualAssessment };
}
