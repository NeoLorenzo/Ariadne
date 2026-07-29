"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  adjustOutcomeGoalCurrentValue, calculateGoalProgress, deleteOutcomeGoal, deleteOutcomeGoalRevision,
  hasMeaningfulGoalChanges, loadOutcomeGoalRevisions, loadOutcomeGoals, saveOutcomeGoal
} from "@/lib/goals/outcomeGoalRepository";
import { compareGoalsByDueDate, getGoalTiming } from "@/lib/goals/goalTiming";
import {
  DateInput, GhostButton, ListRow, ModalBody, ModalFooter, ModalHeader, ModalShell,
  PrimaryButton, ProgressBar, SecondaryButton, Select, StatusIndicator, TextArea, TextInput,
  useModalDialog
} from "@/components/ui/FabbroUI";

const EMPTY_GOAL = { strategicObjectiveId: "", title: "", description: "", metricType: "count",
  currentValue: 0, targetValue: 1, bareMinimum: 0, displayOnTodoList: false,
  startDate: "", targetDate: "", status: "active" };

export default function OutcomeGoals({ objective, objectives, userId }) {
  const [goals, setGoals] = useState([]);
  const goalsRef = useRef([]);
  const [view, setView] = useState(null);
  const [draft, setDraft] = useState(EMPTY_GOAL);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisions, setRevisions] = useState([]);
  const [message, setMessage] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [deletingRevisionId, setDeletingRevisionId] = useState("");
  const dialogRef = useModalDialog(Boolean(view), () => setView(null));

  const setGoalState = (next) => {
    goalsRef.current = next;
    setGoals(next);
  };
  useEffect(() => {
    let active = true;
    let midnightTimer;
    const refresh = () => loadOutcomeGoals(objective.id, userId)
      .then((items) => active && setGoalState(items));
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = window.setTimeout(async () => {
        await refresh();
        if (active) scheduleMidnightRefresh();
      }, nextDay.getTime() - now.getTime() + 1000);
    };
    void refresh();
    scheduleMidnightRefresh();
    const handleChange = (event) => { if (event.detail?.objectiveId === objective.id) void refresh(); };
    window.addEventListener("fabbro:outcome-goals-changed", handleChange);
    return () => {
      active = false;
      window.clearTimeout(midnightTimer);
      window.removeEventListener("fabbro:outcome-goals-changed", handleChange);
    };
  }, [objective.id, userId]);

  const goalsByDueDate = useMemo(() => [...goals].sort(compareGoalsByDueDate), [goals]);
  const activeGoals = goalsByDueDate.filter((goal) => goal.status === "active");
  const inactiveGoals = goalsByDueDate.filter((goal) => goal.status !== "active");
  const meaningfulChange = view?.type === "edit" && hasMeaningfulGoalChanges(view.goal, draft);

  const openCreate = () => { setDraft({ ...EMPTY_GOAL, strategicObjectiveId: objective.id }); setRevisionReason(""); setMessage(""); setView({ type: "create" }); };
  const openEdit = (goal) => { setDraft({ ...goal }); setRevisionReason(""); setMessage(""); setView({ type: "edit", goal }); };
  const persist = async (operation) => {
    setMessage("");
    try { await operation(setGoalState); }
    catch (error) { setMessage(error?.message === "REVISION_REASON_REQUIRED" ? "Explain why the goal definition is changing." : "Saved on this device, but cloud sync failed."); }
  };
  const handleSave = async (event) => {
    event.preventDefault();
    await persist((onLocalUpdate) => saveOutcomeGoal({ goals: goalsRef.current, goal: { ...draft, id: view.goal?.id }, objectiveId: objective.id,
      userId, revisionReason, onLocalUpdate: (next) => { onLocalUpdate(next); setView({ type: "manage" }); } }));
  };
  const showHistory = async (goal) => {
    setHistoryMessage("");
    setRevisions(await loadOutcomeGoalRevisions(goal.id, userId));
    setView({ type: "history", goal });
  };
  const removeRevision = async (revision) => {
    if (!window.confirm(`Permanently delete this revision of "${revision.previousTitle}"? This cannot be undone.`)) return;
    setHistoryMessage("");
    setDeletingRevisionId(revision.id);
    try {
      await deleteOutcomeGoalRevision({
        goalId: view.goal.id,
        revisionId: revision.id,
        userId,
        onLocalUpdate: setRevisions
      });
    } catch {
      setHistoryMessage(
        "Deleted on this device, but cloud deletion failed. The revision may return after syncing."
      );
    } finally {
      setDeletingRevisionId("");
    }
  };
  const remove = (goal) => {
    if (!window.confirm(`Permanently delete "${goal.title}"? This cannot be undone.`)) return;
    void persist((onLocalUpdate) => deleteOutcomeGoal({ goals: goalsRef.current, goalId: goal.id, objectiveId: objective.id, userId, onLocalUpdate }));
  };
  const adjustCurrent = (goal, delta) => {
    void persist((onLocalUpdate) => adjustOutcomeGoalCurrentValue({
      goals: goalsRef.current,
      goalId: goal.id,
      delta,
      objectiveId: objective.id,
      userId,
      onLocalUpdate
    }));
  };

  return <div className="outcome-goals-summary">
    {goalsByDueDate.length ? <div className="objective-goal-summary-list">
      {goalsByDueDate.map((goal) => {
        const progress = calculateGoalProgress(goal);
        const timing = getGoalTiming(goal);
        return <article key={goal.id} className="objective-goal-summary">
          <button className="objective-goal-summary-heading" type="button" onClick={() => setView({ type: "manage" })}>
            <strong>{goal.title}</strong>
            {goal.status !== "active" ? <StatusIndicator status={goal.status} /> : null}
          </button>
          <div className="objective-goal-summary-progress">
            <GoalProgressControl goal={goal} progress={progress} onAdjust={adjustCurrent} />
            <span
              className={`objective-goal-summary-timing is-${timing.tone}`}
              title={`Goal timing: ${timing.label}`}
            >
              {timing.label}
            </span>
          </div>
          <button className="objective-goal-summary-chevron" type="button" aria-label={`Manage ${goal.title}`} onClick={() => setView({ type: "manage" })}>›</button>
        </article>;
      })}
    </div> : null}
    <GhostButton className="objective-add-goal" onClick={openCreate}>+ Add goal</GhostButton>

    {view ? <div className="direction-dialog-layer" role="presentation"><button className="direction-dialog-backdrop" type="button" aria-label="Close" onClick={() => setView(null)} />
      {view.type === "create" || view.type === "edit" ? <ModalShell ref={dialogRef} as="form" className="direction-dialog outcome-goals-dialog entity-edit-dialog" role="dialog" aria-modal="true" aria-label={view.type === "create" ? "Add outcome goal" : "Edit outcome goal"} onSubmit={handleSave}>
        <GoalForm draft={draft} setDraft={setDraft} objectives={objectives} meaningfulChange={meaningfulChange} revisionReason={revisionReason} setRevisionReason={setRevisionReason} message={message} />
        <ModalFooter><SecondaryButton onClick={() => setView(null)}>Cancel</SecondaryButton><PrimaryButton type="submit">{view.type === "create" ? "Add goal" : "Save changes"}</PrimaryButton></ModalFooter>
      </ModalShell> : view.type === "history" ? <ModalShell ref={dialogRef} className="direction-dialog outcome-goals-dialog" role="dialog" aria-modal="true" aria-labelledby="outcome-goals-dialog-title">
        <ModalHeader titleId="outcome-goals-dialog-title" title="Goal revision history" onClose={() => setView(null)} />
        <GoalHistory goal={view.goal} revisions={revisions} message={historyMessage} deletingRevisionId={deletingRevisionId} onDelete={removeRevision} />
      </ModalShell> : <ModalShell ref={dialogRef} className="direction-dialog outcome-goals-dialog" role="dialog" aria-modal="true" aria-labelledby="outcome-goals-dialog-title">
        <ModalHeader titleId="outcome-goals-dialog-title" title={objective.title} onClose={() => setView(null)} />
        <GoalManager activeGoals={activeGoals} inactiveGoals={inactiveGoals} onAdd={openCreate} onEdit={openEdit} onHistory={showHistory} onDelete={remove} onAdjust={adjustCurrent} />
        {activeGoals.length ? <ModalFooter><GhostButton onClick={openCreate}>+ Add goal</GhostButton></ModalFooter> : null}
      </ModalShell>}
    </div> : null}
  </div>;
}

