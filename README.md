<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="media/readme/hero-dark.png">
  <img alt="Bitlight: a sundial drawn in two inks, lit by a lamp" src="media/readme/hero-light.png" width="100%">
</picture>

</div>

# Bitlight

**Objects drawn in one bit, lit by your pointer.**

Twenty-two 3D figures for the web: seventeen objects and five whole scenes.
Each sits on a plate; the cursor is a lamp hanging over it. Every dot is paper
or ink, ordered by an 8×8 Bayer matrix, so the shading holds still while the
light moves. Canvas, no runtime dependencies, 24 kB (11 kB gzipped) for all
twenty-two.

There is also a film renderer in the same look (moving geometry, cameras and
lights; dot-matrix type; a square-wave score) and agent skills, so Claude Code
or Codex can make new figures and films and check their own frames.

**Site:** https://berkboz.github.io/bitlight/

## Twenty-two figures

The frame at rest is the thumbnail, so each figure has a designed lamp
position. Nothing in a figure moves except the light. Some read-outs say more
than angles: the sundial tells the time, the moon names its phase, the dice
name the brightest face.

**Objects**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="media/readme/objects-dark.png">
  <img alt="Seventeen objects on plates, drawn in one bit" src="media/readme/objects-light.png" width="100%">
</picture>

**Scenes**: whole set-ups built from shared props. Same kernel, same budget.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="media/readme/scenes-dark.png">
  <img alt="Five scenes: workstation, computer, server room, cafe, cloud" src="media/readme/scenes-light.png" width="100%">
</picture>

```
objects  Arch · Bowl · Cage · Columns · Dice · Gear · Keycap · Moon · Mug
         Orb · Pins · Ring · Steps · Sundial · Tower · Vase · Ziggurat
scenes   Workstation · Computer · Server room · Café · Cloud
```

## Install

```bash
npm i github:berkboz/bitlight      # npm i bitlight once it is on npm
```

**ES module**

```js
import { mount, sundial } from "bitlight";

const fig = mount(document.getElementById("figure"), sundial, {
  cell: 3,             // CSS px per dot (integer)
  theme: "auto",       // "light" (paper ground) | "dark" (night ground) | "auto"
  onRead: (text) => (caption.textContent = text),   // "shadow at 10:40"
});
// fig.lampAt(u, v) · fig.rest() · fig.retheme("dark") · fig.destroy()
```

**React 18+**

```jsx
import { Bitlight } from "bitlight/react";
import { moon } from "bitlight";

<Bitlight figure={moon} cell={3} onRead={setCaption} />
```

**Script tag**

```html
<div id="figure"></div>
<script src="https://cdn.jsdelivr.net/gh/berkboz/bitlight/dist/bitlight.global.js"></script>
<script>Bitlight.mount(document.getElementById("figure"), "orb", { cell: 3 });</script>
```

**shadcn**: vendors the source into `lib/bitlight`:

```bash
npx shadcn@latest add https://berkboz.github.io/bitlight/registry/bitlight.json
```

### Colours

Two CSS custom properties on the host (or any ancestor):

```css
.figure { --bitlight-lit: #e4e6df; --bitlight-unlit: #121411; }
```

In the light theme, rays that miss everything paint `lit` (paper); in the dark
theme they paint `unlit` (night). Call `retheme()` after changing them.

### Behaviour

- One `requestAnimationFrame` for the whole page; off-screen or settled figures
  do no work.
- A stiff spring follows the pointer; a soft one carries the lamp home on leave.
  `prefers-reduced-motion` places the lamp directly.
- Keyboard: focus a figure, arrows move the lamp, Esc rests. Each figure has
  `role="img"` and an `aria-label` from its `means`.
- Geometry is ray-marched once at mount (30–190 ms); re-lighting costs 1–14 ms.

## Make a figure

A figure is one file with one `define()` call:

```js
import { define, sd } from "bitlight";

export default define({
  name: "Orb",
  means: "A ball resting on a plate. Move the lamp and its shadow swings round.",
  sdf: (x, y, z) => sd.sphere(x, y - 0.62, z, 0.62),  // plate top is y = 0
  bound: [0, 0.62, 0, 0.64],                           // sphere enclosing it
  rest: [-0.25, 1.5, 1.35],                            // lamp at rest = the thumbnail
});
```

Scenes compose the shared props in `src/props.js` (a computer with fans, a desk
set, server racks, a café table with a laptop, a cloud). See
`src/figures/workstation.js`.

The full workflow (pitch, build, check, look) is
[`skills/bitlight-create/SKILL.md`](skills/bitlight-create/SKILL.md), written for
an AI agent and readable by people. In short:

