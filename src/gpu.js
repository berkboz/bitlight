/*
 * Bitlight on the GPU — the same look, for scenes written in GLSL.
 *
 * mount() caches a still figure and re-lights it. This is the other shape: the
 * whole kernel (march, normal, occlusion, soft shadow, shade, halo, screen) runs
 * as a fragment shader every frame, so geometry may move and lights may be many.
 * It is a transliteration of core.js, not a second opinion: the constants are
 * core's, the screens are core's own SCREENS arrays, the camera is core.camera.
 * If core.js changes, change the GLSL below the same way; test/smoke.mjs renders
 * two scenes both ways and fails if the tones drift apart.
 *
 *   const view = gpu(canvas, { glsl, bound? })      → null without WebGL2 + float targets
 *   view.render({ yaw, pitch, half, target, lights, ambient, contrast, cell, ink, tones,
 *                 palette, screen, theme, haloLight, bound, time })
 *   view.resize() · view.retheme() · view.levels() · view.destroy()
 *
 * The scene GLSL defines `float map(vec3 p)`, optionally `float occ(vec3 p)` (casters
 * only, never the floor: a convex ground cannot shade itself; default = map) and
 * `void material(vec3 p, vec3 n, inout Mat m)`; it may read `uniform float uTime`.
 */
import { LOOK, SCREENS, camera, ramp } from "./core.js";

const MAX_LIGHTS = 8;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const glslFloat = (v) => (/[.e]/.test(String(v)) ? String(v) : v + ".0");   // a JS number as a GLSL float literal, every digit kept

// The sd helpers of core.sd, same names and arguments. GLSL has no defaults, so
// sdBox and sdCylinder are overloaded; `revolve` hands back (radius, y) to feed a 2D profile.
const SD = /* glsl */ `
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdBox(vec3 p, vec3 b) { return sdBox(p, b, 0.0); }
float sdTorus(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
float sdCylinder(vec3 p, float r, float h, float e) {
  vec2 d = vec2(length(p.xz) - r + e, abs(p.y) - h + e);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - e;
}
float sdCylinder(vec3 p, float r, float h) { return sdCylinder(p, r, h, 0.0); }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r;
}
float sdRect(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
vec2 revolve(vec3 p) { return vec2(length(p.xz), p.y); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
`;

const HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
#define MAX_LIGHTS ${MAX_LIGHTS}
struct Mat { float a; float s; float e; };   // core's material: albedo, specular 0|1, emission
uniform float uTime;
uniform vec2 uRes;
uniform float uUnit, uAmbient, uGamma;
uniform vec3 uO, uF, uR, uU;
uniform vec4 uBound;
uniform int uLightCount;
uniform vec4 uLightP[MAX_LIGHTS];   // xyz position, w power
uniform vec4 uLightS[MAX_LIGHTS];   // xyz spot direction, w inner
uniform vec4 uLightX[MAX_LIGHTS];   // x outer (-2 = no spot), y falloff
${SD}`;

// core.js, line for line. The numbers are core's: 180 steps / 0.0007 / 60, e 0.0013,
// five AO taps, 56 shadow steps from 0.015 with 9h/t, 0.004 offset, 0.55 + 0.45 ao, pow 60 · 0.9.
const KERNEL = /* glsl */ `
float march(vec3 o, vec3 f) {
  float t = 0.0;
  for (int s = 0; s < 180; s++) {
    if (t >= 60.0) break;
    float d = map(o + f * t);
    if (d < 0.0007) return t;
    t += d;
  }
  return -1.0;
}
float occlusion(vec3 p, vec3 n) {
  float ao = 0.0, w = 1.0;
  for (int s = 1; s <= 5; s++) { float h = 0.04 * float(s); ao += w * (h - map(p + n * h)); w *= 0.6; }
  return clamp(1.0 - 3.2 * ao, 0.0, 1.0);
}
vec3 calcNormal(vec3 p) {
  const float e = 0.0013;
  float a = map(p + vec3(e, -e, -e)), b = map(p + vec3(-e, -e, e)), c = map(p + vec3(-e, e, -e)), g = map(p + vec3(e, e, e));
  vec3 n = vec3(a - b - c + g, -a - b + c + g, -a + b - c + g);
  float l = length(n);
  return l > 0.0 ? n / l : n;
}
float softShadow(vec3 p, vec3 l, float dist) {
  if (uBound.w > 0.0) {   // rays that miss the sphere around all casters are fully lit
    vec3 oc = p - uBound.xyz;
    float b = dot(oc, l), c = dot(oc, oc) - uBound.w * uBound.w;
    if (c > 0.0 && (b > 0.0 || b * b - c < 0.0)) return 1.0;
  }
  float res = 1.0, t = 0.015;
  for (int s = 0; s < 56; s++) {
    if (t >= dist) break;
    float h = occ(p + l * t);
    if (h < 0.001) return 0.0;
    res = min(res, 9.0 * h / t);
    if (res < 0.01) return 0.0;
    t += max(0.01, h);
  }
  return clamp(res, 0.0, 1.0);
}
float shade(vec3 p, vec3 n, float ao, Mat m) {
  float L = uAmbient * ao;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 l = uLightP[i].xyz - p;
    float dist = length(l);
    l /= dist;
    float ndl = dot(n, l);
    if (ndl <= 0.0) continue;
    float cone = 1.0;
    if (uLightX[i].x > -1.5) {
      float cd = -dot(l, uLightS[i].xyz);
      cone = clamp((cd - uLightX[i].x) / (uLightS[i].w - uLightX[i].x), 0.0, 1.0);
      cone = cone * cone * (3.0 - 2.0 * cone);
      if (cone <= 0.0) continue;
    }
    float sh = softShadow(p + n * 0.004, l, dist);
    if (sh <= 0.0) continue;
    L += ndl * sh * cone * uLightP[i].w / (1.0 + uLightX[i].y * dist * dist) * (0.55 + 0.45 * ao);
    if (m.s > 0.5) {
      vec3 h = l - uF;
      float ndh = dot(n, h) / length(h);
      if (ndh > 0.0) L += sh * cone * pow(ndh, 60.0) * 0.9;
    }
  }
  L = pow(max(L * m.a, 0.0), uGamma);
  return max(m.e, L);
}
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float j = uRes.y - 1.0 - float(c.y);   // row from the top, as mount()
  float sx = (float(c.x) + 0.5 - uRes.x * 0.5) * uUnit, sy = -(j + 0.5 - uRes.y * 0.5) * uUnit;
  vec3 ro = uO + uR * sx + uU * sy;
  float t = march(ro, uF);
  if (t < 0.0) { o = vec4(-1.0, 1e9, 0.0, 0.0); return; }   // a miss: lum < 0, depth far
  vec3 p = ro + uF * t, n = calcNormal(p);
  Mat m = Mat(0.9, 0.0, 0.0);
  material(p, n, m);
  o = vec4(shade(p, n, occlusion(p, n), m), t, 0.0, 0.0);
}`;

// Pass 2: core.ditherLevels per output pixel. `uCell` output pixels make one dot.
const DITHER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;   // the fragment default is lowp: it would round the float lum and depth
uniform sampler2D uScene, uScreen;
uniform ivec2 uCells;
uniform int uCell, uOutH, uLevels, uGround, uDebug;
uniform float uHaloLight;
uniform vec3 uPal[16];
out vec4 o;
float behind(ivec2 q, float d) {   // brightness of a neighbour that stands in front by more than HALO_DEPTH, else -1
  if (q.x < 0 || q.y < 0 || q.x >= uCells.x || q.y >= uCells.y) return -1.0;
  vec2 s = texelFetch(uScene, q, 0).xy;
  return d - s.y > ${glslFloat(LOOK.HALO_DEPTH)} ? s.x : -1.0;
}
void main() {
  int i = int(gl_FragCoord.x) / uCell, j = (uOutH - 1 - int(gl_FragCoord.y)) / uCell;   // dot, row 0 on top
  ivec2 c = ivec2(i, uCells.y - 1 - j);
  vec2 s = texelFetch(uScene, c, 0).xy;
  int top = uLevels - 1, level = uGround;
  if (s.x >= 0.0) {
    float th = texelFetch(uScreen, ivec2(i & 7, j & 7), 0).r;
    float near = max(max(behind(c - ivec2(1, 0), s.y), behind(c + ivec2(1, 0), s.y)), max(behind(c - ivec2(0, 1), s.y), behind(c + ivec2(0, 1), s.y)));
    float v = clamp(s.x, 0.0, 1.0) * float(top), base = floor(v);
    level = near > -1.0 && (uHaloLight <= 0.0 || max(near, s.x) > uHaloLight) ? top : min(top, int(base) + (v - base > th ? 1 : 0));
  }
  o = uDebug == 1 ? vec4(float(level) / 255.0, 0.0, 0.0, 1.0) : vec4(uPal[level], 1.0);
}`;

const VS = `#version 300 es
void main() { gl_Position = vec4(float((gl_VertexID << 1) & 2) * 2.0 - 1.0, float(gl_VertexID & 2) * 2.0 - 1.0, 0.0, 1.0); }`;

