// Gear — a cog standing in a cradle. The lamp throws its teeth across the plate.
import { define, sd } from "../bitlight.js";

const { box } = sd;
const TC = Math.cos(Math.PI / 4), TS = Math.sin(Math.PI / 4);
const CY = 0.7, TEETH = 10, SECTOR = (2 * Math.PI) / TEETH, HOLES = 5, HS = (2 * Math.PI) / HOLES;
function gear2(x, y) {
  const r = Math.hypot(x, y), a = Math.atan2(y, x);
  let d = r - 0.48;
  const t = (((a % SECTOR) + SECTOR) % SECTOR) - SECTOR / 2;
  d = Math.min(d, sd.rect(r * Math.cos(t) - 0.55, r * Math.sin(t), 0.09, 0.075) - 0.01);
  d = Math.max(d, -(r - 0.11)); // axle hole
  const h = (((a % HS) + HS) % HS) - HS / 2;
  return Math.max(d, -(Math.hypot(r * Math.cos(h) - 0.29, r * Math.sin(h)) - 0.1)); // lightening holes
}
export default define({
  name: "Gear",
  means: "A cog standing on its edge in a cradle. The lamp throws its teeth across the plate.",
  sdf(wx, y, wz) {
    // turned 45° so the gear faces the camera; then it faces +z locally
    const x = TC * wx - TS * wz, z = TS * wx + TC * wz;
    // extrude the 2D outline to a thickness of 0.12
    const a = gear2(x, y - CY), b = Math.abs(z) - 0.06;
    const g = Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0));
    const cradle = Math.max(box(x, y - 0.11, z, 0.38, 0.11, 0.2, 0.02), -(Math.hypot(x, y - CY) - 0.6));
    return Math.min(g, cradle);
  },
  albedo: () => 0.92,
  bound: [0, 0.65, 0, 0.8],
  rest: [-1.35, 1.5, 0.15],
});
