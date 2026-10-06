// Cloud — the computer resting on a cloud that floats over the plate. Its shadow drifts with the lamp.
import { define } from "../bitlight.js";
import { cloud, tower, towerPart } from "../props.js";

const LIFT = 0.28, S = 0.6, C = Math.cos(0.45), N = Math.sin(0.45);
const comp = (x, y, z) => tower((C * x - N * z) / S, (y - LIFT - 0.64) / S, (N * x + C * z) / S, 0.3) * S;
export default define({
  name: "Cloud",
  means: "A computer resting on a cloud above the plate. Move the lamp and the cloud's shadow drifts.",
  sdf: (x, y, z) => Math.min(cloud(x, y - LIFT, z), comp(x, y, z)),
  albedo(x, y, z) {
    if (comp(x, y, z) < cloud(x, y - LIFT, z))
      return ({ well: 0.16, blade: 1, light: 1 })[towerPart((C * x - N * z) / S, (y - LIFT - 0.64) / S, (N * x + C * z) / S)] ?? 0.88;
    return 0.98;
  },
  bound: [0, 0.85, 0, 1.15],
  rest: [-0.3, 1.6, 1.3],
  view: { lift: 0.55 },
});
