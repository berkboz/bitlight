#!/usr/bin/env node
// node lab/slack/publish.mjs <site-dir> "what changed"
// Snapshots the game into <site-dir>/slack/vN/ (self-contained: core.js is copied in beside it),
// makes that same build the one served at <site-dir>/slack/ itself, and rewrites
// <site-dir>/slack/versions/index.html, the list of every version. Commit and push the site repo
// afterwards; nothing here touches git.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [site, note = ""] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!site) { console.error('usage: node lab/slack/publish.mjs <site-dir> "what changed"'); process.exit(1); }
const out = path.join(path.resolve(site), "slack");
fs.mkdirSync(out, { recursive: true });
const listFile = path.join(out, "versions.json");
const list = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, "utf8")) : [];
const v = (list.at(-1)?.v || 0) + 1, dir = path.join(out, "v" + v);
fs.mkdirSync(dir, { recursive: true });

const NOINDEX = '<meta name="robots" content="noindex, nofollow">';
for (const f of ["engine.js", "figures.js", "game.js"]) fs.writeFileSync(path.join(dir, f), fs.readFileSync(path.join(here, f), "utf8").replaceAll("../../src/core.js", "./core.js").replaceAll("../../src/gpu.js", "./gpu.js"));
for (const f of ["core.js", "gpu.js"]) fs.copyFileSync(path.join(here, "../../src", f), path.join(dir, f));   // gpu.js imports ./core.js already
// the placeholder voice is a macOS system voice (personal use): it only ships when asked for with --voice
if (process.argv.includes("--voice") && fs.existsSync(path.join(here, "voice"))) fs.cpSync(path.join(here, "voice"), path.join(dir, "voice"), { recursive: true });
fs.writeFileSync(path.join(dir, "index.html"), fs.readFileSync(path.join(here, "index.html"), "utf8").replace("<title>SLACK</title>", `<title>SLACK</title>\n${NOINDEX}`));

// the latest build is the main one: /slack/ serves it directly, with a small way back to the others
for (const f of ["engine.js", "figures.js", "game.js", "core.js", "gpu.js"]) fs.copyFileSync(path.join(dir, f), path.join(out, f));
fs.rmSync(path.join(out, "voice"), { recursive: true, force: true });
if (fs.existsSync(path.join(dir, "voice"))) fs.cpSync(path.join(dir, "voice"), path.join(out, "voice"), { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), fs.readFileSync(path.join(dir, "index.html"), "utf8")
  .replace("</style>", "  #vers { position:fixed; left:0; right:0; bottom:18px; text-align:center; font-size:10px; letter-spacing:.2em; text-transform:uppercase; }\n  #vers a { color:var(--dim); text-decoration:none; } #vers a:hover { color:var(--lit); }\n  #go.off #vers { display:none; }\n</style>")
  .replace('<div id="go"><div>', `<div id="go"><div id="vers"><a href="./versions/" onclick="event.stopPropagation()">v${v} · every version</a></div><div>`));

list.push({ v, date: new Date().toISOString().slice(0, 16).replace("T", " "), note });
fs.writeFileSync(listFile, JSON.stringify(list, null, 2) + "\n");

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const rows = [...list].reverse().map((e, i) => `    <li><a href="../v${e.v}/"><b>v${e.v}</b>${i === 0 ? " <i>latest</i>" : ""}<span>${esc(e.note)}</span><time>${e.date} UTC</time></a></li>`).join("\n");
fs.mkdirSync(path.join(out, "versions"), { recursive: true });
fs.writeFileSync(path.join(out, "versions", "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
${NOINDEX}
<title>SLACK — every version</title>
<style>
  :root { --lit:#d6f0e8; --dim:#6f9a98; --red:#ff4a2e; }
  body { margin:0; min-height:100vh; background:#041318; color:var(--lit); font:14px/1.5 ui-monospace, "SF Mono", Menlo, monospace; display:grid; place-items:start center; }
  main { width:min(92vw, 720px); padding:12vh 0 10vh; }
  h1 { font-weight:400; font-size:40px; letter-spacing:.6em; margin:0 0 .3em; }
  p { color:var(--dim); letter-spacing:.14em; text-transform:uppercase; font-size:11px; margin:0 0 4em; }
  ul { list-style:none; margin:0; padding:0; border-top:1px solid #16343b; }
  a { display:grid; grid-template-columns:5.5em 1fr; gap:.2em 1em; padding:1.1em .4em; color:inherit; text-decoration:none; border-bottom:1px solid #16343b; }
  a:hover { background:#0a2229; }
  b { font-weight:400; font-size:18px; letter-spacing:.1em; grid-row:span 2; }
  i { font-style:normal; color:var(--red); font-size:10px; letter-spacing:.2em; text-transform:uppercase; display:block; }
  time { color:var(--dim); font-size:11px; letter-spacing:.1em; grid-column:2; }
</style>
</head>
<body>
<main>
  <h1>SLACK</h1>
  <p>a cable went quiet · every build, newest first · <a href="../" style="display:inline;padding:0;border:0;color:var(--lit)">play the latest</a></p>
  <ul>
${rows}
  </ul>
</main>
</body>
</html>
`);
console.log(`published v${v} → ${dir}`);
