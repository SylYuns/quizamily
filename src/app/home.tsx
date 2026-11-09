import { FunctionsHttpError } from "@supabase/supabase-js";
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

async function checkIsRecipientForSession(familyId: string, userId: string, sessionId: string): Promise<boolean> {
  const { data: myPerson } = await supabase
    .from("persons")
    .select("id")
    .eq("family_id", familyId)
    .eq("user_id", userId)
    .eq("kind", "player")
    .limit(1)
    .maybeSingle();
  if (!myPerson) return true;

  const { data: quizQuestion } = await supabase
    .from("quiz_questions")
    .select("id")
    .eq("session_id", sessionId)
    .limit(1)
    .maybeSingle();
  if (!quizQuestion) return true;

  const { data: recipient } = await supabase
    .from("question_recipients")
    .select("id")
    .eq("quiz_question_id", quizQuestion.id)
    .eq("person_id", myPerson.id)
    .maybeSingle();
  return !!recipient;
}

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState<MyFamily[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [openSessionClosesAt, setOpenSessionClosesAt] = useState<string | null>(null);
  const [isRecipient, setIsRecipient] = useState(true);
  const [hasRevealedSession, setHasRevealedSession] = useState(false);

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

            const { data: lastSession } = await supabase
              .from("quiz_sessions")
              .select("id, status, closes_at")
              .eq("family_id", firstFamilyId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (lastSession && !cancelled) {
              if (lastSession.status === "open") {
                setOpenSessionClosesAt(lastSession.closes_at);
                const amIRecipient = await checkIsRecipientForSession(firstFamilyId, userId, lastSession.id);
                if (!cancelled) setIsRecipient(amIRecipient);
              } else if (lastSession.status === "closed") {
                setHasRevealedSession(true);
              }
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

  async function createQuizSession() {
    const familyId = families[0]?.familyId;
    if (!familyId) return;
    setCreatingSession(true);
    setSessionMessage(null);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    const { data, error } = await supabase.functions.invoke("create-quiz-session", {
      body: { family_id: familyId },
    });

    if (error) {
      // supabase-js ne renseigne pas le corps JSON de l'erreur sur `error.message` pour les
      // réponses non-2xx : il faut le relire sur `error.context` pour afficher notre vrai
      // message ("session déjà en cours", etc.) plutôt qu'un message générique.
      let message = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON : on garde le message générique
        }
      }
      setSessionMessage(`Erreur : ${message}`);
    } else {
      setSessionMessage(`Session créée : ${data.recipientsCreated} réponse(s) attendue(s).`);
      setOpenSessionClosesAt(data.closesAt);
      setHasRevealedSession(false);
      if (userId) {
        setIsRecipient(await checkIsRecipientForSession(familyId, userId, data.sessionId));
      }
    }

    setCreatingSession(false);
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

      {openSessionClosesAt && (
        <ThemedView style={{ gap: Spacing.two, alignItems: "center" }}>
          <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
            Une session est en cours, jusqu&apos;au{" "}
            {new Date(openSessionClosesAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.
          </ThemedText>
          <Pressable onPress={() => router.push("/respond")}>
            <ThemedText type="linkPrimary">{isRecipient ? "Répondre" : "Voir ma question"}</ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {!openSessionClosesAt && hasRevealedSession && (
        <ThemedView style={{ gap: Spacing.two, alignItems: "center" }}>
          <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
            La dernière session est terminée.
          </ThemedText>
          <Pressable onPress={() => router.push("/reveal")}>
            <ThemedText type="linkPrimary">Voir la révélation</ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {!openSessionClosesAt && (
        <ThemedView style={{ gap: Spacing.two, alignItems: "center" }}>
          <Pressable
            onPress={createQuizSession}
            disabled={creatingSession}
            style={{
              borderWidth: 1,
              borderColor: "#999999",
              borderRadius: 8,
              paddingVertical: Spacing.three,
              paddingHorizontal: Spacing.four,
              opacity: creatingSession ? 0.6 : 1,
            }}
          >
            <ThemedText>{creatingSession ? "Création…" : "Créer une session de quiz (déclenchement manuel)"}</ThemedText>
          </Pressable>
          {sessionMessage && (
            <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
              {sessionMessage}
            </ThemedText>
          )}
        </ThemedView>
      )}

      <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
        (Accueil famille complet à construire — pour l&apos;instant, juste la confirmation que la famille existe.)
      </ThemedText>
      <Pressable onPress={() => supabase.auth.signOut()}>
        <ThemedText type="linkPrimary">Se déconnecter</ThemedText>
      </Pressable>
    </ThemedView>
  );
}
