"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getKleosVectorState,
  isKleosSnapshotStale,
  loadLatestKleosVectorSnapshot
} from "@/lib/kleos/vectorStateRepository";
import { VECTOR_DEFINITIONS, getVectorLabel } from "@/lib/vectors/vectorVocabulary";

const EMPTY_LOAD_STATE = { status: "loading", snapshot: null, message: "" };

export default function KleosVectorStateLayer({ userId, directions = [] }) {
  const [loadState, setLoadState] = useState(EMPTY_LOAD_STATE);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setLoadState({ status: "idle", snapshot: null, message: "" });
      return () => { active = false; };
    }

    setLoadState(EMPTY_LOAD_STATE);
    loadLatestKleosVectorSnapshot(userId)
      .then((snapshot) => {
        if (active) setLoadState({ status: "ready", snapshot, message: "" });
      })
      .catch((error) => {
        if (active) {
          setLoadState({
            status: "error",
            snapshot: null,
            message: error?.message || "Kleos current state is temporarily unavailable."
          });
        }
      });

    return () => { active = false; };
  }, [userId]);

  const activeDirections = useMemo(
    () => directions.filter((direction) => direction?.status === "active"),
    [directions]
  );

  const directionsByVectorId = useMemo(() => Object.fromEntries(VECTOR_DEFINITIONS.map((vector) => [
    vector.id,
    activeDirections.filter((direction) => direction.vectorIds?.includes(vector.id))
  ])), [activeDirections]);

  if (loadState.status === "loading") {
    return (
      <section className="objectives-panel" aria-label="Kleos current vector state">
        <p className="objective-success">Loading current state from Kleos…</p>
      </section>
    );
  }

  if (loadState.status === "error" || !loadState.snapshot) {
    return (
      <section className="objectives-panel" aria-labelledby="kleos-current-state-title">
        <header className="objectives-header">
          <div>
            <span className="direction-eyebrow">Current position · Kleos</span>
            <h3 id="kleos-current-state-title" className="direction-title">Vector state unavailable</h3>
          </div>
        </header>
        <p className="objective-success">
          {loadState.status === "error"
            ? "Kleos could not be read. Ariadne directions and planning remain fully available."
            : "No Kleos vector snapshot exists yet. Ariadne directions and planning remain fully available."}
        </p>
      </section>
    );
  }

  const snapshot = loadState.snapshot;
  const stale = isKleosSnapshotStale(snapshot);

  return (
    <section className="objectives-panel" aria-labelledby="kleos-current-state-title">
      <header className="objectives-header">
        <div>
          <span className="direction-eyebrow">Current position · Kleos</span>
          <h3 id="kleos-current-state-title" className="direction-title">Current vector state</h3>
          <p className="objective-success">
            Derived assessment · {formatDate(snapshot.evaluatedAt)} · {snapshot.evaluator || "Kleos evaluator"}
            {stale ? " · Stale" : ""}
          </p>
        </div>
      </header>

      <div className="objectives-grid" aria-label="Current state and desired movement by vector">
        {VECTOR_DEFINITIONS.map((vector) => {
          const current = getKleosVectorState(snapshot, vector.id);
          const vectorDirections = directionsByVectorId[vector.id] || [];
          return (
            <article className="objective-card objective-surface" key={vector.id}>
              <header className="objective-card-header">
                <div>
                  <h4 className="objective-card-title">{vector.label}</h4>
                  <p className="objective-success">Current state · {formatState(current)}</p>
                </div>
                <span>{formatConfidence(current)}</span>
              </header>
              <p className="objective-success">
                <strong>Desired movement:</strong>{" "}
                {vectorDirections.length
                  ? vectorDirections.map((direction) => direction.title).join(" · ")
                  : "No active direction currently influences this vector."}
              </p>
              {current?.commentary ? (
                <details>
                  <summary>Assessment context</summary>
                  <p className="objective-success">{current.commentary}</p>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>

      {activeDirections.length ? (
        <div className="objectives-previous-list" aria-label="Kleos current state by active direction">
          {activeDirections.map((direction) => (
            <article className="objective-card objective-surface" key={direction.id}>
              <header className="objective-card-header">
                <div>
                  <span className="direction-eyebrow">Desired direction · Ariadne</span>
                  <h4 className="objective-card-title">{direction.title}</h4>
                </div>
              </header>
              <p className="objective-success">
                <strong>Current Kleos state:</strong>{" "}
                {direction.vectorIds?.length
                  ? direction.vectorIds.map((vectorId) => {
                      const current = getKleosVectorState(snapshot, vectorId);
                      return `${getVectorLabel(vectorId)} ${formatState(current)}`;
                    }).join(" · ")
                  : "No vector classification available."}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatState(result) {
  if (!result) return "No data";
  if (result.status === "unknown") return "Unknown";
  return `${formatNumber(result.score)} / 100`;
}

function formatConfidence(result) {
  if (!result) return "No data";
  if (result.status === "unknown") return "Unknown";
  return `${capitalize(result.confidence)} confidence`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
}
