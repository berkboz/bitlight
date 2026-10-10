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
let anyTap = false;                                       // any press anywhere this frame, finger or mouse
addEventListener("pointerdown", () => (anyTap = true));
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
let ac, master, lp, seaGain, echoIn;
// ---------- ambience ----------
// Every place has air (or water) in it. Five beds of filtered noise and one motor run all the time
// at whatever level the place asks for, and each place has its own scattered events: a gull, a bell
// buoy, a drip, a whale a long way off. Nothing is a recording: it is all made here.
const amb = { g: {}, f: {}, tgt: {}, ev: [], key: "", hum: null, humG: null, humT: 0 };
const BEDS = { sea: ["lowpass", 460, 0.5], wind: ["bandpass", 620, 0.7], rain: ["highpass", 2600, 0.4], hiss: ["bandpass", 3400, 0.6], roar: ["lowpass", 150, 0.6] };
function startAudio() {
  if (ac) return;
  try {
    ac = new AudioContext(); master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
    lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5000; lp.connect(master);
    // an echo to put distance on things: gulls, bells, drips, whales
    const dl = ac.createDelay(1), fb = ac.createGain(), dlp = ac.createBiquadFilter();
    echoIn = ac.createGain(); dl.delayTime.value = 0.34; fb.gain.value = 0.42; dlp.type = "lowpass"; dlp.frequency.value = 1700;
    echoIn.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(lp);
    [55, 55.45, 82.4].forEach((f, i) => { const o = ac.createOscillator(); o.type = i % 2 ? "triangle" : "sawtooth"; o.frequency.value = f; const g = ac.createGain(); g.gain.value = 0.012; o.connect(g).connect(lp); o.start(); });
    const buf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const k in BEDS) {
      const n = ac.createBufferSource(); n.buffer = buf; n.loop = true; n.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ac.createBiquadFilter(); f.type = BEDS[k][0]; f.frequency.value = BEDS[k][1]; f.Q.value = BEDS[k][2];
      const g = ac.createGain(); g.gain.value = 0;
      n.connect(f).connect(g).connect(lp); n.start(); amb.g[k] = g; amb.f[k] = f;
    }
    amb.hum = ac.createOscillator(); amb.hum.type = "sawtooth"; amb.hum.frequency.value = 46;
    const hf = ac.createBiquadFilter(); hf.type = "lowpass"; hf.frequency.value = 190;
    amb.humG = ac.createGain(); amb.humG.gain.value = 0; amb.hum.connect(hf).connect(amb.humG).connect(lp); amb.hum.start();
  } catch { ac = null; }
}
const rnd = (a, b) => a + Math.random() * (b - a);
// the scattered sounds
const snd = {
  gull: () => { const n = 2 + floor(Math.random() * 3), f = rnd(1250, 1650); for (let i = 0; i < n; i++) tone(f * rnd(0.95, 1.08), rnd(0.16, 0.26), 0.04, "triangle", f * 0.62, i * rnd(0.26, 0.36), 0.6); },
  bell: () => { tone(612, 2.4, 0.05, "sine", 606, 0, 0.7); tone(1228, 1.3, 0.016, "sine", 1220, 0, 0.5); },
  creak: () => tone(rnd(58, 84), rnd(0.5, 0.9), 0.07, "sawtooth", rnd(42, 56)),
  clink: () => tone(rnd(2300, 3100), 0.05, 0.03, "triangle", 1900, 0, 0.5),
  drip: () => tone(rnd(1500, 2300), 0.05, 0.05, "sine", 880, 0, 0.8),
  slap: () => tone(rnd(190, 260), 0.14, 0.05, "triangle", 110),
  whale: () => { const f = rnd(150, 230); tone(f, 2.6, 0.05, "sine", f * 1.7, 0, 0.9); tone(f * 1.7, 2.0, 0.04, "sine", f * 0.8, 2.3, 0.9); },
  bubble: () => { const f = rnd(420, 900); tone(f, 0.07, 0.03, "sine", f * 2.2, 0, 0.2); if (Math.random() < 0.5) tone(f * 1.3, 0.06, 0.02, "sine", f * 2.6, 0.08, 0.2); },
  click: () => { for (let i = 0; i < 3; i++) tone(rnd(3200, 4600), 0.012, 0.02, "square", 2600, i * rnd(0.03, 0.07)); },
  tick: () => tone(snd.tk++ % 2 ? 1750 : 2050, 0.014, 0.03, "square", 1500),
  wiper: () => tone(260, 0.3, 0.025, "sawtooth", 170),
  putter: () => { for (let i = 0; i < 9; i++) tone(rnd(54, 60), 0.05, 0.08, "square", 44, i * 0.11); },
  car: () => { amb.swoosh = 2.4; },
  tk: 0,
};
// what each place sounds like: bed levels, the lowpass over everything, and events as [min gap, max gap, sound]
const AMB = {
  home: { sea: 0, wind: 0.006, rain: 0.03, hiss: 0, roar: 0.012, lp: 2600, ev: [[0.5, 0.5, snd.tick], [9, 20, snd.car]] },
  taxi: { sea: 0, wind: 0.01, rain: 0.04, hiss: 0, roar: 0.05, lp: 3000, ev: [[1.15, 1.15, snd.wiper]] },
  takeoff: { sea: 0, wind: 0.04, rain: 0, hiss: 0.004, roar: 0.11, lp: 3000, ev: [] },
  flight: { sea: 0, wind: 0.014, rain: 0, hiss: 0.003, roar: 0.06, lp: 2200, ev: [[7, 14, snd.creak]] },
  boat: { sea: 0.06, wind: 0.03, rain: 0.025, hiss: 0, roar: 0, lp: 4200, ev: [[1, 1, snd.putter], [2.5, 6, snd.slap], [11, 20, snd.bell]] },
  night: { sea: 0.07, wind: 0.034, rain: 0.035, hiss: 0, roar: 0, lp: 4600, ev: [[13, 28, snd.gull], [5, 12, snd.creak], [3.5, 9, snd.clink], [12, 24, snd.bell], [3, 7, snd.slap]] },
  noon: { sea: 0.075, wind: 0.026, rain: 0, hiss: 0, roar: 0, lp: 5200, ev: [[3.5, 9, snd.gull], [6, 13, snd.creak], [4, 9, snd.clink], [14, 26, snd.bell], [3, 7, snd.slap]] },
  room: { sea: 0.018, wind: 0.004, rain: 0.006, hiss: 0.009, roar: 0.006, lp: 1500, ev: [[7, 15, snd.creak], [16, 30, snd.bell]] },
  bay: { sea: 0.022, wind: 0, rain: 0, hiss: 0, roar: 0.02, lp: 2400, ev: [[1.2, 4.2, snd.drip], [5, 12, snd.clink], [6, 14, snd.creak], [3, 8, snd.slap]] },
  dive: { sea: 0, wind: 0, rain: 0, hiss: 0, roar: 0.01, lp: 1400, ev: [[0.7, 2.6, snd.bubble], [24, 46, snd.whale], [9, 22, snd.click]] },
  end: { sea: 0, wind: 0, rain: 0, hiss: 0, roar: 0.006, lp: 600, ev: [[30, 50, snd.whale]] },
};
function ambScene(key) {
  if (amb.key === key) return;
  amb.key = key;
  if (key !== "dive") amb.humT = 0;
  const a = AMB[key];
  amb.tgt = { ...a };
  amb.ev = a.ev.map(([lo, hi, fn]) => ({ lo, hi, fn, t: rnd(lo * 0.3, hi) }));
  if (lp && key !== "dive") lp.frequency.value = a.lp;
}
function ambTick(dt) {
  if (!ac) return;
  const swell = 0.7 + 0.3 * sin(now * 0.55) * sin(now * 0.17 + 1), k = Math.min(1, dt * 1.6);
  if (amb.swoosh > 0) amb.swoosh -= dt;                                            // a car going by in the wet, outside
  for (const name in amb.g) {
    let v = amb.tgt[name] || 0;
    if (name === "sea") v *= swell;
    if (name === "roar" && amb.swoosh > 0) v += 0.03 * sin((amb.swoosh / 2.4) * PI);
    amb.g[name].gain.value += (v - amb.g[name].gain.value) * k;
  }
  amb.f.wind.frequency.value = 520 + 260 * sin(now * 0.23) + 120 * sin(now * 0.71);   // the wind never holds a note
  amb.humG.gain.value += (amb.humT - amb.humG.gain.value) * Math.min(1, dt * 3);
  for (const e of amb.ev) { e.t -= dt; if (e.t <= 0) { e.t = rnd(e.lo, e.hi); e.fn(); } }
}
function tone(f, len, vol, type = "triangle", f2 = f * 0.4, at = 0, wet = 0) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(max(20, f2), t + len);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  o.connect(g).connect(lp || master); o.start(t); o.stop(t + len + 0.02);
  if (wet && echoIn) { const w = ac.createGain(); w.gain.value = wet; g.connect(w).connect(echoIn); }
}
const knock = (f = 110, len = 0.14, vol = 0.4) => tone(f, len, vol);
// ---------- small sounds: every press answers, and everyone who is not the radio has a noise of their own ----------
const sfx = {
  use: () => { tone(540, 0.04, 0.1, "square", 420); tone(270, 0.07, 0.1, "triangle", 200, 0.03); },      // E, and something happened
  nope: () => tone(120, 0.09, 0.1, "triangle", 90),                                                   // E, and nothing to use
  tick: () => tone(1250, 0.02, 0.03, "square", 1100),                                                 // something has come into reach
  thing: () => tone(210, 0.09, 0.13, "triangle", 150),                                                // an object, considered
  // Bo does not so much speak as rumble: a few low syllables, one per word or so
  grumble: (text) => { const n = clamp(text.split(" ").length, 3, 9); for (let i = 0; i < n; i++) tone(92 + Math.random() * 58, 0.07 + Math.random() * 0.06, 0.13, "sawtooth", 66 + Math.random() * 30, i * 0.115 + Math.random() * 0.03); },
  meow: () => { tone(640, 0.18, 0.11, "triangle", 1080); tone(1080, 0.3, 0.11, "triangle", 470, 0.15); },
  hiss: () => { for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 2200, 0.05, 0.035, "sawtooth", 900, i * 0.07); },
};
const noiseOf = (who, text) => (who === "bo" ? sfx.grumble(text) : who === "the cat" ? sfx.meow() : who === "· static ·" ? sfx.hiss() : sfx.thing());
const ping = () => tone(880, 1.8, 0.05, "sine", 870, 0, 0.8);
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

// ---------- the tapping ----------
// One signal runs under the whole game: something on the dead line is still sending, in Morse.
// You hear it before you see anything, through the deck, and it is what the splice blinks.
const MORSE = { A: ".-", N: "-.", Y: "-.--", O: "---", E: "." }, WORD = "ANYONE", UNIT = 0.17, TAPS = [];
let TAPLEN = 0, tapVol = 0, tapWas = 0, goal = "";
{ let t = 0; for (const ch of WORD) { for (const c of MORSE[ch]) { const l = c === "." ? 1 : 3; TAPS.push([t, l * UNIT]); t += (l + 1) * UNIT; } t += 2 * UNIT; } TAPLEN = t + 2.8; }
const tapNow = (t) => { const u = ((t % TAPLEN) + TAPLEN) % TAPLEN; for (const tp of TAPS) if (u >= tp[0] && u < tp[0] + tp[1]) return tp; return null; };
const tapAt = (t) => (tapNow(t) ? 1 : 0);
function tapTick() { const tp = tapNow(now); if (tp && !tapWas && tapVol > 0.004) tone(318, max(0.08, tp[1]), tapVol, "sine", 306); tapWas = tp ? 1 : 0; }

