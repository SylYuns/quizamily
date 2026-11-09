import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { supabase } from "@/lib/supabase";

type RevealParticipant = {
  displayName: string;
  answerGiven: string | number | null;
  result: "correct" | "incorrect" | "unanswered" | "voided" | "pending_validation";
};

type RevealData = {
  questionText: string;
  subjectName: string;
  answerInputKind: string;
  correctAnswer: string | number;
  authorName: string;
  contextText: string | null;
  participants: RevealParticipant[];
};

function resultLabel(result: RevealParticipant["result"]): string {
  if (result === "correct") return "✓ Juste";
  if (result === "incorrect") return "✗ Faux";
  if (result === "unanswered") return "Pas répondu";
  if (result === "voided") return "Annulée";
  return "En attente de validation";
}

export default function RevealScreen() {
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState<RevealData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        if (!cancelled) setNoSession(true);
        return;
      }

      const { data: me } = await supabase
        .from("persons")
        .select("id, family_id")
        .eq("user_id", userId)
        .eq("kind", "player")
        .limit(1)
        .maybeSingle();

      if (!me || cancelled) return;

      const { data: session } = await supabase
        .from("quiz_sessions")
        .select("id")
        .eq("family_id", me.family_id)
        .eq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!session) {
        setReady(true);
        return;
      }

      const { data: quizQuestion } = await supabase
        .from("quiz_questions")
        .select("id")
        .eq("session_id", session.id)
        .limit(1)
        .maybeSingle();

      if (cancelled || !quizQuestion) {
        setReady(true);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("get_revealed_question", {
        p_quiz_question_id: quizQuestion.id,
      });

      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
      } else {
        setReveal(data as RevealData);
      }
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (noSession) {
    return <Redirect href="/" />;
  }

  if (!ready) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (error.length > 0 || !reveal) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.three, padding: Spacing.four }}>
        <ThemedText type="title">Révélation</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
          {error || "Aucune révélation disponible pour le moment."}
        </ThemedText>
        <Pressable onPress={() => router.replace("/home")}>
          <ThemedText type="linkPrimary">Retour à l&apos;accueil</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const questionText = reveal.questionText.replace("<sujet>", reveal.subjectName);

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Révélation</ThemedText>

        <View style={styles.card}>
          <ThemedText type="smallBold">{questionText}</ThemedText>
        </View>

        <ThemedText>
          Bonne réponse : {formatAnswerDisplay(reveal.answerInputKind, reveal.correctAnswer)}
        </ThemedText>
        <ThemedText themeColor="textSecondary">Posée par {reveal.authorName}</ThemedText>
        {reveal.contextText && <ThemedText themeColor="textSecondary">{reveal.contextText}</ThemedText>}

        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold">Réponses</ThemedText>
          {reveal.participants.map((p) => (
            <View key={p.displayName} style={styles.participantRow}>
              <ThemedText>{p.displayName}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {p.answerGiven !== null
                  ? `${formatAnswerDisplay(reveal.answerInputKind, p.answerGiven)} — ${resultLabel(p.result)}`
                  : resultLabel(p.result)}
              </ThemedText>
            </View>
          ))}
        </View>

        <Pressable onPress={() => router.replace("/home")}>
          <ThemedText type="linkPrimary">Retour à l&apos;accueil</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
  },
  participantRow: {
    gap: Spacing.half,
  },
});
