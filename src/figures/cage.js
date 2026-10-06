// Cage — an open cube frame around a ball. Its shadow is a grid that skews as the lamp moves.
import { define, sd } from "../bitlight.js";

const { sphere } = sd;
const B = 0.46, E = 0.035, CY = B;
// box frame: edges of a box with half-size B, bar half-thickness E
function frame(x, y, z) {
  const px = Math.abs(x) - B, py = Math.abs(y) - B, pz = Math.abs(z) - B;
  const qx = Math.abs(px + E) - E, qy = Math.abs(py + E) - E, qz = Math.abs(pz + E) - E;
  const part = (a, b, c) => Math.hypot(Math.max(a, 0), Math.max(b, 0), Math.max(c, 0)) + Math.min(Math.max(a, Math.max(b, c)), 0);
  return Math.min(part(px, qy, qz), part(qx, py, qz), part(qx, qy, pz));
}
export default define({
  name: "Cage",
  means: "A ball inside an open cube. Move the lamp and the cage's shadow grid skews across the plate.",
  sdf: (x, y, z) => Math.min(frame(x, y - CY, z), sphere(x, y - 0.24, z, 0.24)),
  albedo: () => 0.92,
  bound: [0, CY, 0, 0.82],
  rest: [-0.4, 1.5, 1.3],
});
