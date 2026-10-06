# Contributing

## Adding a figure

The supported path is the agent skill at `skills/bitlight-create/SKILL.md`.
It works the same by hand: one file in `src/figures/`, one `define()` call.

1. Pitch it in one line: **Name.** The object. What the light reveals. What the read-out says.
2. Write `src/figures/<name>.js`. Copy the closest example (see
   `skills/bitlight-create/concepts.md`).
3. `node build.mjs`
4. `node look.mjs <name>` and `node look.mjs <name> --theme dark`. Both must pass.
5. **Open both frame sheets** (`sheets/`) and go through
   `skills/bitlight-create/look.md`. Say in the PR which frame shows the reveal best.

Do not edit `src/core.js` or `src/bitlight.js` in a figure PR. Changes to the
look go in their own PR, with before/after sheets of every figure and a
before/after contact sheet of every film.

## Before you push

```bash
npm run check      # build --check, every figure in both themes, every film, smoke test
```

## Films

See `skills/bitlight-film/SKILL.md`. Commit `film/films/<name>.mjs`, never
`film/out/`.

## Style of the code

Plain modern JavaScript, no dependencies at runtime. Hot paths (anything called
per ray step) avoid allocation: numbers in, numbers out. Comments say why.
