// SLACK engine — Bitlight's look for a live 2.5D scene.
//
// Bitlight's kernel ray-marches one still object and re-lights the cached surface. A game
// needs many moving things, so this does the same in two halves:
//   bake()    ray-march a small SDF figure once per pose into a sprite that KEEPS its surface:
//             albedo, normal and depth per cell (a tiny G-buffer). Cached by pose.
//   render()  composite sprites and flat shapes into one screen G-buffer by depth, light every
//             cell from the scene's lamps using its normal, then order the result into a few
//             inks with a fixed 8×8 screen. The dots hold still; only the light moves.
// No DOM here: runs in the browser and in Node (sheet.mjs).
import { SCREENS, LOOK, sd, normal, occlusion, camera } from "../../src/core.js";

export const COLS = 384, ROWS = 216, N = COLS * ROWS;
export const alb = new Float32Array(N), emi = new Float32Array(N), red = new Uint8Array(N);
export const zb = new Float32Array(N), nX = new Float32Array(N), nY = new Float32Array(N), nZ = new Float32Array(N);
const yb = new Float32Array(N), lum = new Float32Array(N), rl = new Uint8Array(N), fl = new Uint8Array(N);
// A floor seen from above: one screen row down the floor is ZK cells nearer the camera.
export const ZK = 2;
export const cam = { x: 0, y: 0 };
let curX = 0, curY = 0, curZ = 0, curLane = 0;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const hash = (x, y) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// Every layer scrolls at its own rate (parallax) and sits at its own depth.
export function layer(par, z, parY = par) { curX = cam.x * par; curY = cam.y * parY; curZ = z; curLane = 0; }
// Stand what follows on the floor, n rows nearer than its far edge: drawn n rows lower, but lit
// and sorted as the same height, n·ZK closer.
export function lane(n) { curLane = n; }
export const lx = () => curX, ly = () => curY;
export function clear() { alb.fill(0); emi.fill(0); red.fill(0); zb.fill(-1e9); nX.fill(0); nY.fill(0); nZ.fill(1); fl.fill(0); }

function put(i, j, a, e, r, z, x, y, zn) {
  const k = j * COLS + i;
  z += curLane * ZK;
  if (z < zb[k]) return;
  alb[k] = a; emi[k] = e; red[k] = r; zb[k] = z; nX[k] = x; nY[k] = y; nZ[k] = zn; yb[k] = j - curLane; fl[k] = 0;
}
// the floor itself: everything below fn(x) is ground at height fn(x), receding upward on screen
export function floorBand(fn, a, grain, o = {}) {
  const fx = Math.floor(curX), z0 = curZ + (o.z || 0);
  for (let i = 0; i < COLS; i++) {
    const wx = fx + i, top = fn(wx) - curY, j0 = Math.max(0, Math.ceil(top)), j1 = o.rows ? Math.min(ROWS, Math.ceil(top + o.rows)) : ROWS;
    for (let j = j0; j < j1; j++) {
      const k = j * COLS + i, d = j - top, z = z0 + d * ZK;
      if (z < zb[k]) continue;
      const rip = 0.5 + 0.5 * Math.sin(d * 0.9 + Math.sin(wx * 0.05 + d * 0.11) * 2.2);
      alb[k] = a + hash(wx >> 1, Math.floor(d) >> 1) * grain + rip * grain * 0.6; emi[k] = 0; red[k] = 0; zb[k] = z;
      nX[k] = 0; nY[k] = -0.86; nZ[k] = 0.5; yb[k] = top; fl[k] = 1;
    }
  }
}