function GoalManager({ activeGoals, inactiveGoals, onAdd, onEdit, onHistory, onDelete, onAdjust }) {
  const [showPrevious, setShowPrevious] = useState(false);
  return <ModalBody className="goal-manager">{activeGoals.length ? <div className="goal-list">{activeGoals.map((goal) => <GoalRow key={goal.id} goal={goal} onEdit={onEdit} onHistory={onHistory} onDelete={onDelete} onAdjust={onAdjust} />)}</div> : <div className="goal-empty"><strong>No outcome goals have been defined.</strong><p>Outcome goals turn this strategic objective into measurable results.</p><PrimaryButton onClick={onAdd}>Add goal</PrimaryButton></div>}{inactiveGoals.length ? <div className="goal-history-section"><button className="objectives-history-toggle" type="button" onClick={() => setShowPrevious(!showPrevious)}>{showPrevious ? "Hide previous goals" : `View previous goals (${inactiveGoals.length})`}</button>{showPrevious ? <div className="goal-list is-previous">{inactiveGoals.map((goal) => <GoalRow key={goal.id} goal={goal} onEdit={onEdit} onHistory={onHistory} onDelete={onDelete} onAdjust={onAdjust} />)}</div> : null}</div> : null}</ModalBody>;
}

function GoalRow({ goal, onEdit, onHistory, onDelete, onAdjust }) {
  const progress = calculateGoalProgress(goal);
  const metadata = formatGoalMetadata(goal);
  return <ListRow className={`goal-card is-${goal.status}`}><div className="goal-row-content"><div className="goal-row-title"><h4>{goal.title}</h4>{goal.status !== "active" ? <StatusIndicator status={goal.status} /> : null}</div>{metadata ? <div className="goal-row-meta">{metadata}</div> : null}<div className="goal-row-progress"><GoalProgressControl goal={goal} progress={progress} onAdjust={onAdjust} /></div></div><details className="objective-row-menu"><summary aria-label="More goal actions">•••</summary><div className="objective-menu"><button type="button" onClick={() => onEdit(goal)}>Edit</button><button type="button" onClick={() => onHistory(goal)}>View revisions</button><button className="is-danger" type="button" onClick={() => onDelete(goal)}>Delete permanently</button></div></details></ListRow>;
}

