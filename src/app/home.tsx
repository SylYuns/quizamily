import * as Clipboard from "expo-clipboard";
import { Redirect, router } from "expo-router";
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
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        if (!cancelled) {
          setNoSession(true);
          setLoading(false);
        }
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
              // la relation `families` est à un seul objet à l'exécution (family_id référence
              // une seule famille), même si supabase-js la type comme un tableau faute de
              // schéma généré - on force donc le vrai type ici plutôt que de l'indexer en [0]
              familyName: (row.families as unknown as { name: string } | null)?.name ?? "Famille",
              displayName: row.display_name,
            })),
          );

          const firstFamilyId = data[0]?.family_id;
          if (firstFamilyId) {
            const { data: inviteRow } = await supabase
              .from("invites")
              .select("token")
              .eq("family_id", firstFamilyId)
              .limit(1)
              .maybeSingle();
            if (inviteRow && !cancelled) {
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              setInviteLink(`${origin}/join/${inviteRow.token}`);
            }
          }
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyInviteLink() {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
  }

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (noSession) {
    return <Redirect href="/" />;
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

      {inviteLink && (
        <ThemedView style={{ gap: Spacing.two, alignItems: "center" }}>
          <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
            Invite d&apos;autres membres de la famille avec ce lien :
          </ThemedText>
          <ThemedText
            selectable
            style={{
              borderWidth: 1,
              borderColor: "#999999",
              borderRadius: 8,
              padding: Spacing.three,
              maxWidth: 320,
            }}
          >
            {inviteLink}
          </ThemedText>
          <Pressable
            onPress={copyInviteLink}
            style={{
              borderWidth: 1,
              borderColor: "#999999",
              borderRadius: 8,
              paddingVertical: Spacing.three,
              paddingHorizontal: Spacing.four,
            }}
          >
            <ThemedText>{copied ? "Copié !" : "Copier le lien"}</ThemedText>
          </Pressable>
        </ThemedView>
      )}

      <Pressable
        onPress={() => router.push("/add-fact")}
        style={{
          backgroundColor: "#3c87f7",
          borderRadius: 8,
          paddingVertical: Spacing.three,
          paddingHorizontal: Spacing.four,
        }}
      >
        <ThemedText style={{ color: "#ffffff" }}>Ajouter un fait</ThemedText>
      </Pressable>

      <Pressable onPress={() => router.push("/my-facts")}>
        <ThemedText type="linkPrimary">Mes faits</ThemedText>
      </Pressable>

      <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
        (Accueil famille complet à construire — pour l&apos;instant, juste la confirmation que la famille existe.)
      </ThemedText>
      <Pressable onPress={() => supabase.auth.signOut()}>
        <ThemedText type="linkPrimary">Se déconnecter</ThemedText>
      </Pressable>
    </ThemedView>
  );
}
