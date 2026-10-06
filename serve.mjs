#!/usr/bin/env node
// Tiny static server: ES modules do not load from file://, so the bench, the
// checks and local development all go through this. `node serve.mjs` → :5173
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm" };
const ROOT = path.dirname(fileURLToPath(import.meta.url));

export function serve(port = 0, root = ROOT) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(root, rel.endsWith("/") ? rel + "index.html" : rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () =>
    resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serve(+(process.env.PORT || 5173));
  console.log(`bitlight → ${url}/index.html  ·  bench: ${url}/bench.html?fig=orb`);
}
