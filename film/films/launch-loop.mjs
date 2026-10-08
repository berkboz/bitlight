// "Launch loop" — square, for feeds and replies: three new detailed figures, a cursor lighting each.
import { rangefinder, pocketWatch, mac } from "../../src/figures/index.js";
import { pointerShot, ease, lerp, REPO } from "./_figure-shot.mjs";

const arc = (t, d, [u0, v0], [u1, v1], lift = 0.12) => {
  const k = ease(t / d);
  return [lerp(u0, u1, k), lerp(v0, v1, k) - Math.sin(k * Math.PI) * lift];
};
const shots = [
  pointerShot(rangefinder, { dur: 3.5, ground: 0, text: "LIT BY THE CURSOR.", path: (t) => arc(t, 3.5, [0.9, 0.7], [0.1, 0.3], 0.2), over: { half: 1.15, lift: 0.2 } }),
  pointerShot(pocketWatch, { dur: 3.5, ground: 1, text: "ONE BIT. TWO INKS.", path: (t) => arc(t, 3.5, [0.1, 0.5], [0.9, 0.55], 0.3), over: { half: 1.15, lift: 0 } }),
  pointerShot(mac, { dur: 3.5, ground: 0, text: "NO IMAGES.", path: (t) => arc(t, 3.5, [0.85, 0.3], [0.15, 0.7], 0.2), over: { half: 1.3, lift: 0.45 } }),
  pointerShot(mac, { dur: 3, ground: 1, text: "BITLIGHT.", path: (t) => arc(t, 3, [0.2, 0.3], [0.8, 0.6], 0.15), over: { half: 1.3, lift: 0.45 }, readout: REPO }),
];

function score({ voice, blip, sq, starts, shotEnd, total }) {
  const roots = [110, 130.81, 98, 146.83];
  shots.forEach((s, i) => { voice(starts[i], shotEnd(i), (u) => sq(roots[i], u) * 0.025 * Math.min(1, u * 8)); if (i) blip(starts[i], 1760, 0.02, 0.12); });
  blip(starts[3] + 0.3, 880, 0.12, 0.06); blip(starts[3] + 0.42, 1318.5, 0.25, 0.06);
}

export default { title: "Bitlight launch loop", fps: 24, format: "square", shots, score };
