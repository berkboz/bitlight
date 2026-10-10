// SLACK — MVP. A cable ship at dawn, a voice on the radio, a small submarine, a cable that
// went quiet. Three playable scenes joined by cutscenes: DECK → ROOM → DIVE (sub, then on foot).
import * as E from "./engine.js";
import * as F from "./figures.js";
import { gpu } from "../../src/gpu.js";

const { COLS, ROWS, cam, layer, disc, rect, seg, fillBelow, dot, draw, clamp, lerp, sstep, hash } = E;
const { sin, cos, abs, PI, max, min, floor, hypot } = Math, TAU = PI * 2;
const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);

// ---------- canvas ----------
const cv = $("#c"), ctx = cv.getContext("2d");
cv.width = COLS; cv.height = ROWS;
const img = ctx.createImageData(COLS, ROWS), px = new Uint32Array(img.data.buffer);
const gcv = $("#g");
const GP = { view: null, tried: false, shown: false };
let cellPx = 2;
const GK = 2;                                             // GPU buffer pixels per dot: fixed, so its dots always match ours
function fit() {
  // whole pixels per dot when there is room; on a phone, whatever fits (the words then sit under a smaller reserve)
  const small = innerHeight < 520 || innerWidth < 720, room = min(innerWidth / COLS, (innerHeight - (small ? 76 : 130)) / ROWS);
  const cell = room >= 2 ? floor(room) : max(0.5, room);
  for (const c of [cv, gcv]) { c.style.width = COLS * cell + "px"; c.style.height = ROWS * cell + "px"; }
  document.body.classList.toggle("small", small);
  // bitlight/gpu sizes dots in CSS px; give it the cell that makes exactly GK buffer px per dot
  if (gcv.width !== COLS * GK) { gcv.width = COLS * GK; gcv.height = ROWS * GK; }
  cellPx = GK / ((COLS * GK) / (COLS * cell));
}
addEventListener("resize", fit); fit();

