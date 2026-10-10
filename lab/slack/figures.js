// SLACK cast — small SDF figures, baked by engine.bake() into lit sprites.
// Every figure faces +x, stands with its feet at the origin (unless noted), and takes a pose
// with an integer frame `f` so a cycle is a handful of cached bakes.
// A part's tone: 0–1 albedo, 10+e white glow, 20+e the one red.
import { sd } from "../../src/core.js";

const { sphere, box, capsule, cylinder, torus } = sd;
const { sin, cos, abs, PI, max, min, floor } = Math, TAU = PI * 2;

const ell = (x, y, z, rx, ry, rz) => {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  if (k0 < 1e-6) return -min(rx, ry, rz);
  return (k0 * (k0 - 1)) / Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
};
const S = (cx, cy, cz, r, a, k) => ({ d: (x, y, z) => sphere(x - cx, y - cy, z - cz, r), a, k });
const E = (cx, cy, cz, rx, ry, rz, a, k) => ({ d: (x, y, z) => ell(x - cx, y - cy, z - cz, rx, ry, rz), a, k });
const C = (ax, ay, az, bx, by, bz, r, a, k) => ({ d: (x, y, z) => capsule(x, y, z, ax, ay, az, bx, by, bz, r), a, k });
const B = (cx, cy, cz, hx, hy, hz, r, a, k) => ({ d: (x, y, z) => box(x - cx, y - cy, z - cz, hx, hy, hz, r), a, k });
const CY = (cx, cy, cz, r, h, a, e = 0.02) => ({ d: (x, y, z) => cylinder(x - cx, y - cy, z - cz, r, h, e), a });   // axis y
const CX = (cx, cy, cz, r, h, a, e = 0.02) => ({ d: (x, y, z) => cylinder(y - cy, x - cx, z - cz, r, h, e), a });   // axis x
const CZ = (cx, cy, cz, r, h, a, e = 0.02) => ({ d: (x, y, z) => cylinder(x - cx, z - cz, y - cy, r, h, e), a });   // axis z
const TZ = (cx, cy, cz, R, r, a) => ({ d: (x, y, z) => torus(x - cx, z - cz, y - cy, R, r), a });                  // ring facing the camera
const TX = (cx, cy, cz, R, r, a) => ({ d: (x, y, z) => torus(y - cy, x - cx, z - cz, R, r), a });                  // ring around the x axis
const cut = (p) => ({ ...p, cut: true });
// rotate a set of parts about the z axis through (px, py)
const rotZ = (parts, ang, px, py) => {
  const c = cos(ang), s = sin(ang);
  return parts.map((p) => {
    const f = p.d, a = p.a;
    return {
      ...p,
      d: (x, y, z) => { const dx = x - px, dy = y - py; return f(c * dx + s * dy + px, -s * dx + c * dy + py, z); },
      a: typeof a === "function" ? (x, y, z) => { const dx = x - px, dy = y - py; return a(c * dx + s * dy + px, -s * dx + c * dy + py, z); } : a,
    };
  });
};
const shift = (parts, ox, oy) => parts.map((p) => ({ ...p, d: (x, y, z) => p.d(x - ox, y - oy, z), a: typeof p.a === "function" ? (x, y, z) => p.a(x - ox, y - oy, z) : p.a }));
const glass = (y0, z0) => (x, y, z) => (y > y0 && z > z0 && z < z0 + 0.13 ? 0.97 : 0.07);

