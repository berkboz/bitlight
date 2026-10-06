# Changelog

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
