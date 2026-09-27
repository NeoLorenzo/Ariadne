"use client";

import { useEffect, useId, useRef, useState } from "react";
import { prefersReducedMotion } from "./useInView";
import styles from "./LabyrinthThread.module.css";

// Eight concentric walls — one for each canonical vector — with a single
// continuous thread that finds its way from the outside to the centre.
const RING_COUNT = 8;
const INNER_RADIUS = 44;
const RING_STEP = 28;
const RADII = Array.from({ length: RING_COUNT }, (_, index) => INNER_RADIUS + index * RING_STEP);
const GAP_WIDTH = 17;

// Passage angle through each wall (0° is north, clockwise), innermost first.
const PASSAGES = [60, 300, 160, 20, 250, 90, 320, 200];
// Direction travelled around each corridor, outermost corridor first.
const CORRIDOR_TURNS = [1, 1, -1, 1, 1, -1, 1];
const DECOY_OFFSETS = [0, 137, 212, 96, 171, 233, 118, 151];

function polar(radius, degrees) {
  const radians = (degrees * Math.PI) / 180;
  return [round(radius * Math.sin(radians)), round(-radius * Math.cos(radians))];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function normalize(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function arcPath(radius, fromDegrees, sweepDegrees) {
  const [x1, y1] = polar(radius, fromDegrees);
  const [x2, y2] = polar(radius, fromDegrees + sweepDegrees);
  const large = Math.abs(sweepDegrees) > 180 ? 1 : 0;
  const sweep = sweepDegrees > 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} ${sweep} ${x2} ${y2}`;
}

function travel(from, to, direction) {
  const delta = normalize(direction > 0 ? to - from : from - to);
  return direction > 0 ? delta : -delta;
}

function buildGeometry() {
  const walls = [];
  const radialWalls = [];

  RADII.forEach((radius, ringIndex) => {
    const gapHalf = ((GAP_WIDTH / radius) * 180) / Math.PI / 2;
    const gaps = [PASSAGES[ringIndex]];
    if (ringIndex > 0) gaps.push(normalize(PASSAGES[ringIndex] + DECOY_OFFSETS[ringIndex]));
    gaps.sort((a, b) => a - b);

    gaps.forEach((gap, gapIndex) => {
      const next = gaps[(gapIndex + 1) % gaps.length];
      const start = gap + gapHalf;
      let end = next - gapHalf;
      if (end <= start) end += 360;
      walls.push({ key: `${ringIndex}-${gapIndex}`, d: arcPath(radius, start, end - start), ring: ringIndex });
    });
  });

  let d = "";
  const outerRadius = RADII[RING_COUNT - 1];
  const entry = PASSAGES[RING_COUNT - 1];
  const [sx, sy] = polar(outerRadius + 26, entry);
  d += `M ${sx} ${sy}`;
  let angle = entry;

  for (let corridor = 0; corridor < RING_COUNT - 1; corridor += 1) {
    const outerIndex = RING_COUNT - 1 - corridor;
    const middle = RADII[outerIndex] - RING_STEP / 2;
    const target = PASSAGES[outerIndex - 1];
    const direction = CORRIDOR_TURNS[corridor];
    const sweep = travel(angle, target, direction);
    const [mx, my] = polar(middle, angle);
    const [tx, ty] = polar(middle, angle + sweep);
    d += ` L ${mx} ${my} A ${middle} ${middle} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep > 0 ? 1 : 0} ${tx} ${ty}`;

    // Block the unused way around this corridor so the maze reads as solved.
    const remaining = 360 - Math.abs(sweep);
    [0.3, 0.7].forEach((fraction, index) => {
      const wallAngle = angle + sweep + Math.sign(sweep) * remaining * fraction;
      const [ax, ay] = polar(RADII[outerIndex - 1], wallAngle);
      const [bx, by] = polar(RADII[outerIndex], wallAngle);
      radialWalls.push({ key: `r-${corridor}-${index}`, d: `M ${ax} ${ay} L ${bx} ${by}` });
    });
    angle = normalize(angle + sweep);
  }

  const [ex, ey] = polar(18, PASSAGES[0]);
  d += ` L ${ex} ${ey}`;

  return { walls, radialWalls, thread: d };
}

const GEOMETRY = buildGeometry();
const DRAW_DURATION = 5200;

export default function LabyrinthThread({ start = true }) {
  const threadRef = useRef(null);
  const headRef = useRef(null);
  const [complete, setComplete] = useState(false);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const coreId = `labyrinth-core-${uid}`;
  const glowId = `labyrinth-glow-${uid}`;

  useEffect(() => {
    const path = threadRef.current;
    const head = headRef.current;
    if (!path || !head) return undefined;

    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    if (!start) return undefined;

    if (prefersReducedMotion()) {
      path.style.strokeDashoffset = "0";
      setComplete(true);
      return undefined;
    }

    let frame = 0;
    let startTime = 0;
    const delay = 500;
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = Math.max(0, timestamp - startTime - delay);
      const progress = Math.min(elapsed / DRAW_DURATION, 1);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const drawn = length * eased;
      path.style.strokeDashoffset = `${length - drawn}`;
      const point = path.getPointAtLength(drawn);
      head.setAttribute("transform", `translate(${round(point.x)} ${round(point.y)})`);
      head.style.opacity = progress > 0 && progress < 1 ? "1" : "0";
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setComplete(true);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [start]);

  return (
    <div
      className={`${styles.stage}${start ? ` ${styles.started}` : ""}${complete ? ` ${styles.complete}` : ""}`}
      aria-hidden="true"
    >
      <svg className={styles.svg} viewBox="-280 -280 560 560" role="presentation">
        <defs>
          <radialGradient id={coreId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(120)">
            <stop offset="0" stopColor="#0088ff" stopOpacity=".55" />
            <stop offset="1" stopColor="#0088ff" stopOpacity="0" />
          </radialGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <circle className={styles.core} r="120" fill={`url(#${coreId})`} />

        <g className={styles.walls}>
          {GEOMETRY.walls.map((wall) => (
            <path key={wall.key} d={wall.d} style={{ "--ring": wall.ring }} />
          ))}
          {GEOMETRY.radialWalls.map((wall) => (
            <path key={wall.key} d={wall.d} />
          ))}
        </g>

        <path className={styles.threadGlow} d={GEOMETRY.thread} filter={`url(#${glowId})`} />
        <path ref={threadRef} className={styles.thread} d={GEOMETRY.thread} />
        <path className={styles.pulse} d={GEOMETRY.thread} pathLength="1" />

        <g ref={headRef} className={styles.head} style={{ opacity: 0 }}>
          <circle r="11" className={styles.headHalo} />
          <circle r="3.5" className={styles.headDot} />
        </g>

        <g className={styles.mark}>
          <circle r="30" className={styles.markRing} />
          <image href="/brand/ariadne-mark.svg" x="-15" y="-15" width="30" height="30" />
        </g>
      </svg>
    </div>
  );
}
