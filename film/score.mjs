#!/usr/bin/env node
// node film/score.mjs --film <name|path.mjs> → out/<film>/score.wav (44.1 kHz mono)
// A 1-bit score: every voice is a square wave. This file adds a tick for every
// typed character; the film's own score() adds everything else.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFilm, filmArg, RATE } from "./frame.mjs";

const film = await loadFilm(filmArg());
const SR = 44100, N = Math.ceil(film.duration * SR);
const mix = new Float32Array(N);

const sq = (f, t) => (((t * f) % 1) < 0.5 ? 1 : -1);
function voice(t0, t1, fn) {
  const a = Math.max(0, Math.floor(t0 * SR)), b = Math.min(N, Math.ceil(t1 * SR));
  for (let k = a; k < b; k++) mix[k] += fn(k / SR - t0, k / SR);
}
const blip = (at, f, len, amp) => voice(at, at + len, (u) => sq(f, u) * amp * Math.pow(1 - u / len, 2));
const shotEnd = (k) => film.starts[k] + film.shots[k].dur;

film.shots.forEach((s, k) => {
  [...s.text].forEach((ch, c) => { if (ch !== " ") blip(film.starts[k] + s.typeAt + c / RATE, 2400, 0.006, 0.1); });
});
film.score?.({ voice, blip, sq, starts: film.starts, shotEnd, total: film.duration, shots: film.shots });

// soften the edges: one-pole low-pass, then 16-bit PCM
const out = Buffer.alloc(44 + N * 2);
let y = 0;
const k = 1 - Math.exp((-2 * Math.PI * 3200) / SR);
for (let n = 0; n < N; n++) {
  y += k * (mix[n] - y);
  out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(y * 0.9 * 32767))), 44 + n * 2);
}
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 2, 4); out.write("WAVEfmt ", 8);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
out.write("data", 36); out.writeUInt32LE(N * 2, 40);
const dest = path.join(film.out, "score.wav");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`score: ${film.duration}s → ${path.relative(process.cwd(), dest)}`);
