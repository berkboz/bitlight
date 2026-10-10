import type { Ink, ScreenName } from "./index";
import type { Light } from "./core";

export interface GpuOptions {
  /**
   * The scene, in GLSL ES 3.00. Define `float map(vec3 p)`; optionally `float occ(vec3 p)` (what casts
   * shadow: never the floor, a convex ground cannot shade itself; default `map`) and
   * `void material(vec3 p, vec3 n, inout Mat m)` (`Mat` has `a` albedo 0–1, `s` specular 0|1, `e` emission;
   * it starts at a = 0.9). `uniform float uTime` is the `time` of render(); declare more of your own
   * (`uniform vec3 uBall;`) and set them each frame with `uniforms`.
   *
   * The helpers of core's `sd`, same arguments: `sdSphere(p, r)`, `sdBox(p, b[, r])`, `sdTorus(p, R, r)`,
   * `sdCylinder(p, r, h[, e])`, `sdCapsule(p, a, b, r)`, `sdRect(vec2 p, vec2 b)`, `smin(a, b, k)`, and
   * `vec2 revolve(p)` = (radius, y) to feed a 2D profile.
   */
  glsl: string;
  /** [x, y, z, r] sphere around everything in `occ`; shadow rays that miss it are lit. Default: none. */
  bound?: [number, number, number, number];
}

export interface GpuFrame {
  /** Camera, degrees. Defaults 45 / 30 (as figures). Orthographic, placed 25 units from `target`. */
  yaw?: number;
  pitch?: number;
  /** Half the visible width in world units. Default 2.3. */
  half?: number;
  /** The point the camera looks at. Default [0, 0, 0]. */
  target?: [number, number, number];
  /** Up to 8 lights (the rest are ignored), core's Light: `{ p, power?, falloff?, spot?: { dir, inner, outer } }`. Default none. */
  lights?: Light[];
  /** Fill light, default 0.035. */
  ambient?: number;
  /** Tone curve exponent (mount's `light.contrast`), default 0.72. */
  contrast?: number;
  /** CSS pixels per dot, default 3. The canvas buffer may be denser than CSS px; a dot is always whole buffer pixels. */
  cell?: number;
  /** As mount(): the two inks, else --bitlight-lit / --bitlight-unlit on the canvas, else paper and ink. */
  ink?: Partial<Ink>;
  /** Number of inks, 2–16, stepped from unlit to lit. Default 2. */
  tones?: number;
  /** CSS colours, darkest first; sets the inks and their number exactly. Overrides `tones`. */
  palette?: string[];
  /** Default "bayer". */
  screen?: ScreenName;
  /** "auto" follows prefers-color-scheme; misses paint paper in light, night in dark. Default "auto". */
  theme?: "auto" | "light" | "dark";
  /** Halo only where either side is brighter than this: films use 0.12, figures (and the default) 0. */
  haloLight?: number;
  /** Overrides GpuOptions.bound for this frame, for casters that move. */
  bound?: [number, number, number, number];
  /** Seconds; read in your GLSL as `uTime`. */
  time?: number;
  /** Your scene's own uniforms by name: a number sets a `float`, an array of 2–4 a `vec2`–`vec4`. Names the GLSL does not declare are skipped. */
  uniforms?: Record<string, number | number[]>;
}

export interface GpuView {
  /** Draw one frame. Nothing is cached: map, shadows and lights are evaluated every call. */
  render(frame?: GpuFrame): void;
  /** Size the canvas buffer to its CSS size × devicePixelRatio. Done once by gpu(); call again when the layout changes. */
  resize(): void;
  /** Re-read the ink colours (after a theme switch or a change of --bitlight-* properties). */
  retheme(): void;
  /** Tone index (0 … tones−1) of every dot of the last frame, row-major, row 0 on top. Reads the GPU back: for tests. */
  levels(): Uint8Array;
  /** Dots across and down, as of the last render(). */
  readonly cols: number;
  readonly rows: number;
  destroy(): void;
}

/**
 * Bitlight's look as a WebGL2 fragment shader, for scenes with moving geometry and many lights.
 * Returns `null` when the canvas has no WebGL2 or the GPU cannot render to float textures
 * (EXT_color_buffer_float), or already has another kind of context; throws if `glsl` does not compile
 * (the message names the line where yours starts).
 */
export function gpu(canvas: HTMLCanvasElement, options: GpuOptions): GpuView | null;
