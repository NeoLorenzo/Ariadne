"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Minus, X } from "lucide-react";
import { prefersReducedMotion, useInView } from "./useInView";
import styles from "./OpportunityDemo.module.css";

const THRESHOLD = 75;

const FUNNEL = [
  { label: "Discovered", note: "Feeds and manual captures land in the Candidate Inbox", value: 214 },
  { label: "Reviewed", note: "Requirements extracted and checked against your evidence", value: 61 },
  { label: "Promoted", note: "Only explicit review writes to the Landscape", value: 18 },
  { label: "Applied", note: "Applications stay linked to their opportunity", value: 4 }
];

const TYPES = ["All", "Fellowship", "Job", "Master's", "Course", "Program"];

const OPPORTUNITIES = [
  {
    id: "o1", title: "Frontier Safety Fellowship", org: "Northlight Institute", type: "Fellowship",
    value: 88, attainability: 79, eligibility: 4, closes: "Closes in 3 days",
    requirements: [["Research writing sample", "met"], ["ML publication or preprint", "met"], ["Two references", "unknown"]]
  },
  {
    id: "o2", title: "Research Engineer, Evaluations", org: "Meridian Labs", type: "Job",
    value: 82, attainability: 77, eligibility: 3, closes: "Rolling",
    requirements: [["Python and PyTorch", "met"], ["Evaluation tooling experience", "met"], ["3+ years industry", "not_met"]]
  },
  {
    id: "o3", title: "Summer Research Internship", org: "Arcadia Research", type: "Program",
    value: 77, attainability: 87, eligibility: 4, closes: "Closes in 5 weeks",
    requirements: [["Enrolled or recent graduate", "met"], ["Research proposal", "unknown"]]
  },
  {
    id: "o4", title: "MSc Machine Learning", org: "Halden University", type: "Master's",
    value: 92, attainability: 58, eligibility: 3, closes: "Closes in 9 weeks",
    requirements: [["First-class degree", "not_met"], ["Mathematics coursework", "met"], ["Statement of purpose", "unknown"]]
  },
  {
    id: "o5", title: "AI Safety PhD Scholarship", org: "Halden University", type: "Program",
    value: 96, attainability: 36, eligibility: 2, closes: "Next cycle",
    requirements: [["Master's degree", "not_met"], ["Publication record", "not_met"], ["Research proposal", "unknown"]]
  },
  {
    id: "o6", title: "Staff Research Scientist", org: "Meridian Labs", type: "Job",
    value: 90, attainability: 21, eligibility: 1, closes: "Rolling",
    requirements: [["PhD in a relevant field", "not_met"], ["Led research programmes", "not_met"]]
  },
  {
    id: "o7", title: "Technology Policy Fellowship", org: "Open Systems Foundation", type: "Fellowship",
    value: 80, attainability: 64, eligibility: 3, closes: "Closes in 6 weeks",
    requirements: [["Policy writing sample", "met"], ["Two years' experience", "not_met"]]
  },
  { id: "o8", title: "Mechanistic Interpretability", org: "Online", type: "Course", value: 57, attainability: 95, eligibility: 4, closes: "Self-paced" },
  { id: "o9", title: "Data Analyst", org: "Brightwater", type: "Job", value: 36, attainability: 89, eligibility: 4, closes: "Closes in 2 weeks" },
  { id: "o10", title: "Writing Residency", org: "Kestrel House", type: "Program", value: 64, attainability: 82, eligibility: 4, closes: "Closes in 4 weeks" },
  { id: "o11", title: "Technical Writer", org: "Lumen Docs", type: "Job", value: 47, attainability: 78, eligibility: 4, closes: "Rolling" },
  { id: "o12", title: "Quant Trader", org: "Harbor Capital", type: "Job", value: 41, attainability: 29, eligibility: 2, closes: "Rolling" },
  { id: "o13", title: "Product Manager, Growth", org: "Parcel", type: "Job", value: 29, attainability: 54, eligibility: 3, closes: "Rolling" },
  { id: "o14", title: "Climate Tools Hackathon", org: "Open Systems Foundation", type: "Program", value: 63, attainability: 69, eligibility: 4, closes: "In 3 weeks" },
  { id: "o15", title: "Consulting Analyst", org: "Grey & Rowe", type: "Job", value: 24, attainability: 63, eligibility: 3, closes: "Rolling" },
  { id: "o16", title: "MBA Early Admission", org: "Halden University", type: "Master's", value: 49, attainability: 23, eligibility: 1, closes: "Next cycle" },
  { id: "o17", title: "Sales Engineer", org: "Parcel", type: "Job", value: 16, attainability: 45, eligibility: 3, closes: "Rolling" },
  { id: "o18", title: "Systems Programming in Rust", org: "Online", type: "Course", value: 34, attainability: 72, eligibility: 4, closes: "Self-paced" }
];

const MULTIPLIER = { 0: 0, 1: 0.4, 2: 0.7, 3: 0.9, 4: 1 };

function quadrant(item) {
  if (item.value >= THRESHOLD && item.attainability >= THRESHOLD) return "prime";
  if (item.value >= THRESHOLD) return "build";
  if (item.attainability >= THRESHOLD) return "accessible";
  return "background";
}

const QUADRANT_LABELS = {
  prime: "Prime opportunity",
  build: "Build toward",
  accessible: "Accessible · lower value",
  background: "Background"
};

