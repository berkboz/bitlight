// "Launch teaser" — the first 16 s of the launch film, for the day before. Same shots, shorter poster.
import launch from "./launch.mjs";

const [dead, alive, , , ...rest] = launch.shots;
const poster = launch.shots[launch.shots.length - 1];
const reel = rest.slice(0, 6); // rangefinder, watch, mac, sundial, moon, gear
const shots = [dead, alive, ...reel, { ...poster, dur: 4.5 }];

function score({ voice, blip, sq, starts, shotEnd, total }) {
  shots.forEach((_, i) => { if (i) blip(starts[i], 1760, 0.02, 0.1); });
  voice(starts[0], shotEnd(0), (u) => sq(55, u) * 0.04 * Math.min(1, u * 3));
  voice(starts[1] + 0.5, shotEnd(1) - 0.1, (u) => sq(220 * Math.pow(2, (u / 3.4) * 1.5), u) * 0.03);
  blip(starts[1] + 2.9, 1400, 0.03, 0.1);
  const notes = [220, 261.63, 329.63, 392, 440, 392];
  reel.forEach((_, i) => { blip(starts[2 + i], notes[i], 0.11, 0.07); if (i % 2 === 0) blip(starts[2 + i], 55, 0.2, 0.1); });
  const p = starts[shots.length - 1];
  for (const f of [220, 277.18, 329.63]) voice(p, total, (u) => sq(f, u) * 0.03 * Math.min(1, u / 0.5) * (u > 3.6 ? Math.max(0, (4.5 - u) / 0.9) : 1));
  blip(p + 1.4, 1318.5, 0.18, 0.09); blip(p + 1.55, 1760, 0.3, 0.09);
}

export default { title: "Bitlight teaser", fps: 24, scale: 8, hideCounter: true, shots, score };
