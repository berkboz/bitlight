// Pins — a 5×5 bed of pegs set in a diagonal wave. The lamp rakes across the field.
import { define, sd } from "../bitlight.js";

const { cylinder } = sd;
const S = 0.5, R = 0.14, N = 2, HMAX = 0.75;
const height = (i, j) => 0.12 + 0.6 * (0.5 + 0.5 * Math.cos((i - j) * 0.9));
export default define({
  name: "Pins",
  means: "A bed of pegs set in a wave. Rake the lamp low to read the swell.",
  sdf(x, y, z) {
    const i = Math.max(-N, Math.min(N, Math.round(x / S)));
    const j = Math.max(-N, Math.min(N, Math.round(z / S)));
    const lx = x - i * S, lz = z - j * S, h = height(i, j);
    const own = cylinder(lx, y - h / 2, lz, R, h / 2, 0.03);
    // neighbours are at least this far: their columns, or the top of the field
    if (Math.abs(lx) > S / 2 || Math.abs(lz) > S / 2) return own;
    const near = Math.max(Math.min(S - Math.abs(lx), S - Math.abs(lz)) - R, y - HMAX);
    return Math.min(own, near);
  },
  bound: [0, 0.35, 0, 1.6],
  rest: [-0.2, 1.5, 1.45],
});
