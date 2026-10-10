// node lab/slack/shot.mjs "<query>" <seconds> <out.png> [js to run first]
// A screenshot of the game in headless Chromium with software WebGL2, so the GPU floor shows.
// e.g. node lab/slack/shot.mjs "s=dive&x=600&y=236" 3 /tmp/a.png
import { chromium } from "playwright";
import { serve } from "../../serve.mjs";

const [query = "s=deck", secs = "2", out = "shot.png", pre = ""] = process.argv.slice(2);
const { url, close } = await serve(0);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
// PHONE=844x390 emulates a touch phone at that viewport
const phone = process.env.PHONE ? process.env.PHONE.split("x").map(Number) : null;
const page = await browser.newPage(phone ? { viewport: { width: phone[0], height: phone[1] }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${url}/lab/slack/index.html?${query}`);
await page.waitForFunction(() => window.__slack);
const info = await page.evaluate(([s, pre]) => { if (pre) new Function("S", "D", pre)(window.__slack, window.__slack.D); const t0 = performance.now(), r = window.__slack.run(+s); return { ...r, ms: +((performance.now() - t0) / (+s * 30)).toFixed(1), hud: document.querySelector("#hud").textContent, log: window.__log }; }, [secs, pre]);
console.log(JSON.stringify(info), errors.length ? "\nERRORS:\n" + errors.join("\n") : "");
await (phone ? page : page.locator("#stage")).screenshot({ path: out, timeout: 60000 }).catch((e) => console.log("no screenshot:", e.message.split("\n")[0]));
await browser.close(); await close();