function GoalForm({ draft, setDraft, objectives, meaningfulChange, revisionReason, setRevisionReason, message }) {
  return <ModalBody className="direction-form entity-edit-form goal-form">
    <section className="entity-primary-fields" aria-label="Outcome goal">
      <TextInput
        className="entity-title-field"
        required
        autoFocus
        maxLength={160}
        value={draft.title}
        aria-label="Goal title"
        placeholder="Goal title"
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
      />
      <TextArea
        className="entity-description-field"
        size="short"
        maxLength={600}
        value={draft.description}
        aria-label="Goal description, optional"
        placeholder="Add relevant context"
        onChange={(event) => setDraft({ ...draft, description: event.target.value })}
      />
      {message ? <p className="objectives-message" role="status">{message}</p> : null}
    </section>
    <section className="goal-measure-section" aria-labelledby="goal-measure-heading">
      <h3 id="goal-measure-heading">How will progress be measured?</h3>
      <div className="goal-metric-grid">
        <label><span>Current</span><TextInput type="number" min="0" step="1" required value={draft.currentValue} onChange={(event) => setDraft({ ...draft, currentValue: event.target.value })} /></label>
        <label><span>Target</span><TextInput type="number" min="1" step="1" required value={draft.targetValue} onChange={(event) => setDraft({ ...draft, targetValue: event.target.value })} /></label>
        <label><span>Bare Minimum</span><TextInput type="number" min="0" max={Math.max(0, Number(draft.targetValue) || 0)} step="1" required value={draft.bareMinimum} onChange={(event) => setDraft({ ...draft, bareMinimum: event.target.value })} /></label>
      </div>
    </section>
    {meaningfulChange ? <section className="goal-revision-section">
      <TextArea
        className="entity-prompt-field"
        size="short"
        required
        value={revisionReason}
        aria-label="Why is this goal changing?"
        placeholder="Why is this goal changing?"
        onChange={(event) => setRevisionReason(event.target.value)}
      />
    </section> : null}
    <p className="direction-form-note">Use a measurable result; tasks and deliverables belong below this level.</p>
    <label className="goal-todo-toggle">
      <input
        type="checkbox"
        checked={Boolean(draft.displayOnTodoList)}
        onChange={(event) => setDraft({ ...draft, displayOnTodoList: event.target.checked })}
      />
      <span aria-hidden="true" />
      <strong>Display On ToDo-List</strong>
    </label>
    <details className="entity-more-options">
      <summary>More options</summary>
      <div className="goal-secondary-fields">
        <label><span>Strategic objective</span><Select value={draft.strategicObjectiveId} onChange={(event) => setDraft({ ...draft, strategicObjectiveId: event.target.value })}>{objectives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></label>
        <div className="goal-date-grid"><label><span>Start date</span><DateInput value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label><label><span>Target date</span><DateInput value={draft.targetDate} min={draft.startDate || undefined} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} /></label></div>
      </div>
    </details>
  </ModalBody>;
}

