# Changelog

## Unreleased

- **Ink, screen, lamp as options.** `mount(el, figure, { ink, screen, light })`,
  `handle.set()` to change them in place, `handle.options` to read them, and the same
  three as `<Bitlight />` props. Reference and roadmap in `docs/CONTROLS.md`.
- **Six screens** (`bayer`, `bayer4`, `dots`, `lines`, `diagonal`, `noise`), exported
  as `SCREENS`. All ordered; error diffusion is deliberately not offered.
- **Lamp options**: power, falloff, ambient, contrast and a spot cone.
- `core.shade()` takes an optional `gamma`; `core.dither()` takes an optional `screen`.
  Defaults are unchanged, so existing figures and the five films render as before.
- Site: a Lab panel drives all three live and writes the matching snippet.
- Tests: screens are rank orders, `set()` paints exactly two colours, spot lamp stays
  two-ink, bad screen names throw; types cover the new options.

## 0.1.0

First release.

- 22 figures. Objects: Arch, Bowl, Cage, Columns, Dice, Gear, Keycap, Moon, Mug,
  Orb, Pins, Ring, Steps, Sundial, Tower, Vase, Ziggurat. Scenes: Workstation,
  Computer, Server room, Café, Cloud.
- `mount()` and `define()` for plain DOM; `<Bitlight />` for React 18+;
  `dist/bitlight.global.js` for a script tag; shadcn registry item.
- `bitlight/core`: the shared look (lamp model, tone, soft shadow, Bayer order,
  paper halo). `bitlight/props`: shared geometry for scenes and films.
- Film renderer (`film/`): moving geometry, cameras and lights, dot-matrix type,
  square-wave score, wide and square formats, figures in films with a drawn
  cursor. Films: pointer, moon-loop, sundial-day, montage, scenes.
- Checks: `look.mjs` (figures), `film/check.mjs` (films), `test/smoke.mjs`
  (package), `build.mjs --check` (generated files).
- Agent skills: `bitlight-create`, `bitlight-film`.
