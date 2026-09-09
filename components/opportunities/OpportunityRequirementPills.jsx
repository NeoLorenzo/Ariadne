"use client";

import { useMemo, useState } from "react";
import {
  OPPORTUNITY_ELIGIBILITY_LABELS,
  REQUIREMENT_ASSESSMENT_LABELS,
  deriveOpportunityEligibility,
  getEffectiveRequirementAssessment
} from "@/lib/opportunities/opportunityEligibility";
import {
  formatOpportunityRequirement,
  normalizeStandardizedRequirements
} from "@/lib/opportunities/opportunityRequirements";
import styles from "./OpportunityLandscape.module.css";

function statusFor(assessments, requirementId) {
  return getEffectiveRequirementAssessment(assessments, requirementId)?.status || "unassessed";
}

export default function OpportunityRequirementPills({
  opportunity,
  assessments = [],
  editable = false,
  onSetAssessment,
  onClearAssessment,
  showOverall = false
}) {
  const requirements = useMemo(
    () => normalizeStandardizedRequirements(opportunity?.standardizedRequirements ?? opportunity?.standardized_requirements),
    [opportunity]
  );
  const [selectedId, setSelectedId] = useState("");
  const selected = requirements.find((requirement) => requirement.id === selectedId) || null;
  const effective = selected ? getEffectiveRequirementAssessment(assessments, selected.id) : null;
  const overall = deriveOpportunityEligibility(requirements, assessments);

  if (!requirements.length) return null;

  const renderPill = (requirement) => {
    const status = statusFor(assessments, requirement.id);
    const label = formatOpportunityRequirement(requirement);
    const title = `${REQUIREMENT_ASSESSMENT_LABELS[status]} · ${requirement.necessity.replaceAll("_", " ")}${requirement.sourceText ? ` · ${requirement.sourceText}` : ""}`;
    if (!editable) {
      return <span key={requirement.id} className={`${styles.requirementPill} ${styles[`requirementPill_${status}`]}`} title={title}>{label}</span>;
    }
    return <button key={requirement.id} type="button" className={`${styles.requirementPill} ${styles.requirementPillButton} ${styles[`requirementPill_${status}`]}${selectedId === requirement.id ? ` ${styles.requirementPillSelected}` : ""}`} title={title} onClick={() => setSelectedId((current) => current === requirement.id ? "" : requirement.id)}>{label}</button>;
  };

  return <div className={styles.eligibilityBlock}>
    {showOverall ? <div className={styles.eligibilityHeader}><span>Eligibility</span><span className={`${styles.eligibilityBadge} ${styles[`eligibilityBadge_${overall}`]}`}>{OPPORTUNITY_ELIGIBILITY_LABELS[overall]}</span></div> : null}
    <div className={styles.requirementPills}>{requirements.map(renderPill)}</div>

    {editable && selected ? <div className={styles.assessmentPanel}>
      <div className={styles.assessmentPanelHeader}>
        <strong>{formatOpportunityRequirement(selected)}</strong>
        <span>{effective ? `${REQUIREMENT_ASSESSMENT_LABELS[effective.status]} · ${effective.assessedBy === "user" ? "You" : "AI"}` : "Unassessed"}</span>
      </div>
      {selected.sourceText ? <p><strong>Source:</strong> {selected.sourceText}</p> : null}
      {effective?.rationale ? <p><strong>Rationale:</strong> {effective.rationale}</p> : null}
      <div className={styles.assessmentActions}>
        <button type="button" className={`${styles.assessmentAction} ${styles.assessmentActionMet}`} onClick={() => onSetAssessment?.(selected.id, "met")}>Meets</button>
        <button type="button" className={`${styles.assessmentAction} ${styles.assessmentActionNotMet}`} onClick={() => onSetAssessment?.(selected.id, "not_met")}>Doesn't meet</button>
        <button type="button" className={`${styles.assessmentAction} ${styles.assessmentActionUncertain}`} onClick={() => onSetAssessment?.(selected.id, "uncertain")}>Uncertain</button>
        {assessments.some((assessment) => assessment.requirementId === selected.id && assessment.assessedBy === "user") ? <button type="button" className={styles.assessmentAction} onClick={() => onClearAssessment?.(selected.id)}>Use AI / clear override</button> : null}
      </div>
    </div> : null}
  </div>;
}
