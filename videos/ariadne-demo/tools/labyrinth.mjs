// Ported from components/public-site/LabyrinthThread.jsx — same maze, emitted as static SVG paths.
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



// Analytic samples along the thread (lines + origin-centred arcs), equal arc-length
// spacing, so the head dot can follow the stroke with plain GSAP keyframes.
export function threadSamples(count = 160) {
  const segs = [];
  const outerRadius = RADII[RING_COUNT - 1];
  let angle = PASSAGES[RING_COUNT - 1];
  let cur = polar(outerRadius + 26, angle);
  const line = (to) => { segs.push({ t: "l", a: cur, b: to, len: Math.hypot(to[0] - cur[0], to[1] - cur[1]) }); cur = to; };
  for (let corridor = 0; corridor < RING_COUNT - 1; corridor += 1) {
    const outerIndex = RING_COUNT - 1 - corridor;
    const middle = RADII[outerIndex] - RING_STEP / 2;
    const sweep = travel(angle, PASSAGES[outerIndex - 1], CORRIDOR_TURNS[corridor]);
    line(polar(middle, angle));
    segs.push({ t: "a", r: middle, a0: angle, sw: sweep, len: (Math.abs(sweep) * Math.PI * middle) / 180 });
    cur = polar(middle, angle + sweep);
    angle = normalize(angle + sweep);
  }
  line(polar(18, PASSAGES[0]));
  const total = segs.reduce((s, x) => s + x.len, 0);
  const pts = [];
  for (let i = 0; i <= count; i += 1) {
    let d = (total * i) / count;
    for (const s of segs) {
      if (d <= s.len || s === segs[segs.length - 1]) {
        const f = s.len ? Math.min(1, d / s.len) : 0;
        pts.push(s.t === "l" ? [round(s.a[0] + (s.b[0] - s.a[0]) * f), round(s.a[1] + (s.b[1] - s.a[1]) * f)] : polar(s.r, s.a0 + s.sw * f));
        break;
      }
      d -= s.len;
    }
  }
  return { total: round(total), pts };
}
console.log(JSON.stringify({ radii: RADII, ...buildGeometry(), samples: threadSamples(160) }));
