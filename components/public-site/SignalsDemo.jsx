"use client";

import { CalendarClock, GitCommitHorizontal, TriangleAlert } from "lucide-react";
import { NOTICES, REPOSITORIES } from "./syntheticWorkspace";
import { useInView } from "./useInView";
import styles from "./SignalsDemo.module.css";

const BOARD = [
  ...NOTICES.map((notice) => ({ ...notice, icon: notice.level === "danger" ? TriangleAlert : GitCommitHorizontal })),
  { level: "deadline", label: "Deadline", text: "Frontier Safety Fellowship closes in 3 days.", icon: CalendarClock }
];

export default function SignalsDemo() {
  const [ref, inView] = useInView({ threshold: 0.3 });

  return (
    <div className={`${styles.grid}${inView ? ` ${styles.visible}` : ""}`} ref={ref}>
      <div className={styles.card}>
        <header className={styles.cardHeader}>
          <strong>Notice board</strong>
          <span className={styles.badge}>{BOARD.length} issues</span>
        </header>
        <ul className={styles.notices}>
          {BOARD.map(({ level, label, text, icon: Icon }, index) => (
            <li key={text} data-level={level} style={{ "--index": index }}>
              <span className={styles.noticeIcon}><Icon size={15} /></span>
              <div>
                <span>{label}</span>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <header className={styles.cardHeader}>
          <strong>Repositories</strong>
          <span className={styles.synced}><i />Synced via GitHub App</span>
        </header>
        <div className={styles.repoScale} aria-hidden="true">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
        <ul className={styles.repos}>
          {REPOSITORIES.map((repo, repoIndex) => (
            <li key={repo.name} data-state={repo.state}>
              <span className={styles.repoName}>{repo.name}</span>
              <span className={styles.activity} aria-hidden="true">
                {repo.activity.split("").map((level, index) => (
                  <i
                    key={index}
                    data-level={level}
                    style={{ "--cell": `${repoIndex * 40 + index * 18}ms` }}
                  />
                ))}
              </span>
              <span className={styles.recency}>{repo.committed}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
