"use client";

import { useEffect, useMemo, useState } from "react";
import StrategicObjectives from "@/components/StrategicObjectives";
import {
  createDirection,
  deleteDirectionRevision,
  loadDirectionsState,
  reorderDirections,
  setDirectionStatus,
  updateDirection
} from "@/lib/directions/directionRepository";
import { VECTOR_DEFINITIONS, getVectorLabel } from "@/lib/vectors/vectorVocabulary";
import {
  GhostButton, ModalBody, ModalFooter, ModalHeader, ModalShell,
  PrimaryButton, SecondaryButton, TextArea, TextInput, useModalDialog
} from "@/components/ui/AriadneUI";

const EMPTY_STATE = { directions: [], revisionsByDirectionId: {} };
const EMPTY_DRAFT = { title: "", statement: "", vectorIds: [], changeReason: "" };

export default function DirectionPanel({ userId }) {
  const [state, setState] = useState(EMPTY_STATE);
  const [view, setView] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [message, setMessage] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [deletingRevisionId, setDeletingRevisionId] = useState("");
  const dialogRef = useModalDialog(Boolean(view), () => setView(null));

  useEffect(() => {
    let active = true;
    loadDirectionsState(userId).then((nextState) => active && setState(nextState));
    return () => { active = false; };
  }, [userId]);

  const activeDirections = useMemo(() => state.directions
    .filter((direction) => direction.status === "active")
    .sort(compareDirections), [state.directions]);
  const pausedDirections = useMemo(() => state.directions
    .filter((direction) => direction.status === "paused")
    .sort(compareDirections), [state.directions]);
  const archivedDirections = useMemo(() => state.directions
    .filter((direction) => direction.status === "archived")
    .sort(compareDirections), [state.directions]);

  const vectorDirectionMap = useMemo(() => Object.fromEntries(VECTOR_DEFINITIONS.map((vector) => [
    vector.id,
    activeDirections.filter((direction) => direction.vectorIds.includes(vector.id))
  ])), [activeDirections]);

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setMessage("");
    setView({ type: "edit", directionId: null });
  };

  const openEdit = (direction) => {
    setDraft({
      title: direction.title,
      statement: direction.statement,
      vectorIds: [...direction.vectorIds],
      changeReason: ""
    });
    setMessage("");
    setView({ type: "edit", directionId: direction.id });
  };

  const openHistory = (direction) => {
    setHistoryMessage("");
    setView({ type: "history", directionId: direction.id });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const directionId = view?.directionId || null;
    if (!draft.title.trim() || !draft.statement.trim()) return;
    if (!draft.vectorIds.length) {
      setMessage("Select at least one vector influenced by this direction.");
      return;
    }

    try {
      const operation = directionId
        ? updateDirection({
            state,
            directionId,
            ...draft,
            userId,
            onLocalUpdate: (nextState) => {
              setState(nextState);
              setView(null);
            }
          })
        : createDirection({
            state,
            ...draft,
            userId,
            onLocalUpdate: (nextState) => {
              setState(nextState);
              setView(null);
            }
          });
      await operation;
    } catch (error) {
      if (error?.message === "REVISION_REASON_REQUIRED") {
        setMessage("Add a reason for this direction change so its history remains interpretable.");
      } else if (error?.message === "DIRECTION_VECTOR_REQUIRED") {
        setMessage("Select at least one vector influenced by this direction.");
      } else {
        setMessage("Saved on this device, but cloud sync failed. Your change remains available locally.");
      }
    }
  };

  const changeStatus = async (directionId, status) => {
    setMessage("");
    try {
      await setDirectionStatus({
        state,
        directionId,
        status,
        userId,
        onLocalUpdate: setState
      });
    } catch {
      setMessage("The direction changed locally, but cloud sync is still pending.");
    }
  };

  const moveDirection = async (directionId, offset) => {
    setMessage("");
    try {
      await reorderDirections({
        state,
        directionId,
        offset,
        userId,
        onLocalUpdate: setState
      });
    } catch {
      setMessage("The direction order changed locally, but cloud sync is still pending.");
    }
  };

  const removeRevision = async (directionId, revision) => {
    if (!window.confirm(`Permanently delete the history entry "${revision.title}"? This cannot be undone.`)) return;
    setHistoryMessage("");
    setDeletingRevisionId(revision.id);
    try {
      await deleteDirectionRevision({
        state,
        directionId,
        revisionId: revision.id,
        userId,
        onLocalUpdate: setState
      });
    } catch {
      setHistoryMessage("Deleted on this device, but cloud deletion is still pending.");
    } finally {
      setDeletingRevisionId("");
    }
  };

  const selectedDirection = view?.directionId
    ? state.directions.find((direction) => direction.id === view.directionId) || null
    : null;
  const selectedRevisions = selectedDirection
    ? state.revisionsByDirectionId[selectedDirection.id] || []
    : [];

  return (
    <>
      <section className="objectives-panel" aria-labelledby="directions-workspace-title">
        <header className="objectives-header">
          <div>
            <span className="direction-eyebrow">8D navigation</span>
            <h3 id="directions-workspace-title" className="direction-title">Directions</h3>
          </div>
          <PrimaryButton onClick={openCreate}>+ New direction</PrimaryButton>
        </header>
        {message ? <p className="direction-sync-error" role="status">{message}</p> : null}

        <div className="objectives-grid" aria-label="Vector coverage">
          {VECTOR_DEFINITIONS.map((vector) => {
            const directions = vectorDirectionMap[vector.id] || [];
            return (
              <article className="objective-card objective-surface" key={vector.id}>
                <header className="objective-card-header">
                  <h4 className="objective-card-title">{vector.label}</h4>
                  <span>{directions.length}</span>
                </header>
                <p className="objective-success">
                  {directions.length
                    ? directions.map((direction) => direction.title).join(" · ")
                    : "No active direction currently influences this vector."}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {activeDirections.length ? activeDirections.map((direction, index) => (
        <section key={direction.id} className="direction-panel direction-hero-card" aria-labelledby={`direction-title-${direction.id}`}>
          <header className="direction-hero-header">
            <div>
              <span className="direction-eyebrow">Active direction {index + 1}</span>
              {!direction.vectorIds.length ? <span className="direction-sync-error">Needs vector classification</span> : null}
            </div>
            <div className="direction-actions">
              <GhostButton onClick={() => openEdit(direction)}>{direction.vectorIds.length ? "Edit" : "Classify"}</GhostButton>
              <details className="direction-overflow">
                <summary aria-label={`More actions for ${direction.title}`}>•••</summary>
                <div className="objective-menu">
                  <button type="button" disabled={index === 0} onClick={() => moveDirection(direction.id, -1)}>Move up</button>
                  <button type="button" disabled={index === activeDirections.length - 1} onClick={() => moveDirection(direction.id, 1)}>Move down</button>
                  <button type="button" onClick={() => openHistory(direction)}>View history</button>
                  <button type="button" onClick={() => changeStatus(direction.id, "paused")}>Pause</button>
                  <button type="button" onClick={() => changeStatus(direction.id, "archived")}>Archive</button>
                </div>
              </details>
            </div>
          </header>

          <div className="direction-content">
            <h3 id={`direction-title-${direction.id}`} className="direction-title">{direction.title}</h3>
            <p className="direction-statement">{direction.statement}</p>
            <div className="direction-stats-pills" aria-label="Influenced vectors">
              {direction.vectorIds.length ? direction.vectorIds.map((vectorId) => (
                <span className="direction-stat-pill" key={vectorId}>{getVectorLabel(vectorId)}</span>
              )) : (
                <span className="direction-stat-pill is-overdue">Unclassified legacy direction</span>
              )}
            </div>
          </div>

          <StrategicObjectives directionId={direction.id} userId={userId} />
        </section>
      )) : (
        <section className="direction-panel direction-hero-card">
          <div className="direction-content">
            <h3 className="direction-title">No active directions</h3>
            <p className="direction-statement">Create a direction to define desired movement through the eight-dimensional navigation space.</p>
            <PrimaryButton onClick={openCreate}>Create direction</PrimaryButton>
          </div>
        </section>
      )}

      {pausedDirections.length ? (
        <details className="objectives-previous">
          <summary className="objectives-history-toggle">Paused directions ({pausedDirections.length})</summary>
          <div className="objectives-previous-list">
            {pausedDirections.map((direction) => (
              <ArchivedDirectionCard
                key={direction.id}
                direction={direction}
                onEdit={() => openEdit(direction)}
                onHistory={() => openHistory(direction)}
                onReactivate={() => changeStatus(direction.id, "active")}
                onArchive={() => changeStatus(direction.id, "archived")}
              />
            ))}
          </div>
        </details>
      ) : null}

      {archivedDirections.length ? (
        <details className="objectives-previous">
          <summary className="objectives-history-toggle">Archived directions ({archivedDirections.length})</summary>
          <div className="objectives-previous-list">
            {archivedDirections.map((direction) => (
              <ArchivedDirectionCard
                key={direction.id}
                direction={direction}
                onEdit={() => openEdit(direction)}
                onHistory={() => openHistory(direction)}
                onReactivate={() => changeStatus(direction.id, "active")}
              />
            ))}
          </div>
        </details>
      ) : null}

      {view ? (
        <div className="direction-dialog-layer" role="presentation">
          <button className="direction-dialog-backdrop" type="button" aria-label="Close" onClick={() => setView(null)} />
          {view.type === "edit" ? (
            <ModalShell ref={dialogRef} as="form" className="direction-dialog direction-edit-dialog" role="dialog" aria-modal="true" aria-label={selectedDirection ? "Edit direction" : "Create direction"} onSubmit={handleSave}>
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
                    placeholder="Describe the direction and intended movement"
                    onChange={(event) => setDraft({ ...draft, statement: event.target.value })}
                  />
                  <p className="direction-form-note">Directions may influence several vectors. Targets and deadlines still belong in outcome goals.</p>
                </section>

                <section className="entity-secondary-section" aria-label="Influenced vectors">
                  <strong>Influenced vectors</strong>
                  <div className="objectives-grid">
                    {VECTOR_DEFINITIONS.map((vector) => {
                      const checked = draft.vectorIds.includes(vector.id);
                      return (
                        <label className="objective-card objective-surface" key={vector.id}>
                          <span><input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setDraft((current) => ({
                              ...current,
                              vectorIds: checked
                                ? current.vectorIds.filter((id) => id !== vector.id)
                                : [...current.vectorIds, vector.id]
                            }))}
                          /> {vector.label}</span>
                          <small>{vector.description}</small>
                        </label>
                      );
                    })}
                  </div>
                </section>

                {selectedDirection?.vectorIds?.length ? (
                  <section className="direction-secondary-field">
                    <label><span>Reason for change</span>
                      <TextArea
                        className="direction-reason-field"
                        size="short"
                        value={draft.changeReason}
                        maxLength={400}
                        required
                        aria-label="Reason for this direction change"
                        placeholder="Why is this direction or its vector influence changing?"
                        onChange={(event) => setDraft({ ...draft, changeReason: event.target.value })}
                      />
                    </label>
                  </section>
                ) : null}

                {message ? <p className="objectives-message" role="status">{message}</p> : null}
              </ModalBody>
              <ModalFooter>
                <SecondaryButton onClick={() => setView(null)}>Cancel</SecondaryButton>
                <PrimaryButton type="submit">{selectedDirection ? "Save direction" : "Create direction"}</PrimaryButton>
              </ModalFooter>
            </ModalShell>
          ) : (
            <ModalShell ref={dialogRef} className="direction-dialog" role="dialog" aria-modal="true" aria-labelledby="direction-dialog-title">
              <ModalHeader titleId="direction-dialog-title" title="Direction history" onClose={() => setView(null)} />
              <ModalBody className="direction-history">
                {historyMessage ? <p className="objectives-message" role="status">{historyMessage}</p> : null}
                {selectedRevisions.length ? selectedRevisions.map((revision) => (
                  <article className="direction-revision" key={revision.id}>
                    <div className="direction-revision-header">
                      <time dateTime={revision.createdAt}>{formatChangedAt(revision.createdAt)}</time>
                      <button
                        type="button"
                        className="history-delete-button"
                        disabled={deletingRevisionId === revision.id}
                        aria-label={`Delete history entry ${revision.title}`}
                        onClick={() => removeRevision(selectedDirection.id, revision)}
                      >
                        {deletingRevisionId === revision.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                    <h4>{revision.title}</h4>
                    <p>{revision.statement}</p>
                    {revision.vectorIds ? <p><strong>Vectors:</strong> {revision.vectorIds.length ? revision.vectorIds.map(getVectorLabel).join(" · ") : "Unclassified"}</p> : null}
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

function ArchivedDirectionCard({ direction, onEdit, onHistory, onReactivate, onArchive }) {
  return (
    <article className="objective-card objective-surface">
      <header className="objective-card-header">
        <div>
          <h4 className="objective-card-title">{direction.title}</h4>
          <p className="objective-success">{direction.vectorIds.length ? direction.vectorIds.map(getVectorLabel).join(" · ") : "Needs vector classification"}</p>
        </div>
        <details className="objective-row-menu">
          <summary aria-label={`More actions for ${direction.title}`}>•••</summary>
          <div className="objective-menu">
            <button type="button" onClick={onEdit}>Edit</button>
            <button type="button" onClick={onHistory}>View history</button>
            <button type="button" onClick={onReactivate}>Reactivate</button>
            {onArchive ? <button type="button" onClick={onArchive}>Archive</button> : null}
          </div>
        </details>
      </header>
      <p className="objective-success">{direction.statement}</p>
    </article>
  );
}

function compareDirections(left, right) {
  const positionDelta = Number(left?.position || 0) - Number(right?.position || 0);
  if (positionDelta) return positionDelta;
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function formatChangedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