// ---------- you ----------
// Round, short-limbed and a little dopey: a big belly, a beard under the mask, two eyes that
// don't quite agree, and flippers he never takes off.
function diverParts(mode, f) {
  const ph = (f / 8) * TAU, walk = mode === "walk", swim = mode === "swim", sit = mode === "sit";
  const sw = walk ? sin(ph) * 0.6 : swim ? sin(ph) * 0.45 : 0, br = mode === "idle" ? sin(ph) * 0.012 : 0;
  let P = [];
  for (const g of [1, -1]) {
    const a = sw * g, zz = g * 0.15;
    let fx = sin(a) * 0.2, fy = 0.07 + (walk ? max(0, cos(ph) * g) * 0.07 : 0);
    if (sit) { fx = 0.3; fy = 0.3; }
    if (swim) { fx = sin(a) * 0.26; fy = 0.0; }
    P.push(C(0, 0.3, zz, fx, fy, zz, 0.115, 0.27));
    if (swim) P.push(E(fx, fy - 0.24, zz, 0.085, 0.26, 0.15, 0.86));               // flippers, trailing
    else P.push(E(fx + 0.17, fy - 0.02, zz * 1.15, 0.27, 0.05, 0.14, 0.86));       // flippers, slapping
  }
  P.push(E(0, 0.62, 0, 0.37 + br, 0.39, 0.34 + br, (x, y) => (abs(y - 0.74) < 0.035 ? 0.85 : 0.3)));   // the belly, with a stripe
  P.push(CY(0, 0.43, 0, 0.375, 0.04, 0.74), B(0.36, 0.43, 0, 0.03, 0.05, 0.06, 0.01, 0.9));            // weight belt, buckle
  P.push(C(-0.4, 0.5, 0, -0.4, 0.92, 0, 0.13, 0.86), S(-0.4, 1.04, 0, 0.07, 0.45));                    // tank
  for (const g of [1, -1]) {
    const a = -sw * g, zz = g * 0.37;
    let hx = 0.05 + sin(a) * 0.2, hy = 0.5;
    if (swim) { hx = 0.16 + 0.14 * sin(ph + g * 0.8); hy = 1.0 + 0.2 * cos(ph + g * 0.8); }
    if (sit) { hx = 0.26; hy = 0.56; }
    P.push(C(0.04, 0.82, zz, hx, hy, zz * 1.12, 0.09, 0.3), S(hx, hy, zz * 1.12, 0.105, 0.9));
  }
  P.push(S(0.04, 1.17, 0, 0.29, 0.9));                                             // face
  P.push(E(-0.1, 1.21, 0, 0.29, 0.31, 0.315, 0.26));                               // hood
  P.push(E(0.17, 1.0, 0, 0.16, 0.1, 0.2, 0.42));                                   // beard
  P.push(B(0.24, 1.2, 0, 0.05, 0.14, 0.25, 0.06, 0.82));                           // mask rim
  P.push(B(0.28, 1.2, 0, 0.065, 0.115, 0.22, 0.055, 0.1));                         // mask glass
  P.push(S(0.335, 1.21, 0.1, 0.052, 0.98), S(0.335, 1.2, -0.085, 0.052, 0.98));    // eyes
  P.push(S(0.378, 1.2, 0.085, 0.024, 0.03), S(0.378, 1.215, -0.075, 0.024, 0.03)); // pupils, not quite agreeing
  P.push(C(0.12, 1.24, -0.33, 0.02, 1.62, -0.33, 0.04, 0.92), S(0.02, 1.65, -0.33, 0.06, 20.75)); // snorkel, red tip
  if (walk) P = rotZ(P, sin(ph) * 0.085, 0, 0);                                     // the waddle
  return P;
}
export const diver = { name: "diver", frames: 8, box: [-0.85, -0.1, 0.85, 1.85], build: (p) => diverParts(p.m || "idle", p.f || 0) };
// swimming: the same body, laid forward; origin at the belly
export const swimmer = { name: "swimmer", frames: 8, box: [-1.15, -0.8, 1.15, 0.8], build: (p) => shift(rotZ(diverParts("swim", p.f || 0), -1.25, 0, 0.62), 0.05, -0.62) };
// a marker lamp on the cable route: a pole, an arm, a hood, one bulb
export const beacon = { name: "beacon", box: [-0.5, -0.05, 0.9, 2.05], build: ({ red: rd = 0, on = 1 }) => [
  C(0, 0, 0, 0, 1.8, 0, 0.045, 0.6), C(0, 1.8, 0, 0.42, 1.86, 0, 0.04, 0.6), CY(0, 0.05, 0, 0.14, 0.05, 0.45),
  E(0.5, 1.84, 0, 0.17, 0.07, 0.13, 0.7), S(0.5, 1.76, 0, 0.07, on ? (rd ? 20.98 : 10.98) : 0.3),
] };

