// Compiled with tsc --noEmit by test/smoke.mjs: the published types must accept real use.
import { mount, define, sd, orb, type Figure } from "../src/index.js";
import { Bitlight } from "../src/react.js";
import { createElement } from "react";

const mine: Figure = define({
  name: "Block", means: "A block.", sdf: (x, y, z) => sd.box(x, y - 0.3, z, 0.3, 0.3, 0.3, 0.02),
  bound: [0, 0.3, 0, 0.6], rest: [-0.3, 1.5, 1.35],
});
const h = mount(document.createElement("div"), orb, { cell: 3, theme: "dark", onRead: (t: string) => t.length });
h.lampAt(0.5, 0.5); h.rest(); h.retheme("light"); h.destroy();
const el = createElement(Bitlight, { figure: mine, cell: 2 });
export { el };
