"use client";

import { OPPORTUNITY_TYPE_LABELS } from "@/lib/opportunities/opportunityModel";
import { OPPORTUNITY_APPLICATION_STATUS_LABELS, resolveApplicationOpportunity } from "@/lib/opportunities/opportunityApplicationModel";
import styles from "./OpportunityLandscape.module.css";

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default function OpportunityApplicationTable({ applications, opportunityById, onSelect }) {
  if (!applications.length) return null;

  return <>
    <div className={`${styles.tableWrap} ${styles.desktopTable}`}>
      <table className={styles.table}>
        <thead><tr><th className={styles.opportunityCell}>Opportunity</th><th>Organization</th><th>Type</th><th>Applied</th><th>Status</th><th>Last updated</th></tr></thead>
        <tbody>{applications.map((application) => {
          const opportunity = resolveApplicationOpportunity(application, opportunityById);
          return <tr key={application.id} className={styles.row} onClick={() => onSelect(application)}>
            <td className={styles.opportunityCell}><span className={styles.opportunityTitle}>{opportunity?.title || "Unknown opportunity"}</span></td>
            <td>{opportunity?.organization || <span className={styles.muted}>—</span>}</td>
            <td><span className={styles.typeBadge}>{OPPORTUNITY_TYPE_LABELS[opportunity?.type] || "Other"}</span></td>
            <td>{formatDate(application.submittedAt)}</td>
            <td><span className={styles.lifecycleBadge}>{OPPORTUNITY_APPLICATION_STATUS_LABELS[application.status] || application.status}</span></td>
            <td>{formatDate(application.statusUpdatedAt)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className={styles.mobileList}>{applications.map((application) => {
      const opportunity = resolveApplicationOpportunity(application, opportunityById);
      return <button key={application.id} type="button" className={styles.mobileCard} onClick={() => onSelect(application)}>
        <div className={styles.mobileCardHeader}><span className={styles.mobileCardTitle}>{opportunity?.title || "Unknown opportunity"}</span><span className={styles.lifecycleBadge}>{OPPORTUNITY_APPLICATION_STATUS_LABELS[application.status] || application.status}</span></div>
        <div className={styles.mobileCardMeta}>{opportunity?.organization ? <span>{opportunity.organization}</span> : null}<span>{OPPORTUNITY_TYPE_LABELS[opportunity?.type] || "Other"}</span><span>·</span><span>Applied {formatDate(application.submittedAt)}</span></div>
      </button>;
    })}</div>
  </>;
}
