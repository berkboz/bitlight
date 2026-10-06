// "One light" — a seamless 8 s loop: the lamp circles a moon once, through every phase.
import { moon } from "../../src/index.js";
import { lampShot } from "./_figure-shot.mjs";

const D = 8;
const shots = [lampShot(moon, {
  dur: D, ground: 0, text: "ONE LIGHT.", typeAt: -5, // text already set: the loop has no start
  over: { half: 1.4, lift: 0.98 },
  lamp: (t) => { const a = (t / D) * Math.PI * 2 + 0.6; return { x: Math.cos(a) * 1.9, y: 1.25, z: Math.sin(a) * 1.9 }; },
})];

function score({ voice, sq, total }) {
  // a drone whose brightness follows the phase; periodic in the loop length, so it loops too
  voice(0, total, (u) => {
    const lit = 0.5 + 0.5 * Math.cos((u / D) * Math.PI * 2 + 0.6 - 0.785);
    return (sq(55, u) * 0.03 + sq(82.41, u) * 0.02 * lit + sq(164.81, u) * 0.012 * lit * lit);
  });
}

export default { title: "One light", fps: 24, format: "square", hideCounter: true, shots, score };
