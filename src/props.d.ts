type V = number;
type Field = (x: V, y: V, z: V) => V;
/** The computer: base at y = 0, front at z = +0.4. `fan` = blade angle in radians. */
export function tower(x: V, y: V, z: V, fan: V): V;
export function towerPart(x: V, y: V, z: V): "light" | "well" | "blade" | "body";
export const LAMP_HEAD: [V, V, V], LAMP_DIR: [V, V, V], TX: V, TY: V;
export const deskFrame: Field, deskGear: Field;
export function deskLamp(x: V, y: V, z: V, withShade: boolean): V;
export function deskObjects(x: V, y: V, z: V, withShade: boolean): V;
export const DESK_BOUNDS: Record<"frame" | "gear" | "lamp", [V, V, V, V, V, V]>;
export const P: V, ROW: V;
export const rackUnit: Field, rack: Field;
export const HINGE_Y: V, HINGE_Z: V;
export function laptop(x: V, y: V, z: V, lidAngle: V): V;
export function cafe(x: V, y: V, z: V, lidAngle: V): V;
export const PUFFS: [V, V, V, V][];
export const cloud: Field;
