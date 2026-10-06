// Vase — a turned vase. The highlight slides down its belly and the mouth goes dark.
import { define, sd } from "../bitlight.js";

const R = (y) => 0.11 + 0.27 * Math.exp(-(((y - 0.45) / 0.33) ** 2)) + 0.07 * Math.exp(-(((y - 1.16) / 0.07) ** 2));
const H = 1.2;
export default define({
  name: "Vase",
  means: "A turned vase. Move the lamp and the highlight slides along its curve.",
  sdf(x, y, z) {
    const r = Math.hypot(x, z), yc = Math.max(0, Math.min(H, y));
    const outer = Math.max((r - R(yc)) * 0.7, y - H, -y);
    const inner = Math.max((r - (R(yc) - 0.03)) * 0.7, 0.14 - y);
    return Math.max(outer, -inner);
  },
  albedo: (x, y, z) => (Math.abs(y - 0.78) < 0.02 || Math.abs(y - 0.84) < 0.012 ? 0.6 : 0.95),
  bound: [0, 0.6, 0, 0.72],
  rest: [-0.35, 1.5, 1.3],
});