```bash
node build.mjs                 # regenerate index, bundle, registry
node look.mjs mine             # eight lamps, rule checks → sheets/mine-light.png
node look.mjs mine --theme dark
```

Then open the sheets. Passing is necessary, not sufficient.

## The ten rules

| # | Rule | |
|---|---|---|
| 01 | Two inks | Paper and ink. No grey, no alpha, no anti-aliasing. |
| 02 | One light | The pointer is the only input. Geometry never moves in a figure. |
| 03 | Reach | The lamp is clamped to the plate; at the far edge the figure is still composed. |
| 04 | Order | Bayer, never error diffusion: diffused dots crawl when the light moves. |
| 05 | Edge | A one-dot paper gap separates a near silhouette from what is behind it. |
| 06 | Range | Every lamp position leaves both inks on the plate. |
| 07 | Rest | The rest frame is the thumbnail. Light the faces the camera sees. |
| 08 | Clock | A stiff spring follows; a soft one carries the lamp home. |
| 09 | Cost | One frame loop; settled figures sleep; re-light < 16 ms. |
| 10 | Quiet | No text inside a figure. Words live in the read-out. |

Details and how each is enforced: [`skills/bitlight-create/rules.md`](skills/bitlight-create/rules.md).

## Films, same look

Same lighting code as the figures (`src/core.js`), but geometry, cameras and
lights may move every frame. Words are drawn on the same dot grid; shots cut
hard; the score is square waves. The square ones are made for feeds. Needs FFmpeg.

| | | | |
|:-:|:-:|:-:|:-:|
| <img src="media/readme/pointer.gif" width="220" alt="Move the light"> | <img src="media/readme/moon-loop.gif" width="220" alt="One light"> | <img src="media/readme/sundial-day.gif" width="220" alt="A day, fast"> | <img src="media/readme/montage.gif" width="220" alt="Twenty-two"> |
| [Move the light](media/pointer.mp4) | [One light](media/moon-loop.mp4) | [A day, fast](media/sundial-day.mp4) | [Twenty-two](media/montage.mp4) |

Previews are silent GIFs; the links open the full films with sound
(mp4 and webm in [`media/`](media/)). The 16:9 one, [`scenes`](media/scenes.mp4),
is 35 s of the props in motion.

| Film | Format | What it shows |
|---|---|---|
| `pointer` | 1:1 · 13 s | a cursor drives the lamp across four figures |
| `moon-loop` | 1:1 · 8 s | one orbit of the lamp, every phase, loops seamlessly |
| `sundial-day` | 1:1 · 11 s | dawn, a day, dusk; the read-out is the clock |
| `montage` | 1:1 · 14 s | all 22 figures on the beat |
| `scenes` | 16:9 · 35 s | the props in motion: fans, a lift, a walking lamp, a lid opening |

```bash
node film/check.mjs  --film pointer          # rules + contact sheet
node film/render.mjs --film pointer --stills 2,8
node film/render.mjs --film pointer && node film/score.mjs --film pointer && node film/mux.mjs --film pointer
```

A film is one file: shots that are pure functions of time, plus a score.
Films of figures are a few lines each (`film/films/pointer.mjs`); `--film`
also takes a path, so films can live in another project. Workflow and lessons:
[`skills/bitlight-film/SKILL.md`](skills/bitlight-film/SKILL.md).

## Layout

```
src/core.js        the look: lamp model, tone, shadow, Bayer, halo (no DOM)
src/bitlight.js    define() + mount(): cache, input, motion, a11y
src/props.js       shared geometry for scenes and films
src/react.js       <Bitlight />
src/figures/       one file per figure (index.js is generated)
film/              offline renderer: engine, figure, type, frame, render, score, mux, check
film/films/        the films above
skills/            agent skills: bitlight-create, bitlight-film
media/             rendered films for the site
look.mjs           figure checker + frame sheets
test/smoke.mjs     package test (import, bounds, types, bundle, React, registry)
build.mjs          generated files; --check for CI
index.html         the site: inspector, gallery, films
```

## Development

Node 20+, Chromium via Playwright, FFmpeg for films.

```bash
npm install
npm run serve      # http://127.0.0.1:5173 (ES modules need http, not file://)
npm run check      # everything CI runs
```

## Credits

The structure (a fixed kernel, written rules, and an agent skill that checks
its own frames) follows [Hairline](https://github.com/lucasmarkes/hairline) by
Lucas Markes. The look, kernel, figures and films are original.

MIT.
