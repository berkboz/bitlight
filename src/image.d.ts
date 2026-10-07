import type { ScreenName } from "./index";
export { SCREENS, ramp } from "./core";
export interface TuneOptions {
  /** Stretch the 1st–99th percentile to 0–1. Default true. */
  auto?: boolean;
  /** [lo, hi] 0–255 to stretch with instead of measuring. */
  range?: [number, number];
  contrast?: number; brightness?: number; gamma?: number;
  /** 0–2 unsharp mask over one cell. */
  sharpen?: number; invert?: boolean;
}
export interface DitherOptions { screen?: ScreenName | Float32Array; tones?: number; out?: Uint8Array }
export interface ProcessOptions extends TuneOptions, DitherOptions { cols?: number }
export function lumaFromRGBA(rgba: ArrayLike<number>, w: number, h: number): Float32Array;
export function toGrid(lum: Float32Array, w: number, h: number, cols: number, rows?: number): { lum: Float32Array; W: number; H: number };
export function levelsOf(lum: Float32Array): [number, number];
export function tune(lum: Float32Array, W: number, H: number, o?: TuneOptions): Float32Array;
export function dither(lum: Float32Array, W: number, H: number, o?: DitherOptions): Uint8Array;
export function paint(levels: Uint8Array, W: number, H: number, colours: number[][], cell?: number, out?: Uint8ClampedArray): Uint8ClampedArray;
export function process(rgba: ArrayLike<number>, w: number, h: number, o?: ProcessOptions): { levels: Uint8Array; W: number; H: number };
