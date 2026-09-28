// Builds compositions/frames/02-thread.html from tools/f2-template.html:
// labyrinth geometry (ported from components/public-site/LabyrinthThread.jsx), a swoop
// from the maze centre into the Ariadne mark, and the mark's hand-traced centreline.
import { readFileSync, writeFileSync } from "node:fs";
import { MARK_PTS, smoothPath, smoothSamples } from "./mark-centerline.mjs";

const g = JSON.parse(readFileSync("tools/labyrinth.json", "utf8"));
const brand = JSON.parse(readFileSync("tools/brand-paths.json", "utf8"));
const walls = readFileSync("tools/f2-walls.html", "utf8").trimEnd().replaceAll('pathLength="1"', 'pathLength="1000"');

// Mark placement inside the maze svg: 170px wide at the centre (1px = 0.56 svg units).
const MS = +(170 * 0.56 / 100).toFixed(4);
const MOFF = +(-50 * MS).toFixed(3);
const toSvg = ([x, y]) => [+(x * MS + MOFF).toFixed(2), +(y * MS + MOFF).toFixed(2)];

// Swoop: maze exit → under the centre → up into the mark's first stroke (matching tangent).
const E = g.samples.pts[g.samples.pts.length - 1];
const P = g.samples.pts[g.samples.pts.length - 2];
const S = toSvg(MARK_PTS[0]);
const d0 = [E[0] - P[0], E[1] - P[1]], n0 = Math.hypot(...d0);
const t1 = toSvg(MARK_PTS[1]), d1 = [t1[0] - S[0], t1[1] - S[1]], n1 = Math.hypot(...d1);
const c1 = [E[0] + (d0[0] / n0) * 26, E[1] + (d0[1] / n0) * 26];
const c2 = [S[0] - (d1[0] / n1) * 30, S[1] - (d1[1] / n1) * 30];
const cub = (t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * E[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * S[k]); };
const dense = Array.from({ length: 201 }, (_, i) => cub(i / 200));
let clen = 0; const cum = [0];
for (let i = 1; i < dense.length; i += 1) { clen += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]); cum.push(clen); }
const spacing = g.samples.total / (g.samples.pts.length - 1);
const nc = Math.max(2, Math.round(clen / spacing));
const conn = [];
for (let i = 1; i <= nc; i += 1) {
  const target = (clen * i) / nc; let j = 0;
  while (j < cum.length - 2 && cum[j + 1] < target) j += 1;
  const f = (target - cum[j]) / (cum[j + 1] - cum[j]);
  conn.push([+(dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f).toFixed(2), +(dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f).toFixed(2)]);
}
const threadD = `${g.thread} C ${c1.map((v) => v.toFixed(2)).join(" ")}, ${c2.map((v) => v.toFixed(2)).join(" ")}, ${S.join(" ")}`;
const A = { len: Math.ceil(g.samples.total + clen + 2), pts: g.samples.pts.concat(conn) };

const markLine = smoothPath(MARK_PTS);
const bs = smoothSamples(MARK_PTS, 60);
const B = { len: Math.ceil(bs.total + 1), pts: bs.pts.map(toSvg) };

const out = readFileSync("tools/f2-template.html", "utf8")
  .replace("/*WALLS*/", walls)
  .replaceAll("/*THREAD*/", threadD)
  .replace("/*MARK*/", brand.mark)
  .replaceAll("/*MARKLINE*/", markLine)
  .replaceAll("/*MARKOFF*/", String(MOFF))
  .replaceAll("/*MARKSCALE*/", String(MS))
  .replace("/*A*/", JSON.stringify(A))
  .replace("/*B*/", JSON.stringify(B));
writeFileSync("compositions/frames/02-thread.html", out);
console.log("wrote 02-thread.html", { A: A.len, Apts: A.pts.length, B: B.len, conn: +clen.toFixed(1), MS, MOFF });
