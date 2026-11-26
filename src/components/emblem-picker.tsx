// Choix du symbole et de la couleur de l'emblème (création de la famille, ou « Personnaliser
// l'emblème » depuis le menu — docs/ecrans.md, « Règles communes »).
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LogoSymbol } from "@/components/logo-symbol";
import { EMBLEM_COLORS, EMBLEM_PALETTE, EMBLEM_SYMBOLS, FONTS, S, type EmblemColor, type EmblemSymbol } from "@/constants/soleil";

export function EmblemPicker({
  symbol,
  color,
  onChange,
}: {
  symbol: EmblemSymbol;
  color: EmblemColor;
  onChange: (next: { symbol: EmblemSymbol; color: EmblemColor }) => void;
}) {
  return (
    <View style={{ gap: 14 }}>
      <View>
        <Text style={styles.label}>Symbole</Text>
        <View style={styles.row}>
          {EMBLEM_SYMBOLS.map((s) => (
            <Pressable
              key={s}
              accessibilityLabel={s}
              onPress={() => onChange({ symbol: s, color })}
              style={[styles.swatch, s === symbol && styles.swatchSelected]}
            >
              <LogoSymbol symbol={s} color={color} size={44} />
            </Pressable>
          ))}
        </View>
      </View>
      <View>
        <Text style={styles.label}>Couleur</Text>
        <View style={styles.row}>
          {EMBLEM_COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityLabel={c}
              onPress={() => onChange({ symbol, color: c })}
              style={[
                styles.colorDot,
                { backgroundColor: EMBLEM_PALETTE[c].main },
                c === color && styles.colorDotSelected,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: FONTS.bodyBold, fontSize: 13, color: S.inkSoft, marginBottom: 6 },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  swatch: {
    padding: 4,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "transparent",
  },
  swatchSelected: { borderColor: S.action },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  colorDotSelected: { borderColor: S.action },
});
