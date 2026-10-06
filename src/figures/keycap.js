// Keycap — one oversized key. Grazing light finds the dish and the homing bar.
import { define, sd } from "../bitlight.js";

const { box } = sd;
export default define({
  name: "Keycap",
  means: "A single large keycap. Skim the lamp low to find the dish and the homing bar.",
  sdf(x, y, z) {
    // taper: 0.55 half-width at the base, 0.42 at the top
    const k = 0.58 / (0.58 - 0.18 * Math.max(0, Math.min(1, y / 0.52)));
    let d = box(x * k, y - 0.26, z * k, 0.58, 0.26, 0.58, 0.035) / k * 0.92;
    // cylindrical dish across the top
    d = Math.max(d, -(Math.hypot(y - 1.5, z) - 1.06));
    // homing bar, low on the dish
    return Math.min(d, box(x, y - 0.47, z - 0.16, 0.12, 0.03, 0.028, 0.014));
  },
  albedo: () => 0.93,
  bound: [0, 0.27, 0, 0.82],
  rest: [-0.4, 1.45, 1.3],
});