export default function OpportunityDemo() {
  const [ref, inView] = useInView({ threshold: 0.25 });
  const [type, setType] = useState("All");
  const [selectedId, setSelectedId] = useState("o1");
  const [counts, setCounts] = useState(FUNNEL.map(() => 0));

  useEffect(() => {
    if (!inView) return undefined;
    if (prefersReducedMotion()) {
      setCounts(FUNNEL.map((step) => step.value));
      return undefined;
    }
    let frame = 0;
    let start = 0;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / 1400, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounts(FUNNEL.map((item) => Math.round(item.value * eased)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [inView]);

  const selected = useMemo(
    () => OPPORTUNITIES.find((item) => item.id === selectedId) || OPPORTUNITIES[0],
    [selectedId]
  );
  const primeCount = OPPORTUNITIES.filter((item) => quadrant(item) === "prime" && (type === "All" || item.type === type)).length;

  return (
    <div className={`${styles.layout}${inView ? ` ${styles.visible}` : ""}`} ref={ref}>
      <ol className={styles.funnel} aria-label="Illustrative opportunity review pipeline">
        {FUNNEL.map((step, index) => (
          <li key={step.label} style={{ "--index": index }}>
            <div className={styles.funnelTop}>
              <span>{step.label}</span>
              <strong>{counts[index]}</strong>
            </div>
            <div className={styles.funnelBar}>
              <span style={{ width: `${Math.max((step.value / FUNNEL[0].value) * 100, 3)}%` }} />
            </div>
            <p>{step.note}</p>
          </li>
        ))}
      </ol>

      <div className={styles.mapCard}>
        <div className={styles.mapHeader}>
          <div>
            <strong>Opportunity map</strong>
            <span>{primeCount} prime · {OPPORTUNITIES.length} in Landscape</span>
          </div>
          <div className={styles.filters} role="group" aria-label="Filter by opportunity type">
            {TYPES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={type === item}
                onClick={() => {
                  setType(item);
                  if (item !== "All") {
                    const nextSelection = OPPORTUNITIES.find((opportunity) => opportunity.type === item);
                    if (nextSelection) setSelectedId(nextSelection.id);
                  }
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.plotWrap}>
          <span className={styles.axisY}>Attainability</span>
          <div className={styles.plot}>
            <span className={styles.thresholdX} style={{ left: `${THRESHOLD}%` }} aria-hidden="true" />
            <span className={styles.thresholdY} style={{ bottom: `${THRESHOLD}%` }} aria-hidden="true" />
            <span className={styles.primeZone} aria-hidden="true" />
            <span className={`${styles.quadrantLabel} ${styles.qAccessible}`} aria-hidden="true">Accessible / lower value</span>
            <span className={`${styles.quadrantLabel} ${styles.qPrime}`} aria-hidden="true">Prime opportunities</span>
            <span className={`${styles.quadrantLabel} ${styles.qBackground}`} aria-hidden="true">Background</span>
            <span className={`${styles.quadrantLabel} ${styles.qBuild}`} aria-hidden="true">Build toward</span>

            {OPPORTUNITIES.map((item, index) => {
              const dimmed = type !== "All" && item.type !== type;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.point}
                  data-quadrant={quadrant(item)}
                  data-selected={item.id === selectedId ? "true" : undefined}
                  data-dimmed={dimmed ? "true" : undefined}
                  style={{ left: `${item.value}%`, bottom: `${item.attainability}%`, "--delay": `${index * 45}ms` }}
                  aria-label={`${item.title}, ${item.org}. Strategic value ${item.value}, attainability ${item.attainability}`}
                  aria-pressed={item.id === selectedId}
                  tabIndex={dimmed ? -1 : 0}
                  disabled={dimmed}
                  onClick={() => { if (!dimmed) setSelectedId(item.id); }}
                  onMouseEnter={() => { if (!dimmed) setSelectedId(item.id); }}
                  onFocus={() => { if (!dimmed) setSelectedId(item.id); }}
                />
              );
            })}
          </div>
          <span className={styles.axisX}>Strategic value</span>
        </div>
      </div>

      <aside className={styles.detail} aria-live="polite" key={selected.id}>
        <span className={styles.detailQuadrant} data-quadrant={quadrant(selected)}>{QUADRANT_LABELS[quadrant(selected)]}</span>
        <h3>{selected.title}</h3>
        <p className={styles.detailOrg}>{selected.org} · {selected.type} · {selected.closes}</p>

        <div className={styles.scores}>
          <div>
            <strong>{selected.value}</strong>
            <span>Strategic value</span>
            <i><b style={{ width: `${selected.value}%` }} /></i>
          </div>
          <div>
            <strong>{selected.attainability}</strong>
            <span>Attainability</span>
            <i><b style={{ width: `${selected.attainability}%` }} /></i>
          </div>
        </div>

        <p className={styles.eligibility}>
          Eligibility {selected.eligibility}/4 × {MULTIPLIER[selected.eligibility]} multiplier
        </p>

        <div className={styles.requirements}>
          <span>Requirements</span>
          {selected.requirements ? selected.requirements.map(([label, state]) => (
            <div key={label} data-state={state}>
              {state === "met" ? <Check size={13} /> : state === "not_met" ? <X size={13} /> : <Minus size={13} />}
              {label}
            </div>
          )) : <p>Open requirements · none blocking</p>}
        </div>
      </aside>
    </div>
  );
}
