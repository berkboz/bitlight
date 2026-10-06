// "A day, fast" — dawn on night ground, a whole day on paper, dusk on night. The read-out tells the hour.
import { sundial } from "../../src/index.js";
import { lampShot, lerp, ease } from "./_figure-shot.mjs";

// the sun: rises in the east (+x), crosses the south (+z, toward the camera), sets in the west
const sun = (k) => {
  const az = lerp(-0.15, Math.PI + 0.15, k), el = Math.sin(k * Math.PI) * 1.05 + 0.18;
  const R = 2.1;
  return { x: Math.cos(az) * R * Math.cos(el * 0.8), y: 0.35 + Math.sin(el) * 1.6, z: Math.sin(az) * R * Math.cos(el * 0.8) };
};
const over = { half: 1.95, lift: 0.3 };
// k = 0 at sunrise (06:00), 1 at sunset (18:00); the read-out is the clock, not the dial's guess
const clock = (k) => { const m = Math.round((6 + k * 12) * 60); return `SUN AT ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const day = (t) => lerp(0.08, 0.92, ease(t / 6) * 0.3 + (t / 6) * 0.7);
const shots = [
  lampShot(sundial, { dur: 2.5, ground: 0, text: "DAWN.", over, lamp: (t) => sun(lerp(0.0, 0.08, t / 2.5)), readout: (t) => clock(lerp(0.0, 0.08, t / 2.5)) }),
  lampShot(sundial, { dur: 6, ground: 1, text: "A DAY, FAST.", over, lamp: (t) => sun(day(t)), readout: (t) => clock(day(t)) }),
  lampShot(sundial, { dur: 2.5, ground: 0, text: "DUSK.", over, lamp: (t) => sun(lerp(0.92, 1.0, t / 2.5)), readout: (t) => clock(lerp(0.92, 1.0, t / 2.5)) }),
];

function score({ voice, blip, sq, starts, shotEnd }) {
  voice(starts[0], shotEnd(0), (u) => sq(55, u) * 0.03 * Math.min(1, u));
  // the day: an hour tick every half second, climbing a major scale and back down
  const scale = [220, 246.94, 277.18, 293.66, 329.63, 369.99, 415.3, 440, 415.3, 369.99, 329.63, 293.66];
  for (let h = 0; h < 12; h++) blip(starts[1] + h * 0.5, scale[h], 0.09, 0.06);
  voice(starts[2], shotEnd(2), (u) => sq(55, u) * 0.03 * Math.max(0, 1 - u / 2.5));
}

export default { title: "A day, fast", fps: 24, format: "square", shots, score };
