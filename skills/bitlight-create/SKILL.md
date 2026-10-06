---
name: bitlight-create
description: >
  Make a new Bitlight figure: a still 3D object on a plate, drawn in one bit
  (ordered dither, two inks) and lit by the viewer's pointer. Use when someone
  asks for a new Bitlight figure, a dithered/1-bit interactive illustration, a
  hero object "lit by the cursor", or to fix or restyle an existing figure in
  lab/bitlight/src/figures. Not for films (use bitlight-film).
metadata: { "tags": "bitlight, dither, 1-bit, sdf, figure, illustration" }
---

# Bitlight · create a figure

A figure is one file, `src/figures/<name>.js`, holding one `define()` call: a
signed-distance function for the object, a sphere that bounds it, and the lamp
position the figure rests at. The kernel does everything else (plate, camera,
lighting, dither, motion, input, accessibility).

All paths below are relative to the Bitlight root.

## Never

- **Never edit `src/core.js` or `src/bitlight.js`** to make one figure work. If
  the kernel cannot express the idea, the idea is the wrong shape for Bitlight.
- **Never deliver a figure you have not looked at.** `look.mjs` passing is
  necessary, not sufficient. The frame sheet is the check.
- **No text, numbers or logos inside the figure.** Geometry carries identity;
  words go in `read()` (rules.md · 10 Quiet).

## Workflow

### 1 · Pitch (wait for a pick)

Read [concepts.md](concepts.md). Offer **two or three** one-line concepts in this
form and let the person choose, unless they arrived with object *and* reveal:

> **Name.** The object. What the light reveals as it moves. What the read-out says.

> **Sundial.** A dial with a gnomon. The shadow sweeps the hour marks. Read-out: the hour the shadow points to.

A good concept has **one** reveal that only moving light can show: a shadow that
travels, a carving that appears at a grazing angle, a hole that projects, a
highlight that slides. A concept that looks the same under every lamp is wrong
for Bitlight.

### 2 · Build

1. Read [rules.md](rules.md) — ten rules, each with how to satisfy it.
2. Read the header comment of `src/bitlight.js` (the `define()` contract) and the
   helpers in `sd` at the top of `src/core.js`. Nothing else in those files.
3. Open the example closest to your concept (table in concepts.md) and copy its
   shape.
4. Write `src/figures/<name>.js`:

```js
// Name — one line: the object and the reveal.
import { define, sd } from "../bitlight.js";

const { box, cylinder } = sd;
export default define({
  name: "Name",
  means: "One sentence for screen readers: what it is and what the light does.",
  sdf: (x, y, z) => /* distance to the object; plate top is y = 0 */,
  albedo: (x, y, z) => 0.92,          // optional: 0–1 tone per surface point
  bound: [cx, cy, cz, r],             // sphere enclosing the whole object
  rest: [x, 1.5, z],                  // lamp at rest — front-left, lights the faces we see
  read: (lamp) => "…",                // optional: caption from lamp {x, y, z}
});
```

5. `node build.mjs` (regenerates `src/figures/index.js`, the browser bundle and
   the shadcn registry).

### 3 · Check and look

```bash
node look.mjs <name>                 # paper → sheets/<name>-light.png
node look.mjs <name> --theme dark    # night → sheets/<name>-dark.png
```

Fix every FAIL line, then **open both sheets** and go through
[look.md](look.md). Iterate on the figure file only, re-running `look.mjs` each
time, until it passes and the sheet reads. Two or three rounds is normal.

### 4 · Hand over

Say, in this order: the concept line, the reveal in one sentence, which rules
were hardest to satisfy, the `look.mjs` numbers (march ms, re-light ms), and
anything you could not verify. Attach or link the light and dark sheets.

### 5 · Adjust

Changes go into `src/figures/<name>.js` only. Re-run `look.mjs` and look again.
Re-run `node build.mjs` before committing; `node build.mjs --check` is what CI runs.

## Budget

| | limit | if over |
|---|---|---|
| first march | 400 ms | fewer primitives; return early outside a bounding box (see `dice.js`) |
| re-light | 16 ms | a tighter `bound`; fewer shadow-casting parts |
| smallest feature | 2 cells (≈0.03 world units) | make it bigger or drop it — it will vanish or shimmer |
