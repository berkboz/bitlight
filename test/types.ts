// Compiled with tsc --noEmit by test/smoke.mjs: the published types must accept real use.
import { mount, define, sd, orb, SCREENS, type Figure, type ScreenName } from "../src/index.js";
import { Bitlight } from "../src/react.js";
import { process as processImage, paint, ramp } from "../src/image.js";
const shot = processImage(new Uint8ClampedArray(16), 2, 2, { cols: 2, screen: "dots", tones: 4 });
const rgba: Uint8ClampedArray = paint(shot.levels, shot.W, shot.H, ramp([0, 0, 0], [255, 255, 255], 4), 2);
import { createElement } from "react";

const mine: Figure = define({
  name: "Block", means: "A block.", sdf: (x, y, z) => sd.box(x, y - 0.3, z, 0.3, 0.3, 0.3, 0.02),
  bound: [0, 0.3, 0, 0.6], rest: [-0.3, 1.5, 1.35],
});
const h = mount(document.createElement("div"), orb, { cell: 3, theme: "dark", onRead: (t: string) => t.length });
const screen: ScreenName = "dots";
h.set({ ink: { lit: "#f04820" }, screen, tones: 4, palette: ["#000", "#fff"], light: { power: 3, spot: true } });
const cur: { ink: { lit?: string }; screen: ScreenName } = h.options; const map: Float32Array = SCREENS[cur.screen];
h.lampAt(0.5, 0.5); h.rest(); h.retheme("light"); h.destroy();
const el = createElement(Bitlight, { figure: mine, cell: 2, ink: { lit: "#fff" }, screen: "lines", light: { spot: true } });
import { gpu, type GpuView } from "../src/gpu.js";
const view: GpuView | null = gpu(document.createElement("canvas"), { glsl: "uniform vec3 uBall; float map(vec3 p) { return min(p.y, sdSphere(p - uBall, .5)); }", bound: [0, 0, 0, 1] });
view?.render({ time: 1, uniforms: { uBall: [0, 0.5, 0], uUnused: 2 } });
view?.render({ yaw: 30, lights: [{ p: [0, 1, 0], spot: { dir: [0, -1, 0], inner: 0.9, outer: 0.7 } }], screen: "dots", tones: 4, time: 1 });
const tones: Uint8Array | undefined = view?.levels();
export { el, map, rgba, tones };
