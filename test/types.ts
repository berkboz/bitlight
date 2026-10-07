// Compiled with tsc --noEmit by test/smoke.mjs: the published types must accept real use.
import { mount, define, sd, orb, SCREENS, type Figure, type ScreenName } from "../src/index.js";
import { Bitlight } from "../src/react.js";
import { createElement } from "react";

const mine: Figure = define({
  name: "Block", means: "A block.", sdf: (x, y, z) => sd.box(x, y - 0.3, z, 0.3, 0.3, 0.3, 0.02),
  bound: [0, 0.3, 0, 0.6], rest: [-0.3, 1.5, 1.35],
});
const h = mount(document.createElement("div"), orb, { cell: 3, theme: "dark", onRead: (t: string) => t.length });
const screen: ScreenName = "dots";
h.set({ ink: { lit: "#f04820" }, screen, light: { power: 3, spot: true } });
const cur: { ink: { lit?: string }; screen: ScreenName } = h.options; const map: Float32Array = SCREENS[cur.screen];
h.lampAt(0.5, 0.5); h.rest(); h.retheme("light"); h.destroy();
const el = createElement(Bitlight, { figure: mine, cell: 2, ink: { lit: "#fff" }, screen: "lines", light: { spot: true } });
export { el, map };
