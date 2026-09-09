"use client";

import { OPPORTUNITY_TYPE_LABELS, isExpiredOpportunity } from "@/lib/opportunities/opportunityModel";
import { summarizeOpportunityRequirements } from "@/lib/opportunities/opportunityRequirements";
import styles from "./OpportunityLandscape.module.css";

function formatDateOnly(value) {
  const normalized = String(value || "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return "No deadline";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function OpportunityStatus({ opportunity }) {
  if (opportunity.archived) return <span className={styles.lifecycleBadge}>Archived</span>;
  if (isExpiredOpportunity(opportunity)) return <span className={`${styles.lifecycleBadge} ${styles.expiredBadge}`}>Expired</span>;
  return null;
}

export default function OpportunityTable({ opportunities, onSelect }) {
  if (!opportunities.length) return null;

  return <>
    <div className={`${styles.tableWrap} ${styles.desktopTable}`}>
      <table className={styles.table}>
        <thead><tr>
          <th className={styles.opportunityCell}>Opportunity</th>
          <th className={styles.typeCell}>Type</th>
          <th className={styles.organizationCell}>Organization</th>
          <th className={styles.deadlineCell}>Deadline</th>
          <th className={styles.requirementsCell}>Requirements</th>
        </tr></thead>
        <tbody>{opportunities.map((opportunity) => {
          const requirementsSummary = summarizeOpportunityRequirements(opportunity);
          return <tr key={opportunity.id} className={`${styles.row}${opportunity.archived ? ` ${styles.rowArchived}` : ""}`} onClick={() => onSelect(opportunity)}>
            <td className={styles.opportunityCell}>
              <div className={styles.opportunityTitleLine}>
                <span className={styles.opportunityTitle}>{opportunity.title}</span>
                <OpportunityStatus opportunity={opportunity} />
                {opportunity.url ? <a className={styles.externalLink} href={opportunity.url} target="_blank" rel="noreferrer" aria-label={`Open ${opportunity.title}`} title="Open opportunity link" onClick={(event) => event.stopPropagation()}>↗</a> : null}
              </div>
            </td>
            <td className={styles.typeCell}><span className={styles.typeBadge}>{OPPORTUNITY_TYPE_LABELS[opportunity.type] || "Other"}</span></td>
            <td className={styles.organizationCell}>{opportunity.organization || <span className={styles.muted}>—</span>}</td>
            <td className={styles.deadlineCell}><div className={styles.deadline}><span className={!opportunity.deadline ? styles.muted : undefined}>{formatDateOnly(opportunity.deadline)}</span></div></td>
            <td className={styles.requirementsCell}>{requirementsSummary ? <span className={styles.clamp}>{requirementsSummary}</span> : <span className={styles.muted}>—</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>

    <div className={styles.mobileList}>{opportunities.map((opportunity) => {
      const requirementsSummary = summarizeOpportunityRequirements(opportunity);
      return <button key={opportunity.id} type="button" className={`${styles.mobileCard}${opportunity.archived ? ` ${styles.mobileCardArchived}` : ""}`} onClick={() => onSelect(opportunity)}>
        <div className={styles.mobileCardHeader}><span className={styles.mobileCardTitle}>{opportunity.title}</span><OpportunityStatus opportunity={opportunity} /></div>
        <div className={styles.mobileCardMeta}>
          <span className={styles.typeBadge}>{OPPORTUNITY_TYPE_LABELS[opportunity.type] || "Other"}</span>
          {opportunity.organization ? <span>{opportunity.organization}</span> : null}<span>·</span><span>{formatDateOnly(opportunity.deadline)}</span>
        </div>
        {requirementsSummary ? <p className={styles.mobileRequirements}>{requirementsSummary}</p> : null}
      </button>;
    })}</div>
  </>;
}
