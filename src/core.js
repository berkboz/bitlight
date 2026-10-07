/*
 * Bitlight core — the look, in one place.
 *
 * Everything that decides how a Bitlight pixel looks lives here and only here:
 * the lamp model, the tone curve, the soft shadow, the 8×8 Bayer order and the
 * paper halo. The interactive kernel (bitlight.js) and the film engine
 * (film/engine.mjs) both call these functions, so a figure on a web page and a
 * shot in a film can never drift apart.
 *
 * No DOM here. Runs in browsers, workers and Node.
 */

// ---------- tone ----------
// AMBIENT: fill light on every surface (scenes may override; night shots use 0)
// POWER, FALLOFF: lamp brightness and distance falloff, atten = POWER / (1 + FALLOFF·d²)
// GAMMA: <1 lifts mid-tones so area coverage of dots reads like the intended grey
export const LOOK = Object.freeze({ AMBIENT: 0.035, POWER: 2.4, FALLOFF: 0.32, GAMMA: 0.72, HALO_DEPTH: 0.12 });

// ---------- ordered dither ----------
// 8×8 Bayer thresholds in (0, 1). Ordered, never error-diffused: diffusion makes
// every dot swim when the light moves (rules · 04 Order).
export const BAYER = (() => {
  let m = [[0, 2], [3, 1]];
  while (m.length < 8) {
    const n = m.length, next = [];
    for (let y = 0; y < 2 * n; y++) {
      next.push([]);
      for (let x = 0; x < 2 * n; x++) {
        const q = [0, 2, 3, 1][(y >= n ? 2 : 0) + (x >= n ? 1 : 0)];
        next[y].push(4 * m[y % n][x % n] + q);
      }
    }
    m = next;
  }
  return Float32Array.from(m.flat(), (v) => (v + 0.5) / 64);
})();

// ---------- screens ----------
// Other ordered threshold maps, all 8×8 and tiled: a "screen" is only the order
// in which dots switch on as light rises. Every one is fixed in the page, so the
// shading still holds while the lamp moves (rules · 04 Order). Error diffusion is
// not offered and never will be.
export const SCREENS = (() => {
  const rank = (score) => {
    const idx = [...score.keys()].sort((a, b) => score[a] - score[b] || a - b);
    const out = new Float32Array(64);
    idx.forEach((k, i) => { out[k] = (i + 0.5) / 64; });
    return out;
  };
  const cells = (fn) => Array.from({ length: 64 }, (_, k) => fn(k & 7, k >> 3));
  const b4 = Float32Array.from(cells((x, y) => {
    const m = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    return (m[y & 3][x & 3] + 0.5) / 16;
  }));
  let seed = 7; // fixed seed: the same grain on every machine
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Object.freeze({
    bayer: BAYER,
    bayer4: b4,
    // clustered dots: a lit dot grows from the middle of each 4×4 cell
    dots: rank(cells((x, y) => (((x & 3) - 1.5) ** 2 + ((y & 3) - 1.5) ** 2) + BAYER[y * 8 + x] * 0.01)),
    // horizontal and 45° line screens
    lines: rank(cells((x, y) => Math.abs((y & 3) - 1.5) + BAYER[y * 8 + x] * 0.5)),
    diagonal: rank(cells((x, y) => Math.abs(((x + y) & 3) - 1.5) + BAYER[y * 8 + x] * 0.5)),
    // fixed grain
    noise: rank(cells(() => rnd())),
  });
})();

// ---------- signed distance helpers ----------
const sqrt = Math.sqrt, abs = Math.abs, max = Math.max, min = Math.min;
export const sd = {
  sphere(x, y, z, r) { return sqrt(x * x + y * y + z * z) - r; },
  // box with half-sizes bx, by, bz and edge radius r
  box(x, y, z, bx, by, bz, r = 0) {
    const qx = abs(x) - bx + r, qy = abs(y) - by + r, qz = abs(z) - bz + r;
    const ox = max(qx, 0), oy = max(qy, 0), oz = max(qz, 0);
    return sqrt(ox * ox + oy * oy + oz * oz) + min(max(qx, max(qy, qz)), 0) - r;
  },
  // ring lying in the xz plane
  torus(x, y, z, R, r) { const q = sqrt(x * x + z * z) - R; return sqrt(q * q + y * y) - r; },
  // vertical cylinder centred on the origin, half-height h, edge radius e
  cylinder(x, y, z, r, h, e = 0) {
    const dx = sqrt(x * x + z * z) - r + e, dy = abs(y) - h + e;
    const ox = max(dx, 0), oy = max(dy, 0);
    return min(max(dx, dy), 0) + sqrt(ox * ox + oy * oy) - e;
  },
  capsule(x, y, z, ax, ay, az, bx, by, bz, r) {
    const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
    const h = max(0, min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz)));
    const ex = px - dx * h, ey = py - dy * h, ez = pz - dz * h;
    return sqrt(ex * ex + ey * ey + ez * ez) - r;
  },
  // 2D box in any plane: half-sizes bx, by
  rect(x, y, bx, by) {
    const qx = abs(x) - bx, qy = abs(y) - by;
    return sqrt(max(qx, 0) ** 2 + max(qy, 0) ** 2) + min(max(qx, qy), 0);
  },
  // solid of revolution around the y axis from a 2D profile distance f(r, y)
  revolve(x, y, z, f) { return f(sqrt(x * x + z * z), y); },
  smin(a, b, k) { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; },
};

