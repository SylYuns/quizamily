// Bandeau famille (« Règles communes », docs/ecrans.md) : une seule ligne en haut de chaque
// écran lié à une famille — flèche retour (sauf accueil) + titre de la page à gauche, emblème de
// la famille à droite qui ouvre le menu de la famille (src/components/family-menu-button.tsx).
// Remplace l'ancien bandeau « nom de la famille + Inviter + menu burger tricolore » (décidé le
// 2026-11-24, voir docs/design.md).
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FamilyMenuButton, type FamilyOption } from "@/components/family-menu-button";
import { FONTS, S } from "@/constants/soleil";

export type { FamilyOption };

type FamilyMenuButtonProps = Parameters<typeof FamilyMenuButton>[0];

export function FamilyHeaderBar(
  props: {
    title: string;
    /** false sur l'accueil (pas de flèche retour) : voir « Règles communes » de docs/ecrans.md. */
    showBack?: boolean;
    onBack?: () => void;
  } & FamilyMenuButtonProps,
) {
  const { title, showBack = true, onBack, ...menuProps } = props;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {showBack && (
          <Pressable accessibilityLabel="Retour" onPress={onBack ?? (() => router.back())} style={styles.backButton}>
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <FamilyMenuButton {...menuProps} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  backChevron: { fontSize: 26, color: S.ink, fontFamily: FONTS.title },
  title: { flex: 1, minWidth: 0, fontFamily: FONTS.title, fontSize: 26, color: S.ink },
});
