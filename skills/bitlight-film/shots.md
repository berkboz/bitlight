# Shots: what works at one bit

Everything here was learned by looking at frames. The free-form patterns are
in `film/films/scenes.mjs` (search for the shot names); the figure patterns are
in the square films (`pointer`, `moon-loop`, `sundial-day`, `montage`).

## Light

- **Light the faces the camera sees.** With `yaw` 20–50 the camera sits at
  +x +z; visible faces are +x, +z and tops. A lamp behind the hero turns it into
  a black slab. In the first cut of the desk shot the tower sat in darkness until
  the lamp moved to the front-left corner.
- **Night shots: `ambient: 0`.** Any fill lifts every dark surface to a sparse
  dot grid that reads as grey noise. Darkness must be ink.
- **Narrow the cones.** A spot with `outer` near 0 lights the whole floor grey.
  `inner: 0.86, outer: 0.5` gives a pool with an edge.
- **Point lights fall off.** `power / (1 + falloff·d²)`. A high "sun" for paper
  shots: `power ≈ 3, falloff 0.02` → even light, crisp shadows.
- **Halo** (paper outline behind near silhouettes) is light-gated in films
  (`haloLight` 0.12) so unlit edges stay hidden; set `haloLight: 0` on a paper
  shot if a dark object must stand off its shadow.

## Composition

- **One hero per shot.** Busy tables of small props turn to noise. Props under
  ~0.03 world units per cell vanish. The cell size is `2·half / 480`.
- **The picture is 2.4:1** (480×200 cells) above a 70-cell type band. Frame
  with `half` (half the visible width) and `target`; vertical reach is about
  `half · 0.42 / cos(pitch)` either side of the target.
- **Infinite floors** fill the frame on night shots; on paper shots let rays
  miss (no floor) for a hero floating in white, or use a table top.

## Patterns (free-form, in scenes.mjs)

| Pattern | Shot | How |
|---|---|---|
| Flicker reveal | `desk` | lamp light present only in on-intervals of t; relay clicks in the score at the same times |
| Visible light source | `desk` | a shade shell around the light; leave the shade out of `occ` or it shadows everything |
| Glowing screen | `desk`, `anywhere` | `M.e` on the screen face; draw content as e = 0 regions in screen uv |
| Spinning part | `close` | angle = t × rate inside the sdf; 7 blades at 1.25 rev/s read as spin at 24 fps |
| Lift and let go | `lift` | y offset with ease-in; the shadow swells and blurs as the object nears the light |
| Walking lamp | `room` | light position and camera target both move with t |
| Status lights | `room` | `M.e` toggled by a hash of (cell, unit, floor(t·3)) |
| Opening lid | `anywhere` | rotate the lid's local frame about the hinge by an eased angle |
| Closer | `closer` | slow spin + bob, sky fill `ambient: 0.22`; add `pill` + `pillAt` for a call to action |

## Figure films (square, for feeds)

| Pattern | Film | How |
|---|---|---|
| Visible pointer | `pointer` | `pointerShot(def, { path })`; the arrow is drawn where the lamp is aimed |
| Seamless loop | `moon-loop` | lamp path periodic in the film length; `typeAt` negative so the text is already set; score periodic too |
| Read-out as story | `sundial-day` | `readout: (t) => …` replaces the angles with what the shot means (the clock) |
| Ground as time of day | `sundial-day` | night → paper → night cuts for dawn, day, dusk |
| Montage on the beat | `montage` | 0.5 s per figure, one lamp path across all cuts, a blip per cut |
| Fill the square | `montage` | `over: { half: 1.85, lift: 0.5 }` zooms the figure camera |

Square is 270×270 cells (1080 px): picture 270×205, band 65. A headline holds
18 characters at headline size.

## Type

- Capitals, digits and `. , ' - ? ! ° / : % · É` only (5×7 face). `check.mjs`
  fails other characters, in headlines and in read-outs.
- 36 characters at headline size fill the band. Shorter is better.
- Type-on runs at 20 characters/s from `typeAt`; leave at least 1 s after the
  last letter before the cut (checked).
- The small line shows the first light's angles and the shot counter: keep the
  first light the one that matters.

## Sound

`score(api)` in the film file. Every voice is a square wave: `blip(at, freq,
len, amp)` for events, `voice(t0, t1, fn)` for beds. Cut beds at shot ends so
sound cuts with picture. Type ticks are added for you.