// ---------- flat shapes (world cells). `o` = { e, red, z, n:[x,y,z], round } ----------
const FLAT = [0, 0, 1];
export function disc(cx, cy, r, a, o = {}) {
  const e = o.e || 0, rd = o.red ? 1 : 0, z = curZ + (o.z || 0), round = o.round;
  const x0 = Math.max(0, Math.floor(cx - r - curX)), x1 = Math.min(COLS - 1, Math.ceil(cx + r - curX));
  const y0 = Math.max(0, Math.floor(cy - r - curY)), y1 = Math.min(ROWS - 1, Math.ceil(cy + r - curY));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = i + curX + 0.5 - cx, dy = j + curY + 0.5 - cy, q = dx * dx + dy * dy;
    if (q > r * r) continue;
    if (round) { const h = Math.sqrt(Math.max(0, 1 - q / (r * r))); put(i, j, a, e, rd, z + h * r * 0.6, dx / r, dy / r, h); }
    else put(i, j, a, e, rd, z, 0, 0, 1);
  }
}
export function rect(cx, cy, hw, hh, a, o = {}) {
  const e = o.e || 0, rd = o.red ? 1 : 0, z = curZ + (o.z || 0), n = o.n || FLAT;
  const x0 = Math.max(0, Math.round(cx - hw - curX)), x1 = Math.min(COLS - 1, Math.round(cx + hw - curX) - 1);
  const y0 = Math.max(0, Math.round(cy - hh - curY)), y1 = Math.min(ROWS - 1, Math.round(cy + hh - curY) - 1);
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) put(i, j, a, e, rd, z, n[0], n[1], n[2]);
}
// a tube from (x1,y1) to (x2,y2), w cells thick, shaded round
export function seg(x1, y1, x2, y2, w, a, o = {}) {
  const e = o.e || 0, rd = o.red ? 1 : 0, z = curZ + (o.z || 0), hw = w / 2, h = hw + 1;
  const xa = Math.max(0, Math.floor(Math.min(x1, x2) - h - curX)), xb = Math.min(COLS - 1, Math.ceil(Math.max(x1, x2) + h - curX));
  const ya = Math.max(0, Math.floor(Math.min(y1, y2) - h - curY)), yb = Math.min(ROWS - 1, Math.ceil(Math.max(y1, y2) + h - curY));
  const vx = x2 - x1, vy = y2 - y1, ll = vx * vx + vy * vy || 1;
  for (let j = ya; j <= yb; j++) for (let i = xa; i <= xb; i++) {
    const px = i + curX + 0.5 - x1, py = j + curY + 0.5 - y1;
    const t = clamp((px * vx + py * vy) / ll, 0, 1), dx = px - t * vx, dy = py - t * vy, q = dx * dx + dy * dy;
    if (q > hw * hw) continue;
    if (o.flat || hw < 1) put(i, j, a, e, rd, z, 0, 0, 1);
    else { const hh = Math.sqrt(Math.max(0, 1 - q / (hw * hw))); put(i, j, a, e, rd, z + hh * hw * 0.6, dx / hw, dy / hw, hh); }
  }
}
// fill everything below a height function (terrain), with a little grain
export function fillBelow(fn, a, grain, o = {}) {
  const z = curZ + (o.z || 0), n = o.n || [0, -0.55, 0.83], fx = Math.floor(curX), fy = Math.floor(curY);
  for (let i = 0; i < COLS; i++) {
    const wx = fx + i, top = fn(wx) - curY, j0 = Math.max(0, Math.ceil(top));
    for (let j = j0; j < ROWS; j++) {
      const lip = j - top < 2 ? 0.16 : 0;
      put(i, j, a + hash(wx >> 1, (j + fy) >> 1) * grain + lip, 0, 0, z, n[0], n[1], n[2]);
    }
  }
}
export function dot(wx, wy, a, o = {}) {
  const i = Math.floor(wx - curX), j = Math.floor(wy - curY);
  if (i >= 0 && j >= 0 && i < COLS && j < ROWS) put(i, j, a, o.e || 0, o.red ? 1 : 0, curZ + (o.z || 0), 0, 0, 1);
}
// forget everything drawn so far at and below a screen row (far backdrops must not cover what another renderer draws there)
export function clearBelow(row) { const k0 = Math.max(0, Math.ceil(row)) * COLS; if (k0 < N) { alb.fill(0, k0); emi.fill(0, k0); red.fill(0, k0); zb.fill(-1e9, k0); fl.fill(0, k0); } }
export const onScreen = (wx, pad = 40) => wx > curX - pad && wx < curX + COLS + pad;

