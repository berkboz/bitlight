// "Launch" — the X launch film. 16:9, ~42 s, hard cuts, readable on mute.
// Built from the launch playbook in the Raindrop "Launch Video" collection:
//   · no warm-up: a bold line in the first two seconds, the reason before the features
//   · every beat explains itself with the sound off; words sit in the band, few at a time
//   · the last frame is a poster (name + where to go), held for 4 s
//   · the film is itself the proof: it is JavaScript, no video model, no timeline
import * as all from "../../src/figures/index.js";
import { rangefinder, pocketWatch, mac } from "../../src/detail.js";
import { figureScene, lampUnder } from "../figure.mjs";
import { fmt } from "../frame.mjs";
import { ease, lerp, clamp01 } from "./_figure-shot.mjs";

const ASPECT = fmt({}).VIEW / fmt({}).W; // 200 / 480
const { sin, cos, PI, min, max } = Math;

// a figure whose geometry and tone follow time: the detail props take t
const live = (name, obj, base, extra = {}) => (t, turn = 0) => ({
  ...base, name,
  sdf: (x, y, z) => obj.sdf(x, y, z, t, turn),
  albedo: (x, y, z) => obj.tone(x, y, z, t),
  ...extra,
});
const RF = { bound: rangefinder.bound, rest: [0.45, 1.5, 1.1], view: { half: 1.2, lift: 0.15, yaw: 32, pitch: 28, plate: 0.95 } };
const WA = { bound: pocketWatch.bound, rest: [-0.4, 1.5, 0.9], view: { half: 1.25, lift: 0, yaw: 24, pitch: 50, plate: 0.95 } };
const MA = { bound: mac.bound, rest: [-0.2, 1.8, 1.7], view: { half: 1.5, lift: 0.4, yaw: 30, pitch: 24, plate: 0.8 } };
const camera = live("Rangefinder", rangefinder, RF);
const watch = live("Pocket watch", pocketWatch, WA);
const computer = live("Mac", mac, MA);

// one shot of a time-varying figure, the lamp following a pointer path (u, v over the picture)
function hero(make, { dur, ground = 0, text, typeAt = 0.3, path, cursor = true, over, readout, lamp, turn, ambient, build }) {
  return {
    dur, ground, text, typeAt,
    build(t) {
      const def = make(t, turn ? turn(t) : 0);
      const pt = path ? path(t) : null;
      const p = pt ? lampUnder(def, pt[0], pt[1], ASPECT, over) : lamp(t);
      const scene = figureScene(def, p, { over, pointer: pt && cursor ? pt : undefined, ambient: ambient ?? (ground ? undefined : 0.008) });
      if (readout) scene.readout = typeof readout === "function" ? readout(t) : readout;
      return build ? build(scene, t, def) : scene;
    },
  };
}
const arc = (t, d, a, b, lift = 0.1) => { const k = ease(t / d); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k) - sin(k * PI) * lift]; };

