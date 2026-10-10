# Changelog

## Unreleased

- **`bitlight/gpu`**: an optional WebGL2 backend. The kernel as a fragment shader for scenes written in GLSL (moving geometry, up to eight lights, every frame), with core's own constants, screens and camera; the smoke test checks its tones against the CPU kernel.
- **Made with Bitlight**: a section on the site and in the README for work built on the kernel. First entry: [Fish](https://theorkan.com/fish/) by Orkan Celikhisar, the kernel ported to a WebGL2 shader.
- **Three detailed figures**: Rangefinder (a film camera with a knurled lens and leather grip), Pocket watch (milled bezel, sixty minute ticks, raised hour marks) and Mac (a bitmap face on its glass): 25 figures. Built close, with material detail in the albedo; geometry and tone live in `src/detail.js` so films can animate them (hands, a blinking face, a shutter).
- **Launch films**: `launch-spin` (the objects turn, 27 s), `launch` (16:9, 42 s), `launch-teaser` (15 s) and `launch-loop` (1:1), in `media/launch/`. `film/render.mjs --scale 8` (or `scale: 8` in a film) renders 3840×2160 from the same cells.

- **Ink, screen, lamp as options.** `mount(el, figure, { ink, screen, light })`,
  `handle.set()` to change them in place, `handle.options` to read them, and the same
  three as `<Bitlight />` props. Reference and roadmap in `docs/CONTROLS.md`.
- **Six screens** (`bayer`, `bayer4`, `dots`, `lines`, `diagonal`, `noise`), exported
  as `SCREENS`. All ordered; error diffusion is deliberately not offered.
- **Tones**: `tones: 2 | 4 | 8 | 16` or an exact `palette` for more than two inks, still ordered. `core.ditherLevels()` and `core.ramp()`.
- **Pictures and video**: `bitlight/image` (luma, levels, sharpen, grid, dither, paint), the `bitlight.mjs` command for images and video via FFmpeg, and `photo.html` for the browser (image, video, camera, PNG and video export).
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
