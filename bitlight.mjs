#!/usr/bin/env node
// Bitlight on your own pictures and video. Needs FFmpeg.
//   node bitlight.mjs image in.jpg [-o out.png] [options]
//   node bitlight.mjs video in.mp4 [-o out.mp4] [options]
//
//   --cols N        dots across (default 320; video 240)       --cell N      output px per dot (default 3)
//   --screen NAME   bayer bayer4 dots lines diagonal noise      --tones N     inks, 2–16 (default 2)
//   --ink LIT,UNLIT two colours (default #f4f3ef,#0f0f0f)       --palette A,B,C,...  darkest first, sets tones
//   --contrast X (1.1)  --brightness X  --gamma X  --sharpen X (0.5)  --invert  --no-auto
//   video only: --fps N (default source, max 30)  --smooth X (0–0.9 temporal smoothing, default 0.35)  --no-audio
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { lumaFromRGBA, tune, dither, paint, levelsOf, ramp, SCREENS } from "./src/image.js";

const args = process.argv.slice(2);
const mode = args.shift();
const input = args.find((a, i) => !a.startsWith("-") && !(i > 0 && /^(-o|--[a-z]+)$/.test(args[i - 1]) && !["--invert", "--no-auto", "--no-audio"].includes(args[i - 1])));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
if (!["image", "video"].includes(mode) || !input) {
  console.error(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 12).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(2);
}
const out = (() => { const i = args.indexOf("-o"); return i > -1 ? args[i + 1] : `${path.basename(input, path.extname(input))}.bitlight.${mode === "image" ? "png" : "mp4"}`; })();
const hex = (c) => { c = c.replace("#", ""); if (c.length === 3) c = [...c].map((x) => x + x).join(""); return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)); };
const [lit, unlit] = opt("ink", "#f4f3ef,#0f0f0f").split(",").map(hex);
const colours = opt("palette") ? opt("palette").split(",").map(hex) : ramp(unlit, lit, +opt("tones", 2));
const screen = opt("screen", "bayer");
if (!SCREENS[screen]) { console.error(`no screen "${screen}" (${Object.keys(SCREENS).join(", ")})`); process.exit(2); }
const cell = Math.max(1, +opt("cell", 3)), cols = +opt("cols", mode === "image" ? 320 : 240);
const tuning = { contrast: +opt("contrast", 1.1), brightness: +opt("brightness", 0), gamma: +opt("gamma", 1), sharpen: +opt("sharpen", 0.5), invert: flag("invert"), auto: !flag("no-auto") };

const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate", "-of", "json", input]).toString()).streams[0];
const rows = Math.max(1, Math.round((cols * probe.height) / probe.width)) & ~1 || 2; // even rows keep h264 happy after the cell scale
const W = cols, H = rows, OW = W * cell, OH = H * cell;
const [fn, fd] = (probe.avg_frame_rate || "24/1").split("/").map(Number);
const fps = Math.min(30, +opt("fps", (fn / (fd || 1)) || 24));

const decode = (extra) => spawn("ffmpeg", ["-v", "error", ...extra, "-i", input, "-vf", `${mode === "video" ? `fps=${fps},` : ""}scale=${W}:${H}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { stdio: ["ignore", "pipe", "inherit"] });
const gray = (buf) => Float32Array.from(buf, (v) => v / 255);
const frameOf = (lum) => { tune(lum, W, H, tuning); return paint(dither(lum, W, H, { screen, tones: colours.length }), W, H, colours, cell); };

if (mode === "image") {
  const chunks = []; const d = decode([]);
  d.stdout.on("data", (c) => chunks.push(c));
  await new Promise((r) => d.on("close", r));
  const lum = gray(Buffer.concat(chunks).subarray(0, W * H));
  const rgba = frameOf(lum);
  const enc = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${OW}x${OH}`, "-i", "-", "-frames:v", "1", out], { stdio: ["pipe", "inherit", "inherit"] });
  enc.stdin.end(Buffer.from(rgba.buffer));
  await new Promise((r) => enc.on("close", r));
  console.log(`${out}  ${OW}×${OH}  ${colours.length} inks · ${screen}`);
} else {
  const hasAudio = !flag("no-audio") && execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", input]).toString().trim() !== "";
  const enc = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${OW}x${OH}`, "-r", String(fps), "-i", "-", ...(hasAudio ? ["-i", input, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-shortest"] : []),
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const d = decode([]), size = W * H, smooth = Math.max(0, Math.min(0.9, +opt("smooth", 0.35)));
  let rest = Buffer.alloc(0), n = 0, prev = null, range = null;
  const t0 = Date.now();
  const handle = (lumRaw) => {
    const lum = gray(lumRaw);
    if (prev && smooth) for (let k = 0; k < size; k++) lum[k] = prev[k] * smooth + lum[k] * (1 - smooth);
    prev = Float32Array.from(lum);
    if (tuning.auto) { const r = levelsOf(lum); range = range ? [range[0] * 0.9 + r[0] * 0.1, range[1] * 0.9 + r[1] * 0.1] : r; }
    const rgba = (tune(lum, W, H, { ...tuning, range: range || undefined }), paint(dither(lum, W, H, { screen, tones: colours.length }), W, H, colours, cell));
    return Buffer.from(rgba.buffer);
  };
  for await (const chunk of d.stdout) {
    rest = Buffer.concat([rest, chunk]);
    while (rest.length >= size) {
      const ok = enc.stdin.write(handle(rest.subarray(0, size)));
      rest = rest.subarray(size); n++;
      if (!ok) await new Promise((r) => enc.stdin.once("drain", r));
    }
    if (n && n % 48 === 0) process.stdout.write(`\r${n} frames · ${(n / ((Date.now() - t0) / 1000)).toFixed(0)} fps`);
  }
  enc.stdin.end();
  await new Promise((r) => enc.on("close", r));
  console.log(`\r${out}  ${OW}×${OH} · ${n} frames @ ${fps} fps · ${colours.length} inks · ${screen}`);
}
