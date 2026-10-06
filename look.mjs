#!/usr/bin/env node
// node look.mjs <figure> [--theme light|dark]   one figure → sheets/<figure>-<theme>.png
// node look.mjs --all                           every figure, both themes
// Renders each figure under eight lamps, checks the rules a machine can check,
// and writes a frame sheet. Exit 0 only when every check passes. The sheet is
// the real check: open it and look before calling a figure done (look.md).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { serve } from "./serve.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
const all = args.includes("--all");
const name = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--all"));
if (!name && !all) { console.error("usage: node look.mjs <figure> [--theme light|dark] | --all"); process.exit(2); }
const names = all
  ? fs.readdirSync(path.join(here, "src/figures")).filter((f) => f.endsWith(".js") && f !== "index.js").map((f) => f.slice(0, -3)).sort()
  : [name.replace(/\.js$/, "").split("/").pop()];
const themes = all ? ["light", "dark"] : [opt("theme", "light")];
const out = path.resolve(opt("out", path.join(here, "sheets")));
fs.mkdirSync(out, { recursive: true });

const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = 0;

for (const fig of names) for (const theme of themes) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 700 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${server.url}/bench.html?fig=${fig}&theme=${theme}&cell=2`);
  await page.waitForFunction(() => window.ready || window.failed, null, { timeout: 30000 }).catch(() => {});

  const report = await page.evaluate((theme) => {
    if (!window.figs) return { failed: window.failed || "figure did not mount" };
    const frames = [...document.querySelectorAll("canvas")].map((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const colours = new Set(), bits = new Uint8Array(d.length / 4);
      let ink = 0;
      for (let i = 0; i < d.length; i += 4) {
        colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        // "ink" = the tone that is not the ground, so the range check means the same in both themes
        bits[i / 4] = (d[i] < 128) === (theme !== "dark") ? 1 : 0;
        ink += bits[i / 4];
      }
      return { colours: colours.size, ink: ink / bits.length, bits: Array.from(bits) };
    });
    const f = window.figs[0], times = [];
    for (let n = 0; n < 30; n++) { f.lampAt(0.2 + (n % 6) * 0.12, 0.3 + (n % 4) * 0.1); times.push(f.stats.renderMs); }
    f.rest();
    times.sort((a, b) => a - b);
    const rest = frames[0].bits;
    const changed = frames.slice(1).map((fr) => fr.bits.reduce((n, b, i) => n + (b !== rest[i]), 0) / rest.length);
    return { marchMs: f.stats.marchMs, renderMedianMs: times[15], frames: frames.map(({ colours, ink }) => ({ colours, ink })), changed };
  }, theme);

  const fails = [];
  // the bound sphere must enclose the object, or parts outside it never cast shadow
  try {
    const def = (await import(`./src/figures/${fig}.js`)).default;
    const [bx, by, bz, br] = def.bound;
    let leak = 0;
    for (let k = 0; k < 2000; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = br * 1.02;
      if (def.sdf(bx + R * s * Math.cos(a), by + R * u, bz + R * s * Math.sin(a)) < -0.002) leak++;
    }
    if (leak) fails.push(`bound [${def.bound}] does not enclose the object (${leak}/2000 probes inside it) — rule 09 Cost: grow r`);
  } catch (e) { fails.push(`figure file: ${e.message}`); }
  if (report.failed) fails.push(report.failed);
  else {
    report.frames.forEach((fr, i) => {
      if (fr.colours !== 2) fails.push(`frame ${i}: ${fr.colours} colours — rule 01 Two inks`);
      if (fr.ink < 0.04 || fr.ink > 0.8) fails.push(`frame ${i}: ink ${(fr.ink * 100).toFixed(1)}% — rule 06 Range`);
    });
    report.changed.forEach((c, i) => { if (c < 0.02) fails.push(`lamp ${i + 1}: only ${(c * 100).toFixed(1)}% of dots changed — rule 02 One light`); });
    if (report.renderMedianMs > 16) fails.push(`re-light ${report.renderMedianMs.toFixed(1)}ms > 16ms — rule 09 Cost`);
    if (report.marchMs > 400) fails.push(`first march ${report.marchMs.toFixed(0)}ms > 400ms — rule 09 Cost (simplify the sdf)`);
  }
  fails.push(...errors.map((e) => `page error: ${e}`));
  const file = path.join(out, `${fig}-${theme}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();

  const head = report.failed ? `${fig} (${theme})` :
    `${fig} (${theme}): march ${report.marchMs.toFixed(0)}ms · re-light ${report.renderMedianMs.toFixed(1)}ms · ink ${report.frames.map((f) => Math.round(f.ink * 100)).join("/")}%`;
  console.log(`${fails.length ? "FAIL" : "pass"}  ${head}  → ${path.relative(process.cwd(), file)}`);
  for (const f of fails) console.log("      " + f);
  if (fails.length) failed++;
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
