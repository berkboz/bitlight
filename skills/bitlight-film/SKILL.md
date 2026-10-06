---
name: bitlight-film
description: >
  Make a short film in the Bitlight style: one-bit ordered-dither 3D shots with
  moving geometry, cameras and lights, dot-matrix type in a band under the
  picture, hard cuts, and a square-wave score. Use when someone wants a video
  "in the Bitlight style", a dithered/1-bit explainer or teaser, or to edit
  lab/bitlight/film/films/*. For a single interactive figure use bitlight-create.
metadata: { "tags": "bitlight, film, video, dither, 1-bit, motion" }
---

# Bitlight · make a film

A film is one file, `film/films/<name>.mjs`: a list of shots, each a pure
function of its local time, plus a score. The tools are generic:

```bash
node film/check.mjs  --film <name>                 # rules + contact sheet (out/<name>/contact.png)
node film/render.mjs --film <name> --stills 2,8.5  # individual frames to look at
node film/render.mjs --film <name>                 # out/<name>/picture.mp4
node film/score.mjs  --film <name>                 # out/<name>/score.wav
node film/mux.mjs    --film <name>                 # out/<name>/<name>.mp4
```

Read the worked examples before writing anything:

- `film/films/scenes.mjs`: free-form shots built from the shared props in
  `src/props.js` (moving parts, several lights, glowing screens). Every pattern
  in [shots.md](shots.md) is in here.
- `film/films/pointer.mjs`, `moon-loop.mjs`, `sundial-day.mjs`, `montage.mjs`:
  films made of library figures through `film/figure.mjs`, square for social
  feeds (`format: "square"`), with a drawn cursor and figure read-outs.

A film can live anywhere: `--film path/to/film.mjs` works, and output goes to
`out/<name>/` next to that file.

## Never

- **Never deliver without looking at frames from the final MP4.** `check.mjs`
  passing is necessary, not sufficient. Extract one frame per shot with
  `ffmpeg -ss <t> -i out/<name>/<name>.mp4 -frames:v 1 f.png` and look.
- **Never crossfade.** Shots cut hard, picture and sound together.
- **Never put words in the picture.** Words go in the type band only.
- **Never invent figures (numbers) for a real product.** Claims come from the
  source text.

## Workflow

### 1 · Brief → one line per shot
Write the story as 4–8 shots, one line each: *what we see · what moves · what
the band says*. Each shot gets one idea and one movement. 4–7 s per shot.

> 03 · the computer lifts off the plate; its shadow swells, blurs, lets go · THE SHADOW LETS GO.

Pick a ground per shot: **night** (0) for weight, mystery, the old way;
**paper** (1) for open, light, the new way. A hard cut from night to paper is the
strongest mood change the style has — spend it once.

Show the shot list and wait for a yes before building.

### 2 · Build the shots

A figure shot is one line: `pointerShot(sundial, { dur, text, path })` or
`lampShot(moon, { dur, text, lamp })` from `films/_figure-shot.mjs`. Free-form
shots return a scene:

Copy the structure of `scenes.mjs` (free-form) or `pointer.mjs` (figures). A free-form shot:

```js
const lift = {
  dur: 6, ground: 0, text: "THE SHADOW LETS GO.", typeAt: 0.4,
  // optional: pill: "TRY IT", pillAt: 2.2   (a call to action in an outlined box)
  build(t) {                         // t = seconds into this shot
    return {
      ambient: 0,                    // night shots: 0, or darkness turns into a grey dot grid
      camera: { yaw: 45, pitch: 30, half: 1.9, target: [0, 0.55, 0] },
      map: (x, y, z) => Math.min(y, obj(x, y, z)),   // floor + objects
      occ: obj,                      // shadow casters: never the floor
      mat(x, y, z) { /* write M.a (albedo), M.s (specular), M.e (glow) */ },
      lights: [{ p: [-0.9, 3.7, 1.0], power: 6.5 }],
    };
  },
};
```

Read [shots.md](shots.md) for the lighting and composition rules that made the
example work, and the patterns (flicker reveal, lift, walking lamp, screen glow,
status lights, type-on).

### 3 · Check, look, fix
`node film/check.mjs --film <name>`. Fix every FAIL. Then open
`out/<name>/contact.png` (three frames per shot) and ask, per shot:
- Is the hero of the shot lit, on a face the camera sees?
- Can you tell what it is in under a second?
- Is the darkness dark (no grey dot field)?
- Is anything cropped that matters?

Render single stills at full size for anything doubtful. Expect several rounds;
the example took five.

### 4 · Render and verify
`render.mjs`, `score.mjs`, `mux.mjs`. Then extract one frame per shot from the
MP4 and look at it at full resolution (the dots must be crisp 4×4 blocks).

### 5 · Hand over
MP4 path, duration, one line per shot, what you could not verify (you cannot
hear the score — say so and report its levels from
`ffmpeg -i score.wav -af volumedetect -f null -`).

## Budget
About 0.7 s per frame per core at 480×270 cells; a 35 s film renders in ~2.5
minutes on four cores. `check.mjs` prints the estimate.