// ---------- words ----------
let now = 0;
const HUSH = 5;                                            // seconds of nothing between lines that can wait
const band = { q: [], cur: null, shownAt: 0, lastEnd: -9, said: new Set(), done: new Set(), n: 0 };
// who: "radio" (the old man), or a name for a caption
function say(text, { id = text, who = "radio", gap = 1.6, urgent = false, red = false, keep = false, once = false, then = false, flow = false } = {}) {
  if (who !== "radio" && who !== "the office") {
    // not the old man: a subtitle in the picture, now, with that speaker's own noise. No queue to wait in.
    if (once) { if (band.said.has(id)) return false; band.said.add(id); }
    cap(text, who, red, then);
    return true;
  }
  if (band.said.has(id)) return false;
  band.said.add(id);
  if (urgent && band.cur) {
    // you did something and he has something to say about it: he says it now, not after the current line.
    // A scripted line that gets cut off is forgotten, so whoever was telling it will start it again.
    if (band.cur.who === "radio" || band.cur.who === "the office") { band.said.delete(band.cur.id); if (voiceEl) voiceEl.pause(); }
    band.q = band.q.filter((m) => !m.urgent || m.keep);
    band.cur = null; $("#say").textContent = ""; $("#log").textContent = ""; band.lastEnd = now - 10;
  }
  const m = { text, id, who, gap, red, keep, urgent, flow, born: now };
  urgent ? band.q.unshift(m) : band.q.push(m);
  return true;
}
const talking = () => !!band.cur && band.cur.who === "radio" && band.n < band.cur.text.length;
function pump() {
  const b = band;
  if (b.cur && now - b.shownAt > b.cur.hold) { b.done.add(b.cur.id); b.cur = null; $("#say").textContent = ""; $("#log").textContent = ""; b.lastEnd = now; }
  if (!b.cur && b.q.length && now - b.lastEnd > (b.q[0].urgent || b.q[0].flow ? b.q[0].gap : Math.max(b.q[0].gap, HUSH))) {
    const m = b.q.shift();
    b.cur = m; b.n = 0; m.hold = max(2.6, m.text.length * 0.062 + 1.1); b.shownAt = now;
    if (m.who === "radio" || m.who === "the office") speak(m);
    const lg = $("#log"); lg.textContent = m.who === "radio" ? "· on the line ·" : m.who === "the office" ? "· the office ·" : m.who; lg.classList.toggle("red", !!m.red);
  }
  if (b.cur) {
    // the words appear as he says them: at his pace when there is a recording, at typing pace when not
    const n = min(b.cur.text.length, floor((now - b.shownAt) * (b.cur.dur ? b.cur.text.length / (b.cur.dur * 0.94) : 40)));
    if (n !== b.n) { if ((b.cur.who === "radio" || b.cur.who === "the office") && !b.cur.dur && n % 3 === 0 && b.cur.text[n - 1] !== " ") blip(); b.n = n; $("#say").textContent = b.cur.text.slice(0, n); }
  }
}
let markAt = null;                                         // [world x, world y] of what to go to next, or null
function placeMark() {
  const m = $("#mark");
  if (!markAt || pending || document.body.classList.contains("cine")) { m.classList.remove("on"); return; }
  const x = (markAt[0] - cam.x) / COLS, y = (markAt[1] - cam.y) / ROWS, cx = clamp(x, 0.04, 0.96), cy = clamp(y, 0.07, 0.9), off = cx !== x || cy !== y;
  m.style.left = cx * 100 + "%"; m.style.top = cy * 100 + "%";
  m.style.setProperty("--a", (off ? (Math.atan2(y - cy, x - cx) * 180) / PI - 90 : 0) + "deg");
  m.classList.add("on"); m.classList.toggle("away", off);
}
let lastPrompt = "";
const prompt = (label) => {
  const p = $("#prompt");
  if (label) { if (label !== lastPrompt) sfx.tick(); p.innerHTML = TOUCH ? label.replace("hold space", "hold ●") : label; p.classList.add("on"); } else p.classList.remove("on");
  lastPrompt = label || "";
};
// captions: side characters and things. Shown at once; a new one replaces the old; `then` waits its turn.
const capQ = [];
let capT = 0;
function cap(text, who, red, then) {
  if (then && now < capT) { capQ.push([text, who, red]); return; }
  capQ.length = then ? capQ.length : 0;
  const c = $("#cap");
  c.querySelector("b").textContent = who; c.querySelector("span").textContent = text;
  c.classList.add("on"); c.classList.toggle("red", !!red);
  capT = now + Math.max(2.2, text.length * 0.055 + 1.2);
  noiseOf(who, text);
}
function capTick() {
  if (capT && now > capT) { capT = 0; $("#cap").classList.remove("on"); if (capQ.length) cap(...capQ.shift()); }
}
let cardT = 0;
function card(html, secs = 4, low = false) { const c = $("#card"); c.innerHTML = html; c.classList.add("on"); c.classList.toggle("low", low); cardT = now + secs; }

// ---------- scenes ----------
const scenes = {};
let scene = null, sceneT = 0, fade = 1, fadeTo = 0, pending = null;
function go(name, arg) { if (pending) return; pending = { name, arg }; fadeTo = 1; }
function enter(name, arg) {
  // lines still waiting belong to the place you just left: forget them, so they can be said again there
  capQ.length = 0; capT = 0; $("#cap").classList.remove("on"); lastPrompt = "";
  for (const m of band.q) if (!m.keep) band.said.delete(m.id);
  band.q = band.q.filter((m) => m.keep);
  scene = scenes[name]; sceneT = 0; markAt = null; prompt(null); showG(false); document.body.classList.remove("cine"); scene.enter(arg || {}); }

