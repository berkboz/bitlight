// Pocket watch — a dial, sixty minute ticks, a coin-edge bezel, a crown. The read-out tells the time it shows.
import { define } from "../bitlight.js";
import { pocketWatch } from "../detail.js";

export default define({
  name: "Pocket watch",
  means: "A pocket watch lying face up. Rake the lamp low and the bezel's milling and the raised hour marks stand up.",
  sdf: (x, y, z) => pocketWatch.sdf(x, y, z, 0),
  albedo: (x, y, z) => pocketWatch.tone(x, y, z),
  bound: pocketWatch.bound,
  rest: [-0.4, 1.5, 0.9],
  view: { half: 1.55, lift: 0.0, yaw: 32, pitch: 44, plate: 0.95 },
  read: () => "10:10",
});
