// Bouton emblème de la famille : rond blanc, symbole recolorable à l'intérieur, étiquette de 2
// lettres collée en bas qui déborde un peu (variante « dessus », sans liseré bleu-blanc-rouge,
// retenue le 2026-11-24 — voir docs/design.md et docs/maquettes/soleil/Embleme.dc.html).
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LogoSymbol } from "@/components/logo-symbol";
import type { EmblemColor, EmblemSymbol } from "@/constants/soleil";

export function EmblemButton({
  symbol,
  color,
  letters,
  size = 52,
  onPress,
}: {
  symbol: EmblemSymbol;
  color?: EmblemColor;
  letters: string;
  size?: number;
  onPress?: () => void;
}) {
  const logoSize = Math.round(size * 0.88);
  return (
    <Pressable accessibilityLabel={`Menu de la famille ${letters}`} onPress={onPress} style={styles.ring}>
      <View style={{ position: "relative" }}>
        <LogoSymbol symbol={symbol} color={color} size={logoSize} />
        <View style={styles.labelWrap} pointerEvents="none">
          <Text style={styles.letters}>{letters}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    padding: 3,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    boxShadow: "0px 3px 0px rgba(138,58,18,0.22)",
  },
  labelWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -13,
    alignItems: "center",
  },
  letters: {
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#3B1F14",
    color: "#FFFFFF",
    fontFamily: "Fredoka_600SemiBold",
    fontWeight: "600",
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
  },
});
