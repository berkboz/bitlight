/*
 * Bitlight detail props — three objects built to be looked at closely.
 *
 * Detail at one bit is pixels per object, so these are modelled the way a
 * product shot is: knurled rings, engraved ticks, bevels, a textured grip,
 * moving parts. Each is { sdf(x, y, z, t), tone(x, y, z, t) } in its own frame
 * (base on y = 0, front toward +z). `tone` is the albedo 0–1; material detail
 * (leather grain, milled edges, glass coatings, a screen) lives there, in the
 * dither, instead of in geometry the grid cannot resolve. `t` is seconds and
 * only films pass it: a figure on a page is still (t = 0).
 */
import { sd } from "./core.js";

const { box, cylinder, capsule, rect, torus } = sd;
const { abs, max, min, sin, cos, atan2, floor, PI, hypot } = Math;
const hash = (a, b, c) => { const s = sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - floor(s); };
const cylZ = (x, y, z, r, h, e = 0) => cylinder(x, z, y, r, h, e); // axis along z
const ridge = (th, n) => 0.5 + 0.5 * cos(n * th);

// ---------- rangefinder camera ----------
const LY = 0.2; // lens axis height
export const rangefinder = {
  // turn: 0..1, the film-advance lever and the release button
  sdf(x, y, z, t = 0, turn = 0) {
    if (abs(x) > 0.7 || y > 0.5 || y < -0.01 || z > 0.62 || z < -0.2)
      return max(abs(x) - 0.6, y - 0.45, -y, abs(z - 0.2) - 0.45) + 0.05;
    let d = box(x, y - 0.2, z, 0.56, 0.17, 0.15, 0.035);                       // body
    d = max(d, -box(x + 0.36, y - 0.3, z - 0.15, 0.07, 0.04, 0.03, 0.012));   // finder window
    d = max(d, -box(x - 0.34, y - 0.3, z - 0.15, 0.045, 0.035, 0.03, 0.012)); // rangefinder window
    const r = hypot(x, y - LY);
    if (r < 0.3 && z > 0.1) {
      const th = atan2(y - LY, x);
      const grip = r - 0.012 * ridge(th, 56);                                  // knurled focus ring
      const ring = (rr, z0, z1, rv = r) => rect(rv - rr / 2, z - (z0 + z1) / 2, rr / 2, (z1 - z0) / 2);
      let l = ring(0.255, 0.12, 0.2);                                           // mount
      l = min(l, ring(0.2, 0.2, 0.3), ring(0.222, 0.3, 0.42, grip), ring(0.205, 0.42, 0.5), ring(0.19, 0.5, 0.56));
      l = max(l, -rect(r - 0.07, z - 0.56, 0.07, 0.07));                        // hollow front
      l = min(l, rect(r - 0.07, z - 0.505, 0.07, 0.012));                       // recessed glass
      d = min(d, l);
    }
    if (y > 0.3) {
      d = min(d, cylinder(x - 0.3, y - 0.375, z + 0.02, 0.085 - 0.012 * ridge(atan2(z + 0.02, x - 0.3), 36), 0.035, 0.006)); // shutter dial
      d = min(d, cylinder(x - 0.3, y - 0.42, z + 0.02, 0.04, 0.012, 0.005));
      d = min(d, cylinder(x - 0.14, y - 0.385, z + 0.02, 0.026, 0.02 - 0.01 * turn, 0.006));                                  // release
      d = min(d, cylinder(x + 0.36, y - 0.385, z + 0.02, 0.065 - 0.01 * ridge(atan2(z + 0.02, x + 0.36), 26), 0.03, 0.006)); // rewind knob
      d = min(d, box(x + 0.02, y - 0.372, z + 0.02, 0.1, 0.014, 0.025, 0.004));                                              // shoe
      d = min(d, capsule(x, y, z, 0.46, 0.376, -0.04 + 0.06 * turn, 0.5, 0.39, -0.09 + 0.1 * turn, 0.011));                  // advance lever
    }
    d = min(d, torus(y - 0.3, x - 0.6, z, 0.032, 0.008), torus(y - 0.3, x + 0.6, z, 0.032, 0.008)); // strap lugs
    return d;
  },
  tone(x, y, z) {
    const r = hypot(x, y - LY);
    if (z > 0.1 && r < 0.3) {
      const th = atan2(y - LY, x);
      if (z > 0.3 && z < 0.42 && r > 0.2) return ridge(th, 56) > 0.5 ? 0.97 : 0.5;                              // grip
      if (z > 0.42 && z < 0.5 && r > 0.19) return floor((th + PI) / (2 * PI) * 72) % 6 === 0 ? 0.2 : 0.88;      // engraved ticks
      if (z > 0.495 && r < 0.14) return r < 0.045 ? 0.04 : floor(r / 0.028) % 2 ? 0.12 : 0.34;                  // coated glass
      return 0.84;
    }
    if (z > 0.1 && y > 0.25 && ((x < -0.29 && x > -0.43) || (x > 0.29 && x < 0.39))) return 0.1;               // windows
    if (y < 0.33) return 0.14 + 0.24 * hash(floor(x * 55), floor(y * 55), floor(z * 55));                       // leatherette grain
    return 0.97;                                                                                                 // chrome top plate
  },
  bound: [0, 0.22, 0.2, 0.8],
};