// ---------- shadow ----------
// Soft shadow toward a light. `occ` is everything that can cast shadow (never the
// floor or plate: a convex ground cannot shade itself). `bound` = [x, y, z, r]
// optional sphere around all casters; rays that miss it are fully lit.
export function softShadow(occ, x, y, z, lx, ly, lz, dist, bound) {
  if (bound) {
    const ocx = x - bound[0], ocy = y - bound[1], ocz = z - bound[2];
    const b = ocx * lx + ocy * ly + ocz * lz;
    const c = ocx * ocx + ocy * ocy + ocz * ocz - bound[3] * bound[3];
    if (c > 0 && (b > 0 || b * b - c < 0)) return 1;
  }
  let res = 1, t = 0.015;
  for (let s = 0; s < 56 && t < dist; s++) {
    const h = occ(x + lx * t, y + ly * t, z + lz * t);
    if (h < 0.001) return 0;
    res = min(res, (9 * h) / t);
    if (res < 0.01) return 0;
    t += max(0.01, h);
  }
  return max(0, min(1, res));
}

// ---------- surface ----------
// Ambient occlusion from five taps along the normal. Light-independent.
export function occlusion(map, x, y, z, nx, ny, nz) {
  let ao = 0, w = 1;
  for (let s = 1; s <= 5; s++) {
    const h = 0.04 * s;
    ao += w * (h - map(x + nx * h, y + ny * h, z + nz * h));
    w *= 0.6;
  }
  return max(0, min(1, 1 - 3.2 * ao));
}

// Normal by the tetrahedron technique; writes into `n` ([x, y, z]).
export function normal(map, x, y, z, n, e = 0.0013) {
  const a = map(x + e, y - e, z - e), b = map(x - e, y - e, z + e);
  const c = map(x - e, y + e, z - e), g = map(x + e, y + e, z + e);
  let gx = a - b - c + g, gy = -a - b + c + g, gz = -a + b - c + g;
  const l = sqrt(gx * gx + gy * gy + gz * gz) || 1;
  n[0] = gx / l; n[1] = gy / l; n[2] = gz / l;
}

/**
 * Display brightness of one surface point, 0 = ink, ≥1 = paper.
 *   mat     { a: albedo 0–1, s: specular 0|1, e: emission 0–1 }
 *   lights  [{ p: [x, y, z], power?, falloff?, spot?: { dir: [x, y, z], inner, outer } }]
 *   view    [x, y, z] direction the camera looks (orthographic)
 */
export function shade(x, y, z, nx, ny, nz, ao, mat, lights, amb, view, occ, bound, gamma = LOOK.GAMMA) {
  let L = amb * ao;
  for (let i = 0; i < lights.length; i++) {
    const lt = lights[i];
    let lx = lt.p[0] - x, ly = lt.p[1] - y, lz = lt.p[2] - z;
    const dist = sqrt(lx * lx + ly * ly + lz * lz);
    lx /= dist; ly /= dist; lz /= dist;
    const ndl = nx * lx + ny * ly + nz * lz;
    if (ndl <= 0) continue;
    let cone = 1;
    if (lt.spot) {
      const sp = lt.spot, cd = -(lx * sp.dir[0] + ly * sp.dir[1] + lz * sp.dir[2]);
      cone = max(0, min(1, (cd - sp.outer) / (sp.inner - sp.outer)));
      cone = cone * cone * (3 - 2 * cone);
      if (cone <= 0) continue;
    }
    const sh = softShadow(occ, x + nx * 0.004, y + ny * 0.004, z + nz * 0.004, lx, ly, lz, dist, bound);
    if (sh <= 0) continue;
    const atten = (lt.power ?? LOOK.POWER) / (1 + (lt.falloff ?? LOOK.FALLOFF) * dist * dist);
    L += ndl * sh * cone * atten * (0.55 + 0.45 * ao);
    if (mat.s) {
      let hx = lx - view[0], hy = ly - view[1], hz = lz - view[2];
      const hl = sqrt(hx * hx + hy * hy + hz * hz);
      const ndh = (nx * hx + ny * hy + nz * hz) / hl;
      if (ndh > 0) L += sh * cone * Math.pow(ndh, 60) * 0.9;
    }
  }
  L = Math.pow(L * mat.a, gamma);
  return mat.e > L ? mat.e : L;
}

