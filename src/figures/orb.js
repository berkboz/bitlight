// Orb — a ball on a plate. The pointer is the lamp; the shadow walks away from it.
import { define, sd } from "../bitlight.js";

export default define({
  name: "Orb",
  means: "A ball resting on a plate. Move the lamp and its shadow swings round.",
  sdf: (x, y, z) => sd.sphere(x, y - 0.62, z, 0.62),
  albedo: () => 0.95,
  bound: [0, 0.62, 0, 0.64],
  rest: [-0.25, 1.5, 1.35],
});
