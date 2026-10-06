// Columns — a colonnade under a lintel. The lamp combs stripes of shadow across the plate.
import { define, sd } from "../bitlight.js";

const { box, cylinder } = sd;
const SP = 0.5;
export default define({
  name: "Columns",
  means: "Five columns under a lintel. Move the lamp and the stripes of shadow swing across the plate.",
  sdf(x, y, z) {
    const i = Math.max(-2, Math.min(2, Math.round(x / SP))), lx = x - i * SP;
    let d = cylinder(lx, y - 0.62, z, 0.1, 0.5, 0.01); // shaft
    d = Math.min(d, box(lx, y - 1.14, z, 0.15, 0.03, 0.15, 0.01)); // capital
    d = Math.min(d, box(lx, y - 0.12 - 0.02, z, 0.14, 0.02, 0.14, 0.01)); // base
    d = Math.min(d, box(x, y - 0.06, z, 1.25, 0.06, 0.3, 0.015)); // stylobate
    return Math.min(d, box(x, y - 1.24, z, 1.22, 0.07, 0.2, 0.015)); // lintel
  },
  bound: [0, 0.65, 0, 1.45],
  rest: [-0.6, 1.5, 1.3],
});
