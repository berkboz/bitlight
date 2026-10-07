import type { CSSProperties, ReactElement } from "react";
import type { Figure } from "./figure";
import type { Ink, ScreenName, LightOptions } from "./index";

export interface BitlightProps {
  figure: Figure | string;
  cell?: number;
  theme?: "auto" | "light" | "dark";
  ink?: Partial<Ink>;
  screen?: ScreenName;
  light?: Partial<LightOptions>;
  label?: string;
  onRead?: (text: string) => void;
  className?: string;
  style?: CSSProperties;
}
export function Bitlight(props: BitlightProps): ReactElement;
export default Bitlight;