function GoalProgressControl({ goal, progress, onAdjust }) {
  return <div className="goal-progress-control">
    <button
      className="goal-count-button"
      type="button"
      disabled={Number(goal.currentValue) <= 0}
      aria-label={`Decrease ${goal.title} current count`}
      onClick={() => onAdjust(goal, -1)}
    >
      −
    </button>
    <ProgressBar value={progress} />
    <button
      className="goal-count-button"
      type="button"
      aria-label={`Increase ${goal.title} current count`}
      onClick={() => onAdjust(goal, 1)}
    >
      +
    </button>
    <strong>{Number(goal.currentValue)} / {Number(goal.targetValue)}</strong>
  </div>;
}

function GoalHistory({ goal, revisions, message, deletingRevisionId, onDelete }) {
  return <ModalBody className="direction-history">
    {message ? <p className="objectives-message" role="status">{message}</p> : null}
    {revisions.length ? revisions.map((revision) => <article className="direction-revision" key={revision.id}>
      <div className="direction-revision-header">
        <time dateTime={revision.createdAt}>{formatDateTime(revision.createdAt)}</time>
        <button
          type="button"
          className="history-delete-button"
          disabled={deletingRevisionId === revision.id}
          aria-label={`Delete revision ${revision.previousTitle}`}
          onClick={() => onDelete(revision)}
        >
          {deletingRevisionId === revision.id ? "Deleting…" : "Delete"}
        </button>
      </div>
      <h4>{revision.previousTitle}</h4>
      <p>Count · Target {revision.previousTargetValue} · Bare minimum {revision.previousBareMinimum ?? 0}</p>
      <p>{revision.previousStartDate || "No start date"} → {revision.previousTargetDate || "No target date"}</p>
      <p className="direction-revision-reason"><strong>Reason:</strong> {revision.changeReason}</p>
    </article>) : <p className="direction-history-empty">No meaningful revisions recorded for {goal.title}.</p>}
  </ModalBody>;
}
function formatGoalMetadata(goal) {
  const details = [];
  if (goal.metricType === "count") details.push(`${Number(goal.currentValue)} of ${Number(goal.targetValue)}`);
  if (goal.targetDate) details.push(`Due ${formatDate(goal.targetDate)}`);
  return details.join(" · ");
}
function formatDate(value) { return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)); }
function formatDateTime(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function capitalize(value) { return `${value.charAt(0).toUpperCase()}${value.slice(1)}`; }
