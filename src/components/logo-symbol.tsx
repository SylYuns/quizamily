// Symbole dessiné de l'emblème de la famille (vache, lézard, chien), recolorable selon la
// couleur choisie. Conversion fidèle de docs/maquettes/soleil/Logo.dc.html (SVG en dur) vers
// react-native-svg (design.md, 2026-11-24).
import { Circle, Ellipse, Path, Rect, Svg } from "react-native-svg";

import { EMBLEM_PALETTE, type EmblemColor, type EmblemSymbol } from "@/constants/soleil";

const DEFAULT_COLOR_BY_SYMBOL: Record<EmblemSymbol, EmblemColor> = {
  vache: "bleu",
  lezard: "jaune",
  chien: "vert",
};

export function LogoSymbol({
  symbol,
  color,
  size,
}: {
  symbol: EmblemSymbol;
  color?: EmblemColor;
  size: number;
}) {
  const palette = EMBLEM_PALETTE[color ?? DEFAULT_COLOR_BY_SYMBOL[symbol]];
  const pad = Math.round(size * 0.1);
  const inner = size - pad * 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={palette.light} />
      <Svg x={pad} y={pad} width={inner} height={inner} viewBox="0 0 48 48">
        {symbol === "vache" && <VacheArt color={palette} />}
        {symbol === "lezard" && <LezardArt color={palette} />}
        {symbol === "chien" && <ChienArt color={palette} />}
      </Svg>
    </Svg>
  );
}

type Palette = { main: string; dark: string; light: string };

function VacheArt({ color }: { color: Palette }) {
  return (
    <>
      <Ellipse cx={15.5} cy={10.5} rx={2.6} ry={5} transform="rotate(-28 15.5 10.5)" fill="#FFF4E8" stroke={color.dark} strokeWidth={1.4} />
      <Ellipse cx={32.5} cy={10.5} rx={2.6} ry={5} transform="rotate(28 32.5 10.5)" fill="#FFF4E8" stroke={color.dark} strokeWidth={1.4} />
      <Ellipse cx={9.5} cy={19.5} rx={6} ry={3.4} transform="rotate(-18 9.5 19.5)" fill={color.main} stroke={color.dark} strokeWidth={1.4} />
      <Ellipse cx={38.5} cy={19.5} rx={6} ry={3.4} transform="rotate(18 38.5 19.5)" fill={color.main} stroke={color.dark} strokeWidth={1.4} />
      <Rect x={13} y={12} width={22} height={27} rx={11} fill={color.main} stroke={color.dark} strokeWidth={1.4} />
      <Ellipse cx={29.5} cy={17} rx={4} ry={3} fill="#FFFFFF" opacity={0.85} />
      <Circle cx={19} cy={23} r={2.2} fill="#1B1F3B" />
      <Circle cx={29} cy={23} r={2.2} fill="#1B1F3B" />
      <Ellipse cx={24} cy={33.5} rx={10} ry={6.8} fill="#F7C6CF" stroke={color.dark} strokeWidth={1.4} />
      <Circle cx={20.5} cy={33.5} r={1.6} fill="#7A3A48" />
      <Circle cx={27.5} cy={33.5} r={1.6} fill="#7A3A48" />
    </>
  );
}

function LezardArt({ color }: { color: Palette }) {
  return (
    <>
      <Path d="M24 31 C24 39 30 41 34 45" fill="none" stroke={color.dark} strokeWidth={7} strokeLinecap="round" />
      <Path d="M24 31 C24 39 30 41 34 45" fill="none" stroke={color.main} strokeWidth={4.4} strokeLinecap="round" />
      <Path
        d="M19 17 L11.5 12.5 M29 17 L36.5 12.5 M19 28 L11.5 32.5 M29 28 L36.5 32.5"
        fill="none"
        stroke={color.dark}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Path
        d="M19 17 L11.5 12.5 M29 17 L36.5 12.5 M19 28 L11.5 32.5 M29 28 L36.5 32.5"
        fill="none"
        stroke={color.main}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <Ellipse cx={24} cy={23} rx={6.4} ry={10.5} fill={color.main} stroke={color.dark} strokeWidth={1.4} />
      <Ellipse cx={24} cy={9.5} rx={5.6} ry={6.4} fill={color.main} stroke={color.dark} strokeWidth={1.4} />
      <Circle cx={21.4} cy={7.6} r={1.4} fill="#3B1F14" />
      <Circle cx={26.6} cy={7.6} r={1.4} fill="#3B1F14" />
      <Circle cx={22} cy={20} r={1.3} fill={color.dark} opacity={0.45} />
      <Circle cx={26.2} cy={24} r={1.3} fill={color.dark} opacity={0.45} />
      <Circle cx={22.4} cy={28} r={1.1} fill={color.dark} opacity={0.45} />
    </>
  );
}

function ChienArt({ color }: { color: Palette }) {
  return (
    <>
      <Ellipse cx={12.5} cy={21} rx={5} ry={10.5} transform="rotate(16 12.5 21)" fill={color.dark} stroke={color.dark} strokeWidth={1.4} />
      <Ellipse cx={35.5} cy={21} rx={5} ry={10.5} transform="rotate(-16 35.5 21)" fill={color.dark} stroke={color.dark} strokeWidth={1.4} />
      <Ellipse cx={24} cy={24} rx={12} ry={13} fill={color.main} stroke={color.dark} strokeWidth={1.4} />
      <Ellipse cx={29} cy={15.5} rx={3.4} ry={2.3} fill="#FFFFFF" opacity={0.55} />
      <Circle cx={19.2} cy={21.5} r={2} fill="#1B1F3B" />
      <Circle cx={28.8} cy={21.5} r={2} fill="#1B1F3B" />
      <Ellipse cx={24} cy={31} rx={7.5} ry={5.8} fill="#FFF4E8" stroke={color.dark} strokeWidth={1.4} />
      <Ellipse cx={24} cy={28.6} rx={2.8} ry={2} fill="#1B1F3B" />
      <Path d="M24 30.6 V32.6 M21.2 33 Q24 35.4 26.8 33" fill="none" stroke="#1B1F3B" strokeWidth={1.3} strokeLinecap="round" />
      <Ellipse cx={24} cy={36} rx={1.9} ry={1.5} fill="#F7A6B5" />
    </>
  );
}
