// Entry for dist/bitlight.global.js: <script src> users get window.Bitlight
// with every figure already registered.
import * as api from "./index.js";
import * as all from "./figures/index.js";

globalThis.Bitlight = { ...api, all };