// ---------- input ----------
const keys = new Set(), hit = new Set();
const ptr = { x: COLS * 0.7, y: ROWS * 0.6, down: false, moved: -99 };
addEventListener("keydown", (e) => {
  if (!keys.has(e.code)) hit.add(e.code);
  keys.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
const toCells = (e) => { const r = cv.getBoundingClientRect(); ptr.x = ((e.clientX - r.left) / r.width) * COLS; ptr.y = ((e.clientY - r.top) / r.height) * ROWS; ptr.moved = now; };
cv.addEventListener("pointermove", toCells);
// a finger on the picture only aims the lamp: on touch, the tool is its own button
cv.addEventListener("pointerdown", (e) => { toCells(e); if (e.pointerType !== "touch") ptr.down = true; });
addEventListener("pointerup", () => (ptr.down = false));
const stick = { x: 0, y: 0 };                             // the touch stick, when there is one
const ax = () => (keys.has("KeyD") || keys.has("ArrowRight") || stick.x > 0.3 ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") || stick.x < -0.3 ? 1 : 0);
const ay = () => (keys.has("KeyS") || keys.has("ArrowDown") || stick.y > 0.3 ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") || stick.y < -0.3 ? 1 : 0);
// ---------- touch: a stick on the left, act and hold on the right ----------
let TOUCH = matchMedia("(pointer: coarse)").matches;
function touchOn() { TOUCH = true; document.body.classList.add("touch"); }
if (TOUCH) touchOn();
addEventListener("touchstart", touchOn, { once: true, passive: true });
{
  const pad = $("#pad"), nub = $("#pad i");
  const move = (e) => {
    const r = pad.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2), l = max(1, hypot(dx, dy));
    stick.x = dx / l; stick.y = dy / l; nub.style.transform = `translate(${stick.x * 30}px, ${stick.y * 30}px)`;
  };
  const end = () => { stick.x = stick.y = 0; nub.style.transform = ""; };
  pad.addEventListener("pointerdown", (e) => { pad.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
  pad.addEventListener("pointermove", (e) => { if (pad.hasPointerCapture(e.pointerId)) move(e); });
  pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
  const hold = (el, code, tap) => {
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); if (tap) hit.add(code); else keys.add(code); el.classList.add("on"); e.preventDefault(); });
    const up = () => { keys.delete(code); el.classList.remove("on"); };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };
  hold($("#bE"), "KeyE", true); hold($("#bT"), "Space", false);
}
const actHit = () => hit.has("KeyE") || hit.has("Enter");
const toolDown = () => keys.has("Space") || ptr.down;

// ---------- audio ----------
let ac, master, lp, seaGain;
function startAudio() {
  if (ac) return;
  try {
    ac = new AudioContext(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; lp.connect(master);
    [55, 55.45, 82.4].forEach((f, i) => { const o = ac.createOscillator(); o.type = i % 2 ? "triangle" : "sawtooth"; o.frequency.value = f; const g = ac.createGain(); g.gain.value = 0.02; o.connect(g).connect(lp); o.start(); });
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource(); n.buffer = buf; n.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 0.4;
    seaGain = ac.createGain(); seaGain.gain.value = 0; n.connect(bp).connect(seaGain).connect(lp); n.start();
  } catch { ac = null; }
}
function tone(f, len, vol, type = "triangle", f2 = f * 0.4) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(max(20, f2), t + len);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  o.connect(g).connect(lp || master); o.start(t); o.stop(t + len + 0.02);
}
const knock = (f = 110, len = 0.14, vol = 0.4) => tone(f, len, vol);
const ping = () => tone(880, 1.8, 0.05, "sine", 870);
const blip = () => tone(118 + Math.random() * 46, 0.07, 0.11, "triangle", 100);   // the old man, when a line has no recording
// his recorded lines live in voice/<hash of the text>.mp3 (see voice.mjs); a line without one falls back to blips
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
let voiceEl = null;
function speak(m) {
  if (!ac || qs.has("mute")) return;
  try {
    if (voiceEl) voiceEl.pause();
    const a = (voiceEl = new Audio(`./voice/${fnv(m.text)}.mp3`));
    a.volume = 0.95;
    a.onloadedmetadata = () => { m.dur = a.duration; m.hold = max(m.hold, a.duration + 0.9); };
    a.play().catch(() => {});
  } catch { /* no recording: blips */ }
}

// ---------- words ----------
let now = 0;
const band = { q: [], cur: null, shownAt: 0, lastEnd: -9, said: new Set(), done: new Set(), n: 0 };
// who: "radio" (the old man), or a name for a caption
function say(text, { id = text, who = "radio", gap = 1.6, urgent = false, red = false, keep = false } = {}) {
  if (band.said.has(id)) return false;
  band.said.add(id);
  const m = { text, id, who, gap, red, keep, born: now };
  urgent ? band.q.unshift(m) : band.q.push(m);
  return true;
}
const talking = () => !!band.cur && band.cur.who === "radio" && band.n < band.cur.text.length;
function pump() {
  const b = band;
  if (b.cur && now - b.shownAt > b.cur.hold) { b.done.add(b.cur.id); b.cur = null; $("#say").textContent = ""; $("#log").textContent = ""; b.lastEnd = now; }
  if (!b.cur && b.q.length && now - b.lastEnd > b.q[0].gap) {
    const m = b.q.shift();
    b.cur = m; b.n = 0; m.hold = max(2.6, m.text.length * 0.062 + 1.1); b.shownAt = now;
    if (m.who === "radio") speak(m);
    const lg = $("#log"); lg.textContent = m.who === "radio" ? "· on the line ·" : m.who; lg.classList.toggle("red", !!m.red);
  }
  if (b.cur) {
    // the words appear as he says them: at his pace when there is a recording, at typing pace when not
    const n = min(b.cur.text.length, floor((now - b.shownAt) * (b.cur.dur ? b.cur.text.length / (b.cur.dur * 0.94) : 40)));
    if (n !== b.n) { if (b.cur.who === "radio" && !b.cur.dur && n % 3 === 0 && b.cur.text[n - 1] !== " ") blip(); b.n = n; $("#say").textContent = b.cur.text.slice(0, n); }
  }
}
const prompt = (label) => { const p = $("#prompt"); if (label) { p.innerHTML = TOUCH ? label.replace("hold space", "hold ●") : label; p.classList.add("on"); } else p.classList.remove("on"); };
let cardT = 0;
function card(html, secs = 4) { const c = $("#card"); c.innerHTML = html; c.classList.add("on"); cardT = now + secs; }

// ---------- scenes ----------
const scenes = {};
let scene = null, sceneT = 0, fade = 1, fadeTo = 0, pending = null;
function go(name, arg) { if (pending) return; pending = { name, arg }; fadeTo = 1; }
function enter(name, arg) {
  // lines still waiting belong to the place you just left: forget them, so they can be said again there
  for (const m of band.q) if (!m.keep) band.said.delete(m.id);
  band.q = band.q.filter((m) => m.keep);
  scene = scenes[name]; sceneT = 0; prompt(null); showG(false); document.body.classList.remove("cine"); scene.enter(arg || {}); }

// what carries from one dive to the next
const RUN = { leg: 1, cuts: [], cutIds: [], salvage: 0, sleeve: false, logSeen: false };
const you = { x: 130, face: 1, wt: 0, moving: false, sit: false };
// a soft shadow on a floor band, so things stand on it rather than float
const shade = (x, y, w, a, n) => { rect(x, y, w, 2.5, a, { z: 0.5, n }); rect(x, y, w * 0.66, 3.5, a * 0.86, { z: 0.6, n }); };
function walk(dt, x0, x1, locked) {
  const d = locked || you.sit ? 0 : ax();
  you.moving = d !== 0;
  if (d) {
    you.face = d; you.x = clamp(you.x + d * 58 * dt, x0, x1);
    const a = floor(you.wt * 2); you.wt += dt * 1.15;
    if (floor(you.wt * 2) !== a) knock(70 + Math.random() * 20, 0.05, 0.12);
  }
}
const youPose = () => ({ m: you.sit ? "sit" : you.moving ? "walk" : "idle", f: you.moving ? floor(you.wt * 8) % 8 : 0 });
// things you can walk up to: [{ x, r, label, act }]
function nearest(list, x) { let best = null, bd = 1e9; for (const o of list) { const d = abs(o.x - x); if (d < (o.r || 22) && d < bd) { bd = d; best = o; } } return best; }

// =====================================================================================
// DECK — dawn on the cable ship
// =====================================================================================
const DW = 780, DF = 160;
const deck = { bo: { x: 540, dir: 1, n: 0 }, gull: { x: 262, y: DF - 28, fly: 0, t: 0 }, catUp: 0, intro: 0, ch: 1, subTries: 0 };
const WARM = { lit: [250, 236, 212], unlit: [42, 31, 27] };
const nrm3 = (x, y, z) => { const l = hypot(x, y, z); return [x / l, y / l, z / l]; };
scenes.deck = {
  enter({ intro, at }) {
    const d = deck;
    d.ch = RUN.leg; d.t0 = now; d.subTries = d.subTries || 0;
    you.sit = false; you.x = at ?? (d.ch === 2 ? 150 : 132); you.face = at ? -1 : 1;
    d.intro = intro ? 7.5 : 0;
    d.gull = { x: 262, y: DF - 28, fly: 0, t: 0 };
    if (intro) { document.body.classList.add("cine"); cam.x = DW - COLS; card("north atlantic · 05:40\ncable ship <i>patience</i>", 5.5); }
    else if (d.ch === 2 && !at) { cam.x = 0; card("the same day · 13:10", 4); say("Up she comes. Mind your head. Mind his, too.", { id: "upshe", who: "bo" }); }
    if (seaGain) seaGain.gain.value = 0.05;
    if (lp) lp.frequency.value = 2400;
  },
  step(dt) {
    const d = deck, intro = sceneT < d.intro, two = d.ch === 2;
    if (!intro && document.body.classList.contains("cine")) document.body.classList.remove("cine");
    walk(dt, 30, DW - 40, intro);
    const tx = clamp(you.x - COLS / 2 + you.face * 16, 0, DW - COLS);
    if (intro) cam.x = lerp(DW - COLS, tx, sstep(0.12, 0.95, sceneT / d.intro)); else cam.x += (tx - cam.x) * min(1, 3.5 * dt);
    cam.y = 0;
    d.bo.x += d.bo.dir * 9 * dt; if (d.bo.x > 566) d.bo.dir = -1; if (d.bo.x < 512) d.bo.dir = 1;
    d.catUp = abs(you.x - 452) < 46 ? 1 : 0;
    const g = d.gull;
    if (!g.fly && abs(you.x - g.x) < 40) { g.fly = 1; knock(900, 0.12, 0.08); }
    if (g.fly) { g.t += dt; g.x -= 46 * dt; g.y -= (28 - g.t * 6) * dt; }
    if (intro) return;
    // nobody makes you go below. They do mention it.
    if (!two) {
      if (sceneT > 50) say("He's waiting, you know. He's very good at it.", { id: "wait1", who: "bo" });
      if (sceneT > 110) say("No rush. There's a small hurry. It is getting less small.", { id: "wait2" });
    }
    if (you.x <= 32) say("That's the edge of the ship. Past it is the job.", { id: "edge", who: "you think" });
    const BO = two
      ? ["You came back up. Most do.", "He talks about that old cable like it owes him a letter.", "Mind the wet bit. Different wet bit."]
      : ["Morning. Mind the wet bit. It's all the wet bit.", "He's been on that radio since before I signed on. Before the ship did, maybe.", "If he says take your time, hurry."];
    const list = [
      { x: 190, r: 34, label: "the submarine", act: () => {
        d.subTries++;
        const L = two ? ["Dripping. Give it a minute. Give him a minute too."] : ["Not yet. He likes a briefing first.", "Still not yet.", "Fine. It's locked anyway."];
        say(L[min(d.subTries - 1, L.length - 1)], { id: "dsub" + d.ch + min(d.subTries, 3) + floor(now / 9), who: "you think" });
      } },
      { x: 340, r: 28, label: "the drum", act: () => say("The slack. Forty kilometres of spare cable, for when things go wrong. Things go wrong.", { id: "ddrum" + floor(now / 9), who: "the slack" }) },
      { x: 452, r: 22, label: "the cat", act: () => { say(two ? "The cat has not moved. The cat has been very busy." : "The cat does not work here. The cat believes it does.", { id: "dcat" + floor(now / 9), who: "the cat" }); knock(520, 0.2, 0.08); } },
      { x: d.bo.x, r: 26, label: "talk to Bo", act: () => { say(BO[d.bo.n % 3], { id: "bo" + d.ch + d.bo.n, who: "bo" }); d.bo.n++; } },
      { x: 652, r: 20, label: "go below", act: () => { knock(140, 0.2, 0.3); go("room"); } },
    ];
    const n = nearest(list, you.x);
    prompt(n ? `<kbd>E</kbd>${n.label}` : null);
    if (n && actHit()) n.act();
  },
  draw() {
    const t = now, H0 = 104 + sin(t * 0.7) * 2, d = deck, noon = d.ch === 2;
    // dawn, then the same day at one o'clock: the sun climbs, shrinks and stops being the horizon's business
    const sunX = (noon ? 300 : 276) - cam.x * 0.05, sunY = noon ? 34 : H0 - 12, sunR = noon ? 7 : 12;
    env.holes = false; env.tones = 16; env.screen = "diagonal"; env.lit = noon ? [252, 244, 228] : WARM.lit; env.unlit = noon ? [38, 34, 36] : WARM.unlit; env.amb = noon ? 0.44 : 0.36; env.ambRow = null;
    env.sun = { d: noon ? nrm3(0.25, -0.78, 0.57) : nrm3(0.56, -0.5, 0.66), p: noon ? 0.78 : 0.7 }; env.lights = []; env.outline = "dark"; env.cut = 0; env.fog = 0;
    env.bg = (i, j) => {
      if (j < H0) { const q = j / H0, dx = i - sunX, dy = j - sunY; return (noon ? 0.72 + 0.16 * q : 0.5 + 0.4 * q * q) + 0.3 * Math.exp(-(dx * dx + dy * dy) / (noon ? 700 : 2200)); }
      const q = (j - H0) / (ROWS - H0), w = sin(i * 0.09 + j * 0.7 + t * 1.6) * sin(j * 0.35 - t * 0.9);
      const glit = abs(i - sunX) < (noon ? 3 : 5) + (j - H0) * 0.3 ? 0.3 * max(0, sin(j * 1.9 + t * 4 + i * 0.4)) : 0;
      return (noon ? 0.7 : 0.62) - 0.3 * q + 0.08 * w + glit;
    };
    const FN = [0, -0.86, 0.5], sx_ = noon ? -1 : -7;                    // shadows lean away from the sun
    E.clear();
    layer(0.05, -300); disc(sunX + cam.x * 0.05 + E.lx(), sunY, sunR, 0.9, { e: 1, red: 1 });
    layer(0.08, -280);
    for (const [cx, cy, s] of [[60, 34, 1], [190, 20, 0.8], [330, 42, 1.15]]) {
      const x = ((cx + t * 1.4) % 470) - 40 + E.lx();
      disc(x, cy, 9 * s, 0.95, { round: 1 }); disc(x + 11 * s, cy + 2, 7 * s, 0.95, { round: 1 }); disc(x - 10 * s, cy + 3, 6 * s, 0.95, { round: 1 });
    }
    // the ship
    layer(1, -40);
    rect(DW / 2, DF + 3, DW / 2, 11, 0.62, { n: [0, -0.86, 0.5] });
    for (let x = 0; x < DW; x += 22) rect(x, DF + 3, 0.5, 11, 0.46, { z: 0.1, n: [0, -0.86, 0.5] });
    shade(192 + sx_ * 2, DF - 1, 30, 0.4, FN); shade(340 + sx_ * 2, DF + 1, 22, 0.4, FN); shade(452 + sx_, DF + 3, 11, 0.4, FN);
    shade(d.bo.x + sx_, DF + 5, 9, 0.4, FN); shade(you.x + sx_, DF + 9, 8, 0.4, FN);
    rect(DW / 2, DF + 36, DW / 2, 22, 0.3); rect(DW / 2, DF + 17, DW / 2, 1.5, 0.86, { z: 0.2 });
    for (let x = 34; x < DW; x += 74) { disc(x, DF + 34, 7, 0.62, { z: 0.3 }); disc(x, DF + 34, 4.5, 0.5, { z: 0.5, e: 0.75 }); }
    for (let x = 0; x <= 610; x += 36) rect(x, DF - 17, 1.5, 11, 0.72, { z: 6 });
    seg(0, DF - 27, 608, DF - 27, 2.4, 0.82, { z: 6 }); seg(0, DF - 17, 608, DF - 17, 1.4, 0.7, { z: 6, flat: 1 });
    // crane, with the submarine waiting under it
    rect(70, 88, 4, 64, 0.52, { z: 4 }); seg(70, 26, 196, 44, 4.5, 0.56, { z: 4 }); seg(70, 60, 120, 34, 2, 0.45, { z: 4 });
    seg(196, 44, 196, DF - 36, 1, 0.45, { z: 4, flat: 1 });
    rect(168, DF - 4, 4, 4, 0.4, { z: 20 }); rect(214, DF - 4, 4, 4, 0.4, { z: 20 });
    draw(F.sub, { f: 0, lit: 0 }, 192, DF - 6, { size: 22, z: 22 });
    // the slack
    draw(F.drum, {}, 340, DF - 2, { size: 22, z: 26 });
    seg(322, DF - 40, 232, DF - 25, 2, 0.82, { z: 16 }); seg(232, DF - 25, 0, DF - 24, 2, 0.82, { z: 16 });
    // cabin
    rect(690, 105, 90, 45, 0.74, { z: 4 }); rect(690, 58, 94, 3, 0.4, { z: 5 });
    for (let x = 608; x < 780; x += 14) rect(x, 105, 0.5, 45, 0.64, { z: 4.2 });
    rect(652, 123, 12, 27, 0.12, { z: 5 }); rect(652, 95, 14, 1.5, 0.5, { z: 5.5 }); disc(660, 126, 1.2, 0.9, { z: 5.5 });
    disc(652, 86, 2.2, 0.9, { e: 1, z: 6 });
    disc(712, 98, 9, 0.6, { z: 5 }); disc(712, 98, 6.5, 0.5, { e: 0.75, z: 5.5 });
    disc(742, 124, 8, 0.9, { red: 1, e: 0.5, z: 5 }); disc(742, 124, 4, 0.74, { z: 5.4 });
    // company
    draw(F.crate, {}, 452, DF + 1, { size: 26, z: 34 });
    draw(F.cat, { f: floor(t * 5) % 6, sleep: d.catUp ? 0 : 1 }, 454, DF - 15, { size: 26, z: 36, flip: you.x < 452 });
    draw(F.bo, { f: floor(t * 7) % 8 }, d.bo.x, DF + 3, { size: 26, z: 38, flip: d.bo.dir < 0 });
    const g = d.gull;
    if (g.y > -40) draw(F.gull, { f: floor(t * 12) % 6, fly: g.fly }, g.x, g.y, { size: 22, z: 8, flip: !!g.fly });
    draw(F.gull, { f: floor(t * 9) % 6, fly: 1 }, 420 + sin(t * 0.3) * 160 + cam.x * 0.7, 30 + sin(t * 0.5) * 8, { size: 9, z: -200, flip: cos(t * 0.3) < 0 });
    draw(F.diver, youPose(), you.x, DF + 7, { size: 26, z: 48, flip: you.face < 0 });
    // foreground: a bollard and a hanging line, out of focus
    layer(1.35, 90);
    for (const x of [140, 560, 900]) { disc(x, ROWS + 2, 13, 0.24, { round: 1 }); rect(x, ROWS - 14, 5, 9, 0.24); disc(x, ROWS - 23, 8, 0.26, { round: 1 }); }
    seg(700, -6, 716, 54 + sin(t) * 2, 3, 0.26);
  },
};

// =====================================================================================
// ROOM — the briefing. The old man is the radio.
// =====================================================================================
const RF = 168;
const room = { lampX: 200, s1: { i: 0 }, s2: { i: 0 }, wait: 0, done: false, done2: false, doneAt: 0, tea: 0, asked: 0, asked2: 0, left: 0, deb: null };
// He speaks one line at a time, and only while you are in the room: walk out and he waits.
function tell(st, lines) {
  if (st.i >= lines.length) return true;
  const l = lines[st.i];
  if (l.when && !l.when()) return false;
  if (!band.said.has(l.id)) say(typeof l.text === "function" ? l.text() : l.text, { id: l.id });
  else if (band.done.has(l.id)) st.i++;
  return false;
}
const BRIEF = [
  { id: "b0", text: "Ah. There you are. Mind the step. There isn't one, but mind it anyway." },
  { id: "b1", text: "Sit down, if you like." },
  { id: "b2", when: () => you.sit || (room.wait && now - room.wait > 8), text: () => (you.sit ? "Thank you. People used to sit all the time." : "Or stand. Standing is also a way of listening.") },
  { id: "b3", text: "A cable has gone quiet. Two thousand metres down. I'd like to know why." },
  { id: "b4", text: "The little submarine is yours. Sorry about the controls. Nobody asked what they were for." },
  { id: "b5", text: "Follow the line down. Bring me the first thing that looks wrong. Take your time. There's a small hurry." },
  { id: "b6", text: "The hatch is by the wall, when you're ready." },
];
const QUIET = {
  E: "Svalbard went quiet at ten past nine. I expect that was nothing to do with you.",
  A: "And Hobart. A small thing. A voice note. I'm sure he'll send another.",
};
function debrief() {
  const L = [
    { id: "d0", text: "Back. Good. Put it on the desk. Anywhere. Not on the tea." },
    { id: "d1", text: "A shark. Good. I like it when it's a shark. Sharks don't mean anything by it." },
  ];
  const cut = RUN.cutIds.filter((id) => QUIET[id]);
  if (cut.length) cut.forEach((id) => L.push({ id: "dq" + id, text: QUIET[id] }));
  else L.push({ id: "dq0", text: "And nothing went quiet on the way. I noticed. Thank you." });
  L.push({ id: "d3", text: "But a shark didn't stop the line. The break is further along, past the red marker." });
  L.push({ id: "d4", text: "Same hatch. Take your time. You know how much of it there is." });
  return L;
}
scenes.room = {
  enter() {
    const r = room;
    you.x = 44; you.face = 1; you.sit = false; cam.x = 0; cam.y = 0;
    if (RUN.leg === 2 && !r.deb) r.deb = debrief();
    if (r.left && RUN.leg === 1 && !r.done && r.s1.i > 0) say("Where were we. I'd got as far as hello.", { id: "where" + r.left });
    if (seaGain) seaGain.gain.value = 0.015;
    if (lp) lp.frequency.value = 1100;
  },
  step(dt) {
    const r = room, two = RUN.leg === 2;
    walk(dt, 26, 356, false);
    r.lampX += (200 + (ptr.x - 200) * 0.2 + sin(now * 1.3) * 2 - r.lampX) * min(1, 2.5 * dt);
    if (sceneT > 1.2) {
      if (!two) {
        if (band.done.has("b1") && !r.wait) r.wait = now;
        if (!r.done && tell(r.s1, BRIEF)) { r.done = true; r.doneAt = now; }
      } else if (!r.done2 && tell(r.s2, r.deb)) { r.done2 = true; r.doneAt = now; }
    }
    if ((two ? r.done2 : r.done) && now - r.doneAt > 30) say("The hatch hasn't moved. I checked.", { id: "hatchidle" + RUN.leg });
    const ready = two ? r.done2 : r.done;
    const list = [
      { x: 22, r: 18, label: "back on deck", act: () => { if (!ready) { r.left++; say("The sea is the other way. Down, mostly.", { id: "leave" + r.left, urgent: true, keep: true }); } go("deck", { at: 652 }); } },
      { x: 158, r: 16, label: you.sit ? "stand up" : "sit", act: () => {
        if (you.sit && !ready && r.s1.i >= 3) say("Up again. That's all right. I'll talk to your knees.", { id: "knees", urgent: true });
        you.sit = !you.sit; you.x = 158; you.face = 1; knock(90, 0.1, 0.2);
      } },
      { x: 197, r: 12, label: "the tea", act: () => { say(["That's my tea. Well. It was.", "Still my tea.", "I'd offer you some, but I'm a radio."][r.tea % 3], { id: "tea" + r.tea, urgent: true }); r.tea++; } },
      { x: 226, r: 12, label: "the radio", act: () => say("Yes, hello. That's me. Mind the dial, it's the only one I have.", { id: "rad" + floor(now / 12), urgent: true }) },
      { x: 266, r: 14, label: "the chart", act: () => say("That's her. Nine thousand kilometres, shore to shore. The gap is where we're going.", { id: "chart" + floor(now / 12), urgent: true }) },
      { x: 332, r: 20, label: "the hatch", act: () => {
        const asked = two ? r.asked2 : r.asked;
        if (ready || asked) { if (!ready) say(two ? "Or go. I'll tell the rest to the tea." : "Or go now. The briefing was mostly me apologising.", { id: "skip" + RUN.leg, urgent: true, keep: true }); knock(80, 0.4, 0.4); go("dive"); }
        else { if (two) r.asked2 = 1; else r.asked = 1; say(two ? "Debrief first. It's shorter than the briefing. I've been practising." : "Briefing first, if you would. I've prepared one. It's short.", { id: "ask" + RUN.leg, urgent: true }); }
      } },
    ];
    // the dive log, once you have been down: yesterday's entry is in your handwriting
    if (two) list.push({ x: 244, r: 9, label: "the dive log", act: () => {
      say("Yesterday, in your handwriting: 'cut made. not logged.'", { id: "log" + floor(now / 15), who: "dive log", urgent: true, red: true });
      say("Ah. You found that. We don't need to talk about it. We could, though.", { id: "logr" }); RUN.logSeen = true;
    } });
    const n = you.sit ? list[1] : nearest(list, you.x);
    prompt(n ? `<kbd>E</kbd>${n.label}` : null);
    if (n && actHit()) n.act();
  },
  draw() {
    const t = now, r = room, bob = sin(t * 0.7) * 2;
    env.holes = false; env.tones = 8; env.screen = "bayer"; env.lit = [255, 228, 180]; env.unlit = [24, 17, 13]; env.amb = 0.2; env.ambRow = null; env.sun = null;
    env.outline = "light"; env.haloMin = 0.2; env.cut = 0; env.fog = 0;
    env.lights = [{ x: r.lampX, y: 62, z: 22, p: 3.9, k: 0.00055 }, { x: 84, y: 66, z: 46, p: 1.2, k: 0.001 }];
    env.bg = (i, j) => (j < 70 + bob ? 0.86 : 0.45 + 0.08 * sin(j * 1.3 + i * 0.2 + t * 2));   // the sea, through the porthole
    E.clear();
    layer(1, -40);
    rect(192, 75, 192, 75, 0.5);
    for (let x = 12; x < COLS; x += 24) rect(x, 75, 0.5, 75, 0.4, { z: 0.1 });
    rect(192, 148, 192, 2, 0.3, { z: 0.3 });
    rect(192, 183, 192, 33, 0.46, { n: [0, -0.85, 0.52] });
    for (let y = 158; y < ROWS; y += 10) rect(192, y, 192, 0.5, 0.36, { z: 0.1, n: [0, -0.85, 0.52] });
    { const FN = [0, -0.85, 0.52], k = (x) => (x - r.lampX) * 0.06;   // shadows fall away from the lamp
      shade(216 + k(216), RF, 22, 0.27, FN); shade(158 + k(158), RF + 1, 8, 0.27, FN); if (!you.sit) shade(you.x + k(you.x), RF + 6, 8, 0.27, FN); }
    // porthole
    disc(84, 66, 17, 0.8, { z: 1 }); disc(84, 66, 13, 0, { z: 1.5 });
    // door to the deck
    rect(22, 116, 15, 34, 0.66, { z: 1 }); rect(22, 118, 12, 32, 0.14, { z: 1.4 }); disc(22, 100, 5, 0.3, { z: 1.6, e: 0.6 }); disc(31, 122, 1.2, 0.9, { z: 1.7 });
    // the chart, with the one red line and its gap
    rect(266, 66, 44, 30, 0.88, { z: 1 }); rect(266, 66, 46, 32, 0.34, { z: 0.6 });
    seg(228, 50, 240, 62, 1.6, 0.4, { z: 1.2, flat: 1 }); seg(240, 62, 234, 80, 1.6, 0.4, { z: 1.2, flat: 1 }); seg(234, 80, 246, 92, 1.6, 0.4, { z: 1.2, flat: 1 });
    seg(300, 44, 292, 60, 1.6, 0.4, { z: 1.2, flat: 1 }); seg(292, 60, 304, 78, 1.6, 0.4, { z: 1.2, flat: 1 }); seg(304, 78, 296, 92, 1.6, 0.4, { z: 1.2, flat: 1 });
    seg(240, 70, 262, 64, 1.4, 0.9, { z: 1.3, flat: 1, red: 1, e: 0.5 }); seg(272, 66, 294, 62, 1.4, 0.9, { z: 1.3, flat: 1, red: 1, e: 0.5 });
    if (sin(t * 4) > 0) disc(267, 65, 2, 0.9, { z: 1.4, red: 1, e: 0.8 });
    // shelf, books, a clock that tells the real time
    rect(336, 92, 30, 1.5, 0.6, { z: 2 });
    [[312, 9, 0.3], [318, 12, 0.8], [323, 10, 0.5], [329, 13, 0.36], [335, 8, 0.86], [343, 11, 0.44], [350, 12, 0.7], [357, 9, 0.3]].forEach(([x, h, a]) => rect(x, 90.5 - h / 2, 2.4, h / 2, a, { z: 2 }));
    disc(340, 44, 11, 0.4, { z: 1 }); disc(340, 44, 9, 0.9, { z: 1.3 });
    const dt_ = new Date(), hA = ((dt_.getHours() % 12) + dt_.getMinutes() / 60) / 12 * TAU, mA = (dt_.getMinutes() / 60) * TAU;
    seg(340, 44, 340 + sin(hA) * 4.5, 44 - cos(hA) * 4.5, 1.6, 0.1, { z: 1.5, flat: 1 }); seg(340, 44, 340 + sin(mA) * 7, 44 - cos(mA) * 7, 1.2, 0.1, { z: 1.5, flat: 1 });
    // the hatch
    rect(332, RF + 8, 19, 5, 0.08, { z: 0.4 }); rect(332, RF + 8, 21, 6.5, 0.7, { z: 0.3 });
    seg(320, RF + 6, 320, RF - 22, 2, 0.74, { z: 30 }); seg(344, RF + 6, 344, RF - 22, 2, 0.74, { z: 30 }); seg(320, RF - 22, 344, RF - 22, 2, 0.74, { z: 30 });
    // furniture and the man himself
    layer(1, 0);
    draw(F.chair, {}, 158, RF - 3, { size: 26, z: -8 });
    draw(F.desk, {}, 216, RF - 5, { size: 26, z: -6 });
    draw(F.radio, { talk: talking() ? 1 : 0, f: floor(t * 14) % 2 }, 228, RF - 25, { size: 26, z: -2 });
    draw(F.mug, {}, 196, RF - 25, { size: 26, z: 0 });
    if (RUN.leg === 2) {                                                   // what you brought up, and the log that was always there
      draw(F.sleeve, {}, 210, RF - 28, { size: 20, z: 1 });
      rect(244, RF - 26.5, 6, 1.5, 0.3, { z: 3 }); rect(244, RF - 27.5, 5.4, 1, 0.9, { z: 3.2 }); rect(244, RF - 27.5, 0.5, 1, 0.3, { z: 3.4 });
    }
    for (let i = 0; i < 3; i++) { const q = (t * 0.5 + i / 3) % 1; dot(197 + sin(q * 6 + i) * 2.5, RF - 32 - q * 14, 0, { e: 0.5 * (1 - q), z: 2 }); }
    seg(200, -2, r.lampX, 50, 1, 0.3, { flat: 1, z: 10 });
    draw(F.lampShade, {}, r.lampX, 58, { size: 26, z: 12 });
    draw(F.diver, youPose(), you.x + (you.sit ? 1 : 0), RF + (you.sit ? -8 : 4), { size: 26, z: you.sit ? -4 : 14, flip: you.face < 0 });
    layer(1.3, 90);
    rect(-8, 108, 20, 108, 0.16); disc(470, ROWS + 4, 30, 0.2, { round: 1 });
  },
};

// =====================================================================================
// DIVE — lowered in, the lamp, the things that live on the line, then out on foot.
// The seabed is a floor you look down onto: things stand at different depths on it (lanes),
// and a lamp throws a real pool across it. Almost everything is dark until you light it.
// =====================================================================================
const WW = 1840, SB = 300, SPLICE = 1700, WALL = 1150, SZ = 22, FLOORH = 78, ZK = E.ZK, M_PER = 6;
const T = (x) => SB;                                                         // the floor's far edge (flat: relief is shading)
const cl = (x) => 38 + 11 * sin(x * 0.013);                                  // the cable's lane: it wanders nearer and further
const ridgeFar = (x) => 205 + 14 * sin(x * 0.011) + 7 * sin(x * 0.043 + 2);
const D = {};
const BEACONS = [{ x: 640, red: 0 }, { x: 1010, red: 1 }, { x: 1318, red: 0, flick: 1 }];
const branches = () => [
  { id: "E", x0: 432, x1: 506, side: -1, lift: 22, dur: 1.2, who: "COLDSTRAND-4 · Svalbard · the webcam bear, who had just stood up", line: "Ah, well. Bears don't need the internet to stand up." },
  { id: "A", x0: 852, x1: 938, side: 1, lift: 24, dur: 1.2, who: "TIDEWELL-2 · Hobart · a fourteen-second voice note from Dad, unplayed", line: "Oh. He was going to tell you about the shed. He does that." },
  { id: "B", x0: 1176, x1: 1276, side: 1, lift: 26, dur: 1.2, who: "MAREA-3 · Lisbon · Senhor Vidal's 06:40 tram", line: "Oh, Vidal. He'll wait anyway. He always does." },
  { id: "C", x0: 1296, x1: 1392, side: -1, lift: 24, dur: 1.2, who: "MAREA-4 · Lisbon · nothing changed. MAREA-5 ran alongside, unbothered.", line: "Two cables, one job. I'm not cross. I'm just disappointed in the spare." },
];
const bl = (b, x) => cl(x) + b.side * b.lift * sin(clamp((x - b.x0) / (b.x1 - b.x0), 0, 1) * PI);
const SMASH = ["Gently with the barnacles. They've held on a long time.", "Easy, easy. I know it's satisfying. So is tea, and quieter.", "Mind that. It's older than us both."];
function diveReset() {
  Object.assign(D, {
    sub: { x: 150, y: -64, vx: 0, vy: 0, face: 1, lane: cl(150), dir: [0.8, 0.6, 0], prop: 0 }, me: { x: 0, y: 0, vx: 0, vy: 0, face: 1, lane: 38, sw: 0, dir: [0.8, 0.6, 0] },
    mode: "lower", ctrl: false, splash: false, salvage: 0, quiet: 0, cuts: [], smashN: 0, ended: false, far: 0, disob: 0, hoseSaid: 0, latch: false, bubbles: [], debris: [],
    branches: branches().map((b) => ({ ...b, cut: false, prog: 0 })),
    things: [
      { kind: "pod", def: F.pod, x: 790, dl: 0, act: "smash", dur: 0.8, say: "Repeater. Eleven of these between here and the far shore, each a small obedient amplifier." },
      { kind: "sleeve", def: F.sleeve, x: 1096, dl: 0, up: 5, act: "collect", dur: 0.6, say: "A shark bit the cable and the cable bit back, in polymer. The sleeve is the result." },
      { kind: "barn", def: F.barnacles, x: 1130, dl: -7, act: "smash", dur: 0.5 }, { kind: "barn", def: F.barnacles, x: 1150, dl: 6, act: "smash", dur: 0.5 }, { kind: "barn", def: F.barnacles, x: 1166, dl: -2, act: "smash", dur: 0.5 },
      { kind: "kettle", def: F.kettle, x: 1284, dl: 10, act: "smash", dur: 0.6 },
      { kind: "jumper", def: F.jumper, x: 1640, dl: -10, act: "collect", dur: 0.9, say: "No one has come back for it in a length of time I would prefer not to calculate." },
    ].map((t) => ({ ...t, gone: false, prog: 0, hot: 0, shake: 0 })),
    fishes: Array.from({ length: 26 }, (_, i) => { const x = 330 + (hash(i, 1) - 0.5) * 90, y = 62 + (hash(i, 2) - 0.5) * 40; return { x, y, hx: x, hy: y, vx: 0, vy: 0, ph: hash(i, 3) * 4 }; }),
    jellies: Array.from({ length: 6 }, (_, i) => ({ x: 420 + i * 150 + hash(i, 4) * 60, y: 110 + hash(i, 5) * 80, ph: hash(i, 6) * 8 })),
    turtle: { x: 60, y: 44 }, crab: { x: 668, dir: 1 }, octo: { hide: 0 }, angler: { x: 940, y: SB - 70 },
    dumbos: [{ x: 1470, y: SB - 84 }, { x: 1585, y: SB - 116 }, { x: 1662, y: SB - 66 }], pig: { x: 1500, dir: 1 },
    leg: RUN.leg, shipX: 40, deepest: 0, wallT: 0, wallN: 0, topT: 0,
  });
}
// fixed things with something to say: [x, lane offset from the cable, figure, line]
const WORDS = [
  [380, -16, F.helmet, "Valve closed. No diver reported missing from this depth. We checked twice."],
  [1560, -18, F.rov, "It was looking for us, then stopped. The camera still points where it last looked."],
];
// ---------- the seabed on the GPU (bitlight/gpu, by Orkan Celikhisar) ----------
// The floor world is one GLSL scene marched by the kernel's shader twin: relief, rocks, kelp, the
// cable and the marker poles, with real soft shadows that swing as the lamp moves. The cast is
// drawn over it by engine.js with the floor cells left clear. The two agree on one projection:
// an orthographic camera pitched 30° down, so one row down the floor is ZK cells of depth.
// Without WebGL2 gpu() returns null and engine.js draws its own flat floor instead.
const PITCH = 30, KP = cos((PITCH * PI) / 180);
const SEA_GLSL = /* glsl */ `
const float S = ${SZ}.0, HK = ${(1 / KP).toFixed(5)}, ZMAX = ${((FLOORH * ZK) / SZ + 0.3).toFixed(3)}, SPL = ${(SPLICE / SZ).toFixed(4)};
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float cz(float x) { return (38.0 + 11.0 * sin(x * S * 0.013)) * ${ZK}.0 / S; }          // the cable's depth at x
float relief(vec2 p) { return 0.022 * sin(p.x * 1.3 + sin(p.y * 1.1) * 1.4) + 0.012 * sin(p.y * 2.3 + p.x * 0.6); }   // gentle: steeper and every crest would earn a halo
uniform vec4 uSub, uMe;                                                              // where the cast is: xyz, and w = present
float sdCast(vec3 p) {
  float d = sdCapsule(p, uSub.xyz - vec3(0.6, 0.0, 0.0), uSub.xyz + vec3(0.6, 0.0, 0.0), 0.42);
  if (uMe.w > 0.5) d = min(d, sdCapsule(p, uMe.xyz - vec3(0.2, 0.0, 0.0), uMe.xyz + vec3(0.2, 0.0, 0.0), 0.2));
  return d;
}
bool clearOf(vec2 c) { return c.y > 0.35 && c.y < ZMAX && abs(c.y - cz(c.x)) > 1.35; }   // keep the cable's lane free for the cast
float sdCable(vec3 p) {
  float r = p.x < SPL ? 0.06 : 0.03, c = cz(p.x);
  float d = (length(vec2(p.y - r - relief(vec2(p.x, c)), p.z - c)) - r) * 0.8;
  return max(d, 0.32 - abs(p.x - SPL - 0.15));                                         // the break
}
float sdRocks(vec3 p) {
  vec2 g = vec2(2.3, 1.5), id0 = floor(p.xz / g - 0.5);
  float d = 1e3;
  for (int a = 0; a < 2; a++) for (int b = 0; b < 2; b++) {
    vec2 id = id0 + vec2(a, b); float h = h21(id);
    if (h < 0.42) continue;
    vec2 c = (id + 0.5 + (vec2(h21(id + 7.1), h21(id + 3.7)) - 0.5) * 0.55) * g;
    if (!clearOf(c)) continue;
    float r = 0.14 + 0.3 * h21(id + 1.3);
    vec3 q = (p - vec3(c.x, r * 0.4, c.y)) * vec3(1.0, 1.35, 1.0);
    d = min(d, (length(q) - r) * 0.72);
    d = smin(d, (length(p - vec3(c.x + r * 0.8, r * 0.3, c.y + r * 0.3)) - r * 0.6) * 0.9, 0.12);
  }
  return d;
}
float sdKelp(vec3 p) {
  vec2 g = vec2(3.7, 2.9), id0 = floor(p.xz / g - 0.5);
  float d = 1e3;
  for (int a = 0; a < 2; a++) for (int b = 0; b < 2; b++) {
    vec2 id = id0 + vec2(a, b); float h = h21(id + 19.0);
    if (h < 0.6) continue;
    vec2 c = (id + 0.5 + (vec2(h21(id + 2.2), h21(id + 9.4)) - 0.5) * 0.6) * g;
    if (!clearOf(c)) continue;
    vec3 a0 = vec3(c.x, 0.0, c.y);
    for (int k = 0; k < 4; k++) {
      float f = float(k + 1);
      vec3 b0 = vec3(c.x + sin(uTime * 0.6 + f * 0.5 + h * 6.0) * (0.03 + 0.05 * f), f * (0.26 + 0.2 * h) * HK, c.y + cos(uTime * 0.4 + f) * 0.03 * f);
      d = min(d, sdCapsule(p, a0, b0, 0.085 - 0.014 * f));
      a0 = b0;
    }
  }
  return d;
}
const vec3 BEACON = vec3(${BEACONS.map((b) => (b.x / SZ).toFixed(4)).join(", ")});
float sdBeacons(vec3 p, out float bulb) {
  float d = 1e3; bulb = 1e3;
  for (int i = 0; i < 3; i++) {
    float bx = BEACON[i];
    if (abs(p.x - bx) > 1.6) continue;
    vec3 o = vec3(bx, 0.0, cz(bx) - 16.0 * ${ZK}.0 / S);
    d = min(d, sdCapsule(p, o, o + vec3(0.0, 1.8 * HK, 0.0), 0.045));
    d = min(d, sdCapsule(p, o + vec3(0.0, 1.8 * HK, 0.0), o + vec3(0.42, 1.86 * HK, 0.0), 0.04));
    d = min(d, sdCylinder(p - o - vec3(0.0, 0.05, 0.0), 0.14, 0.05));
    d = min(d, (length((p - o - vec3(0.5, 1.84 * HK, 0.0)) * vec3(1.0, 2.2, 1.3)) - 0.17) * 0.45);
    float b = length(p - o - vec3(0.5, 1.74 * HK, 0.0)) - 0.07;
    if (i != 1) bulb = min(bulb, b);                                                   // the middle one is the red one: the cast layer draws it
    d = min(d, b);
  }
  return d;
}
float world(vec3 p) { float b; return min(min(sdCable(p), sdRocks(p)), min(sdKelp(p), sdBeacons(p, b))); }
float occ(vec3 p) { return min(world(p), sdCast(p)); }                                 // the cast only casts: engine.js draws it
float map(vec3 p) { return min(max((p.y - relief(p.xz)) * 0.9, -p.z), world(p)); }    // the floor stops at its far edge
void material(vec3 p, vec3 n, inout Mat m) {
  float bulb, db = sdBeacons(p, bulb);
  if (bulb < 0.012) { m.a = 0.9; m.e = 1.0; return; }
  if (db < 0.012) { m.a = 0.62; return; }
  if (sdCable(p) < 0.012) { m.a = p.x < SPL ? 0.88 : 0.5; return; }
  if (sdKelp(p) < 0.012) { m.a = 0.5; return; }
  if (sdRocks(p) < 0.012) { m.a = 0.4 + 0.12 * h21(floor(p.xz * 9.0)); return; }
  m.a = 0.34 + 0.14 * h21(floor(p.xz * S * 0.5)) + 0.07 * sin(p.z * 9.0 + sin(p.x * 1.1) * 2.2);   // sand, in ripples
}`;
function gpuView() {
  if (!GP.tried) {
    GP.tried = true;
    if (!qs.has("cpu")) { try { GP.view = gpu(gcv, { glsl: SEA_GLSL }); } catch (e) { console.warn(e); GP.view = null; } }
    gcv.width = 0; fit();                                                               // gpu() sized the buffer to the screen; put ours back
  }
  return GP.view;
}
function showG(on) { if (GP.shown !== on) { GP.shown = on; gcv.style.display = on ? "block" : "none"; } }
// a figure's place in the shader's world: its screen row, less its lane, is its height
const castAt = (o, up, on) => [o.x / SZ, (SB - (o.y + up - o.lane)) / (SZ * KP), (o.lane * ZK) / SZ, on];
function gpuDraw(view, lights) {
  const rgb = (c) => `rgb(${c.map((v) => Math.round(v / 4) * 4).join(",")})`, Ls = [];
  for (const l of lights) {
    if (l.red || Ls.length === 8) continue;                                            // the kernel has one ink ramp: red light stays with the cast layer
    const o = { p: [(l.x + cam.x) / SZ, (SB - (l.y + cam.y)) / (SZ * KP), l.z / SZ], power: l.p * 1.25, falloff: l.k * SZ * SZ };
    if (l.dir) o.spot = { dir: nrm([l.dir[0], -l.dir[1] / KP, l.dir[2]]), inner: l.c1, outer: l.c0 };
    Ls.push(o);
  }
  view.render({ yaw: 0, pitch: PITCH, half: COLS / (2 * SZ), target: [(cam.x + COLS / 2) / SZ, (SB - cam.y - ROWS / 2) / (SZ * KP), 0], cell: cellPx,
    uniforms: { uSub: castAt(D.sub, 0, 1), uMe: castAt(D.me, 0, D.mode === "eva" ? 1 : 0) },
    lights: Ls, ambient: 0.009, tones: env.tones, screen: env.screen, ink: { lit: rgb(env.lit), unlit: rgb(env.unlit) }, theme: "dark", haloLight: 0.085, time: now });
}
const ground = (x, ln) => T(x) + ln;                       // the screen row where lane ln meets the floor
const nrm = (v) => { const l = hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
scenes.dive = {
  enter({ x, y }) {
    diveReset();
    // the second dive starts further along, with everything you did on the first still done
    const sx = D.leg === 2 ? 1040 : 150;
    D.sub.x = sx; D.sub.lane = cl(sx); D.shipX = sx - 110;
    for (const b of D.branches) if (RUN.cutIds.includes(b.id)) b.cut = true;
    if (RUN.sleeve) D.things.find((t) => t.kind === "sleeve").gone = true;
    cam.x = clamp(sx - COLS / 2, 0, WW - COLS); cam.y = -90;
    if (x !== undefined) { D.sub.x = x; D.sub.y = y; D.sub.lane = cl(x); D.mode = "sub"; D.ctrl = true; D.splash = true; cam.x = clamp(x - COLS / 2, 0, WW - COLS); cam.y = clamp(y - ROWS * 0.45, -24, SB + FLOORH - ROWS); }
    else { document.body.classList.add("cine"); say(D.leg === 2 ? "Down again. You know the way. I'll hum something." : "Lowering away. I'll be on the line. I'm always on the line.", { id: "lower" + D.leg }); }
    if (seaGain) seaGain.gain.value = 0.05;
  },
  step(dt) {
    const s = D.sub, me = D.me;
    // --- the cutscene: the crane lowers you in
    if (D.mode === "lower") {
      s.y = lerp(-64, D.leg === 2 ? 190 : 30, sstep(1.5, D.leg === 2 ? 10.5 : 8, sceneT)); s.prop += dt * 2;
      if (!D.splash && s.y > -8) { D.splash = true; knock(60, 0.7, 0.6); for (let i = 0; i < 40; i++) D.debris.push({ x: s.x + (Math.random() - 0.5) * 60, y: 0, vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 70, life: 1.2 }); }
      if (sceneT > (D.leg === 2 ? 11 : 9)) { D.mode = "sub"; D.ctrl = true; document.body.classList.remove("cine"); say(D.leg === 2 ? "There. Further along now. Past the red marker." : "There. All yours. Keys to move. The lamp follows your hand.", { id: "yours" + D.leg }); }
    }
    // --- the submarine
    if (D.mode === "sub" && D.ctrl) {
      s.vx += (ax() * 62 - s.vx) * min(1, 2.2 * dt); s.vy += (ay() * 46 - s.vy) * min(1, 2.2 * dt);
      s.x = clamp(s.x + s.vx * dt, 40, D.leg === 1 ? WALL : WW - 40); s.lane += (cl(s.x) - 4 - s.lane) * min(1, 2 * dt);
      s.y = clamp(s.y + s.vy * dt, 16, ground(s.x, s.lane) - 26);
      if (abs(s.vx) > 8) s.face = Math.sign(s.vx);
      s.prop += dt * (3 + abs(s.vx) * 0.25);
      if (Math.random() < dt * (2 + abs(s.vx) * 0.2)) D.bubbles.push({ x: s.x - s.face * 30, y: s.y, vy: -14 - Math.random() * 10, life: 2.5 });
    }
    const who = D.mode === "eva" ? me : s;
    // --- hands and targets (worked out before moving, so the diver can drift to a target's lane)
    let target = null, td = 24;
    const alt = ground(who.x, who.lane) - who.y;
    for (const t of D.things) { t.hot = max(0, t.hot - dt * 3); t.shake = max(0, t.shake - dt * 4); if (t.gone) continue; const d = abs(who.x - t.x); if (d < td && alt < 44) { td = d; target = t; } }
    for (const b of D.branches) {
      b.near = false; if (b.cut) continue;
      const mid = (b.x0 + b.x1) / 2, d = abs(who.x - mid);
      if (who.x > b.x0 - 12 && who.x < b.x1 + 12 && alt < 60) { b.near = true; say("Please don't cut that. It's perfectly healthy.", { id: "notcut1" }); }
      if (!(target && target.kind) && d < 26 && alt < 44) { td = d; target = b; }
    }
    // --- on foot, on the hose
    if (D.mode === "eva") {
      me.vx += (ax() * 44 - me.vx) * min(1, 3 * dt); me.vy += (ay() * 38 - me.vy) * min(1, 3 * dt);
      me.x = min(me.x + me.vx * dt, D.leg === 1 ? WALL + 10 : WW - 20); me.y += me.vy * dt;
      const wantLane = target ? (target.kind ? cl(target.x) + target.dl + 5 : bl(target, (target.x0 + target.x1) / 2) + 5) : cl(me.x) + 6;
      me.lane += (wantLane - me.lane) * min(1, 2.5 * dt);
      me.y = clamp(me.y, 20, ground(me.x, me.lane) - 9);
      const hx = me.x - s.x, hy = me.y - (s.y + 10), hl = hypot(hx, hy);
      if (hl > 170) { me.x = s.x + (hx / hl) * 170; me.y = s.y + 10 + (hy / hl) * 170; if (!D.hoseSaid) { D.hoseSaid = 1; say("That's all the hose there is. I did ask for more hose.", { id: "hose", urgent: true }); } }
      if (abs(me.vx) > 5) me.face = Math.sign(me.vx);
      me.sw += dt * (0.6 + hypot(me.vx, me.vy) * 0.035);
      if (Math.random() < dt * 1.5) D.bubbles.push({ x: me.x + me.face * 8, y: me.y - 6, vy: -16 - Math.random() * 8, life: 2 });
    }
    // --- the lamp: it points at the pointer, and the pointer can be a spot on the floor
    {
      const lpx = who.x + who.face * (who === s ? 24 : 9), lpy = who.y + (who === s ? 7 : -4) - who.lane, lpz = who.lane * ZK + 4;
      let tgt;
      if (now - ptr.moved < 6) {
        const wx = cam.x + ptr.x, wy = cam.y + ptr.y, top = T(wx);
        tgt = wy >= top ? [wx, top, (wy - top) * ZK] : [wx, wy - who.lane, lpz];
      } else tgt = [lpx + who.face * 60, lpy + 46, lpz];
      const want = nrm([tgt[0] - lpx, tgt[1] - lpy, tgt[2] - lpz]), dr = who.dir, k = min(1, 7 * dt);
      who.dir = nrm([dr[0] + (want[0] - dr[0]) * k, dr[1] + (want[1] - dr[1]) * k, dr[2] + (want[2] - dr[2]) * k]);
      if (D.mode === "sub" && D.ctrl && now - ptr.moved < 6 && abs(who.dir[0]) > 0.25 && abs(s.vx) < 8) s.face = Math.sign(who.dir[0]);
    }
    // camera
    cam.x += (clamp(who.x - COLS / 2 + who.face * 18, 0, WW - COLS) - cam.x) * min(1, 3 * dt);
    cam.y += (clamp(who.y - ROWS * 0.45, D.mode === "lower" ? -90 : -24, SB + FLOORH - ROWS) - cam.y) * min(1, 3 * dt);
    // --- creatures
    const d2 = hypot(who.dir[0], who.dir[1]) || 1, ux = who.dir[0] / d2, uy = who.dir[1] / d2;
    const LX = who.x + ux * 22, LY = who.y + uy * 22;
    const lit = (x, y, r = 90) => { const dx = x - who.x, dy = y - who.y, d = hypot(dx, dy) || 1; return d < r && (dx / d) * ux + (dy / d) * uy > 0.7; };
    for (const f of D.fishes) {
      const dx = f.x - LX, dy = f.y - LY, d = hypot(dx, dy) || 1;
      if (d < 46) { f.vx += (dx / d) * 300 * dt; f.vy += (dy / d) * 300 * dt; }
      f.vx += (f.hx + sin(now * 0.5 + f.ph) * 14 - f.x) * 0.8 * dt; f.vy += (f.hy + cos(now * 0.4 + f.ph) * 6 - f.y) * 0.8 * dt;
      f.vx *= 0.95; f.vy *= 0.95; f.x += f.vx * dt; f.y += f.vy * dt;
    }
    for (const j of D.jellies) { j.y += sin(now * 0.8 + j.ph) * 3 * dt; j.x += sin(now * 0.2 + j.ph) * 2 * dt; }
    D.dumbos.forEach((o, i) => { o.y += sin(now * 0.9 + i * 2) * 5 * dt; o.x += cos(now * 0.3 + i) * 3 * dt; });
    D.pig.x += D.pig.dir * 3 * dt; if (D.pig.x > 1540) D.pig.dir = -1; if (D.pig.x < 1480) D.pig.dir = 1;
    D.turtle.x += 11 * dt; if (D.turtle.x > 700) D.turtle.x = -60;
    D.octo.hide = lit(520, ground(520, cl(520) - 14) - 12) ? 1 : 0;
    const c = D.crab;
    if (abs(who.x - c.x) < 44 && alt < 70) { c.dir = Math.sign(c.x - who.x) || 1; c.x = clamp(c.x + c.dir * 30 * dt, 590, 750); } else c.x += sin(now * 0.9) * 4 * dt;
    const a = D.angler; a.x += (clamp(LX, 880, 1000) - a.x) * 0.25 * dt; a.y += (clamp(LY, SB - 100, SB - 40) - a.y) * 0.25 * dt;
    for (const b of D.bubbles) { b.y += b.vy * dt; b.x += sin(now * 3 + b.vy) * 4 * dt; b.life -= dt; }
    D.bubbles = D.bubbles.filter((b) => b.life > 0 && b.y > 0);
    for (const p of D.debris) { p.life -= dt; p.vy += 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    D.debris = D.debris.filter((p) => p.life > 0);
    if (!D.ctrl) return;
    // --- the shape of the day: one thing up, then back down for the rest
    D.deepest = max(D.deepest, s.y);
    if (D.leg === 1) {
      if (who.x >= WALL - 1 && ax() > 0) { D.wallT += dt; if (D.wallT > 1.2 && D.wallN < 3) { say(["Not today. That's tomorrow's water.", "The hose, the light, my nerves. Come up first.", "I can do this all day. I am, in fact, doing this all day."][D.wallN], { id: "wall" + D.wallN, urgent: true }); D.wallN++; D.wallT = -6; } }
      if (D.mode === "sub" && s.y < 40) {
        if (RUN.sleeve) { RUN.cuts.push(...D.cuts); for (const b of D.branches) if (b.cut && !RUN.cutIds.includes(b.id)) RUN.cutIds.push(b.id); RUN.salvage += D.salvage; RUN.leg = 2; knock(60, 0.6, 0.5); go("deck"); return; }
        if (D.deepest > 150) say("Back so soon? There's nothing in your hands.", { id: "empty" });
        D.topT += dt; if (D.topT > 18) say("You're allowed to go down. It's rather the point.", { id: "godown" });
      }
    }
    if (s.x < 62 && D.mode === "sub") say("That's Portugal. Eventually.", { id: "portugal" });
    // --- doing things
    let pr = null;
    const nearFloor = ground(s.x, s.lane) - s.y < 120;
    if (D.mode === "sub") {
      if (nearFloor) pr = "<kbd>E</kbd>get out";
      if (actHit() && nearFloor) { D.mode = "eva"; me.x = s.x - s.face * 6; me.y = s.y + 24; me.lane = s.lane + 4; me.vx = me.vy = 0; me.face = s.face; me.dir = s.dir.slice(); knock(200, 0.3, 0.25); say("Out you go. Mind the hose. It's the only one we have.", { id: "out" }); }
      else if (actHit()) say("Not here. It's a long way down to stand on nothing.", { id: "nothere" + floor(now / 10), urgent: true });
    } else if (D.mode === "eva") {
      const ds = hypot(me.x - s.x, me.y - (s.y + 12));
      if (target) {
        target.hot = 1;
        pr = `<kbd>hold space</kbd>${target.id ? "cut" : target.act === "collect" ? "take" : "smash"}`;
        if (!toolDown()) D.latch = false;
        if (toolDown() && !D.latch) {
          target.prog += dt; target.shake = 1;
          if (Math.random() < dt * 12) knock(target.act === "collect" ? 520 : 90 + Math.random() * 40, 0.06, 0.16);
          if (target.id) say("Put the cutter down, if you would. I can hear it working.", { id: "notcut2", urgent: true });
          if (target.prog >= target.dur) { finish(target); D.latch = true; }
        } else target.prog = max(0, target.prog - dt * 2);
      } else if (ds < 30) { pr = "<kbd>E</kbd>back in"; if (actHit()) { D.mode = "sub"; knock(160, 0.3, 0.25); } }
    }
    prompt(pr);
    // --- the voice
    if (alt < 70) say("Good. Follow the thin grey line. The one that isn't moving.", { id: "obed1" });
    if (alt < 30 && who.x > 420) say("That's the cable. Hold it gently. It's had a long day.", { id: "obed4" });
    const near = (x, y, r = 46) => hypot(who.x - x, who.y - y) < r, nearX = (x, r = 40) => abs(who.x - x) < r && alt < 70;
    if (near(D.turtle.x, D.turtle.y, 60)) say("Turtle. She's older than the cable, and less trouble.", { id: "turtle" });
    if (near(330, 62, 60)) say("They turn together because nobody has offered them another method.", { id: "fish" });
    if (D.jellies.some((j) => near(j.x, j.y, 40))) say("Don't mind them. They've no idea you're here. I envy that, some days.", { id: "jelly" });
    if (nearX(520, 50)) say("It can see you. It's deciding what you are. So am I, a little.", { id: "octo" });
    if (nearX(c.x)) say("A crab. He has opinions about the cable. Mostly pinches.", { id: "crab" });
    if (near(a.x, a.y, 60)) say("It has learned that whatever approaches the light is usually what it eats.", { id: "angler" });
    if (D.dumbos.some((o) => near(o.x, o.y, 44))) say("Those are the ones with the ears. They don't hear with them. I've asked.", { id: "dumbo" });
    if (nearX(D.pig.x, 34)) say("A sea pig. It eats mud and it is content. Don't tell it about us.", { id: "pig" });
    if (nearX(640, 30)) say("Route markers. Somebody lit the way down here, once, and never came back to switch it off.", { id: "beacon" });
    if (nearX(1010, 30)) say("The red one means it is working. It is the only thing down here asking to be taken seriously.", { id: "redb" });
    for (const [x, , , line] of WORDS) if (nearX(x)) say(line, { id: "w" + x });
    for (const t of D.things) if (!t.gone && t.say && nearX(t.x, 34)) say(t.say, { id: "t" + t.kind });
    if (alt > 90 && who.y > SB - 150 && who.x < SPLICE) { D.far += dt; if (D.far > 9 && D.disob < 3) { say(["Ah. You've drifted off the line. No harm done.", "It's all right. The cable is patient, but likes to be found.", "You're a long way off now. I'm not cross, just quiet."][D.disob], { id: "dis" + D.disob, urgent: true }); D.disob++; D.far = -12; } } else if (D.far > 0) D.far = 0;
    if (!D.ended && nearX(SPLICE, 40)) {
      D.ended = true;
      ["Oh. Turn your lamp down a little. Can you feel that?", "That isn't the sea. It's current, still moving after all this time.", "An old telegraph line, laid in 1858. Still faintly warm.", "I was its last operator. Somebody had to keep it lit."].forEach((l, i) => say(l, { id: "final" + i, gap: 2 }));
    }
    if (D.ended && band.done.has("final3")) go("end", { salvage: RUN.salvage + D.salvage, cuts: RUN.cuts.concat(D.cuts) });
    if (floor(now / 6) !== floor((now - dt) / 6) && who.y > 60) ping();
    if (lp) lp.frequency.value = lerp(1400, 180, clamp(who.y / SB, 0, 1));
  },
  draw() {
    const t = now, s = D.sub, me = D.me, who = D.mode === "eva" ? me : s;
    // with the GPU floor under us, both layers must sit on the same whole cell
    const cx0 = cam.x, cy0 = cam.y, G = SB - cy0 < ROWS + 30 ? gpuView() : null;
    if (G) { cam.x = Math.round(cx0); cam.y = Math.round(cy0); }
    showG(!!G); env.holes = !!G;
    const dy = max(0, who.y), q = clamp(dy / SB, 0, 1), dead = who.x > SPLICE - 240 && dy > 200;
    const mix = (A, B, k) => A.map((v, i) => lerp(v, B[i], k));
    // one screen, one palette: teal. Fewer inks the deeper you are, and almost nothing lit but your lamp.
    env.screen = dead ? "noise" : "bayer"; env.tones = dead ? 3 : dy < 70 ? 8 : dy < 170 ? 6 : 5;
    env.lit = mix([226, 245, 236], [206, 236, 230], q); env.unlit = mix([11, 46, 54], [4, 19, 24], sstep(0, 0.6, q));
    env.sun = { d: [0, -0.96, 0.28], p: 0.1 + 0.1 * (1 - q) };        // a little light from above: only the tops of things catch it
    env.outline = "light"; env.haloMin = 0.085; env.cut = 0.035 * sstep(20, 110, dy); env.fog = 0.05; env.haze = 0.012;
    const wb = (wy) => (wy < 0 ? 0.74 - 0.12 * clamp(-wy / 80, 0, 1) : 0.46 * Math.exp(-wy / 58));
    const rows = (env.ambRow ||= new Float32Array(ROWS));
    for (let j = 0; j < ROWS; j++) rows[j] = wb(j + cam.y) * 0.95 + 0.012;
    env.amb = 1;
    env.bg = (i, j) => { const wy = j + cam.y; return wy < 0 ? wb(wy) : wy < 1.5 ? 0.95 : wb(wy); };
    const L = [];
    const lampOf = (o, off, up, p, c0, beam) => {
      // on screen, a step in depth is a step down the floor: fold dir.z into the beam's screen direction
      const sx = o.dir[0], sy = o.dir[1] + o.dir[2] / ZK, b = hypot(sx, sy) || 1;
      L.push({ x: o.x + o.face * off - cam.x, y: o.y + up - o.lane - cam.y, sy: o.y + up - cam.y, z: o.lane * ZK + 4, p, k: 0.0011, dir: o.dir, c0, c1: c0 + 0.13, beam, bx: sx / b, by: sy / b });
    };
    if (D.mode !== "lower") lampOf(s, 24, 7, D.mode === "eva" ? 2.4 : 3.6, 0.8, 0.07);
    if (D.mode === "eva") { lampOf(me, 9, -4, 2.8, 0.76, 0.06); L.push({ x: me.x - cam.x, y: me.y - me.lane - cam.y, z: me.lane * ZK + 16, p: 0.7, k: 0.006 }); }
    L.push({ x: s.x - cam.x, y: s.y - s.lane - cam.y, z: s.lane * ZK + 18, p: 0.9, k: 0.005 });
    for (const b of BEACONS) {
      if (abs(b.x - (cam.x + COLS / 2)) > COLS) continue;
      const ln = cl(b.x) - 16, on = b.flick ? (sin(t * 23) + sin(t * 7.3) > -0.6 ? 1 : 0.15) : 1;
      L.push({ x: b.x + 11 - cam.x, y: T(b.x) - 1.56 * SZ - cam.y, z: ln * ZK, p: 2.3 * on, k: 0.0013, dir: nrm([0.1, 1, 0.25]), c0: 0.42, c1: 0.8, red: b.red });
    }
    { const pu = 0.5 + 0.5 * sin(t * 2.4); L.push({ x: SPLICE - cam.x, y: T(SPLICE) - 6 - cam.y, z: cl(SPLICE) * ZK + 6, p: 0.5 + 0.9 * pu, k: 0.004, red: 1 }); }
    env.lights = L.filter((l) => l.x > -200 && l.x < COLS + 200);

    E.clear();
    // far: snow, then a distant ridge with the lights of other repeaters, then rock
    layer(0.3, -160);
    for (let n = 0; n < 110; n++) { const u = hash(n, 11) * COLS, v = hash(n, 12) * ROWS; dot(((u - E.lx()) % COLS + COLS) % COLS + E.lx(), ((v - E.ly() + t * 1.5) % ROWS + ROWS) % ROWS + E.ly(), 0, { e: 0.14 }); }
    layer(0.5, -120);
    fillBelow(ridgeFar, 0.2, 0.08);
    for (let x = floor(E.lx() / 38) * 38; x < E.lx() + COLS + 40; x += 38) { const h = hash(x, 21); if (h > 0.5) disc(x, ridgeFar(x) - 3, 1, 0, { e: sin(t * (1 + h * 2) + h * 9) > -0.2 ? 0.6 : 0.08, red: h > 0.9, z: 1 }); }
    layer(0.75, -70);
    for (let x = floor(E.lx() / 70) * 70; x < E.lx() + COLS + 80; x += 70) { const h = hash(x, 31); draw(F.rock, { s: floor(h * 5) }, x + h * 30, 262 + 6 * sin(x * 0.03), { size: 30 + h * 22 }); }
    // the play plane
    layer(1, 0);
    E.floorBand(T, dead ? 0.3 : 0.4, 0.16);
    if (cam.y < 40) { // the ship, seen from underneath, and its crane
      const ox = D.shipX - 40;
      rect(40 + ox, -38, 150, 34, 0.3, { z: 60 }); rect(40 + ox, -5, 140, 7, 0.24, { z: 60 }); rect(40 + ox, -74, 150, 2, 0.8, { z: 61 });
      seg(96 + ox, -110, 152 + ox, -128, 4, 0.5, { z: 62 }); rect(96 + ox, -96, 3, 24, 0.5, { z: 62 });
      if (D.mode === "lower") seg(152 + ox, -128, s.x - 4, s.y - 12, 1, 0.6, { z: 62, flat: 1 });
    }
    const X0 = floor(cam.x / 6) * 6;
    // the cable, wandering nearer and further across the floor; past the splice, the old one
    if (!G) for (let x = max(0, X0 - 6); x < min(SPLICE - 4, cam.x + COLS + 6); x += 6) { E.lane((cl(x) + cl(x + 6)) / 2); seg(x, T(x) + cl(x) - 2, x + 6.5, T(x + 6) + cl(x + 6) - 2, 3, 0.86); }
    if (!G) for (let x = max(SPLICE + 10, X0); x < cam.x + COLS + 6; x += 6) { E.lane(cl(x)); seg(x, T(x) + cl(x) - 1, x + 6.5, T(x + 6) + cl(x + 6) - 1, 1.6, 0.45); }
    for (const b of D.branches) {
      const mid = (b.x0 + b.x1) / 2, hot = b.near && !b.cut ? 0.2 * (0.6 + 0.4 * sin(t * 12)) : 0;
      for (let x = b.x0; x < b.x1; x += 5) {
        if (!E.onScreen(x, 10) || (b.cut && abs(x - mid) < 12)) continue;
        const sh = b.prog > 0 && !b.cut ? (Math.random() - 0.5) * 1.5 : 0, l0 = bl(b, x), l1 = bl(b, x + 5);
        E.lane((l0 + l1) / 2); seg(x, T(x) + l0 - 2 + sh, x + 5.5, T(x + 5) + l1 - 2 + sh, 2.6, 0.8, { e: hot });
      }
    }
    // dressing, scattered over the whole floor
    if (!G) for (let x = floor(cam.x / 46) * 46 - 46; x < cam.x + COLS + 46; x += 46) {
      const h = hash(x, 61), ln = 4 + hash(x, 62) * 68, px_ = x + h * 40;
      E.lane(ln);
      if (h < 0.3) draw(F.starfish, {}, px_, ground(px_, ln), { size: SZ });
      else if (h < 0.75) draw(F.rock, { s: floor(h * 9) }, px_, ground(px_, ln) + 2, { size: 12 + h * 16 });
      else { let qx = px_, qy = ground(px_, ln); for (let g = 0; g < 5; g++) { const nx = px_ + sin(t * 0.7 + g * 0.6 + h * 9) * (1 + g), ny = ground(px_, ln) - (g + 1) * (5 + h * 4); seg(qx, qy, nx, ny, 3.4 - g * 0.5, 0.5); qx = nx; qy = ny; } }
    }
    for (const b of BEACONS) {
      const ln = cl(b.x) - 16; E.lane(ln);
      if (!G) draw(F.beacon, { red: b.red, on: 1 }, b.x, ground(b.x, ln), { size: SZ });
      else if (b.red) disc(b.x + 11, ground(b.x, ln) - 1.74 * SZ, 2, 0.9, { e: 1, red: 1, z: 2 });        // the one red bulb, on the GPU's pole
    }
    for (const [x, dl, def] of WORDS) { E.lane(cl(x) + dl); draw(def, {}, x, ground(x, cl(x) + dl), { size: SZ }); }
    { const ln = cl(520) - 14; E.lane(ln); draw(F.rock, { s: 3 }, 520, ground(520, ln) + 3, { size: 26, z: -6 }); draw(F.octo, { f: floor(t * 6) % 8, hide: D.octo.hide }, 522, ground(520, ln) - 12, { size: SZ, z: 2 }); }
    { const ln = cl(D.crab.x) + 16; E.lane(ln); draw(F.crab, { f: floor(t * 8) % 4 }, D.crab.x, ground(D.crab.x, ln), { size: SZ }); }
    for (const th of D.things) {
      if (th.gone) continue;
      const ln = cl(th.x) + th.dl, sx = th.shake ? (Math.random() - 0.5) * 1.8 : 0;
      E.lane(ln); draw(th.def, th.kind === "pod" ? { on: sin(t * 3) > 0 ? 1 : 0 } : {}, th.x + sx, ground(th.x, ln) - (th.up || 0), { size: SZ, z: 1, glow: 0.16 * th.hot * (0.6 + 0.4 * sin(t * 14)) });
    }
    // the splice: the only warm thing down here
    { const ln = cl(SPLICE), y = ground(SPLICE, ln), pu = 0.5 + 0.5 * sin(t * 2.4); E.lane(ln); disc(SPLICE, y - 5, 6.5, 0.3, { e: 0.25 + 0.6 * pu, red: 1, round: 1 }); seg(SPLICE - 12, y - 3, SPLICE - 4, y - 4, 3.6, 0.5); }
    { const ln = cl(D.pig.x) + 15; E.lane(ln); draw(F.seapig, { f: floor(t * 5) % 6 }, D.pig.x, ground(D.pig.x, ln), { size: SZ, flip: D.pig.dir < 0 }); }
    // mid-water company
    E.lane(0);
    D.dumbos.forEach((o, i) => draw(F.dumbo, { f: floor(t * 6 + i * 3) % 8 }, o.x, o.y, { size: 24, z: 24 + i * 10, flip: who.x < o.x, glow: 0.16 }));
    draw(F.angler, { f: floor(t * 5) % 6 }, D.angler.x, D.angler.y, { size: 26, z: 30, flip: who.x < D.angler.x });
    draw(F.turtle, { f: floor(t * 5) % 8 }, D.turtle.x, D.turtle.y + sin(t) * 3, { size: 26, z: 40 });
    D.jellies.forEach((j, i) => draw(F.jelly, { f: floor(t * 6 + j.ph) % 8 }, j.x, j.y, { size: 20, z: 20 + i * 14 }));
    for (const f of D.fishes) draw(F.fish, { f: floor(t * 8 + f.ph) % 4 }, f.x, f.y, { size: 18, z: 60 + f.ph * 6, flip: f.vx < 0 });
    for (const b of D.bubbles) { dot(b.x, b.y, 0, { e: 0.5, z: 90 }); dot(b.x + 1, b.y, 0, { e: 0.3, z: 90 }); }
    for (const p of D.debris) dot(p.x, p.y, 0, { e: 0.6, z: 90 });
    // you
    if (D.mode === "eva") {
      const ax_ = s.x, ay_ = s.y + 10, bx = me.x - me.face * 6, by = me.y - 4, sag = 10 + hypot(bx - ax_, by - ay_) * 0.12;
      let px0 = ax_, py0 = ay_;
      for (let i = 1; i <= 12; i++) { const u = i / 12, x = lerp(ax_, bx, u), y = lerp(ay_, by, u) + sin(u * PI) * sag; E.lane(lerp(s.lane, me.lane, u)); seg(px0, py0, x, y, 1.8, 0.72); px0 = x; py0 = y; }
      E.lane(me.lane); draw(F.swimmer, { f: floor(me.sw * 8) % 8 }, me.x, me.y, { size: SZ, z: 2, flip: me.face < 0 });
    }
    E.lane(D.mode === "lower" ? 0 : s.lane);
    draw(F.sub, { f: floor(s.prop) % 4, lit: D.mode === "lower" ? 0 : 1 }, s.x, s.y + 0.75 * SZ, { size: SZ, z: D.mode === "lower" ? 70 : 0, flip: s.face < 0 });
    // near: kelp and boulders in front of the lamp, out-of-focus snow
    layer(1.35, 260);
    for (let x = floor(E.lx() / 130) * 130; x < E.lx() + COLS + 130; x += 130) {
      const h = hash(x, 41);
      if (h < 0.55) { const ht = 60 + hash(x, 42) * 70, bx = x + h * 50; let qx = bx, qy = 470; for (let g = 0; g < 7; g++) { const nx = bx + sin(t * 0.6 + g * 0.5 + h * 6) * (2 + g * 1.6), ny = 470 - (ht / 7) * (g + 1); seg(qx, qy, nx, ny, 6 - g * 0.6, 0.3); qx = nx; qy = ny; } }
      else disc(x + h * 40, 480, 14 + hash(x, 43) * 10, 0.28, { round: 1 });
    }
    layer(1.7, 240);
    for (let n = 0; n < 26; n++) { const u = hash(n, 51) * COLS, v = hash(n, 52) * ROWS, sp = 4 + hash(n, 53) * 6; const x = ((u - E.lx()) % COLS + COLS) % COLS + E.lx(), y = ((v - E.ly() + t * sp) % ROWS + ROWS) % ROWS + E.ly(); dot(x, y, 0, { e: 0.26 }); dot(x + 1, y, 0, { e: 0.2 }); }
    if (G) gpuDraw(G, env.lights);
    cam.x = cx0; cam.y = cy0;
  },
};
function finish(t) {
  if (t.id) {
    t.cut = true; D.quiet++; D.cuts.push(t.who);
    say(t.line, { id: "cut" + t.id, who: t.who, urgent: true, gap: 0.4, red: true });
    knock(70, 0.5, 0.6);
    const x = (t.x0 + t.x1) / 2, y = ground(x, bl(t, x));
    for (let i = 0; i < 16; i++) D.debris.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 30, life: 0.9 });
    return;
  }
  t.gone = true;
  if (t.act === "collect") {
    D.salvage++; tone(660, 0.25, 0.2, "triangle", 990);
    if (t.kind === "sleeve") { RUN.sleeve = true; say("That'll do for one dive. Come up, and bring it with you.", { id: "comeup", urgent: true }); }
  }
  else {
    D.smashN++; knock(60, 0.4, 0.6);
    if (t.kind === "kettle") say("Good. Now perhaps leave the rusty kettle alone. Ah.", { id: "kettle", urgent: true });
    else if (D.smashN <= SMASH.length) say(SMASH[D.smashN - 1], { id: "smash" + D.smashN, urgent: true, gap: 0.8 });
  }
  const gy = ground(t.x, cl(t.x) + t.dl);
  for (let i = 0; i < 14; i++) D.debris.push({ x: t.x, y: gy - 5, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40, life: 0.8 });
}

// =====================================================================================
// END
// =====================================================================================
scenes.end = {
  enter({ salvage = 0, cuts = [] }) {
    cam.x = 0; cam.y = 0;
    // the bill: what you brought up, and what you switched off on the way
    const quiet = cuts.length ? "gone quiet\n" + cuts.map((c) => "<small>" + c + "</small>").join("\n") : "nothing went quiet. he noticed.";
    card(`<b>SLACK</b>one day, two dives\n\nbrought up ${salvage} of 2\n${quiet}\n\nR · dive again`, 9999);
  },
  step() { if (hit.has("KeyR")) location.reload(); },
  draw() {
    const t = now;
    env.holes = false; env.tones = 2; env.screen = "noise"; env.lit = [216, 210, 196]; env.unlit = [4, 4, 4]; env.amb = 0; env.ambRow = null; env.sun = null; env.lights = []; env.outline = null; env.cut = 0.03; env.fog = 0; env.bg = () => 0;
    E.clear(); layer(1, 0);
    for (let n = 0; n < 120; n++) dot(hash(n, 11) * COLS, (hash(n, 12) * ROWS + t * (1 + hash(n, 13) * 3)) % ROWS, 0, { e: 0.25 });
    for (let x = 0; x < COLS; x += 6) seg(x, 198 + sin(x * 0.02) * 4, x + 6.5, 198 + sin((x + 6) * 0.02) * 4, 1.6, 0, { e: 0.3 });
    disc(COLS / 2, 196, 5 + sin(t * 2) * 1.2, 0, { e: 0.6 + 0.4 * sin(t * 2), red: 1 });
  },
};

// =====================================================================================
// TITLE — the line on the seabed, before anyone goes looking
// =====================================================================================
scenes.title = {
  enter() { cam.x = 0; cam.y = 0; },
  step() {},
  draw() {
    const t = now, sx = 250 + sin(t * 0.25) * 30, sy = 96 + sin(t * 0.6) * 5, CY = (x) => 186 + sin(x * 0.02) * 4;
    env.holes = false; env.tones = 6; env.screen = "bayer"; env.lit = [206, 236, 230]; env.unlit = [4, 19, 24]; env.amb = 1; env.sun = { d: [0, -0.96, 0.28], p: 0.1 };
    const rows = (env.ambRow ||= new Float32Array(ROWS)); for (let j = 0; j < ROWS; j++) rows[j] = 0.3 * Math.exp(-j / 40) + 0.012;
    env.outline = "light"; env.haloMin = 0.085; env.cut = 0.02; env.fog = 0; env.bg = (i, j) => 0.3 * Math.exp(-j / 40);
    env.lights = [{ x: sx + 24, y: sy + 7, z: 20, p: 3.2, k: 0.0014, dir: nrm([0.62, 0.74, 0.25]), c0: 0.8, c1: 0.93, beam: 0.07, bx: 0.64, by: 0.77 }, { x: sx, y: sy, z: 30, p: 0.9, k: 0.005 },
      { x: 300, y: CY(300) - 4, z: 8, p: 0.4 + 0.8 * (0.5 + 0.5 * sin(t * 2.4)), k: 0.004, red: 1 }];
    E.clear(); layer(1, 0);
    for (let n = 0; n < 120; n++) dot(hash(n, 11) * COLS, (hash(n, 12) * ROWS + t * (1 + hash(n, 13) * 3)) % ROWS, 0, { e: 0.2 });
    fillBelow((x) => CY(x) + 6, 0.36, 0.16, { z: -20 });
    for (let x = 0; x < 296; x += 6) seg(x, CY(x), x + 6.5, CY(x + 6), 3, 0.86, { z: -6 });
    for (let x = 312; x < COLS; x += 6) seg(x, CY(x) + 1, x + 6.5, CY(x + 6) + 1, 1.6, 0.45, { z: -6 });
    disc(302, CY(302) - 2, 5, 0.3, { e: 0.3 + 0.6 * (0.5 + 0.5 * sin(t * 2.4)), red: 1, round: 1 });
    draw(F.sub, { f: floor(t * 5) % 4, lit: 1 }, sx, sy + 16, { size: 22, z: 6 });
    draw(F.jelly, { f: floor(t * 6) % 8 }, 70, 70 + sin(t * 0.8) * 4, { size: 20, z: -14 });
    draw(F.starfish, {}, 120, CY(120) + 8, { size: 20, z: -8 }); draw(F.rock, { s: 2 }, 40, CY(40) + 10, { size: 26, z: -10 });
  },
};

// ---------- loop ----------
const env = { tones: 8, screen: "bayer", lit: [255, 255, 255], unlit: [0, 0, 0], amb: 0.3, bg: () => 0, lights: [] };
let last = 0, started = false;
function hud() {
  const g = $("#gauge");
  if (scene === scenes.dive) {
    const who = D.mode === "eva" ? D.me : D.sub, m = max(0, Math.round(who.y * M_PER)), bottom = Math.round((SB + 30) * M_PER);
    $("#hud").innerHTML = `<b>${D.mode === "eva" ? "on the hose" : "submarine"}</b> · ${env.tones} inks${GP.shown ? " · gpu floor" : ""}`;
    $("#salv").textContent = `${RUN.sleeve && D.leg === 1 ? "bring it up ↑ · " : ""}salvage ${RUN.salvage + D.salvage}/2 · gone quiet ${RUN.cuts.length + D.quiet}`;
    g.classList.add("on");
    g.querySelector("i").style.top = clamp(m / bottom, 0, 1) * 100 + "%";
    g.querySelector("i").dataset.m = m.toLocaleString("en") + " m";
    if (floor(now * 2) !== floor(now * 2 - 0.04)) document.title = "SLACK · " + m + " m";
  } else { g.classList.remove("on"); $("#hud").innerHTML = scene === scenes.deck ? "<b>cable ship patience</b> · deck" : scene === scenes.room ? "<b>cable ship patience</b> · radio room" : ""; $("#salv").textContent = ""; }
}
function tick(dt) {
  if (started && scene) {
    now += dt; sceneT += dt;
    if (!pending) scene.step(dt);
    pump();
    if (fade !== fadeTo) { fade = fadeTo > fade ? min(fadeTo, fade + dt * 2.2) : max(fadeTo, fade - dt * 1.6); $("#fade").style.opacity = fade; }
    if (pending && fade >= 1) { const p = pending; pending = null; enter(p.name, p.arg); fadeTo = 0; }
    if (cardT && now > cardT) { $("#card").classList.remove("on"); cardT = 0; }
    scene.draw(); E.render(env, px); ctx.putImageData(img, 0, 0); hud();
  }
  hit.clear();
}
function frame(ts) {
  const dt = min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  if (!window.__hold) tick(dt);
  requestAnimationFrame(frame);
}
// debug: step the game by hand. __slack.run(seconds, [held key codes], [pressed once])
window.__slack = { D, RUN, you, room, deck, go, keys, hit, ptr, run(sec, held = [], press = []) {
  window.__hold = true; held.forEach((k) => keys.add(k)); press.forEach((k) => hit.add(k));
  for (let t = 0; t < sec; t += 1 / 30) tick(1 / 30);
  held.forEach((k) => keys.delete(k)); return { scene: Object.keys(scenes).find((k) => scenes[k] === scene), now: +now.toFixed(1), say: band.cur && band.cur.text };
} };
const DEV = { Digit1: ["deck", {}], Digit2: ["room", {}], Digit3: ["dive", {}], Digit4: ["dive", { x: 480, y: SB - 20 }], Digit5: ["dive", { x: 1090, y: SB - 20 }], Digit6: ["dive", { x: 1380, y: SB - 20 }] };
addEventListener("keydown", (e) => { if (started && DEV[e.code] && e.shiftKey) go(...DEV[e.code]); });
function begin(name, arg) { started = true; $("#go").classList.add("off"); $("#fade").style.opacity = 1; enter(name, arg); fadeTo = 0; }
$("#go").addEventListener("click", () => { startAudio(); $("#go").classList.add("off"); go("deck", { intro: true }); });
// a direct link skips the title, so sound starts on the first key or click instead
for (const ev of ["keydown", "pointerdown"]) addEventListener(ev, () => startAudio(), { once: true });
if (qs.get("leg") === "2") Object.assign(RUN, { leg: 2, sleeve: true, salvage: 1 });   // jump to the second half
if (qs.has("s")) begin(qs.get("s"), qs.has("x") ? { x: +qs.get("x"), y: +qs.get("y") } : qs.has("at") ? { at: +qs.get("at") } : {});
else { started = true; enter("title"); fade = fadeTo = 0; $("#fade").style.opacity = 0; }
requestAnimationFrame((ts) => { last = ts; frame(ts); });
