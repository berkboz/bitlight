// Helpers for films made of Bitlight figures (files starting with _ are not films).
import { figureScene, lampUnder } from "../figure.mjs";
import { fmt } from "../frame.mjs";

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const ease = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
export const lerp = (a, b, v) => a + (b - a) * v;
const ASPECT = { square: fmt({ format: "square" }).VIEW / fmt({ format: "square" }).W };

/**
 * A shot of one figure driven by a pointer path.
 *   path(t) → [u, v]   pointer over the picture, 0–1
 *   showCursor         draw the arrow
 *   over               view overrides (half = zoom, lift)
 */
export function pointerShot(def, { dur, ground = 1, text = "", typeAt = 0.3, path, showCursor = true, over, readout }) {
  return {
    dur, ground, text, typeAt,
    build(t) {
      const [u, v] = path(t);
      const lamp = lampUnder(def, u, v, ASPECT.square, over);
      const scene = figureScene(def, lamp, { over, pointer: showCursor ? [u, v] : undefined, ambient: ground ? undefined : 0.01 });
      if (readout) scene.readout = readout;
      return scene;
    },
  };
}

/** A shot of one figure lit by a lamp position given directly (no pointer). */
export function lampShot(def, { dur, ground = 1, text = "", typeAt = 0.3, lamp, over, readout }) {
  return {
    dur, ground, text, typeAt,
    build(t) {
      const scene = figureScene(def, lamp(t), { over, ambient: ground ? undefined : 0.01 });
      if (readout) scene.readout = typeof readout === "function" ? readout(t, scene.readout) : readout;
      return scene;
    },
  };
}

export const REPO = "GITHUB.COM/BERKBOZ/BITLIGHT";
