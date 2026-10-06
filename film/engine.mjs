// Film engine — Bitlight offline. All shading comes from src/core.js, the same
// code the interactive figures run; only the frame loop lives here. Nothing is
// cached: geometry, camera and lights may change every frame, a scene may hold
// several lights, spot cones and emissive surfaces. Output is one bit per cell;
// type.mjs adds the words.
import { LOOK, sd, shade, dither, occlusion, normal, camera, march, lampAngles } from "../src/core.js";

export { sd };

// Material scratch written by a scene's mat(): albedo, specular on/off, emission 0–1.
export const M = { a: 0.9, s: 0, e: 0 };

/**
 * scene = {
 *   camera: { yaw, pitch, half, target: [x, y, z] }   orthographic
 *   map(x, y, z)  distance to everything visible
 *   occ(x, y, z)  distance to everything that casts shadow (default: map; leave the floor out)
 *   mat(x, y, z, nx, ny, nz)  writes M for the surface at a hit
 *   lights: [{ p: [x, y, z], power?, falloff?, spot?: { dir, inner, outer } }]
 *   ambient?: fill light (night shots: 0)
 *   haloLight?: halo only where this bright (default 0.12; 0 = always)
 *   ground: 0 | 1   bit for rays that hit nothing
 * }
 * Writes W×H bits into `bits` (row stride `stride`) at (x0, y0).
 */
export function render(scene, bits, stride, x0, y0, W, H) {
  const { f, r, u } = camera(scene.camera.yaw, scene.camera.pitch);
  const unit = (2 * scene.camera.half) / W;
  const [tx, ty, tz] = scene.camera.target;
  const cx = tx - f[0] * 25, cy = ty - f[1] * 25, cz = tz - f[2] * 25;
  const map = scene.map, occ = scene.occ || scene.map, amb = scene.ambient ?? LOOK.AMBIENT;
  const N = W * H;
  const depth = scene._depth && scene._depth.length >= N ? scene._depth : (scene._depth = new Float32Array(N));
  const lum = scene._lum && scene._lum.length >= N ? scene._lum : (scene._lum = new Float32Array(N));
  const n = [0, 0, 0];

  for (let j = 0, k = 0; j < H; j++) {
    for (let i = 0; i < W; i++, k++) {
      const sx = (i + 0.5 - W / 2) * unit, sy = -(j + 0.5 - H / 2) * unit;
      const ox = cx + r[0] * sx + u[0] * sy, oy = cy + u[1] * sy, oz = cz + r[2] * sx + u[2] * sy;
      const t = march(map, ox, oy, oz, f[0], f[1], f[2]);
      if (t < 0) { depth[k] = 1e9; lum[k] = -1; continue; }
      depth[k] = t;
      const x = ox + f[0] * t, y = oy + f[1] * t, z = oz + f[2] * t;
      normal(map, x, y, z, n, 0.0012);
      M.a = 0.9; M.s = 0; M.e = 0;
      scene.mat(x, y, z, n[0], n[1], n[2]);
      const ao = occlusion(map, x, y, z, n[0], n[1], n[2]);
      lum[k] = shade(x, y, z, n[0], n[1], n[2], ao, M, scene.lights, amb, f, occ);
    }
  }
  dither(lum, depth, W, H, bits, stride, x0, y0, scene.ground ? 1 : 0, scene.haloLight ?? 0.12);
}

// lamp angle read-out, as on the interactive figures, in the film's capitals
export function readLamp(p, target) {
  const { az, el } = lampAngles(p, target);
  return `AZ ${String(az).padStart(3, "0")}° EL ${String(el).padStart(2, "0")}°`;
}
