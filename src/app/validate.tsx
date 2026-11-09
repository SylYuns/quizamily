import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type AnswerGroup = {
  value: string | number;
  count: number;
  recipientIds?: string[];
};

export default function ValidateScreen() {
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [error, setError] = useState("");

  const [quizQuestionId, setQuizQuestionId] = useState<string | null>(null);
  const [autoValidated, setAutoValidated] = useState<AnswerGroup[]>([]);
  const [pending, setPending] = useState<AnswerGroup[]>([]);
  const [decidingValue, setDecidingValue] = useState<string | null>(null);

  async function loadPendingValidations(questionId: string) {
    const { data, error: rpcError } = await supabase.rpc("get_pending_validations", {
      p_quiz_question_id: questionId,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setAutoValidated((data?.autoValidated as AnswerGroup[] | undefined) ?? []);
    setPending((data?.pending as AnswerGroup[] | undefined) ?? []);
  }

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
        .eq("status", "open")
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

      setQuizQuestionId(quizQuestion.id);
      await loadPendingValidations(quizQuestion.id);
      if (!cancelled) setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function decide(group: AnswerGroup, accept: boolean) {
    if (!quizQuestionId || !group.recipientIds) return;
    setDecidingValue(String(group.value));
    setError("");

    const { error: rpcError } = await supabase.rpc("validate_pending_answers", {
      p_quiz_question_id: quizQuestionId,
      p_recipient_ids: group.recipientIds,
      p_accept: accept,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      await loadPendingValidations(quizQuestionId);
    }
    setDecidingValue(null);
  }

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

  if (!quizQuestionId) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.three, padding: Spacing.four }}>
        <ThemedText type="title">Valider les réponses</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
          Aucune session en cours pour le moment.
        </ThemedText>
        <Pressable onPress={() => router.replace("/home")}>
          <ThemedText type="linkPrimary">Retour à l&apos;accueil</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Valider les réponses</ThemedText>
        <ThemedText themeColor="textSecondary">
          La validation est anonyme : tu ne vois pas qui a donné quelle réponse, seulement les valeurs reçues.
        </ThemedText>

        {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

        {pending.length === 0 ? (
          <ThemedText themeColor="textSecondary">
            Tout est validé ! Tu peux retourner à l&apos;accueil pour déclencher la révélation.
          </ThemedText>
        ) : (
          <View style={{ gap: Spacing.three }}>
            <ThemedText type="smallBold">À valider</ThemedText>
            {pending.map((group) => (
              <View key={String(group.value)} style={styles.card}>
                <ThemedText type="smallBold">
                  « {String(group.value)} » — {group.count} réponse{group.count === 1 ? "" : "s"}
                </ThemedText>
                <View style={styles.actionsRow}>
                  <Pressable onPress={() => decide(group, true)} disabled={decidingValue === String(group.value)}>
                    <ThemedText type="linkPrimary">Accepter</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => decide(group, false)} disabled={decidingValue === String(group.value)}>
                    <ThemedText type="linkPrimary">Refuser</ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {autoValidated.length > 0 && (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold">Déjà validées automatiquement</ThemedText>
            {autoValidated.map((group) => (
              <ThemedText key={String(group.value)} themeColor="textSecondary">
                « {String(group.value)} » — {group.count} réponse{group.count === 1 ? "" : "s"}
              </ThemedText>
            ))}
          </View>
        )}

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
    gap: Spacing.two,
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.three,
  },
});