// ---------- the ship's company ----------
export const bo = {
  name: "bo", frames: 8, box: [-0.75, -0.1, 1.15, 1.95],
  build: ({ f = 0 }) => {
    const ph = (f / 8) * TAU, m = sin(ph) * 0.22;
    return [
      E(0.06, 0.04, 0.14, 0.16, 0.08, 0.11, 0.25), E(0.06, 0.04, -0.14, 0.16, 0.08, 0.11, 0.25),
      E(0, 0.62, 0, 0.35, 0.52, 0.31, (x, y) => (y < 0.2 ? 0.6 : 0.88)),          // raincoat
      S(0.3, 0.7, 0.05, 0.035, 0.3), S(0.31, 0.5, 0.05, 0.035, 0.3),                // buttons
      S(0, 1.28, 0, 0.3, 0.9),
      E(-0.02, 1.43, 0, 0.3, 0.2, 0.31, 0.28), S(-0.02, 1.66, 0, 0.09, 0.92),       // beanie, pom
      S(0.26, 1.29, 0.11, 0.04, 0.04), S(0.26, 1.29, -0.11, 0.04, 0.04),            // eyes
      S(0.3, 1.2, 0, 0.05, 0.75),                                                   // nose
      C(0.1, 0.9, 0.3, 0.4 + m * 0.4, 0.78, 0.26, 0.075, 0.86), S(0.4 + m * 0.4, 0.78, 0.26, 0.085, 0.9),
      C(0.1, 0.9, -0.3, 0.32 + m * 0.4, 1.0, -0.2, 0.075, 0.86), S(0.32 + m * 0.4, 1.0, -0.2, 0.085, 0.9),
      C(0.28 + m * 0.4, 1.12, -0.1, 0.72 + m, 0.06, 0.24, 0.028, 0.62),             // mop
      E(0.76 + m, 0.05, 0.25, 0.17, 0.07, 0.13, 0.93),
    ];
  },
};
export const cat = {
  name: "cat", frames: 6, box: [-0.6, -0.05, 0.6, 0.85],
  build: ({ f = 0, sleep = 0 }) => {
    const t = sin((f / 6) * TAU);
    if (sleep) return [
      E(0, 0.13, 0, 0.3, 0.14 + 0.012 * t, 0.2, 0.22), S(0.24, 0.14, 0.1, 0.13, 0.22),
      E(0.27, 0.27, 0.16, 0.04, 0.06, 0.03, 0.22), E(0.2, 0.27, 0.04, 0.04, 0.06, 0.03, 0.22),
      C(-0.26, 0.08, 0.02, -0.1, 0.05, 0.22, 0.045, 0.22), C(-0.1, 0.05, 0.22, 0.14, 0.05, 0.23, 0.04, 0.9),
    ];
    return [
      E(-0.02, 0.22, 0, 0.19, 0.22, 0.16, (x) => (x > 0.08 ? 0.92 : 0.22)),
      S(0.14, 0.5, 0, 0.165, 0.22),
      E(0.13, 0.68, 0.1, 0.05, 0.085, 0.035, 0.22), E(0.13, 0.68, -0.1, 0.05, 0.085, 0.035, 0.22),
      S(0.28, 0.52, 0.07, 0.032, 10.9), S(0.28, 0.52, -0.07, 0.032, 10.9),
      S(0.3, 0.45, 0, 0.03, 0.85),
      E(0.14, 0.03, 0.08, 0.07, 0.04, 0.05, 0.92), E(0.14, 0.03, -0.08, 0.07, 0.04, 0.05, 0.92),
      C(-0.18, 0.06, 0, -0.38, 0.1 + 0.06 * t, 0.12, 0.04, 0.22), C(-0.38, 0.1 + 0.06 * t, 0.12, -0.42, 0.3 + 0.1 * t, 0.16, 0.035, 0.22),
    ];
  },
};
export const gull = {
  name: "gull", frames: 6, box: [-0.7, -0.15, 0.7, 0.95],
  build: ({ f = 0, fly = 0 }) => {
    const w = fly ? sin((f / 6) * TAU) : -0.9, P = [
      E(0, 0.3, 0, 0.22, 0.14, 0.13, 0.96), S(0.2, 0.44, 0, 0.095, 0.96),
      C(0.28, 0.43, 0, 0.4, 0.4, 0, 0.026, 0.55), S(0.25, 0.47, 0.07, 0.022, 0.04),
      E(-0.26, 0.3, 0, 0.1, 0.03, 0.09, 0.5),
    ];
    for (const g of [1, -1]) {
      if (fly) {
        P.push(C(0, 0.34, g * 0.1, -0.08, 0.36 + 0.34 * w, g * (0.42 - 0.1 * abs(w)), 0.055, 0.6));
        P.push(C(-0.08, 0.36 + 0.34 * w, g * (0.42 - 0.1 * abs(w)), -0.16, 0.36 + 0.5 * w, g * 0.62, 0.035, 0.3));
      } else {
        P.push(E(-0.05, 0.33, g * 0.12, 0.18, 0.09, 0.04, 0.58), C(0.02, 0.2, g * 0.05, 0.03, 0.0, g * 0.05, 0.016, 0.5));
      }
    }
    return P;
  },
};

