// Workstation — a whole desk: monitor, keyboard, mug, desk lamp and the computer.
// A scene figure: many props, one lamp. The pointer is a second, bigger lamp.
import { define } from "../bitlight.js";
import { sd } from "../bitlight.js";
import { deskFrame, deskGear, deskLamp, tower, towerPart, TX, TY, DESK_BOUNDS } from "../props.js";

// a group's exact distance only when the point is near its bounding box
const near = (b, f) => (x, y, z) => {
  const g = sd.box(x - b[0], y - b[1], z - b[2], b[3], b[4], b[5]);
  return g > 0.015 ? g : f(x, y, z);
};
const frame = near(DESK_BOUNDS.frame, deskFrame), gear = near(DESK_BOUNDS.gear, deskGear);
const lamp = near(DESK_BOUNDS.lamp, (x, y, z) => deskLamp(x, y, z, true));
const desk = (x, y, z) => Math.min(frame(x, y, z), gear(x, y, z), lamp(x, y, z), tower(x - TX, y - TY, z + 0.04, 0));

const S = 0.8; // scale the desk set onto the plate
const at = (f) => (x, y, z) => f(x / S, y / S, z / S);
export default define({
  name: "Workstation",
  means: "A desk with a monitor, keyboard, mug, desk lamp and a computer. Sweep the lamp across it.",
  sdf: (x, y, z) => desk(x / S, y / S, z / S) * S,
  albedo: at((x, y, z) => {
    if (x > TX - 0.23 && y > TY + 0.005) {
      const part = towerPart(x - TX, y - TY, z + 0.04);
      return part === "well" ? 0.18 : part === "light" ? 1 : 0.88;
    }
    if (z > -0.205 && z < -0.19 && Math.abs(x + 0.38) < 0.42 && Math.abs(y - 1.2) < 0.24)
      return Math.floor((y - 0.93) / 0.022) % 2 ? 0.34 : 0.22; // monitor glass
    if (Math.abs(y - 0.799) < 0.004 && Math.abs(x + 0.38) < 0.32 && Math.abs(z - 0.13) < 0.1)
      return (Math.floor((x + 0.72) / 0.045) + Math.floor((z - 0.03) / 0.045)) % 2 ? 0.95 : 0.6; // keys
    return 0.9;
  }),
  bound: [0, 0.62, 0.1, 1.2],
  rest: [-0.2, 1.55, 1.4],
  view: { half: 2.15, lift: 0.5 },
});
