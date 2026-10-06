// Steps — four risers. Each one throws a shadow onto the next.
import { define, sd } from "../bitlight.js";

const { box } = sd;
export default define({
  name: "Steps",
  means: "Four steps climbing to the back. Each riser shades the tread below it.",
  sdf(x, y, z) {
    let d = Infinity;
    for (let i = 0; i < 4; i++) {
      const h = 0.2 * (i + 1);
      d = Math.min(d, box(x - (0.75 - i * 0.4), y - h / 2, z, 0.2, h / 2, 0.55, 0.02));
    }
    return d;
  },
  bound: [0.15, 0.3, 0, 1.13],
  rest: [1.35, 1.5, 0.45],
});