// ---------- the room ----------
export const radio = {
  name: "radio", box: [-0.55, -0.05, 0.7, 1.15],
  build: ({ talk = 0, f = 0 }) => [
    B(0, 0.22, 0, 0.36, 0.21, 0.15, 0.05, (x, y, z) => {
      if (z > 0.1) {
        const q = Math.hypot(x + 0.13, y - 0.22);
        if (q < 0.135 + (talk ? 0.012 * (f % 2) : 0)) return sin(y * 70) > 0 ? 0.1 : 0.3; // speaker grille
      }
      return 0.48;
    }),
    CZ(0.2, 0.3, 0.15, 0.075, 0.02, talk ? 20.9 : 0.85),                               // dial lights red when he speaks
    S(0.14, 0.1, 0.16, 0.035, 0.85), S(0.26, 0.1, 0.16, 0.035, 0.85),
    C(0.28, 0.42, -0.05, 0.42, 1.0, -0.05, 0.014, 0.9), S(0.42, 1.0, -0.05, 0.03, 0.9),
    TZ(0, 0.45, 0, 0.14, 0.02, 0.35),
  ],
};
export const desk = { name: "desk", box: [-1.1, -0.05, 1.1, 0.95], build: () => [
  B(0, 0.74, 0, 0.78, 0.04, 0.34, 0.02, 0.66), B(0, 0.62, 0, 0.7, 0.07, 0.3, 0.01, 0.5),
  ...[[-0.68, 0.26], [0.68, 0.26], [-0.68, -0.26], [0.68, -0.26]].map(([x, z]) => C(x, 0.02, z, x, 0.7, z, 0.045, 0.42)),
  CZ(-0.3, 0.62, 0.31, 0.03, 0.02, 0.85),
] };
export const chair = { name: "chair", box: [-0.5, -0.05, 0.5, 1.2], build: () => [
  B(0, 0.44, 0, 0.2, 0.03, 0.2, 0.02, 0.6), B(-0.19, 0.78, 0, 0.03, 0.28, 0.2, 0.02, 0.6),
  ...[[-0.17, 0.17], [0.17, 0.17], [-0.17, -0.17], [0.17, -0.17]].map(([x, z]) => C(x, 0.02, z, x, 0.42, z, 0.03, 0.42)),
] };
export const mug = { name: "mug", box: [-0.25, -0.05, 0.3, 0.35], build: () => [
  CY(0, 0.11, 0, 0.085, 0.11, (x, y) => (y > 0.19 ? 0.2 : 0.95)), TZ(0.1, 0.11, 0, 0.055, 0.018, 0.95),
] };
export const lampShade = { name: "lampShade", box: [-0.5, -0.4, 0.5, 0.5], build: () => [
  E(0, 0.02, 0, 0.3, 0.2, 0.3, 0.72), cut(B(0, -0.24, 0, 0.5, 0.2, 0.5, 0)),
  S(0, -0.04, 0, 0.085, 10.98), C(0, 0.2, 0, 0, 0.5, 0, 0.018, 0.3),
] };

// ---------- the deck ----------
export const drum = { name: "drum", box: [-1.25, -0.05, 1.25, 2.05], build: () => [
  CZ(0, 1.0, 0.46, 0.95, 0.04, 0.6), CZ(0, 1.0, -0.46, 0.95, 0.04, 0.6),
  CZ(0, 1.0, 0, 0.62, 0.44, (x, y, z) => (sin(z * 60) > 0 ? 0.86 : 0.62)),          // the slack, wound
  CZ(0, 1.0, 0.5, 0.12, 0.04, 0.3),
  B(-0.7, 0.08, 0, 0.08, 0.08, 0.6, 0.02, 0.4), B(0.7, 0.08, 0, 0.08, 0.08, 0.6, 0.02, 0.4),
  C(-0.7, 0.1, 0.5, 0, 1.0, 0.52, 0.04, 0.4), C(0.7, 0.1, 0.5, 0, 1.0, 0.52, 0.04, 0.4),
] };
export const crate = { name: "crate", box: [-0.6, -0.05, 0.6, 0.75], build: () => [
  B(0, 0.3, 0, 0.36, 0.3, 0.3, 0.02, (x, y) => (abs(((y * 5) % 1) - 0.5) < 0.06 ? 0.35 : 0.62)),
  B(0, 0.3, 0.3, 0.38, 0.04, 0.03, 0.01, 0.5),
] };