let probe = null;   // as bitlight.js: a 1×1 canvas turns any CSS colour into bytes
function parseColor(str, fallback) {
  probe ||= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  probe.fillStyle = fallback;
  probe.fillStyle = (str || "").trim() || fallback;
  probe.clearRect(0, 0, 1, 1);   // a see-through colour must not blend with the one parsed before
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

/** Compiles a program; the error says where your GLSL starts, since line numbers count from the generated source. */
function program(gl, fs, vs = VS, own = 0) {
  const shaders = [], p = gl.createProgram();
  try {
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(type);
      shaders.push(sh);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        throw new Error(`bitlight/gpu: shader failed${own ? ` (your glsl starts at line ${own})` : ""}\n${gl.getShaderInfoLog(sh)}`);
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`bitlight/gpu: ${gl.getProgramInfoLog(p)}`);
  } catch (e) { gl.deleteProgram(p); throw e; }
  finally { for (const sh of shaders) gl.deleteShader(sh); }   // a linked program keeps its binaries
  const cache = new Map();
  p.at = (name) => { if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name)); return cache.get(name); };
  return p;
}

function texture(gl, internal, format, type, w, h, data = null) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return tex;
}

/** A texture you can draw into. */
function target(gl, internal, format, type, w, h) {
  const tex = texture(gl, internal, format, type, w, h), fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const done = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!done) throw new Error("bitlight/gpu: this GPU cannot render to a float texture");
  return { tex, fbo };
}

