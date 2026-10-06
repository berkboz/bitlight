// Tower — a computer standing on a plate: one slab, three vent slots, a power ring.
import { define, sd } from "../bitlight.js";

const { box, torus } = sd;
export default define({
  name: "Tower",
  means: "A computer standing on a plate. Its vents catch the lamp one slot at a time.",
  sdf(x, y, z) {
    let d = box(x, y - 0.8, z, 0.42, 0.8, 0.36, 0.05);
    // three vent slots cut into the right face (+x)
    for (let i = 0; i < 3; i++) {
      d = Math.max(d, -box(x - 0.42, y - (1.02 + i * 0.2), z, 0.09, 0.05, 0.24, 0.015));
    }
    // power ring standing proud of the left face (+z)
    d = Math.min(d, torus(x, z - 0.36, y - 1.3, 0.11, 0.03));
    return d;
  },
  bound: [0, 0.8, 0, 1.0],
  rest: [-0.1, 1.55, 1.45],
  view: { lift: 0.62, half: 2.2 },
});
