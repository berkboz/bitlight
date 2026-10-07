import type { Figure } from "./figure";
export type { Figure } from "./figure";

/** The two inks, as any CSS colour. Unset = --bitlight-lit / --bitlight-unlit. */
export interface Ink { lit: string; unlit: string }
/** Ordered threshold maps: the order in which dots switch on. */
export type ScreenName = "bayer" | "bayer4" | "dots" | "lines" | "diagonal" | "noise";
export interface LightOptions {
  /** Lamp brightness. Default 2.4. */
  power: number;
  /** Distance falloff: higher = tighter pool of light. Default 0.32. */
  falloff: number;
  /** Fill light on every surface, 0–0.3. Default 0.035. */
  ambient: number;
  /** Tone curve exponent: lower lifts the mid-tones. Default 0.72. */
  contrast: number;
  /** A cone aimed at the middle of the plate instead of a bare lamp. Default false. */
  spot: boolean;
}

export interface MountOptions {
  /** CSS pixels per dot. Integer; default 3. */
  cell?: number;
  /** "auto" follows prefers-color-scheme. Paper ground in light, night ground in dark. */
  theme?: "auto" | "light" | "dark";
  /** The two colours. Default: the CSS custom properties, else paper and ink. */
  ink?: Partial<Ink>;
  /** Dither screen. Default "bayer". */
  screen?: ScreenName;
  /** The lamp. Defaults are LOOK. */
  light?: Partial<LightOptions>;
  /** Accessible name. Default: "<name>. <means>". */
  label?: string;
  /** Called with the caption whenever it changes. */
  onRead?: (text: string) => void;
}

export interface FigureHandle {
  readonly name: string;
  readonly means: string;
  /** Put the lamp under (u, v), 0–1 across the canvas, at once. Returns the caption. */
  lampAt(u: number, v: number): string;
  /** Return the lamp to its rest position at once. Returns the caption. */
  rest(): string;
  /** Re-read --bitlight-lit / --bitlight-unlit, optionally switching theme. */
  retheme(theme?: "auto" | "light" | "dark"): void;
  /** Change ink, screen or light in place (no re-march). Any part may be left out. */
  set(next: { ink?: Partial<Ink>; screen?: ScreenName; light?: Partial<LightOptions> }): void;
  /** The live settings. */
  readonly options: { ink: Partial<Ink>; screen: ScreenName; light: LightOptions };
  readonly stats: { marchMs: number; renderMs: number; cols: number; rows: number; read: string };
  destroy(): void;
}

export function define(figure: Figure): Figure;
export function mount(host: HTMLElement, figure: Figure | string, options?: MountOptions): FigureHandle;
export const figures: Map<string, Figure>;
export function defaultRead(lamp: { x: number; y: number; z: number }): string;
export const LOOK: Readonly<{ AMBIENT: number; POWER: number; FALLOFF: number; GAMMA: number; HALO_DEPTH: number }>;
export const BAYER: Float32Array;
export const SCREENS: Readonly<Record<ScreenName, Float32Array>>;
export const sd: typeof import("./core").sd;

export * from "./figures/index";
