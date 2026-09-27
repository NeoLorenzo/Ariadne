"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DIRECTIONS, OBJECTIVES, TASKS } from "./syntheticWorkspace";
import { prefersReducedMotion, useInView, useMediaQuery } from "./useInView";
import styles from "./StrategyExplorer.module.css";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const NODES = {
  ...Object.fromEntries(DIRECTIONS.map((item) => [item.id, { ...item, kind: "direction", parent: null }])),
  ...Object.fromEntries(OBJECTIVES.map((item) => [item.id, { ...item, kind: "objective", parent: item.direction }])),
  ...Object.fromEntries(TASKS.map((item) => [item.id, { ...item, kind: "task", parent: item.objective }]))
};

const LINKS = [
  ...OBJECTIVES.map((objective) => [objective.direction, objective.id]),
  ...TASKS.map((task) => [task.objective, task.id])
];

const AUTOPLAY = ["d1", "t6", "o3", "t2", "d2", "t7"];

function lineage(id) {
  if (!id) return new Set();
  const related = new Set([id]);
  let cursor = NODES[id]?.parent;
  while (cursor) {
    related.add(cursor);
    cursor = NODES[cursor]?.parent;
  }
  const queue = [id];
  while (queue.length) {
    const current = queue.shift();
    Object.values(NODES).forEach((node) => {
      if (node.parent === current && !related.has(node.id)) {
        related.add(node.id);
        queue.push(node.id);
      }
    });
  }
  return related;
}

function chain(id) {
  const items = [];
  let cursor = id;
  while (cursor) {
    items.unshift(NODES[cursor]);
    cursor = NODES[cursor]?.parent;
  }
  return items;
}

function describeDescendants(related, selected) {
  let objectives = 0;
  let tasks = 0;
  related.forEach((id) => {
    if (id === selected) return;
    if (NODES[id].kind === "objective" && NODES[id].parent === selected) objectives += 1;
    if (NODES[id].kind === "task" && (NODES[id].parent === selected || NODES[NODES[id].parent]?.parent === selected)) tasks += 1;
  });
  const parts = [];
  if (objectives) parts.push(`${objectives} objective${objectives === 1 ? "" : "s"}`);
  parts.push(`${tasks} task${tasks === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export default function StrategyExplorer() {
  const containerRef = useRef(null);
  const nodeRefs = useRef({});
  const [paths, setPaths] = useState([]);
  const [selected, setSelected] = useState("d1");
  const [interacted, setInteracted] = useState(false);
  const [viewRef, inView] = useInView({ threshold: 0.3 });
  const narrow = useMediaQuery("(max-width: 900px)");

  const related = useMemo(() => lineage(selected), [selected]);
  const selectedChain = useMemo(() => chain(selected), [selected]);
  const selectedNode = NODES[selected];
  const rootDirection = selectedChain[0];

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const next = LINKS.map(([from, to]) => {
      const a = nodeRefs.current[from]?.getBoundingClientRect();
      const b = nodeRefs.current[to]?.getBoundingClientRect();
      if (!a || !b) return null;
      const x1 = a.right - bounds.left;
      const y1 = a.top + a.height / 2 - bounds.top;
      const x2 = b.left - bounds.left;
      const y2 = b.top + b.height / 2 - bounds.top;
      const bend = Math.max((x2 - x1) * 0.5, 24);
      return {
        key: `${from}-${to}`,
        from,
        to,
        d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
      };
    }).filter(Boolean);
    setPaths(next);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (narrow) return undefined;
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => observer.disconnect();
  }, [measure, narrow]);

  useEffect(() => {
    if (!inView || interacted || prefersReducedMotion()) return undefined;
    let index = 0;
    const timer = setInterval(() => {
      index = (index + 1) % AUTOPLAY.length;
      setSelected(AUTOPLAY[index]);
    }, 3200);
    return () => clearInterval(timer);
  }, [inView, interacted]);

  const choose = (id) => {
    setInteracted(true);
    setSelected(id);
  };

  const renderNode = (node) => {
    const state = related.has(node.id) ? (node.id === selected ? "selected" : "related") : "muted";
    return (
      <button
        key={node.id}
        type="button"
        ref={(element) => { nodeRefs.current[node.id] = element; }}
        className={styles.node}
        data-kind={node.kind}
        data-state={state}
        aria-pressed={node.id === selected}
        onClick={() => choose(node.id)}
        onMouseEnter={() => choose(node.id)}
        onFocus={() => choose(node.id)}
      >
        {node.kind === "task" ? <i className={styles.taskCheck} aria-hidden="true" /> : null}
        <span className={styles.nodeTitle}>{node.title}</span>
        {node.kind === "direction" ? (
          <span className={styles.nodePills}>
            {node.vectors.map((vector) => <em key={vector}>{vector}</em>)}
          </span>
        ) : null}
        {node.kind === "task" ? <b className={styles.priority} data-priority={node.priority}>P{node.priority}</b> : null}
      </button>
    );
  };

  return (
    <div className={styles.explorer} ref={viewRef}>
      <div className={styles.graph} ref={containerRef}>
        {!narrow ? (
          <svg className={styles.links} aria-hidden="true">
            {paths.map((path) => {
              const active = related.has(path.from) && related.has(path.to);
              return (
                <path
                  key={path.key}
                  d={path.d}
                  className={active ? styles.linkActive : styles.link}
                  pathLength="1"
                />
              );
            })}
          </svg>
        ) : null}

        <div className={styles.column}>
          <span className={styles.columnLabel}>Directions</span>
          {DIRECTIONS.map((direction) => renderNode(NODES[direction.id]))}
        </div>
        <div className={styles.column}>
          <span className={styles.columnLabel}>Strategic objectives</span>
          {OBJECTIVES.map((objective) => renderNode(NODES[objective.id]))}
        </div>
        <div className={styles.column}>
          <span className={styles.columnLabel}>Tasks</span>
          {TASKS.map((task) => renderNode(NODES[task.id]))}
        </div>
      </div>

      <div className={styles.trace} aria-live="polite">
        <span className={styles.traceLabel}>{selectedNode.kind === "direction" ? "What it drives" : "Why it matters"}</span>
        <div className={styles.traceChain}>
          {[...selectedChain].reverse().map((node, index) => (
            <span key={node.id} className={styles.traceStep}>
              {index > 0 ? <span className={styles.traceArrow} aria-hidden="true">→</span> : null}
              <span data-kind={node.kind}>{node.title}</span>
            </span>
          ))}
          <span className={styles.traceStep}>
            <span className={styles.traceArrow} aria-hidden="true">→</span>
            <span className={styles.traceVectors}>{rootDirection.vectors.join(" · ")}</span>
          </span>
          {selectedNode.kind !== "task" ? (
            <span className={styles.traceCount}>{describeDescendants(related, selected)}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
