// Mac — a small beige computer with a bitmap face on its glass. The face is drawn in the albedo.
import { define } from "../bitlight.js";
import { mac } from "../detail.js";

export default define({
  name: "Mac",
  means: "A small computer with a bitmap face. Sweep the lamp across the case; the screen keeps its own light.",
  sdf: (x, y, z) => mac.sdf(x, y, z),
  albedo: (x, y, z) => mac.tone(x, y, z, 0),
  bound: mac.bound,
  rest: [-0.2, 1.8, 1.7],
  view: { half: 1.5, lift: 0.4, yaw: 30, pitch: 24, plate: 0.8 },
});