/**
 * Order a W×H brightness field into bits (1 = lit, 0 = unlit).
 *   lum    brightness per cell; < 0 marks a miss (paints `ground`)
 *   depth  ray distance per cell, for the halo
 * A hit cell just behind a nearer neighbour is lit — the paper halo (rules · 05).
 * `haloLight` > 0 draws it only where either side is at least that bright: films
 * use 0.12 so darkness keeps its secrets; figures use 0 so a dark object never
 * melts into its own dark shadow.
 * (x0, y0) offsets the screen phase so tiles of one frame line up. `screen` is an
 * 8×8 threshold map (default Bayer; see SCREENS).
 */
export function dither(lum, depth, W, H, bits, stride, x0, y0, ground, haloLight = 0, screen = BAYER) {
  const D = LOOK.HALO_DEPTH, HL = haloLight;
  for (let j = 0, k = 0; j < H; j++) {
    const row = ((y0 + j) & 7) * 8, out = (y0 + j) * stride + x0;
    for (let i = 0; i < W; i++, k++) {
      const L = lum[k];
      if (L < 0) { bits[out + i] = ground; continue; }
      const d = depth[k];
      let near = -1;
      if (i > 0 && d - depth[k - 1] > D) near = max(near, lum[k - 1]);
      if (i < W - 1 && d - depth[k + 1] > D) near = max(near, lum[k + 1]);
      if (j > 0 && d - depth[k - W] > D) near = max(near, lum[k - W]);
      if (j < H - 1 && d - depth[k + W] > D) near = max(near, lum[k + W]);
      const halo = near > -1 && (HL <= 0 || max(near, L) > HL);
      bits[out + i] = halo || L > screen[row + ((x0 + i) & 7)] ? 1 : 0;
    }
  }
}

/**
 * The same ordering for more than two inks. `levels` = number of tones (2–16);
 * each cell lands on one of 0 … levels−1, dithered between its two nearest tones
 * with the same fixed screen, so shading still holds still. Misses paint `ground`
 * (a level, 0 or levels−1). The halo paints the top level.
 */
export function ditherLevels(lum, depth, W, H, out, stride, x0, y0, ground, haloLight = 0, screen = BAYER, levels = 4) {
  const D = LOOK.HALO_DEPTH, HL = haloLight, top = levels - 1;
  for (let j = 0, k = 0; j < H; j++) {
    const row = ((y0 + j) & 7) * 8, o = (y0 + j) * stride + x0;
    for (let i = 0; i < W; i++, k++) {
      const L = lum[k];
      if (L < 0) { out[o + i] = ground; continue; }
      const d = depth ? depth[k] : 0;
      let near = -1;
      if (depth) {
        if (i > 0 && d - depth[k - 1] > D) near = max(near, lum[k - 1]);
        if (i < W - 1 && d - depth[k + 1] > D) near = max(near, lum[k + 1]);
        if (j > 0 && d - depth[k - W] > D) near = max(near, lum[k - W]);
        if (j < H - 1 && d - depth[k + W] > D) near = max(near, lum[k + W]);
      }
      if (near > -1 && (HL <= 0 || max(near, L) > HL)) { out[o + i] = top; continue; }
      const v = (L < 0 ? 0 : L > 1 ? 1 : L) * top, base = Math.floor(v);
      out[o + i] = min(top, base + (v - base > screen[row + ((x0 + i) & 7)] ? 1 : 0));
    }
  }
}

/** `levels` colours stepping from `unlit` to `lit` ([r, g, b] 0–255 each). */
export function ramp(unlit, lit, levels) {
  return Array.from({ length: levels }, (_, i) => unlit.map((u, c) => Math.round(u + (lit[c] - u) * (i / (levels - 1)))));
}

// ---------- camera ----------
// Orthographic camera: yaw/pitch in degrees, `half` = half the visible width in
// world units. Returns the ray basis used by both engines.
export function camera(yawDeg, pitchDeg) {
  const yaw = (yawDeg * Math.PI) / 180, pitch = (pitchDeg * Math.PI) / 180;
  const f = [-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
  const r = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const u = [-r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1]];
  return { f, r, u };
}

// March one ray. Returns distance travelled, or -1 for a miss.
export function march(map, ox, oy, oz, fx, fy, fz, maxT = 60, steps = 180) {
  let t = 0;
  for (let s = 0; s < steps && t < maxT; s++) {
    const d = map(ox + fx * t, oy + fy * t, oz + fz * t);
    if (d < 0.0007) return t;
    t += d;
  }
  return -1;
}

// Lamp read-out shared by figures and films: "az 214° · el 38°"
export function lampAngles(p, target = [0, 0, 0]) {
  const x = p[0] - target[0], y = p[1] - target[1], z = p[2] - target[2];
  const az = ((Math.atan2(z, x) * 180) / Math.PI + 360) % 360;
  const el = (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI;
  return { az: Math.round(az), el: Math.round(el) };
}
