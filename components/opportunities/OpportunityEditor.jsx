"use client";

import { useEffect, useState } from "react";
import {
  DateInput,
  GhostButton,
  ModalBody,
  ModalFooter,
  ModalShell,
  PrimaryButton,
  SecondaryButton,
  Select,
  TextArea,
  TextInput,
  useModalDialog
} from "@/components/ui/AriadneUI";
import {
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  validateOpportunity
} from "@/lib/opportunities/opportunityModel";
import OpportunityRequirementsEditor from "./OpportunityRequirementsEditor";
import styles from "./OpportunityLandscape.module.css";

const EMPTY_FORM = {
  title: "",
  type: "job",
  organization: "",
  url: "",
  description: "",
  standardizedRequirements: [],
  miscRequirements: "",
  deadline: "",
  startDate: ""
};

function toForm(opportunity) {
  if (!opportunity) return EMPTY_FORM;
  return {
    title: opportunity.title || "",
    type: opportunity.type || "other",
    organization: opportunity.organization || "",
    url: opportunity.url || "",
    description: opportunity.description || "",
    standardizedRequirements: opportunity.standardizedRequirements || [],
    miscRequirements: opportunity.miscRequirements || opportunity.requirements || "",
    deadline: opportunity.deadline || "",
    startDate: opportunity.startDate || ""
  };
}

export default function OpportunityEditor({ isOpen, opportunity, isBusy, onClose, onSave, onDelete, onArchiveToggle }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const dialogRef = useModalDialog(isOpen, onClose);
  const isEditing = Boolean(opportunity?.id);

  useEffect(() => {
    if (!isOpen) return;
    setForm(toForm(opportunity));
    setErrors({});
  }, [isOpen, opportunity]);

  if (!isOpen) return null;

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field] || errors.general) setErrors((current) => ({ ...current, [field]: undefined, general: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = validateOpportunity(form);
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    const accepted = await onSave(form);
    if (!accepted) setErrors((current) => ({ ...current, general: "The opportunity could not be saved." }));
  };

  const requestDelete = async () => {
    if (!isEditing) return;
    if (!window.confirm(`Delete “${opportunity.title}”? This removes it from the Opportunity Landscape.`)) return;
    await onDelete(opportunity.id);
  };

  return (
    <div className={styles.editorLayer} role="dialog" aria-modal="true" aria-labelledby="opportunity-editor-title">
      <button type="button" className={styles.editorBackdrop} onClick={onClose} aria-label="Close opportunity editor" />
      <ModalShell ref={dialogRef} as="form" className={styles.editor} onSubmit={submit}>
        <header className={`ff-modal-header ${styles.editorHeader}`}>
          <h3 id="opportunity-editor-title">{isEditing ? "Edit Opportunity" : "Add Opportunity"}</h3>
          <span className={styles.editorHeaderSpacer} />
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">×</button>
        </header>

        <ModalBody className={styles.editorBody}>
          <div className={styles.editorGrid}>
            <div className={styles.fieldFull}>
              <label htmlFor="opportunity-title">Title</label>
              <TextInput id="opportunity-title" value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder="e.g. Policy Research Fellowship" autoFocus required />
              {errors.title ? <p className={styles.fieldError}>{errors.title}</p> : null}
            </div>

            <div className={styles.field}>
              <label htmlFor="opportunity-type">Type</label>
              <Select id="opportunity-type" value={form.type} onChange={(event) => setField("type", event.target.value)}>
                {OPPORTUNITY_TYPES.map((type) => <option key={type} value={type}>{OPPORTUNITY_TYPE_LABELS[type]}</option>)}
              </Select>
              {errors.type ? <p className={styles.fieldError}>{errors.type}</p> : null}
            </div>

            <div className={styles.field}>
              <label htmlFor="opportunity-organization">Organization / institution</label>
              <TextInput id="opportunity-organization" value={form.organization} onChange={(event) => setField("organization", event.target.value)} placeholder="Organization or university" />
            </div>

            <div className={styles.fieldFull}>
              <label htmlFor="opportunity-url">Link</label>
              <TextInput id="opportunity-url" type="url" value={form.url} onChange={(event) => setField("url", event.target.value)} placeholder="https://…" />
              {errors.url ? <p className={styles.fieldError}>{errors.url}</p> : null}
            </div>

            <div className={styles.field}>
              <label htmlFor="opportunity-deadline">Application deadline</label>
              <DateInput id="opportunity-deadline" value={form.deadline} onChange={(event) => setField("deadline", event.target.value)} />
              {errors.deadline ? <p className={styles.fieldError}>{errors.deadline}</p> : null}
            </div>

            <div className={styles.field}>
              <label htmlFor="opportunity-start-date">Start date</label>
              <DateInput id="opportunity-start-date" value={form.startDate} onChange={(event) => setField("startDate", event.target.value)} />
              {errors.startDate ? <p className={styles.fieldError}>{errors.startDate}</p> : null}
            </div>

            <OpportunityRequirementsEditor
              standardizedRequirements={form.standardizedRequirements}
              miscRequirements={form.miscRequirements}
              onChange={({ standardizedRequirements, miscRequirements }) => {
                setForm((current) => ({ ...current, standardizedRequirements, miscRequirements }));
                if (errors.standardizedRequirements || errors.general) setErrors((current) => ({ ...current, standardizedRequirements: undefined, general: undefined }));
              }}
            />
            {errors.standardizedRequirements ? <div className={styles.fieldFull}><p className={styles.fieldError}>{errors.standardizedRequirements}</p></div> : null}

            <div className={styles.fieldFull}>
              <label htmlFor="opportunity-description">Description / notes</label>
              <TextArea id="opportunity-description" size="medium" rows={5} value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Why it matters, useful context, application notes…" />
            </div>
          </div>
          {errors.general ? <p className={styles.formError}>{errors.general}</p> : null}
        </ModalBody>

        <ModalFooter className={styles.editorFooter}>
          {isEditing ? <>
            <GhostButton type="button" onClick={() => onArchiveToggle(opportunity)} disabled={isBusy}>{opportunity.archived ? "Restore" : "Archive"}</GhostButton>
            <GhostButton type="button" className={styles.dangerButton} onClick={requestDelete} disabled={isBusy}>Delete</GhostButton>
          </> : null}
          <span className={styles.footerSpacer} />
          <SecondaryButton type="button" onClick={onClose} disabled={isBusy}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={isBusy}>{isBusy ? "Saving…" : "Save"}</PrimaryButton>
        </ModalFooter>
      </ModalShell>
    </div>
  );
}
