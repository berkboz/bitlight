// Dice — two dice with carved pips. Grazing light picks out one face at a time; the read-out names the brightest.
import { define, sd } from "../bitlight.js";

const { box, sphere } = sd;
const S = 0.36; // half size
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
// each die: centre, yaw, pips on the faces we see (+y top, +z front, +x right)
const DICE = [
  { c: [-0.48, S, 0.28], yaw: 0.15, top: 5, front: 3, right: 1 },
  { c: [0.52, S, -0.42], yaw: -0.5, top: 2, front: 6, right: 4 },
];
// distance to the pips of one die (Infinity when far away) and to the die itself
function parts(x, y, z, d) {
  const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
  const px = x - d.c[0], py = y - d.c[1], pz = z - d.c[2];
  const lx = c * px - s * pz, lz = s * px + c * pz;
  const cube = box(lx, py, lz, S, S, S, 0.07);
  if (cube > 0.07) return [cube, Infinity]; // detail only near the surface
  let dents = Infinity;
  const g = 0.17, r = 0.068, k = S + 0.03;
  for (const [u, v] of PIPS[d.top]) dents = Math.min(dents, sphere(lx - u * g, py - k, lz - v * g, r));
  for (const [u, v] of PIPS[d.front]) dents = Math.min(dents, sphere(lx - u * g, py - v * g, lz - k, r));
  for (const [u, v] of PIPS[d.right]) dents = Math.min(dents, sphere(lx - k, py - v * g, lz - u * g, r));
  return [Math.max(cube, -dents), dents];
}
const die = (x, y, z, d) => parts(x, y, z, d)[0];
const inPip = (x, y, z) => DICE.some((d) => parts(x, y, z, d)[1] < 0.006);
export default define({
  name: "Dice",
  means: "Two dice. Each lamp position lights a different face; the read-out names the brightest.",
  sdf: (x, y, z) => Math.min(die(x, y, z, DICE[0]), die(x, y, z, DICE[1])),
  albedo: (x, y, z) => (inPip(x, y, z) ? 0.25 : 0.94),
  bound: [0.02, 0.36, -0.07, 1.25],
  rest: [-0.3, 1.5, 1.35],
  read(L) {
    const d = DICE[0], c = Math.cos(d.yaw), s = Math.sin(d.yaw);
    const lx = L.x - d.c[0], ly = L.y - d.c[1], lz = L.z - d.c[2];
    // face normals in world space: top, front (+z local), right (+x local)
    const faces = [[d.top, ly], [d.front, -s * lx + c * lz], [d.right, c * lx + s * lz]];
    faces.sort((a, b) => b[1] - a[1]);
    return `brightest face: ${faces[0][0]}`;
  },
});
