// Café — a laptop open on a round table, the computer drawn on its screen, a cup and a plant.
import { define } from "../bitlight.js";
import { cafe, HINGE_Y, HINGE_Z } from "../props.js";

const TH = 1.85; // lid angle, open
export default define({
  name: "Café",
  means: "A laptop open on a café table with a cup and a plant. Circle the lamp and the table's shadow turns.",
  sdf: (x, y, z) => cafe(x, y + 0.02, z, TH),
  albedo(x, y, z) {
    y += 0.02;
    const qy = y - HINGE_Y, qz = z - HINGE_Z;
    const along = qy * Math.sin(TH) + qz * Math.cos(TH), nrm = qy * Math.cos(TH) - qz * Math.sin(TH);
    if (nrm < 0.002 && nrm > -0.004 && Math.abs(x - 0.05) < 0.29 && along > 0.03 && along < 0.4) {
      const u = (x - 0.05) / 0.29, v = (along - 0.215) / 0.185;
      const wall = Math.abs(u) < 0.2 && Math.abs(v) < 0.62 && (Math.abs(u) > 0.15 || Math.abs(v) > 0.56);
      const vent = Math.abs(u) < 0.12 && [0.28, 0.12, -0.04].some((c) => Math.abs(v - c) < 0.035);
      return wall || vent ? 0.1 : 1; // the screen shows the computer
    }
    if (Math.abs(y - 0.791) < 0.003 && Math.abs(x - 0.05) < 0.29 && z > -0.08 && z < 0.12)
      return (Math.floor((x + 0.24) / 0.04) + Math.floor(z / 0.04)) % 2 ? 0.95 : 0.55; // keys
    if (Math.hypot(x + 0.55, z + 0.32) < 0.1 && y > 0.88) return 0.55; // leaves
    return 0.92;
  },
  bound: [0, 0.55, 0, 1.12],
  rest: [-0.5, 1.5, 1.3],
  view: { lift: 0.45 },
});
