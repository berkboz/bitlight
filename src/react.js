// React binding. Renders a wrapper <div>; the figure mounts into a child it owns,
// so React never fights the kernel over attributes.
//   import { Bitlight } from "bitlight/react";
//   import { orb } from "bitlight";
//   <Bitlight figure={orb} cell={3} ink={{ lit: "#ffb000", unlit: "#1a0f00" }} screen="dots" onRead={setCaption} />
import { createElement, useEffect, useRef } from "react";
import { mount } from "./bitlight.js";

export function Bitlight({ figure, cell = 3, theme = "auto", ink, tones, palette, screen, light, label, onRead, className, style }) {
  const wrap = useRef(null);
  const read = useRef(onRead);
  read.current = onRead;
  const handle = useRef(null);
  const live = useRef({ ink, tones, palette, screen, light });
  live.current = { ink, tones, palette, screen, light };
  useEffect(() => {
    const host = document.createElement("div");
    wrap.current.appendChild(host);
    const h = handle.current = mount(host, figure, { cell, theme, label, ...live.current, onRead: (t) => read.current && read.current(t) });
    return () => { h.destroy(); handle.current = null; host.remove(); };
  }, [figure, cell, theme, label]);
  // ink, screen and light change in place: no re-march
  const key = JSON.stringify([ink, tones, palette, screen, light]);
  useEffect(() => { handle.current && handle.current.set({ ink, tones, palette, screen, light }); }, [key]);
  return createElement("div", { ref: wrap, className, style });
}

export default Bitlight;