// ---------- baked figures ----------
// A figure definition: { name, box:[x0,y0,x1,y1] (view-plane world units, origin at the feet),
//   build(pose) → parts [{ d(x,y,z), a, k?, cut? }], frames?, view? }
// A part's `a` is its albedo 0–1, or 10+e for a white glow, or 20+e for the one red.
const cache = new Map();
const VIEW = camera(24, 11);
const nrm = [0, 0, 1];
export function bake(def, pose = {}, size = 20) {
  const key = def.name + "|" + size + "|" + JSON.stringify(pose);
  let s = cache.get(key);
  if (s) return s;
  const parts = def.build(pose), np = parts.length;
  const map = (x, y, z) => {
    let d = 1e9;
    for (let p = 0; p < np; p++) {
      const q = parts[p], v = q.d(x, y, z);
      if (q.cut) d = Math.max(d, -v); else d = q.k ? sd.smin(d, v, q.k) : v < d ? v : d;
    }
    return d;
  };
  const matAt = (x, y, z) => {
    let best = 1e9, a = 0.8;
    for (let p = 0; p < np; p++) { const q = parts[p]; if (q.cut) continue; const v = q.d(x, y, z); if (v < best) { best = v; a = q.a; } }
    return typeof a === "function" ? a(x, y, z) : a;
  };
  const cv = def.view ? camera(def.view[0], def.view[1]) : VIEW, f = cv.f, r = cv.r, u = cv.u;
  const [x0, y0, x1, y1] = def.box, w = Math.ceil((x1 - x0) * size), h = Math.ceil((y1 - y0) * size);
  s = { w, h, ox: Math.round(-x0 * size), oy: Math.round(y1 * size), a: new Float32Array(w * h), e: new Float32Array(w * h), r: new Uint8Array(w * h), n: new Float32Array(w * h * 3), d: new Float32Array(w * h) };
  const BACK = 8;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const uu = x0 + (i + 0.5) / size, vv = y1 - (j + 0.5) / size;
    const ox = r[0] * uu + u[0] * vv - f[0] * BACK, oy = r[1] * uu + u[1] * vv - f[1] * BACK, oz = r[2] * uu + u[2] * vv - f[2] * BACK;
    let t = BACK - 3, hit = false;
    for (let st = 0; st < 56 && t < BACK + 3; st++) {
      const d = map(ox + f[0] * t, oy + f[1] * t, oz + f[2] * t);
      if (d < 0.006) { hit = true; break; }
      t += d;
    }
    if (!hit) continue;
    const px = ox + f[0] * t, py = oy + f[1] * t, pz = oz + f[2] * t, k = j * w + i;
    normal(map, px, py, pz, nrm, 0.012);
    const ao = 0.45 + 0.55 * occlusion(map, px, py, pz, nrm[0], nrm[1], nrm[2]);
    let m = matAt(px, py, pz), e = 0, rd = 0;
    if (m >= 20) { e = m - 20; rd = 1; m = 0.9; } else if (m >= 10) { e = m - 10; m = 0.9; }
    s.a[k] = Math.max(0.02, m * ao); s.e[k] = e; s.r[k] = rd;
    s.n[k * 3] = nrm[0] * r[0] + nrm[1] * r[1] + nrm[2] * r[2];
    s.n[k * 3 + 1] = -(nrm[0] * u[0] + nrm[1] * u[1] + nrm[2] * u[2]);
    s.n[k * 3 + 2] = -(nrm[0] * f[0] + nrm[1] * f[1] + nrm[2] * f[2]);
    s.d[k] = (BACK - t) * size;
  }
  cache.set(key, s);
  return s;
}
// draw a figure with its feet at world cell (wx, wy). o = { flip, z, size, glow, shake }
export function draw(def, pose, wx, wy, o = {}) {
  const size = o.size || 20;
  if (wx - curX < -size * 4 || wx - curX > COLS + size * 4) return;
  const s = bake(def, pose, size), flip = !!o.flip, z0 = curZ + (o.z || 0), glow = o.glow || 0;
  const sx = Math.round(wx - curX) - (flip ? s.w - s.ox : s.ox), sy = Math.round(wy - curY) - s.oy;
  for (let j = 0; j < s.h; j++) {
    const y = sy + j;
    if (y < 0 || y >= ROWS) continue;
    for (let i = 0; i < s.w; i++) {
      const x = sx + i;
      if (x < 0 || x >= COLS) continue;
      const k = j * s.w + (flip ? s.w - 1 - i : i), a = s.a[k];
      if (a <= 0) continue;
      put(x, y, a, s.e[k] + glow, s.r[k], z0 + s.d[k], flip ? -s.n[k * 3] : s.n[k * 3], s.n[k * 3 + 1], s.n[k * 3 + 2]);
    }
  }
}

