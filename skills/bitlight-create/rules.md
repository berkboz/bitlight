# The ten rules

Each rule says what it means, how to satisfy it in a figure, and who enforces
it. "Kernel" means you cannot break it from a figure file; "look.mjs" means the
checker fails you; "eyes" means only the frame sheet will tell.

### 01 · Two inks
Paper and ink. Any two colours (a figure never names its own; the page picks
them, see `docs/CONTROLS.md`), but no grey, no alpha, no anti-aliasing, no third
colour for an accent. *Satisfy:* nothing to do — tone comes from dot density. (Pages may opt into 4, 8 or 16 tones; figures are built and checked at 2.) *Enforced:*
kernel + look.mjs (counts colours, fails at three).

### 02 · One light
The pointer is the only input. Geometry never moves in a figure (that is what
films are for), so it is marched once and cached. *Satisfy:* the sdf must not
depend on time or state. *Enforced:* look.mjs fails a lamp position that changes
fewer than 2% of the dots — your object is hiding from the light.

### 03 · Reach
The lamp is clamped to the plate's neighbourhood; at the far edge the figure is
still composed. *Satisfy:* keep the object inside the plate (|x|, |z| ≤ 1.4) and
under y ≈ 1.6 so the camera frames it. *Enforced:* kernel clamps; eyes for framing.

### 04 · Order
Ordered screens only: Bayer by default, plus the other fixed 8×8 maps in
`SCREENS`. Never error diffusion: diffused dots crawl when the light moves;
ordered dots stay put. A figure must read under the default screen. *Enforced:*
kernel.

### 05 · Edge
A one-dot paper gap separates a near silhouette from whatever is behind it, so a
dark object never melts into its own dark shadow. *Satisfy:* nothing — but if
you see a stray dashed line, two surfaces sit at a depth step > 0.12 that you
did not intend (a gap between parts). Close the gap. *Enforced:* kernel; eyes
for strays.

### 06 · Range
Every lamp position leaves both inks on the plate; no frame goes flat.
*Satisfy:* light albedo (0.85–0.95) on the object, a plate the light can reach.
*Enforced:* look.mjs (ink between 4% and 80% of the canvas, in both themes).

### 07 · Rest
Each figure has a designed lamp position; the rest frame is the thumbnail and
must read on its own. *Satisfy:* the camera sits at **+x +z** looking toward
−x −z, so the faces you see are **+x, +z and the top**. Put the rest lamp in
front of those faces: front-left is `[-0.3, 1.5, 1.35]`, front-right
`[1.35, 1.5, 0.45]`. A lamp behind the object (negative z with x ≤ 0) backlights
it into a black blob. *Enforced:* eyes — the first frame of the sheet.

### 08 · Clock
A stiff spring follows the pointer; a soft one carries the lamp home.
Reduced-motion users get the lamp placed directly. *Enforced:* kernel.

### 09 · Cost
One shared frame loop; off-screen or settled figures do no work. Re-light under
16 ms, first march under 400 ms. *Satisfy:* a tight `bound`; early-out of
expensive detail (`if (outer > 0.04) return outer`); no loops over dozens of
primitives per call. *Enforced:* kernel + look.mjs.

### 10 · Quiet
No text inside a figure. Names and lamp angles live in the read-out below it.
*Satisfy:* identity through geometry. `read(lamp)` may say something specific to
the figure (the hour on a sundial, a moon's phase) — that is where words go.
*Enforced:* eyes.
