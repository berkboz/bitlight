// Type on the dot grid: a 5×7 matrix face where one glyph dot is s×s cells,
// so the words are made of the same dots as the pictures.
const G = {
  A: ".###.#...##...#######...##...##...#", B: "####.#...##...#####.#...##...#####.",
  C: ".###.#...##....#....#....#...#.###.", D: "###..#..#.#...##...##...##..#.###..",
  E: "######....#....####.#....#....#####", F: "######....#....####.#....#....#....",
  G: ".###.#...##....#.####...##...#.####", H: "#...##...##...#######...##...##...#",
  I: ".###...#....#....#....#....#...###.", J: "..###...#....#....#....##..#..##...",
  K: "#...##..#.#.#..##...#.#..#..#.#...#", L: "#....#....#....#....#....#....#####",
  M: "#...###.###.#.##.#.##...##...##...#", N: "#...##...###..##.#.##..###...##...#",
  O: ".###.#...##...##...##...##...#.###.", P: "####.#...##...#####.#....#....#....",
  Q: ".###.#...##...##...##.#.##..#..##.#", R: "####.#...##...#####.#.#..#..#.#...#",
  S: ".#####....#.....###.....#....#####.", T: "#####..#....#....#....#....#....#..",
  U: "#...##...##...##...##...##...#.###.", V: "#...##...##...##...##...#.#.#...#..",
  W: "#...##...##...##.#.##.#.##.#.#.#.#.", X: "#...##...#.#.#...#...#.#.#...##...#",
  Y: "#...##...#.#.#...#....#....#....#..", Z: "#####....#...#...#...#...#....#####",
  0: ".###.#...##..###.#.###..##...#.###.", 1: "..#...##....#....#....#....#...###.",
  2: ".###.#...#....#...#...#...#...#####", 3: "####.....#....#.###.....#....#####.",
  4: "...#...##..#.#.#..#.#####...#....#.", 5: "######....####.....#....##...#.###.",
  6: "..##..#...#....####.#...##...#.###.", 7: "#####....#...#...#...#....#....#...",
  8: ".###.#...##...#.###.#...##...#.###.", 9: ".###.#...##...#.####....#...#..##..",
  ".": "..........................##...##..", ",": "....................##....#...#....",
  "'": "..#....#...#.......................", "-": "...............###.................",
  "?": ".###.#...#....#...#...#.........#..", "!": "..#....#....#....#....#.........#..",
  "°": ".##..#..#..##......................", "/": "....#...#....#...#...#....#...#....",
  "É": "...#.######....####.#....#....#####", "%": "##...##..#...#...#...#...#..##...##", "·": ".................#.................",
  ":": "......##...##.........##...##......", " ": "...................................",
};

export const glyphs = new Set(Object.keys(G));
export const advance = (s) => 6 * s;
export const width = (str, s) => str.length * 6 * s - s;

/** Draw `str` into a bit buffer at cell (x, y). `count` limits glyphs (type-on). */
export function text(bits, stride, x, y, str, s, ink, count = Infinity) {
  const n = Math.min(str.length, count);
  for (let c = 0; c < n; c++) {
    const g = G[str[c]] || G[" "];
    for (let r = 0; r < 7; r++)
      for (let q = 0; q < 5; q++) {
        if (g[r * 5 + q] !== "#") continue;
        for (let dy = 0; dy < s; dy++)
          for (let dx = 0; dx < s; dx++) bits[(y + r * s + dy) * stride + x + c * 6 * s + q * s + dx] = ink;
      }
  }
}

export function rect(bits, stride, x, y, w, h, v) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) bits[j * stride + i] = v;
}

/** One-cell outline with clipped corners — the pill, drawn in dots. */
export function pill(bits, stride, x, y, w, h, ink) {
  for (let i = x + 2; i < x + w - 2; i++) { bits[y * stride + i] = ink; bits[(y + h - 1) * stride + i] = ink; }
  for (let j = y + 2; j < y + h - 2; j++) { bits[j * stride + x] = ink; bits[j * stride + x + w - 1] = ink; }
  bits[(y + 1) * stride + x + 1] = ink; bits[(y + 1) * stride + x + w - 2] = ink;
  bits[(y + h - 2) * stride + x + 1] = ink; bits[(y + h - 2) * stride + x + w - 2] = ink;
}

// The classic arrow, one cell per dot: X = outline (ink), # = fill (paper).
// Readable on both grounds: the fill shows on night, the outline on paper.
const ARROW = [
  "X..........", "XX.........", "X#X........", "X##X.......", "X###X......", "X####X.....",
  "X#####X....", "X######X...", "X#######X..", "X########X.", "X#####XXXXX", "X##X##X....",
  "X#X.X##X...", "XX..X##X...", "X....X##X..", ".....X##X..", "......X##X.", "......XXX..",
];
/** Draw the pointer with its tip at cell (x, y), clipped to rows < maxY. */
export function cursor(bits, stride, x, y, maxY, inkBit, paperBit) {
  for (let r = 0; r < ARROW.length; r++) for (let c = 0; c < ARROW[r].length; c++) {
    const ch = ARROW[r][c], cx = x + c, cy = y + r;
    if (ch === "." || cx < 0 || cx >= stride || cy < 0 || cy >= maxY) continue;
    bits[cy * stride + cx] = ch === "X" ? inkBit : paperBit;
  }
}