// ---------- 01 · the hook: a dead image ----------
const dead = hero(camera, {
  dur: 3.5, ground: 0, text: "YOUR HERO IMAGE IS A JPEG.", typeAt: 0.4,
  lamp: () => ({ x: 0.25, y: 1.5, z: 1.25 }), over: { half: 1.4, lift: 0.22 },
  readout: "STILL. DEAD. FLAT.",
  // the cursor wanders over a photograph; nothing answers it
  build(scene, t) { scene.lights[0].power = 0.5 + 0.12 * sin(t * 11); scene.cursor = arc(t, 3.5, [0.2, 0.7], [0.8, 0.3], 0.2); return scene; },
});
// ---------- 02 · the turn: it follows you ----------
const alive = hero(camera, {
  dur: 4, ground: 0, text: "THIS ONE IS LIT BY YOUR CURSOR.", typeAt: 0.3,
  path: (t) => t < 0.5 ? [0.9, 0.9] : arc(t - 0.5, 3.4, [0.9, 0.9], [0.1, 0.25], 0.3), over: { half: 1.4, lift: 0.22 },
  turn: (t) => (t > 2.9 ? 1 : 0),
});
// ---------- 03 · every dot is paper or ink: the watch on paper ----------
const dots = hero(watch, {
  dur: 5, ground: 1, text: "EVERY DOT IS PAPER OR INK.", typeAt: 0.3,
  path: (t) => [lerp(0.08, 0.92, ease(t / 5)), 0.5 + 0.25 * sin(t * 1.9)], over: { half: 1.05 },
  readout: (t) => `${t.toFixed(1)}S · 2 INKS`,
});
// ---------- 04 · the Mac: no grey, no gradient ----------
const noGrey = hero(computer, {
  dur: 4, ground: 0, text: "NO GREY. NO GRADIENT. NO IMAGE.", typeAt: 0.3,
  path: (t) => arc(t, 4, [0.12, 0.7], [0.88, 0.3], 0.2), over: { half: 1.8, lift: 0.5 },
});
// ---------- 05 · the library on the beat ----------
const SCENES = ["workstation", "computer", "serverRoom", "cafe", "cloud"];
const keys = Object.keys(all).filter((k) => !SCENES.includes(k));
const pick = ["rangefinder", "pocketWatch", "mac", "sundial", "moon", "gear", "dice", "mug", "keycap", "vase", "orb", "ring"].filter((k) => keys.includes(k));
const BEAT = 0.5;
const lampAt = (T) => { const a = T * 1.3 + 2.2; return { x: cos(a) * 1.4, y: 1.5, z: sin(a) * 1.4 }; };
const reel = pick.map((key, i) => ({
  dur: BEAT, ground: i % 3 === 1 ? 0 : 1, text: all[key].name.toUpperCase(), typeAt: -2,
  build(t) {
    const def = all[key];
    return figureScene(def, lampAt(i * BEAT + t), { over: { ...(def.view || {}), half: (def.view?.half ?? 2.3) * 0.82, lift: def.view?.lift ?? 0.5 }, ambient: i % 3 === 1 ? 0.008 : undefined });
  },
}));
const reelText = { ...reel[0], text: "25 OBJECTS. 15 KB." }; // spoken once, on the first card
reel[0] = reelText;
// ---------- 06 · scenes ----------
const room = {
  dur: 4, ground: 0, text: "WHOLE SCENES, ONE LAMP.", typeAt: 0.3,
  build(t) {
    const def = all.workstation;
    const u = lerp(0.88, 0.14, ease(t / 4)), v = 0.55 - 0.1 * sin(t * 2);
    const lamp = lampUnder(def, u, v, ASPECT, { half: 1.9 });
    return figureScene(def, lamp, { over: { half: 1.9 }, pointer: [u, v], ambient: 0.008 });
  },
};
// ---------- 07 · the proof: this film is code ----------
const shutterAt = 2.4;
const proof = hero(camera, {
  dur: 5, ground: 0, text: "NO VIDEO MODEL. NO TIMELINE.", typeAt: 0.3,
  lamp: (t) => ({ x: lerp(-0.6, 0.5, ease(t / 5)), y: 1.5, z: 1.2 }), over: { half: 1.4, lift: 0.22 },
  turn: (t) => clamp01((t - shutterAt + 0.1) / 0.1) * (t < shutterAt + 0.3 ? 1 : 1 - clamp01((t - shutterAt - 0.3) / 0.4)),
  readout: "THIS FILM IS JAVASCRIPT.",
  build(scene, t) { if (t > shutterAt && t < shutterAt + 0.12) { scene.lights[0].power = 9; scene.lights[0].p = [0.3, 2.2, 1.6]; } return scene; }, // the flash
});
// ---------- 08 · an agent makes the next one: a build-up, bottom to top ----------
const printing = hero((t) => {
  const h = lerp(0.0, 1.05, ease((t - 0.4) / 3.4)); // the print head
  return { ...computer(t), sdf: (x, y, z) => Math.max(mac.sdf(x, y, z), y - h) };
}, {
  dur: 5, ground: 0, text: "CLAUDE CODE MAKES THE NEXT ONE.", typeAt: 0.3,
  lamp: (t) => ({ x: -0.5, y: 0.25 + lerp(0.0, 1.05, ease((t - 0.4) / 3.4)) + 0.7, z: 1.1 }), over: { half: 1.8, lift: 0.5 },
  readout: (t) => `LAYER ${String(Math.round(ease((t - 0.4) / 3.4) * 100)).padStart(3, "0")}/100`,
});
// ---------- 09 · the poster, held ----------
const poster = {
  ...hero(computer, {
    dur: 5.5, ground: 1, text: "BITLIGHT.", typeAt: 0.35,
    path: (t) => [0.5 + 0.34 * cos(t * 0.9 + 2.4), 0.4 + 0.22 * sin(t * 0.9 + 2.4)], over: { half: 1.8, lift: 0.5 },
    readout: "BRK.BZ/BITLIGHT",
  }),
  pill: "NPM I BITLIGHT", pillAt: 1.4,
};

