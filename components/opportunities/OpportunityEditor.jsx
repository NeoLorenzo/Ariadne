"use client";

import { useEffect, useState } from "react";
import { DateInput, GhostButton, ModalBody, ModalFooter, ModalShell, PrimaryButton, SecondaryButton, Select, TextArea, TextInput, useModalDialog } from "@/components/ui/AriadneUI";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS, validateOpportunity } from "@/lib/opportunities/opportunityModel";
import { OPPORTUNITY_APPLICATION_STATUS_LABELS } from "@/lib/opportunities/opportunityApplicationModel";
import OpportunityRequirementPills from "./OpportunityRequirementPills";
import OpportunityRequirementsEditor from "./OpportunityRequirementsEditor";
import styles from "./OpportunityLandscape.module.css";

const EMPTY_FORM = { title: "", type: "job", organization: "", url: "", description: "", standardizedRequirements: [], miscRequirements: "", deadline: "", startDate: "" };
function toForm(opportunity) {
  if (!opportunity) return EMPTY_FORM;
  return { title: opportunity.title || "", type: opportunity.type || "other", organization: opportunity.organization || "", url: opportunity.url || "", description: opportunity.description || "", standardizedRequirements: opportunity.standardizedRequirements || [], miscRequirements: opportunity.miscRequirements || opportunity.requirements || "", deadline: opportunity.deadline || "", startDate: opportunity.startDate || "" };
}

const V2_SCORE_ROWS = [
  ["capabilityMatch", "Capability match"],
  ["relevantExperience", "Relevant experience"],
  ["evidenceStrength", "Evidence strength"],
  ["domainFit", "Domain fit"],
  ["competitiveBarFit", "Competitive-bar fit"],
  ["differentiation", "Differentiation"]
];

function ScoreMetric({ label, value, suffix = "" }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return <div className={styles.scoreMetric}>
    <span>{label}</span>
    <strong>{hasValue ? value : "—"}{hasValue && suffix ? <small>{suffix}</small> : null}</strong>
  </div>;
}

function OpportunityScoreSummary({ score }) {
  if (!score) return null;
  const isV2 = score.methodologyVersion === "2";

  return <section className={`${styles.fieldFull} ${styles.scoreSummary}`} aria-label="Landscape scoring">
    <div className={styles.scoreSummaryHeader}>
      <strong>Landscape scoring</strong>
      <span className={styles.muted}>Methodology v{score.methodologyVersion}</span>
    </div>
    <div className={styles.scoreMetrics}>
      <ScoreMetric label="Strategic value" value={score.strategicValue} />
      <ScoreMetric label="Attainability" value={score.attainability} />
      {isV2 ? <ScoreMetric label="Competitive strength" value={score.competitiveStrength} suffix="/100" /> : null}
      {isV2 ? <ScoreMetric label="Eligibility" value={score.eligibility} suffix={`/4 · ×${score.eligibilityMultiplier ?? "—"}`} /> : null}
    </div>
    {isV2 ? <>
      <div className={styles.scoreDimensions}>
        {V2_SCORE_ROWS.map(([key, label]) => {
          const value = Number(score[key]);
          const width = Number.isFinite(value) ? Math.min(Math.max(value / 4, 0), 1) * 100 : 0;
          return <div className={styles.scoreDimension} key={key}>
            <span>{label}</span>
            <span className={styles.scoreDimensionBar} aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
            <strong>{Number.isFinite(value) ? value : "—"}/4</strong>
          </div>;
        })}
      </div>
      {score.attainabilityRationale ? <p className={styles.scoreRationale}>{score.attainabilityRationale}</p> : null}
    </> : <p className={styles.scoreRationale}>Legacy Attainability v1 uses eligibility, competitiveness, career-stage fit and timing/actionability equally.</p>}
  </section>;
}

