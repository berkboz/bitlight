// "Launch spin" — the objects themselves move: turntables, an orbiting camera, hands racing.
// The lamp stays put; the shadows do the talking. 16:9, 4K, ~24 s.
import * as all from "../../src/figures/index.js";
import { rangefinder, pocketWatch, mac } from "../../src/detail.js";
import { figureScene } from "../figure.mjs";
import { ease, lerp, clamp01 } from "./_figure-shot.mjs";

const { sin, cos, PI, min, max } = Math;
const LAMP = { x: 0.5, y: 1.55, z: 1.15 };
const turn = (a) => { const c = cos(a), s = sin(a); return (f) => (x, y, z) => f(c * x + s * z, y, -s * x + c * z); };

// a figure definition from a detail prop, turned by `a` radians about the plate's axis
const spun = (name, prop, base, a, t = 0, extra = 0) => {
  const r = turn(a);
  return { ...base, name, sdf: r((x, y, z) => prop.sdf(x, y, z, t, extra)), albedo: r((x, y, z) => prop.tone(x, y, z, t)) };
};
const RF = { view: { half: 1.2, lift: 0.15, yaw: 32, pitch: 28, plate: 0.95 } };
const WA = { view: { half: 1.55, lift: 0, yaw: 32, pitch: 44, plate: 0.95 } };
const MA = { view: { half: 1.5, lift: 0.4, yaw: 30, pitch: 24, plate: 0.8 } };

const shot = (o) => ({
  dur: o.dur, ground: o.ground ?? 0, text: o.text, typeAt: o.typeAt ?? 0.3,
  build(t) {
    const { def, over } = o.at(t);
    const scene = figureScene(def, o.lamp ? o.lamp(t) : LAMP, { over: { ...(def.view || {}), ...over }, ambient: o.ground ? undefined : 0.008 });
    if (o.readout) scene.readout = typeof o.readout === "function" ? o.readout(t) : o.readout;
    return scene;
  },
});

// 01 · a full turn on the plate, the shutter fires at the end
const camera = shot({
  dur: 5, text: "THE OBJECT TURNS.", readout: (t) => `${String(Math.round(ease(t / 5) * 360)).padStart(3, "0")}°`,
  at: (t) => ({ def: spun("Rangefinder", rangefinder, RF, ease(t / 5) * 2 * PI + 0.4, t, clamp01((t - 4.2) / 0.1) * (t < 4.5 ? 1 : 1 - clamp01((t - 4.5) / 0.4))), over: { half: 1.4 } }),
});
// 02 · hands racing while the case turns slowly
const watch = shot({
  dur: 4.5, ground: 1, text: "TIME MOVES TOO.", readout: (t) => `${String(Math.floor(t * 8) % 12 || 12)}:${String(Math.floor(t * 8 * 60) % 60).padStart(2, "0")}`,
  at: (t) => ({ def: spun("Pocket watch", pocketWatch, WA, 0.3 + t * 0.55, t * 9), over: { half: 1.6 } }),
});
// 03 · the camera orbits a stationary Mac
const orbit = shot({
  dur: 5, text: "OR THE CAMERA DOES.", readout: (t) => `AZ ${String(Math.round(lerp(30, 390, ease(t / 5))) % 360).padStart(3, "0")}°`,
  at: (t) => ({ def: spun("Mac", mac, MA, 0, t), over: { half: 1.8, lift: 0.5, yaw: lerp(30, 390, ease(t / 5)) } }),
});
// 04 · everything on the library spins, on the beat
const pick = ["gear", "dice", "cage", "mug", "keycap", "columns", "pins", "ring", "steps", "tower", "sundial", "arch"].filter((k) => all[k]);
const BEAT = 0.5;
const reel = pick.map((key, i) => shot({
  dur: BEAT, ground: i % 3 === 1 ? 0 : 1, text: i ? all[key].name.toUpperCase() : "SPIN ANYTHING.", typeAt: i ? -2 : 0.05,
  at: (t) => { const d = all[key], r = turn((i * BEAT + t) * 3.2); return { def: { ...d, sdf: r(d.sdf), albedo: d.albedo && r(d.albedo) }, over: { half: (d.view?.half ?? 2.3) * 0.85, lift: d.view?.lift ?? 0.5 } }; },
}));
reel[0] = { ...reel[0], dur: BEAT * 4 };
// 05 · poster: the Mac turns slowly, a two-second hold on the name
const poster = { ...shot({
  dur: 5.5, ground: 1, text: "BITLIGHT.", typeAt: 0.35, readout: "BRK.BZ/BITLIGHT",
  at: (t) => ({ def: spun("Mac", mac, MA, 0.6 + t * 0.7, t), over: { half: 1.8, lift: 0.5 } }),
}), pill: "NPM I BITLIGHT", pillAt: 1.4 };

const shots = [camera, watch, orbit, ...reel, poster];

function score({ voice, blip, sq, starts, shotEnd, total }) {
  shots.forEach((_, i) => { if (i && !(i > 3 && i < 3 + reel.length)) blip(starts[i], 1760, 0.02, 0.1); });
  // 01 · a rising whirr as the turntable speeds up and eases, then the shutter
  voice(starts[0], starts[0] + 4.2, (u) => sq(70 + 140 * Math.sin((u / 4.2) * PI), u) * 0.035);
  const sh = starts[0] + 4.2; blip(sh, 3400, 0.02, 0.2); blip(sh + 0.03, 1300, 0.04, 0.2); blip(sh + 0.14, 600, 0.05, 0.16);
  // 02 · a ticking that speeds with the hands
  for (let k = 0; k * 0.125 < 4.4; k++) blip(starts[1] + 0.1 + k * 0.125, k % 8 ? 900 : 1300, 0.01, k % 8 ? 0.05 : 0.09);
  voice(starts[1], shotEnd(1), (u) => sq(98, u) * 0.025);
  // 03 · a slow sweep with the camera
  voice(starts[2], shotEnd(2), (u) => sq(110 * Math.pow(2, ease(u / 5)), u) * 0.03);
  // 04 · arpeggio on the beat
  const notes = [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63];
  reel.forEach((_, i) => { blip(starts[3 + i], notes[i % 8], 0.11, 0.07); if (i % 4 === 0) blip(starts[3 + i], 55, 0.2, 0.1); });
  // 05 · chord and sign-off
  const p = starts[shots.length - 1];
  for (const f of [220, 277.18, 329.63]) voice(p, total, (u) => sq(f, u) * 0.03 * min(1, u / 0.5) * (u > 4.6 ? max(0, (5.5 - u) / 0.9) : 1));
  blip(p + 1.4, 1318.5, 0.18, 0.09); blip(p + 1.55, 1760, 0.3, 0.09);
}

export default { title: "Bitlight spin", fps: 24, scale: 8, hideCounter: true, shots, score };
