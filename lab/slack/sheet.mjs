// node lab/slack/sheet.mjs [out.png] [frame]  — contact sheet of every figure, lit and dithered.
import zlib from "node:zlib";
import fs from "node:fs";
import * as E from "./engine.js";
import { ALL } from "./figures.js";

const out = process.argv[2] || "sheet.png", frame = +(process.argv[3] || 0), SCALE = 3;
const SIZE = +(process.env.SIZE || 20), ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const names = ONLY || Object.keys(ALL), perPage = ONLY ? 5 : 14, pages = Math.ceil(names.length / perPage);
const W = E.COLS, H = E.ROWS * pages, big = new Uint32Array(W * H), px = new Uint32Array(E.N);
const env = { tones: 8, screen: "bayer", lit: [246, 231, 207], unlit: [28, 22, 18], amb: 0.3, bg: () => 0.42, sun: { d: [0.45, -0.6, 0.66], p: 0.7 }, lights: [], outline: "dark" };
let t0 = Date.now();
for (let p = 0; p < pages; p++) {
  E.clear(); E.cam.x = 0; E.cam.y = 0; E.layer(1, 0);
  E.rect(160, 84, 160, 2, 0.3, { z: -40 }); E.rect(160, 172, 160, 2, 0.3, { z: -40 });
  names.slice(p * perPage, (p + 1) * perPage).forEach((n, i) => {
    const def = ALL[n];
    if (ONLY) { E.draw(def, { f: (frame + i * 2) % (def.frames || 1), m: process.env.MODE || "walk" }, 44 + i * 74, def.box[1] < -0.15 ? 100 : 168, { size: SIZE }); return; }
    const col = i % 7, row = Math.floor(i / 7), cy = def.box[1] < -0.15 ? 44 + row * 88 : 82 + row * 88;
    E.draw(def, { f: frame % (def.frames || 1) }, 24 + col * 45, cy, { size: n === "sub" || n === "drum" ? 14 : 20 });
  });
  E.render(env, px);
  big.set(px, p * E.N);
}
console.log("baked + rendered in", Date.now() - t0, "ms");
// PNG
const BW = W * SCALE, BH = H * SCALE, raw = Buffer.alloc((BW * 4 + 1) * BH);
for (let y = 0; y < BH; y++) {
  raw[y * (BW * 4 + 1)] = 0;
  for (let x = 0; x < BW; x++) {
    const c = big[Math.floor(y / SCALE) * W + Math.floor(x / SCALE)], o = y * (BW * 4 + 1) + 1 + x * 4;
    raw[o] = c & 255; raw[o + 1] = (c >> 8) & 255; raw[o + 2] = (c >> 16) & 255; raw[o + 3] = 255;
  }
}
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = ~0; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(BW, 0); ihdr.writeUInt32BE(BH, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("wrote", out, BW + "×" + BH);
