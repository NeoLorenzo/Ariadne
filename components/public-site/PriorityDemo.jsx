"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { prefersReducedMotion, useInView } from "./useInView";
import styles from "./PriorityDemo.module.css";

export const PRIORITY_SIGNALS = [
  ["relevance", "Strategic relevance"],
  ["urgency", "Urgency"],
  ["leverage", "Leverage"],
  ["obligation", "Obligations"],
  ["actionability", "Actionability"]
];

// Ordered as a stale list: the user's priorities drifted while strategy moved on.
const TASKS = [
  {
    id: "reading",
    title: "Reorganise reading list",
    link: "No strategic link",
    before: 2,
    after: 4,
    rank: 5,
    why: "No objective depends on it · safe to defer",
    factors: { relevance: 0, urgency: 0, leverage: 1, obligation: 0, actionability: 3 }
  },
  {
    id: "comments",
    title: "Reply to newsletter comments",
    link: "Reach 1,000 subscribers",
    before: 2,
    after: 3,
    rank: 4,
    why: "Relevant, but low leverage and no deadline",
    factors: { relevance: 2, urgency: 1, leverage: 1, obligation: 0, actionability: 3 }
  },
  {
    id: "essay",
    title: "Outline the October essay",
    link: "Ship one essay every month",
    before: 3,
    after: 2,
    rank: 3,
    why: "Keeps the monthly essay objective on schedule",
    factors: { relevance: 3, urgency: 2, leverage: 2, obligation: 0, actionability: 3 }
  },
  {
    id: "fellowship",
    title: "Apply: Frontier Safety Fellowship",
    link: "Earn a place in a research lab",
    before: 3,
    after: 1,
    rank: 1,
    due: "Closes in 3d",
    why: "Advances a research-lab objective · closes in 3 days",
    factors: { relevance: 3, urgency: 3, leverage: 3, obligation: 1, actionability: 2 }
  },
  {
    id: "methods",
    title: "Draft methods section",
    link: "Publish original research",
    before: 4,
    after: 1,
    rank: 0,
    due: "Due in 2d",
    why: "Unblocks the workshop paper · due in 2 days",
    factors: { relevance: 3, urgency: 3, leverage: 3, obligation: 2, actionability: 3 }
  },
  {
    id: "passport",
    title: "Renew passport",
    link: "Obligation",
    before: 4,
    after: 2,
    rank: 2,
    due: "Due in 12d",
    why: "Hard obligation with a three-week lead time",
    factors: { relevance: 1, urgency: 2, leverage: 1, obligation: 3, actionability: 3 }
  }
];

export default function PriorityDemo() {
  const [phase, setPhase] = useState("idle");
  const [scanIndex, setScanIndex] = useState(-1);
  const [ref, inView] = useInView({ threshold: 0.45 });
  const autoplayed = useRef(false);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current = [];
  };

  const run = () => {
    clearTimers();
    if (prefersReducedMotion()) {
      setScanIndex(TASKS.length);
      setPhase("done");
      return;
    }
    setPhase("scanning");
    setScanIndex(-1);
    TASKS.forEach((_, index) => {
      timers.current.push(setTimeout(() => setScanIndex(index), 250 + index * 380));
    });
    timers.current.push(setTimeout(() => {
      setScanIndex(TASKS.length);
      setPhase("done");
    }, 400 + TASKS.length * 380));
  };

  const reset = () => {
    clearTimers();
    setPhase("idle");
    setScanIndex(-1);
  };

  useEffect(() => {
    if (!inView || autoplayed.current) return undefined;
    autoplayed.current = true;
    const timer = setTimeout(run, 700);
    return () => clearTimeout(timer);
  }, [inView]);

  useEffect(() => clearTimers, []);

  const done = phase === "done";

  return (
    <div className={styles.panel} ref={ref} data-phase={phase}>
      <header className={styles.header}>
        <div className={styles.bot}>
          <span className={styles.botIcon}><Sparkles size={16} /></span>
          <div>
            <strong>Ari Bot</strong>
            <span>
              {phase === "idle" ? "Ready to reprioritize 6 tasks" : null}
              {phase === "scanning" ? "Reading directions, objectives and deadlines…" : null}
              {done ? "Priorities updated · 6 changed" : null}
            </span>
          </div>
        </div>
        {done ? (
          <button key="reset" type="button" className={styles.action} onClick={reset}>
            <RotateCcw size={14} /> Reset
          </button>
        ) : (
          <button key="run" type="button" className={styles.action} onClick={run} disabled={phase === "scanning"} data-primary>
            <Sparkles size={14} /> Reprioritize
          </button>
        )}
      </header>

      <div className={styles.legend} aria-hidden="true">
        {PRIORITY_SIGNALS.map(([key, label]) => (
          <span key={key}><i data-signal={key} />{label}</span>
        ))}
      </div>

      <ol className={styles.list} style={{ height: `calc(${TASKS.length} * var(--row-step))` }} aria-label="Illustrative task priorities">
        {TASKS.map((task, index) => {
          const position = done ? task.rank : index;
          const priority = done ? task.after : task.before;
          const scanned = scanIndex >= index;
          const changed = done && task.after !== task.before;
          return (
            <li
              key={task.id}
              className={styles.row}
              data-scanning={phase === "scanning" && scanIndex === index ? "true" : undefined}
              style={{ transform: `translateY(calc(${position} * var(--row-step)))` }}
            >
              <span className={styles.pill} data-priority={priority} data-changed={changed ? "true" : undefined}>
                P{priority}
              </span>
              <div className={styles.rowBody}>
                <strong>{task.title}</strong>
                <span className={styles.meta}>
                  <span data-unlinked={task.link === "No strategic link" ? "true" : undefined}>{task.link}</span>
                  {task.due ? <span className={styles.due}>{task.due}</span> : null}
                </span>
                <span className={styles.why} data-visible={done ? "true" : undefined}>{task.why}</span>
              </div>
              <div className={styles.factors} data-visible={scanned ? "true" : undefined} aria-hidden="true">
                {PRIORITY_SIGNALS.map(([key]) => (
                  <span key={key} data-signal={key}>
                    <i style={{ height: `${25 + task.factors[key] * 25}%`, opacity: task.factors[key] ? 1 : 0.25 }} />
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className={styles.footer}>
        <span className={styles.lock} aria-hidden="true" />
        Ari Bot changes one field — priority. Directions, objectives and links stay yours.
      </footer>
    </div>
  );
}
