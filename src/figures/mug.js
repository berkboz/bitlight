// Mug — a mug of coffee. The handle's shadow loops across the body as the lamp circles.
import { define, sd } from "../bitlight.js";

const { cylinder, torus } = sd;
export default define({
  name: "Mug",
  means: "A mug of coffee. Circle the lamp and the handle's shadow loops across the mug.",
  sdf(x, y, z) {
    const body = Math.max(cylinder(x, y - 0.36, z, 0.32, 0.36, 0.03), -cylinder(x, y - 0.42, z, 0.27, 0.36));
    const coffee = cylinder(x, y - 0.3, z, 0.275, 0.28);
    // handle: a ring in the xy plane on the +x side, outside the body only
    const handle = Math.max(torus(x - 0.32, z, y - 0.38, 0.17, 0.045), 0.3 - x);
    return Math.min(body, coffee, handle);
  },
  albedo: (x, y, z) => (Math.hypot(x, z) < 0.27 && y > 0.55 && y < 0.6 ? 0.22 : 0.93),
  bound: [0.08, 0.38, 0, 0.6],
  rest: [-0.2, 1.5, 1.35],
});
