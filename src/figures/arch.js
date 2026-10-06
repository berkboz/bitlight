// Arch — a stone arch on a step. Light through the opening lands as a bright arch inside its shadow.
import { define, sd } from "../bitlight.js";

const { box, cylinder } = sd;
const cylZ = (x, y, z, r, h) => cylinder(x, z, y, r, h);
// turned ~30° toward the camera so the opening reads at rest
const C = Math.cos(0.5), S = Math.sin(0.5);
const turn = (f) => (x, y, z) => f(C * x - S * z, y, S * x + C * z);
export default define({
  name: "Arch",
  means: "A stone arch. Swing the lamp and a bright arch of light walks across its shadow.",
  sdf: turn((x, y, z) => {
    const block = box(x, y - 0.68, z, 0.72, 0.62, 0.17, 0.02);
    const opening = Math.min(box(x, y - 0.3, z, 0.34, 0.32, 0.4), cylZ(x, y - 0.62, z, 0.34, 0.4));
    const step = box(x, y - 0.03, z, 0.84, 0.03, 0.27, 0.01);
    return Math.min(Math.max(block, -opening), step);
  }),
  // a keystone line and voussoir joints, as tone
  albedo: turn((x, y, z) => {
    const r = Math.hypot(x, y - 0.62);
    if (y > 0.62 && r > 0.34 && r < 0.62) {
      const a = Math.atan2(y - 0.62, x) / Math.PI * 7;
      if (Math.abs(a - Math.round(a)) < 0.06) return 0.55;
    }
    return 0.9;
  }),
  bound: [0, 0.68, 0, 1.12],
  rest: [-0.45, 1.5, 1.35],
});
