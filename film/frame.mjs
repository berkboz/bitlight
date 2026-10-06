// One film frame: the picture (engine.mjs) over the top 200 rows, the type band
// (type.mjs) under it. Shared by render.mjs and check.mjs.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { render, readLamp } from "./engine.mjs";
import * as T from "./type.mjs";

export const W = 480, H = 270, VIEW_H = 200, SCALE = 4, RATE = 20, MARGIN = 24;
// film.format: "wide" (default, 1920×1080, 2.4:1 picture over the band) or "square" (1080×1080)
export const FORMATS = { wide: { W: 480, H: 270, VIEW: 200 }, square: { W: 270, H: 270, VIEW: 205 } };
export const fmt = (film) => FORMATS[film.format || "wide"];
export const PALETTE = [
  { lit: [217, 220, 210], unlit: [14, 16, 14] }, // night
  { lit: [228, 230, 223], unlit: [18, 20, 17] }, // paper
];
// band layout, in cells
// band layout, in cells below the picture
export const BAND = { headline: { dy: 14, scale: 2 }, small: { dy: 44, scale: 1 }, pill: { dy: 13, h: 16, pad: 7 } };

const HERE = path.dirname(fileURLToPath(import.meta.url));

// --film <name> loads film/films/<name>.mjs; --film <path.mjs> loads any film file
// (output then goes to out/<name>/ next to that file, so other projects keep theirs).
export function filmArg(argv = process.argv.slice(2)) {
  const i = argv.indexOf("--film");
  if (i > -1 && argv[i + 1]) return argv[i + 1];
  const names = fs.readdirSync(path.join(HERE, "films")).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).map((f) => f.slice(0, -4));
  console.error(`--film <name|path.mjs> is required. Films here: ${names.join(", ")}`);
  process.exit(2);
}

export async function loadFilm(ref) {
  const external = ref.endsWith(".mjs") || ref.includes("/");
  const file = external ? path.resolve(process.cwd(), ref) : path.join(HERE, "films", `${ref}.mjs`);
  const film = (await import(pathToFileURL(file).href)).default;
  const name = path.basename(file, ".mjs");
  film.name = name;
  film.file = file;
  film.out = external ? path.join(path.dirname(file), "out", name) : path.join(HERE, "out", name);
  film.starts = [];
  let acc = 0;
  for (const s of film.shots) { film.starts.push(acc); acc += s.dur; }
  film.duration = acc;
  film.frames = Math.round(acc * film.fps);
  return film;
}

export function locate(film, frame) {
  let t = frame / film.fps;
  for (let i = 0; i < film.shots.length; i++) {
    if (t < film.shots[i].dur || i === film.shots.length - 1) return { index: i, shot: film.shots[i], t };
    t -= film.shots[i].dur;
  }
}

export function pillBox(shot, film) {
  const { W, VIEW } = fmt(film || {}), w = T.width(shot.pill, 1) + BAND.pill.pad * 2;
  return { x: W - MARGIN - w, y: VIEW + BAND.pill.dy, w, h: BAND.pill.h };
}

export function composeFrame(film, frame) {
  const { W, H, VIEW } = fmt(film);
  const { index, shot, t } = locate(film, frame);
  const scene = shot.build(t);
  scene.ground = shot.ground;
  const bits = new Uint8Array(W * H);
  render(scene, bits, W, 0, 0, W, VIEW);
  const ink = shot.ground ? 0 : 1;
  if (scene.cursor) T.cursor(bits, W, Math.round(scene.cursor[0] * W), Math.round(scene.cursor[1] * VIEW), VIEW, 0, 1);
  T.rect(bits, W, 0, VIEW, W, H - VIEW, shot.ground);
  const hy = VIEW + BAND.headline.dy, sy = VIEW + BAND.small.dy;
  if (shot.text && t >= shot.typeAt) T.text(bits, W, MARGIN, hy, shot.text, BAND.headline.scale, ink, Math.floor((t - shot.typeAt) * RATE) + 1);
  const small = scene.readout ?? readLamp(scene.lights[0].p, scene.camera.target);
  T.text(bits, W, MARGIN, sy, small, 1, ink);
  if (!film.hideCounter) {
    const counter = `${String(index + 1).padStart(2, "0")} / ${String(film.shots.length).padStart(2, "0")}`;
    T.text(bits, W, W - MARGIN - T.width(counter, 1), sy, counter, 1, ink);
  }
  if (shot.pill && t >= shot.pillAt) {
    const b = pillBox(shot, film);
    T.pill(bits, W, b.x, b.y, b.w, b.h, ink);
    T.text(bits, W, b.x + BAND.pill.pad, b.y + 4, shot.pill, 1, ink);
  }
  return { bits, index, shot, t, scene };
}

export function toRGB(bits, ground, rgb = new Uint8Array(bits.length * 3)) {
  const pal = PALETTE[ground];
  for (let k = 0; k < bits.length; k++) {
    const c = bits[k] ? pal.lit : pal.unlit;
    rgb[k * 3] = c[0]; rgb[k * 3 + 1] = c[1]; rgb[k * 3 + 2] = c[2];
  }
  return rgb;
}
