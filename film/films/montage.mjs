// "Twenty-five" — every figure for half a second, cut on the beat, while one lamp keeps sweeping.
import * as all from "../../src/figures/index.js";
import { lampShot, REPO } from "./_figure-shot.mjs";

const SCENES = ["workstation", "computer", "serverRoom", "cafe", "cloud"];
const objects = Object.keys(all).filter((k) => !SCENES.includes(k)).sort();
const order = [...objects, ...SCENES];
const BEAT = 0.5;
// one lamp path for the whole film, so the light carries across the cuts
const lampAt = (T) => { const a = T * 1.3 + 2.2; return { x: Math.cos(a) * 1.5, y: 1.5, z: Math.sin(a) * 1.5 }; };

const shots = order.map((key, i) => lampShot(all[key], {
  dur: BEAT, ground: SCENES.includes(key) ? 0 : 1, text: all[key].name.toUpperCase(), typeAt: -2,
  over: SCENES.includes(key) ? undefined : { half: 1.85, lift: 0.5 }, // objects fill the square
  lamp: (t) => lampAt(i * BEAT + t),
}));
shots.push(lampShot(all.orb, {
  dur: 3, ground: 1, text: "BITLIGHT.", typeAt: 0.25, readout: REPO,
  over: { half: 1.6, lift: 0.5 }, lamp: (t) => lampAt(order.length * BEAT + t * 0.6),
}));

function score({ blip, voice, sq, starts, total, shots: s }) {
  const notes = [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63];
  s.forEach((_, i) => {
    if (i === s.length - 1) return;
    blip(starts[i], notes[i % 8] * (i >= s.length - 6 ? 0.5 : 1), 0.11, 0.07);
    if (i % 4 === 0) blip(starts[i], 55, 0.2, 0.08);
  });
  const end = starts[s.length - 1];
  for (const f of [220, 277.18, 329.63]) voice(end, total, (u) => sq(f, u) * 0.028 * Math.min(1, u / 0.3));
}

export default { title: "Twenty-five", fps: 24, format: "square", shots, score };
