export const LOOK: Readonly<{ AMBIENT: number; POWER: number; FALLOFF: number; GAMMA: number; HALO_DEPTH: number }>;
export const BAYER: Float32Array;
export const SCREENS: Readonly<Record<"bayer" | "bayer4" | "dots" | "lines" | "diagonal" | "noise", Float32Array>>;
type V = number;
export const sd: {
  sphere(x: V, y: V, z: V, r: V): V;
  box(x: V, y: V, z: V, bx: V, by: V, bz: V, r?: V): V;
  torus(x: V, y: V, z: V, R: V, r: V): V;
  cylinder(x: V, y: V, z: V, r: V, h: V, e?: V): V;
  capsule(x: V, y: V, z: V, ax: V, ay: V, az: V, bx: V, by: V, bz: V, r: V): V;
  rect(x: V, y: V, bx: V, by: V): V;
  revolve(x: V, y: V, z: V, profile: (r: V, y: V) => V): V;
  smin(a: V, b: V, k: V): V;
};
export interface Light { p: [V, V, V]; power?: V; falloff?: V; spot?: { dir: [V, V, V]; inner: V; outer: V } }
export interface Material { a: V; s: 0 | 1; e: V }
type Field = (x: V, y: V, z: V) => V;
export function softShadow(occ: Field, x: V, y: V, z: V, lx: V, ly: V, lz: V, dist: V, bound?: [V, V, V, V]): V;
export function occlusion(map: Field, x: V, y: V, z: V, nx: V, ny: V, nz: V): V;
export function normal(map: Field, x: V, y: V, z: V, out: [V, V, V], e?: V): void;
export function shade(x: V, y: V, z: V, nx: V, ny: V, nz: V, ao: V, mat: Material, lights: Light[], ambient: V, view: [V, V, V], occ: Field, bound?: [V, V, V, V], gamma?: V): V;
export function dither(lum: Float32Array, depth: Float32Array, W: V, H: V, bits: Uint8Array, stride: V, x0: V, y0: V, ground: 0 | 1, haloLight?: V, screen?: Float32Array): void;
export function camera(yaw: V, pitch: V): { f: [V, V, V]; r: [V, V, V]; u: [V, V, V] };
export function march(map: Field, ox: V, oy: V, oz: V, fx: V, fy: V, fz: V, maxT?: V, steps?: V): V;
export function lampAngles(p: [V, V, V], target?: [V, V, V]): { az: V; el: V };
export function ditherLevels(lum: Float32Array, depth: Float32Array | null, W: number, H: number, out: Uint8Array, stride: number, x0: number, y0: number, ground: number, haloLight?: number, screen?: Float32Array, levels?: number): void;
export function ramp(unlit: number[], lit: number[], levels: number): number[][];
