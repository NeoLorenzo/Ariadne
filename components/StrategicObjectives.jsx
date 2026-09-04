"use client";

import { useEffect, useMemo, useState } from "react";
import {
  changeObjectiveStatus,
  deleteStrategicObjective,
  loadStrategicObjectives,
  OBJECTIVE_STATUSES,
  reorderStrategicObjectives,
  saveStrategicObjective
} from "@/lib/objectives/strategicObjectiveRepository";
import OutcomeGoals from "@/components/OutcomeGoals";
import {
  GhostButton, ListRow, ModalBody, ModalFooter, ModalShell,
  PrimaryButton, SectionHeader, SecondaryButton, Select, StatusIndicator, TextArea, TextInput,
  useModalDialog
} from "@/components/ui/AriadneUI";

const EMPTY_DRAFT = { title: "", description: "", successCondition: "", status: "active" };

export default function StrategicObjectives({ directionId, userId }) {
  const [objectives, setObjectives] = useState([]);
  const [modal, setModal] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [showPrevious, setShowPrevious] = useState(false);
  const [message, setMessage] = useState("");
  const dialogRef = useModalDialog(Boolean(modal), () => setModal(null));

  useEffect(() => {
    if (!directionId) return undefined;
    let active = true;
    loadStrategicObjectives(directionId, userId).then((items) => active && setObjectives(items));
    return () => { active = false; };
  }, [directionId, userId]);

  const activeObjectives = useMemo(() => objectives
    .filter((item) => item.status === "active")
    .sort((a, b) => a.position - b.position), [objectives]);
  const previousObjectives = useMemo(() => objectives
    .filter((item) => item.status !== "active")
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [objectives]);
  const atLimit = activeObjectives.length >= 3;
  const hasDirection = Boolean(directionId);

  const openCreate = () => {
    if (!hasDirection || atLimit) return;
    setDraft(EMPTY_DRAFT);
    setMessage("");
    setModal({ mode: "create" });
  };
  const openEdit = (objective) => {
    setDraft({ title: objective.title, description: objective.description, successCondition: objective.successCondition, status: objective.status });
    setMessage("");
    setModal({ mode: "edit", objective });
  };

  const persist = async (operation) => {
    setMessage("");
    try {
      await operation((next) => setObjectives(next));
    } catch (error) {
      setMessage(error?.message === "ACTIVE_OBJECTIVE_LIMIT"
        ? "Only three strategic objectives may be active at once."
        : "Saved on this device, but cloud sync failed.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await persist(async (onLocalUpdate) => saveStrategicObjective({
      objectives,
      objective: { ...draft, id: modal.objective?.id },
      directionId,
      userId,
      onLocalUpdate: (next) => { onLocalUpdate(next); setModal(null); }
    }));
  };

  const changeStatus = (objectiveId, status) => persist((onLocalUpdate) => changeObjectiveStatus({
    objectives, objectiveId, status, directionId, userId, onLocalUpdate
  }));
  const move = (objectiveId, offset) => persist((onLocalUpdate) => reorderStrategicObjectives({
    objectives, objectiveId, offset, directionId, userId, onLocalUpdate
  }));
  const remove = (objective) => {
    if (!window.confirm(`Permanently delete “${objective.title}”? Abandoning it is recommended so it remains in history.`)) return;
    void persist((onLocalUpdate) => deleteStrategicObjective({ objectives, objectiveId: objective.id, directionId, userId, onLocalUpdate }));
  };

  return (
    <section className="objectives-panel" aria-labelledby="strategic-objectives-title">
      <SectionHeader className="objectives-header" titleId="strategic-objectives-title" title="Strategic objectives" actions={hasDirection && activeObjectives.length ? <GhostButton disabled={atLimit} onClick={openCreate} title={atLimit ? "Three active objectives already exist" : undefined}>+ Add objective</GhostButton> : null} />
      {message ? <p className="objectives-message" role="status">{message}</p> : null}

      {!hasDirection ? (
        <div className="objectives-empty"><p>Set a direction before adding strategic objectives.</p></div>
      ) : activeObjectives.length ? (
        <div className="objectives-grid">
          {activeObjectives.map((objective, index) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              index={index}
              count={activeObjectives.length}
              onEdit={() => openEdit(objective)}
              onMove={(offset) => move(objective.id, offset)}
              onStatus={(status) => changeStatus(objective.id, status)}
              onDelete={() => remove(objective)}
              objectives={objectives}
              userId={userId}
            />
          ))}
        </div>
      ) : (
        <div className="objectives-empty">
          <p><strong>No strategic objectives have been defined.</strong></p>
          <p>Strategic objectives identify the major changes currently required to advance the active direction.</p>
          <PrimaryButton onClick={openCreate}>Add objective</PrimaryButton>
        </div>
      )}

      {previousObjectives.length ? (
        <div className="objectives-previous">
          <button className="objectives-history-toggle" type="button" onClick={() => setShowPrevious(!showPrevious)}>{showPrevious ? "Hide previous objectives" : `View previous objectives (${previousObjectives.length})`}</button>
          {showPrevious ? <div className="objectives-previous-list">{previousObjectives.map((objective) => (
            <ObjectiveCard key={objective.id} objective={objective} objectives={objectives} userId={userId} onEdit={() => openEdit(objective)} onStatus={(status) => changeStatus(objective.id, status)} onDelete={() => remove(objective)} />
          ))}</div> : null}
        </div>
      ) : null}

      {modal ? (
        <div className="direction-dialog-layer" role="presentation">
          <button className="direction-dialog-backdrop" type="button" aria-label="Close" onClick={() => setModal(null)} />
          <ModalShell ref={dialogRef} as="form" className="direction-dialog entity-edit-dialog" role="dialog" aria-modal="true" aria-label={modal.mode === "edit" ? "Edit strategic objective" : "Add strategic objective"} onSubmit={handleSubmit}>
            <ModalBody className="direction-form entity-edit-form">
              <section className="entity-primary-fields" aria-label="Strategic objective">
                <TextInput
                  className="entity-title-field"
                  required
                  autoFocus
                  maxLength={140}
                  value={draft.title}
                  aria-label="Objective title"
                  placeholder="Objective title"
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
                <TextArea
                  className="entity-description-field"
                  size="short"
                  maxLength={600}
                  value={draft.description}
                  aria-label="Objective description, optional"
                  placeholder="Add context or describe the intended change"
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
                <TextArea
                  className="entity-prompt-field"
                  size="success"
                  required
                  maxLength={800}
                  value={draft.successCondition}
                  aria-label="What does success look like?"
                  placeholder="What does success look like?"
                  onChange={(event) => setDraft({ ...draft, successCondition: event.target.value })}
                />
                {message ? <p className="objectives-message" role="status">{message}</p> : null}
                <p className="direction-form-note">Define the major change; measurable targets belong in outcome goals.</p>
              </section>
              <section className="entity-secondary-section">
                <label className="entity-compact-control"><span>Status</span><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{OBJECTIVE_STATUSES.map((status) => <option key={status} value={status} disabled={status === "active" && atLimit && modal.objective?.status !== "active"}>{capitalize(status)}</option>)}</Select></label>
              </section>
            </ModalBody>
            <ModalFooter><SecondaryButton onClick={() => setModal(null)}>Cancel</SecondaryButton><PrimaryButton type="submit">{modal.mode === "edit" ? "Save changes" : "Add objective"}</PrimaryButton></ModalFooter>
          </ModalShell>
        </div>
      ) : null}
    </section>
  );
}

