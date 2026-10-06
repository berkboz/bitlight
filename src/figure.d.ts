/** A Bitlight figure definition, as passed to define() and mount(). */
export interface Figure {
  /** Display name, e.g. "Orb". Also the registry key (lower-cased). */
  name: string;
  /** One sentence for screen readers: what it is and what the light does. */
  means: string;
  /** Signed distance to the object. The plate top is y = 0. */
  sdf(x: number, y: number, z: number): number;
  /** Sphere [x, y, z, r] enclosing the whole object; used to cull shadow rays. */
  bound: [number, number, number, number];
  /** Lamp position at rest. This frame is the thumbnail. */
  rest: [number, number, number];
  /** Object tone 0–1 per surface point. Default 0.92. */
  albedo?(x: number, y: number, z: number): number;
  /** Plate tone 0–1 per surface point. Default 0.86. */
  plateTone?(x: number, y: number, z: number): number;
  /** Camera and plate overrides. */
  view?: Partial<{ half: number; lift: number; yaw: number; pitch: number; plate: number; cols: number; rows: number; lampY: number }>;
  /** Caption from the current lamp position. Default "az 214° · el 38°". */
  read?(lamp: { x: number; y: number; z: number }): string;
}

declare const figure: Figure;
export default figure;
