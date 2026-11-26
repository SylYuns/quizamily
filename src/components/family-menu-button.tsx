// Emblème de la famille + menu de la famille (« Règles communes », docs/ecrans.md) : emblème +
// nom + « Personnaliser l'emblème » (créateur seulement), inviter, mes familles, créer une
// autre famille, test, déconnexion. Partie réutilisable de src/components/family-header.tsx,
// aussi posée seule à droite de « Modifier » sur l'arbre (src/app/family-tree.tsx).
import { FunctionsHttpError } from "@supabase/supabase-js";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EmblemButton } from "@/components/emblem-button";
import { EmblemPicker } from "@/components/emblem-picker";
import { LogoSymbol } from "@/components/logo-symbol";
import { FONTS, RADIUS, S, solidShadow, type EmblemColor, type EmblemSymbol } from "@/constants/soleil";
import { supabase } from "@/lib/supabase";

export type FamilyOption = {
  familyId: string;
  familyName: string;
  emblemSymbol: EmblemSymbol;
  emblemColor: EmblemColor;
  emblemLetters: string;
  createdBy: string | null;
};

export function FamilyMenuButton(props: {
  families: FamilyOption[];
  currentFamilyId: string;
  currentUserId?: string | null;
  onSwitchFamily: (familyId: string) => void;
  copied: boolean;
  onCopyInvite: () => void;
  /** Rappelé après la création réussie d'une session de test, pour que l'écran appelant
   * rafraîchisse ce qui en dépend (l'accueil recharge son tableau de bord). */
  onSessionCreated?: () => void;
  /** Rappelé après la personnalisation réussie de l'emblème, pour rafraîchir l'affichage local. */
  onEmblemChanged?: (emblem: { symbol: EmblemSymbol; color: EmblemColor }) => void;
}) {
  const {
    families,
    currentFamilyId,
    currentUserId,
    onSwitchFamily,
    copied,
    onCopyInvite,
    onSessionCreated,
    onEmblemChanged,
  } = props;

  const [showMenu, setShowMenu] = useState(false);
  const [personalizing, setPersonalizing] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [menuMessage, setMenuMessage] = useState<string | null>(null);

  const currentFamily = families.find((f) => f.familyId === currentFamilyId) ?? families[0];
  const otherFamilies = families.filter((f) => f.familyId !== currentFamily?.familyId);
  const isCreator = !!currentUserId && currentFamily?.createdBy === currentUserId;

  const [draftSymbol, setDraftSymbol] = useState<EmblemSymbol>(currentFamily?.emblemSymbol ?? "vache");
  const [draftColor, setDraftColor] = useState<EmblemColor>(currentFamily?.emblemColor ?? "bleu");

  function openPersonalize() {
    setDraftSymbol(currentFamily?.emblemSymbol ?? "vache");
    setDraftColor(currentFamily?.emblemColor ?? "bleu");
    setPersonalizing(true);
  }

  async function savePersonalize() {
    if (!currentFamily) return;
    const { error } = await supabase
      .from("families")
      .update({ emblem_symbol: draftSymbol, emblem_color: draftColor })
      .eq("id", currentFamily.familyId);
    if (!error) {
      onEmblemChanged?.({ symbol: draftSymbol, color: draftColor });
      setPersonalizing(false);
      setShowMenu(false);
    } else {
      setMenuMessage(`Erreur : ${error.message}`);
    }
  }

  async function createSessionNow() {
    setCreatingSession(true);
    setMenuMessage(null);

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
      setMenuMessage(`Erreur : ${message}`);
    } else {
      setMenuMessage(`Session créée : ${data.recipientsCreated} réponse(s) attendue(s).`);
      onSessionCreated?.();
    }
    setCreatingSession(false);
  }

  if (!currentFamily) return null;

  return (
    <View style={styles.root}>
      <EmblemButton
        symbol={currentFamily.emblemSymbol}
        color={currentFamily.emblemColor}
        letters={currentFamily.emblemLetters}
        onPress={() => {
          setShowMenu((v) => !v);
          setPersonalizing(false);
          setMenuMessage(null);
        }}
      />

      {showMenu && (
        <View style={styles.menu}>
          <View style={styles.menuHeaderRow}>
            <LogoSymbol symbol={currentFamily.emblemSymbol} color={currentFamily.emblemColor} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.menuFamilyName} numberOfLines={1}>
                {currentFamily.familyName}
              </Text>
              {isCreator && !personalizing && (
                <Pressable onPress={openPersonalize}>
                  <Text style={styles.menuLink}>Personnaliser l&apos;emblème</Text>
                </Pressable>
              )}
            </View>
          </View>

          {personalizing ? (
            <View style={styles.personalizeBox}>
              <EmblemPicker
                symbol={draftSymbol}
                color={draftColor}
                onChange={({ symbol, color }) => {
                  setDraftSymbol(symbol);
                  setDraftColor(color);
                }}
              />
              <View style={styles.personalizeActions}>
                <Pressable onPress={() => setPersonalizing(false)} style={styles.menuSecondaryButton}>
                  <Text style={styles.menuItemText}>Annuler</Text>
                </Pressable>
                <Pressable onPress={savePersonalize} style={styles.menuPrimaryButton}>
                  <Text style={styles.menuPrimaryButtonText}>Enregistrer</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <Pressable onPress={onCopyInvite} style={styles.menuPrimaryButton}>
                <Text style={styles.menuPrimaryButtonText}>
                  {copied ? "Lien copié !" : "Inviter dans la famille"}
                </Text>
              </Pressable>

              <Text style={styles.menuSectionLabel}>Mes familles</Text>
              <View style={styles.menuRow}>
                <LogoSymbol symbol={currentFamily.emblemSymbol} color={currentFamily.emblemColor} size={28} />
                <Text style={styles.menuRowTextActive}>{currentFamily.familyName}</Text>
                <Text style={styles.menuCheck}>✓</Text>
              </View>
              {otherFamilies.map((f) => (
                <Pressable
                  key={f.familyId}
                  onPress={() => {
                    setShowMenu(false);
                    onSwitchFamily(f.familyId);
                  }}
                  style={styles.menuRow}
                >
                  <LogoSymbol symbol={f.emblemSymbol} color={f.emblemColor} size={28} />
                  <Text style={styles.menuRowText}>{f.familyName}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => router.push("/family-setup")} style={styles.menuRow}>
                <Text style={styles.menuRowText}>+ Créer une autre famille</Text>
              </Pressable>

              {menuMessage && <Text style={styles.menuMessage}>{menuMessage}</Text>}

              <View style={styles.menuDivider} />
              <Pressable onPress={createSessionNow} disabled={creatingSession} style={styles.menuItem}>
                <Text style={styles.menuItemTextSmall}>
                  {creatingSession ? "Création…" : "Créer une session maintenant (test)"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowMenu(false);
                  supabase.auth.signOut();
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuItemTextSmall}>Se déconnecter</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex ici, pas seulement sur le menu lui-même : sans ça, les menus (position absolute)
  // restent dans le contexte d'empilement de la vue parente, qui n'a pas de priorité face aux
  // éléments suivants de l'écran (titre, listes…) — ils s'affichaient donc derrière.
  root: { zIndex: 20 },
  menu: {
    position: "absolute",
    top: 54,
    right: 0,
    zIndex: 10,
    width: 300,
    backgroundColor: S.cream,
    borderRadius: RADIUS.card - 6,
    padding: 14,
    gap: 4,
    ...solidShadow("rgba(138,58,18,0.25)", 6),
  },
  menuHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 10 },
  menuFamilyName: { fontFamily: FONTS.title, fontSize: 19, color: S.ink },
  menuLink: { fontFamily: FONTS.bodyHeavy, fontSize: 13, color: S.action, marginTop: 2 },
  personalizeBox: { gap: 12, paddingVertical: 6 },
  personalizeActions: { flexDirection: "row", gap: 10 },
  menuPrimaryButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: S.action,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...solidShadow(S.actionShadow, 3),
  },
  menuPrimaryButtonText: { fontFamily: FONTS.bodyHeavy, fontSize: 15, color: S.white },
  menuSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: S.creamStrong,
  },
  menuItemText: { fontFamily: FONTS.bodyHeavy, fontSize: 15, color: S.ink },
  menuSectionLabel: {
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 2,
    borderTopColor: "#F1E4D2",
    fontFamily: FONTS.bodyHeavy,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: S.inkSoft,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingVertical: 4,
  },
  menuRowText: { fontFamily: FONTS.bodyBold, fontSize: 15, color: S.ink },
  menuRowTextActive: { flex: 1, fontFamily: FONTS.bodyHeavy, fontSize: 15, color: S.ink },
  menuCheck: { color: S.action, fontFamily: FONTS.bodyHeavy, fontSize: 16 },
  menuMessage: { fontSize: 13, fontFamily: FONTS.bodyBold, color: S.inkOnGround, paddingTop: 4 },
  menuDivider: { height: 2, backgroundColor: "#F1E4D2", marginVertical: 6 },
  menuItem: { minHeight: 40, justifyContent: "center" },
  menuItemTextSmall: { fontFamily: FONTS.bodyBold, fontSize: 14, color: S.inkSoft },
});