// ---------- the machine ----------
export const sub = {
  name: "sub", frames: 4, box: [-1.75, -0.1, 1.45, 1.6],
  build: ({ f = 0, lit = 1 }) => {
    const pa = (f / 4) * PI * 0.5, P = [
      C(-0.55, 0.72, 0, 0.5, 0.72, 0, 0.48, (x, y) => (abs(x + 0.2) < 0.07 ? 0.3 : y < 0.48 ? 0.58 : 0.9)),
      S(0.55, 0.98, 0, 0.37, glass(1.12, 0.08)),                                       // dome
      TZ(0.55, 0.98, 0.3, 0.2, 0.03, 0.6),
      CY(-0.25, 1.22, 0, 0.17, 0.08, 0.55), CY(-0.25, 1.32, 0, 0.1, 0.03, 0.8),         // hatch
      C(0.86, 0.42, 0.14, 1.0, 0.42, 0.14, 0.115, 0.5), S(1.07, 0.42, 0.14, 0.09, lit ? 10.98 : 0.3),
      S(-0.12, 0.8, 0.44, 0.15, 0.62), S(-0.12, 0.8, 0.5, 0.11, 0.1),                    // side porthole
      C(-1.0, 0.72, 0, -1.2, 0.72, 0, 0.2, 0.6), TX(-1.34, 0.72, 0, 0.36, 0.03, 0.5),
      B(-0.95, 1.2, 0, 0.14, 0.15, 0.025, 0.02, 0.72),
      C(0.7, 0.36, -0.16, 1.02, 0.2, -0.16, 0.04, 0.5), S(1.05, 0.18, -0.16, 0.06, 0.75),
    ];
    for (const g of [1, -1]) {
      P.push(C(-0.6, 0.1, g * 0.32, 0.55, 0.1, g * 0.32, 0.05, 0.4));
      P.push(C(-0.3, 0.1, g * 0.32, -0.3, 0.36, g * 0.26, 0.035, 0.4), C(0.3, 0.1, g * 0.32, 0.3, 0.36, g * 0.26, 0.035, 0.4));
    }
    for (const q of [0, PI / 2]) {
      const c = cos(pa + q), s = sin(pa + q);
      P.push({ d: (x, y, z) => { const yy = y - 0.72; return box(x + 1.34, c * yy + s * z, -s * yy + c * z, 0.025, 0.32, 0.07, 0.02); }, a: 0.55 });
    }
    return P;
  },
};

