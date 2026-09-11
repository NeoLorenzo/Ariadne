"use client";

import { useEffect, useMemo, useState } from "react";
import DirectionPanel from "@/components/DirectionPanel";
import { loadDirectionsState } from "@/lib/directions/directionRepository";
import {
  getKleosVectorState,
  isKleosSnapshotStale,
  loadLatestKleosVectorSnapshot
} from "@/lib/kleos/vectorStateRepository";
import { VECTOR_DEFINITIONS, getVectorLabel } from "@/lib/vectors/vectorVocabulary";
import styles from "@/app/dashboard/dashboard.module.css";

const EMPTY_DIRECTIONS_STATE = { directions: [], revisionsByDirectionId: {} };

export default function DashboardStrategyOverview({ userId }) {
  const [directionsState, setDirectionsState] = useState(EMPTY_DIRECTIONS_STATE);
  const [snapshotState, setSnapshotState] = useState({ status: "loading", snapshot: null });
  const [showStrategyManager, setShowStrategyManager] = useState(false);

  useEffect(() => {
    let active = true;
    loadDirectionsState(userId)
      .then((nextState) => {
        if (active) setDirectionsState(nextState || EMPTY_DIRECTIONS_STATE);
      })
      .catch(() => {
        if (active) setDirectionsState(EMPTY_DIRECTIONS_STATE);
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setSnapshotState({ status: "idle", snapshot: null });
      return () => { active = false; };
    }

    setSnapshotState({ status: "loading", snapshot: null });
    loadLatestKleosVectorSnapshot(userId)
      .then((snapshot) => {
        if (active) setSnapshotState({ status: "ready", snapshot });
      })
      .catch(() => {
        if (active) setSnapshotState({ status: "error", snapshot: null });
      });

    return () => { active = false; };
  }, [userId]);

  const activeDirections = useMemo(
    () => directionsState.directions
      .filter((direction) => direction?.status === "active")
      .sort(compareDirections),
    [directionsState.directions]
  );

  const directionsByVectorId = useMemo(() => Object.fromEntries(VECTOR_DEFINITIONS.map((vector) => [
    vector.id,
    activeDirections.filter((direction) => direction.vectorIds?.includes(vector.id))
  ])), [activeDirections]);

  const snapshot = snapshotState.snapshot;
  const staleSnapshot = snapshot ? isKleosSnapshotStale(snapshot) : false;

  const toggleStrategyManager = () => {
    if (showStrategyManager) {
      void loadDirectionsState(userId)
        .then((nextState) => setDirectionsState(nextState || EMPTY_DIRECTIONS_STATE))
        .catch(() => {});
    }
    setShowStrategyManager((current) => !current);
  };

  return (
    <section className={styles.strategyOverview} aria-labelledby="dashboard-strategy-title">
      <header className={styles.strategyHeader}>
        <div>
          <span className={styles.eyebrow}>Strategy overview</span>
          <div className={styles.titleRow}>
            <h3 id="dashboard-strategy-title">Current position and direction</h3>
            <span className={styles.countPill}>{activeDirections.length} active direction{activeDirections.length === 1 ? "" : "s"}</span>
          </div>
          <p className={styles.sectionDescription}>
            Kleos state and Ariadne direction coverage in one compact view.
          </p>
        </div>
        <button
          type="button"
          className={styles.manageButton}
          aria-expanded={showStrategyManager}
          onClick={toggleStrategyManager}
        >
          {showStrategyManager ? "Close strategy controls" : "Manage strategy"}
        </button>
      </header>

      <div className={styles.vectorGrid} aria-label="Eight-dimensional current state">
        {VECTOR_DEFINITIONS.map((vector) => {
          const current = snapshot ? getKleosVectorState(snapshot, vector.id) : null;
          const vectorDirections = directionsByVectorId[vector.id] || [];
          return (
            <article className={styles.vectorCard} key={vector.id}>
              <div className={styles.vectorCardTop}>
                <strong>{vector.label}</strong>
                <span className={styles.vectorScore}>{formatState(current, snapshotState.status)}</span>
              </div>
              <div className={styles.vectorMeta}>
                <span>{formatConfidence(current)}</span>
                <span>{vectorDirections.length} direction{vectorDirections.length === 1 ? "" : "s"}</span>
              </div>
              {vectorDirections.length ? (
                <p className={styles.vectorDirectionNames}>{vectorDirections.map((direction) => direction.title).join(" · ")}</p>
              ) : (
                <p className={styles.vectorDirectionNames}>No active desired movement</p>
              )}
            </article>
          );
        })}
      </div>

      <div className={styles.snapshotMeta}>
        {snapshot ? (
          <span>
            Kleos assessment {formatDate(snapshot.evaluatedAt)}{staleSnapshot ? " · stale" : ""}
          </span>
        ) : (
          <span>{snapshotState.status === "loading" ? "Loading Kleos assessment…" : "Kleos assessment unavailable"}</span>
        )}
      </div>

      {activeDirections.length ? (
        <div className={styles.directionGrid} aria-label="Active directions">
          {activeDirections.map((direction, index) => (
            <article className={styles.directionCard} key={direction.id}>
              <div className={styles.directionIndex}>Direction {index + 1}</div>
              <h4>{direction.title}</h4>
              <p className={styles.directionStatement}>{direction.statement}</p>
              <div className={styles.vectorPills} aria-label={`Vectors influenced by ${direction.title}`}>
                {direction.vectorIds?.length ? direction.vectorIds.map((vectorId) => (
                  <span key={vectorId}>{getVectorLabel(vectorId)}</span>
                )) : <span>Unclassified</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyStrategy}>No active Directions. Use strategy controls to create or reactivate one.</div>
      )}

      {showStrategyManager ? (
        <div className={styles.strategyManager}>
          <DirectionPanel userId={userId} />
        </div>
      ) : null}
    </section>
  );
}

function compareDirections(left, right) {
  return Number(left?.position || 0) - Number(right?.position || 0)
    || String(left?.title || "").localeCompare(String(right?.title || ""));
}

function formatState(result, status) {
  if (status === "loading") return "…";
  if (!result) return "—";
  if (result.status === "unknown") return "Unknown";
  const score = Number(result.score);
  if (!Number.isFinite(score)) return "—";
  const formatted = Number.isInteger(score) ? String(score) : score.toFixed(1);
  return `${formatted}/100`;
}

function formatConfidence(result) {
  if (!result || result.status === "unknown") return "No confidence";
  const confidence = String(result.confidence || "");
  return confidence ? `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence` : "No confidence";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
