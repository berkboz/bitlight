// "Scenes" — six shots of the shared props (src/props.js), hard cuts. The worked
// example for every film pattern in skills/bitlight-film/shots.md. Each shot is a pure function of its
// local time t (seconds), so any frame renders the same on any worker.
import { sd, M } from "../engine.mjs";
import { tower, deskObjects, LAMP_HEAD, LAMP_DIR, TX, TY, rack, P, ROW, laptop, cafe, HINGE_Y, HINGE_Z, cloud } from "../../src/props.js";

const { box, sphere, cylinder, capsule, smin } = sd;
const { abs, max, min, sqrt, sin, cos, atan2, PI } = Math;
const cylZ = (x, y, z, r, h) => cylinder(x, z, y, r, h); // axis along z
const clamp01 = (v) => max(0, min(1, v));
const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
const easeInOut = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, v) => a + (b - a) * v;
const lerp3 = (a, b, v) => [lerp(a[0], b[0], v), lerp(a[1], b[1], v), lerp(a[2], b[2], v)];
const norm = ([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const hash = (a, b, c) => { const s = sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

function towerMat(x, y, z, on) {
  M.a = 0.86; M.s = 1;
  if (z > 0.395 && Math.hypot(x - 0.12, y - 0.86) < 0.024) { M.a = 0.4; M.s = 0; M.e = on ? 1 : 0; }
  else if (z < 0.355 && (Math.hypot(x, y - 0.63) < 0.146 || Math.hypot(x, y - 0.29) < 0.146)) { M.a = 0.18; M.s = 0; } // the well
  else if (z < 0.385 && (Math.hypot(x, y - 0.63) < 0.146 || Math.hypot(x, y - 0.29) < 0.146)) { M.a = 1; M.s = 1; }  // blades
}

// ---------- shot 1 · the desk at night ----------
const desk = {
  dur: 6, ground: 0, text: "A LAMP CLICKS ON.", typeAt: 1.5,
  build(t) {
    const on = t > 1.0 || (t > 0.5 && t < 0.6) || (t > 0.75 && t < 0.85);
    const bulb = [LAMP_HEAD[0] + LAMP_DIR[0] * 0.03, LAMP_HEAD[1] + LAMP_DIR[1] * 0.03, LAMP_HEAD[2] + LAMP_DIR[2] * 0.03];
    const lights = [{ p: [-0.38, 1.1, 0.05], power: 0.35, falloff: 9, spot: { dir: [0, -0.35, 0.94], inner: 0.6, outer: 0.1 } }];
    if (on) lights.unshift({ p: bulb, power: 3.6, falloff: 0.4, spot: { dir: LAMP_DIR, inner: 0.82, outer: 0.38 } });
    return {
      ambient: 0,
      camera: { yaw: 34, pitch: 22, half: lerp(1.75, 1.6, easeInOut(t / 6)), target: [0.05, 1.08, 0] },
      map: (x, y, z) => min(y, deskObjects(x, y, z, true)),
      occ: (x, y, z) => deskObjects(x, y, z, false),
      mat(x, y, z) {
        if (y < 0.002) { M.a = 0.72; return; }
        if (x > TX - 0.23 && y > TY + 0.005) return towerMat(x - TX, y - TY, z + 0.04, true);
        const qx = x - bulb[0], qy = y - bulb[1], qz = z - bulb[2];
        if (qx * qx + qy * qy + qz * qz < 0.036 * 0.036) { M.e = on ? 1 : 0; M.a = 0.3; return; }
        if (z > -0.205 && z < -0.19 && abs(x + 0.38) < 0.42 && abs(y - 1.2) < 0.24) {
          // monitor glass: faint scan lines
          M.a = 0.2; M.e = (Math.floor((y - 0.93) / 0.022) % 2 ? 0.5 : 0.34); return;
        }
        if (abs(y - 0.799) < 0.004 && abs(x + 0.38) < 0.32 && abs(z - 0.13) < 0.1) {
          M.a = (Math.floor((x + 0.72) / 0.045) + Math.floor((z - 0.03) / 0.045)) % 2 ? 0.95 : 0.6; return;
        }
        M.a = 0.88; M.s = 1;
      },
      lights,
    };
  },
};

// ---------- shot 2 · close on the fans ----------
const close = {
  dur: 5, ground: 0, text: "TWO FANS, SPINNING.", typeAt: 0.5,
  build(t) {
    const fan = t * 2 * PI * 1.25;
    const lamp = lerp3([-1.3, 0.75, 0.75], [-0.85, 1.0, 1.05], easeInOut(t / 5));
    return {
      ambient: 0,
      camera: { yaw: 28, pitch: 9, half: lerp(1.2, 1.1, t / 5), target: [0.03, 0.47, 0] },
      map: (x, y, z) => min(y, tower(x, y, z, fan)),
      occ: (x, y, z) => tower(x, y, z, fan),
      mat(x, y, z) {
        if (y < 0.002) { M.a = 0.72; return; }
        towerMat(x, y, z, Math.floor(t * 2.5) % 2 === 0);
      },
      lights: [{ p: lamp, power: 2.6 }],
    };
  },
};

// ---------- shot 3 · it lifts off; the shadow swells, blurs, lets go ----------
const lift = {
  dur: 6, ground: 0, text: "THE SHADOW LETS GO.", typeAt: 0.4,
  build(t) {
    const rise = 3.4 * Math.pow(clamp01((t - 1.1) / 3.7), 2.3);
    const spin = 0.35 * easeInOut((t - 1.1) / 4);
    const c = cos(spin), s = sin(spin);
    const obj = (x, y, z) => tower(c * x - s * z, y - rise, s * x + c * z, t * 9);
    return {
      ambient: 0,
      camera: { yaw: 45, pitch: 30, half: 1.9, target: [0, 0.55, 0] },
      map: (x, y, z) => min(y, obj(x, y, z)),
      occ: obj,
      mat(x, y, z) {
        if (y < 0.002) { M.a = 0.75; return; }
        towerMat(c * x - s * z, y - rise, s * x + c * z, true);
      },
      lights: [{ p: [-0.9, 3.7, 1.0], power: 6.5 }],
    };
  },
};

// ---------- shot 4 · a room of them ----------
const room = {
  dur: 7, ground: 0, text: "A LAMP WALKS THE AISLE.", typeAt: 0.5,
  build(t) {
    const xc = -1.6 + t * 0.5;
    return {
      ambient: 0,
      camera: { yaw: 24, pitch: 30, half: 3.1, target: [xc + 0.3, 0.4, -1.6] },
      map: (x, y, z) => min(y, rack(x, y, z)),
      occ: rack,
      mat(x, y, z) {
        if (y < 0.002) {
          const gx = ((x / 0.6) % 1 + 1) % 1, gz = ((z / 0.6) % 1 + 1) % 1;
          M.a = gx < 0.04 || gz < 0.04 ? 0.45 : 0.7; return;
        }
        M.a = 0.8; M.s = 1;
        // front faces: server units + status lights
        const zi = Math.round(z / ROW), lz = z - zi * ROW;
        if (abs(lz - 0.3) < 0.004 && y > 0.06 && y < 1.2) {
          const unit = Math.floor((y - 0.06) / 0.1), uy = (y - 0.06) / 0.1 - unit;
          const xi = Math.round(x / P), lx = x - xi * P;
          if (uy < 0.1) { M.a = 0.35; return; }
          if (abs(lx - 0.15) < 0.028 && abs(uy - 0.55) < 0.22) {
            const blink = hash(xi * 7 + zi, unit, Math.floor(t * 3 + hash(unit, xi, zi) * 3));
            M.e = blink > 0.45 ? 1 : 0; M.a = 0.3; M.s = 0; return;
          }
        }
      },
      lights: [{ p: [xc, 1.3, 0.9], power: 3.0, falloff: 0.4 }],
    };
  },
};

// ---------- shot 5 · paper: a laptop opens on a café table ----------
const anywhere = {
  dur: 6, ground: 1, text: "A LID OPENS.", typeAt: 1.9,
  build(t) {
    const th = lerp(0.02, 1.85, easeOut((t - 0.3) / 1.5));
    const on = th > 1.6;
    const sun = lerp3([-1.6, 6.0, 1.9], [-1.2, 6.0, 2.3], t / 6);
    return {
      ambient: 0.06,
      camera: { yaw: 34, pitch: 30, half: lerp(1.75, 1.55, easeInOut(t / 6)), target: [0.0, 0.72, 0.05] },
      map: (x, y, z) => min(y, cafe(x, y, z, th)),
      occ: (x, y, z) => cafe(x, y, z, th),
      mat(x, y, z) {
        if (y < 0.002) { M.a = 0.95; return; }
        M.a = 0.92; M.s = 1;
        const qy = y - HINGE_Y, qz = z - HINGE_Z;
        const along = qy * sin(th) + qz * cos(th), nrm = qy * cos(th) - qz * sin(th);
        if (nrm < 0.002 && nrm > -0.004 && abs(x - 0.05) < 0.29 && along > 0.03 && along < 0.4) {
          // the screen: a lit page with the tower drawn on it
          M.s = 0; M.a = 0.05;
          if (!on) return;
          const u = (x - 0.05) / 0.29, v = (along - 0.215) / 0.185;
          const inTower = abs(u) < 0.2 && abs(v) < 0.62;
          const wall = inTower && (abs(u) > 0.15 || abs(v) > 0.56);
          const vent = abs(u) < 0.12 && [0.28, 0.12, -0.04].some((c) => abs(v - c) < 0.035);
          const cloud = (u + 0.0) ** 2 / 0.16 + (v - 0.86) ** 2 / 0.01 < 1 && v > 0.8;
          M.e = wall || vent || cloud ? 0 : 0.9;
          return;
        }
        if (abs(y - 0.791) < 0.003 && abs(x - 0.05) < 0.29 && z > -0.08 && z < 0.12) {
          M.a = (Math.floor((x + 0.24) / 0.04) + Math.floor(z / 0.04)) % 2 ? 0.95 : 0.55; M.s = 0; return;
        }
        if (Math.hypot(x + 0.55, z + 0.32) < 0.1 && y > 0.88) { M.a = 0.55; M.s = 0; }
      },
      lights: [{ p: sun, power: 3.4, falloff: 0.02 }],
    };
  },
};

// ---------- shot 6 · closer: the computer, resting on a cloud ----------
const closer = {
  dur: 5.5, ground: 1, text: "ALL OF IT IN ONE BIT.", typeAt: 0.4,
  build(t) {
    const bob = 0.035 * sin(t * 1.7);
    const spin = 0.42 + t * 0.06, c = cos(spin), s = sin(spin), S = 0.6;
    const comp = (x, y, z) => tower((c * x - s * z) / S, (y - bob + 0.9 - 0.64) / S, (s * x + c * z) / S, t * 6) * S;
    const obj = (x, y, z) => min(cloud(x, y - bob + 0.9, z), comp(x, y, z));
    const sun = [-0.9 + t * 0.1, 3.4, 3.0];
    return {
      camera: { yaw: 40, pitch: 22, half: 1.9, target: [0, -0.28, 0] },
      ambient: 0.22,
      map: obj,
      occ: obj,
      mat(x, y, z) {
        const yy = y - bob + 0.9;
        if (comp(x, y, z) < cloud(x, yy, z)) return towerMat((c * x - s * z) / S, (yy - 0.64) / S, (s * x + c * z) / S, true);
        M.a = 0.98;
      },
      lights: [{ p: sun, power: 3.2, falloff: 0.05 }],
    };
  },
};

// 1-bit score: square waves only, cut hard with the picture. Type-on ticks are
// added by score.mjs for every film; this adds what belongs to this story.
function score({ voice, blip, sq, starts, shotEnd, total, shots }) {
  // 01 desk — relay clicks as the lamp flickers on, then the computer's hum
  for (const at of [0.5, 0.6, 0.75, 0.85, 1.0]) blip(at, 700, 0.012, 0.22);
  voice(1.0, shotEnd(0), (u) => sq(50, u) * 0.05 * Math.min(1, u * 4));
  // 02 close — fan buzz pulsing at the blade rate, over the hum
  voice(starts[1], shotEnd(1), (u) => sq(110, u) * (0.6 + 0.4 * sq(8.75, u)) * 0.045 + sq(50, u) * 0.05);
  // 03 lift — the hum rises with the computer and lets go
  voice(starts[2], starts[2] + 4.9, (u) => {
    const v = Math.max(0, (u - 1.1) / 3.7);
    const ph = 50 * (u < 1.1 ? u : 1.1 + ((Math.pow(12, v) - 1) / Math.log(12)) * 3.7);
    return ((ph % 1) < 0.5 ? 1 : -1) * 0.06 * (u > 4.5 ? (4.9 - u) / 0.4 : 1);
  });
  // 04 room — status lights, as blips in A minor over a low floor
  voice(starts[3], shotEnd(3), (u) => sq(55, u) * 0.03);
  const minor = [220, 261.63, 329.63, 392, 329.63, 261.63, 440, 392];
  for (let k = 0; k * 0.25 < shots[3].dur - 0.1; k++) blip(starts[3] + k * 0.25, minor[(k * 3) % minor.length], 0.06, 0.05);
  // 05 anywhere — paper: the screen comes on, a brighter arpeggio
  blip(starts[4] + 1.03, 880, 0.08, 0.07); blip(starts[4] + 1.11, 1318.5, 0.14, 0.07);
  const major = [440, 554.37, 659.25, 880];
  for (let k = 0; 1.4 + k * 0.35 < shots[4].dur - 0.1; k++) blip(starts[4] + 1.4 + k * 0.35, major[k % 4], 0.08, 0.045);
  // 06 closer — a held chord, one bright blip when the call to action lands
  for (const f of [220, 277.18, 329.63]) voice(starts[5], total, (u) => sq(f, u) * 0.03 * Math.min(1, u / 0.6));
  blip(starts[5] + 2.2, 1318.5, 0.18, 0.08);
}

export default {
  title: "Scenes",
  fps: 24,
  shots: [desk, close, lift, room, anywhere, closer],
  score,
};
