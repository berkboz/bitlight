// Computer — a tower with two guarded fans and side vents. Rake the lamp to find the blades.
import { define } from "../bitlight.js";
import { tower, towerPart } from "../props.js";

const S = 1.25, C = Math.cos(0.35), N = Math.sin(0.35); // bigger, turned a little toward the camera
const local = (f) => (x, y, z) => f((C * x - N * z) / S, y / S, (N * x + C * z) / S);
export default define({
  name: "Computer",
  means: "A desktop computer with two fans behind guards. Rake the lamp low to find the blades.",
  sdf: (x, y, z) => local((a, b, c) => tower(a, b, c, 0.25))(x, y, z) * S,
  albedo: local((x, y, z) => ({ well: 0.16, blade: 1, light: 1 })[towerPart(x, y, z)] ?? 0.88),
  bound: [0, 0.58, 0, 0.9],
  rest: [-0.55, 1.5, 1.35],
});
