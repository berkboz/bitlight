// "Ape Tax" — eight shots in the mood of rekt.news' "Ape Tax": the climb to the
// all-time high, the screen, the stack, the crowd, the banana, the drop, the bill.
// Two engravings (ape-tax-src/*.png, made with Codex imagegen) play on the CRT,
// halftoned by the same Bayer screen as everything else.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sd, M } from "../engine.mjs";

const { box, sphere, cylinder, capsule } = sd;
const { abs, max, min, sqrt, sin, cos, atan2, floor, PI } = Math;
const cylZ = (x, y, z, r, h) => cylinder(x, z, y, r, h); // axis along z
const clamp01 = (v) => max(0, min(1, v));
const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
const easeIn = (v) => Math.pow(clamp01(v), 2.4);
const easeInOut = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, v) => a + (b - a) * v;
const hash = (a, b, c) => { const s = sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - floor(s); };

// ---------- engravings: grayscale lookups, u, v in [-1, 1] ----------
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "ape-tax-src");
function engraving(file, N = 320) {
  let px;
  try {
    px = execFileSync("ffmpeg", ["-loglevel", "error", "-i", path.join(SRC, file), "-vf", `scale=${N}:${N},format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 24 });
  } catch { px = null; }
  return (u, v) => {
    if (!px || abs(u) > 1 || abs(v) > 1) return 0;
    const i = min(N - 1, floor(((u + 1) / 2) * N)), j = min(N - 1, floor(((1 - v) / 2) * N));
    return Math.pow(clamp01((px[j * N + i] / 255 - 0.06) / 0.6), 0.8);
  };
}
const APE = engraving("ape.png"), REKT = engraving("ape-rekt.png");

// ---------- the chart: thirteen candles to the high ----------
const CLOSE = [0.3, 0.42, 0.36, 0.56, 0.73, 0.64, 0.88, 1.1, 1.0, 1.33, 1.62, 1.54, 2.03];
const CX = (i) => -2.1 + i * 0.35;
// one candle: body between open and close, a wick past both ends
function candle(x, y, z, lo, hi) {
  const mid = (lo + hi) / 2, half = max(0.03, (hi - lo) / 2);
  const body = box(x, y - mid, z, 0.11, half, 0.11, 0.012);
  const wick = box(x, y - mid, z, 0.016, half + 0.12, 0.016);
  return min(body, wick);
}
// grow(i) 0..1 how far candle i has drawn; sink(i) how far it has dropped into the floor
function chart(x, y, z, grow, sink) {
  if (abs(z) > 0.2) return abs(z) - 0.1;
  const i = Math.round((x + 2.1) / 0.35);
  let d = 1e9;
  for (let k = max(0, i - 1); k <= min(CLOSE.length - 1, i + 1); k++) {
    const g = grow(k);
    if (g <= 0) continue;
    const open = k ? CLOSE[k - 1] : 0.18, close = lerp(open, CLOSE[k], g);
    d = min(d, candle(x - CX(k), y + sink(k), z, min(open, close), max(open, close)));
  }
  return d;
}
function chartMat(x, y, z) {
  if (y < 0.002) {
    const gx = (((x + 0.175) / 0.35) % 1 + 1) % 1, gz = (((z + 0.6) / 0.6) % 1 + 1) % 1;
    M.a = gx < 0.035 || gz < 0.03 ? 0.4 : 0.7; return;
  }
  const k = max(0, min(CLOSE.length - 1, Math.round((x + 2.1) / 0.35)));
  const down = k && CLOSE[k] < CLOSE[k - 1];
  M.a = down ? 0.28 : 0.92; M.s = down ? 0 : 1;
}

// ---------- the CRT ----------
const SY = 0.62; // screen centre height
function crt(x, y, z) {
  let d = box(x, y - 0.6, z, 0.66, 0.5, 0.42, 0.06);
  d = max(d, -box(x, y - SY, z - 0.42, 0.52, 0.38, 0.05, 0.03));              // the bezel's well
  d = min(d, box(x, y - SY, z - 0.36, 0.53, 0.39, 0.012));                    // the glass
  d = min(d, box(x - 0.48, y - 0.16, z - 0.43, 0.035, 0.022, 0.02, 0.008));   // knob
  d = min(d, box(x, y - 0.05, z, 0.5, 0.05, 0.36, 0.02));                     // foot
  return d;
}
// the glass: picture(u, v) in [0, 1], `on` 0..1; v squeezed to a line as it switches off
function crtMat(x, y, z, picture, on, squeeze = 1, t = 0) {
  M.a = 0.8; M.s = 1;
  if (abs(z - 0.372) < 0.006 && abs(x) < 0.53 && abs(y - SY) < 0.39) {
    M.a = 0.04; M.s = 0;
    const u = x / 0.41, v = (y - SY) / 0.41 / squeeze;
    const row = floor((y - SY) / 0.012);
    const scan = row % 2 ? 1 : 0.62;
    const roll = 0.85 + 0.15 * sin((y - t * 0.6) * 9);                      // a slow bright band rolling down
    const glow = picture(u + (hash(row, floor(t * 12), 3) - 0.5) * 0.03, v) * scan * roll;
    M.e = on * min(1, glow + (squeeze < 1 && abs(v) < 1 ? 0.25 : 0));
    return;
  }
  if (abs(x - 0.48) < 0.04 && abs(y - 0.16) < 0.03 && z > 0.44) { M.a = 0.3; M.e = on ? 0.9 : 0; M.s = 0; }
}

// ---------- a coin: radius 0.2, half thickness 0.022, axis along local y ----------
const CR = 0.2, CH = 0.022;
const coin = (x, y, z) => cylinder(x, y, z, CR, CH, 0.006);
function coinMat(x, y, z) {
  M.s = 1; M.a = 0.9;
  const r = Math.hypot(x, z);
  if (r > CR - 0.012) { M.a = floor((atan2(z, x) / (2 * PI)) * 48 + 48) % 2 ? 0.95 : 0.45; return; } // milled edge
  if (abs(y) > CH - 0.004 && (abs(r - 0.15) < 0.012 || (r < 0.07 && r > 0.045))) M.a = 0.35;     // the stamp
}

// ---------- shot 1 · the climb ----------
const BAR = (i) => 0.2 + i * 0.32;
const climb = {
  dur: 6.5, ground: 0, text: "ALL EYES ON THE ALL TIME HIGH.", typeAt: 1.0,
  build(t) {
    const grow = (k) => easeOut((t - BAR(k)) / 0.28);
    const last = max(0, min(CLOSE.length - 1, floor((t - 0.2) / 0.32)));
    const lx = lerp(CX(max(0, last - 1)), CX(last), easeOut((t - BAR(last)) / 0.3));
    const obj = (x, y, z) => chart(x, y, z, grow, () => 0);
    return {
      ambient: 0,
      camera: { yaw: 22, pitch: 9, half: lerp(2.45, 2.3, easeInOut(t / 6.5)), target: [lerp(-0.1, 0.15, t / 6.5), 1.1, 0] },
      map: (x, y, z) => min(y, obj(x, y, z)),
      occ: obj,
      mat: chartMat,
      lights: [
        { p: [lx - 0.3, CLOSE[last] + 0.9, 1.0], power: 2.8, falloff: 0.6 },
        { p: [-1.6, 2.8, 1.4], power: 0.8, falloff: 0.5, spot: { dir: [0.7, -0.55, -0.45], inner: 0.85, outer: 0.45 } },
      ],
    };
  },
};

// ---------- shot 2 · the screen comes on ----------
const screen = {
  dur: 5, ground: 0, text: "APE SEASON.", typeAt: 1.6,
  build(t) {
    const on = t > 1.05 || (t > 0.45 && t < 0.52) || (t > 0.7 && t < 0.78) ? 1 : 0;
    return {
      ambient: 0,
      camera: { yaw: 14, pitch: 7, half: lerp(1.4, 1.28, easeInOut(t / 5)), target: [0.02, 0.66, 0] },
      map: (x, y, z) => min(y, crt(x, y, z)),
      occ: crt,
      mat(x, y, z) { if (y < 0.002) { M.a = 0.6; return; } crtMat(x, y, z, APE, on, 1, t); },
      lights: [{ p: [-1.3, 1.5, 1.4], power: 1.6, falloff: 0.6, spot: { dir: [0.62, -0.42, -0.66], inner: 0.86, outer: 0.5 } }],
    };
  },
};

// ---------- shot 3 · all in: the stack ----------
const DROP = (i) => 0.25 + i * 0.29, FALL = 0.32, COINS = 18;
const stackY = (i) => CH + i * (2 * CH + 0.002);
function coinY(i, t) {
  const d = DROP(i) - t;
  return d <= 0 ? stackY(i) : stackY(i) + 2.4 * (d / FALL) * (d / FALL);
}
const stack = {
  dur: 6.5, ground: 0, text: "ALL IN IS NOT ENOUGH.", typeAt: 0.9,
  build(t) {
    const live = [];
    for (let i = 0; i < COINS; i++) if (t > DROP(i) - FALL) live.push([i, (hash(i, 2, 9) - 0.5) * 0.05, coinY(i, t), (hash(i, 7, 1) - 0.5) * 0.05]);
    const nearest = (x, y, z) => {
      let d = 1e9, best = null;
      for (const c of live) { const e = coin(x - c[1], y - c[2], z - c[3]); if (e < d) { d = e; best = c; } }
      return [d, best];
    };
    const obj = (x, y, z) => (Math.hypot(x, z) > 0.4 ? Math.hypot(x, z) - 0.3 : nearest(x, y, z)[0]);
    return {
      ambient: 0,
      camera: { yaw: 30, pitch: 13, half: 1.1, target: [0, lerp(0.42, 0.5, t / 6.5), 0] },
      map: (x, y, z) => min(y, obj(x, y, z)),
      occ: obj,
      mat(x, y, z) {
        if (y < 0.002) { M.a = 0.62; return; }
        const [, c] = nearest(x, y, z);
        coinMat(x - c[1], y - c[2], z - c[3]);
      },
      lights: [{ p: [-0.7, 2.2, 1.3], power: 2.8, falloff: 0.5, spot: { dir: [0.3, -0.85, -0.43], inner: 0.9, outer: 0.6 } }],
    };
  },
};

// ---------- shot 4 · the crowd at the candle ----------
function ape(x, y, z, bob) {
  const head = sphere(x, y - 0.56 - bob, z, 0.105);
  const ears = min(sphere(abs(x) - 0.105, y - 0.57 - bob, z, 0.035), head);
  const body = capsule(x, y, z, 0, 0.1, 0, 0, 0.38, 0, 0.13);
  const arms = capsule(abs(x), y, z, 0.14, 0.4, 0, 0.2, 0.08, 0.02, 0.045);
  return min(ears, min(body, arms));
}
const crowd = {
  dur: 6.5, ground: 0, text: "THOSE IN STILL FEAR MISSING OUT.", typeAt: 0.8,
  build(t) {
    const creep = t * 0.13;
    const apes = (x, y, z) => {
      if (y > 0.75) return y - 0.7;
      const zz = z + creep, ci = max(-6, min(6, Math.round(x / 0.42))), ri = max(0, min(6, Math.round(zz / 0.46)));
      let d = 1e9;
      for (let a = ci - 1; a <= ci + 1; a++) for (let b = ri - 1; b <= ri + 1; b++) {
        if (b < 0 || b > 6 || abs(a) > 6) continue;
        const jx = (hash(a, b, 1) - 0.5) * 0.12, jz = (hash(a, b, 2) - 0.5) * 0.12;
        const bob = 0.02 * max(0, sin(t * 7 + hash(a, b, 3) * 6.3));
        d = min(d, ape(x - a * 0.42 - jx, y, zz - b * 0.46 - jz, bob));
      }
      return d;
    };
    const pillar = (x, y, z) => box(x, y - 1.2, z + 3.6, 0.2, 1.2, 0.2, 0.02);
    const obj = (x, y, z) => min(apes(x, y, z), pillar(x, y, z));
    return {
      ambient: 0,
      camera: { yaw: 0, pitch: 16, half: 2.6, target: [0, 1.0, -1.4] },
      map: (x, y, z) => min(y, obj(x, y, z)),
      occ: apes,
      mat(x, y, z) {
        if (y < 0.002) { M.a = 0.75; return; }
        if (pillar(x, y, z) < 0.01) { M.a = 0.3; M.e = 0.8 + 0.2 * sin(t * 20 + y * 3); return; }
        M.a = 0.5;
      },
      lights: [
        { p: [0, 1.0, -3.0], power: 2.4, falloff: 0.18 },
        { p: [1.6, 1.2, 2.4], power: 0.35, falloff: 0.3 },
      ],
      haloLight: 0,
    };
  },
};

// ---------- shot 5 · the banana ----------
function banana(x, y, z) {
  const R = 0.5, cy = 0.75, qx = x, qy = y - cy;
  const a = max(-0.95, min(0.95, atan2(qx, -qy)));
  const px = R * sin(a), py = -R * cos(a);
  const r = 0.1 * (1 - 0.55 * (a / 0.95) ** 2);
  const d = Math.hypot(qx - px, qy - py, z * 1.1) - r;
  const stem = capsule(x, y, z, R * sin(0.95), cy - R * cos(0.95), 0, R * sin(0.95) + 0.06, cy - R * cos(0.95) + 0.07, 0, 0.022);
  return min(d * 0.8, stem);
}
const trophy = {
  dur: 5.5, ground: 0, text: "MONKEY BUSINESS PAYS WELL.", typeAt: 0.6,
  build(t) {
    const spin = 0.5 + t * 0.9, c = cos(spin), s = sin(spin), bob = 0.03 * sin(t * 2.2);
    const fruit = (x, y, z) => banana(c * x - s * z, y - 0.12 - bob, s * x + c * z);
    const plinth = (x, y, z) => cylinder(x, y - 0.04, z, 0.42, 0.04, 0.01);
    const obj = (x, y, z) => min(fruit(x, y, z), plinth(x, y, z));
    return {
      ambient: 0,
      camera: { yaw: 26, pitch: 14, half: 1.15, target: [0, 0.47, 0] },
      map: (x, y, z) => min(y, obj(x, y, z)),
      occ: obj,
      mat(x, y, z) {
        if (y < 0.002) { M.a = 0.6; return; }
        if (plinth(x, y, z) < 0.004) { M.a = abs(Math.hypot(x, z) - 0.36) < 0.012 ? 0.3 : 0.85; M.s = 1; return; }
        M.a = 0.95; M.s = 1;
        // ridges along the peel
        const lx = c * x - s * z, lz = s * x + c * z;
        if (abs(lz) < 0.012 && y > 0.3) M.a = 0.5;
        if (lx > 0.45) M.a = 0.35;
      },
      lights: [
        { p: [-0.8, 1.7, 1.2], power: 2.5, falloff: 0.5, spot: { dir: [0.5, -0.7, -0.5], inner: 0.9, outer: 0.62 } },
        { p: [1.2, 0.9, -0.8], power: 0.5, falloff: 0.5 },
      ],
    };
  },
};

// ---------- shot 6 · the drop ----------
const drop = {
  dur: 5, ground: 0, text: "UNTIL IT DOESN'T.", typeAt: 1.8,
  build(t) {
    const plunge = easeIn((t - 0.5) / 0.55);           // the long red candle, drawn downward
    const sink = (k) => 2.4 * easeIn((t - 1.3 - (CLOSE.length - 1 - k) * 0.11) / 0.5);
    const obj = (x, y, z) => {
      let d = chart(x, y, z, () => 1, sink);
      if (plunge > 0) d = min(d, candle(x - CX(13), y, z, lerp(2.03, 0.1, plunge), 2.03));
      return d;
    };
    const shake = t > 0.9 && t < 3.2 ? 0.04 * (hash(floor(t * 24), 1, 1) - 0.5) : 0;
    const flick = t < 1.0 || hash(floor(t * 14), 5, 5) > 0.3;
    const lights = [{ p: [2.1, 2.0, 1.2], power: 2.6, falloff: 0.5 }];
    if (flick) lights.push({ p: [-0.8, 2.4, 1.4], power: 1.2 * (1 - 0.6 * clamp01((t - 1) / 3)), falloff: 0.5 });
    return {
      ambient: 0,
      camera: { yaw: 22 + shake * 20, pitch: 9 + shake * 10, half: 2.35, target: [lerp(0.4, 0.6, t / 5), 1.1 + shake, 0] },
      map: (x, y, z) => min(y, obj(x, y, z)),
      occ: obj,
      mat(x, y, z) {
        if (y > 0.002 && x > CX(13) - 0.15) { M.a = 0.28; M.s = 0; return; }
        chartMat(x, y, z);
      },
      lights,
    };
  },
};

// ---------- shot 7 · paper: one coin rolls, wobbles, lies down ----------
const bill = {
  dur: 6, ground: 1, text: "EVERY APE PAYS THE TAX.", typeAt: 0.6,
  build(t) {
    const roll = easeOut(t / 2.6), x0 = lerp(-1.7, 0, roll);
    const phi = (PI / 2) * Math.pow(clamp01((t - 2.3) / 2.4), 1.6);                  // tilt toward flat
    const psi = (t - 2.3) > 0 ? 9 * Math.pow(t - 2.3, 1.8) : 0;                        // precession speeds up
    const spin = -x0 / CR;
    const cy = CR * cos(phi) + CH * sin(phi) + 0.002;
    const f = (x, y, z) => {
      // world → coin: translate, undo precession (y), undo tilt (x), undo roll (z)
      let qx = x - x0, qy = y - cy, qz = z;
      const cp = cos(psi), sp = sin(psi);
      [qx, qz] = [cp * qx - sp * qz, sp * qx + cp * qz];
      const ct = cos(phi), st = sin(phi);
      [qy, qz] = [ct * qy - st * qz, st * qy + ct * qz];
      const cs = cos(spin), ss = sin(spin);
      [qx, qy] = [cs * qx - ss * qy, ss * qx + cs * qy];
      return [qx, qz, -qy]; // coin axis (local y) along world z when upright
    };
    const obj = (x, y, z) => { const [a, b, c] = f(x, y, z); return coin(a, b, c); };
    return {
      ambient: 0.08,
      camera: { yaw: 22, pitch: 24, half: lerp(0.95, 0.6, easeInOut((t - 2) / 3.5)), target: [lerp(-0.9, 0.05, roll), 0.12, 0] },
      map: (x, y, z) => min(y, obj(x, y, z)),
      occ: obj,
      mat(x, y, z) {
        if (y < 0.002) { M.a = 0.97; return; }
        const [a, b, c] = f(x, y, z); coinMat(a, b, c);
      },
      lights: [{ p: [-2.6, 1.5, 1.6], power: 3.0, falloff: 0.02 }],
    };
  },
};

// ---------- shot 8 · the screen again, then off ----------
const rekt = {
  dur: 6, ground: 0, text: "APE TAX.", typeAt: 0.7, pill: "REKT", pillAt: 2.2,
  build(t) {
    const off = clamp01((t - 4.3) / 0.35);                      // the picture folds to a line
    const squeeze = lerp(1, 0.02, off);
    const on = t < 4.65 ? 1 : max(0, 1 - (t - 4.65) / 0.6);
    const picture = (u, v) => (off >= 1 ? (abs(u) < 0.12 ? 1 : 0) : REKT(u, v));
    return {
      ambient: 0,
      camera: { yaw: -10, pitch: 6, half: lerp(1.4, 1.28, easeInOut(t / 6)), target: [0, 0.66, 0] },
      map: (x, y, z) => min(y, crt(x, y, z)),
      occ: crt,
      mat(x, y, z) { if (y < 0.002) { M.a = 0.6; return; } crtMat(x, y, z, picture, on, squeeze, t); },
      lights: [{ p: [1.4, 1.4, 1.5], power: 1.3, falloff: 0.6, spot: { dir: [-0.62, -0.38, -0.68], inner: 0.86, outer: 0.5 } }],
    };
  },
};

// ---------- the score: a minor key, square waves, cut with the picture ----------
function score({ voice, blip, sq, starts, shotEnd, total, shots }) {
  const A = [110, 130.81, 164.81, 196, 220, 261.63, 329.63, 392, 440, 523.25, 659.25, 783.99, 880];
  // 01 climb — one rising note per candle over a low pulse
  voice(starts[0], shotEnd(0), (u) => sq(55, u) * 0.04 * (0.5 + 0.5 * sq(2, u)));
  CLOSE.forEach((c, k) => blip(starts[0] + BAR(k), A[k] * 2, 0.12, 0.06));
  // 02 screen — relay clicks, then the 60 Hz hum and a slow two-note figure
  for (const at of [0.45, 0.52, 0.7, 0.78, 1.05]) blip(starts[1] + at, 900, 0.012, 0.2);
  voice(starts[1] + 1.05, shotEnd(1), (u) => sq(60, u) * 0.04 + sq(u % 2 < 1 ? 220 : 207.65, u) * 0.022);
  // 03 stack — a clink per coin, the stack's note climbs
  for (let i = 0; i < COINS; i++) {
    blip(starts[2] + DROP(i), 2200 + hash(i, 1, 1) * 900, 0.04, 0.07);
    blip(starts[2] + DROP(i), A[i % 8] , 0.08, 0.04);
  }
  voice(starts[2], shotEnd(2), (u) => sq(55, u) * 0.035);
  // 04 crowd — a heartbeat that quickens
  for (let b = 0, at = 0.2; at < shots[3].dur - 0.2; b++, at += lerp(0.8, 0.38, at / shots[3].dur)) {
    blip(starts[3] + at, 55, 0.12, 0.13); blip(starts[3] + at + 0.14, 49, 0.1, 0.09);
  }
  voice(starts[3], shotEnd(3), (u) => sq(110, u) * 0.015 * (0.5 + 0.5 * sq(7, u)));
  // 05 trophy — a bright, too-happy major arpeggio
  const maj = [440, 554.37, 659.25, 880, 659.25, 554.37];
  for (let k = 0; k * 0.18 < shots[4].dur - 0.15; k++) blip(starts[4] + k * 0.18, maj[k % 6], 0.08, 0.045);
  voice(starts[4], shotEnd(4), (u) => sq(110, u) * 0.025);
  // 06 drop — the floor falls out: a long downward sweep, a thud per sinking candle
  voice(starts[5] + 0.5, starts[5] + 1.6, (u) => {
    const f = 880 * Math.pow(0.04, u / 1.1);
    return (((880 * (Math.pow(0.04, u / 1.1) - 1)) / Math.log(0.04) * 1.1) % 1 < 0.5 ? 1 : -1) * 0.07 * (f > 0 ? 1 : 0);
  });
  CLOSE.forEach((c, k) => blip(starts[5] + 1.3 + (CLOSE.length - 1 - k) * 0.11, 70 - k * 2, 0.16, 0.1));
  voice(starts[5] + 1.6, shotEnd(5), (u) => sq(41.2, u) * 0.05 * (1 - u / 3.6));
  // 07 bill — near silence on paper: roll ticks, then the wobble speeding up
  for (let k = 0; k < 9; k++) blip(starts[6] + k * 0.28 * (1 + k * 0.06), 1400, 0.01, 0.05);
  for (let at = 2.3, g = 0.22; at < 4.75; at += g, g = max(0.035, g * 0.9)) blip(starts[6] + at, 1800, 0.012, 0.07);
  blip(starts[6] + 4.75, 600, 0.25, 0.1);
  // 08 rekt — A minor held low, one hard blip on the stamp, the CRT pop at switch-off
  for (const f of [110, 130.81, 164.81]) voice(starts[7], starts[7] + 4.65, (u) => sq(f, u) * 0.03 * min(1, u / 0.5));
  blip(starts[7] + 2.2, 1760, 0.2, 0.09);
  blip(starts[7] + 4.65, 3000, 0.05, 0.12);
  voice(starts[7] + 4.65, total, (u) => sq(15000, u) * 0.008 * max(0, 1 - u / 1.2));
}

export default {
  title: "Ape Tax",
  fps: 24,
  shots: [climb, screen, stack, crowd, trophy, drop, bill, rekt],
  score,
};
