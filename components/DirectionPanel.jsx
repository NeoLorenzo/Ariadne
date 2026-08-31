"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_DIRECTION,
  deleteDirectionRevision,
  loadDirectionState,
  updateDirection
} from "@/lib/directions/directionRepository";
import { loadDirectionSummaryStats } from "@/lib/directions/directionStats";
import {
  GhostButton, ModalBody, ModalFooter, ModalHeader, ModalShell,
  PrimaryButton, SecondaryButton, TextArea, TextInput, useModalDialog
} from "@/components/ui/AriadneUI";

export default function DirectionPanel({ userId, onDirectionChange }) {
  const [state, setState] = useState({ direction: DEFAULT_DIRECTION, revisions: [] });
  const [view, setView] = useState(null);
  const [draft, setDraft] = useState({ title: "", statement: "", changeReason: "" });
  const [saveError, setSaveError] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [deletingRevisionId, setDeletingRevisionId] = useState("");
  const [stats, setStats] = useState(null);
  const dialogRef = useModalDialog(Boolean(view), () => setView(null));

  useEffect(() => {
    let active = true;
    loadDirectionState(userId).then((nextState) => {
      if (active) {
        setState(nextState);
        onDirectionChange?.(nextState.direction);
      }
    });
    return () => { active = false; };
  }, [userId, onDirectionChange]);

  useEffect(() => {
    let active = true;
    const directionId = state.direction?.id;
    if (!directionId) return undefined;

    const refreshStats = () => {
      loadDirectionSummaryStats(directionId, userId).then((res) => {
        if (active && res) setStats(res);
      });
    };

    refreshStats();

    const handleGoalsChanged = () => refreshStats();
    window.addEventListener("ariadne:outcome-goals-changed", handleGoalsChanged);
    return () => {
      active = false;
      window.removeEventListener("ariadne:outcome-goals-changed", handleGoalsChanged);
    };
  }, [state.direction?.id, userId]);

  const openEditor = () => {
    setDraft({ title: state.direction.title, statement: state.direction.statement, changeReason: "" });
    setSaveError("");
    setView("edit");
  };

  const openHistory = () => {
    setHistoryMessage("");
    setView("history");
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.statement.trim()) return;

    try {
      await updateDirection({
        ...state,
        ...draft,
        userId,
        onLocalUpdate: (nextState) => {
          setState(nextState);
          onDirectionChange?.(nextState.direction);
          setView(null);
        }
      });
    } catch {
      setSaveError("Saved on this device, but cloud sync failed. Your change is still available locally.");
    }
  };

  const removeRevision = async (revision) => {
    if (!window.confirm(`Permanently delete the history entry "${revision.title}"? This cannot be undone.`)) {
      return;
    }

    setHistoryMessage("");
    setDeletingRevisionId(revision.id);
    try {
      await deleteDirectionRevision({
        ...state,
        revisionId: revision.id,
        userId,
        onLocalUpdate: setState
      });
    } catch {
      setHistoryMessage(
        "Deleted on this device, but cloud deletion failed. The entry may return after syncing."
      );
    } finally {
      setDeletingRevisionId("");
    }
  };

  const hasStats = stats && (stats.activeObjectivesCount > 0 || stats.activeGoalsCount > 0);

  return (
    <>
      <section className="direction-panel direction-hero-card" aria-labelledby="direction-title">
        <header className="direction-hero-header">
          <span className="direction-eyebrow">Current direction</span>
          <div className="direction-actions">
            <GhostButton onClick={openEditor}>Edit</GhostButton>
            <details className="direction-overflow">
              <summary aria-label="More direction actions">•••</summary>
              <div className="objective-menu">
                <button type="button" onClick={openHistory}>View history</button>
              </div>
            </details>
          </div>
        </header>

        <div className="direction-content">
          <h3 id="direction-title" className="direction-title">{state.direction.title}</h3>
          <p className="direction-statement">{state.direction.statement}</p>
          {saveError ? <p className="direction-sync-error" role="status">{saveError}</p> : null}
        </div>

        {hasStats ? (
          <footer className="direction-hero-footer">
            <div className="direction-stats-pills">
              <span className="direction-stat-pill">
                <strong>{stats.activeObjectivesCount}</strong> active objective{stats.activeObjectivesCount === 1 ? "" : "s"}
              </span>
              <span className="direction-stat-divider">•</span>
              <span className="direction-stat-pill">
                <strong>{stats.activeGoalsCount}</strong> active goal{stats.activeGoalsCount === 1 ? "" : "s"}
              </span>
              {stats.overdueCount > 0 ? (
                <>
                  <span className="direction-stat-divider">•</span>
                  <span className="direction-stat-pill is-overdue">
                    <strong>{stats.overdueCount}</strong> overdue
                  </span>
                </>
              ) : null}
              {stats.completedCount > 0 ? (
                <>
                  <span className="direction-stat-divider">•</span>
                  <span className="direction-stat-pill is-completed">
                    <strong>{stats.completedCount}</strong> completed
                  </span>
                </>
              ) : null}
            </div>
          </footer>
        ) : null}
      </section>

      {view ? (
        <div className="direction-dialog-layer" role="presentation">
          <button className="direction-dialog-backdrop" type="button" aria-label="Close" onClick={() => setView(null)} />
          {view === "edit" ? (
            <ModalShell ref={dialogRef} as="form" className="direction-dialog direction-edit-dialog" role="dialog" aria-modal="true" aria-label="Edit direction" onSubmit={handleSave}>
              <ModalBody className="direction-form direction-edit-form">
                <section className="direction-primary-fields" aria-label="Direction">
                  <TextInput
                    className="direction-title-field"
                    value={draft.title}
                    maxLength={120}
                    required
                    autoFocus
                    aria-label="Direction title"
                    placeholder="Direction title"
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                  <TextArea
                    className="direction-statement-field"
                    size="statement"
                    value={draft.statement}
                    maxLength={800}
                    required
                    aria-label="Direction statement"
                    placeholder="Describe the direction and the intended change"
                    onChange={(event) => setDraft({ ...draft, statement: event.target.value })}
                  />
                  <p className="direction-form-note">Keep this directional; targets and deadlines belong in outcome goals.</p>
                </section>
                <section className="direction-secondary-field">
                  <label><span>Reason for change <small>Optional</small></span>
                  <TextArea
                    className="direction-reason-field"
                    size="short"
                    value={draft.changeReason}
                    maxLength={400}
                    aria-label="Reason for this change, optional"
                    placeholder="Add a reason for this change"
                    onChange={(event) => setDraft({ ...draft, changeReason: event.target.value })}
                  />
                  </label>
                </section>
              </ModalBody>
              <ModalFooter><SecondaryButton onClick={() => setView(null)}>Cancel</SecondaryButton><PrimaryButton type="submit">Save direction</PrimaryButton></ModalFooter>
            </ModalShell>
          ) : (
            <ModalShell ref={dialogRef} className="direction-dialog" role="dialog" aria-modal="true" aria-labelledby="direction-dialog-title">
              <ModalHeader titleId="direction-dialog-title" title="Direction history" onClose={() => setView(null)} />
              <ModalBody className="direction-history">
                {historyMessage ? <p className="objectives-message" role="status">{historyMessage}</p> : null}
                {state.revisions.length ? state.revisions.map((revision) => (
                  <article className="direction-revision" key={revision.id}>
                    <div className="direction-revision-header">
                      <time dateTime={revision.createdAt}>{formatChangedAt(revision.createdAt)}</time>
                      <button
                        type="button"
                        className="history-delete-button"
                        disabled={deletingRevisionId === revision.id}
                        aria-label={`Delete history entry ${revision.title}`}
                        onClick={() => removeRevision(revision)}
                      >
                        {deletingRevisionId === revision.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                    <h4>{revision.title}</h4>
                    <p>{revision.statement}</p>
                    <p className="direction-revision-reason"><strong>Reason:</strong> {revision.changeReason || "No reason recorded"}</p>
                  </article>
                )) : <p className="direction-history-empty">No previous versions yet.</p>}
              </ModalBody>
            </ModalShell>
          )}
        </div>
      ) : null}
    </>
  );
}

function formatChangedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
