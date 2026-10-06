// Server room — three rows of racks with status lights. The lamp walks the aisles.
import { define } from "../bitlight.js";
import { rackUnit, P } from "../props.js";

const S = 0.7, ROWS = 1.05;
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function cell(x, z) {
  const xi = Math.max(-2, Math.min(2, Math.round(x / P)));
  const zi = Math.max(-1, Math.min(1, Math.round(z / ROWS)));
  return [xi, zi, x - xi * P, z - zi * ROWS];
}
export default define({
  name: "Server room",
  means: "Three rows of server racks with status lights. Walk the lamp down the aisles.",
  sdf(x, y, z) {
    const [, , lx, lz] = cell(x / S, z / S);
    return rackUnit(lx, y / S, lz) * S;
  },
  albedo(x, y, z) {
    const [xi, zi, lx, lz] = cell(x / S, z / S), yy = y / S;
    if (Math.abs(lz - 0.3) > 0.006 || yy < 0.06 || yy > 1.2) return 0.82;
    const unit = Math.floor((yy - 0.06) / 0.1), uy = (yy - 0.06) / 0.1 - unit;
    if (uy < 0.12) return 0.3; // gaps between servers
    if (Math.abs(lx - 0.15) < 0.03 && Math.abs(uy - 0.55) < 0.24) return hash(xi * 7 + zi, unit) > 0.45 ? 1 : 0.2; // status lights
    return 0.55;
  },
  bound: [0, 0.44, 0, 1.45],
  rest: [-0.4, 1.5, 1.4],
});
