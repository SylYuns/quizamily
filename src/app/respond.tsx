import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AnswerInput } from "@/components/answer-input";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { parseAnswerValue } from "@/lib/answer-value";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { substituteQuestionText } from "@/lib/question-text";
import { supabase } from "@/lib/supabase";
import { Template } from "@/types/question-template";

type QuestionState = {
  recipientId: string;
  quizQuestionId: string;
  answerInputKind: string;
  template: Template;
  subjectName: string;
  relatedName: string | null;
  slotValues: Record<string, string> | null;
  result: string;
};

type Participant = {
  person_id: string;
  display_name: string;
  answered: boolean;
};

type OwnQuestionState = {
  quizQuestionId: string;
  questionText: string;
  answerDisplay: string;
  contextText: string | null;
  participants: Participant[];
  pendingValidationCount: number;
};

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
  const [revealing, setRevealing] = useState(false);

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

      // Ne jamais demander answer_value_snapshot / facts.answer_value ici : tant qu'on ne
      // sait pas si l'appelant est l'auteur, ça finirait dans la réponse réseau d'un
      // destinataire qui n'a pas encore répondu.
      const { data: quizQuestion } = await supabase
        .from("quiz_questions")
        .select(
          "id, facts (id, author_person_id, subject_person_id, slot_values, question_templates (*), persons:subject_person_id (display_name), relatedPerson:related_person_id (display_name))",
        )
        .eq("session_id", session.id)
        .limit(1)
        .maybeSingle();

      if (cancelled || !quizQuestion) {
        setReady(true);
        return;
      }

      const facts = quizQuestion.facts as unknown as {
        id: string;
        author_person_id: string;
        subject_person_id: string;
        slot_values: Record<string, string> | null;
        question_templates: Template;
        persons: { display_name: string } | null;
        relatedPerson: { display_name: string } | null;
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
          // C'est mon propre fait : lire sa réponse m'est toujours permis.
          const [{ data: myFact }, { data: participants }, { data: pendingData }] = await Promise.all([
            supabase.from("facts").select("answer_value, context_text").eq("id", facts.id).maybeSingle(),
            supabase.rpc("get_question_participants", { p_quiz_question_id: quizQuestion.id }),
            supabase.rpc("get_pending_validations", { p_quiz_question_id: quizQuestion.id }),
          ]);
          if (cancelled || !myFact) return;

          const questionText = substituteQuestionText(
            facts.question_templates.template_text,
            facts.question_templates.related_role,
            facts.persons?.display_name ?? "?",
            facts.relatedPerson?.display_name ?? null,
            facts.slot_values,
          );
          const pendingGroups = (pendingData?.pending as { count: number }[] | undefined) ?? [];
          setOwnQuestion({
            quizQuestionId: quizQuestion.id,
            questionText,
            answerDisplay: formatAnswerDisplay(facts.question_templates.answer_input_kind, myFact.answer_value),
            contextText: myFact.context_text,
            participants: (participants as Participant[] | null) ?? [],
            pendingValidationCount: pendingGroups.reduce((sum, g) => sum + g.count, 0),
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
        answerInputKind: facts.question_templates.answer_input_kind,
        template: facts.question_templates,
        subjectName: facts.persons?.display_name ?? "?",
        relatedName: facts.relatedPerson?.display_name ?? null,
        slotValues: facts.slot_values,
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

      // Le calcul du résultat (juste/faux) se fait côté serveur : le client ne connaît
      // jamais la bonne réponse avant la révélation.
      const { error: rpcError } = await supabase.rpc("submit_answer", {
        p_quiz_question_id: question.quizQuestionId,
        p_answer_given: parsed.value,
      });
      if (rpcError) throw rpcError;

      setAnswered(true);
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  async function triggerReveal() {
    if (!ownQuestion) return;
    setRevealing(true);
    setError("");

    const { error: rpcError } = await supabase.rpc("reveal_current_question", {
      p_quiz_question_id: ownQuestion.quizQuestionId,
    });

    if (rpcError) {
      setError(rpcError.message);
      setRevealing(false);
      return;
    }

    router.replace("/reveal");
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
    const allAnswered = ownQuestion.participants.length > 0 && ownQuestion.participants.every((p) => p.answered);
    const hasPendingValidations = ownQuestion.pendingValidationCount > 0;
    // Les joueurs qui n'ont pas répondu ne bloquent pas la révélation (comptés faux) :
    // seules les réponses libres encore à valider la bloquent.
    const canReveal = !hasPendingValidations;

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

          {hasPendingValidations && (
            <Pressable onPress={() => router.push("/validate")}>
              <ThemedText type="linkPrimary">
                Valider les réponses ({ownQuestion.pendingValidationCount} en attente)
              </ThemedText>
            </Pressable>
          )}

          {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

          <Pressable
            onPress={triggerReveal}
            disabled={!canReveal || revealing}
            style={[styles.primaryButton, (!canReveal || revealing) && { opacity: 0.6 }]}
          >
            <ThemedText style={{ color: "#ffffff" }}>
              {revealing
                ? "Révélation…"
                : hasPendingValidations
                  ? "Valide d'abord les réponses en attente"
                  : "Déclencher la révélation"}
            </ThemedText>
          </Pressable>
          {canReveal && !allAnswered && (
            <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320, fontSize: 12 }}>
              Tout le monde n&apos;a pas encore répondu : les réponses manquantes compteront faux.
            </ThemedText>
          )}
          {hasPendingValidations && sessionClosesAt && (
            <ThemedText themeColor="textSecondary" style={{ textAlign: "center", maxWidth: 320, fontSize: 12 }}>
              {new Date(sessionClosesAt) < new Date()
                ? "La date limite est passée : la question sera révélée dès que tu auras validé toutes les réponses."
                : `Valide les réponses avant le ${new Date(sessionClosesAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} : la question sera révélée à cette date.`}
            </ThemedText>
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

  const questionText = substituteQuestionText(
    question.template.template_text,
    question.template.related_role,
    question.subjectName,
    question.relatedName,
    question.slotValues,
  );

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
