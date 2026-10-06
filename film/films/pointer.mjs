// "Move the light" — a cursor drives the lamp across four figures. Square, for social feeds.
import { sundial, moon, gear, workstation } from "../../src/index.js";
import { pointerShot, ease, lerp, REPO } from "./_figure-shot.mjs";

// pointer paths, u/v over the picture
const arc = (t, d, [u0, v0], [u1, v1], lift = 0.12) => {
  const k = ease(t / d);
  return [lerp(u0, u1, k), lerp(v0, v1, k) - Math.sin(k * Math.PI) * lift];
};
const orbit = (t, d, c = [0.5, 0.42], r = [0.32, 0.26], a0 = 0) => {
  const a = a0 + (t / d) * Math.PI * 2;
  return [c[0] + Math.cos(a) * r[0], c[1] + Math.sin(a) * r[1]];
};

const shots = [
  pointerShot(sundial, { dur: 3.5, text: "MOVE THE LIGHT.", path: (t) => arc(t, 3.5, [0.92, 0.55], [0.1, 0.5], 0.3), over: { half: 2.0, lift: 0.3 } }),
  pointerShot(moon, { dur: 3, text: "IT FOLLOWS YOU.", path: (t) => orbit(t, 3, [0.5, 0.4], [0.36, 0.28], -0.6), over: { half: 1.7, lift: 0.65 } }),
  pointerShot(gear, { dur: 3, ground: 0, text: "TWO INKS. NO GREY.", path: (t) => arc(t, 3, [0.1, 0.25], [0.85, 0.3], -0.1), over: { half: 1.75, lift: 0.55 } }),
  pointerShot(workstation, { dur: 3.5, text: "BITLIGHT.", path: (t) => arc(t, 3.5, [0.15, 0.7], [0.8, 0.2], 0.1), over: { half: 2.0, lift: 0.55 }, readout: REPO }),
];

function score({ voice, blip, sq, starts, shotEnd, total }) {
  // a soft pulse under each shot, a click on every cut
  const roots = [110, 130.81, 98, 146.83];
  shots.forEach((s, i) => {
    voice(starts[i], shotEnd(i), (u) => sq(roots[i], u) * 0.025 * Math.min(1, u * 8));
    if (i) blip(starts[i], 1760, 0.02, 0.12);
  });
  blip(starts[3] + 0.3, 880, 0.12, 0.06); blip(starts[3] + 0.42, 1318.5, 0.25, 0.06);
}

export default { title: "Move the light", fps: 24, format: "square", shots, score };
