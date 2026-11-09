import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { AnswerInput } from "@/components/answer-input";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { parseAnswerValue } from "@/lib/answer-value";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { supabase } from "@/lib/supabase";
import { Template } from "@/types/question-template";

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

type PendingCorrection = {
  proposedValue: string | number;
  comment: string | null;
  proposedByPersonId: string;
  proposedAt: string;
  status: "pending" | "refused";
};

type HistoryEntry = {
  oldValue: string | number;
  newValue: string | number;
  correctedAt: string;
  note: string | null;
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

  const [factId, setFactId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [myPersonId, setMyPersonId] = useState<string | null>(null);
  const [authorPersonId, setAuthorPersonId] = useState<string | null>(null);
  const [myAnswerGiven, setMyAnswerGiven] = useState<string | number | null>(null);
  const [currentAnswerValue, setCurrentAnswerValue] = useState<string | number | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [pendingCorrection, setPendingCorrection] = useState<PendingCorrection | null>(null);
  const [answerHistory, setAnswerHistory] = useState<HistoryEntry[]>([]);

  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionComment, setCorrectionComment] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [decidingCorrection, setDecidingCorrection] = useState(false);

  async function loadFactExtras(fId: string) {
    const { data: fact } = await supabase
      .from("facts")
      .select("author_person_id, answer_value, pending_correction, answer_history, question_templates (*)")
      .eq("id", fId)
      .maybeSingle();
    if (!fact) return;
    setAuthorPersonId(fact.author_person_id);
    setCurrentAnswerValue(fact.answer_value);
    setTemplate(fact.question_templates as unknown as Template);
    setPendingCorrection((fact.pending_correction as PendingCorrection | null) ?? null);
    setAnswerHistory((fact.answer_history as HistoryEntry[] | null) ?? []);
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
      setMyPersonId(me.id);
      setFamilyId(me.family_id);

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
        .select("id, fact_id")
        .eq("session_id", session.id)
        .limit(1)
        .maybeSingle();

      if (cancelled || !quizQuestion) {
        setReady(true);
        return;
      }
      setFactId(quizQuestion.fact_id);

      const [{ data, error: rpcError }, { data: myRecipient }] = await Promise.all([
        supabase.rpc("get_revealed_question", { p_quiz_question_id: quizQuestion.id }),
        supabase
          .from("question_recipients")
          .select("answer_given")
          .eq("quiz_question_id", quizQuestion.id)
          .eq("person_id", me.id)
          .maybeSingle(),
        loadFactExtras(quizQuestion.fact_id),
      ]);

      if (cancelled) return;
      if (myRecipient && myRecipient.answer_given !== null && myRecipient.answer_given !== undefined) {
        setMyAnswerGiven(myRecipient.answer_given);
      }

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

  function openCorrectionForm() {
    // Pré-remplit avec ce que j'avais moi-même répondu, s'il y a lieu : un point de départ
    // naturel pour proposer une correction, plutôt qu'un champ vide.
    setCorrectionValue(myAnswerGiven !== null ? String(myAnswerGiven) : "");
    setShowCorrectionForm(true);
  }

  async function submitCorrection() {
    if (!factId || !template) return;
    setSubmittingCorrection(true);
    setError("");

    try {
      const parsed = parseAnswerValue(template.answer_input_kind, correctionValue);
      if (!parsed.ok) throw new Error(parsed.error);

      const { error: rpcError } = await supabase.rpc("propose_correction", {
        p_fact_id: factId,
        p_proposed_value: parsed.value,
        p_comment: correctionComment.trim() || null,
      });
      if (rpcError) throw rpcError;

      await loadFactExtras(factId);
      setShowCorrectionForm(false);
      setCorrectionValue("");
      setCorrectionComment("");
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setSubmittingCorrection(false);
    }
  }

  async function decideCorrection(accept: boolean) {
    if (!factId) return;
    setDecidingCorrection(true);
    setError("");

    const { error: rpcError } = await supabase.rpc("validate_correction", {
      p_fact_id: factId,
      p_accept: accept,
    });

    if (rpcError) {
      setError(rpcError.message);
      setDecidingCorrection(false);
      return;
    }

    // Les scores peuvent avoir changé (recalcul rétroactif) : on recharge tout.
    await loadFactExtras(factId);
    const { data: session } = await supabase
      .from("quiz_sessions")
      .select("id")
      .eq("family_id", familyId!)
      .eq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session) {
      const { data: quizQuestion } = await supabase
        .from("quiz_questions")
        .select("id")
        .eq("session_id", session.id)
        .limit(1)
        .maybeSingle();
      if (quizQuestion) {
        const { data } = await supabase.rpc("get_revealed_question", { p_quiz_question_id: quizQuestion.id });
        setReveal(data as RevealData);
      }
    }
    setDecidingCorrection(false);
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
  const isAuthor = myPersonId !== null && myPersonId === authorPersonId;
  const displayedAnswer = currentAnswerValue !== null ? currentAnswerValue : reveal.correctAnswer;

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Révélation</ThemedText>

        <View style={styles.card}>
          <ThemedText type="smallBold">{questionText}</ThemedText>
        </View>

        <ThemedText>
          Bonne réponse : {formatAnswerDisplay(reveal.answerInputKind, displayedAnswer)}
        </ThemedText>
        <ThemedText themeColor="textSecondary">Posée par {reveal.authorName}</ThemedText>
        {reveal.contextText && <ThemedText themeColor="textSecondary">{reveal.contextText}</ThemedText>}

        {answerHistory.length > 0 && (
          <View style={{ gap: Spacing.one }}>
            {answerHistory.map((h, i) => (
              <ThemedText key={i} themeColor="textSecondary" style={styles.smallText}>
                Corrigé le {new Date(h.correctedAt).toLocaleDateString("fr-FR")} :{" "}
                {formatAnswerDisplay(reveal.answerInputKind, h.oldValue)} →{" "}
                {formatAnswerDisplay(reveal.answerInputKind, h.newValue)}
                {h.note ? ` (${h.note})` : ""}
              </ThemedText>
            ))}
          </View>
        )}

        {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

        {pendingCorrection?.status === "pending" && (
          <View style={styles.card}>
            <ThemedText type="smallBold">Correction proposée</ThemedText>
            <ThemedText>
              Nouvelle valeur : {formatAnswerDisplay(reveal.answerInputKind, pendingCorrection.proposedValue)}
            </ThemedText>
            {pendingCorrection.comment && <ThemedText themeColor="textSecondary">{pendingCorrection.comment}</ThemedText>}
            {isAuthor ? (
              <View style={styles.actionsRow}>
                <Pressable onPress={() => decideCorrection(true)} disabled={decidingCorrection}>
                  <ThemedText type="linkPrimary">Accepter</ThemedText>
                </Pressable>
                <Pressable onPress={() => decideCorrection(false)} disabled={decidingCorrection}>
                  <ThemedText type="linkPrimary">Refuser</ThemedText>
                </Pressable>
              </View>
            ) : (
              <ThemedText themeColor="textSecondary">En attente de validation par l&apos;auteur.</ThemedText>
            )}
          </View>
        )}

        {pendingCorrection?.status === "refused" && (
          <ThemedText themeColor="textSecondary" style={styles.smallText}>
            Une correction a été proposée ({formatAnswerDisplay(reveal.answerInputKind, pendingCorrection.proposedValue)}
            ) puis refusée par l&apos;auteur.
          </ThemedText>
        )}

        {!isAuthor && pendingCorrection?.status !== "pending" && template && familyId && (
          <>
            {showCorrectionForm ? (
              <View style={{ gap: Spacing.two }}>
                <AnswerInput
                  template={template}
                  familyId={familyId}
                  value={correctionValue}
                  onChange={setCorrectionValue}
                />
                <TextInput
                  value={correctionComment}
                  onChangeText={setCorrectionComment}
                  placeholder="Commentaire (facultatif)"
                  style={styles.input}
                />
                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={submitCorrection}
                    disabled={submittingCorrection || correctionValue.trim().length === 0}
                  >
                    <ThemedText type="linkPrimary">
                      {submittingCorrection ? "Envoi…" : "Proposer cette correction"}
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setShowCorrectionForm(false)}>
                    <ThemedText type="linkPrimary">Annuler</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={openCorrectionForm}>
                <ThemedText type="linkPrimary">Proposer une correction</ThemedText>
              </Pressable>
            )}
          </>
        )}

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
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
    width: "100%",
  },
  participantRow: {
    gap: Spacing.half,
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  smallText: {
    fontSize: 13,
  },
});
