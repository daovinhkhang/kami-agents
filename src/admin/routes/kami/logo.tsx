/* ------------------------------------------------------------------ */
/*  KAMI logo + icon constant                                          */
/* ------------------------------------------------------------------ */

import kamiIcon from "./kami-icon.png"

export const KAMI_ICON_SRC = kamiIcon

export const KamiLogo = ({ className = "size-6" }: { className?: string }) => (
  <img
    src={KAMI_ICON_SRC}
    alt="KAMI"
    className={`${className} shrink-0 rounded-full object-cover`}
    loading="eager"
  />
)
