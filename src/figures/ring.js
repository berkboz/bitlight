// Ring — a hoop set upright in a slot. Its shadow is the only place the hole shows twice.
import { define, sd } from "../bitlight.js";

const { torus, box } = sd;
const R = 0.72, r = 0.15, s = Math.SQRT1_2;
export default define({
  name: "Ring",
  means: "A hoop standing in a slot. Swing the lamp low and the hole crosses the plate.",
  sdf(x, y, z) {
    const a = (x - z) * s, b = (x + z) * s; // ring plane faces the viewer
    return torus(a, b, y - 0.6, R, r);
  },
  plateTone: (x, y, z) => {
    const a = (x - z) * s, b = (x + z) * s;
    return Math.abs(b) < 0.2 && Math.abs(a) < 0.95 && y > -0.01 ? 0.55 : 0.86; // the slot
  },
  bound: [0, 0.6, 0, R + r + 0.02],
  rest: [-0.35, 1.5, 1.3],
});