// ---------- the sea ----------
export const fish = { name: "fish", frames: 4, box: [-0.45, -0.25, 0.4, 0.3], build: ({ f = 0 }) => {
  const w = sin((f / 4) * TAU) * 0.1;
  return [E(0, 0, 0, 0.24, 0.13, 0.085, (x) => (x > 0.0 && x < 0.07 ? 0.35 : 0.93)), E(-0.3, 0, w, 0.1, 0.13, 0.03, 0.7), S(0.15, 0.035, 0.07, 0.032, 0.04), E(0, 0.14, 0, 0.08, 0.05, 0.02, 0.7)];
} };
export const jelly = { name: "jelly", frames: 8, box: [-0.6, -1.2, 0.6, 0.45], build: ({ f = 0 }) => {
  const ph = (f / 8) * TAU, p = sin(ph), P = [
    E(0, 0, 0, 0.34 + 0.05 * p, 0.27 - 0.05 * p, 0.34 + 0.05 * p, 10.3), cut(B(0, -0.34, 0, 0.7, 0.26, 0.7, 0)),
    C(0, -0.02, 0, 0.05 * sin(ph + 1), -0.45, 0, 0.07, 0.86),
  ];
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * TAU + 0.4, bx = cos(th) * 0.24, bz = sin(th) * 0.24, s1 = 0.07 * sin(ph + i), s2 = 0.12 * sin(ph + i + 1.2);
    P.push(C(bx, -0.08, bz, bx + s1, -0.45, bz, 0.028, 10.14), C(bx + s1, -0.45, bz, bx + s2, -0.85 - 0.08 * p, bz, 0.022, 10.1));
  }
  return P;
} };
export const turtle = { name: "turtle", frames: 8, box: [-0.85, -0.55, 0.9, 0.5], build: ({ f = 0 }) => {
  const fa = sin((f / 8) * TAU) * 0.7, P = [
    E(0, 0.06, 0, 0.42, 0.2, 0.34, (x, y, z) => (y > 0.08 && sin(x * 15) * sin(z * 15 + 1) > 0.25 ? 0.28 : 0.52)),
    E(0, -0.05, 0, 0.38, 0.12, 0.3, 0.86), C(0.34, 0, 0, 0.5, 0.03, 0, 0.085, 0.82), S(0.55, 0.04, 0, 0.135, 0.82),
    S(0.62, 0.08, 0.1, 0.032, 0.04), C(-0.4, 0, 0, -0.52, -0.02, 0, 0.04, 0.8),
  ];
  for (const g of [1, -1]) {
    P.push(C(0.22, 0, g * 0.28, 0.04, -0.34 * sin(fa), g * (0.3 + 0.44 * cos(fa)), 0.062, 0.78));
    P.push(C(-0.3, 0, g * 0.25, -0.5, -0.04, g * 0.4, 0.05, 0.78));
  }
  return P;
} };
export const octo = { name: "octo", frames: 8, box: [-0.95, -0.08, 0.95, 1.0], build: ({ f = 0, hide = 0 }) => {
  const ph = (f / 8) * TAU, P = hide
    ? [E(0, 0.2, 0, 0.36, 0.2, 0.32, 0.5), S(0.24, 0.24, 0.14, 0.06, 0.95), S(0.24, 0.24, -0.14, 0.06, 0.95), S(0.29, 0.24, 0.15, 0.03, 0.04), S(0.29, 0.24, -0.15, 0.03, 0.04)]
    : [E(0, 0.5, 0, 0.3, 0.36 + 0.012 * sin(ph), 0.28, 0.84), S(0.2, 0.42, 0.15, 0.09, 0.97), S(0.2, 0.42, -0.15, 0.09, 0.97),
       S(0.275, 0.42, 0.165, 0.042, 0.04), S(0.275, 0.42, -0.165, 0.042, 0.04), S(0.24, 0.28, 0.22, 0.05, 0.62), S(0.3, 0.3, 0, 0.03, 0.5)];
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * TAU + 0.3, c = cos(th), s = sin(th), R = hide ? 0.5 : 0.72;
    const my = 0.07 + 0.04 * sin(ph + i), ty = 0.05 + (hide ? 0 : 0.2 * max(0, sin(ph + i * 1.3)));
    P.push(C(c * 0.16, 0.14, s * 0.16, c * 0.44, my, s * 0.44, 0.075, hide ? 0.5 : 0.84, 0.08), C(c * 0.44, my, s * 0.44, c * R, ty, s * R, 0.05, hide ? 0.5 : 0.84));
  }
  return P;
} };
export const angler = { name: "angler", frames: 6, box: [-0.9, -0.6, 1.0, 0.9], build: ({ f = 0 }) => {
  const w = sin((f / 6) * TAU) * 0.12, P = [
    E(0, 0, 0, 0.5, 0.4, 0.32, 0.22), cut(S(0.46, -0.1, 0, 0.26)),
    S(0.24, 0.2, 0.25, 0.075, 0.96), S(0.29, 0.2, 0.3, 0.032, 0.04),
    C(0.1, 0.38, 0, 0.45, 0.76, 0, 0.024, 0.3), C(0.45, 0.76, 0, 0.76, 0.6 + 0.03 * w * 8, 0, 0.022, 0.3), S(0.79, 0.56 + 0.03 * w * 8, 0, 0.08, 20.98),
    E(-0.6, 0, w, 0.2, 0.26, 0.04, 0.26), E(-0.1, 0.4, 0, 0.16, 0.1, 0.03, 0.26), E(0.05, -0.1, 0.33, 0.12, 0.05, 0.03, 0.26),
  ];
  for (const z of [-0.16, -0.06, 0.06, 0.16]) P.push(E(0.47, 0.1 - abs(z) * 0.3, z, 0.028, 0.075, 0.028, 0.97), E(0.44, -0.28 + abs(z) * 0.3, z, 0.026, 0.06, 0.026, 0.97));
  return P;
} };
export const crab = { name: "crab", frames: 4, box: [-0.75, -0.05, 0.75, 0.7], build: ({ f = 0 }) => {
  // faces the camera: wide shell, eyes on stalks, claws up
  const t = sin((f / 4) * TAU), P = [E(0, 0.2, 0, 0.32, 0.15, 0.2, 0.8), E(0, 0.14, 0.12, 0.2, 0.06, 0.08, 0.92)];
  for (const g of [1, -1]) {
    P.push(C(g * 0.1, 0.3, 0.12, g * 0.11, 0.44, 0.14, 0.022, 0.7), S(g * 0.11, 0.48, 0.14, 0.055, 0.97), S(g * 0.11, 0.485, 0.19, 0.026, 0.04));
    P.push(C(g * 0.28, 0.22, 0.1, g * 0.46, 0.36 + 0.04 * t * g, 0.16, 0.045, 0.78));
    P.push(E(g * 0.5, 0.45 + 0.04 * t * g, 0.16, 0.12, 0.1, 0.07, 0.86), cut(B(g * 0.5, 0.56 + 0.04 * t * g, 0.16, 0.02 + 0.012 * (1 + t * g), 0.08, 0.1, 0)));
    for (let i = 0; i < 3; i++) P.push(C(g * 0.24, 0.16, -0.08 + i * 0.08, g * (0.5 + i * 0.04), 0.03 + 0.035 * max(0, t * (i % 2 ? 1 : -1) * g), -0.12 + i * 0.12, 0.03, 0.72));
  }
  return P;
} };
// the one with the ears: a bell, two fins it rows with, and eyes too big for it
export const dumbo = { name: "dumbo", frames: 8, box: [-0.7, -0.65, 0.7, 0.7], build: ({ f = 0 }) => {
  const ph = (f / 8) * TAU, fl = sin(ph), P = [
    E(0, 0.08, 0, 0.33, 0.3, 0.3, 0.86), E(0, -0.24, 0, 0.3 + 0.03 * fl, 0.15 - 0.03 * fl, 0.27 + 0.03 * fl, 0.8, 0.12),
    S(0.25, 0.04, 0.14, 0.085, 0.98), S(0.25, 0.04, -0.14, 0.085, 0.98), S(0.32, 0.035, 0.155, 0.04, 0.03), S(0.32, 0.035, -0.155, 0.04, 0.03),
    S(0.28, -0.1, 0.2, 0.045, 0.62), S(0.33, -0.06, 0, 0.025, 0.5),
  ];
  for (const g of [1, -1]) P.push(E(-0.06, 0.34 + 0.07 * fl, g * (0.3 + 0.03 * fl), 0.13, 0.17 + 0.03 * fl, 0.05, 0.82, 0.05));
  for (let i = 0; i < 6; i++) { const th = (i / 6) * TAU + 0.3; P.push(S(cos(th) * 0.24, -0.36 - 0.03 * fl, sin(th) * 0.22, 0.06, 0.8, 0.06)); }
  return P;
} };
// a sea pig: a soft loaf on tube feet, with a few opinions growing out of its back
export const seapig = { name: "seapig", frames: 6, box: [-0.6, -0.05, 0.6, 0.6], build: ({ f = 0 }) => {
  const ph = (f / 6) * TAU, P = [E(0, 0.22, 0, 0.34, 0.19, 0.22, 0.9), S(0.3, 0.27, 0.09, 0.026, 0.04), S(0.3, 0.27, -0.09, 0.026, 0.04)];
  for (let i = 0; i < 5; i++) for (const g of [1, -1]) { const x = -0.24 + i * 0.12; P.push(C(x, 0.12, g * 0.14, x + 0.04 * sin(ph + i * 1.3), 0.0, g * 0.17, 0.036, 0.84)); }
  for (const [x, z] of [[-0.14, 0.07], [0.02, -0.06], [0.14, 0.06], [-0.02, 0.1]]) P.push(C(x, 0.36, z, x - 0.05, 0.52, z * 1.4, 0.02, 0.84));
  for (const z of [-0.07, 0, 0.07]) P.push(S(0.35, 0.15, z, 0.035, 0.84));
  return P;
} };
export const starfish = { name: "starfish", box: [-0.42, -0.05, 0.42, 0.3], build: () => [
  S(0, 0.05, 0, 0.1, 0.84, 0.05), ...[0, 1, 2, 3, 4].map((i) => { const th = (i / 5) * TAU + 0.3; return C(0, 0.05, 0, cos(th) * 0.3, 0.035, sin(th) * 0.3, 0.06, 0.84, 0.06); }),
] };
export const rock = { name: "rock", box: [-0.95, -0.05, 0.95, 0.85], build: ({ s = 0 }) => {
  const h = (n) => { const v = sin((s + 1) * 12.9898 + n * 78.233) * 43758.5453; return v - floor(v); };
  return [0, 1, 2, 3].map((i) => E(-0.5 + i * 0.32 + h(i) * 0.1, 0.12 + h(i + 5) * 0.2, (h(i + 9) - 0.5) * 0.3, 0.28 + h(i + 2) * 0.16, 0.2 + h(i + 3) * 0.24, 0.3, 0.4 + h(i + 7) * 0.1, 0.12));
} };

