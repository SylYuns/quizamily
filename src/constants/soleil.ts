// Charte « Coucher de soleil » (docs/design.md, décidée le 2026-11-19/20).
//
// Utilisée pour l'instant par l'accueil (src/app/home.tsx) et l'arbre (src/app/family-tree.tsx) ;
// les autres écrans gardent l'ancienne charte en attendant d'être repris.
//
// Les ombres sont « pleines » (décalées vers le bas, sans flou) et teintées de brun : elles
// s'écrivent avec boxShadow (React Native 0.76+, nouvelle architecture, et web).
import type { ViewStyle } from "react-native";

export const S = {
  // Fond : dégradé abricot -> orange -> rose (voir sunsetBackground). Couleur de secours au
  // milieu du dégradé si backgroundImage n'est pas pris en charge.
  groundTop: "#FFC98A",
  groundMid: "#FFA36B",
  groundBottom: "#F48A86",

  ink: "#3B1F14", // texte principal (brun foncé)
  inkSoft: "#6E4A3A", // texte secondaire sur fond clair
  inkOnGround: "#5E2A12", // texte secondaire posé directement sur le dégradé

  // Action attendue (bouton du quiz « fort », boutons principaux) : brun-orangé.
  action: "#8A3A12",
  actionShadow: "#5E260B",
  actionSoft: "#FFE3CF", // texte secondaire sur fond action

  // Attente (réponse envoyée, révélation à venir…) : prune « crépuscule ».
  waiting: "#5B2333",
  waitingShadow: "#3D1622",
  waitingSoft: "#FFD9C2",

  sun: "#FFD66B", // jaune : badges sur fond foncé, « Ajouter un souvenir », décor de soleil
  knowledge: "#FFD9DC", // rose : tuile « Consulter les connaissances »
  knowledgeInk: "#6E3A3A",
  cream: "#FFF4E8", // panneaux (récapitulatif, menus, mode Modifier)
  creamStrong: "#FFE1C2",
  glass: "rgba(255,244,232,0.5)", // tuiles translucides posées sur le dégradé
  glassBorder: "rgba(255,255,255,0.7)",
  white: "#FFFFFF",

  alertBg: "#FDE3D3",
  alertInk: "#A33A2A",
  badgeRed: "#C8423A",

  // Touche bleu-blanc-rouge (seulement l'icône du menu pour l'instant).
  flagBlue: "#2F5AA8",
  flagRed: "#C8423A",
  flagWhiteBorder: "#C9B9A8",

  line: "rgba(94,38,11,0.42)", // traits de l'arbre
} as const;

export const RADIUS = { card: 32, tile: 24, pill: 22 } as const;

// Ombre pleine teintée de brun, sous une carte (« elle repose sur le fond »).
export function solidShadow(color: string = "rgba(138,58,18,0.22)", depth = 7): ViewStyle {
  return { boxShadow: `0px ${depth}px 0px ${color}` };
}

// Fond dégradé de l'écran. backgroundImage (linear-gradient) est pris en charge par
// React Native (docs « View style props ») et par le web ; backgroundColor sert de secours.
export const sunsetBackground = {
  backgroundColor: S.groundMid,
  backgroundImage: `linear-gradient(180deg, ${S.groundTop} 0%, ${S.groundMid} 42%, ${S.groundBottom} 100%)`,
} as ViewStyle;

// Couleurs des ronds des personnes (accueil et arbre) : la même personne a toujours la même
// couleur, calculée à partir de son identifiant.
export const AVATAR_COLORS = [
  { bg: "#FFD66B", fg: "#5A3A00" }, // jaune
  { bg: "#9FD3C7", fg: "#134A40" }, // menthe
  { bg: "#F7A06A", fg: "#4A1E06" }, // orange
  { bg: "#B9A3E3", fg: "#2E1A5C" }, // lavande
] as const;

export function avatarColorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const FONTS = {
  title: "Fredoka_600SemiBold",
  titleMedium: "Fredoka_500Medium",
  body: "Nunito_400Regular",
  bodySemi: "Nunito_600SemiBold",
  bodyBold: "Nunito_700Bold",
  bodyHeavy: "Nunito_800ExtraBold",
} as const;
