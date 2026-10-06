import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Bitlight } from "../src/react.js";
import { orb, gear } from "../src/index.js";

const root = createRoot(document.getElementById("app"));
const reads = [];
window.mountReact = (which) => flushSync(() => root.render(createElement(Bitlight, { figure: which === "gear" ? gear : orb, cell: 2, onRead: (t) => reads.push(t) })));
window.unmountReact = () => flushSync(() => root.render(null));
window.reads = reads;
