"use client";

import { CURRENT_POSITION, DIRECTIONS, OBJECTIVES, TASKS, VECTORS } from "./syntheticWorkspace";
import { useInView } from "./useInView";
import styles from "./StrategyLayers.module.css";

const LAYERS = [
  {
    key: "vectors",
    title: "Vectors",
    role: "Context",
    body: "Eight dimensions of a life — physical to experiential — give every direction somewhere to point.",
    visual: VectorRadar
  },
  {
    key: "directions",
    title: "Directions",
    role: "Desired movement",
    body: "Say where you want to move. Several directions run in parallel, each touching the vectors it changes.",
    visual: DirectionStack
  },
  {
    key: "objectives",
    title: "Strategic Objectives",
    role: "Major required changes",
    body: "Name the few big changes each direction demands. No arbitrary caps, no ceremony.",
    visual: ObjectiveList
  },
  {
    key: "execution",
    title: "Projects & Tasks",
    role: "Concrete work",
    body: "Deliverables and next actions stay ordinary tasks — fast to capture, with a single 0–4 priority.",
    visual: TaskRows
  },
  {
    key: "signals",
    title: "Progress Signals",
    role: "Movement made legible",
    body: "Commits, publications and deadlines reveal whether the work is actually moving you.",
    visual: SignalSpark
  }
];

export default function StrategyLayers() {
  const [ref, inView] = useInView({ threshold: 0.2 });

  return (
    <ol className={`${styles.layers}${inView ? ` ${styles.visible}` : ""}`} ref={ref}>
      {LAYERS.map(({ key, title, role, body, visual: Visual }, index) => (
        <li key={key} className={styles.layer} style={{ "--index": index }}>
          <span className={styles.node} aria-hidden="true" />
          <div className={styles.copy}>
            <span className={styles.number}>{String(index + 1).padStart(2, "0")} · {role}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
          <div className={styles.visual} aria-hidden="true">
            <Visual />
          </div>
        </li>
      ))}
    </ol>
  );
}

function VectorRadar() {
  const size = 150;
  const center = size / 2;
  const radius = 58;
  const point = (index, value) => {
    const angle = (Math.PI * 2 * index) / VECTORS.length - Math.PI / 2;
    return [center + Math.cos(angle) * radius * value, center + Math.sin(angle) * radius * value];
  };
  const ring = (value) => VECTORS.map((_, index) => point(index, value).join(",")).join(" ");
  const shape = CURRENT_POSITION.map((item, index) => point(index, (item.score ?? 30) / 100).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={styles.radar}>
      {[0.33, 0.66, 1].map((value) => (
        <polygon key={value} points={ring(value)} className={styles.radarRing} />
      ))}
      {VECTORS.map((vector, index) => {
        const [x, y] = point(index, 1);
        return <line key={vector} x1={center} y1={center} x2={x} y2={y} className={styles.radarAxis} />;
      })}
      <polygon points={shape} className={styles.radarShape} />
      {CURRENT_POSITION.map((item, index) => {
        const [x, y] = point(index, (item.score ?? 30) / 100);
        return <circle key={item.vector} cx={x} cy={y} r="2.4" className={styles.radarDot} />;
      })}
    </svg>
  );
}

function DirectionStack() {
  return (
    <div className={styles.directionStack}>
      {DIRECTIONS.map((direction, index) => (
        <div key={direction.id}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{direction.title}</strong>
        </div>
      ))}
    </div>
  );
}

function ObjectiveList() {
  return (
    <ul className={styles.objectiveList}>
      {OBJECTIVES.slice(0, 4).map((objective) => (
        <li key={objective.id}>{objective.title}</li>
      ))}
    </ul>
  );
}

function TaskRows() {
  return (
    <div className={styles.taskRows}>
      {TASKS.slice(0, 4).map((task) => (
        <div key={task.id} data-priority={task.priority}>
          <i />
          <span>{task.title}</span>
          <b>P{task.priority}</b>
        </div>
      ))}
    </div>
  );
}

function SignalSpark() {
  const values = [3, 5, 4, 7, 6, 9, 8, 11, 7, 12, 10, 14];
  const max = 14;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 150},${56 - (value / max) * 48}`).join(" ");
  return (
    <div className={styles.signalSpark}>
      <svg viewBox="0 0 150 60" preserveAspectRatio="none">
        <polyline points={`0,60 ${points} 150,60`} className={styles.sparkArea} />
        <polyline points={points} className={styles.sparkLine} />
      </svg>
      <div className={styles.signalRow} data-level="ok"><i />ml-evals · 12m ago</div>
      <div className={styles.signalRow} data-level="warning"><i />portfolio-site · 9d quiet</div>
    </div>
  );
}
