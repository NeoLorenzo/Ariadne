"use client";

import { useMemo, useState } from "react";
import {
  OPPORTUNITY_ELIGIBILITY_LABELS,
  REQUIREMENT_ASSESSMENT_LABELS,
  deriveOpportunityEligibility,
  deriveRequirementNodeEligibility,
  getEffectiveRequirementAssessment,
  getRequirementEligibilityStatus
} from "@/lib/opportunities/opportunityEligibility";
import {
  REQUIREMENT_NECESSITY_LABELS,
  flattenOpportunityRequirements,
  formatOpportunityRequirement,
  getRequirementCriteriaNodes,
  normalizeRequirementNecessity
} from "@/lib/opportunities/opportunityRequirements";
import styles from "./OpportunityEligibility.module.css";

function groupLabel(group) {
  if (group.label) return group.label;
  if (group.operator === "AT_LEAST_N") return `At least ${group.minimumCount || 1}`;
  return group.operator;
}

export default function OpportunityRequirementPills({ opportunity, assessments = [], editable = false, onSetAssessment, onClearAssessment, showOverall = false }) {
  const document = opportunity?.standardizedRequirements ?? opportunity?.standardized_requirements ?? [];
  const criteria = useMemo(() => getRequirementCriteriaNodes(document), [document]);
  const leaves = useMemo(() => flattenOpportunityRequirements(document), [document]);
  const [selectedId, setSelectedId] = useState("");
  const selected = leaves.find((requirement) => requirement.id === selectedId) || null;
  const effective = selected ? getEffectiveRequirementAssessment(assessments, selected.id) : null;
  const overall = deriveOpportunityEligibility(document, assessments);

  if (!criteria.length) return null;

  const renderRequirement = (requirement) => {
    const status = getRequirementEligibilityStatus(requirement, assessments);
    const pillLabel = formatOpportunityRequirement(requirement);
    const necessity = REQUIREMENT_NECESSITY_LABELS[normalizeRequirementNecessity(requirement.necessity)] || "Hard requirement";
    const timing = requirement.evaluationTime && requirement.evaluationTime !== "unspecified" ? ` · ${requirement.evaluationTime.replaceAll("_", " ")}` : "";
    const title = `${REQUIREMENT_ASSESSMENT_LABELS[status]} · ${necessity}${timing}${requirement.sourceText ? ` · ${requirement.sourceText}` : ""}`;
    const automatic = requirement.requirementState === "unrestricted";
    if (!editable || automatic) return <span key={requirement.id} className={`${styles.requirementPill} ${styles[`requirementPill_${status}`]}`} title={title}>{pillLabel}</span>;
    return <button key={requirement.id} type="button" className={`${styles.requirementPill} ${styles.requirementPillButton} ${styles[`requirementPill_${status}`]}${selectedId === requirement.id ? ` ${styles.requirementPillSelected}` : ""}`} title={title} onClick={() => setSelectedId((current) => current === requirement.id ? "" : requirement.id)}>{pillLabel}</button>;
  };

  const renderNode = (node) => {
    if (node.kind !== "group") return renderRequirement(node);
    const status = deriveRequirementNodeEligibility(node, assessments);
    return <span key={node.id} className={`${styles.requirementGroup} ${styles[`requirementGroup_${status}`]}`}>
      <span className={styles.requirementGroupLabel}>{groupLabel(node)}</span>
      <span className={styles.requirementGroupChildren}>{(node.children || []).map(renderNode)}</span>
    </span>;
  };

  return <div className={styles.eligibilityBlock}>
    {showOverall ? <div className={styles.eligibilityHeader}><span>Eligibility</span><span className={`${styles.eligibilityBadge} ${styles[`eligibilityBadge_${overall}`]}`}>{OPPORTUNITY_ELIGIBILITY_LABELS[overall]}</span></div> : null}
    <div className={styles.requirementPills}>{criteria.map(renderNode)}</div>
    {editable && selected ? <div className={styles.assessmentPanel}>
      <div className={styles.assessmentPanelHeader}><strong>{formatOpportunityRequirement(selected)}</strong><span>{effective ? `${REQUIREMENT_ASSESSMENT_LABELS[effective.status]} · ${effective.assessedBy === "user" ? "You" : "AI"}` : "Unassessed"}</span></div>
      <p><strong>Criterion:</strong> {REQUIREMENT_NECESSITY_LABELS[normalizeRequirementNecessity(selected.necessity)]}{selected.evaluationTime && selected.evaluationTime !== "unspecified" ? ` · ${selected.evaluationTime.replaceAll("_", " ")}` : ""}</p>
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
