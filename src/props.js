/*
 * Bitlight props — reusable pieces of geometry, shared by figures and films.
 *
 * Every prop is a plain signed-distance function in its own local frame
 * (base on y = 0 unless noted). Compose them with Math.min, move them by
 * offsetting the arguments, scale with f(x / s, y / s, z / s) * s.
 * `towerPart` tells a material function which part of the computer a surface
 * point belongs to, so figures (tone) and films (tone + glow) can dress it alike.
 */
import { sd } from "./core.js";

const { box, sphere, cylinder, capsule, smin } = sd;
const { abs, max, min, sqrt, sin, cos, atan2, PI } = Math;
const cylZ = (x, y, z, r, h) => cylinder(x, z, y, r, h); // axis along z
const norm = ([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

// ---------- the computer: one tower, two fans, side vents, a power light ----------
// local frame: base at y = 0, front face at z = +0.4
export function tower(x, y, z, fan) {
  const outer = box(x, y - 0.46, z, 0.2, 0.46, 0.4, 0.025);
  if (outer > 0.04) return outer;
  let d = outer;
  for (let i = 0; i < 4; i++) d = max(d, -box(x - 0.2, y - (0.56 + i * 0.09), z + 0.02, 0.03, 0.018, 0.25, 0.006));
  const sector = (2 * PI) / 7;
  for (let f = 0; f < 2; f++) {
    const ry = y - (f ? 0.29 : 0.63), rz = z - 0.4;
    d = max(d, -cylZ(x, ry, rz, 0.145, 0.05));
    const r = sqrt(x * x + ry * ry);
    if (r < 0.17 && rz > -0.08) {
      let th = atan2(ry, x) - fan * (f ? -1 : 1);
      th = (((th % sector) + sector) % sector) - sector / 2;
      const px = r * cos(th) - 0.085, py = r * sin(th) - 0.02 * (r - 0.03) / 0.1;
      const bx = abs(px) - 0.052, by = abs(py) - 0.014;
      const blade2 = sqrt(max(bx, 0) ** 2 + max(by, 0) ** 2) + min(max(bx, by), 0);
      const blade = max(blade2, abs(rz + 0.03) - 0.005);
      d = min(d, blade, cylZ(x, ry, rz + 0.03, 0.036, 0.012));
      // guard: two rings and a bar, proud of the face
      const ringA = Math.hypot(r - 0.142, rz - 0.004) - 0.007, ringB = Math.hypot(r - 0.08, rz - 0.004) - 0.005;
      const bar = max(abs(x) - 0.004, abs(rz - 0.004) - 0.004, r - 0.142);
      d = min(d, ringA, ringB, bar);
    }
  }
  return min(d, cylZ(x - 0.12, y - 0.86, z - 0.4, 0.022, 0.008));
}
// which part of the computer a surface point is on (local frame of tower())
export function towerPart(x, y, z) {
  if (z > 0.395 && Math.hypot(x - 0.12, y - 0.86) < 0.024) return "light";
  if (z < 0.355 && (Math.hypot(x, y - 0.63) < 0.146 || Math.hypot(x, y - 0.29) < 0.146)) return "well";
  if (z < 0.385 && (Math.hypot(x, y - 0.63) < 0.146 || Math.hypot(x, y - 0.29) < 0.146)) return "blade";
  return "body";
}

// ---------- a desk with a monitor, keyboard, mug, desk lamp and the computer ----------
export const LAMP_HEAD = [-0.58, 1.42, 0.78];
export const LAMP_DIR = norm([1.2, -0.45, -0.38]);
export const TX = 0.76, TY = 0.765; // the tower sits on the desk
// the desk itself: top and four legs
export function deskFrame(x, y, z) {
  let d = box(x, y - 0.74, z, 1.1, 0.025, 0.5, 0.01); // top
  for (const sx of [-1.03, 1.03]) for (const sz of [-0.43, 0.43]) d = min(d, box(x - sx, y - 0.36, z - sz, 0.03, 0.36, 0.03));
  return d;
}
// what stands on it: monitor, stand, keyboard, mug
export function deskGear(x, y, z) {
  const mx = x + 0.38;
  let d = box(mx, y - 1.2, z + 0.22, 0.45, 0.27, 0.02, 0.012); // monitor
  d = min(d, box(mx, y - 0.88, z + 0.25, 0.035, 0.13, 0.025), box(mx, y - 0.772, z + 0.22, 0.16, 0.007, 0.1, 0.005));
  d = min(d, box(mx, y - 0.782, z - 0.13, 0.34, 0.016, 0.11, 0.008)); // keyboard
  const mug = max(cylinder(x - 0.22, y - 0.86, z - 0.3, 0.065, 0.095, 0.01), -cylinder(x - 0.22, y - 0.89, z - 0.3, 0.052, 0.09));
  return min(d, mug);
}
// the desk lamp: base, two arms, and (when drawn) a shade around the bulb
export function deskLamp(x, y, z, withShade) {
  let d = cylinder(x + 0.95, y - 0.77, z - 0.3, 0.09, 0.012, 0.005);
  d = min(d, capsule(x, y, z, -0.95, 0.78, 0.3, -0.92, 1.38, 0.22, 0.014));
  d = min(d, capsule(x, y, z, -0.92, 1.38, 0.22, LAMP_HEAD[0], LAMP_HEAD[1], LAMP_HEAD[2], 0.014));
  if (withShade) {
    const qx = x - LAMP_HEAD[0], qy = y - LAMP_HEAD[1], qz = z - LAMP_HEAD[2];
    const shell = max(abs(sphere(qx, qy, qz, 0.1)) - 0.006, qx * LAMP_DIR[0] + qy * LAMP_DIR[1] + qz * LAMP_DIR[2] - 0.035);
    d = min(d, shell, sphere(qx - LAMP_DIR[0] * 0.03, qy - LAMP_DIR[1] * 0.03, qz - LAMP_DIR[2] * 0.03, 0.03));
  }
  return d;
}
// bounding boxes [cx, cy, cz, hx, hy, hz] around each group, for early-outs
export const DESK_BOUNDS = { frame: [0, 0.38, 0, 1.12, 0.4, 0.52], gear: [-0.27, 1.11, 0.05, 0.58, 0.37, 0.33], lamp: [-0.76, 1.14, 0.54, 0.29, 0.39, 0.35] };
export function deskObjects(x, y, z, withShade) {
  return min(deskFrame(x, y, z), deskGear(x, y, z), deskLamp(x, y, z, withShade), tower(x - TX, y - TY, z + 0.04, 0));
}
// ---------- server racks: rows facing +z, repeated along x ----------
export const P = 0.5, ROW = 1.7;
// one rack, local frame centred on its footprint
export const rackUnit = (x, y, z) => box(x, y - 0.62, z, 0.22, 0.62, 0.3, 0.008);
export function rack(x, y, z) {
  const xi = Math.round(x / P), lx = x - xi * P;
  const zi = max(-6, min(0, Math.round(z / ROW))), lz = z - zi * ROW;
  return box(lx, y - 0.62, lz, 0.22, 0.62, 0.3, 0.008);
}
// ---------- a café table with a laptop, a cup and a plant ----------
export const HINGE_Y = 0.79, HINGE_Z = -0.12;
export function laptop(x, y, z, th) {
  let d = box(x - 0.05, y - 0.778, z - 0.1, 0.32, 0.012, 0.22, 0.008);
  const dy = sin(th), dz = cos(th), ny = cos(th), nz = -sin(th);
  const qy = y - HINGE_Y, qz = z - HINGE_Z;
  const along = qy * dy + qz * dz, nrm = qy * ny + qz * nz;
  return min(d, box(x - 0.05, along - 0.215, nrm - 0.008, 0.32, 0.215, 0.008, 0.006));
}
export function cafe(x, y, z, th) {
  let d = cylinder(x, y - 0.74, z, 0.95, 0.025, 0.01);
  d = min(d, cylinder(x, y - 0.37, z, 0.045, 0.37), cylinder(x, y - 0.015, z, 0.34, 0.015, 0.006));
  d = min(d, laptop(x, y, z, th));
  d = min(d, max(cylinder(x - 0.62, y - 0.85, z - 0.38, 0.06, 0.085, 0.01), -cylinder(x - 0.62, y - 0.88, z - 0.38, 0.048, 0.08)));
  // a small plant: pot and three leaves
  d = min(d, cylinder(x + 0.55, y - 0.82, z + 0.32, 0.085, 0.06, 0.01));
  const leaves = smin(smin(sphere(x + 0.55, y - 0.95, z + 0.32, 0.07), sphere(x + 0.5, y - 1.02, z + 0.36, 0.05), 0.06), sphere(x + 0.6, y - 1.0, z + 0.28, 0.05), 0.06);
  return min(d, leaves);
}
// ---------- a cloud bank (flat bottom at y = 0.16) ----------
// a flat-bottomed bank: a middle row of big puffs, smaller ones in front and behind
export const PUFFS = [[-0.8, 0.28, 0, 0.2], [-0.42, 0.34, 0.02, 0.27], [0, 0.38, 0, 0.32], [0.42, 0.34, -0.02, 0.27], [0.8, 0.28, 0, 0.2],
  [-0.55, 0.24, 0.3, 0.18], [-0.15, 0.26, 0.34, 0.2], [0.28, 0.25, 0.32, 0.19], [0.62, 0.22, 0.28, 0.16],
  [-0.5, 0.25, -0.3, 0.19], [0.15, 0.28, -0.32, 0.21], [0.55, 0.24, -0.28, 0.17]];
export function cloud(x, y, z) {
  let d = 9;
  for (const [px, py, pz, r] of PUFFS) d = smin(d, sphere(x - px, y - py, z - pz, r), 0.1);
  return max(d, 0.16 - y);
}
