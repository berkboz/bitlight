// Moon — a cratered sphere on a pin. The terminator crosses the craters; the read-out names the phase.
import { define, sd } from "../bitlight.js";

const { sphere, cylinder } = sd;
const C = [0, 0.9, 0], R = 0.55;
// craters on the faces we see: direction, radius
const CRATERS = [[0.6, 0.5, 0.62, 0.16], [0.1, 0.75, 0.65, 0.1], [0.85, 0.05, 0.5, 0.12], [0.35, 0.15, 0.92, 0.09],
  [-0.3, 0.6, 0.75, 0.08], [0.7, 0.68, 0.1, 0.09], [0.45, -0.35, 0.82, 0.11]].map(([x, y, z, r]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l, r];
});
const VIEW = [0.612, 0.5, 0.612], RIGHT = [0.707, 0, -0.707]; // default camera
export default define({
  name: "Moon",
  means: "A cratered moon on a pin. Circle the lamp to run through its phases.",
  sdf(x, y, z) {
    const px = x - C[0], py = y - C[1], pz = z - C[2];
    let d = sphere(px, py, pz, R);
    if (d < 0.12) {
      for (const [dx, dy, dz, r] of CRATERS) {
        const k = R + r * 0.55;
        d = Math.max(d, -sphere(px - dx * k, py - dy * k, pz - dz * k, r));
      }
    }
    d = Math.min(d, cylinder(x, y - 0.18, z, 0.025, 0.18)); // pin
    return Math.min(d, cylinder(x, y - 0.02, z, 0.22, 0.02, 0.01)); // foot
  },
  albedo: () => 0.95,
  bound: [0, 0.75, 0, 0.82],
  rest: [1.45, 1.5, -0.1],
  read(L) {
    const lx = L.x - C[0], ly = L.y - C[1], lz = L.z - C[2], l = Math.hypot(lx, ly, lz);
    const cos = (lx * VIEW[0] + ly * VIEW[1] + lz * VIEW[2]) / l;
    const lit = Math.round(((1 + cos) / 2) * 100);
    const waxing = lx * RIGHT[0] + lz * RIGHT[2] > 0;
    const name = lit > 96 ? "full" : lit < 4 ? "new" : lit > 60 ? "gibbous" : lit > 40 ? "half" : "crescent";
    return `${name === "full" || name === "new" ? name : (waxing ? "waxing " : "waning ") + name} · ${lit}% lit`;
  },
});