// what carries from one dive to the next
const RUN = { leg: 1, cuts: [], cutIds: [], salvage: 0, sleeve: false, logSeen: false };
const you = { x: 130, face: 1, wt: 0, moving: false, sit: false, plain: true };
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
const youPose = () => ({ m: you.sit ? "sit" : you.moving ? "walk" : "idle", f: you.moving ? floor(you.wt * 8) % 8 : 0, p: you.plain ? 1 : 0 });
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
    you.sit = false; you.x = at ?? (d.ch === 2 ? 150 : 62); you.face = at ? -1 : 1;
    d.intro = intro ? 7.5 : 0;
    d.gull = { x: 262, y: DF - 28, fly: 0, t: 0 };
    if (intro) { document.body.classList.add("cine"); cam.x = DW - COLS; }
    else if (d.ch === 2 && !at) { cam.x = 0; card("the same day · 13:10", 4); say("Up she comes. Mind your head. Mind his, too.", { id: "upshe", who: "bo", once: true }); }
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
    goal = two ? "report to the radio room" : "find the radio room"; markAt = [652, DF - 66];
    if (floor(now / 26) !== floor((now - dt) / 26) && !two) tone(74, 2.6, 0.07, "sawtooth", 70);          // a horn, somewhere in the fog
    if (intro) return;
    if (!two) { say("You're the diver. He's been asking for you. By name.", { id: "hook1", who: "bo", once: true }); say("Nobody here told him your name.", { id: "hook2", who: "bo", once: true, then: true }); }
    // nobody makes you go below. They do mention it.
    if (!two) {
      if (sceneT > 70) say("He's waiting, you know. He's very good at it.", { id: "wait1", who: "bo", once: true });
    }
    if (you.x <= 32) say("That's the edge of the ship. Past it is the job.", { id: "edge", who: "you think", once: true });
    const BO = two
      ? ["You came back up. Most do.", "He talks about that old cable like it owes him a letter.", "Mind the wet bit. Different wet bit."]
      : ["Hear that, through the deck? It's been coming up the cable since it died. Don't ask me what it spells.", "He's been on that radio since before I signed on. Before the ship did, maybe.", "Every clock aboard stopped at twelve past three. Mine too. Mind the wet bit."];
    const list = [
      { x: 190, r: 30, label: "the crane", act: () => say("It lowers things over the side. Lately they stay there.", { id: "dcrane" + floor(now / 9), who: "the crane" }) },
      { x: 340, r: 28, label: "the drum", act: () => say("The slack. Forty kilometres of spare cable, for when things go wrong. Things go wrong.", { id: "ddrum" + floor(now / 9), who: "the slack" }) },
      { x: 452, r: 22, label: "the cat", act: () => { say(two ? "The cat has not moved. The cat has been very busy." : "The cat does not work here. The cat believes it does.", { id: "dcat" + floor(now / 9), who: "the cat" }); } },
      { x: d.bo.x, r: 26, label: "talk to Bo", act: () => { say(BO[d.bo.n % 3], { id: "bo" + d.ch + d.bo.n, who: "bo" }); d.bo.n++; } },
      { x: 652, r: 20, label: "go below", act: () => { knock(140, 0.2, 0.3); go("room"); } },
    ];
    const n = nearest(list, you.x);
    prompt(n ? `<kbd>E</kbd>${n.label}` : null);
    if (n && actHit()) n.act();
  },
  draw() {
    const t = now, H0 = 104 + sin(t * 0.7) * 2, d = deck, noon = d.ch === 2;
    ambScene(noon ? "noon" : "night");
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
    const night = !noon;
    tapVol = 0.05;
    if (night) {
      // before dawn: fog on the water, rain, and nothing lit but what the ship lights itself
      env.tones = 8; env.screen = "bayer"; env.lit = [214, 230, 236]; env.unlit = [6, 12, 19]; env.amb = 0.1; env.sun = { d: nrm3(-0.2, -0.9, 0.4), p: 0.07 };
      env.outline = "light"; env.haloMin = 0.13; env.cut = 0.02;
      env.lights = [110, 300, 480].map((x) => ({ x: x + 13 - cam.x, y: DF - 44, z: -20, p: 2.7, k: 0.0011, dir: nrm3(0, 1, -0.25), c0: 0.3, c1: 0.78 }));
      env.lights.push({ x: 652 - cam.x, y: 90, z: -26, p: 1.7, k: 0.002 }, { x: 196 - cam.x, y: DF - 52, z: -6, p: 1.3, k: 0.0026 }, { x: you.x - cam.x, y: DF - 20, z: 30, p: 0.35, k: 0.004 });
      env.bg = (i, j) => {
        const fogb = 0.07 * (0.5 + 0.5 * sin(i * 0.021 + t * 0.12 + sin(j * 0.21) * 1.3)) * Math.exp(-(((j - H0) / 24) ** 2));
        if (j < H0) return 0.03 + 0.05 * (j / H0) ** 3 + fogb + (hash(i + floor(cam.x * 0.05), j) > 0.9986 && j < H0 - 16 ? 0.5 : 0);
        return 0.028 + 0.03 * sin(i * 0.09 + j * 0.7 + t * 1.6) * sin(j * 0.35 - t * 0.9) + fogb;
      };
    }
    E.clear();
    layer(0.05, -300);
    if (night) { rect(E.lx() + 262, H0 - 0.5, 34, 0.5, 0.9, { e: 0.85, red: 1 }); for (let k = 0; k < 14; k++) dot(E.lx() + 222 - k * 3, H0 - 1, 0.9, { e: 0.8, red: 1 }), dot(E.lx() + 300 + k * 3, H0 - 1, 0.9, { e: 0.8, red: 1 }); }               // the only colour out there: where the day will be
    else disc(sunX + cam.x * 0.05 + E.lx(), sunY, sunR, 0.9, { e: 1, red: 1 });
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
    if (night) { for (const x of [110, 300, 480]) draw(F.beacon, { on: 1 }, x, DF - 4, { size: 26, z: 14 }); disc(70, 23, 1.7, 0.9, { e: sin(t * 2.2) > 0 ? 1 : 0.08, red: 1, z: 6 }); }
    // crane, with the submarine waiting under it
    rect(70, 88, 4, 64, 0.52, { z: 4 }); seg(70, 26, 196, 44, 4.5, 0.56, { z: 4 }); seg(70, 60, 120, 34, 2, 0.45, { z: 4 });
    seg(196, 44, 196, DF - 36, 1, 0.45, { z: 4, flat: 1 });
    draw(F.crate, {}, 184, DF - 2, { size: 30, z: 22 }); draw(F.crate, {}, 208, DF - 1, { size: 22, z: 26 }); disc(196, DF - 37, 3, 0.5, { z: 4 });
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
    if (night) { layer(1.2, 120); for (let n = 0; n < 54; n++) { const x = ((hash(n, 71) * 460 - t * 30 - E.lx()) % 460 + 460) % 460 - 30 + E.lx(), y = (hash(n, 72) * ROWS + t * (170 + hash(n, 73) * 60)) % ROWS; seg(x, y, x - 3, y + 7, 1, 0, { e: 0.13, flat: 1 }); } }
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
  if (!band.said.has(l.id)) say(typeof l.text === "function" ? l.text() : l.text, { id: l.id, who: l.who || "radio", gap: l.who ? 0.7 : 1.3, flow: true });   // a told sequence keeps its own rhythm
  else if (band.done.has(l.id)) st.i++;
  return false;
}
const BRIEF = [
  { id: "b0", text: "Ah. There you are. I'd know that walk anywhere. Mind the step. There isn't one." },
  { id: "b1", text: "Sit down, if you like." },
  { id: "b2", when: () => you.sit || (room.wait && now - room.wait > 8), text: () => (you.sit ? "Thank you. People used to sit all the time." : "Or stand. Standing is also a way of listening.") },
  { id: "b3", text: "The cable under this ship carries half an ocean's worth of talk. At 03:12 it stopped." },
  { id: "b3a", text: "Your job is to go down, follow it, and find where it's broken. You laid it. You know the way." },
  { id: "b3b", text: "Something on it is still tapping. I'd rather you didn't count the taps." },
  { id: "b5", text: "Follow the line. Bring me the first thing that looks wrong." },
  { id: "b6", text: "The hatch is by the wall." },
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
  L.push({ id: "d3", text: "But a bite doesn't stop a cable. The break is past the edge, at the bottom, where yours crosses an older one." });
  L.push({ id: "d4", text: "Go down and find it. Then it's up to you." });
  return L;
}
scenes.room = {
  enter({ at }) {
    const r = room;
    you.x = at ?? 44; you.face = at ? -1 : 1; you.sit = false; cam.x = 0; cam.y = 0;
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
    goal = ready ? "the hatch" : "hear him out"; markAt = ready ? [332, RF - 30] : !two && r.s1.i === 2 && !you.sit ? [158, RF - 36] : null;
    const list = [
      { x: 124, r: 12, label: "the clock", act: () => { say("Twelve past three. It stopped when the line did.", { id: "clock" + floor(now / 14), who: "the clock", urgent: true }); say("They all did. Bo's watch. The galley. Me, very nearly.", { id: "clockr" }); } },
      { x: 292, r: 8, label: "the plug", act: () => { say("The radio's plug is on the floor, a long way from the wall.", { id: "plug" + floor(now / 14), who: "the plug", urgent: true, red: true }); say("Yes. I know. Don't put it back. I'd hate to find out.", { id: "plugr" }); } },
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
        if (ready || asked) { if (!ready) say(two ? "Or go. I'll tell the rest to the tea." : "Or go now. The briefing was mostly me apologising.", { id: "skip" + RUN.leg, urgent: true, keep: true }); knock(80, 0.4, 0.4); go("bay"); }
        else { if (two) r.asked2 = 1; else r.asked = 1; say(two ? "Debrief first. It's shorter than the briefing. I've been practising." : "Briefing first, if you would. I've prepared one. It's short.", { id: "ask" + RUN.leg, urgent: true }); }
      } },
    ];
    // the dive log, once you have been down: yesterday's entry is in your handwriting
    if (two) list.push({ x: 244, r: 9, label: "the dive log", act: () => {
      say("Nine years ago, in your handwriting: 'crossed an old cable at 4,000 m. it was warm. not logged.'", { id: "log", who: "the dive log", red: true });
      say("Ah. You found that. You never did tell them. I was grateful.", { id: "logr", urgent: true }); RUN.logSeen = true;
    } });
    const n = you.sit ? list.find((o) => o.x === 158) : nearest(list, you.x);
    prompt(n ? `<kbd>E</kbd>${n.label}` : null);
    if (n && actHit()) n.act();
  },
  draw() {
    const t = now, r = room, bob = sin(t * 0.7) * 2;
    tapVol = 0.035; ambScene("room"); amb.tgt.hiss = talking() ? 0.02 : 0.009;      // the radio hisses a little more when he is on it
    env.holes = false; env.tones = 8; env.screen = "bayer"; env.lit = [255, 228, 180]; env.unlit = [20, 14, 11]; env.amb = 0.13; env.ambRow = null; env.sun = null;
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
    // the clock: stopped at 03:12, like every other one aboard
    { const cx = 124, cy = 42, hA = ((3 + 12 / 60) / 12) * TAU, mA = (12 / 60) * TAU;
      disc(cx, cy, 11, 0.4, { z: 1 }); disc(cx, cy, 9, 0.9, { z: 1.3 });
      seg(cx, cy, cx + sin(hA) * 4.5, cy - cos(hA) * 4.5, 1.6, 0.1, { z: 1.5, flat: 1 }); seg(cx, cy, cx + sin(mA) * 7, cy - cos(mA) * 7, 1.2, 0.1, { z: 1.5, flat: 1 }); }
    // the socket on the wall, and (below) the radio's plug, nowhere near it
    rect(304, 134, 3, 3.5, 0.78, { z: 1 }); disc(303, 134, 0.6, 0.1, { z: 1.2 }); disc(305, 134, 0.6, 0.1, { z: 1.2 });
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
    seg(238, RF - 8, 246, RF + 5, 1, 0.24, { flat: 1, z: -3 }); seg(246, RF + 5, 270, RF + 7, 1, 0.24, { flat: 1, z: 2 }); seg(270, RF + 7, 290, RF + 5, 1, 0.24, { flat: 1, z: 2 });
    rect(292, RF + 5, 2.4, 1.6, 0.85, { z: 3 }); rect(295, RF + 4.6, 1, 0.4, 0.9, { z: 3 }); rect(295, RF + 5.6, 1, 0.4, 0.9, { z: 3 });
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
// The sea has a shape: a shelf, an edge, a rock wall with the cable hanging down it, and an abyss.
const WW = 2340, SB = 300, DROP = 560, SB2 = SB + DROP, XE = 1240, SPLICE = 2170, WALL = XE - 44, SZ = 22, FLOORH = 78, ZK = E.ZK, M_PER = 4.6;
const T = (x) => (x < XE ? SB : SB2);                                        // the floor's far edge: the shelf, then far below it the abyss
const cl = (x) => 38 + 11 * sin(x * 0.013);                                  // the cable's lane: it wanders nearer and further
const ridgeFar = (x) => 205 + 14 * sin(x * 0.011) + 7 * sin(x * 0.043 + 2);
const D = {};
const BEACONS = [{ x: 640, red: 0 }, { x: 1010, red: 1 }, { x: 1720, red: 0, flick: 1 }];
const branches = () => [
  { id: "E", x0: 432, x1: 506, side: -1, lift: 22, dur: 1.2, who: "COLDSTRAND-4 · Svalbard · the webcam bear, who had just stood up", line: "Ah, well. Bears don't need the internet to stand up." },
  { id: "A", x0: 852, x1: 938, side: 1, lift: 24, dur: 1.2, who: "TIDEWELL-2 · Hobart · a fourteen-second voice note from Dad, unplayed", line: "Oh. He was going to tell you about the shed. He does that." },
  { id: "B", x0: 1520, x1: 1620, side: 1, lift: 26, dur: 1.2, who: "MAREA-3 · Lisbon · Senhor Vidal's 06:40 tram", line: "Oh, Vidal. He'll wait anyway. He always does." },
  { id: "C", x0: 1790, x1: 1886, side: -1, lift: 24, dur: 1.2, who: "MAREA-4 · Lisbon · nothing changed. MAREA-5 ran alongside, unbothered.", line: "Two cables, one job. I'm not cross. I'm just disappointed in the spare." },
];
const bl = (b, x) => cl(x) + b.side * b.lift * sin(clamp((x - b.x0) / (b.x1 - b.x0), 0, 1) * PI);
// What he tells you at the break. This is the story, said once, in plain words.
const FINAL = [
  "There you are. You can hear me properly now. That isn't the radio. It's the old line.",
  "It was laid in 1858. It worked for three weeks. I was the operator at this end, and I never stopped listening.",
  "A hundred and sixty-eight years. I kept asking if anyone was there. Then your cable came down across mine, full of voices. None of them for me.",
  "So I broke it. I am sorry. It was the only way anyone would come, and you were the only one who ever had.",
  "Mend yours, and they all get their voices back. Or cut mine, and I can stop asking. I won't mind which.",
];
const SMASH = ["Gently with the barnacles. They've held on a long time.", "Easy, easy. I know it's satisfying. So is tea, and quieter.", "Mind that. It's older than us both."];
function diveReset() {
  Object.assign(D, {
    sub: { x: 150, y: -64, vx: 0, vy: 0, face: 1, lane: cl(150), dir: [0.8, 0.6, 0], prop: 0 }, me: { x: 0, y: 0, vx: 0, vy: 0, face: 1, lane: 38, sw: 0, dir: [0.8, 0.6, 0] },
    mode: "lower", ctrl: false, splash: false, salvage: 0, quiet: 0, cuts: [], smashN: 0, ended: false, far: 0, disob: 0, hoseSaid: 0, latch: false, bubbles: [], debris: [],
    branches: branches().map((b) => ({ ...b, cut: false, prog: 0 })),
    things: [
      { kind: "pod", def: F.pod, x: 790, dl: 0, act: "smash", dur: 0.8 },
      { kind: "slate", def: F.slate, x: 968, dl: -9, act: "read", dur: 0.5 },
      { kind: "sleeve", def: F.sleeve, x: 1096, dl: 0, up: 5, act: "collect", dur: 0.6 },
      { kind: "barn", def: F.barnacles, x: 1130, dl: -7, act: "smash", dur: 0.5 }, { kind: "barn", def: F.barnacles, x: 1150, dl: 6, act: "smash", dur: 0.5 }, { kind: "barn", def: F.barnacles, x: 1166, dl: -2, act: "smash", dur: 0.5 },
      { kind: "kettle", def: F.kettle, x: 1670, dl: 10, act: "smash", dur: 0.6 },
      { kind: "jumper", def: F.jumper, x: 2010, dl: -10, act: "collect", dur: 0.9, say: "No one has come back for it in a length of time I would prefer not to calculate." },
    ].map((t) => ({ ...t, gone: false, prog: 0, hot: 0, shake: 0 })),
    fishes: Array.from({ length: 26 }, (_, i) => { const x = 330 + (hash(i, 1) - 0.5) * 90, y = 62 + (hash(i, 2) - 0.5) * 40; return { x, y, hx: x, hy: y, vx: 0, vy: 0, ph: hash(i, 3) * 4 }; }),
    jellies: Array.from({ length: 6 }, (_, i) => ({ x: 420 + i * 150 + hash(i, 4) * 60, y: 110 + hash(i, 5) * 80, ph: hash(i, 6) * 8 })),
    turtle: { x: 60, y: 44 }, crab: { x: 668, dir: 1 }, octo: { hide: 0 }, angler: { x: 1370, y: SB + 330 },
    dumbos: [{ x: 1312, y: SB + 130 }, { x: 1380, y: SB + 250 }, { x: 1300, y: SB + 420 }], pig: { x: 1900, dir: 1 }, thin: false, creak: 0,
    leg: RUN.leg, shipX: 40, deepest: 0, wallT: 0, wallN: 0, topT: 0, choice: 0,
  });
}
// fixed things with something to say: [x, lane offset from the cable, figure, line]
const WORDS = [
  [380, -16, F.helmet, "Valve closed. No diver reported missing from this depth. We checked twice."],
  [1440, -18, F.rov, "It was looking for us, then stopped. The camera still points where it last looked."],
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
const float XE = ${(XE / SZ).toFixed(4)}, H = ${(DROP / (SZ * KP)).toFixed(4)};          // where the shelf ends, and how far down the abyss is
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float fy(float x) { return x < XE ? 0.0 : -H; }                                          // the floor's height: the shelf, then the abyss
float cz(float x) { return (38.0 + 11.0 * sin(x * S * 0.013)) * ${ZK}.0 / S; }          // the cable's depth at x
float relief(vec2 p) { return 0.022 * sin(p.x * 1.3 + sin(p.y * 1.1) * 1.4) + 0.012 * sin(p.y * 2.3 + p.x * 0.6); }   // gentle: steeper and every crest would earn a halo
float rough(vec2 p) { return 0.16 * sin(p.x * 1.7 + sin(p.y * 1.3) * 1.6) + 0.09 * sin(p.y * 3.7 + p.x * 0.8) + 0.04 * sin(p.y * 9.0); }   // a rock face
uniform vec4 uSub, uMe;                                                              // where the cast is: xyz, and w = present
float sdCast(vec3 p) {
  float d = sdCapsule(p, uSub.xyz - vec3(0.6, 0.0, 0.0), uSub.xyz + vec3(0.6, 0.0, 0.0), 0.42);
  if (uMe.w > 0.5) d = min(d, sdCapsule(p, uMe.xyz - vec3(0.2, 0.0, 0.0), uMe.xyz + vec3(0.2, 0.0, 0.0), 0.2));
  return d;
}
bool clearOf(vec2 c) { return c.y > 0.35 && c.y < ZMAX && abs(c.y - cz(c.x)) > 1.35 && abs(c.x - XE) > 1.0; }   // keep the cable's lane and the edge free
float sdCable(vec3 p) {
  float r = p.x < SPL ? 0.06 : 0.03, c = cz(p.x);
  float d = (length(vec2(p.y - fy(p.x) - r - relief(vec2(p.x, c)), p.z - c)) - r) * 0.8;
  d = max(d, 0.32 - abs(p.x - SPL - 0.15));                                            // the break
  return min(d, sdCapsule(p, vec3(XE + 0.1, 0.06, cz(XE)), vec3(XE + 0.1, 0.06 - H, cz(XE)), 0.06));   // over the edge, it hangs down the face
}
float sdRocks(vec3 p) {
  vec2 g = vec2(2.3, 1.5), id0 = floor(p.xz / g - 0.5);
  float d = 1e3;
  for (int a = 0; a < 2; a++) for (int b = 0; b < 2; b++) {
    vec2 id = id0 + vec2(a, b); float h = h21(id);
    if (h < 0.42) continue;
    vec2 c = (id + 0.5 + (vec2(h21(id + 7.1), h21(id + 3.7)) - 0.5) * 0.55) * g;
    if (!clearOf(c)) continue;
    float r = 0.14 + 0.3 * h21(id + 1.3), f = fy(c.x);
    vec3 q = (p - vec3(c.x, f + r * 0.4, c.y)) * vec3(1.0, 1.35, 1.0);
    d = min(d, (length(q) - r) * 0.72);
    d = smin(d, (length(p - vec3(c.x + r * 0.8, f + r * 0.3, c.y + r * 0.3)) - r * 0.6) * 0.9, 0.12);
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
    float f = fy(c.x), tall = c.x < XE ? 1.0 : 0.4;                                    // nothing grows tall in the abyss
    vec3 a0 = vec3(c.x, f, c.y);
    for (int k = 0; k < 4; k++) {
      float n = float(k + 1);
      vec3 b0 = vec3(c.x + sin(uTime * 0.6 + n * 0.5 + h * 6.0) * (0.03 + 0.05 * n) * tall, f + n * (0.26 + 0.2 * h) * HK * tall, c.y + cos(uTime * 0.4 + n) * 0.03 * n);
      d = min(d, sdCapsule(p, a0, b0, 0.085 - 0.014 * n));
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
    vec3 o = vec3(bx, fy(bx), cz(bx) - 16.0 * ${ZK}.0 / S);
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
// ledges on the wall: somewhere for the light to land on the way down
float sdLedges(vec3 p) {
  float d = 1e3;
  for (int k = 1; k <= 4; k++) {
    float n = float(k);
    d = min(d, sdBox(p - vec3(XE + 1.6 + n * 1.5 + sin(n * 2.3), -H * n / 5.0, 0.3), vec3(1.2 + 0.4 * sin(n * 1.7), 0.14, 0.5), 0.1));
  }
  return d;
}
float sdGround(vec3 p) {
  // the shelf is a block: its top is the floor you start on, its front the rock face you sink past
  float shelf = max(max(p.y - relief(p.xz), p.x - XE), max(p.z - ZMAX - rough(p.xy) * step(p.y, -0.3), -p.z));
  // behind the drop, a wall: a slab from the shelf's level all the way down
  float wall = max(max(p.z - rough(p.xy), -p.z - 0.9), max(p.y, XE - 0.5 - p.x));
  float abyss = max(p.y + H - relief(p.xz), -p.z);
  return min(min(shelf, wall), abyss) * 0.7;
}
float world(vec3 p) { float b; return min(min(sdCable(p), sdRocks(p)), min(sdKelp(p), min(sdBeacons(p, b), sdLedges(p)))); }
float occ(vec3 p) { return min(world(p), sdCast(p)); }                                 // the cast only casts: engine.js draws it
float map(vec3 p) { return min(sdGround(p), world(p)); }
void material(vec3 p, vec3 n, inout Mat m) {
  float bulb, db = sdBeacons(p, bulb);
  if (bulb < 0.012) { m.a = 0.9; m.e = 1.0; return; }
  if (db < 0.012) { m.a = 0.62; return; }
  if (sdCable(p) < 0.012) { m.a = p.x < SPL ? 0.88 : 0.5; return; }
  if (sdKelp(p) < 0.012) { m.a = 0.5; return; }
  if (sdRocks(p) < 0.012) { m.a = 0.4 + 0.12 * h21(floor(p.xz * 9.0)); return; }
  if (n.y < 0.6 || sdLedges(p) < 0.012) { m.a = 0.3 + 0.12 * h21(floor(vec2(p.x * 3.0, p.y * 9.0))) + 0.06 * sin(p.y * 13.0 + sin(p.x * 2.0)); return; }   // rock, in strata
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
// (heights are measured from the shelf, so the abyss is simply a long way negative)
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
    lights: Ls, ambient: 0.009 + 0.012 * clamp((D.sub.y - SB) / 200, 0, 1), tones: env.tones, screen: env.screen, ink: { lit: rgb(env.lit), unlit: rgb(env.unlit) }, theme: "dark", haloLight: 0.085, time: now });
}
const ground = (x, ln) => T(x) + ln;                       // the screen row where lane ln meets the floor
const nrm = (v) => { const l = hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
scenes.dive = {
  enter({ x, y }) {
    diveReset();
    // the second dive starts further along, with everything you did on the first still done
    const sx = D.leg === 2 ? 1110 : 150;
    D.sub.x = sx; D.sub.lane = cl(sx); D.shipX = sx - 110;
    for (const b of D.branches) if (RUN.cutIds.includes(b.id)) b.cut = true;
    if (RUN.sleeve) D.things.find((t) => t.kind === "sleeve").gone = true;
    cam.x = clamp(sx - COLS / 2, 0, WW - COLS); cam.y = -60;
    if (x !== undefined) { D.sub.x = x; D.sub.y = y; D.sub.lane = cl(x); D.mode = "sub"; D.ctrl = true; D.splash = true; cam.x = clamp(x - COLS / 2, 0, WW - COLS); cam.y = clamp(y - ROWS * 0.45, -24, SB + FLOORH - ROWS); }
    else document.body.classList.add("cine");
    if (seaGain) seaGain.gain.value = 0.05;
  },
  step(dt) {
    const s = D.sub, me = D.me;
    // --- the cutscene: the crane lowers you in
    if (D.mode === "lower") {
      // out through the bottom of the ship, in a cloud of bubbles, and then it is yours
      s.y = lerp(-22, D.leg === 2 ? 64 : 34, sstep(0.2, 4.2, sceneT)); s.prop += dt * 2;
      if (Math.random() < dt * 14) D.bubbles.push({ x: s.x + (Math.random() - 0.5) * 50, y: s.y - 6, vy: -20 - Math.random() * 20, life: 2 });
      if (sceneT > 4.6) { D.mode = "sub"; D.ctrl = true; document.body.classList.remove("cine"); if (D.leg === 1) say("All yours. The lamp follows your hand.", { id: "yours" }); }
    }
    // --- the submarine
    if (D.mode === "sub" && D.ctrl) {
      s.vx += (ax() * 62 - s.vx) * min(1, 2.2 * dt); s.vy += (ay() * 46 - s.vy) * min(1, 2.2 * dt);
      s.x = clamp(s.x + s.vx * dt, 40, D.leg === 1 ? WALL : WW - 40); s.lane += (cl(s.x) - 4 - s.lane) * min(1, 2 * dt);
      s.y = clamp(s.y + s.vy * dt, 16, ground(s.x, s.lane) - 26);
      if (s.y > SB + s.lane - 24 && s.x < XE + 34) s.x = XE + 34;                        // below the shelf's lip there is rock to the left
      if (abs(s.vx) > 8) s.face = Math.sign(s.vx);
      s.prop += dt * (3 + abs(s.vx) * 0.25);
      if (Math.random() < dt * (2 + abs(s.vx) * 0.2)) D.bubbles.push({ x: s.x - s.face * 30, y: s.y, vy: -14 - Math.random() * 10, life: 2.5 });
    }
    const who = D.mode === "eva" ? me : s;
    // --- hands and targets (worked out before moving, so the diver can drift to a target's lane)
    let target = null, td = 24;
    const alt = ground(who.x, who.lane) - who.y;
    for (const t of D.things) { t.hot = max(0, t.hot - dt * 3); t.shake = max(0, t.shake - dt * 4); if (t.gone || t.read) continue; const d = abs(who.x - t.x); if (d < td && alt < 44) { td = d; target = t; } }
    for (const b of D.branches) {
      b.near = false; if (b.cut) continue;
      const mid = (b.x0 + b.x1) / 2, d = abs(who.x - mid);
      if (who.x > b.x0 - 12 && who.x < b.x1 + 12 && alt < 60) { b.near = true; if (D.mode === "eva" && !D.thin) say("Please don't cut that. It's perfectly healthy.", { id: "notcut1" }); }
      if (!(target && target.kind) && d < 26 && alt < 44) { td = d; target = b; }
    }
    // --- on foot, on the hose
    if (D.mode === "eva") {
      me.vx += (ax() * 44 - me.vx) * min(1, 3 * dt); me.vy += (ay() * 38 - me.vy) * min(1, 3 * dt);
      me.x = min(me.x + me.vx * dt, D.leg === 1 ? WALL + 10 : WW - 20); me.y += me.vy * dt;
      const wantLane = target ? (target.kind ? cl(target.x) + target.dl + 5 : bl(target, (target.x0 + target.x1) / 2) + 5) : cl(me.x) + 6;
      me.lane += (wantLane - me.lane) * min(1, 2.5 * dt);
      me.y = clamp(me.y, 20, ground(me.x, me.lane) - 9);
      if (me.y > SB + me.lane - 8 && me.x < XE + 14) me.x = XE + 14;
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
        // what is under the pointer? a floor, the rock face under the shelf, the wall behind the drop, or open water
        const wx = cam.x + ptr.x, wy = cam.y + ptr.y, top = T(wx);
        tgt = wy >= top ? [wx, top, (wy - top) * ZK]
          : wy > SB + FLOORH && wx < XE ? [wx, wy - FLOORH, FLOORH * ZK]
          : wy > SB && wx >= XE ? [wx, wy, 0]
          : [wx, wy - who.lane, lpz];
      } else tgt = who.y > SB + 40 && who.x > XE ? [lpx + who.face * 46, who.y + 40, 0] : [lpx + who.face * 60, lpy + 46, lpz];   // over the drop, the lamp rests on the wall
      const want = nrm([tgt[0] - lpx, tgt[1] - lpy, tgt[2] - lpz]), dr = who.dir, k = min(1, 7 * dt);
      who.dir = nrm([dr[0] + (want[0] - dr[0]) * k, dr[1] + (want[1] - dr[1]) * k, dr[2] + (want[2] - dr[2]) * k]);
      if (D.mode === "sub" && D.ctrl && now - ptr.moved < 6 && abs(who.dir[0]) > 0.25 && abs(s.vx) < 8) s.face = Math.sign(who.dir[0]);
    }
    // camera
    cam.x += (clamp(who.x - COLS / 2 + who.face * 18, 0, WW - COLS) - cam.x) * min(1, 3 * dt);
    cam.y += (clamp(who.y - ROWS * 0.45, D.mode === "lower" ? -60 : -24, (who.x < XE - 70 ? SB : SB2) + FLOORH - ROWS) - cam.y) * min(1, 3 * dt);
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
    D.pig.x += D.pig.dir * 3 * dt; if (D.pig.x > 1940) D.pig.dir = -1; if (D.pig.x < 1880) D.pig.dir = 1;
    D.turtle.x += 11 * dt; if (D.turtle.x > 700) D.turtle.x = -60;
    D.octo.hide = lit(520, ground(520, cl(520) - 14) - 12) ? 1 : 0;
    const c = D.crab;
    if (abs(who.x - c.x) < 44 && alt < 70) { c.dir = Math.sign(c.x - who.x) || 1; c.x = clamp(c.x + c.dir * 30 * dt, 590, 750); } else c.x += sin(now * 0.9) * 4 * dt;
    const a = D.angler; a.x += (clamp(LX, 1320, 1460) - a.x) * 0.25 * dt; a.y += (clamp(LY, SB + 240, SB + 440) - a.y) * 0.25 * dt;
    for (const b of D.bubbles) { b.y += b.vy * dt; b.x += sin(now * 3 + b.vy) * 4 * dt; b.life -= dt; }
    D.bubbles = D.bubbles.filter((b) => b.life > 0 && b.y > 0);
    for (const p of D.debris) { p.life -= dt; p.vy += 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    D.debris = D.debris.filter((p) => p.life > 0);
    if (!D.ctrl) return;
    // --- the shape of the day: one thing up, then back down for the rest
    D.deepest = max(D.deepest, s.y);
    if (D.leg === 1) {
      if (who.x >= WALL - 1 && ax() > 0) { D.wallT += dt; if (D.wallT > 1.2 && D.wallN < 3) { say(["That's the edge. Not today.", "It goes down a long way. Come up first.", "I can do this all day. I am, in fact, doing this all day."][D.wallN], { id: "wall" + D.wallN, urgent: true }); D.wallN++; D.wallT = -6; } }
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
      if (actHit() && nearFloor) { D.mode = "eva"; me.x = s.x - s.face * 6; me.y = s.y + 24; me.lane = s.lane + 4; me.vx = me.vy = 0; me.face = s.face; me.dir = s.dir.slice(); knock(200, 0.3, 0.25); say("Mind the hose.", { id: "out" }); }
      else if (actHit()) say("Not here. It's a long way down to stand on nothing.", { id: "nothere" + floor(now / 10), urgent: true });
    } else if (D.mode === "eva") {
      const ds = hypot(me.x - s.x, me.y - (s.y + 12));
      if (target) {
        target.hot = 1;
        pr = `<kbd>hold space</kbd>${target.id ? "cut" : { collect: "take", read: "read", mend: "mend your cable", cutold: "cut the old line" }[target.act] || "smash"}`;
        if (!toolDown()) D.latch = false;
        if (toolDown() && !D.latch) {
          target.prog += dt; target.shake = 1;
          if (Math.random() < dt * 12) knock(target.act === "collect" ? 520 : 90 + Math.random() * 40, 0.06, 0.16);
          if (target.id && !D.thin) say("Put the cutter down, if you would. I can hear it working.", { id: "notcut2", urgent: true });
          if (target.prog >= target.dur) { finish(target); D.latch = true; }
        } else target.prog = max(0, target.prog - dt * 2);
      } else if (ds < 30) { pr = "<kbd>E</kbd>back in"; if (actHit()) { D.mode = "sub"; knock(160, 0.3, 0.25); } }
    }
    prompt(pr);
    // --- the tapping: the nearer the break and the deeper you are, the more of it there is
    { const prox = clamp(1 - abs(SPLICE - who.x) / 1500, 0, 1); tapVol = 0.02 + 0.4 * prox * prox * clamp(who.y / SB2, 0, 1); }
    const over = who.x > XE && who.y > SB + 30;                                          // past the edge and going down
    goal = D.leg === 2 ? (over ? (who.y < SB2 - 80 ? "follow the cable down" : "find the break") : "the edge") : RUN.sleeve ? "bring it up" : "follow the cable. find what is wrong";
    markAt = D.leg === 1
      ? (RUN.sleeve ? (D.mode === "eva" ? [s.x, s.y - 14] : [s.x, 26]) : [1096, ground(1096, cl(1096)) - 16])
      : !over ? [XE + 36, SB + 30] : who.y < SB2 - 70 ? [XE + 36, SB2 - 20] : [SPLICE, ground(SPLICE, cl(SPLICE)) - 18];
    // --- the voice. He says very little down here, and past the edge the radio cannot carry him.
    const near = (x, y, r = 46) => hypot(who.x - x, who.y - y) < r, nearX = (x, r = 40) => abs(who.x - x) < r && alt < 70;
    if (!D.thin) {
      for (const [x, , , line] of WORDS) if (nearX(x)) say(line, { id: "w" + x });
      for (const t of D.things) if (!t.gone && t.say && nearX(t.x, 34)) say(t.say, { id: "t" + t.kind });
      if (alt > 90 && who.y > SB - 150 && who.x < XE - 80) { D.far += dt; if (D.far > 12 && D.disob < 1) { say("You've drifted off the line. No harm done.", { id: "dis0" }); D.disob++; } } else if (D.far > 0) D.far = 0;
    }
    if (D.leg === 2 && over && !D.thin) { D.thin = true; say("Past the edge I thin out. Mostly static. Follow the line down.", { id: "thin", urgent: true, keep: true }); }
    if (D.thin && !D.ended) {
      // static, a creak from the hull, and one try at a sentence that does not make it
      if (Math.random() < dt * 0.25) tone(2200 + Math.random() * 1800, 0.05 + Math.random() * 0.12, 0.03, "sawtooth", 900);
      D.creak -= dt; if (D.creak < 0) { D.creak = 7 + Math.random() * 9; tone(48 + Math.random() * 14, 0.9, 0.16, "sawtooth", 40); }
      if (who.y > SB + DROP * 0.45) say("…-ollow the l— …n't count th— …", { id: "garble", who: "· static ·", once: true });
    }
    if (!D.ended && nearX(SPLICE, 46)) {
      D.ended = true;
      FINAL.forEach((l, i) => say(l, { id: "final" + i, gap: 1.5, flow: true, urgent: i === 0 }));
    }
    if (D.ended && !D.choice && band.done.has("final" + (FINAL.length - 1))) {
      // two things within reach: the broken ends of your cable, and his
      D.choice = now;
      D.things.push({ kind: "mend", x: SPLICE - 4, dl: 0, act: "mend", dur: 1.8, gone: false, prog: 0, hot: 0, shake: 0 }, { kind: "old", x: SPLICE + 46, dl: 0, act: "cutold", dur: 1.8, gone: false, prog: 0, hot: 0, shake: 0 });
    }
    if (D.choice) {
      goal = "mend your cable, or cut his"; markAt = [SPLICE + 20, ground(SPLICE, cl(SPLICE)) - 20];
      if (now - D.choice > 55) say("Take your time. I have.", { id: "choose" });
    }
    if (floor(now / 6) !== floor((now - dt) / 6) && who.y > 60) ping();
    if (lp) lp.frequency.value = lerp(1400, 120, clamp(who.y / (SB2 * 0.8), 0, 1));
  },
  draw() {
    const t = now, s = D.sub, me = D.me, who = D.mode === "eva" ? me : s;
    // the water: surf fades as you leave the surface, the motor follows the throttle, and the deep is slower and lower
    ambScene("dive"); amb.tgt.sea = 0.05 * max(0, 1 - max(0, who.y) / 110); amb.tgt.roar = 0.008 + 0.02 * clamp(who.y / SB2, 0, 1);
    amb.humT = D.mode === "sub" ? 0.012 + 0.03 * min(1, hypot(s.vx, s.vy) / 60) : 0.006; if (amb.hum) amb.hum.frequency.value = 40 + hypot(s.vx, s.vy) * 0.28;
    // with the GPU floor under us, both layers must sit on the same whole cell
    const cx0 = cam.x, cy0 = cam.y, G = SB - cy0 < ROWS + 30 ? gpuView() : null;
    if (G) { cam.x = Math.round(cx0); cam.y = Math.round(cy0); }
    showG(!!G); env.holes = !!G; env.holeRow = SB - 12 - cam.y;
    const dy = max(0, who.y), q = clamp(dy / SB2, 0, 1), dead = who.x > SPLICE - 300 && dy > SB2 - 120;
    const mix = (A, B, k) => A.map((v, i) => lerp(v, B[i], k));
    // one screen, one palette: teal. Fewer inks the deeper you are, and almost nothing lit but your lamp.
    // five waters on the way down: sunlit, dim, the shelf, the wall, the abyss
    env.screen = dead ? "noise" : "bayer"; env.tones = dead ? 3 : dy < 70 ? 8 : dy < 190 ? 6 : dy < SB + 60 ? 5 : 4;
    env.lit = mix([226, 245, 236], [200, 226, 224], q); env.unlit = mix(mix([11, 46, 54], [4, 19, 24], sstep(0, 0.3, q)), [2, 6, 9], sstep(0.4, 1, q));
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
    if (s.y > SB + 30 && s.x > XE) L.push({ x: s.x - cam.x, y: s.y - cam.y, z: 30, p: 1.5, k: 0.0016 });          // and, over the drop, washes the wall behind it
    for (const b of BEACONS) {
      if (abs(b.x - (cam.x + COLS / 2)) > COLS) continue;
      const ln = cl(b.x) - 16, on = b.flick ? (sin(t * 23) + sin(t * 7.3) > -0.6 ? 1 : 0.15) : 1;
      L.push({ x: b.x + 11 - cam.x, y: T(b.x) - 1.56 * SZ - cam.y, z: ln * ZK, p: 2.3 * on, k: 0.0013, dir: nrm([0.1, 1, 0.25]), c0: 0.42, c1: 0.8, red: b.red });
    }
    { const pu = tapAt(t); L.push({ x: SPLICE - cam.x, y: T(SPLICE) - 6 - cam.y, z: cl(SPLICE) * ZK + 6, p: 0.22 + 1.3 * pu, k: 0.004, red: 1 }); }       // the splice blinks what you have been hearing
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
    if (G) E.clearBelow(env.holeRow);                                                    // below the shelf's level the GPU has rock: no painted backdrop over it
    // the play plane
    layer(1, 0);
    if (!G) { fillBelow((x) => (x < XE ? SB + FLOORH : SB), 0.22, 0.12, { z: -10, n: [0, 0, 1] }); seg(XE + 3, SB + cl(XE), XE + 3, SB2 + cl(XE), 3, 0.86, { z: 2 }); }   // no GPU: a plain rock face and the hanging cable
    E.floorBand(T, dead ? 0.3 : 0.4, 0.16, { rows: FLOORH + 2 });
    if (cam.y < 40) { // the ship, seen from underneath, and its crane
      const ox = D.shipX - 40;
      // the hull from below, with the pool you were lowered through open in the middle of it
      const mx = ox + 150;
      rect(mx - 118, -38, 86, 34, 0.3, { z: 60 }); rect(mx + 118, -38, 86, 34, 0.3, { z: 60 });
      rect(mx - 112, -5, 80, 7, 0.24, { z: 60 }); rect(mx + 112, -5, 80, 7, 0.24, { z: 60 });
      for (let k = 0; k < 4; k++) dot(mx - 30 + k * 20, -3, 0, { e: 0.5, z: 61 });
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
      if (th.gone || !th.def) continue;
      const ln = cl(th.x) + th.dl, sx = th.shake ? (Math.random() - 0.5) * 1.8 : 0;
      E.lane(ln); draw(th.def, th.kind === "pod" ? { on: sin(t * 3) > 0 ? 1 : 0 } : {}, th.x + sx, ground(th.x, ln) - (th.up || 0), { size: SZ, z: 1, glow: 0.16 * th.hot * (0.6 + 0.4 * sin(t * 14)) });
    }
    // the splice: the only warm thing down here
    { const ln = cl(SPLICE), y = ground(SPLICE, ln), pu = tapAt(t); E.lane(ln); disc(SPLICE, y - 5, 6.5, 0.3, { e: 0.12 + 0.85 * pu, red: 1, round: 1 }); seg(SPLICE - 12, y - 3, SPLICE - 4, y - 4, 3.6, 0.5); }
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
    for (let x = floor(E.lx() / 130) * 130; x < E.lx() + COLS + 130 && cam.y < SB; x += 130) {
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
    cap(t.who, "gone quiet", true);
    say(t.line, { id: "cut" + t.id, urgent: true, gap: 0.4 });
    knock(70, 0.5, 0.6);
    const x = (t.x0 + t.x1) / 2, y = ground(x, bl(t, x));
    for (let i = 0; i < 16; i++) D.debris.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 30, life: 0.9 });
    return;
  }
  if (t.act === "read") {
    t.read = true; RUN.slate = true; knock(300, 0.3, 0.2);
    say("OLD CABLE UNDER OURS AT THE BOTTOM. IT IS WARM. TOLD NO ONE.", { id: "slate", who: "a diver's slate, in your handwriting", red: true });
    say("You wrote that nine years ago, when you laid this one. I watched you write it.", { id: "slater", urgent: true });
    return;
  }
  if (t.act === "mend" || t.act === "cutold") {
    // the one decision that is yours
    knock(t.act === "mend" ? 220 : 70, 0.6, 0.6);
    go("epilogue", { end: t.act === "mend" ? "mend" : "cut", salvage: RUN.salvage + D.salvage, cuts: RUN.cuts.concat(D.cuts) });
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
    else if (D.smashN === 1 && !D.thin) say(SMASH[0], { id: "smash1" });
  }
  const gy = ground(t.x, cl(t.x) + t.dl);
  for (let i = 0; i < 14; i++) D.debris.push({ x: t.x, y: gy - 5, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40, life: 0.8 });
}

// =====================================================================================
// END
// =====================================================================================
const EPI = {
  mend: [
    "You mended it.",
    "At 06:40 the cable came back. An ocean's worth of people went on with their morning, and none of them knew it had stopped.",
    "Under it, the old line is still warm. He is still there, still tapping the one word he has tapped for 168 years.",
    "A N Y O N E ?",
    "You kept the radio room. Some nights, you tap back.",
  ],
  cut: [
    "You cut the old line.",
    "The tapping stopped. It had been going for 168 years. The word was",
    "A N Y O N E ?",
    "Then you mended the other cable, because that was the job. At 06:40 the world came back and never knew.",
    "The radio on the ship has said nothing since. Bo plugged it in, to be sure.",
  ],
};
const epi = { i: 0, t: 0, end: "mend", arg: {} };
scenes.epilogue = {
  enter(arg) { Object.assign(epi, { i: 0, t: 0, end: arg.end || "mend", arg }); cam.x = cam.y = 0; goal = ""; document.body.classList.add("cine"); },
  step(dt) {
    const e = epi, L = EPI[e.end];
    document.body.classList.add("cine");
    if (e.t === 0) { const c = $("#card"); card(L[e.i], 999); c.classList.add("story"); c.classList.toggle("word", L[e.i].startsWith("A N Y")); }
    e.t += dt;
    if (e.t > 3.2 + L[e.i].length * 0.055 || (e.t > 1 && (actHit() || anyTap || hit.has("Space")))) {
      e.i++; e.t = 0;
      if (e.i >= L.length) { e.i = L.length - 1; e.t = 99; $("#card").classList.remove("on", "story", "word"); cardT = 0; go("end", e.arg); }
    }
  },
  draw() {
    const t = now, e = epi, alive = e.end === "mend", on = alive && tapAt(t), CY = (x) => 176 + sin(x * 0.02) * 4;
    ambScene("end"); tapVol = alive ? 0.22 : 0;
    env.holes = false; env.tones = 4; env.screen = "bayer"; env.lit = [200, 226, 224]; env.unlit = [2, 6, 9]; env.amb = 0.05; env.ambRow = null; env.sun = { d: [0, -0.96, 0.28], p: 0.1 };
    env.outline = "light"; env.haloMin = 0.085; env.cut = 0.02; env.fog = 0; env.bg = () => 0;
    env.lights = [{ x: 150, y: CY(150) - 30, z: 30, p: 1.6, k: 0.0016 }];
    if (alive) env.lights.push({ x: 268, y: CY(268) - 3, z: 8, p: 0.2 + 1.2 * on, k: 0.004, red: 1 });
    E.clear(); layer(1, 0);
    for (let n = 0; n < 110; n++) dot(hash(n, 11) * COLS, (hash(n, 12) * ROWS + t * (1 + hash(n, 13) * 3)) % ROWS, 0, { e: 0.18 });
    fillBelow((x) => CY(x) + 6, 0.36, 0.16, { z: -20 });
    for (let x = 0; x < COLS; x += 6) seg(x, CY(x), x + 6.5, CY(x + 6), 3, 0.86, { z: -6 });                        // yours: whole again
    for (let x = 180; x < 340; x += 6) { if (!alive && abs(x - 264) < 10) continue; seg(x, CY(x) + 9 + (x - 180) * 0.03, x + 6.5, CY(x + 6) + 9 + (x - 174) * 0.03, 1.6, 0.45, { z: -4 }); }   // his, under it
    if (alive) disc(268, CY(268) + 10, 4.5, 0.3, { e: 0.14 + 0.85 * on, red: 1, round: 1 });
  },
};
scenes.end = {
  enter({ salvage = 0, cuts = [], end = "mend" }) {
    cam.x = 0; cam.y = 0; this.alive = end === "mend";
    // the bill: what you chose, and what you switched off on the way
    const quiet = cuts.length ? `on the way down you also cut ${cuts.length} working cable${cuts.length > 1 ? "s" : ""}. gone quiet:\n` + cuts.map((c) => "<small>" + c + "</small>").join("\n") : "you cut nothing that was working. he noticed.";
    card(`<b>SLACK</b>${this.alive ? "you mended the cable. he is still on the line." : "you cut the old line. he has stopped asking."}\n\n${quiet}\n\nR · play again, and choose the other way`, 9999);
    goal = "";
  },
  step() { if (hit.has("KeyR")) location.reload(); },
  draw() {
    const t = now;
    ambScene("end"); amb.humT = 0;
    env.holes = false; env.tones = 2; env.screen = "noise"; env.lit = [216, 210, 196]; env.unlit = [4, 4, 4]; env.amb = 0; env.ambRow = null; env.sun = null; env.lights = []; env.outline = null; env.cut = 0.03; env.fog = 0; env.bg = () => 0;
    E.clear(); layer(1, 0);
    for (let n = 0; n < 120; n++) dot(hash(n, 11) * COLS, (hash(n, 12) * ROWS + t * (1 + hash(n, 13) * 3)) % ROWS, 0, { e: 0.25 });
    for (let x = 0; x < COLS; x += 6) seg(x, 209 + sin(x * 0.02) * 2, x + 6.5, 209 + sin((x + 6) * 0.02) * 2, 1.6, 0, { e: 0.3 });
    tapVol = this.alive ? 0.24 : 0;
    if (this.alive) disc(COLS / 2, 208, tapAt(t) ? 4 : 2.2, 0, { e: tapAt(t) ? 1 : 0.25, red: 1 });
  },
};

// =====================================================================================
// HOME — before any of it: your desk, a wet night, and a phone that will not stop
// =====================================================================================
const HF = 168, FLN = [0, -0.85, 0.52];
// a skyline for a window or a windscreen: x and j in cells, `base` the row the towers stand on
const skyline = (x, j, base, tall) => {
  const bx = floor(x / 14), top = base - 14 - hash(bx, 5) * tall, lx = ((x % 14) + 14) % 14;
  if (j < top || j > base || lx > 11) return 0.1 + 0.07 * (j / base);
  return lx % 4 < 2 && (j - floor(top)) % 6 < 3 && hash(bx * 7 + floor(lx / 4), floor((j - top) / 6)) > 0.6 ? 0.62 : 0.035;
};
const home = { st: 0, s: { i: 0 }, ringAt: 0, ring: false, bag: false };
const OFFICE = [ /*OFFICE*/
  { id: "o0", who: "the office", text: "It's the office. Sorry about the hour." },
  { id: "o1", who: "the office", text: "The Atlantic cable went dead at 03:12. The one you laid. The repair ship wants a diver." },
  { id: "o2", who: "the office", text: "They asked for you. By name. I said you'd retired. They said you'd say that." },
  { id: "o3", who: "the office", text: "There's a car outside. Bring your bag." },
/*OFFICE*/ ];
scenes.home = {
  enter() {
    Object.assign(home, { st: 0, s: { i: 0 }, ring: false, bag: false });
    you.plain = true; you.x = 70; you.face = 1; you.sit = false; cam.x = 0; cam.y = 0;
    if (seaGain) seaGain.gain.value = 0.04;                                      // rain on the glass
    if (lp) lp.frequency.value = 1500;
  },
  step(dt) {
    const h = home;
    walk(dt, 30, 358, false);
    if (h.st === 0 && sceneT > 3.2) { h.st = 1; h.ringAt = now; }
    h.ring = false;
    if (h.st === 1) {                                                            // two rings, a breath, two rings
      const u = (now - h.ringAt) % 3.2;
      h.ring = u < 0.5 || (u > 0.75 && u < 1.25);
      if (h.ring && floor(now * 24) !== floor((now - dt) * 24)) tone(floor(now * 24) % 2 ? 1320 : 1080, 0.035, 0.08, "square", 1000);
    }
    goal = ["", "answer the phone", "listen", "take your bag", "the car is waiting"][h.st];
    markAt = [null, [246, HF - 50], null, [318, HF - 26], [366, HF - 64]][h.st];
    if (h.st === 2 && tell(h.s, OFFICE)) { h.st = 3; knock(240, 0.08, 0.2); }
    const list = [
      { x: 110, r: 24, label: "the window", act: () => say("Rain. A red light on a mast, a long way off, blinking.", { id: "win" + floor(now / 9), who: "the window" }) },
      { x: 176, r: 12, label: "the helmet", act: () => say("Yours. You said you were done with it.", { id: "helm" + floor(now / 9), who: "the shelf" }) },
      { x: 246, r: 16, label: h.st === 1 ? "answer" : "the phone", act: () => {
        if (h.st === 1) { h.st = 2; knock(300, 0.08, 0.2); }
        else say(h.st < 1 ? "It isn't ringing. Yet." : "The line is dead now.", { id: "ph" + floor(now / 8), who: "the phone" });
      } },
      { x: 318, r: 14, label: "your bag", act: () => {
        if (h.st >= 3) { h.bag = true; h.st = 4; knock(120, 0.2, 0.3); }
        else say("Packed. It has been packed for a year.", { id: "bag" + floor(now / 9), who: "your bag" });
      } },
      { x: 366, r: 14, label: "the door", act: () => {
        if (h.st === 4) { knock(140, 0.25, 0.3); go("trip"); }
        else say(h.st === 1 ? "The phone is ringing." : h.st === 3 ? "Not without the bag." : "Nowhere to be. Not yet.", { id: "door" + h.st + floor(now / 9), who: "the door" });
      } },
    ].filter((o) => !(o.label === "your bag" && h.bag));
    const n = nearest(list, you.x);
    prompt(n ? `<kbd>E</kbd>${n.label}` : h.st <= 1 && sceneT > 1.5 ? (TOUCH ? "the stick walks" : "<kbd>A</kbd><kbd>D</kbd>walk") : null);
    if (n && actHit()) n.act();
  },
  draw() {
    const t = now, h = home;
    tapVol = 0; ambScene("home");
    env.holes = false; env.tones = 8; env.screen = "bayer"; env.lit = [246, 228, 198]; env.unlit = [12, 11, 17]; env.amb = 0.11; env.ambRow = null; env.sun = null;
    env.outline = "light"; env.haloMin = 0.17; env.cut = 0; env.fog = 0;
    env.lights = [{ x: 268, y: HF - 46, z: 16, p: 2.5, k: 0.0011 }, { x: 110, y: 76, z: 34, p: 0.9, k: 0.0011 }, { x: you.x, y: HF - 22, z: 36, p: 0.4, k: 0.004 }];
    // the city through the window: towers, a few lit rooms
    env.bg = (i, j) => skyline(i + 300, j, 112, 52);
    E.clear();
    layer(1, -40);
    rect(192, 75, 192, 75, 0.44);
    for (let x = 6; x < COLS; x += 16) rect(x, 75, 0.5, 75, 0.39, { z: 0.1 });
    rect(192, 148, 192, 2, 0.3, { z: 0.3 });
    rect(192, 183, 192, 33, 0.4, { n: FLN });
    for (let y = 158; y < ROWS; y += 10) rect(192, y, 192, 0.5, 0.33, { z: 0.1, n: FLN });
    // the window: glass onto the city, a far red light, rain running down it
    rect(110, 74, 54, 40, 0.7, { z: 1 }); rect(110, 74, 50, 36, 0, { z: 1.5 });
    disc(134, 51, 1.3, 0.9, { e: sin(t * 2.6) > 0.2 ? 1 : 0.05, red: 1, z: 1.6 });
    for (let n = 0; n < 46; n++) { const x = 61 + hash(n, 81) * 98, y = 39 + ((hash(n, 82) * 70 + t * (60 + hash(n, 83) * 50)) % 70); dot(x, y, 0, { e: 0.32, z: 1.7 }); dot(x, y + 1, 0, { e: 0.2, z: 1.7 }); }
    rect(110, 74, 0.8, 36, 0.7, { z: 2 }); rect(110, 74, 50, 0.8, 0.7, { z: 2 }); rect(110, 112, 56, 2, 0.76, { z: 2.2 });
    // a shelf with the helmet you kept, a picture, the door
    rect(180, 98, 24, 1.5, 0.6, { z: 2 });
    rect(300, 70, 14, 11, 0.3, { z: 1 }); rect(300, 70, 12, 9, 0.8, { z: 1.2 }); rect(300, 73, 9, 2, 0.3, { z: 1.3 }); rect(298, 68, 1, 3, 0.3, { z: 1.3 });
    rect(366, 112, 15, 38, 0.64, { z: 1 }); rect(366, 114, 12, 36, 0.3, { z: 1.4 }); disc(358, 120, 1.2, 0.9, { z: 1.7 });
    shade(254, HF, 22, 0.25, FLN); shade(210, HF + 1, 8, 0.25, FLN); shade(you.x - (you.x - 268) * 0.05, HF + 6, 8, 0.25, FLN);
    // a bed you have not been sleeping in
    rect(48, HF - 9, 36, 7, 0.5, { z: 6, n: FLN }); rect(48, HF - 1, 36, 3, 0.3, { z: 6 }); disc(22, HF - 16, 6, 0.8, { z: 7, round: 1 });
    layer(1, 0);
    draw(F.helmet, {}, 180, 97, { size: 22, z: -32 });
    draw(F.chair, {}, 210, HF - 3, { size: 26, z: -8 });
    draw(F.desk, {}, 254, HF - 5, { size: 26, z: -6 });
    draw(F.phone, { ring: h.ring ? 1 : 0, off: h.st === 2 ? 1 : 0 }, 246 + (h.ring ? sin(t * 60) * 0.7 : 0), HF - 25, { size: 26, z: 0 });
    draw(F.mug, {}, 232, HF - 25, { size: 22, z: 0 });
    seg(270, HF - 25, 268, HF - 42, 1.6, 0.5, { z: -2 }); draw(F.lampShade, {}, 268, HF - 44, { size: 18, z: 0 });
    if (!h.bag) draw(F.bag, {}, 318, HF + 2, { size: 26, z: 6 });
    draw(F.diver, youPose(), you.x, HF + 4, { size: 26, z: 14, flip: you.face < 0 });
    if (h.bag) draw(F.bag, {}, you.x - you.face * 10, HF + 4, { size: 20, z: 12 });
    layer(1.3, 90);
    rect(-8, 108, 20, 108, 0.14); disc(468, ROWS + 6, 28, 0.18, { round: 1 });
  },
};

// =====================================================================================
// TRIP — the title, and how you get from a desk to the middle of an ocean
// =====================================================================================
const TRIP = [{ dur: 8.5, card: "23:40 · to the airport" }, { dur: 7, card: "01:15 · north, then west" }, { dur: 9.5, card: "over the atlantic · 03:12" }, { dur: 9.5, card: "04:50 · cable ship <i>patience</i>" }];
const trip = { v: 0, t: 0, carded: -1 };
// the night sea, with fog lying on it: shared by the boat and the deck
const nightSea = (H0, t) => (i, j) => {
  const fogb = 0.07 * (0.5 + 0.5 * sin(i * 0.021 + t * 0.12 + sin(j * 0.21) * 1.3)) * Math.exp(-(((j - H0) / 24) ** 2));
  if (j < H0) return 0.03 + 0.05 * (j / H0) ** 3 + fogb + (hash(i + floor(cam.x * 0.05), j) > 0.9986 && j < H0 - 16 ? 0.5 : 0);
  return 0.028 + 0.03 * sin(i * 0.09 + j * 0.7 + t * 1.6) * sin(j * 0.35 - t * 0.9) + fogb;
};
const rain = (t, n = 54) => { layer(1.2, 120); for (let k = 0; k < n; k++) { const x = ((hash(k, 71) * 460 - t * 30 - E.lx()) % 460 + 460) % 460 - 30 + E.lx(), y = (hash(k, 72) * ROWS + t * (170 + hash(k, 73) * 60)) % ROWS; seg(x, y, x - 3, y + 7, 1, 0, { e: 0.13, flat: 1 }); } };
scenes.trip = {
  enter() { Object.assign(trip, { v: 0, t: 0, carded: -1 }); cam.x = cam.y = 0; you.plain = true; goal = ""; document.body.classList.add("cine"); card("<b>SLACK</b>", 3.4); if (seaGain) seaGain.gain.value = 0.05; },
  step(dt) {
    const tr = trip; tr.t += dt;
    document.body.classList.add("cine");
    if (tr.carded !== tr.v && tr.t > (tr.v === 0 ? 4.4 : 0.7)) { tr.carded = tr.v; card(TRIP[tr.v].card, 3.4, true); }
    if (tr.v === 2 && tr.t > 4.8 && tr.t - dt <= 4.8) tone(60, 0.8, 0.2, "sawtooth", 40);         // 03:12: every light in the cabin goes out
    if (tr.t > TRIP[tr.v].dur || (tr.t > 1.2 && (actHit() || anyTap))) {
      tr.v++; tr.t = 0;
      if (tr.v >= TRIP.length) { tr.v = TRIP.length - 1; tr.t = 99; go("deck", { intro: true }); }
      else { fade = 1; fadeTo = 0; $("#card").classList.remove("on"); cardT = 0; }
    }
  },
  draw() {
    const t = now, tr = trip, vt = min(tr.t, 20), FN = [0, -0.86, 0.5];
    env.holes = false; env.tones = 8; env.screen = "bayer"; env.lit = [236, 232, 220]; env.unlit = [8, 11, 18]; env.amb = 0.09; env.ambRow = null; env.sun = null;
    env.outline = "light"; env.haloMin = 0.14; env.cut = 0.015; env.fog = 0; env.lights = [];
    tapVol = tr.v === 2 ? 0.16 : 0; ambScene(["taxi", "takeoff", "flight", "boat"][tr.v]);
    if (tr.v === 1) amb.tgt.roar = 0.05 + 0.02 * vt;
    E.clear();
    if (tr.v === 0) {
      // a taxi through the rain: street lamps come and go, the city slides by behind
      env.bg = (i, j) => (j > 152 ? 0.03 : skyline(i + floor(t * 10), j, 152, 96));
      layer(1, -40);
      rect(192, 186, 192, 30, 0.3, { n: FN }); rect(192, 154, 192, 2, 0.5, { n: FN, z: 0.2 });
      for (let k = 0; k < 8; k++) rect(((k * 64 - t * 170) % 448 + 448) % 448 - 32, 192, 9, 1, 0.8, { n: FN, z: 0.2 });
      for (let k = 0; k < 3; k++) {
        const x = ((k * 190 - t * 170) % 570 + 570) % 570 - 90;
        draw(F.beacon, { on: 1 }, x, 158, { size: 30, z: 6 });
        env.lights.push({ x: x + 15, y: 108, z: -22, p: 2.6, k: 0.001, dir: nrm3(0, 1, -0.25), c0: 0.3, c1: 0.78 });
      }
      env.lights.push({ x: 216, y: 164, z: -30, p: 2.2, k: 0.0013, dir: nrm3(1, 0.4, -0.1), c0: 0.72, c1: 0.92 }, { x: 170, y: 150, z: 20, p: 0.5, k: 0.003 });
      shade(170, 182, 30, 0.18, FN);
      draw(F.taxi, { f: floor(t * 16) % 4 }, 170, 180 + sin(t * 9) * 0.5, { size: 30, z: 40 });
      rain(t);
    } else if (tr.v === 1) {
      // the runway lights stretch, and then there is no runway
      const run = 70 * vt + 34 * vt * vt, lift = max(0, vt - 3.4) ** 2 * 7, px = 150 + vt * 6;
      env.bg = (i, j) => (j < 150 ? 0.04 + 0.07 * (j / 150) ** 2 + (hash(i + floor(run * 0.02), j) > 0.9985 && j < 120 ? 0.5 : 0) : 0.03);
      layer(0.2, -200);
      for (let k = 0; k < 6; k++) { const x = ((k * 90 - run * 0.2) % 540 + 540) % 540 - 60 + E.lx(); rect(x, 138, 26, 12, 0.16); for (let w = -20; w <= 20; w += 8) dot(x + w, 134, 0, { e: 0.5, z: 1 }); }
      layer(1, -40);
      rect(192, 186, 192, 30, 0.26, { n: FN });
      for (let k = 0; k < 12; k++) { const x = ((k * 40 - run) % 480 + 480) % 480 - 48; dot(x, 158, 0, { e: 0.9, z: 1 }); dot(x + 1, 158, 0, { e: 0.9, z: 1 }); rect(x, 196, 7, 0.8, 0.75, { n: FN, z: 0.2 }); }
      env.lights.push({ x: px, y: 140 - lift, z: 30, p: 1.3, k: 0.002 });
      if (lift < 30) shade(px, 178, 34 - lift * 0.6, 0.16, FN);
      draw(F.plane, { lights: 1, blink: sin(t * 7) > 0 ? 1 : 0, gear: lift < 26 ? 1 : 0 }, px, 176 - lift, { size: 30, z: 40 });
    } else if (tr.v === 2) {
      // above the weather. At 03:12 the cabin goes dark, and one light on the wing keeps time.
      env.sun = { d: nrm3(0.5, -0.62, 0.6), p: 0.34 };
      env.bg = (i, j) => 0.05 + 0.06 * (j / ROWS) + (hash(i, j) > 0.9982 && j < 130 ? 0.55 : 0);
      layer(0.02, -300); disc(306 + E.lx(), 40, 13, 0, { e: 0.9 }); disc(301 + E.lx(), 37, 11.5, 0, { e: 0.0 });
      for (const [par, y, s, sp] of [[0.3, 176, 1, 6], [0.6, 196, 1.5, 14], [1, 214, 2.1, 30]]) {
        layer(par, -200 + par * 150);
        for (let k = 0; k < 9; k++) { const x = ((k * 62 * s - t * sp) % (558 * s) + 558 * s) % (558 * s) - 70 + E.lx(); disc(x, y, 15 * s, 0.9, { round: 1 }); disc(x + 17 * s, y + 4, 11 * s, 0.9, { round: 1 }); }
      }
      layer(1, 0);
      env.lights.push({ x: 190, y: 84, z: 40, p: 0.5, k: 0.002 });
      draw(F.plane, { lights: vt < 4.8 ? 1 : 0, blink: tapAt(t) }, 190, 118 + sin(t * 0.8) * 3, { size: 26, z: 0 });
    } else {
      // the last of it by boat: fog, a lantern, and lights that turn out to be a ship
      const H0 = 150, bob = sin(t * 1.3) * 1.5, sx = lerp(470, 262, sstep(0, 9.5, vt));
      env.bg = nightSea(H0, t);
      layer(1, -60);
      rect(sx + 70, H0 - 9, 76, 9, 0.2); rect(sx + 110, H0 - 26, 24, 9, 0.24); rect(sx + 36, H0 - 44, 1.5, 28, 0.3); seg(sx + 36, H0 - 40, sx + 86, H0 - 28, 2, 0.26);
      for (let k = 0; k < 6; k++) dot(sx + 12 + k * 22, H0 - 9, 0, { e: 0.8, z: 1 });
      disc(sx + 112, H0 - 27, 1.6, 0, { e: 0.9, z: 1 }); disc(sx + 36, H0 - 59, 1.4, 0.9, { e: sin(t * 2.2) > 0 ? 1 : 0.08, red: 1, z: 1 });
      layer(1, 0);
      env.lights.push({ x: 174, y: H0 - 22 + bob, z: 20, p: 1.5, k: 0.0022 });
      draw(F.launch, {}, 150, H0 + 10 + bob, { size: 28, z: 0 });
      draw(F.diver, { m: "sit", f: 0, p: 1 }, 158, H0 + bob - 2, { size: 20, z: 3 });
      for (let k = 0; k < 14; k++) dot(118 - k * 5 - ((t * 20) % 5), H0 + 12 + sin(k + t * 3) * 1.5, 0, { e: 0.35 - k * 0.02 });
      rain(t);
    }
  },
};

// =====================================================================================
// BAY — under the radio room: the moon pool, the lockers, the submarine on its chains
// =====================================================================================
const BF = 170;
const bay = { low: 0, t: 0, n: 0, spl: false, drops: [] };
scenes.bay = {
  enter() {
    Object.assign(bay, { low: 0, t: 0, spl: false, drops: [] });
    you.x = 40; you.face = 1; you.sit = false; cam.x = cam.y = 0;
    if (seaGain) seaGain.gain.value = 0.03;
    if (lp) lp.frequency.value = 900;
  },
  step(dt) {
    const b = bay;
    for (const p of b.drops) { p.life -= dt; p.vy += 90 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    b.drops = b.drops.filter((p) => p.life > 0);
    if (b.low) {                                                                 // the winch: a warning tone, the chains pay out, the water closes over the dome
      b.t += dt; markAt = null; prompt(null);
      if (floor(b.t * 2) !== floor((b.t - dt) * 2)) tone(660, 0.14, 0.07, "square", 640);
      if (!b.spl && b.t > 3.1) { b.spl = true; knock(60, 0.8, 0.6); for (let i = 0; i < 46; i++) b.drops.push({ x: 290 + (Math.random() - 0.5) * 70, y: BF + 6, vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 70, life: 1.1 }); }
      if (b.t > 6.6) go("dive");
      return;
    }
    walk(dt, 26, 238, false);
    goal = you.plain ? "suit up" : "the submarine";
    markAt = you.plain ? [100, BF - 58] : [252, BF - 54];
    const list = [
      { x: 30, r: 13, label: "back up", act: () => go("room", { at: 332 }) },
      { x: 100, r: 22, label: you.plain ? "your locker" : "the lockers", act: () => {
        if (you.plain) { you.plain = false; knock(160, 0.3, 0.3); say("The fourth locker. Your name, on tape gone yellow.", { id: "locker", who: "the lockers", red: true }); }
        else say("Three other names. You don't know any of them. You think.", { id: "lock2" + floor(now / 9), who: "the lockers" });
      } },
      { x: 180, r: 20, label: "talk to Bo", act: () => { say(["He'll want you in the water before the light changes.", "I lower it. I don't ask what comes back up.", "You laid that cable, nine years back. He's talked about you ever since."][b.n % 3], { id: "bay" + b.n, who: "bo" }); b.n++; } },
      { x: 250, r: 20, label: "climb in", act: () => {
        if (you.plain) say("Not in that coat.", { id: "coat" + floor(now / 8), who: "bo" });
        else { b.low = 1; b.t = 0; document.body.classList.add("cine"); knock(90, 0.4, 0.4); }
      } },
    ];
    const n = nearest(list, you.x);
    prompt(n ? `<kbd>E</kbd>${n.label}` : null);
    if (n && actHit()) n.act();
  },
  draw() {
    const t = now, b = bay, drop = b.low ? sstep(1.0, 6.2, b.t) * 70 : 0, alarm = b.low && sin(b.t * 6.3) > 0;
    tapVol = 0.07; ambScene("bay"); amb.tgt.roar = b.low ? 0.07 : 0.02;
    env.holes = false; env.tones = 8; env.screen = "bayer"; env.lit = [222, 233, 238]; env.unlit = [8, 12, 17]; env.amb = 0.15; env.ambRow = null; env.sun = null;
    env.outline = "light"; env.haloMin = 0.15; env.cut = 0; env.fog = 0; env.bg = () => 0;
    env.lights = [{ x: 108, y: 44, z: -6, p: 3.2, k: 0.0008, dir: nrm3(0, 1, -0.2), c0: 0.05, c1: 0.7 }, { x: 222, y: 40, z: -6, p: 3.0, k: 0.0008, dir: nrm3(0.15, 1, -0.2), c0: 0.05, c1: 0.7 }, { x: 300, y: 70, z: 30, p: 1.1, k: 0.0016 }];
    if (alarm) env.lights.push({ x: 206, y: 52, z: -24, p: 2.6, k: 0.0012, red: 1 });
    if (!b.low) env.lights.push({ x: you.x, y: BF - 20, z: 34, p: 0.3, k: 0.004 });
    E.clear();
    layer(1, -40);
    // steel: a ribbed wall, a pipe, the rail the winch runs on
    rect(192, 86, 192, 86, 0.42);
    for (let x = 10; x < COLS; x += 34) { rect(x, 86, 2, 86, 0.52, { z: 0.3 }); rect(x + 2.5, 86, 0.5, 86, 0.28, { z: 0.3 }); }
    seg(0, 62, COLS, 62, 3.5, 0.5, { z: 0.6 }); rect(192, 169, 192, 1.5, 0.26, { z: 0.4 });
    rect(192, 13, 192, 2.5, 0.56, { z: 2 }); rect(288, 18, 12, 4, 0.62, { z: 2.4 });
    disc(206, 44, 3.2, 0.5, { z: 1 }); disc(206, 44, 2, 0.9, { z: 1.3, red: 1, e: alarm ? 1 : 0.12 });
    // the deck plates, the hazard edge, the pool
    rect(110, BF + 23, 110, 23, 0.4, { n: FLN });
    for (let x = 0; x < 220; x += 14) rect(x, BF + 23, 0.5, 23, 0.3, { z: 0.1, n: FLN });
    for (let y = BF + 2; y < ROWS; y += 5) rect(110, y, 110, 0.4, 0.33, { z: 0.1, n: FLN });
    for (let k = 0; k < 9; k++) rect(221, BF + 3 + k * 5.2, 3, 1.4, k % 2 ? 0.86 : 0.1, { z: 0.3, n: FLN });
    rect(304, BF + 23, 80, 23, 0.07, { z: 0.2 });
    for (let k = 0; k < 26; k++) { const x = 228 + hash(k, 91) * 150, y = BF + 3 + hash(k, 92) * 40; if (sin(t * 1.4 + k * 2.1 + (b.low ? b.t * 3 : 0)) > 0.55) { dot(x, y, 0, { e: 0.4, z: 0.4 }); dot(x + 1, y, 0, { e: 0.3, z: 0.4 }); } }
    // four lockers. The fourth has your name on it.
    for (let k = 0; k < 4; k++) {
      const x = 76 + k * 16;
      rect(x, BF - 30, 7, 26, 0.56, { z: 2 }); rect(x, BF - 30, 6, 25, 0.48, { z: 2.2 });
      for (let v = 0; v < 3; v++) rect(x, BF - 50 + v * 2.5, 3.5, 0.5, 0.18, { z: 2.4 });
      disc(x + 4, BF - 30, 0.8, 0.9, { z: 2.5 });
      rect(x, BF - 40, 4, 1.4, k === 3 ? 0.95 : 0.7, { z: 2.5 });
    }
    rect(100, BF - 2, 30, 1.5, 0.5, { z: 3 });
    seg(24, BF + 4, 24, 0, 2, 0.7, { z: 4 }); seg(38, BF + 4, 38, 0, 2, 0.7, { z: 4 });
    for (let y = 8; y < BF; y += 12) seg(24, y, 38, y, 1.6, 0.62, { z: 4 });
    shade(100, BF + 2, 30, 0.24, FLN); shade(180, BF + 6, 9, 0.24, FLN); if (!b.low) shade(you.x, BF + 10, 8, 0.24, FLN);
    layer(1, 0);
    draw(F.lampShade, {}, 108, 40, { size: 22, z: -20 }); draw(F.lampShade, {}, 222, 36, { size: 22, z: -20 });
    seg(108, 30, 108, 14, 1, 0.3, { flat: 1, z: -20 }); seg(222, 26, 222, 14, 1, 0.3, { flat: 1, z: -20 });
    // the submarine on its chains, over the pool
    const sy = BF - 16 + drop;
    seg(276, 20, 276, sy - 29, 1.4, 0.6, { z: -8 }); seg(300, 20, 300, sy - 29, 1.4, 0.6, { z: -8 });
    draw(F.sub, { f: b.low ? floor(b.t * 3) % 4 : 0, lit: b.low ? 1 : 0 }, 288, sy, { size: 24, z: -4 });
    rect(304, BF + 30, 80, 17, 0.07, { z: 20 });                                  // the water in front: what goes under it is gone
    rect(304, BF + 13, 80, 0.6, 0.5, { z: 21 });
    for (const p of b.drops) dot(p.x, p.y, 0, { e: 0.7, z: 30 });
    draw(F.bo, { f: floor(t * 6) % 8 }, 180, BF + 5, { size: 26, z: 26, flip: you.x < 180 });
    rect(202, BF - 8, 5, 8, 0.5, { z: 20 }); disc(202, BF - 13, 1, 0.9, { e: 0.9, z: 21 });
    if (!b.low) draw(F.diver, youPose(), you.x, BF + 9, { size: 26, z: 30, flip: you.face < 0 });
    layer(1.3, 90);
    seg(-10, 30, 500, 22, 5, 0.14); rect(505, 108, 10, 108, 0.14);
  },
};

// ---------- loop ----------
const env = { tones: 8, screen: "bayer", lit: [255, 255, 255], unlit: [0, 0, 0], amb: 0.3, bg: () => 0, lights: [] };
let last = 0, started = false;
function hud() {
  const g = $("#gauge");
  if (scene === scenes.dive) {
    const who = D.mode === "eva" ? D.me : D.sub, m = max(0, Math.round(who.y * M_PER)), bottom = Math.round((SB2 + 30) * M_PER);
    $("#hud").innerHTML = `<b>${D.mode === "eva" ? "on the hose" : "submarine"}</b>${goal ? ` · <em>${goal}</em>` : ""}`;
    $("#salv").textContent = `salvage ${RUN.salvage + D.salvage}/2 · gone quiet ${RUN.cuts.length + D.quiet}`;
    g.classList.add("on");
    g.querySelector("i").style.top = clamp(m / bottom, 0, 1) * 100 + "%";
    g.querySelector("i").dataset.m = m.toLocaleString("en") + " m";
    if (floor(now * 2) !== floor(now * 2 - 0.04)) document.title = "SLACK · " + m + " m";
  } else { g.classList.remove("on"); { const where = scene === scenes.deck ? "<b>cable ship patience</b> · deck" : scene === scenes.room ? "<b>cable ship patience</b> · radio room" : scene === scenes.bay ? "<b>cable ship patience</b> · the pool" : scene === scenes.home ? "<b>home</b> · 23:10" : "";
      $("#hud").innerHTML = where + (goal ? `${where ? " · " : ""}<em>${goal}</em>` : ""); } $("#salv").textContent = ""; }
}
function tick(dt) {
  if (started && scene) {
    now += dt; sceneT += dt;
    const eHit = hit.has("KeyE") || hit.has("Enter"), had = !!lastPrompt;
    if (!pending) scene.step(dt);
    if (eHit && !pending) (had ? sfx.use : sfx.nope)();
    pump(); tapTick(); ambTick(dt);
    if (fade !== fadeTo) { fade = fadeTo > fade ? min(fadeTo, fade + dt * 2.2) : max(fadeTo, fade - dt * 1.6); $("#fade").style.opacity = fade; }
    if (pending && fade >= 1) { const p = pending; pending = null; enter(p.name, p.arg); fadeTo = 0; }
    if (cardT && now > cardT) { $("#card").classList.remove("on"); cardT = 0; }
    scene.draw(); E.render(env, px); ctx.putImageData(img, 0, 0); hud(); placeMark(); capTick();
  }
  hit.clear(); anyTap = false;
}
function frame(ts) {
  const dt = min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  if (!window.__hold) tick(dt);
  requestAnimationFrame(frame);
}
// debug: step the game by hand. __slack.run(seconds, [held key codes], [pressed once])
window.__slack = { D, RUN, you, room, deck, home, trip, bay, go, keys, hit, ptr, amb, audio: startAudio, run(sec, held = [], press = []) {
  window.__hold = true; held.forEach((k) => keys.add(k)); press.forEach((k) => hit.add(k));
  for (let t = 0; t < sec; t += 1 / 30) tick(1 / 30);
  held.forEach((k) => keys.delete(k)); return { scene: Object.keys(scenes).find((k) => scenes[k] === scene), now: +now.toFixed(1), say: band.cur && band.cur.text };
} };
const DEV = { Digit0: ["home", {}], Digit9: ["bay", {}], Digit1: ["deck", {}], Digit2: ["room", {}], Digit3: ["dive", {}], Digit4: ["dive", { x: 480, y: SB - 20 }], Digit5: ["dive", { x: 1090, y: SB - 20 }], Digit6: ["dive", { x: 1300, y: SB + 200 }] };
addEventListener("keydown", (e) => { if (started && DEV[e.code] && e.shiftKey) go(...DEV[e.code]); });
function begin(name, arg) { started = true; $("#go").classList.add("off"); $("#fade").style.opacity = 1; enter(name, arg); fadeTo = 0; }
// three stages: a click for sound (as Fish asks), the cold open, then the title waits for you
let stage_ = "wait";
$("#go").addEventListener("click", () => {
  if (stage_ === "wait") { startAudio(); $("#go").classList.add("off"); stage_ = "play"; begin("home"); }
});
// a direct link skips the title, so sound starts on the first key or click instead
for (const ev of ["keydown", "pointerdown"]) addEventListener(ev, () => startAudio(), { once: true });
if (qs.get("leg") === "2") Object.assign(RUN, { leg: 2, sleeve: true, salvage: 1 });   // jump to the second half
if (qs.has("s")) you.plain = ["home", "trip", "deck", "room", "bay"].includes(qs.get("s")) && qs.get("leg") !== "2";   // dev starts: dressed for where you land
if (qs.has("s")) begin(qs.get("s"), qs.has("x") ? { x: +qs.get("x"), y: +qs.get("y") } : qs.has("at") ? { at: +qs.get("at") } : {});
else $("#go").classList.add("wait");
requestAnimationFrame((ts) => { last = ts; frame(ts); });
