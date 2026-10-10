#!/usr/bin/env node
// node lab/slack/voice.mjs [voice] [--samples]
// The old man's voice, for now: every line he can say, spoken by a macOS system voice and pushed
// through a narrow, slightly driven band so it sounds like what he is: a radio. Writes
// voice/<fnv1a of the text>.mp3; game.js looks a line up by the same hash and falls back to blips.
// Placeholder until he has a licensed voice: Apple's system voices are for personal, non-commercial use.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), samples = args.includes("--samples"), voice = args.find((a) => !a.startsWith("--")) || "Daniel";
export const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
const RADIO = "asetrate=22050*0.92,aresample=22050,atempo=0.97,highpass=f=330,lowpass=f=3000,acompressor=threshold=-18dB:ratio=4:makeup=4,volume=1.5";
function speak(text, v, out) {
  const tmp = out + ".aiff";
  execFileSync("say", ["-v", v, "-r", "152", "-o", tmp, text]);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", tmp, "-af", RADIO, "-ac", "1", "-b:a", "40k", out]);
  fs.rmSync(tmp);
}
if (samples) {
  const dir = path.join(here, "voice-samples"); fs.mkdirSync(dir, { recursive: true });
  for (const v of ["Daniel", "Grandpa (English (UK))", "Ralph", "Reed (English (UK))"]) speak("Ah. There you are. Mind the step. There isn't one, but mind it anyway. Sit down, if you like.", v, path.join(dir, v.replace(/[^A-Za-z]+/g, "-").replace(/-$/, "") + ".mp3"));
  console.log("samples →", dir);
} else {
  // every sentence in game.js that could be a line of his (captions come along too; they are simply never asked for)
  const src = fs.readFileSync(path.join(here, "game.js"), "utf8"), lines = new Set();
  for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const t = m[1].replace(/\\(.)/g, "$1");
    if (t.length >= 8 && /\s/.test(t) && /[.?!]$/.test(t) && !/[<>·{}=]/.test(t)) lines.add(t);
  }
  const dir = path.join(here, "voice"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  let bytes = 0;
  for (const t of lines) { const f = path.join(dir, fnv(t) + ".mp3"); speak(t, voice, f); bytes += fs.statSync(f).size; }
  console.log(`${lines.size} lines → ${dir} (${(bytes / 1024).toFixed(0)} kB), voice ${voice}`);
}