export default function OpportunityEditor({ isOpen, opportunity, application, score, isBusy, onClose, onSave, onDelete, onArchiveToggle, onMarkApplied, onOpenApplication, assessments = [], onSetAssessment, onClearAssessment }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const dialogRef = useModalDialog(isOpen, onClose);
  const isEditing = Boolean(opportunity?.id);
  useEffect(() => { if (isOpen) { setForm(toForm(opportunity)); setErrors({}); } }, [isOpen, opportunity]);
  if (!isOpen) return null;
  const setField = (field, value) => { setForm((current) => ({ ...current, [field]: value })); if (errors[field] || errors.general) setErrors((current) => ({ ...current, [field]: undefined, general: undefined })); };
  const submit = async (event) => { event.preventDefault(); const nextErrors = validateOpportunity(form); if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; } const accepted = await onSave(form); if (!accepted) setErrors((current) => ({ ...current, general: "The opportunity could not be saved." })); };
  const requestDelete = async () => { if (!isEditing) return; if (!window.confirm(`Delete “${opportunity.title}”? This removes it from the Opportunity Landscape.`)) return; await onDelete(opportunity.id); };
  const assessmentOpportunity = isEditing ? opportunity : null;

  return <div className={styles.editorLayer} role="dialog" aria-modal="true" aria-labelledby="opportunity-editor-title">
    <button type="button" className={styles.editorBackdrop} onClick={onClose} aria-label="Close opportunity editor" />
    <ModalShell ref={dialogRef} as="form" className={styles.editor} onSubmit={submit}>
      <header className={`ff-modal-header ${styles.editorHeader}`}><h3 id="opportunity-editor-title">{isEditing ? "Edit opportunity" : "Add opportunity"}</h3><span className={styles.editorHeaderSpacer} /><button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">×</button></header>
      <ModalBody className={styles.editorBody}>
        <div className={styles.editorGrid}>
          <div className={styles.fieldFull}><label htmlFor="opportunity-title">Title</label><TextInput id="opportunity-title" value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder="e.g. Policy Research Fellowship" autoFocus required />{errors.title ? <p className={styles.fieldError}>{errors.title}</p> : null}</div>
          <div className={styles.field}><label htmlFor="opportunity-type">Type</label><Select id="opportunity-type" value={form.type} onChange={(event) => setField("type", event.target.value)}>{OPPORTUNITY_TYPES.map((type) => <option key={type} value={type}>{OPPORTUNITY_TYPE_LABELS[type]}</option>)}</Select>{errors.type ? <p className={styles.fieldError}>{errors.type}</p> : null}</div>
          <div className={styles.field}><label htmlFor="opportunity-organization">Organization / institution</label><TextInput id="opportunity-organization" value={form.organization} onChange={(event) => setField("organization", event.target.value)} placeholder="Organization or university" /></div>
          <div className={styles.fieldFull}><label htmlFor="opportunity-url">Link</label><TextInput id="opportunity-url" type="url" value={form.url} onChange={(event) => setField("url", event.target.value)} placeholder="https://…" />{errors.url ? <p className={styles.fieldError}>{errors.url}</p> : null}</div>
          <div className={styles.field}><label htmlFor="opportunity-deadline">Application deadline</label><DateInput id="opportunity-deadline" value={form.deadline} onChange={(event) => setField("deadline", event.target.value)} />{errors.deadline ? <p className={styles.fieldError}>{errors.deadline}</p> : null}</div>
          <div className={styles.field}><label htmlFor="opportunity-start-date">Start date</label><DateInput id="opportunity-start-date" value={form.startDate} onChange={(event) => setField("startDate", event.target.value)} />{errors.startDate ? <p className={styles.fieldError}>{errors.startDate}</p> : null}</div>
          {application ? <div className={styles.fieldFull}><strong>Application: {OPPORTUNITY_APPLICATION_STATUS_LABELS[application.status] || application.status}</strong><SecondaryButton type="button" onClick={() => onOpenApplication?.(application)}>Open application</SecondaryButton></div> : null}
          {isEditing ? <OpportunityScoreSummary score={score} /> : null}
          {assessmentOpportunity?.standardizedRequirements?.length ? <div className={styles.fieldFull}><OpportunityRequirementPills opportunity={assessmentOpportunity} assessments={assessments} editable showOverall onSetAssessment={onSetAssessment} onClearAssessment={onClearAssessment} /></div> : null}
          <OpportunityRequirementsEditor standardizedRequirements={form.standardizedRequirements} miscRequirements={form.miscRequirements} onChange={({ standardizedRequirements, miscRequirements }) => { setForm((current) => ({ ...current, standardizedRequirements, miscRequirements })); if (errors.standardizedRequirements || errors.general) setErrors((current) => ({ ...current, standardizedRequirements: undefined, general: undefined })); }} />
          {errors.standardizedRequirements ? <div className={styles.fieldFull}><p className={styles.fieldError}>{errors.standardizedRequirements}</p></div> : null}
          <div className={styles.fieldFull}><label htmlFor="opportunity-description">Description / notes</label><TextArea id="opportunity-description" size="medium" rows={5} value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Why it matters, useful context, application notes…" /></div>
        </div>
        {errors.general ? <p className={styles.formError}>{errors.general}</p> : null}
      </ModalBody>
      <ModalFooter className={styles.editorFooter}>{isEditing ? <><GhostButton type="button" onClick={() => onArchiveToggle(opportunity)} disabled={isBusy}>{opportunity.archived ? "Restore" : "Archive"}</GhostButton><GhostButton type="button" className={styles.dangerButton} onClick={requestDelete} disabled={isBusy}>Delete</GhostButton>{!application ? <GhostButton type="button" onClick={() => onMarkApplied?.(opportunity)} disabled={isBusy}>Mark as applied</GhostButton> : null}</> : null}<span className={styles.footerSpacer} /><SecondaryButton type="button" onClick={onClose} disabled={isBusy}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={isBusy}>{isBusy ? "Saving…" : "Save"}</PrimaryButton></ModalFooter>
    </ModalShell>
  </div>;
}
