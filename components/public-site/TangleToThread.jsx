"use client";

import { useEffect, useMemo, useState } from "react";
import { DIRECTIONS } from "./syntheticWorkspace";
import { useInView, useMediaQuery } from "./useInView";
import styles from "./TangleToThread.module.css";

// Scattered positions are hand-placed so the "before" state reads as noise,
// not as a hidden grid.
const CHIPS = [
  { id: "c1", title: "Draft methods section", direction: 0, scatter: [6, 12, -7] },
  { id: "c2", title: "Answer 43 unread emails", direction: -1, scatter: [58, 6, 5] },
  { id: "c3", title: "Outline the October essay", direction: 1, scatter: [34, 34, -3] },
  { id: "c4", title: "Long run — 18 km", direction: 2, scatter: [70, 44, 8] },
  { id: "c5", title: "Apply: Frontier Safety Fellowship", direction: 0, scatter: [12, 60, 4] },
  { id: "c6", title: "Reorganise bookmarks", direction: -1, scatter: [44, 74, -6] },
  { id: "c7", title: "Add newsletter signup", direction: 1, scatter: [66, 20, -10] },
  { id: "c8", title: "Book a physio assessment", direction: 2, scatter: [4, 84, -4] },
  { id: "c9", title: "Replicate eval baseline", direction: 0, scatter: [40, 52, 9] },
  { id: "c10", title: "Reply to comments", direction: 1, scatter: [62, 84, 3] }
];

const ROW = 52;
const HEADER = 92;

export default function TangleToThread() {
  const [ref, inView] = useInView({ threshold: 0.4 });
  const [threaded, setThreaded] = useState(false);
  const [touched, setTouched] = useState(false);
  const narrow = useMediaQuery("(max-width: 900px)");

  useEffect(() => {
    if (!inView || touched) return undefined;
    const timer = setTimeout(() => setThreaded(true), 900);
    return () => clearTimeout(timer);
  }, [inView, touched]);

  const layout = useMemo(() => computeLayout(narrow), [narrow]);

  return (
    <div className={styles.wrapper} ref={ref}>
      <div className={styles.toggle} role="group" aria-label="Compare work with and without Ariadne">
        <button
          type="button"
          aria-pressed={!threaded}
          onClick={() => { setTouched(true); setThreaded(false); }}
        >
          A to-do list
        </button>
        <button
          type="button"
          aria-pressed={threaded}
          onClick={() => { setTouched(true); setThreaded(true); }}
        >
          With Ariadne
        </button>
        <span className={styles.toggleThumb} data-on={threaded ? "right" : "left"} aria-hidden="true" />
      </div>

      <div
        className={`${styles.stage}${threaded ? ` ${styles.threaded}` : ""}`}
        style={{ height: layout.height }}
        aria-label={threaded
          ? "Tasks grouped under the directions they advance, with unlinked work set aside"
          : "An undifferentiated pile of tasks"}
        role="img"
      >
        {layout.columns.map((column) => (
          <div
            key={column.key}
            className={`${styles.column}${column.unlinked ? ` ${styles.unlinkedColumn}` : ""}`}
            style={{ left: column.left, top: column.top, width: column.width, height: column.height }}
            aria-hidden="true"
          >
            <span className={styles.columnKicker}>{column.kicker}</span>
            <strong>{column.title}</strong>
            {!column.unlinked ? <span className={styles.columnThread} /> : null}
          </div>
        ))}

        {CHIPS.map((chip, index) => {
          const position = threaded ? layout.positions[chip.id] : scatterPosition(chip, narrow);
          return (
            <span
              key={chip.id}
              aria-hidden="true"
              className={`${styles.chip}${chip.direction < 0 ? ` ${styles.chipUnlinked}` : ""}`}
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
                transform: `rotate(${position.rotate}deg)`,
                transitionDelay: `${threaded ? index * 45 : (CHIPS.length - index) * 30}ms`
              }}
            >
              <i className={styles.chipDot} />
              {chip.title}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function scatterPosition(chip, narrow) {
  const [x, y, rotate] = chip.scatter;
  return {
    left: narrow ? `${Math.min(x, 44)}%` : `${x}%`,
    top: `calc(${y}% * 0.86)`,
    width: narrow ? "54%" : "29%",
    rotate
  };
}

function computeLayout(narrow) {
  const groups = [
    ...DIRECTIONS.map((direction, index) => ({
      key: direction.id,
      kicker: `Direction ${String(index + 1).padStart(2, "0")}`,
      title: direction.title,
      chips: CHIPS.filter((chip) => chip.direction === index)
    })),
    {
      key: "unlinked",
      kicker: "No thread",
      title: "Worth questioning",
      unlinked: true,
      chips: CHIPS.filter((chip) => chip.direction < 0)
    }
  ];

  const positions = {};
  const columns = [];

  if (!narrow) {
    const gap = 1.6;
    const width = (100 - gap * 3) / 4;
    let tallest = 0;
    groups.forEach((group, groupIndex) => {
      const left = groupIndex * (width + gap);
      const height = HEADER + group.chips.length * ROW + 16;
      tallest = Math.max(tallest, height);
      columns.push({ ...group, left: `${left}%`, top: 0, width: `${width}%`, height });
      group.chips.forEach((chip, chipIndex) => {
        positions[chip.id] = {
          left: `calc(${left}% + 14px)`,
          top: HEADER + chipIndex * ROW,
          width: `calc(${width}% - 28px)`,
          rotate: 0
        };
      });
    });
    return { columns, positions, height: Math.max(tallest, 330) };
  }

  let cursor = 0;
  groups.forEach((group) => {
    const height = HEADER + group.chips.length * ROW + 8;
    columns.push({ ...group, left: "0%", top: cursor, width: "100%", height });
    group.chips.forEach((chip, chipIndex) => {
      positions[chip.id] = {
        left: "14px",
        top: cursor + HEADER + chipIndex * ROW,
        width: "calc(100% - 28px)",
        rotate: 0
      };
    });
    cursor += height + 12;
  });
  return { columns, positions, height: cursor };
}
