// Hand-traced centreline of the Ariadne mark (100×100 space), in writing order:
// left leg → apex → right leg → bottom curl → back along the crossbar → loop → hook.
export const MARK_PTS = [
  [27, 53], [33, 39], [40, 23], [46, 10], [52, 4.5], [58, 9], [64, 21], [72, 38], [80, 55], [88, 71],
  [94, 83], [95, 91], [90, 96.5], [82, 95], [72, 87], [63, 76], [56, 67], [49, 61.5], [38, 60], [25, 60],
  [14, 60.5], [7, 65], [3.8, 73], [5, 81], [10, 85.5], [15.5, 84], [19, 77], [21.5, 69],
];
// Catmull-Rom through the points → cubic bézier path string (optionally transformed).
export function smoothPath(pts, tf = (p) => p) {
  const P = pts.map(tf);
  let d = `M ${P[0][0].toFixed(2)} ${P[0][1].toFixed(2)}`;
  for (let i = 0; i < P.length - 1; i += 1) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1.map((v) => v.toFixed(2)).join(" ")}, ${c2.map((v) => v.toFixed(2)).join(" ")}, ${p2.map((v) => v.toFixed(2)).join(" ")}`;
  }
  return d;
}
// Equal arc-length samples along the same Catmull-Rom curve (for a head dot to follow).
export function smoothSamples(pts, n, tf = (p) => p) {
  const P = pts.map(tf);
  const dense = [];
  for (let i = 0; i < P.length - 1; i += 1) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let j = 0; j < 60; j += 1) {
      const t = j / 60, u = 1 - t;
      dense.push([0, 1].map((k) => u * u * u * p1[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p2[k]));
    }
  }
  dense.push(P[P.length - 1]);
  const cum = [0];
  for (let i = 1; i < dense.length; i += 1) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let i = 0; i <= n; i += 1) {
    const target = (total * i) / n;
    while (j < cum.length - 2 && cum[j + 1] < target) j += 1;
    const f = (target - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    out.push([+(dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f).toFixed(2), +(dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f).toFixed(2)]);
  }
  return { total, pts: out };
}
