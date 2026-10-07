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
const browser = await chromium.launch();
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
ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
await browser.close();
await server.close();
fs.rmSync(path.join(root, "test/.react-bundle.js")); fs.rmSync(path.join(root, "test/.smoke.html"));

if (fails.length) { console.log("FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("smoke: all passed");
