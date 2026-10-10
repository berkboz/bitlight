#!/usr/bin/env node
// Package smoke test: node import, bounds, types, browser bundle, React, registry.
import { build } from "esbuild";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../serve.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log("  ok  " + msg); };

// 1 · node import + figure contracts
const api = await import("../src/index.js");
const files = fs.readdirSync(path.join(root, "src/figures")).filter((f) => /^[a-z-]+\.js$/.test(f) && f !== "index.js");
const figs = Object.values(api).filter((v) => v && typeof v === "object" && typeof v.sdf === "function");
ok(figs.length === files.length, `node import exposes all ${files.length} figures (got ${figs.length})`);
for (const f of figs) {
  const contract = f.name && f.means && f.bound?.length === 4 && f.rest?.length === 3;
  // bound must enclose the object: points on a slightly larger sphere are outside it
  const [bx, by, bz, br] = f.bound;
  let leak = 0;
  for (let k = 0; k < 400; k++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = br * 1.02;
    if (f.sdf(bx + R * s * Math.cos(a), by + R * u, bz + R * s * Math.sin(a)) < -0.002) leak++;
  }
  ok(contract && leak === 0, `${f.name}: contract complete, bound encloses the object${leak ? ` (${leak} points poke out)` : ""}`);
}

// 1b · screens: ordered threshold maps, all 8×8, all in (0, 1)
const names = Object.keys(api.SCREENS);
ok(names.length === 6 && names.every((n) => api.SCREENS[n].length === 64 && api.SCREENS[n].every((v) => v > 0 && v < 1)), `${names.length} screens, each 8×8 with thresholds in (0, 1)`);
ok(new Set(names.map((n) => Array.from(api.SCREENS[n]).join())).size === names.length, "every screen is different");
for (const n of ["dots", "lines", "diagonal", "noise"]) {
  const sorted = Array.from(api.SCREENS[n]).sort((a, b) => a - b);
  ok(sorted.every((v, i) => Math.abs(v - (i + 0.5) / 64) < 1e-6), `screen "${n}" is a rank order (every level used once, so density maps linearly to coverage)`);
}

// 1c · image module: the same screens on photographs
const img = await import("../src/image.js");
{
  const W = 64, H = 8, ramp1 = new Float32Array(W * H);
  for (let k = 0; k < ramp1.length; k++) ramp1[k] = (k % W) / (W - 1);
  const cover = (levels, n) => Array.from(levels).reduce((a, v) => a + v, 0) / ((n - 1) * levels.length);
  const two = img.dither(ramp1, W, H, { tones: 2 }), four = img.dither(ramp1, W, H, { tones: 4 });
  ok(Math.abs(cover(two, 2) - 0.5) < 0.04 && Math.abs(cover(four, 4) - 0.5) < 0.04, "image: a 0→1 ramp lands at half coverage for 2 and 4 tones");
  ok(new Set(four).size === 4 && new Set(two).size === 2, "image: tones=N uses exactly N levels on a full ramp");
  ok(Array.from(img.dither(ramp1, W, H, { tones: 8, screen: "dots" })).every((v) => v >= 0 && v < 8), "image: levels stay in range under every screen");
  const a = img.dither(ramp1, W, H, { tones: 4 }), b = img.dither(ramp1, W, H, { tones: 4 });
  ok(Array.from(a).join() === Array.from(b).join(), "image: the same input gives the same dots (nothing random, nothing diffused)");
  const g = img.toGrid(new Float32Array(100 * 50).fill(0.25), 100, 50, 20);
  ok(g.W === 20 && g.H === 10 && g.lum.every((v) => Math.abs(v - 0.25) < 1e-6), "image: toGrid keeps aspect and averages exactly");
  const flat = img.tune(Float32Array.from({ length: 1000 }, (_, i) => 0.4 + 0.2 * (i / 999)), 100, 10, { auto: true });
  ok(Math.min(...flat) < 0.05 && Math.max(...flat) > 0.95, "image: auto levels stretch a flat picture to the full range");
  const px = img.paint(new Uint8Array([0, 1]), 2, 1, [[0, 0, 0], [255, 0, 0]], 2);
  ok(px.length === 32, "image: paint scales each dot by the cell size");
}

