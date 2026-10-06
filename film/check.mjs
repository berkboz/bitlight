#!/usr/bin/env node
// node film/check.mjs --film <name|path.mjs>   (or --all: every film in film/films)
// Checks the rules a machine can check on a film, renders three frames per
// shot, and writes out/<film>/contact.png. Exit 0 only when every check passes.
// Passing is necessary, not sufficient: open the contact sheet and look.
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadFilm, filmArg, composeFrame, toRGB, pillBox, fmt, RATE, MARGIN, BAND } from "./frame.mjs";
import * as T from "./type.mjs";

// --all: check every film in film/films, one process each, and fail if any fails
if (process.argv.includes("--all")) {
  const { execFileSync } = await import("node:child_process");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const names = fs.readdirSync(path.join(here, "films")).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).map((f) => f.slice(0, -4));
  let bad = 0;
  for (const n of names) {
    try { console.log(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--film", n], { encoding: "utf8" }).trim().split("\n").filter((l) => /^(PASS|.*shots ·)/.test(l)).join("  ")); }
    catch (e) { bad++; console.log(e.stdout); }
  }
  process.exit(bad ? 1 : 0);
}
const film = await loadFilm(filmArg());
const { W, H, VIEW: VIEW_H } = fmt(film);
const fails = [], notes = [];
const fail = (shot, rule, msg) => fails.push(`shot ${String(shot + 1).padStart(2, "0")} · ${rule}: ${msg}`);

// ---- structure and type ----
film.shots.forEach((s, k) => {
  if (typeof s.build !== "function") fail(k, "F0 Shape", "build(t) missing");
  if (s.ground !== 0 && s.ground !== 1) fail(k, "F0 Shape", "ground must be 0 (night) or 1 (paper)");
  if (Math.abs(s.dur * film.fps - Math.round(s.dur * film.fps)) > 1e-6) fail(k, "F1 Cut", `${s.dur}s is not a whole number of frames at ${film.fps} fps`);
  for (const str of [s.text, s.pill, ...(s.readouts || [])].filter(Boolean)) {
    const missing = [...new Set([...str].filter((c) => !T.glyphs.has(c)))];
    if (missing.length) fail(k, "F2 Glyphs", `no glyph for ${missing.map((c) => JSON.stringify(c)).join(" ")} (capitals, digits, . , ' - ? ! ° / : only)`);
  }
  const head = s.text ? T.width(s.text, BAND.headline.scale) : 0;
  if (MARGIN + head > W - MARGIN) fail(k, "F3 Fit", `headline is ${head} cells, band holds ${W - 2 * MARGIN}`);
  if (s.pill && MARGIN + head + 12 > pillBox(s, film).x) fail(k, "F3 Fit", "headline runs into the pill");
  const typed = s.text ? s.typeAt + s.text.length / RATE : 0;
  if (typed + 1.0 > s.dur) fail(k, "F4 Read", `last letter lands at ${typed.toFixed(2)}s; needs 1s on screen before the ${s.dur}s cut`);
  if (s.pill && s.pillAt + 0.8 > s.dur) fail(k, "F4 Read", "pill appears less than 0.8s before the cut");
});

// ---- pictures: three samples per shot ----
const GAP = 6, COLS = 3, sheetW = COLS * W + (COLS + 1) * GAP, sheetH = film.shots.length * (H + GAP) + GAP;
const sheet = new Uint8Array(sheetW * sheetH * 3).fill(128);
const ms = [];
for (let k = 0; k < film.shots.length; k++) {
  const s = film.shots[k], samples = [0.15, 0.55, 0.95].map((v) => Math.min(film.frames - 1, Math.round((film.starts[k] + s.dur * v) * film.fps)));
  const pics = [];
  samples.forEach((frame, c) => {
    const t0 = performance.now();
    const { bits, scene } = composeFrame(film, frame);
    const odd = scene.readout && [...new Set([...scene.readout].filter((c) => !T.glyphs.has(c)))];
    if (odd && odd.length) fail(k, "F2 Glyphs", `read-out "${scene.readout}" has no glyph for ${odd.map((c) => JSON.stringify(c)).join(" ")}`);
    ms.push(performance.now() - t0);
    pics.push(bits);
    const rgb = toRGB(bits, s.ground), ox = GAP + c * (W + GAP), oy = GAP + k * (H + GAP);
    for (let y = 0; y < H; y++) sheet.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), ((oy + y) * sheetW + ox) * 3);
  });
  const view = W * VIEW_H;
  for (const c of [1, 2]) {
    let lit = 0;
    for (let p = 0; p < view; p++) lit += pics[c][p];
    const frac = lit / view;
    if (frac < 0.02 || frac > 0.98) fail(k, "F5 Range", `picture is ${(frac * 100).toFixed(1)}% lit at sample ${c + 1} — a flat frame tells nothing`);
  }
  let moved = 0;
  for (let p = 0; p < view; p++) moved += pics[1][p] !== pics[2][p];
  if (moved / view < 0.003) fail(k, "F6 Motion", `only ${((moved / view) * 100).toFixed(2)}% of the picture changes — something must move in every shot`);
}

const out = film.out;
fs.mkdirSync(out, { recursive: true });
const png = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${sheetW}x${sheetH}`, "-i", "-", "-frames:v", "1", path.join(out, "contact.png")]);
png.stdin.end(Buffer.from(sheet.buffer));
await new Promise((r) => png.on("close", r));

const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
notes.push(`${film.shots.length} shots · ${film.duration}s · ${film.frames} frames · ~${avg.toFixed(0)}ms/frame on one core (~${((avg * film.frames) / 1000 / 4 / 60).toFixed(1)} min on 4)`);
console.log(`${film.title}: ${notes.join("")}`);
console.log(`contact sheet → ${path.relative(process.cwd(), path.join(out, "contact.png"))}`);
if (fails.length) { console.log("FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("PASS — now open the contact sheet and look.");
