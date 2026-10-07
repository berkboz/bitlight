# Controls: ink, screen, lamp

Bitlight has three things you can change without touching a figure. They are the
whole of the "look" knobs; everything else is fixed on purpose (see
[the ten rules](../skills/bitlight-create/rules.md)).

| Knob | What it changes | Option | Live | Default |
|---|---|---|---|---|
| **Ink** | the two colours | `ink: { lit, unlit }` or `--bitlight-lit` / `--bitlight-unlit` | `handle.set({ ink })` | paper `#e4e6df` / ink `#121411` (night swaps the ground) |
| **Screen** | the order dots switch on, i.e. the texture of the shading | `screen: "bayer" \| "bayer4" \| "dots" \| "lines" \| "diagonal" \| "noise"` | `handle.set({ screen })` | `bayer` |
| **Lamp** | how the one light behaves | `light: { power, falloff, ambient, contrast, spot }` | `handle.set({ light })` | `LOOK` values |

All three are optional, all three can be changed after mount without re-marching
the geometry, and `handle.options` returns what is live.

```js
const fig = mount(el, sundial, {
  ink: { lit: "#f04820", unlit: "#0f0f0f" },
  screen: "dots",
  light: { power: 3.2, spot: true },
});
fig.set({ screen: "lines" });          // partial updates are fine
fig.options;                           // { ink, screen, light }
```

React takes the same three as props (`<Bitlight ink screen light />`) and applies
changes in place, with no remount.

## Ink

Any two CSS colours. `lit` is what light turns a dot into (the "paper"); `unlit`
is the shadow ink. Which of the two paints empty ground is the **theme**:
`theme: "light"` paints ground `lit`, `theme: "dark"` paints it `unlit`. So a
light-on-dark look (amber on near-black) is `theme: "dark"` and a dark-on-light
look (red on cream) is `theme: "light"`.

Keep at least **3:1** contrast between the inks, or the figure's edges sink. The
site's Lab shows the ratio and warns below 3.

Precedence: `ink` option, then the CSS custom properties on the host or any
ancestor, then the paper/night defaults. Scoping the custom properties to a
wrapper recolours every figure inside it and nothing else, which is how
brk.bz/bitlight keeps its page chrome in the site's own colours.

## Screen

A screen is an 8×8 grid of thresholds, tiled over the picture. A dot is lit when
the light at that point beats the threshold under it. Changing the screen
changes only the grain of the shading, not its shape or where the light falls.

| Name | Looks like |
|---|---|
| `bayer` | the default: fine, even, crisp |
| `bayer4` | coarser 4×4 Bayer, a more "early Mac" grain |
| `dots` | clustered halftone dots, like newsprint |
| `lines` | horizontal line screen, like an engraving |
| `diagonal` | 45° line screen |
| `noise` | a fixed grain, the same on every machine |

Every screen is **ordered and fixed**: the same pixel has the same threshold
every frame, so the shading holds still while the lamp moves (rule 04). Error
diffusion is not offered because diffused dots crawl. `SCREENS` is exported if you
want the raw tables.

## Lamp

| Option | Range | Effect |
|---|---|---|
| `power` | 0.8–5 | brightness of the lamp |
| `falloff` | 0.05–1.2 | distance falloff; higher is a tighter pool of light |
| `ambient` | 0–0.3 | fill light on every surface; raise it to rescue deep shadow |
| `contrast` | 0.4–1.3 | tone-curve exponent; lower lifts the mid-tones, higher crushes them |
| `spot` | bool | a cone aimed at the middle of the plate instead of a bare lamp |

It is still **one light** (rule 02) and the pointer is still its only input.
Defaults are `LOOK` in `src/core.js`, which the film renderer also reads, so a
film and a page with default settings cannot drift apart.

## Where it lives

- Kernel: `src/core.js` (`SCREENS`, `shade(..., gamma)`, `dither(..., screen)`)
  and `src/bitlight.js` (`ink` / `screen` / `light` options, `set`, `options`).
- Types: `src/index.d.ts`, `src/core.d.ts`, `src/react.d.ts`.
- Checks: `test/smoke.mjs` (screens are rank orders, `set()` paints exactly two
  colours, a spot lamp stays two-ink, bad screen names throw) and `test/types.ts`.
- Demo: the **Lab** panel on `index.html` drives all three live, writes the matching
  snippet, and `https://brk.bz/bitlight/` turns it into a shareable link
  (`#fig=moon&ink=amber&screen=dots&spot=1`).

## Plan

Done in 0.2:

- [x] Ink as a first-class option, CSS-variable scoping, `set()` and `options`
- [x] Six ordered screens, `SCREENS` export
- [x] Lamp: power, falloff, ambient, contrast, spot
- [x] React props, types, tests, Lab demo

Next, roughly in order:

- [ ] **Per-figure material.** `define({ albedo })` already varies tone across a
      figure; add a screen override per surface (object in `lines`, plate in `bayer`)
      so a figure can carry its own texture. Needs a per-pixel screen index in the
      cached march.
- [ ] **Films take the same knobs.** `film/engine.mjs` reads `LOOK` today; accept
      `{ ink, screen, light }` per film or per shot so a film can be rendered amber
      or in dots. Defaults must keep the five shipped films byte-identical.
- [ ] **Look sheets for every screen.** `look.mjs --screen dots` so a figure can be
      checked under each screen; rule 06 (Range) and rule 05 (Edge) can fail
      differently under a coarse screen.
- [ ] **Two-lamp mode** (second, fixed lamp as a rim light). The kernel's `lights`
      array already takes several; the open question is rule 02, so this stays behind
      an explicit `light: { rim: true }`.
- [ ] **Palette export.** A button on the Lab that downloads the current look as a
      CSS block, a `mount()` call and a PNG of the figure.

Not planned, on purpose: error diffusion, more than two inks, gradients or alpha
in a figure (rule 01), a second input besides the pointer (rule 02).