// 2 · types compile
try {
  execFileSync(path.join(root, "node_modules/.bin/tsc"), ["--noEmit", "--strict", "--skipLibCheck", "--target", "es2020", "--module", "esnext",
    "--moduleResolution", "bundler", "--lib", "es2020,dom", "--allowJs", "false", path.join(root, "test/types.ts")], { stdio: "pipe" });
  ok(true, "types compile against real use (tsc --strict)");
} catch (e) { ok(false, "types: " + String(e.stdout || e.message).slice(0, 400)); }

// 3 · registry
const reg = JSON.parse(fs.readFileSync(path.join(root, "registry/bitlight.json"), "utf8"));
ok(reg.name === "bitlight" && reg.files.every((f) => f.content.length > 0), `shadcn registry lists ${reg.files.length} files with content`);
// every relative import inside the registry must resolve to a file the registry ships
const shipped = new Set(reg.files.map((f) => f.path.replace("lib/bitlight/", "")));
const missing = [];
for (const f of reg.files) for (const [, rel] of f.content.matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(f.path.replace("lib/bitlight/", "")), rel));
  if (!shipped.has(target)) missing.push(`${f.path} → ${rel}`);
}
ok(missing.length === 0, "registry is self-contained" + (missing.length ? ": missing " + missing.join(", ") : ""));

