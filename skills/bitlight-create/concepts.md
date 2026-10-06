# Concepts

Bitlight figures work when **moving light reveals something still geometry
hides**. Start from the reveal, then find the object.

## Reveals that work

| Reveal | What happens | Objects |
|---|---|---|
| **Travelling shadow** | a cast shadow swings, stretches, points | sundial, orb, column, arch, pin field |
| **Grazing relief** | carvings appear only when light skims the face | vents, dice pips, keycap dish, crater, engraved plate |
| **Projected hole** | light through an opening lands on the plate | ring, arch, lattice, window frame, slot |
| **Sliding highlight** | a specular spot runs across a curve | vase, bowl, orb, capsule |
| **Terminator** | the light/dark boundary moves across a round body | moon, sphere, dome |
| **Step shadows** | each level shades the next | stairs, ziggurat, stacked books |

## Reveals that fail

- Flat objects lying on the plate (a card, a coin): nothing to shadow, no faces.
- Objects that need colour to be read (a traffic light, a flag).
- Thin wire shapes under 2 cells: they shimmer or vanish.
- Busy scenes with many small parts: dither turns them to noise. One object,
  one idea.
- Anything that needs to move. Motion belongs in films.

## Shapes — recipes in `sd`

| Need | Recipe |
|---|---|
| rounded block | `sd.box(x, y - h, z, bx, h, bz, r)` — sits on the plate when centred at y = h |
| cut a slot / pip / vent | `d = Math.max(d, -cutter)` |
| join parts | `Math.min(a, b)`; soft join `sd.smin(a, b, k)` |
| solid of revolution | `sd.revolve(x, y, z, (r, y) => profile distance)` with `sd.rect` / arcs |
| ring in a vertical plane | `sd.torus(x, z, y - c, R, r)` (swap axes to choose the plane) |
| rotate about y by a | `const c = Math.cos(a), s = Math.sin(a); f(c*x - s*z, y, s*x + c*z)` |
| repeat in a grid | round to cell index and clamp; add a neighbour bound (see `pins.js`) |
| expensive detail | compute the outer box first; `if (outer > 0.04) return outer` |

Keep the object within |x|, |z| ≤ 1.4 and y ≤ 1.6. Detail smaller than 0.03
world units is under 2 cells at the default size and will not survive.

## Examples by shape

| Closest to… | Read |
|---|---|
| one primitive, travelling shadow | `orb.js` |
| block with carved detail | `tower.js`, `dice.js` |
| hole / projected light | `ring.js`, `arch.js`, `lattice.js` |
| repeated parts | `pins.js`, `columns.js` |
| revolve profile | `vase.js`, `bowl.js` |
| custom read-out | `sundial.js`, `moon.js` |
