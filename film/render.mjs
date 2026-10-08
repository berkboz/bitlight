#!/usr/bin/env node
// node film/render.mjs --film <name|path.mjs>                  → out/<film>/picture.mp4
// node film/render.mjs --film <name|path.mjs> --stills 1.2,8   → out/<film>/still-<t>.png
// Frames render on worker threads and go to FFmpeg in order.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { loadFilm, filmArg, composeFrame, toRGB, fmt, SCALE } from "./frame.mjs";

const self = fileURLToPath(import.meta.url);

if (!isMainThread) {
  const film = await loadFilm(workerData.film);
  parentPort.on("message", (frame) => {
    const { bits, shot } = composeFrame(film, frame);
    const rgb = toRGB(bits, shot.ground);
    parentPort.postMessage({ frame, rgb }, [rgb.buffer]);
  });
} else {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
  const film = await loadFilm(filmArg(args));
  const out = film.out;
  fs.mkdirSync(out, { recursive: true });
  const stills = opt("stills", null);
  const frames = stills
    ? stills.split(",").map((s) => Math.min(film.frames - 1, Math.round(parseFloat(s) * film.fps)))
    : Array.from({ length: film.frames }, (_, i) => i);
  const { W, H } = fmt(film);
  // --scale 8 renders 3840×2160 from the same 480×270 cells (nearest neighbour: the dots stay crisp)
  const scale = Number(opt("scale", film.scale ?? SCALE));
  const ffIn = ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(film.fps), "-i", "-",
    "-vf", `scale=${W * scale}:${H * scale}:flags=neighbor`];

  const workers = Array.from({ length: Math.max(1, Math.min(os.cpus().length, frames.length)) }, () => new Worker(self, { workerData: { film: film.file } }));
  const ff = stills ? null : spawn("ffmpeg", [...ffIn, "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", path.join(out, "picture.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
  const pending = new Map();
  let next = 0, written = 0;
  const t0 = Date.now();

  await new Promise((done) => {
    const feed = (w) => { if (next < frames.length) w.postMessage(frames[next++]); };
    let flushing = false;
    const flush = async () => {
      if (flushing) return;
      flushing = true;
      while (pending.has(written)) {
        const rgb = pending.get(written); pending.delete(written);
        if (ff) { if (!ff.stdin.write(Buffer.from(rgb.buffer))) await new Promise((r) => ff.stdin.once("drain", r)); }
        else {
          const p = spawn("ffmpeg", [...ffIn, "-frames:v", "1", path.join(out, `still-${(frames[written] / film.fps).toFixed(2)}.png`)]);
          p.stdin.end(Buffer.from(rgb.buffer));
          await new Promise((r) => p.on("close", r));
        }
        written++;
        if (written % 24 === 0) process.stdout.write(`\r${written}/${frames.length} frames · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      flushing = false;
      if (written === frames.length) done();
    };
    // slot = position in `frames`, so repeated still times keep their order
    const slotOf = new Map();
    for (const w of workers) {
      w.on("message", ({ frame, rgb }) => {
        const slot = frames.indexOf(frame, slotOf.get(frame) ?? 0);
        slotOf.set(frame, slot + 1);
        pending.set(slot, rgb); feed(w); flush();
      });
      feed(w);
    }
  });
  workers.forEach((w) => w.terminate());
  if (ff) { ff.stdin.end(); await new Promise((r) => ff.on("close", r)); }
  console.log(`\n${film.title}: ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${path.relative(process.cwd(), out)}`);
}
