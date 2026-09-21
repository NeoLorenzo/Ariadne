"use client";

import { useEffect, useMemo, useState } from "react";
import { loadOpportunityLandscapeScores } from "./opportunityLandscapeScoreRepository";

export function useOpportunityLandscapeScores({ userId, opportunityIds }) {
  const [scores, setScores] = useState([]);
  const [error, setError] = useState(null);
  const opportunityKey = useMemo(() => [...new Set(opportunityIds || [])].sort().join("|"), [opportunityIds]);

  useEffect(() => {
    let active = true;
    const ids = opportunityKey ? opportunityKey.split("|") : [];

    if (!userId || !ids.length) {
      setScores([]);
      setError(null);
      return undefined;
    }

    void loadOpportunityLandscapeScores({ userId, opportunityIds: ids })
      .then((rows) => {
        if (!active) return;
        setScores(rows);
        setError(null);
      })
      .catch((nextError) => {
        if (!active) return;
        setError(nextError);
      });

    return () => { active = false; };
  }, [opportunityKey, userId]);

  const scoresByOpportunity = useMemo(
    () => Object.fromEntries(scores.map((score) => [score.opportunityId, score])),
    [scores]
  );

  return { scores, scoresByOpportunity, error };
}