// ---------- light and ink ----------
// env = { tones, screen, lit:[r,g,b], unlit:[r,g,b], amb, bg(i,j), sun?:{d:[x,y,z],p},
//         lights:[{x,y,z,p,k, dx?,dy?,c0?,c1?, beam?}], fog?, haze?, cut?, outline?:"dark"|"light", haloMin? }
const HALO = 3;
export function render(env, px) {
  const { tones, lights } = env, scr = SCREENS[env.screen] || SCREENS.bayer, sun = env.sun, amb = env.amb;
  const fog = env.fog || 0, haze = env.haze || 0, cut = env.cut || 0, nl = lights.length, gamma = LOOK.GAMMA;
  for (let j = 0, k = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++, k++) {
    const a = alb[k];
    let L;
    if (a > 0) {
      const z = zb[k], x = nX[k], y = nY[k], zn = nZ[k];
      L = amb * (0.8 - 0.2 * y) * (env.ambRow ? env.ambRow[j] : 1);
      if (sun) { const nd = x * sun.d[0] + y * sun.d[1] + zn * sun.d[2]; L += sun.p * Math.max(0, nd * 0.7 + 0.3); }
      const py = yb[k];
      let Lr = 0, Ll = 0;
      for (let q = 0; q < nl; q++) {
        const l = lights[q], vx = l.x - (i + 0.5), vy = l.y - (py + 0.5), vz = l.z - z, d2 = vx * vx + vy * vy + vz * vz, d = Math.sqrt(d2) || 1;
        const dif = Math.max(0, ((x * vx + y * vy + zn * vz) / d) * 0.7 + 0.3);
        let cone = 1;
        if (l.dir) { cone = d < 6 ? 1 : sstep(l.c0, l.c1, -(vx * l.dir[0] + vy * l.dir[1] + vz * l.dir[2]) / d); if (cone <= 0) continue; }
        const c = (dif * cone * l.p) / (1 + l.k * d2);
        Ll += c; if (l.red) Lr += c;
      }
      L += Ll; rl[k] = Lr > 0.05 && Lr > Ll * 0.55 ? 1 : 0;
      if (fog && z < -10) { const f = 1 / (1 - z * fog); L = L * f + haze * (1 - f) / Math.max(a, 0.2); }
      L = a * L + emi[k];
    } else {
      L = env.bg(i, j);
      for (let q = 0; q < nl; q++) {
        const l = lights[q];
        if (!l.beam) continue;
        // the beam is drawn where the lamp is on screen, not where it sits in floor space
        const vx = i + 0.5 - l.x, vy = j + 0.5 - (l.sy ?? l.y), d2 = vx * vx + vy * vy, d = Math.sqrt(d2) || 1;
        const cone = l.bx !== undefined ? sstep(l.c0, l.c1, (vx * l.bx + vy * l.by) / d) : 1;
        L += (l.beam * cone * l.p) / (1 + l.k * d2);
      }
      L += emi[k]; rl[k] = 0;
    }
    lum[k] = L;
  }
  const top = tones - 1, ramp = [], U = env.unlit, T = env.lit;
  for (let t = 0; t < tones; t++) { const q = t / top; ramp.push((255 << 24) | (Math.round(lerp(U[2], T[2], q)) << 16) | (Math.round(lerp(U[1], T[1], q)) << 8) | Math.round(lerp(U[0], T[0], q))); }
  const RED = (255 << 24) | (46 << 16) | (74 << 8) | 255, rramp = [];
  for (let t = 0; t < tones; t++) { const q = Math.min(1, (t / top) * 1.5); rramp.push((255 << 24) | (Math.round(lerp(U[2], 46, q)) << 16) | (Math.round(lerp(U[1], 74, q)) << 8) | Math.round(lerp(U[0], 255, q))); }
  const outline = env.outline, haloMin = env.haloMin ?? 0.1, px0 = Math.floor(cam.x), py0 = Math.floor(cam.y);
  // holes: another renderer (bitlight/gpu) draws the floor underneath, so leave floor cells clear
  // unless a figure's halo or the red light needs them
  const holes = !!env.holes, holeRow = holes && env.holeRow !== undefined ? env.holeRow : 1e9;   // below holeRow, empty water is clear too: the other renderer has rock there
  for (let j = 0, k = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++, k++) {
    let L = lum[k], edge = false;
    if (outline) {
      // the paper halo: a cell just behind a nearer object's edge is forced to the other ink
      const z = zb[k];
      let near = -1;
      if (i > 0 && alb[k - 1] > 0 && !(holes && fl[k - 1]) && zb[k - 1] - z > HALO) near = Math.max(near, lum[k - 1]);
      if (i < COLS - 1 && alb[k + 1] > 0 && !(holes && fl[k + 1]) && zb[k + 1] - z > HALO) near = Math.max(near, lum[k + 1]);
      if (j > 0 && alb[k - COLS] > 0 && !(holes && fl[k - COLS]) && zb[k - COLS] - z > HALO) near = Math.max(near, lum[k - COLS]);
      if (j < ROWS - 1 && alb[k + COLS] > 0 && !(holes && fl[k + COLS]) && zb[k + COLS] - z > HALO) near = Math.max(near, lum[k + COLS]);
      if (near > -1) { if (outline === "dark") L = 0; else if (Math.max(near, L) > haloMin) { L = 1; edge = true; } }
    }
    if (holes && !edge && !rl[k] && (fl[k] || (j >= holeRow && alb[k] === 0 && emi[k] === 0))) { px[k] = 0; continue; }
    L -= cut;
    const v = L <= 0 ? 0 : Math.pow(L > 1 ? 1 : L, gamma), tt = v * top, b = tt | 0;
    let idx = b + (tt - b > scr[(((j + py0) & 7) << 3) + ((i + px0) & 7)] ? 1 : 0);
    if (idx > top) idx = top;
    px[k] = red[k] && (v > 0.1 || emi[k] > 0.1) ? RED : rl[k] ? rramp[idx] : ramp[idx];
  }
}
