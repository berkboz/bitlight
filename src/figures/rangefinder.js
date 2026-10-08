// Rangefinder — a film camera with a knurled lens, engraved ticks and a leatherette grip.
// Built close: the lens rings and the dials are the point of this one.
import { define } from "../bitlight.js";
import { rangefinder } from "../detail.js";

export default define({
  name: "Rangefinder",
  means: "A film camera with a knurled lens and a leather grip. Circle the lamp and the focus ring's ridges come and go.",
  sdf: (x, y, z) => rangefinder.sdf(x, y, z),
  albedo: (x, y, z) => rangefinder.tone(x, y, z),
  bound: rangefinder.bound,
  rest: [0.45, 1.5, 1.1],
  view: { half: 1.2, lift: 0.15, yaw: 32, pitch: 28, plate: 0.95 },
});
