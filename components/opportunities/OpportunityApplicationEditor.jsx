"use client";

import { useEffect, useState } from "react";
import { DateInput, ModalBody, ModalFooter, ModalShell, PrimaryButton, SecondaryButton, Select, TextArea, useModalDialog } from "@/components/ui/AriadneUI";
import { OPPORTUNITY_TYPE_LABELS } from "@/lib/opportunities/opportunityModel";
import { OPPORTUNITY_APPLICATION_STATUSES, OPPORTUNITY_APPLICATION_STATUS_LABELS } from "@/lib/opportunities/opportunityApplicationModel";
import styles from "./OpportunityLandscape.module.css";

function toDateInput(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateInput(value) {
  return value ? `${value}T12:00:00.000Z` : "";
}

function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function OpportunityApplicationEditor({ isOpen, application, opportunity, isBusy, onClose, onSave, onOpenOpportunity }) {
  const [submittedDate, setSubmittedDate] = useState("");
  const [status, setStatus] = useState("submitted");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useModalDialog(isOpen, onClose);

  useEffect(() => {
    if (!isOpen || !application) return;
    setSubmittedDate(toDateInput(application.submittedAt));
    setStatus(application.status || "submitted");
    setNotes(application.notes || "");
    setError("");
  }, [application, isOpen]);

  if (!isOpen || !application) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (!submittedDate) { setError("Submission date is required."); return; }
    const accepted = await onSave({ submittedAt: fromDateInput(submittedDate), status, notes });
    if (!accepted) setError("The application could not be saved.");
  };

  return <div className={styles.editorLayer} role="dialog" aria-modal="true" aria-labelledby="application-editor-title">
    <button type="button" className={styles.editorBackdrop} onClick={onClose} aria-label="Close application editor" />
    <ModalShell ref={dialogRef} as="form" className={styles.editor} onSubmit={submit}>
      <header className={`ff-modal-header ${styles.editorHeader}`}><h3 id="application-editor-title">Application</h3><span className={styles.editorHeaderSpacer} /><button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">×</button></header>
      <ModalBody className={styles.editorBody}>
        <div className={styles.applicationSummary}>
          <strong>{opportunity?.title || "Unknown opportunity"}</strong>
          <span>{opportunity?.organization || "Unknown organization"} · {OPPORTUNITY_TYPE_LABELS[opportunity?.type] || "Other"}</span>
          {onOpenOpportunity ? <button type="button" className={styles.inlineAction} onClick={() => onOpenOpportunity(opportunity)}>Open Landscape record</button> : null}
        </div>
        <div className={styles.editorGrid}>
          <div className={styles.field}><label htmlFor="application-submitted">Submitted</label><DateInput id="application-submitted" value={submittedDate} onChange={(event) => { setSubmittedDate(event.target.value); setError(""); }} required /></div>
          <div className={styles.field}><label htmlFor="application-status">Status</label><Select id="application-status" value={status} onChange={(event) => { setStatus(event.target.value); setError(""); }}>{OPPORTUNITY_APPLICATION_STATUSES.map((value) => <option key={value} value={value}>{OPPORTUNITY_APPLICATION_STATUS_LABELS[value]}</option>)}</Select></div>
          <div className={styles.fieldFull}><label>Status last changed</label><div className={styles.readOnlyValue}>{formatDateTime(application.statusUpdatedAt)}</div></div>
          <div className={styles.fieldFull}><label htmlFor="application-notes">Notes</label><TextArea id="application-notes" size="medium" rows={6} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Useful application context, response details, next-stage notes…" /></div>
        </div>
        {error ? <p className={styles.formError}>{error}</p> : null}
      </ModalBody>
      <ModalFooter className={styles.editorFooter}><span className={styles.footerSpacer} /><SecondaryButton type="button" onClick={onClose} disabled={isBusy}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={isBusy}>{isBusy ? "Saving…" : "Save"}</PrimaryButton></ModalFooter>
    </ModalShell>
  </div>;
}
