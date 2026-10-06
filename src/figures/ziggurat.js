// Ziggurat — four tiers and a stair. Each tier shades the next; faces flip as the lamp circles.
import { define, sd } from "../bitlight.js";

const { box } = sd;
const TIERS = 4, TH = 0.16;
export default define({
  name: "Ziggurat",
  means: "A stepped pyramid with a stair. Each tier throws its shadow on the one below.",
  sdf(x, y, z) {
    let d = Infinity;
    for (let i = 0; i < TIERS; i++) {
      const h = 0.95 - i * 0.21;
      d = Math.min(d, box(x, y - (TH / 2 + i * TH), z, h, TH / 2, h, 0.01));
    }
    // a stair up the front (+z) face: a ramp cut into steps
    const sz = z - 0.95 + 0.0, run = 0.9;
    if (Math.abs(x) < 0.2 && sz > -run - 0.05 && sz < 0.05 && y < TIERS * TH + 0.05) {
      const step = 0.06, k = Math.floor(-sz / step);
      const top = Math.min(TIERS * TH, (k + 1) * (TIERS * TH) / (run / step));
      d = Math.min(d, box(x, y - top / 2, sz + (k + 0.5) * step, 0.16, top / 2, step / 2));
    }
    return d;
  },
  bound: [0, 0.32, 0, 1.4],
  rest: [-0.5, 1.5, 1.3],
});
