// Entry for dist/bitlight.global.js: <script src> users get window.Bitlight
// with every figure already registered.
import * as api from "./index.js";
import * as all from "./figures/index.js";
import * as image from "./image.js";

globalThis.Bitlight = { ...api, all, image };
