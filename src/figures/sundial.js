// Sundial — a dial with a gnomon. The shadow sweeps the hour marks; the read-out tells the time.
import { define, sd } from "../bitlight.js";

const { cylinder, box } = sd;
const TOP = 0.08, SECTOR = Math.PI / 6;
export default define({
  name: "Sundial",
  means: "A sundial on a plate. Move the lamp and the gnomon's shadow points to a new hour.",
  sdf(x, y, z) {
    let d = cylinder(x, y - TOP / 2, z, 1.05, TOP / 2, 0.02);
    // twelve raised hour marks on a ring
    const r = Math.hypot(x, z);
    if (r > 0.7 && r < 1.05 && y < 0.2) {
      let a = Math.atan2(z, x);
      a = (((a % SECTOR) + SECTOR) % SECTOR) - SECTOR / 2;
      d = Math.min(d, box(r * Math.cos(a) - 0.87, y - TOP - 0.012, r * Math.sin(a), 0.07, 0.016, 0.022, 0.006));
    }
    // the gnomon: a triangular fin along -x, tall end at the centre
    const slope = (0.857 * -x + (y - TOP) - 0.6) / 1.317;
    const fin = Math.max(Math.abs(z) - 0.025, x - 0.04, -x - 0.72, slope, -y);
    return Math.min(d, fin);
  },
  bound: [0, 0.25, 0, 1.12],
  rest: [-0.2, 1.5, 1.35],
  read(L) {
    // the shadow points away from the lamp; noon is along the gnomon (−x)
    const a = (Math.atan2(-L.z, L.x) * 180) / Math.PI;
    const h = ((((a + 360) % 360) / 30) + 12) % 12;
    const hh = Math.floor(h) || 12, mm = Math.floor((h % 1) * 60);
    return `shadow at ${hh}:${String(mm).padStart(2, "0")}`;
  },
});
