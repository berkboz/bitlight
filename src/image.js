/*
 * Bitlight image — the same look for photographs and video frames.
 *
 * A picture becomes a brightness field (0–1), is tuned (levels, contrast,
 * sharpen), shrunk to a grid of cells, and ordered into inks with the same
 * screens the figures use (core.SCREENS). No DOM and no decoding here: callers
 * hand in RGBA or gray bytes, so it runs in the browser, in Node and in workers.
 *
 *   const lum = lumaFromRGBA(rgba, w, h);
 *   const grid = toGrid(lum, w, h, cols);              // { lum, W, H }
 *   tune(grid.lum, grid.W, grid.H, { auto: true, contrast: 1.1, sharpen: 0.6 });
 *   const levels = dither(grid.lum, grid.W, grid.H, { screen: "bayer", tones: 2 });
 *   // levels[k] is 0 … tones−1; colour them with core.ramp()
 */
import { SCREENS, ditherLevels, ramp } from "./core.js";

export { SCREENS, ramp };

/** Rec. 709 luma of RGBA bytes, 0–1. Transparent pixels count as paper. */
export function lumaFromRGBA(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0, k = 0; k < out.length; i += 4, k++) {
    const a = rgba[i + 3] / 255, y = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    out[k] = y * a + (1 - a);
  }
  return out;
}

/** Area-average a w×h field down to `cols` cells wide (rows follow the aspect, or pass `rows`). */
export function toGrid(lum, w, h, cols, rows = Math.max(1, Math.round((cols * h) / w))) {
  const out = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y0 = (j * h) / rows, y1 = ((j + 1) * h) / rows;
    for (let i = 0; i < cols; i++) {
      const x0 = (i * w) / cols, x1 = ((i + 1) * w) / cols;
      let sum = 0, wt = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0), f = wx * wy;
          sum += lum[Math.min(h - 1, y) * w + Math.min(w - 1, x)] * f; wt += f;
        }
      }
      out[j * cols + i] = wt ? sum / wt : 0;
    }
  }
  return { lum: out, W: cols, H: rows };
}

/** The 1st and 99th percentile of a field, as 0–255. Video passes a smoothed pair as `range`. */
export function levelsOf(lum) {
  const n = lum.length, hist = new Uint32Array(256);
  for (let k = 0; k < n; k++) hist[Math.max(0, Math.min(255, Math.round(lum[k] * 255)))]++;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < n * 0.01) lo++;
  acc = 0; while (hi > 0 && (acc += hist[hi]) < n * 0.01) hi--;
  return [lo, hi];
}

/**
 * Tune a grid in place.
 *   auto      stretch the 1st–99th percentile to 0–1 (a flat photo gets its blacks and whites back)
 *   range     [lo, hi] 0–255 to stretch with instead of measuring (video keeps it steady)
 *   contrast  1 = unchanged; >1 pushes tones apart around mid-grey
 *   brightness  −1…1 added after contrast
 *   gamma     <1 lifts the mid-tones (dither coverage is linear, so this is the mid-tone knob)
 *   sharpen   0…2: unsharp mask over one cell, which is what makes thin edges survive the dither
 *   invert    swap light and dark
 */
export function tune(lum, W, H, o = {}) {
  const n = W * H;
  if (o.auto !== false) {
    const [lo, hi] = o.range || levelsOf(lum);
    if (hi - lo > 8) for (let k = 0; k < n; k++) lum[k] = (lum[k] * 255 - lo) / (hi - lo);
  }
  const c = o.contrast ?? 1, b = o.brightness ?? 0, g = o.gamma ?? 1;
  if (c !== 1 || b !== 0 || g !== 1) for (let k = 0; k < n; k++) {
    let v = (lum[k] - 0.5) * c + 0.5 + b; v = v < 0 ? 0 : v > 1 ? 1 : v; lum[k] = g === 1 ? v : Math.pow(v, g);
  }
  if (o.sharpen > 0) {
    const src = Float32Array.from(lum), amt = o.sharpen;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let s = 0, m = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { s += src[Math.max(0, Math.min(H - 1, j + dj)) * W + Math.max(0, Math.min(W - 1, i + di))]; m++; }
      const v = src[j * W + i] + amt * (src[j * W + i] - s / m); lum[j * W + i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }
  if (o.invert) for (let k = 0; k < n; k++) lum[k] = 1 - lum[k];
  return lum;
}

/** Order a grid into ink levels 0 … tones−1. `screen` is a name in SCREENS or an 8×8 table. */
export function dither(lum, W, H, o = {}) {
  const levels = Math.max(2, Math.min(16, Math.round(o.tones ?? 2)));
  const screen = typeof o.screen === "string" || o.screen == null ? SCREENS[o.screen || "bayer"] : o.screen;
  if (!screen) throw new Error(`Bitlight image: no screen called "${o.screen}"`);
  const out = o.out || new Uint8Array(W * H);
  // photographs have no depth, so no halo; the field never goes negative, so no misses
  ditherLevels(lum, null, W, H, out, W, 0, 0, 0, 0, screen, levels);
  return out;
}

/** Levels → RGBA bytes at `cell` pixels per dot. `colours` is ramp(unlit, lit, tones) or any [r,g,b][]. */
export function paint(levels, W, H, colours, cell = 1, out = new Uint8ClampedArray(W * cell * H * cell * 4)) {
  const stride = W * cell;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = colours[levels[j * W + i]];
    for (let y = 0; y < cell; y++) {
      let o = ((j * cell + y) * stride + i * cell) * 4;
      for (let x = 0; x < cell; x++, o += 4) { out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; }
    }
  }
  return out;
}

/** The whole pipeline for one picture. Returns { levels, W, H }. */
export function process(rgba, w, h, o = {}) {
  const cols = o.cols || Math.min(w, 240);
  const g = toGrid(lumaFromRGBA(rgba, w, h), w, h, cols);
  tune(g.lum, g.W, g.H, o);
  return { levels: dither(g.lum, g.W, g.H, o), W: g.W, H: g.H };
}