export function gpu(canvas, opts = {}) {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
  if (!opts.glsl) throw new Error('bitlight/gpu: "glsl" is required (it defines map)');

  const src = opts.glsl;
  const tail = (/\bfloat\s+occ\s*\(/.test(src) ? "" : "\nfloat occ(vec3 p) { return map(p); }")
    + (/\bvoid\s+material\s*\(/.test(src) ? "" : "\nvoid material(vec3 p, vec3 n, inout Mat m) {}");
  const scene = program(gl, HEAD + src + tail + KERNEL, VS, HEAD.split("\n").length);
  const dither = program(gl, DITHER);

  const prefersDark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const LP = new Float32Array(MAX_LIGHTS * 4), LS = new Float32Array(MAX_LIGHTS * 4), LX = new Float32Array(MAX_LIGHTS * 4);
  const pal = new Float32Array(48);
  let W = 0, H = 0, cellPx = 1, sceneT = null, levelsT = null;
  let screenName = "", screenTex = null, inks = null, inkKey = "", last = null;

  function alloc(cols, rows) {
    sceneT && (gl.deleteTexture(sceneT.tex), gl.deleteFramebuffer(sceneT.fbo));
    levelsT && (gl.deleteTexture(levelsT.tex), gl.deleteFramebuffer(levelsT.fbo), levelsT = null);
    sceneT = target(gl, gl.RG32F, gl.RG, gl.FLOAT, cols, rows);   // lum, depth per dot
    W = cols; H = rows;
  }

  // ink / theme / ground, as bitlight.js readTheme(); cached, so a frame never parses a colour
  function readInks(o) {
    const key = JSON.stringify([o.ink, o.tones, o.palette, o.theme]);
    if (inks && key === inkKey) return inks;
    const theme = o.theme || "auto", dark = theme === "dark" || (theme === "auto" && !!prefersDark && prefersDark.matches);
    const cs = getComputedStyle(canvas), ink = o.ink || {};
    const unlit = parseColor(ink.unlit || cs.getPropertyValue("--bitlight-unlit"), dark ? "#0e100e" : "#121411");
    const lit = parseColor(ink.lit || cs.getPropertyValue("--bitlight-lit"), dark ? "#d9dcd2" : "#e4e6df");
    const colours = o.palette && o.palette.length > 1 ? o.palette.slice(0, 16).map((c) => parseColor(c, "#808080"))
      : ramp(unlit, lit, clamp(Math.round(o.tones || 2), 2, 16));
    colours.forEach((c, i) => { pal[i * 3] = c[0] / 255; pal[i * 3 + 1] = c[1] / 255; pal[i * 3 + 2] = c[2] / 255; });
    inkKey = key;
    return (inks = { levels: colours.length, ground: dark ? 0 : colours.length - 1 }); // paper ground in light, night ground in dark
  }
  const onScheme = () => { inks = null; };
  prefersDark && prefersDark.addEventListener("change", onScheme);

  function setScreen(name) {
    if (name === screenName) return;
    if (!SCREENS[name]) throw new Error(`bitlight/gpu: no screen called "${name}" (${Object.keys(SCREENS).join(", ")})`);
    screenTex && gl.deleteTexture(screenTex);
    screenTex = texture(gl, gl.R32F, gl.RED, gl.FLOAT, 8, 8, SCREENS[name]);   // core's own array, never re-derived
    screenName = name;
  }

  // pass 2 into `fbo` (null = the canvas): threshold, tones and ink
  function ditherPass(fbo, w, h, cell, debug) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(dither);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, screenTex);
    gl.uniform1i(dither.at("uScene"), 0); gl.uniform1i(dither.at("uScreen"), 1);
    gl.uniform2i(dither.at("uCells"), W, H);
    gl.uniform1i(dither.at("uCell"), cell); gl.uniform1i(dither.at("uOutH"), h);
    gl.uniform1i(dither.at("uLevels"), last.levels); gl.uniform1i(dither.at("uGround"), last.ground);
    gl.uniform1i(dither.at("uDebug"), debug); gl.uniform1f(dither.at("uHaloLight"), last.haloLight);
    gl.uniform3fv(dither.at("uPal"), pal);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const view = {
    /** Match the canvas to its CSS size × devicePixelRatio. Call when the layout changes. */
    resize() {
      const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
      if (canvas.clientWidth && canvas.clientHeight) {
        canvas.width = Math.round(canvas.clientWidth * dpr);
        canvas.height = Math.round(canvas.clientHeight * dpr);
      }
    },
    /** Re-read colours, e.g. after the page switched theme or the --bitlight-* properties changed. */
    retheme() { inks = null; },
    /** Draw one frame. Everything is optional; see gpu.d.ts. */
    render(o = {}) {
      // `cell` is CSS px per dot; the canvas buffer may be denser (devicePixelRatio)
      const scale = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
      cellPx = Math.max(1, Math.round((o.cell || 3) * scale));
      const cols = Math.ceil(canvas.width / cellPx), rows = Math.ceil(canvas.height / cellPx);
      if (cols !== W || rows !== H) alloc(cols, rows);
      setScreen(o.screen || "bayer");
      const { levels, ground } = readInks(o);
      last = { levels, ground, haloLight: o.haloLight || 0 };

      const { f, r, u } = camera(o.yaw ?? 45, o.pitch ?? 30), t = o.target || [0, 0, 0], bound = o.bound || opts.bound;
      const lights = o.lights || [], n = Math.min(lights.length, MAX_LIGHTS);
      for (let i = 0; i < n; i++) {
        const lt = lights[i], b = i * 4, sp = lt.spot;
        LP[b] = lt.p[0]; LP[b + 1] = lt.p[1]; LP[b + 2] = lt.p[2]; LP[b + 3] = lt.power ?? LOOK.POWER;
        LX[b] = sp ? sp.outer : -2; LX[b + 1] = lt.falloff ?? LOOK.FALLOFF;
        if (sp) { LS[b] = sp.dir[0]; LS[b + 1] = sp.dir[1]; LS[b + 2] = sp.dir[2]; LS[b + 3] = sp.inner; }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fbo);
      gl.viewport(0, 0, W, H);
      gl.useProgram(scene);
      gl.uniform1f(scene.at("uTime"), o.time || 0);
      gl.uniform2f(scene.at("uRes"), W, H);
      gl.uniform1f(scene.at("uUnit"), (2 * (o.half ?? 2.3)) / W);
      gl.uniform1f(scene.at("uAmbient"), o.ambient ?? LOOK.AMBIENT);
      gl.uniform1f(scene.at("uGamma"), o.contrast ?? LOOK.GAMMA);
      gl.uniform3f(scene.at("uO"), t[0] - f[0] * 25, t[1] - f[1] * 25, t[2] - f[2] * 25);
      gl.uniform3f(scene.at("uF"), f[0], f[1], f[2]);
      gl.uniform3f(scene.at("uR"), r[0], r[1], r[2]);
      gl.uniform3f(scene.at("uU"), u[0], u[1], u[2]);
      gl.uniform4f(scene.at("uBound"), bound ? bound[0] : 0, bound ? bound[1] : 0, bound ? bound[2] : 0, bound ? bound[3] : 0);
      gl.uniform1i(scene.at("uLightCount"), n);
      gl.uniform4fv(scene.at("uLightP"), LP); gl.uniform4fv(scene.at("uLightS"), LS); gl.uniform4fv(scene.at("uLightX"), LX);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ditherPass(null, canvas.width, canvas.height, cellPx, 0);
    },
    /** Tone index of every dot of the last frame, row 0 on top (for tests). Reads back; not for the frame loop. */
    levels() {
      if (!last) throw new Error("bitlight/gpu: levels() before render()");
      levelsT ||= target(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, W, H);
      ditherPass(levelsT.fbo, W, H, 1, 1);
      const px = new Uint8Array(W * H * 4), out = new Uint8Array(W * H);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) out[j * W + i] = px[((H - 1 - j) * W + i) * 4];
      return out;
    },
    /** Dots across and down, as of the last render. */
    get cols() { return W; },
    get rows() { return H; },
    destroy() {
      prefersDark && prefersDark.removeEventListener("change", onScheme);
      for (const t of [sceneT, levelsT]) t && (gl.deleteTexture(t.tex), gl.deleteFramebuffer(t.fbo));
      screenTex && gl.deleteTexture(screenTex);
      gl.deleteProgram(scene); gl.deleteProgram(dither);
    },
  };
  view.resize();
  return view;
}
