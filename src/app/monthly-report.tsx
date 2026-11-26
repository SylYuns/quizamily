// Bilan du mois (écran 12 bis, voir docs/ecrans.md) : pas encore codé (étape 6 sexies/suivante
// de la roadmap). Pour l'instant, une page d'attente plutôt qu'un bouton mort depuis l'accueil
// (choix du 2026-11-26, signalé dans docs/roadmap.md).
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { FamilyHeaderBar } from "@/components/family-header";
import { FONTS, S, sunsetBackground } from "@/constants/soleil";
import { listMyFamilies, resolveMyFamily, setPersistedFamilyId, type MyFamilyMembership } from "@/lib/my-family";
import { supabase } from "@/lib/supabase";
import { useInviteLink } from "@/lib/use-invite-link";

export default function MonthlyReportScreen() {
  const params = useLocalSearchParams<{ family?: string }>();
  const paramFamily = typeof params.family === "string" && params.family.length > 0 ? params.family : null;

  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [families, setFamilies] = useState<MyFamilyMembership[]>([]);
  const [familyIndex, setFamilyIndex] = useState(0);
  const family = families[familyIndex];
  const { copied, copy: copyInviteLink } = useInviteLink(family?.familyId ?? null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        if (!cancelled) setNoSession(true);
        return;
      }
      const myFamilies = await listMyFamilies(uid);
      setUserId(uid);
      setFamilies(myFamilies);
      const current = await resolveMyFamily(uid, myFamilies, paramFamily);
      if (cancelled) return;
      if (current) setFamilyIndex(myFamilies.findIndex((f) => f.familyId === current.familyId));
      setReady(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [paramFamily]);

  function switchFamily(newFamilyId: string) {
    if (userId) setPersistedFamilyId(userId, newFamilyId);
    setFamilyIndex(families.findIndex((f) => f.familyId === newFamilyId));
  }

  if (noSession) return <Redirect href="/" />;
  if (families.length === 0 && ready) return <Redirect href="/family-setup" />;

  return (
    <View style={[styles.screen, sunsetBackground]}>
      {!ready || !family ? (
        <View style={styles.centered}>
          <ActivityIndicator color={S.action} />
        </View>
      ) : (
        <>
          <FamilyHeaderBar
            title="Bilan du mois"
            onBack={() => router.replace("/home")}
            families={families}
            currentFamilyId={family.familyId}
            currentUserId={userId}
            onSwitchFamily={switchFamily}
            copied={copied}
            onCopyInvite={copyInviteLink}
            onEmblemChanged={({ symbol, color }) =>
              setFamilies((prev) =>
                prev.map((f) => (f.familyId === family.familyId ? { ...f, emblemSymbol: symbol, emblemColor: color } : f)),
              )
            }
          />
          <View style={styles.centered}>
            <Text style={styles.title}>Bientôt ici</Text>
            <Text style={styles.sub}>Le podium du mois et les titres de la famille arrivent très vite.</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32 },
  title: { fontFamily: FONTS.title, fontSize: 24, color: S.ink },
  sub: { fontFamily: FONTS.body, fontSize: 15, color: S.inkOnGround, textAlign: "center" },
});
