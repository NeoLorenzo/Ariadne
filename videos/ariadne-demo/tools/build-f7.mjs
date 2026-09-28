// Builds compositions/frames/07-close.html from tools/f7-template.html:
// one thread that weaves over/under five floating cards, then swoops into the centre
// and writes the Ariadne mark (hand-traced centreline, tools/mark-centerline.mjs).
import { readFileSync, writeFileSync } from "node:fs";
import { MARK_PTS, smoothPath, smoothSamples } from "./mark-centerline.mjs";

const brand = JSON.parse(readFileSync("tools/brand-paths.json", "utf8"));

// Mark: 190px at (865, 300) on screen → centre (960, 395).
const MS = 1.9, MX = 865, MY = 300;
const toScr = ([x, y]) => [+(MX + x * MS).toFixed(2), +(MY + y * MS).toFixed(2)];

// Cards: rest pose; over = the thread passes in front of it (else behind it).
const CARDS = [
  { x: 250, y: 250, r: -5, a: [470, 330], over: true }, // direction
  { x: 610, y: 640, r: 4, a: [820, 690], over: false }, // objective
  { x: 980, y: 230, r: -3, a: [1190, 300], over: true }, // task
  { x: 1420, y: 610, r: 5, a: [1540, 690], over: false }, // deadline
  { x: 1500, y: 150, r: -4, a: [1700, 232], over: true }, // vector
];
// Weave order, then back under the frame and up into the mark's first stroke.
const ORDER = [0, 1, 2, 4, 3];
const start = toScr(MARK_PTS[0]);
const WPTS = [[-140, 560], ...ORDER.map((i) => CARDS[i].a), [1180, 820], [960, 610], [898, 470], start];
const W = smoothSamples(WPTS, 150);
const wD = smoothPath(WPTS);
CARDS.forEach((c) => {
  let best = 0, bd = Infinity;
  W.pts.forEach((p, i) => { const d = Math.hypot(p[0] - c.a[0], p[1] - c.a[1]); if (d < bd) { bd = d; best = i; } });
  c.frac = +(best / (W.pts.length - 1)).toFixed(4);
});

const markLine = smoothPath(MARK_PTS);
const bs = smoothSamples(MARK_PTS, 60);
const B = { len: Math.ceil(bs.total + 1), pts: bs.pts.map(toScr) };

const out = readFileSync("tools/f7-template.html", "utf8")
  .replaceAll("/*W*/", wD)
  .replaceAll("/*B*/", markLine)
  .replace("/*MARK*/", brand.mark)
  .replace("/*MX*/", String(MX))
  .replace("/*MY*/", String(MY))
  .replace("/*MS*/", String(MS))
  .replace("/*MC*/", `${MX + 50 * MS} ${MY + 50 * MS}`)
  .replace("/*CARDS*/", JSON.stringify(CARDS))
  .replace("/*WDATA*/", JSON.stringify({ len: Math.ceil(W.total + 2), pts: W.pts }))
  .replace("/*BDATA*/", JSON.stringify(B));
writeFileSync("compositions/frames/07-close.html", out);
console.log("wrote 07-close.html", { W: Math.round(W.total), B: B.len, fracs: CARDS.map((c) => c.frac) });