// ---------- pocket watch (dial up, crown toward -z) ----------
const WR = 0.5;
export const pocketWatch = {
  sdf(x, y, z, t = 0) {
    if (hypot(x, z) > 0.75 || y > 0.2) return max(hypot(x, z) - 0.7, y - 0.15) + 0.05;
    const r = hypot(x, z), th = atan2(z, x);
    let d = cylinder(x, y - 0.06, z, WR, 0.06, 0.02);                           // case
    d = max(d, -cylinder(x, y - 0.1, z, WR - 0.07, 0.03));                      // well under the glass
    d = min(d, cylinder(x, y - 0.062, z, WR - 0.075, 0.034, 0.004));            // dial
    if (r > 0.34 && r < 0.43) {                                                 // twelve raised hour markers
      const a = (floor(((th + PI) / (2 * PI)) * 12 + 0.5) % 12 / 12) * 2 * PI - PI;
      d = min(d, box(r * sin(th - a), y - 0.1, r - 0.385, 0.012, 0.012, 0.03, 0.004));
    }
    const hand = (ang, len, w, h) => {
      const c = cos(ang), s = sin(ang), u = x * c + z * s, v = -x * s + z * c;
      return box(v, y - h, u - len / 2 + 0.03, w, 0.007, len / 2 + 0.03, 0.004);
    };
    d = min(d, hand(-PI / 2 + 0.55 + t * 0.02, 0.2, 0.014, 0.115), hand(-PI / 2 - 0.9 + t * 0.2, 0.3, 0.009, 0.125), hand(-PI / 2 + (t * 2 * PI) / 6, 0.34, 0.004, 0.135));
    d = min(d, cylinder(x, y - 0.13, z, 0.022, 0.018, 0.004));
    d = min(d, cylZ(x, y - 0.06, z + WR + 0.05, 0.05 - 0.008 * ridge(atan2(y - 0.06, x), 20), 0.05, 0.006)); // crown
    return min(d, torus(x, z + WR + 0.16, y - 0.06, 0.09, 0.016));                                           // bow
  },
  tone(x, y, z) {
    const r = hypot(x, z), th = atan2(z, x);
    if (y > 0.085 && r < WR - 0.075) {
      if (y > 0.108) return 0.05;                                               // hands and markers
      const tick = floor(((th + PI) / (2 * PI)) * 60 + 0.5);
      if (r > 0.4 && tick % 5 !== 0) return 0.2;                                // minute track
      return abs(r - 0.435) < 0.006 ? 0.3 : 0.95;
    }
    if (r > WR - 0.075 && r < WR - 0.02 && y > 0.08) return floor(((th + PI) / (2 * PI)) * 120) % 2 ? 0.95 : 0.5; // coin-edge bezel
    if (r > WR - 0.01) return floor(((th + PI) / (2 * PI)) * 90) % 2 ? 0.98 : 0.7;                                  // milled rim
    return 0.9;
  },
  bound: [0, 0.08, -0.1, 0.85],
};

// ---------- retro Mac: a bitmap face on the glass ----------
const SY = 0.67;
export const mac = {
  sdf(x, y, z) {
    if (abs(x) > 0.6 || y > 1.0 || abs(z) > 0.5) return max(abs(x) - 0.5, y - 0.95, abs(z) - 0.4) + 0.05;
    let d = box(x, y - 0.56, z, 0.34, 0.4, 0.32, 0.05);                           // case
    d = min(d, box(x, y - 0.95, z + 0.08, 0.27, 0.05, 0.2, 0.03));                // tapered top
    d = max(d, -box(x, y - SY, z - 0.32, 0.25, 0.23, 0.04, 0.025));               // bezel well
    d = min(d, box(x, y - SY, z - 0.285, 0.255, 0.235, 0.01));                    // glass
    d = max(d, -box(x - 0.1, y - 0.19, z - 0.31, 0.12, 0.011, 0.04, 0.006));      // floppy slot
    d = min(d, box(x, y - 0.025, z + 0.02, 0.38, 0.025, 0.34, 0.012));            // foot
    for (let i = 0; i < 5; i++) d = max(d, -box(x - 0.2 + i * -0.1, y - 0.995, z + 0.02, 0.015, 0.03, 0.12, 0.005)); // vents
    return d;
  },
  // the glass: lit pixels are paper, the rest ink; blinks every 2.6 s
  glow(x, y, z, t = 0) {
    if (!(z > 0.27 && abs(x) < 0.255 && abs(y - SY) < 0.235)) return 0;
    const u = x / 0.255, v = (y - SY) / 0.235;
    const gx = floor((u + 1) * 16) - 16, gy = floor((1 - (v + 1) / 2) * 16) - 8;
    const blink = t % 2.6 > 2.45;
    const eye = (cx) => abs(gx - cx) <= 1 && (blink ? gy === -2 : abs(gy + 2) <= 1);
    const mouth = gy >= 2 && gy <= 4 && ((gy === 4 && abs(gx) <= 3) || (gy === 3 && abs(gx) === 4) || (gy === 2 && abs(gx) === 5));
    return eye(-4) || eye(4) || mouth || abs(u) > 0.94 || abs(v) > 0.93 ? 1 : 0;
  },
  tone(x, y, z, t = 0) {
    if (z > 0.27 && abs(x) < 0.255 && abs(y - SY) < 0.235) return mac.glow(x, y, z, t) ? 0.97 : 0.03;
    if (z > 0.3 && y < 0.25 && y > 0.1) return abs(y - 0.19) < 0.012 ? 0.05 : 0.9;   // floppy slot
    if (z > 0.3 && y < 0.14) return 0.74;                                              // chin
    return 0.9;
  },
  bound: [0, 0.5, 0, 1.0],
};
