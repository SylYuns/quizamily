// Bandeau famille (« Règles communes », docs/ecrans.md) : nom de la famille (menu déroulant pour
// changer de famille ou en créer une autre, bouton d'invitation à côté de la famille courante) et
// menu burger (déconnexion, « Créer une session maintenant » pour les tests). Partagé par l'accueil
// (src/app/home.tsx) et l'écran « Ajouter un souvenir » (src/app/add-fact.tsx) ; à reprendre sur les
// autres écrans liés à une famille au fur et à mesure.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FlagMenuIcon } from "@/components/soleil";
import { FONTS, RADIUS, S, solidShadow } from "@/constants/soleil";
import { supabase } from "@/lib/supabase";

export type FamilyOption = { familyId: string; familyName: string };

export function FamilyHeaderBar(props: {
  families: FamilyOption[];
  currentFamilyId: string;
  onSwitchFamily: (familyId: string) => void;
  copied: boolean;
  onCopyInvite: () => void;
  /** Rappelé après la création réussie d'une session de test, pour que l'écran appelant
   * rafraîchisse ce qui en dépend (l'accueil recharge son tableau de bord). */
  onSessionCreated?: () => void;
}) {
  const { families, currentFamilyId, onSwitchFamily, copied, onCopyInvite, onSessionCreated } = props;

  const [showFamilyMenu, setShowFamilyMenu] = useState(false);
  const [showBurger, setShowBurger] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [burgerMessage, setBurgerMessage] = useState<string | null>(null);

  // La famille courante est toujours en tête du menu, bouton d'invitation à côté d'elle.
  const currentFamily = families.find((f) => f.familyId === currentFamilyId) ?? families[0];
  const orderedFamilies = currentFamily
    ? [currentFamily, ...families.filter((f) => f.familyId !== currentFamily.familyId)]
    : families;

  async function createSessionNow() {
    setCreatingSession(true);
    setBurgerMessage(null);

    const { data, error } = await supabase.functions.invoke("create-quiz-session", {
      body: { family_id: currentFamilyId },
    });

    if (error) {
      let message = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON : on garde le message générique
        }
      }
      setBurgerMessage(`Erreur : ${message}`);
    } else {
      setBurgerMessage(`Session créée : ${data.recipientsCreated} réponse(s) attendue(s).`);
      onSessionCreated?.();
    }
    setCreatingSession(false);
    setShowBurger(false);
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => setShowFamilyMenu((v) => !v)} style={styles.familyButton}>
          <Text style={styles.familyButtonText}>{currentFamily?.familyName ?? "Famille"}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityLabel="Menu" onPress={() => setShowBurger((v) => !v)} style={styles.burgerButton}>
          <FlagMenuIcon />
        </Pressable>
      </View>

      {burgerMessage && <Text style={styles.burgerMessage}>{burgerMessage}</Text>}

      {showFamilyMenu && (
        <View style={[styles.dropdown, styles.dropdownLeft]}>
          {orderedFamilies.map((f) => (
            <View key={f.familyId} style={styles.dropdownRow}>
              <Pressable
                onPress={() => {
                  setShowFamilyMenu(false);
                  onSwitchFamily(f.familyId);
                }}
                style={styles.dropdownItem}
              >
                <Text style={f.familyId === currentFamilyId ? styles.dropdownItemTextActive : styles.dropdownItemText}>
                  {f.familyName}
                </Text>
              </Pressable>
              {f.familyId === currentFamilyId && (
                <Pressable accessibilityLabel="Inviter dans la famille" onPress={onCopyInvite} style={styles.inviteButtonSmall}>
                  <Text style={styles.inviteIconSmall}>{copied ? "✓" : "+"}</Text>
                </Pressable>
              )}
            </View>
          ))}
          <Pressable onPress={() => router.push("/family-setup")} style={styles.dropdownItem}>
            <Text style={styles.dropdownItemText}>+ Créer une autre famille</Text>
          </Pressable>
        </View>
      )}

      {showBurger && (
        <View style={[styles.dropdown, styles.dropdownRight]}>
          <Pressable onPress={createSessionNow} disabled={creatingSession} style={styles.dropdownItem}>
            <Text style={styles.dropdownItemText}>
              {creatingSession ? "Création…" : "Créer une session maintenant (test)"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setShowBurger(false);
              supabase.auth.signOut();
            }}
            style={styles.dropdownItem}
          >
            <Text style={styles.dropdownItemText}>Se déconnecter</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex ici, pas seulement sur le menu lui-même : sans ça, les menus (position absolute)
  // restent dans le contexte d'empilement de ce View, qui n'a pas de priorité face aux éléments
  // suivants de l'écran (titre, listes…) — ils s'affichaient donc derrière (constaté à l'écran).
  root: { zIndex: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  familyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: S.glassBorder,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255,248,238,0.55)",
  },
  familyButtonText: { fontFamily: FONTS.title, fontSize: 18, color: S.ink },
  chevron: { fontSize: 14, color: S.ink },
  burgerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: S.white,
    alignItems: "center",
    justifyContent: "center",
    ...solidShadow("rgba(138,58,18,0.2)", 3),
  },
  burgerMessage: {
    fontSize: 14,
    fontFamily: FONTS.bodyBold,
    color: S.inkOnGround,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  // left/right sont dans des styles séparés (pas un objet qui annule l'un avec l'autre) : React
  // Native Web compile chaque style en classes CSS atomiques, et une valeur `undefined` dans un
  // style ultérieur n'annule pas la classe déjà posée par un style précédent.
  dropdown: {
    position: "absolute",
    top: 66,
    zIndex: 10,
    backgroundColor: S.cream,
    borderRadius: 20,
    paddingVertical: 6,
    minWidth: 220,
    ...solidShadow("rgba(138,58,18,0.25)", 5),
  },
  dropdownLeft: { left: 16 },
  dropdownRight: { right: 16 },
  dropdownRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropdownItem: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
  dropdownItemText: { fontFamily: FONTS.bodyBold, fontSize: 15, color: S.ink },
  dropdownItemTextActive: { fontFamily: FONTS.bodyHeavy, fontSize: 15, color: S.action },
  inviteButtonSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: S.actionSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  inviteIconSmall: { fontSize: 15, color: S.action, fontFamily: FONTS.bodyHeavy },
});