// 4 · browser: global bundle and React
const bundle = await build({ entryPoints: [path.join(root, "test/react-entry.js")], bundle: true, format: "iife", write: false, define: { "process.env.NODE_ENV": '"production"' } });
fs.writeFileSync(path.join(root, "test/.react-bundle.js"), bundle.outputFiles[0].text);
fs.writeFileSync(path.join(root, "test/.smoke.html"), `<!doctype html><meta charset="utf-8"><div id="global"></div><div id="app"></div>
<script src="../dist/bitlight.global.js"></script><script src=".react-bundle.js"></script>`);
const server = await serve(0, root);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }); // software WebGL2 for the GPU check
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${server.url}/test/.smoke.html`);
const g = await page.evaluate(() => {
  const host = document.getElementById("global");
  const names = Object.keys(window.Bitlight.all);
  const handles = names.map((n) => { const d = document.createElement("div"); host.append(d); return window.Bitlight.mount(d, window.Bitlight.all[n], { cell: 1 }); });
  const canvases = host.querySelectorAll("canvas").length;
  const byName = window.Bitlight.mount(Object.assign(document.createElement("div"), {}), "sundial").stats.read;
  handles.forEach((h) => h.destroy());
  return { names: names.length, canvases, left: host.querySelectorAll("canvas").length, byName };
});
ok(g.names === files.length && g.canvases === files.length && g.left === 0, `global bundle mounts and destroys all ${g.names} figures`);
ok(/^shadow at \d+:\d\d$/.test(g.byName), `mount by registered name works ("${g.byName}")`);
// live settings: ink, screen and lamp change in place and stay two-ink
const live = await page.evaluate(() => {
  const B = window.Bitlight, host = document.createElement("div"); document.body.append(host);
  const h = B.mount(host, B.all.sundial, { cell: 1, theme: "dark" }), cv = host.querySelector("canvas"), px = () => cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  const colours = () => { const d = px(), set = new Set(); for (let i = 0; i < d.length; i += 4) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return set; };
  const lit = () => { const d = px(); let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 100) n++; return n; };
  const out = {};
  h.set({ ink: { lit: "#f04820", unlit: "#0f0f0f" } });
  const c = colours(); out.inkColours = c.size; out.inkHasLit = c.has(0xf04820) && c.has(0x0f0f0f);
  const before = lit(); h.set({ light: { power: 4.5 } }); out.brighter = lit() > before;
  const base = Array.from(px()).join(); h.set({ screen: "dots" }); out.screenChanges = Array.from(px()).join() !== base;
  out.stillTwo = colours().size === 2;
  h.set({ light: { spot: true } }); out.spotTwo = colours().size === 2;
  out.options = JSON.stringify(h.options.screen) + h.options.ink.lit + h.options.light.spot;
  try { h.set({ screen: "nope" }); out.throws = false; } catch { out.throws = true; }
  h.destroy(); host.remove();
  return out;
});
ok(live.inkColours === 2 && live.inkHasLit, "set({ ink }) paints exactly the two chosen colours");
ok(live.brighter, "set({ light: { power } }) re-lights without re-marching");
ok(live.screenChanges && live.stillTwo && live.spotTwo, "screen and spot lamp change the picture and stay two-ink");
ok(live.options === '"dots"#f04820true' && live.throws, "options reflects the live settings; an unknown screen throws");
const tn = await page.evaluate(() => {
  const B = window.Bitlight, host = document.createElement("div"); document.body.append(host);
  const h = B.mount(host, B.all.sundial, { cell: 1, theme: "dark", ink: { lit: "#ff0000", unlit: "#000000" }, tones: 4 }), cv = host.querySelector("canvas");
  const n = () => { const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, set = new Set(); for (let i = 0; i < d.length; i += 4) set.add(d[i]); return set; };
  const out = { four: n().size, red: [...n()].every((v) => [0, 85, 170, 255].includes(v)) };
  h.set({ palette: ["#000000", "#0000ff", "#00ffff"] }); out.pal = h.options.tones;
  h.set({ tones: 2, palette: null }); out.two = n().size; h.destroy(); host.remove(); return out;
});
ok(tn.four === 4 && tn.red, "tones: 4 paints four evenly stepped inks");
ok(tn.pal === 3 && tn.two === 2, "palette sets its own number of inks; tones: 2 returns to two");
const r = await page.evaluate(() => {
  window.mountReact("orb");
  const mounted = document.querySelectorAll("#app canvas").length;
  const label = document.querySelector("#app [role=img]")?.getAttribute("aria-label");
  window.mountReact("gear");
  const swapped = document.querySelectorAll("#app canvas").length;
  window.unmountReact();
  return { mounted, swapped, after: document.querySelectorAll("#app canvas").length, label, reads: window.reads.length };
});
ok(r.mounted === 1 && r.swapped === 1 && r.after === 0, "React: mounts one canvas, swaps figure cleanly, unmount leaves nothing");
ok(r.label?.startsWith("Orb.") && r.reads > 0, "React: accessible label set, onRead fires");

// 5 · the GPU backend draws the CPU kernel's tones, scene by scene: each is written once in GLSL and once in JS
{
  const core = await import("../src/core.js");
  const { sd } = core, smin = sd.smin;
  const lamp = { p: [-0.9, 1.6, 1.2] }, side = { p: [1.4, 1.0, -0.6], power: 1.6, falloff: 0.5 };
  const front = { p: [-1.3, 1.9, 1.3], power: 3.0 }, glint = { p: [-1.15, 1.22, -1.99], power: 2.0 };   // glint sits where the plate mirrors the camera
  const cone = { p: [-0.9, 1.6, 1.2], spot: { dir: [0.45, -0.8, -0.6], inner: 0.9, outer: 0.72 } };
  const blob = (x, y, z) => smin(sd.box(x + 0.5, y - 0.32, z - 0.05, 0.3, 0.32, 0.3, 0.05), sd.sphere(x + 0.3, y - 0.78, z - 0.1, 0.34), 0.25);
  const ring = (x, y, z) => sd.torus(x - 0.5, y - 0.13, z - 0.2, 0.42, 0.13);
  const post = (x, y, z) => sd.cylinder(x - 0.5, y - 0.3, z - 0.2, 0.22, 0.3, 0.04);
  const bulb = (x, y, z) => sd.sphere(x - 0.1, y - 0.13, z + 0.45, 0.13);
  const scenes = [
    { // a ball on a plate: smooth, one crease where they meet
      name: "ball on a plate", W: 160, H: 100, view: { half: 1.25, yaw: 24, pitch: 16, target: [0, 0.5, 0] }, bound: [0, 0.5, 0, 0.52],
      glsl: `float ball(vec3 p) { return sdSphere(p - vec3(0.0, 0.5, 0.0), 0.5); }
        float map(vec3 p) { return min(p.y, ball(p)); }
        float occ(vec3 p) { return ball(p); }
        void material(vec3 p, vec3 n, inout Mat m) { m.a = ball(p) < p.y ? 0.9 : 0.7; }`,
      occ: (x, y, z) => sd.sphere(x, y - 0.5, z, 0.5),
      map: (x, y, z) => Math.min(y, sd.sphere(x, y - 0.5, z, 0.5)),
      mat: (x, y, z) => ({ a: sd.sphere(x, y - 0.5, z, 0.5) < y ? 0.9 : 0.7, s: 0, e: 0 }),
      cases: [
        { tones: 2, screen: "bayer", theme: "light", haloLight: 0, lights: [lamp] },
        { tones: 4, screen: "bayer", theme: "dark", haloLight: 0.12, lights: [lamp] },
        { tones: 2, screen: "dots", theme: "light", haloLight: 0, lights: [cone] },
        { tones: 4, screen: "lines", theme: "dark", haloLight: 0.12, lights: [cone, side] },
      ],
    },
    { // creases to occlude (a box melted into a sphere, a torus and a post standing on the plate), a shiny blob, a bulb that glows
      name: "blob, ring, post and bulb on a glossy plate", W: 200, H: 120, view: { half: 1.0, yaw: 30, pitch: 30, target: [0.05, 0.3, 0.1] }, bound: [0, 0.4, 0.1, 1.3],
      glsl: `float blob(vec3 p) { return smin(sdBox(p - vec3(-0.5, 0.32, 0.05), vec3(0.3, 0.32, 0.3), 0.05), sdSphere(p - vec3(-0.3, 0.78, 0.1), 0.34), 0.25); }
        float ring(vec3 p) { return sdTorus(p - vec3(0.5, 0.13, 0.2), 0.42, 0.13); }
        float post(vec3 p) { return sdCylinder(p - vec3(0.5, 0.3, 0.2), 0.22, 0.3, 0.04); }
        float bulb(vec3 p) { return sdSphere(p - vec3(0.1, 0.13, -0.45), 0.13); }
        float occ(vec3 p) { return min(min(blob(p), ring(p)), min(post(p), bulb(p))); }
        float map(vec3 p) { return min(p.y, occ(p)); }
        void material(vec3 p, vec3 n, inout Mat m) {
          float best = p.y, d = blob(p);
          m.a = 0.75; m.s = 1.0; m.e = 0.0;
          if (d < best) { best = d; m.a = 0.9; m.s = 0.0; m.e = 0.0; }
          d = ring(p); if (d < best) { best = d; m.a = 0.8; m.s = 0.0; m.e = 0.0; }
          d = post(p); if (d < best) { best = d; m.a = 0.9; m.s = 0.0; m.e = 0.0; }
          d = bulb(p); if (d < best) { best = d; m.a = 0.9; m.s = 0.0; m.e = 0.45; }
        }`,
      occ: (x, y, z) => Math.min(Math.min(blob(x, y, z), ring(x, y, z)), Math.min(post(x, y, z), bulb(x, y, z))),
      map: (x, y, z) => Math.min(y, Math.min(Math.min(blob(x, y, z), ring(x, y, z)), Math.min(post(x, y, z), bulb(x, y, z)))),
      mat: (x, y, z) => {
        let best = y, m = { a: 0.75, s: 1, e: 0 }, d = blob(x, y, z);
        if (d < best) { best = d; m = { a: 0.9, s: 0, e: 0 }; }
        d = ring(x, y, z); if (d < best) { best = d; m = { a: 0.8, s: 0, e: 0 }; }
        d = post(x, y, z); if (d < best) { best = d; m = { a: 0.9, s: 0, e: 0 }; }
        d = bulb(x, y, z); if (d < best) { best = d; m = { a: 0.9, s: 0, e: 0.45 }; }
        return m;
      },
      cases: [
        { tones: 2, screen: "bayer", theme: "light", haloLight: 0, ambient: 0.3, lights: [front, glint] },
        { tones: 4, screen: "bayer", theme: "dark", haloLight: 0.45, ambient: 0.3, contrast: 0.6, lights: [front, glint] },
        { tones: 16, screen: "bayer", theme: "light", haloLight: 0, ambient: 0.3, lights: [front, glint] },
      ],
    },
  ];

  // what mount() does on the same camera: march, normal, occlusion, shade, then dither or ditherLevels
  const cpu = (s, c) => {
    const { W, H } = s, { f, r, u } = core.camera(s.view.yaw, s.view.pitch), unit = (2 * s.view.half) / W, n = [0, 0, 0], T = s.view.target;
    const lum = new Float32Array(W * H), depth = new Float32Array(W * H).fill(1e9), out = new Uint8Array(W * H);
    for (let j = 0, k = 0; j < H; j++) for (let i = 0; i < W; i++, k++) {
      const sx = (i + 0.5 - W / 2) * unit, sy = -(j + 0.5 - H / 2) * unit;
      const ox = T[0] - f[0] * 25 + r[0] * sx + u[0] * sy, oy = T[1] - f[1] * 25 + u[1] * sy, oz = T[2] - f[2] * 25 + r[2] * sx + u[2] * sy;
      const t = core.march(s.map, ox, oy, oz, f[0], f[1], f[2]);
      if (t < 0) { lum[k] = -1; continue; }
      const x = ox + f[0] * t, y = oy + f[1] * t, z = oz + f[2] * t;
      core.normal(s.map, x, y, z, n);
      depth[k] = t;
      lum[k] = core.shade(x, y, z, n[0], n[1], n[2], core.occlusion(s.map, x, y, z, n[0], n[1], n[2]), s.mat(x, y, z), c.lights, c.ambient ?? core.LOOK.AMBIENT, f, s.occ, s.bound, c.contrast ?? core.LOOK.GAMMA);
    }
    const ground = c.theme === "dark" ? 0 : c.tones - 1, screen = core.SCREENS[c.screen];
    if (c.tones === 2) core.dither(lum, depth, W, H, out, W, 0, 0, ground, c.haloLight, screen);
    else core.ditherLevels(lum, depth, W, H, out, W, 0, 0, ground, c.haloLight, screen, c.tones);
    return out;
  };
  const run = await page.evaluate(async (scenes) => {
    const { gpu } = await import("/src/gpu.js");
    const canvas = (W, H) => { const cv = document.createElement("canvas"); cv.style.width = W + "px"; cv.style.height = H + "px"; document.body.append(cv); return cv; };
    // every GL object made from here on is counted, so destroy() and a failed compile can be held to "frees everything"
    const P = WebGL2RenderingContext.prototype, live = new Set(), saved = {};
    for (const k of ["Texture", "Framebuffer", "Program", "Shader"]) {
      const make = (saved["create" + k] = P["create" + k]), drop = (saved["delete" + k] = P["delete" + k]);
      P["create" + k] = function (...a) { const o = make.apply(this, a); o && live.add(o); return o; };
      P["delete" + k] = function (o) { live.delete(o); return drop.call(this, o); };
    }
    const out = { scenes: [] };
    for (const [si, s] of scenes.entries()) {
      const cv = canvas(s.W, s.H), view = gpu(cv, { glsl: s.glsl, bound: s.bound });
      if (!view) return null;
      const base = { ...s.view, cell: 1 };
      const levels = s.cases.map((c) => { view.render({ ...base, ...c }); return Array.from(view.levels()); });
      out.scenes.push({ levels });
      if (si === 0) {
        // the canvas itself: dots upscaled whole, in exactly the two chosen inks
        const seen = () => {
          const copy = document.createElement("canvas"); copy.width = cv.width; copy.height = cv.height;
          const g = copy.getContext("2d"); g.drawImage(cv, 0, 0);
          const d = g.getImageData(0, 0, cv.width, cv.height).data, set = new Set();
          for (let i = 0; i < d.length; i += 4) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
          return [...set].sort((a, b) => a - b);
        };
        view.render({ ...base, cell: 2, tones: 2, ink: { lit: "#f04820", unlit: "#0f0f0f" } });
        out.inks = seen();
        // a see-through colour reads as mount() reads it: its own RGB, never blended with the colour parsed before it
        view.render({ ...base, cell: 2, tones: 2, ink: { lit: "rgba(240, 72, 32, 0.5)", unlit: "#0f0f0f" } });
        const fresh = document.createElement("canvas").getContext("2d");
        fresh.fillStyle = "rgba(240, 72, 32, 0.5)"; fresh.fillRect(0, 0, 1, 1);
        const px = fresh.getImageData(0, 0, 1, 1).data;
        out.clear = seen().concat((px[0] << 16) | (px[1] << 8) | px[2]);
        out.dots = [view.cols, view.rows];
      }
      view.destroy(); cv.remove();
    }
    out.leaked = live.size;
    let bad = "";
    try { gpu(canvas(8, 8), { glsl: "float map(vec3 p) {\n  return nope;\n}" }); } catch (e) { bad = String(e.message); }
    out.bad = bad; out.leakedAfterBad = live.size;
    Object.assign(P, saved);
    return out;
  }, scenes.map(({ name, W, H, view, bound, glsl, cases }) => ({ name, W, H, view, bound, glsl, cases })));
  if (!run) ok(false, "gpu: WebGL2 with float render targets is unavailable here, so the parity check cannot run");
  else {
    ok(run.dots.join() === "80,50", "gpu: cell 2 on a 160×100 canvas makes 80×50 dots");
    ok(run.inks.join() === [0x0f0f0f, 0xf04820].join(), "gpu: the canvas holds exactly the two chosen inks");
    ok(run.clear.length === 3 && run.clear[0] === 0x0f0f0f && run.clear[1] === run.clear[2], "gpu: a see-through ink keeps its own colour (as mount reads it), not a blend with the ink parsed before");
    ok(/shader failed \(your glsl starts at line \d+\)/.test(run.bad), "gpu: a broken scene throws, naming the line where your glsl starts");
    const line = +/starts at line (\d+)/.exec(run.bad)?.[1], logged = +/0:(\d+)/.exec(run.bad.split("\n").slice(1).join("\n"))?.[1];
    ok(logged - line === 1, `gpu: the error log's line ${logged} is line ${logged - line + 1} of your glsl, where "nope" is`);
    ok(run.leaked === 0 && run.leakedAfterBad === 0, `gpu: destroy() and a failed compile free every texture, framebuffer, program and shader (${run.leaked} left, ${run.leakedAfterBad} after the failure)`);
    scenes.forEach((s, si) => s.cases.forEach((c, n) => {
      const want = cpu(s, c), got = run.scenes[si].levels[n];
      let same = 0;
      for (let k = 0; k < want.length; k++) if (want[k] === got[k]) same++;
      const used = new Set(want).size, lamps = c.lights.length > 1 ? (c.lights.some((l) => l.spot) ? "two lamps, one a spot" : "two lamps") : c.lights[0].spot ? "spot" : "lamp";
      ok(same / want.length >= 0.99 && used >= Math.min(c.tones, 3), `gpu: ${s.name} · ${c.tones} tones · ${c.screen} · ${lamps} · ${c.theme}: ${(same / want.length).toFixed(4)} of ${want.length} dots match the CPU kernel (${used} tones in play)`);
    }));
  }
}
ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
await browser.close();
await server.close();
fs.rmSync(path.join(root, "test/.react-bundle.js")); fs.rmSync(path.join(root, "test/.smoke.html"));

if (fails.length) { console.log("FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("smoke: all passed");