// ---------- what was left down there ----------
export const helmet = { name: "helmet", box: [-0.5, -0.05, 0.55, 0.8], build: () => [
  S(0, 0.38, 0, 0.3, 0.72), CY(0, 0.08, 0, 0.3, 0.07, 0.55), CY(0, 0.16, 0, 0.26, 0.03, 0.4),
  CX(0.27, 0.4, 0, 0.15, 0.04, 0.5), S(0.27, 0.4, 0, 0.115, 0.1),
  CZ(0, 0.42, 0.27, 0.095, 0.035, 0.5), S(0, 0.42, 0.27, 0.07, 0.1), S(0, 0.7, 0, 0.05, 0.5),
] };
export const pod = { name: "pod", box: [-0.85, -0.05, 0.85, 0.8], build: ({ on = 0, red: rd = 0 }) => [
  C(-0.42, 0.32, 0, 0.42, 0.32, 0, 0.2, (x) => (abs(abs(x) - 0.32) < 0.04 ? 0.32 : 0.8)),
  B(-0.3, 0.1, 0, 0.04, 0.1, 0.24, 0.01, 0.42), B(0.3, 0.1, 0, 0.04, 0.1, 0.24, 0.01, 0.42),
  B(0, 0.56, 0, 0.05, 0.05, 0.05, 0.01, 0.5), S(0, 0.64, 0, 0.05, on ? (rd ? 20.98 : 10.98) : 0.3),
] };
export const rov = { name: "rov", box: [-0.9, -0.05, 0.9, 0.95], build: () => [
  B(0, 0.64, 0, 0.5, 0.12, 0.3, 0.06, 0.92),
  B(0, 0.32, 0, 0.48, 0.2, 0.28, 0.03, (x, y, z) => (abs(x) < 0.34 && abs(y - 0.32) < 0.11 && z > 0.2 ? 0.14 : 0.56)),
  S(0.5, 0.36, 0, 0.16, glass(0.4, 0.0)), CX(-0.52, 0.32, 0.2, 0.09, 0.08, 0.4), CX(-0.52, 0.32, -0.2, 0.09, 0.08, 0.4),
  C(-0.45, 0.04, 0.26, 0.45, 0.04, 0.26, 0.04, 0.4), C(-0.45, 0.04, -0.26, 0.45, 0.04, -0.26, 0.04, 0.4),
  S(0.46, 0.56, 0.2, 0.05, 0.62), S(0.46, 0.56, -0.2, 0.05, 0.62), C(-0.3, 0.76, 0, -0.6, 0.9, 0, 0.03, 0.5),
] };
export const kettle = { name: "kettle", box: [-0.45, -0.05, 0.5, 0.75], build: () => [
  E(0, 0.2, 0, 0.23, 0.2, 0.23, (x, y, z) => (sin(x * 23 + y * 31) * sin(z * 19) > 0.5 ? 0.3 : 0.52)),
  E(0, 0.38, 0, 0.12, 0.04, 0.12, 0.6), S(0, 0.43, 0, 0.035, 0.7), C(0.17, 0.22, 0, 0.36, 0.38, 0, 0.036, 0.5), TZ(0, 0.4, 0, 0.18, 0.022, 0.4),
] };
export const barnacles = { name: "barnacles", box: [-0.42, -0.05, 0.42, 0.4], build: () => [
  ...[[-0.2, 0.05], [0, -0.06], [0.2, 0.04], [-0.08, 0.12], [0.1, 0.14]].flatMap(([x, z], i) => [E(x, 0.06, z, 0.1, 0.12 + (i % 2) * 0.04, 0.1, 0.74, 0.03), cut(S(x, 0.2 + (i % 2) * 0.04, z, 0.045))]),
] };
export const sleeve = { name: "sleeve", box: [-0.5, -0.25, 0.5, 0.3], build: () => [
  CX(0, 0, 0, 0.125, 0.27, 0.96), CX(0.27, 0, 0, 0.15, 0.03, 0.6), CX(-0.27, 0, 0, 0.15, 0.03, 0.6),
  cut(S(0.08, 0.15, 0.08, 0.085)), cut(S(-0.1, 0.13, 0.1, 0.065)), cut(S(0.02, 0.14, 0.1, 0.05)),
] };
export const jumper = { name: "jumper", box: [-0.5, -0.05, 0.5, 0.4], build: () => [
  B(0, 0.09, 0, 0.25, 0.08, 0.2, 0.06, (x) => (floor((x + 1) * 9) % 2 ? 0.96 : 0.72)),
  C(-0.2, 0.2, 0.1, 0.12, 0.2, -0.06, 0.05, 0.96), C(0.2, 0.2, 0.1, -0.12, 0.21, -0.06, 0.05, 0.9), TZ(0, 0.18, -0.16, 0.07, 0.02, 0.72),
] };

export const ALL = { diver, swimmer, beacon, dumbo, seapig, bo, cat, gull, radio, desk, chair, mug, lampShade, drum, crate, sub, fish, jelly, turtle, octo, angler, crab, starfish, rock, helmet, pod, rov, kettle, barnacles, sleeve, jumper };
