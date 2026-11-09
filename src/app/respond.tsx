import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AnswerInput } from "@/components/answer-input";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { parseAnswerValue } from "@/lib/answer-value";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { supabase } from "@/lib/supabase";
import { Template } from "@/types/question-template";

type QuestionState = {
  recipientId: string;
  quizQuestionId: string;
  answerValueSnapshot: string | number;
  answerInputKind: string;
  template: Template;
  subjectName: string;
  currentAnswer: string | number | null;
  result: string;
};

type Participant = {
  person_id: string;
  display_name: string;
  answered: boolean;
};

type OwnQuestionState = {
  questionText: string;
  answerDisplay: string;
  contextText: string | null;
  participants: Participant[];
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s\-']/g, "");
}

function computeResult(kind: string, given: string | number, snapshot: string | number): "correct" | "incorrect" | "pending_validation" {
  const isMatch =
    typeof given === "number" || typeof snapshot === "number"
      ? Number(given) === Number(snapshot)
      : normalize(String(given)) === normalize(String(snapshot));

  if (isMatch) return "correct";
  return kind === "free_text" ? "pending_validation" : "incorrect";
}

export default function RespondScreen() {
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [error, setError] = useState("");

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [sessionClosesAt, setSessionClosesAt] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [ownQuestion, setOwnQuestion] = useState<OwnQuestionState | null>(null);
  const [notParticipating, setNotParticipating] = useState(false);

  const [answerValue, setAnswerValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [answered, setAnswered] = useState(false);

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
      setFamilyId(me.family_id);

      const { data: session } = await supabase
        .from("quiz_sessions")
        .select("id, closes_at")
        .eq("family_id", me.family_id)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!session) {
        setReady(true);
        return;
      }
      setSessionClosesAt(session.closes_at);

      const { data: quizQuestion } = await supabase
        .from("quiz_questions")
        .select(
          "id, answer_value_snapshot, facts (author_person_id, context_text, answer_value, subject_person_id, question_templates (*), persons:subject_person_id (display_name))",
        )
        .eq("session_id", session.id)
        .limit(1)
        .maybeSingle();

      if (cancelled || !quizQuestion) {
        setReady(true);
        return;
      }

      const facts = quizQuestion.facts as unknown as {
        author_person_id: string;
        context_text: string | null;
        answer_value: string | number;
        subject_person_id: string;
        question_templates: Template;
        persons: { display_name: string } | null;
      };

      const { data: recipient } = await supabase
        .from("question_recipients")
        .select("id, answer_given, result")
        .eq("quiz_question_id", quizQuestion.id)
        .eq("person_id", me.id)
        .maybeSingle();

      if (cancelled) return;
      if (!recipient) {
        if (facts.author_person_id === me.id) {
          const questionText = facts.question_templates.template_text.replace(
            "<sujet>",
            facts.persons?.display_name ?? "?",
          );
          const { data: participants } = await supabase.rpc("get_question_participants", {
            p_quiz_question_id: quizQuestion.id,
          });
          if (cancelled) return;
          setOwnQuestion({
            questionText,
            answerDisplay: formatAnswerDisplay(facts.question_templates.answer_input_kind, facts.answer_value),
            contextText: facts.context_text,
            participants: (participants as Participant[] | null) ?? [],
          });
        } else {
          // Ni destinataire, ni auteur : a rejoint la famille après la création de la session.
          setNotParticipating(true);
        }
        setReady(true);
        return;
      }

      const q: QuestionState = {
        recipientId: recipient.id,
        quizQuestionId: quizQuestion.id,
        answerValueSnapshot: quizQuestion.answer_value_snapshot,
        answerInputKind: facts.question_templates.answer_input_kind,
        template: facts.question_templates,
        subjectName: facts.persons?.display_name ?? "?",
        currentAnswer: recipient.answer_given,
        result: recipient.result,
      };
      setQuestion(q);
      if (recipient.answer_given !== null && recipient.answer_given !== undefined) {
        setAnswerValue(String(recipient.answer_given));
      }
      setAnswered(recipient.result !== "unanswered");
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAnswer() {
    if (!question) return;
    setSubmitting(true);
    setError("");

    try {
      const parsed = parseAnswerValue(question.answerInputKind, answerValue);
      if (!parsed.ok) throw new Error(parsed.error);

      const result = computeResult(question.answerInputKind, parsed.value, question.answerValueSnapshot);

      const { error: updateError } = await supabase
        .from("question_recipients")
        .update({ answer_given: parsed.value, answered_at: new Date().toISOString(), result })
        .eq("id", question.recipientId);
      if (updateError) throw updateError;

      setAnswered(true);
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
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

  if (ownQuestion) {
    return (
      <ThemedView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <ThemedText type="title">Ma question</ThemedText>
          <ThemedText themeColor="textSecondary">
            C&apos;est toi qui as posé cette question : les autres joueurs y répondent en ce moment, tu ne peux pas y
            participer toi-même.
          </ThemedText>

          <View style={styles.card}>
            <ThemedText type="smallBold">{ownQuestion.questionText}</ThemedText>
          </View>
          <ThemedText>Réponse : {ownQuestion.answerDisplay}</ThemedText>
          {ownQuestion.contextText && <ThemedText themeColor="textSecondary">{ownQuestion.contextText}</ThemedText>}

          {ownQuestion.participants.length > 0 && (
            <View style={{ gap: Spacing.one }}>
              <ThemedText type="smallBold">Qui a répondu ?</ThemedText>
              {ownQuestion.participants.map((p) => (
                <ThemedText key={p.person_id} themeColor="textSecondary">
                  {p.answered ? "✓" : "…"} {p.display_name}
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

  if (!question) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.three, padding: Spacing.four }}>
        <ThemedText type="title">Répondre</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320 }}>
          {notParticipating
            ? "Une session est en cours, mais tu n'y participes pas cette fois."
            : "Aucune session en cours pour le moment."}
        </ThemedText>
        <Pressable onPress={() => router.replace("/home")}>
          <ThemedText type="linkPrimary">Retour à l&apos;accueil</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const questionText = question.template.template_text.replace("<sujet>", question.subjectName);

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Répondre</ThemedText>

        {sessionClosesAt && (
          <ThemedText themeColor="textSecondary">
            Il reste jusqu&apos;au {new Date(sessionClosesAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} pour répondre.
          </ThemedText>
        )}

        <View style={styles.card}>
          <ThemedText type="smallBold">{questionText}</ThemedText>
        </View>

        {answered ? (
          <>
            <ThemedText themeColor="textSecondary">Réponse enregistrée : {String(answerValue)}</ThemedText>
            <Pressable onPress={() => setAnswered(false)}>
              <ThemedText type="linkPrimary">Modifier ma réponse</ThemedText>
            </Pressable>
          </>
        ) : (
          <>
            <AnswerInput
              template={question.template}
              familyId={familyId!}
              value={answerValue}
              onChange={setAnswerValue}
            />

            {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

            <Pressable
              onPress={submitAnswer}
              disabled={submitting || answerValue.trim().length === 0}
              style={[styles.primaryButton, (submitting || answerValue.trim().length === 0) && { opacity: 0.6 }]}
            >
              <ThemedText style={{ color: "#ffffff" }}>{submitting ? "Envoi…" : "Valider ma réponse"}</ThemedText>
            </Pressable>
          </>
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
  },
  primaryButton: {
    backgroundColor: "#3c87f7",
    borderRadius: 8,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
  },
});
