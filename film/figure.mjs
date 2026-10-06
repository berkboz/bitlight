// Put a figure in a film shot, exactly as the web kernel draws it: the same
// plate, camera, materials and pointer-to-lamp mapping (src/bitlight.js).
// Shots can move the pointer, zoom the camera and swap figures; the figure
// itself stays still, as rule 02 says.
import { LOOK, sd, camera } from "../src/core.js";
import { defaultRead } from "../src/bitlight.js";
import { M } from "./engine.mjs";

const PT = 0.08;
export const figureView = (def, over = {}) =>
  Object.assign({ half: 2.3, lift: 0.35, yaw: 45, pitch: 30, plate: 1.6, lampY: 1.5 }, def.view, over);

/** Lamp under the pointer at (u, v), 0–1 across a picture `aspect` = height / width. */
export function lampUnder(def, u, v, aspect, over) {
  const view = figureView(def, over);
  const { f, r, u: up } = camera(view.yaw, view.pitch);
  const sx = (u - 0.5) * 2 * view.half, sy = -(v - 0.5) * 2 * view.half * aspect;
  const ox = r[0] * sx + up[0] * sy, oy = view.lift + up[1] * sy, oz = r[2] * sx + up[2] * sy;
  const t = (view.lampY - oy) / f[1];
  let x = ox + f[0] * t, z = oz + f[2] * t;
  const reach = view.plate + 0.9, d = Math.hypot(x, z);
  if (d > reach) { x *= reach / d; z *= reach / d; }
  return { x, y: view.lampY, z };
}

/**
 * A film scene of `def` lit by `lamp` ({x, y, z}). `over` overrides the view
 * (half = zoom, lift, yaw). `pointer` [u, v] draws the cursor there.
 */
export function figureScene(def, lamp, { over, pointer, ambient = LOOK.AMBIENT } = {}) {
  const view = figureView(def, over), P = view.plate;
  const plate = (x, y, z) => sd.box(x, y + PT, z, P, PT, P, 0.06);
  const object = def.sdf, albedo = def.albedo || (() => 0.92), plateTone = def.plateTone || (() => 0.86);
  return {
    ambient,
    haloLight: 0, // figures always draw the paper halo
    camera: { yaw: view.yaw, pitch: view.pitch, half: view.half, target: [0, view.lift, 0] },
    map: (x, y, z) => Math.min(plate(x, y, z), object(x, y, z)),
    occ: object,
    mat(x, y, z) {
      if (object(x, y, z) <= plate(x, y, z)) { M.a = albedo(x, y, z); M.s = 1; }
      else { M.a = plateTone(x, y, z); M.s = 0; }
    },
    lights: [{ p: [lamp.x, lamp.y, lamp.z] }],
    readout: (def.read || defaultRead)(lamp).toUpperCase(),
    cursor: pointer,
  };
}
