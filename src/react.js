// React binding. Renders a wrapper <div>; the figure mounts into a child it owns,
// so React never fights the kernel over attributes.
//   import { Bitlight } from "bitlight/react";
//   import { orb } from "bitlight";
//   <Bitlight figure={orb} cell={3} onRead={setCaption} />
import { createElement, useEffect, useRef } from "react";
import { mount } from "./bitlight.js";

export function Bitlight({ figure, cell = 3, theme = "auto", label, onRead, className, style }) {
  const wrap = useRef(null);
  const read = useRef(onRead);
  read.current = onRead;
  useEffect(() => {
    const host = document.createElement("div");
    wrap.current.appendChild(host);
    const handle = mount(host, figure, { cell, theme, label, onRead: (t) => read.current && read.current(t) });
    return () => { handle.destroy(); host.remove(); };
  }, [figure, cell, theme, label]);
  return createElement("div", { ref: wrap, className, style });
}

export default Bitlight;
