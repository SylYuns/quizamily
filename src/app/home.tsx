import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type MyFamily = {
  familyId: string;
  familyName: string;
  displayName: string;
};

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState<MyFamily[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("persons")
        .select("family_id, display_name, families(name)")
        .eq("user_id", userId)
        .eq("kind", "player");

      if (!cancelled) {
        if (!error && data) {
          setFamilies(
            data.map((row) => ({
              familyId: row.family_id,
              familyName: (row.families as { name: string }[] | null)?.[0]?.name ?? "Famille",
              displayName: row.display_name,
            })),
          );
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (families.length === 0) {
    return <Redirect href="/family-setup" />;
  }

  return (
    <ThemedView
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: Spacing.three,
        padding: Spacing.four,
      }}
    >
      <ThemedText type="title">{families[0].familyName}</ThemedText>
      <ThemedText themeColor="textSecondary">Bienvenue, {families[0].displayName}</ThemedText>
      <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
        (Accueil famille complet à construire — pour l&apos;instant, juste la confirmation que la famille existe.)
      </ThemedText>
      <Pressable onPress={() => supabase.auth.signOut()}>
        <ThemedText type="linkPrimary">Se déconnecter</ThemedText>
      </Pressable>
    </ThemedView>
  );
}
