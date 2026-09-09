"use client";

import { OPPORTUNITY_CANDIDATE_REVIEW_LABELS, OPPORTUNITY_CANDIDATE_SOURCE_LABELS } from "@/lib/opportunities/opportunityCandidateModel";
import { OPPORTUNITY_TYPE_LABELS } from "@/lib/opportunities/opportunityModel";
import OpportunityRequirementPills from "./OpportunityRequirementPills";
import styles from "./OpportunityLandscape.module.css";
import candidateStyles from "./OpportunityCandidate.module.css";

function formatDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return "No deadline";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function reviewBadgeClass(status) {
  if (status === "accepted") return candidateStyles.reviewBadgeAccepted;
  if (status === "rejected") return candidateStyles.reviewBadgeRejected;
  if (status === "duplicate") return candidateStyles.reviewBadgeDuplicate;
  return candidateStyles.reviewBadgePending;
}
function CandidateStatus({ status }) { return <span className={`${styles.lifecycleBadge} ${reviewBadgeClass(status)}`}>{OPPORTUNITY_CANDIDATE_REVIEW_LABELS[status] || "Pending"}</span>; }
function RequirementCell({ candidate, assessments }) {
  const hasStructured = Boolean(candidate.standardizedRequirements?.length);
  if (hasStructured) return <OpportunityRequirementPills opportunity={candidate} assessments={assessments} />;
  const misc = candidate.miscRequirements || candidate.requirements;
  return misc ? <span className={styles.clamp}>{misc}</span> : <span className={styles.muted}>—</span>;
}

export default function OpportunityCandidateTable({ candidates, onSelect, assessmentsByEntity = {} }) {
  if (!candidates.length) return null;
  return <>
    <div className={`${styles.tableWrap} ${styles.desktopTable}`}><table className={styles.table}>
      <thead><tr><th className={candidateStyles.candidateOpportunityCell}>Candidate</th><th className={candidateStyles.candidateTypeCell}>Type</th><th className={candidateStyles.candidateOrganizationCell}>Organization</th><th className={candidateStyles.candidateDeadlineCell}>Deadline</th><th className={candidateStyles.candidateSourceCell}>Source</th><th className={candidateStyles.candidateRequirementsCell}>Requirements</th></tr></thead>
      <tbody>{candidates.map((candidate) => <tr key={candidate.id} className={styles.row} onClick={() => onSelect(candidate)}>
        <td className={candidateStyles.candidateOpportunityCell}><div className={styles.opportunityTitleLine}><span className={styles.opportunityTitle}>{candidate.title}</span><CandidateStatus status={candidate.reviewStatus} /></div></td>
        <td className={candidateStyles.candidateTypeCell}><span className={styles.typeBadge}>{OPPORTUNITY_TYPE_LABELS[candidate.type] || "Other"}</span></td>
        <td className={candidateStyles.candidateOrganizationCell}>{candidate.organization || <span className={styles.muted}>—</span>}</td>
        <td className={candidateStyles.candidateDeadlineCell}><span className={!candidate.deadline ? styles.muted : undefined}>{formatDateOnly(candidate.deadline)}</span></td>
        <td className={candidateStyles.candidateSourceCell}><div className={candidateStyles.sourceSummary}><span>{candidate.sourceName || "Unknown source"}</span><span className={styles.muted}>{OPPORTUNITY_CANDIDATE_SOURCE_LABELS[candidate.sourceType] || candidate.sourceType}</span></div></td>
        <td className={candidateStyles.candidateRequirementsCell}><RequirementCell candidate={candidate} assessments={assessmentsByEntity[candidate.id] || []} /></td>
      </tr>)}</tbody>
    </table></div>
    <div className={styles.mobileList}>{candidates.map((candidate) => <button key={candidate.id} type="button" className={styles.mobileCard} onClick={() => onSelect(candidate)}>
      <div className={styles.mobileCardHeader}><span className={styles.mobileCardTitle}>{candidate.title}</span><CandidateStatus status={candidate.reviewStatus} /></div>
      <div className={styles.mobileCardMeta}><span className={styles.typeBadge}>{OPPORTUNITY_TYPE_LABELS[candidate.type] || "Other"}</span>{candidate.organization ? <span>{candidate.organization}</span> : null}<span>·</span><span>{formatDateOnly(candidate.deadline)}</span></div>
      <div className={styles.mobileCardMeta}><span>{candidate.sourceName || "Unknown source"}</span><span>·</span><span>{OPPORTUNITY_CANDIDATE_SOURCE_LABELS[candidate.sourceType] || candidate.sourceType}</span></div>
      <RequirementCell candidate={candidate} assessments={assessmentsByEntity[candidate.id] || []} />
    </button>)}</div>
  </>;
}
