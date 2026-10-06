// Bowl — a bowl with a ball in it. The shadow crescent inside turns with the lamp.
import { define, sd } from "../bitlight.js";

const { sphere, cylinder } = sd;
const C = 0.64, R = 0.6, T = 0.028;
export default define({
  name: "Bowl",
  means: "A bowl holding a ball. Circle the lamp and the shadow inside the bowl turns.",
  sdf(x, y, z) {
    const shell = Math.max(Math.abs(sphere(x, y - C, z, R - T)) - T, y - C);
    const foot = cylinder(x, y - 0.035, z, 0.2, 0.035, 0.01);
    const ball = sphere(x - 0.08, y - (C - (R - 2 * T) + 0.15), z + 0.05, 0.15);
    return Math.min(shell, foot, ball);
  },
  albedo: (x, y, z) => (Math.hypot(x - 0.08, z + 0.05) < 0.16 && y < 0.4 ? 0.8 : 0.94),
  bound: [0, 0.36, 0, 0.66],
  rest: [-0.25, 1.5, 1.35],
});
