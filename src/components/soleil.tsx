// Petits éléments de la charte « Coucher de soleil » partagés par l'accueil et l'arbre
// (voir src/constants/soleil.ts et docs/design.md).
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { avatarColorFor, FONTS, S } from "@/constants/soleil";

// Icône du menu : trois barres bleue, blanche (bordée) et rouge, dans un rond blanc. C'est la
// seule touche bleu-blanc-rouge de la charte pour l'instant (décision du 2026-11-19).
export function FlagMenuIcon() {
  return (
    <View style={styles.flagWrap}>
      <View style={[styles.flagBar, { backgroundColor: S.flagBlue }]} />
      <View style={[styles.flagBar, styles.flagBarWhite]} />
      <View style={[styles.flagBar, { backgroundColor: S.flagRed }]} />
    </View>
  );
}

// Rond d'une personne : initiale sur sa couleur, étoile si elle est centrale, bord brun si
// c'est la personne centrée dans l'arbre.
export function PersonAvatar({
  personId,
  firstName,
  size,
  isCentral,
  focused = false,
  style,
  children,
}: {
  personId: string;
  firstName: string;
  size: number;
  isCentral: boolean;
  focused?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const col = avatarColorFor(personId);
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: col.bg,
          borderColor: focused ? S.action : S.white,
          borderWidth: focused ? 4 : 3,
        },
        style,
      ]}
    >
      <Text style={{ color: col.fg, fontFamily: FONTS.title, fontSize: Math.round(size * 0.4) }}>
        {firstName.charAt(0).toUpperCase()}
      </Text>
      {isCentral && (
        <View style={styles.centralBadge}>
          <Text style={styles.centralBadgeText}>★</Text>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flagWrap: { width: 22, gap: 3 },
  flagBar: { height: 4, borderRadius: 2 },
  flagBarWhite: { backgroundColor: S.white, borderWidth: 1.5, borderColor: S.flagWhiteBorder },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 3px 0px rgba(138,58,18,0.2)",
  },
  centralBadge: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: S.action,
    borderWidth: 2,
    borderColor: S.white,
    alignItems: "center",
    justifyContent: "center",
  },
  centralBadgeText: { color: S.sun, fontSize: 11, lineHeight: 13 },
});