const shots = [dead, alive, dots, noGrey, ...reel, room, proof, printing, poster];

// ---------- the score ----------
function score({ voice, blip, sq, starts, shotEnd, total }) {
  const at = (i) => starts[i];
  const idx = { dead: 0, alive: 1, dots: 2, noGrey: 3, reel: 4, room: 4 + reel.length, proof: 5 + reel.length, printing: 6 + reel.length, poster: 7 + reel.length };
  // a click on every hard cut
  shots.forEach((s, i) => { if (i && !(i > idx.reel && i < idx.room)) blip(at(i), 1760, 0.02, 0.1); });
  // 01 · a held low note, the lamp barely alive
  voice(at(0), shotEnd(0), (u) => sq(55, u) * 0.04 * min(1, u * 3));
  // 02 · a rising tone that follows the cursor
  voice(at(1) + 0.5, shotEnd(1) - 0.1, (u) => sq(220 * Math.pow(2, (u / 3.4) * 1.5), u) * 0.03);
  blip(at(1) + 2.9, 1400, 0.03, 0.1); // the release button
  // 03 · a clock: a tick every quarter second
  for (let k = 0; k * 0.25 < 4.8; k++) blip(at(2) + 0.1 + k * 0.25, k % 4 ? 900 : 1300, 0.012, k % 4 ? 0.07 : 0.1);
  voice(at(2), shotEnd(2), (u) => sq(98, u) * 0.025);
  // 04 · a bass pulse and two blinks of the face
  voice(at(3), shotEnd(3), (u) => sq(73.4, u) * 0.03 * (0.6 + 0.4 * sq(2, u)));
  for (const b of [2.45, 5.05]) if (b < 4) blip(at(3) + b + 0.05, 1568, 0.04, 0.08);
  // 05 · the reel: an arpeggio on the beat with a kick every fourth
  const notes = [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63];
  reel.forEach((_, i) => { blip(at(idx.reel + i), notes[i % 8], 0.11, 0.07); if (i % 4 === 0) blip(at(idx.reel + i), 55, 0.2, 0.1); });
  // 06 · scenes: a warm pad
  for (const f of [110, 164.81]) voice(at(idx.room), shotEnd(idx.room), (u) => sq(f, u) * 0.025 * min(1, u * 2));
  // 07 · the shutter
  const sh = at(idx.proof) + shutterAt;
  voice(sh - 0.05, sh + 0.02, (u) => sq(3400, u) * 0.2);
  blip(sh + 0.02, 1300, 0.03, 0.25); blip(sh + 0.12, 600, 0.05, 0.2);
  blip(sh + 0.45, 900, 0.03, 0.12); // the advance
  voice(at(idx.proof), shotEnd(idx.proof), (u) => sq(82.4, u) * 0.03);
  // 08 · printing: a chatter climbing with the head
  for (let k = 0; 0.4 + k * 0.045 < 3.8; k++) blip(at(idx.printing) + 0.4 + k * 0.045, 500 + (k % 7) * 80 + k * 4, 0.012, 0.06);
  voice(at(idx.printing) + 0.4, at(idx.printing) + 3.8, (u) => sq(110 * Math.pow(2, (u / 3.4) * 2), u) * 0.025);
  // 09 · the poster: a chord, and a bright two-note sign-off
  for (const f of [220, 277.18, 329.63]) voice(at(idx.poster), total, (u) => sq(f, u) * 0.03 * min(1, u / 0.5) * (u > 4.6 ? max(0, (5.5 - u) / 0.9) : 1));
  blip(at(idx.poster) + 1.4, 1318.5, 0.18, 0.09); blip(at(idx.poster) + 1.55, 1760, 0.3, 0.09);
}

export default { title: "Bitlight launch", fps: 24, scale: 8, hideCounter: true, shots, score };