function ObjectiveCard({ objective, objectives, userId, index, count, onEdit, onMove, onStatus, onDelete }) {
  return (
    <article className={`objective-card objective-surface is-${objective.status}`}>
      <header className="objective-card-header">
        <div className="objective-card-title-group">
          <h4 className="objective-card-title">{objective.title}</h4>
          {objective.status !== "active" ? <StatusIndicator status={objective.status} /> : null}
        </div>
        <details className="objective-row-menu">
          <summary aria-label="More objective actions">•••</summary>
          <div className="objective-menu">
            <button type="button" onClick={onEdit}>Edit</button>
            {onMove ? (
              <>
                <button type="button" disabled={index === 0} onClick={() => onMove(-1)}>Move up</button>
                <button type="button" disabled={index === count - 1} onClick={() => onMove(1)}>Move down</button>
              </>
            ) : null}
            {objective.status !== "active" ? <button type="button" onClick={() => onStatus("active")}>Make active</button> : null}
            {objective.status !== "paused" ? <button type="button" onClick={() => onStatus("paused")}>Pause</button> : null}
            {objective.status !== "completed" ? <button type="button" onClick={() => onStatus("completed")}>Complete</button> : null}
            {objective.status !== "abandoned" ? <button type="button" onClick={() => onStatus("abandoned")}>Abandon</button> : null}
            <button className="is-danger" type="button" onClick={onDelete}>Delete permanently</button>
          </div>
        </details>
      </header>
      {objective.successCondition || objective.description ? (
        <p className="objective-success">{objective.successCondition || objective.description}</p>
      ) : null}
      <div className="objective-goals-wrapper">
        <OutcomeGoals objective={objective} objectives={objectives} userId={userId} />
      </div>
    </article>
  );
}

function capitalize(value) { return `${value.charAt(0).toUpperCase()}${value.slice(1)}`; }
