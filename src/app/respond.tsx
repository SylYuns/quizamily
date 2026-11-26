// Répondre (écran 6, voir docs/ecrans.md) + vue de l'auteur (« Ma question »). Refonte « Coucher
// de soleil » décidée et maquettée le 2026-11-23 (docs/maquettes/soleil/Repondre.dc.html) :
// carte brune tant qu'on n'a pas répondu, prune une fois répondu (ou pour l'auteur) ; compteur
// d'avancement sous la carte (jamais la liste des répondants — l'auteur n'en fait pas partie, il
// serait sinon la seule personne absente de la liste) avec les noms des retardataires seulement
// une fois 65 % des destinataires répondu (get_question_progress, security definer) ; l'auteur
// peut modifier son anecdote pendant la semaine de sa question (update_fact_context, security
// definer) — voir supabase/migrations/20261123120000_respond_and_reveal_rpcs.sql.
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AnswerInput } from "@/components/answer-input";
import { FamilyHeaderBar } from "@/components/family-header";
import { PersonAvatar } from "@/components/soleil";
import { FONTS, RADIUS, S, solidShadow, sunsetBackground } from "@/constants/soleil";
import { parseAnswerValue } from "@/lib/answer-value";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { listMyFamilies, resolveMyFamily, setPersistedFamilyId, type MyFamilyMembership } from "@/lib/my-family";
import { substituteQuestionText } from "@/lib/question-text";
import { supabase } from "@/lib/supabase";
import { useInviteLink } from "@/lib/use-invite-link";
import { Template } from "@/types/question-template";

type QuestionState = {
  recipientId: string;
  quizQuestionId: string;
  answerInputKind: string;
  template: Template;
  subjectPersonId: string;
  subjectFirstName: string;
  subjectDisplayName: string;
  subjectIsCentral: boolean;
  subjectGender: "homme" | "femme" | null;
  relatedName: string | null;
  slotValues: Record<string, string> | null;
};

type Progress = { recipientsCount: number; answeredCount: number; lateNames: string[] | null };

type Participant = { person_id: string; display_name: string; answered: boolean };

type OwnQuestionState = {
  quizQuestionId: string;
  factId: string;
  questionText: string;
  answerDisplay: string;
  contextText: string | null;
  participants: Participant[];
  pendingValidationCount: number;
};

function daysRemaining(closesAt: string): number {
  return Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 86400000));
}

function formatDeadline(closesAt: string): string {
  return new Date(closesAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export default function RespondScreen() {
  const params = useLocalSearchParams<{ family?: string }>();
  const paramFamily = typeof params.family === "string" && params.family.length > 0 ? params.family : null;

  const [noSession, setNoSession] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [familiesLoaded, setFamiliesLoaded] = useState(false);
  const [families, setFamilies] = useState<MyFamilyMembership[]>([]);
  const [familyIndex, setFamilyIndex] = useState(0);

  const family = families[familyIndex] as MyFamilyMembership | undefined;
  const familyId = family?.familyId ?? null;
  const myPersonId = family?.personId ?? null;
  const { copied, copy: copyInviteLink } = useInviteLink(familyId);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [sessionClosesAt, setSessionClosesAt] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [ownQuestion, setOwnQuestion] = useState<OwnQuestionState | null>(null);
  const [notParticipating, setNotParticipating] = useState(false);

  const [answerValue, setAnswerValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const [editingContext, setEditingContext] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  const [savingContext, setSavingContext] = useState(false);

  // Familles du joueur (bandeau), une fois à la connexion.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        if (!cancelled) {
          setNoSession(true);
          setFamiliesLoaded(true);
        }
        return;
      }
      setUserId(uid);

      const myFamilies = await listMyFamilies(uid);
      if (cancelled) return;
      setFamilies(myFamilies);

      const current = await resolveMyFamily(uid, myFamilies, paramFamily);
      if (!cancelled && current) {
        setFamilyIndex(myFamilies.findIndex((f) => f.familyId === current.familyId));
      }
      setFamiliesLoaded(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [paramFamily]);

  // Question en cours pour la famille active.
  useEffect(() => {
    if (!familyId || !myPersonId) return;
    let cancelled = false;

    async function load() {
      setReady(false);
      setError("");
      setOwnQuestion(null);
      setQuestion(null);
      setProgress(null);
      setNotParticipating(false);
      setAnswered(false);
      setAnswerValue("");
      setEditingContext(false);

      const { data: session } = await supabase
        .from("quiz_sessions")
        .select("id, closes_at")
        .eq("family_id", familyId)
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
          "id, facts (id, author_person_id, subject_person_id, slot_values, question_templates (*), persons:subject_person_id (first_name, display_name, gender, is_central), relatedPerson:related_person_id (display_name))",
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
        persons: { first_name: string; display_name: string; gender: "homme" | "femme" | null; is_central: boolean } | null;
        relatedPerson: { display_name: string } | null;
      };

      const { data: recipient } = await supabase
        .from("question_recipients")
        .select("id, answer_given, result")
        .eq("quiz_question_id", quizQuestion.id)
        .eq("person_id", myPersonId)
        .maybeSingle();

      if (cancelled) return;
      if (!recipient) {
        if (facts.author_person_id === myPersonId) {
          // C'est mon propre fait : lire sa réponse m'est toujours permis.
          // La bonne réponse n'est plus lisible directement sur facts (migration
          // 20261110140000) : get_fact_answer la renvoie à l'auteur.
          const [{ data: myFact }, { data: myAnswer }, { data: participants }, { data: pendingData }] =
            await Promise.all([
              supabase.from("facts").select("context_text").eq("id", facts.id).maybeSingle(),
              supabase.rpc("get_fact_answer", { p_fact_id: facts.id }),
              supabase.rpc("get_question_participants", { p_quiz_question_id: quizQuestion.id }),
              supabase.rpc("get_pending_validations", { p_quiz_question_id: quizQuestion.id }),
            ]);
          if (cancelled || !myFact) return;
          const myAnswerValue = (myAnswer as { answer_value: string | number } | null)?.answer_value ?? "";

          const questionText = substituteQuestionText(
            facts.question_templates.template_text,
            facts.question_templates.related_role,
            facts.persons?.display_name ?? "?",
            facts.relatedPerson?.display_name ?? null,
            facts.slot_values,
            facts.persons?.gender ?? null,
          );
          const pendingGroups = (pendingData?.pending as { count: number }[] | undefined) ?? [];
          setOwnQuestion({
            quizQuestionId: quizQuestion.id,
            factId: facts.id,
            questionText,
            answerDisplay: formatAnswerDisplay(facts.question_templates.answer_input_kind, myAnswerValue),
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
        subjectPersonId: facts.subject_person_id,
        subjectFirstName: facts.persons?.first_name ?? "?",
        subjectDisplayName: facts.persons?.display_name ?? "?",
        subjectIsCentral: facts.persons?.is_central ?? false,
        subjectGender: facts.persons?.gender ?? null,
        relatedName: facts.relatedPerson?.display_name ?? null,
        slotValues: facts.slot_values,
      };
      setQuestion(q);
      if (recipient.answer_given !== null && recipient.answer_given !== undefined) {
        setAnswerValue(String(recipient.answer_given));
      }
      setAnswered(recipient.result !== "unanswered");

      const { data: progressData } = await supabase.rpc("get_question_progress", {
        p_quiz_question_id: quizQuestion.id,
      });
      if (!cancelled && progressData) {
        setProgress(progressData as Progress);
      }

      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [familyId, myPersonId]);

  async function refreshProgress(quizQuestionId: string) {
    const { data } = await supabase.rpc("get_question_progress", { p_quiz_question_id: quizQuestionId });
    if (data) setProgress(data as Progress);
  }

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
      await refreshProgress(question.quizQuestionId);
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditContext() {
    setContextDraft(ownQuestion?.contextText ?? "");
    setEditingContext(true);
    setError("");
  }

  async function saveContext() {
    if (!ownQuestion) return;
    setSavingContext(true);
    setError("");

    const nextContext = contextDraft.trim().length > 0 ? contextDraft.trim() : null;
    const { error: rpcError } = await supabase.rpc("update_fact_context", {
      p_fact_id: ownQuestion.factId,
      p_context_text: nextContext,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setOwnQuestion((prev) => (prev ? { ...prev, contextText: nextContext } : prev));
      setEditingContext(false);
    }
    setSavingContext(false);
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

    router.replace({ pathname: "/reveal", params: { family: familyId! } });
  }

  if (noSession) {
    return <Redirect href="/" />;
  }

  if (!familiesLoaded) {
    return (
      <View style={[styles.screen, sunsetBackground, styles.centered]}>
        <ActivityIndicator color={S.action} />
      </View>
    );
  }

  if (families.length === 0) {
    return <Redirect href="/family-setup" />;
  }

  function switchFamily(newFamilyId: string) {
    if (userId) setPersistedFamilyId(userId, newFamilyId);
    setFamilyIndex(families.findIndex((f) => f.familyId === newFamilyId));
  }

  const isAuthorView = !!ownQuestion;

  return (
    <View style={[styles.screen, sunsetBackground]}>
      <FamilyHeaderBar
        title={isAuthorView ? "Ma question" : "Question de la semaine"}
        onBack={() => router.replace("/home")}
        families={families}
        currentFamilyId={family!.familyId}
        currentUserId={userId}
        onSwitchFamily={switchFamily}
        copied={copied}
        onCopyInvite={copyInviteLink}
        onEmblemChanged={({ symbol, color }) =>
          setFamilies((prev) =>
            prev.map((f) => (f.familyId === family!.familyId ? { ...f, emblemSymbol: symbol, emblemColor: color } : f)),
          )
        }
      />

      {!ready ? (
        <View style={styles.centered}>
          <ActivityIndicator color={S.action} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.main}>
          {ownQuestion ? (
            <>
              <View style={[styles.card, styles.cardWaiting]}>
                <View pointerEvents="none" style={[styles.decorDisc, styles.moonLight]} />
                <View pointerEvents="none" style={[styles.decorDisc, styles.moonShadow]} />
                <View pointerEvents="none" style={[styles.star, { top: 20, right: 32 }]} />
                <View pointerEvents="none" style={[styles.star, { top: 46, right: 62, width: 4, height: 4 }]} />

                <Text style={[styles.cardLabel, { color: S.waitingSoft }]}>Ta question est en jeu</Text>
                <Text style={styles.cardQuestion}>{ownQuestion.questionText}</Text>

                <View style={styles.insetPanel}>
                  <Text style={styles.insetLabel}>Bonne réponse</Text>
                  <Text style={styles.insetAnswer}>{ownQuestion.answerDisplay}</Text>
                  <Text style={[styles.insetLabel, { marginTop: 4 }]}>Ton anecdote</Text>
                  {editingContext ? (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        value={contextDraft}
                        onChangeText={setContextDraft}
                        placeholder="Un détail, un souvenir qui va avec…"
                        multiline
                        style={styles.textarea}
                      />
                      <View style={styles.rowGap}>
                        <Pressable onPress={saveContext} disabled={savingContext} style={styles.smallButtonPrimary}>
                          <Text style={styles.smallButtonPrimaryText}>{savingContext ? "Enregistrement…" : "Enregistrer"}</Text>
                        </Pressable>
                        <Pressable onPress={() => setEditingContext(false)} disabled={savingContext}>
                          <Text style={styles.cancelLink}>Annuler</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.insetBody}>{ownQuestion.contextText || "Pas encore d'anecdote."}</Text>
                      <Pressable onPress={startEditContext} style={styles.editContextButton}>
                        <Text style={styles.editContextButtonText}>✎ Modifier l&apos;anecdote</Text>
                      </Pressable>
                      <Text style={styles.hintText}>
                        Profite de la semaine pour enrichir ton souvenir : elle sera dévoilée à la révélation. (Photo et
                        enregistrement : bientôt.)
                      </Text>
                    </>
                  )}
                </View>

                {sessionClosesAt && (
                  <Text style={[styles.revealLine, { color: S.waitingSoft }]}>Révélation {formatDeadline(sessionClosesAt)}</Text>
                )}
              </View>

              {ownQuestion.participants.length > 0 && (
                <View style={styles.panel}>
                  <View style={styles.panelHeaderRow}>
                    <Text style={styles.panelTitle}>Qui a répondu ?</Text>
                    <Text style={styles.panelHeaderValue}>
                      {ownQuestion.participants.filter((p) => p.answered).length} sur {ownQuestion.participants.length}
                    </Text>
                  </View>
                  <View style={styles.participantsGrid}>
                    {ownQuestion.participants.map((p) => (
                      <View key={p.person_id} style={styles.participantItem}>
                        <PersonAvatar
                          personId={p.person_id}
                          firstName={p.display_name}
                          size={50}
                          isCentral={false}
                          style={!p.answered && styles.participantAvatarPending}
                        >
                          {p.answered && (
                            <View style={styles.participantCheck}>
                              <Text style={styles.participantCheckText}>✓</Text>
                            </View>
                          )}
                        </PersonAvatar>
                        <Text style={[styles.participantName, !p.answered && styles.participantNamePending]} numberOfLines={1}>
                          {p.display_name}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {(() => {
                    const missing = ownQuestion.participants.filter((p) => !p.answered).map((p) => p.display_name);
                    return (
                      <Text style={styles.waitingText}>
                        {missing.length > 0
                          ? `On attend encore : ${missing.join(", ")}. N'hésite pas à les relancer !`
                          : "Tout le monde a répondu."}
                      </Text>
                    );
                  })()}
                  <Text style={styles.privacyNote}>
                    Ce détail n&apos;est visible que par toi : les autres joueurs voient seulement le nombre de réponses
                    (sinon, ils devineraient que l&apos;auteur, c&apos;est toi).
                  </Text>
                </View>
              )}

              {ownQuestion.pendingValidationCount > 0 && (
                <Pressable onPress={() => router.push({ pathname: "/validate", params: { family: familyId! } })}>
                  <Text style={styles.linkTextDark}>
                    Valider les réponses ({ownQuestion.pendingValidationCount} en attente)
                  </Text>
                </Pressable>
              )}

              {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}

              <View style={{ gap: 6 }}>
                <Pressable
                  onPress={triggerReveal}
                  disabled={ownQuestion.pendingValidationCount > 0 || revealing}
                  style={[
                    styles.revealButton,
                    (ownQuestion.pendingValidationCount > 0 || revealing) && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.revealButtonText}>
                    {revealing
                      ? "Révélation…"
                      : ownQuestion.pendingValidationCount > 0
                        ? "Valide d'abord les réponses en attente"
                        : "Révéler maintenant (test)"}
                  </Text>
                </Pressable>
                {ownQuestion.pendingValidationCount === 0 &&
                  ownQuestion.participants.some((p) => !p.answered) && (
                    <Text style={styles.smallCenteredText}>Ceux qui n&apos;ont pas répondu compteront faux.</Text>
                  )}
                {ownQuestion.pendingValidationCount > 0 && sessionClosesAt && (
                  <Text style={styles.smallCenteredText}>
                    {new Date(sessionClosesAt) < new Date()
                      ? "La date limite est passée : la question sera révélée dès que tu auras validé toutes les réponses."
                      : `Valide les réponses avant le ${formatDeadline(sessionClosesAt)} : la question sera révélée à cette date.`}
                  </Text>
                )}
              </View>

              <Pressable onPress={() => router.replace("/home")}>
                <Text style={styles.linkTextDark}>Retour à l&apos;accueil</Text>
              </Pressable>
            </>
          ) : question ? (
            <>
              <View style={[styles.card, answered ? styles.cardWaiting : styles.cardAction]}>
                {answered ? (
                  <>
                    <View pointerEvents="none" style={[styles.decorDisc, styles.moonLight]} />
                    <View pointerEvents="none" style={[styles.decorDisc, styles.moonShadow]} />
                    <View pointerEvents="none" style={[styles.star, { top: 20, right: 32 }]} />
                    <View pointerEvents="none" style={[styles.star, { top: 46, right: 62, width: 4, height: 4 }]} />
                  </>
                ) : (
                  <>
                    <View pointerEvents="none" style={[styles.decorDisc, styles.sunOuter]} />
                    <View pointerEvents="none" style={[styles.decorDisc, styles.sunInner]} />
                  </>
                )}

                <View style={styles.cardHeaderRow}>
                  <PersonAvatar
                    personId={question.subjectPersonId}
                    firstName={question.subjectFirstName}
                    size={44}
                    isCentral={question.subjectIsCentral}
                  />
                  <Text style={[styles.cardLabel, { color: answered ? S.waitingSoft : S.actionSoft }]}>
                    {answered ? "Réponse envoyée" : `Une question sur ${question.subjectFirstName}`}
                  </Text>
                </View>

                <Text style={styles.cardQuestion}>
                  {substituteQuestionText(
                    question.template.template_text,
                    question.template.related_role,
                    question.subjectDisplayName,
                    question.relatedName,
                    question.slotValues,
                    question.subjectGender,
                  )}
                </Text>

                {answered ? (
                  <>
                    <View style={styles.sentRow}>
                      <View>
                        <Text style={styles.sentLabel}>Ta réponse</Text>
                        <Text style={styles.sentValue}>{formatAnswerDisplay(question.answerInputKind, answerValue)}</Text>
                      </View>
                      <Pressable onPress={() => setAnswered(false)} style={styles.modifyButton}>
                        <Text style={styles.modifyButtonText}>Modifier</Text>
                      </Pressable>
                    </View>
                    {sessionClosesAt && (
                      <Text style={[styles.revealLine, { color: S.waitingSoft }]}>
                        Révélation {formatDeadline(sessionClosesAt)} · modifiable jusque-là
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    {sessionClosesAt && (
                      <View style={styles.deadlinePill}>
                        <Text style={styles.deadlinePillText}>
                          Il reste {daysRemaining(sessionClosesAt)} jour{daysRemaining(sessionClosesAt) === 1 ? "" : "s"} ·
                          jusqu&apos;au {formatDeadline(sessionClosesAt)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.insetPanel}>
                      <AnswerInput
                        template={question.template}
                        familyId={familyId!}
                        value={answerValue}
                        onChange={setAnswerValue}
                        hideFamilyItems
                      />
                      {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}
                      <Pressable
                        onPress={submitAnswer}
                        disabled={submitting || answerValue.trim().length === 0}
                        style={[styles.primaryButton, (submitting || answerValue.trim().length === 0) && { opacity: 0.6 }]}
                      >
                        <Text style={styles.primaryButtonText}>{submitting ? "Envoi…" : "Valider ma réponse"}</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>

              <Text style={styles.teaser}>Qui a posé cette question ? Réponse à la révélation…</Text>

              {progress && progress.recipientsCount > 0 && (
                <View style={styles.panel}>
                  <View style={styles.panelHeaderRow}>
                    <Text style={styles.panelTitle}>{progress.answeredCount} ont répondu</Text>
                    <Text style={styles.panelHeaderValue}>
                      {progress.recipientsCount - progress.answeredCount} attendu
                      {progress.recipientsCount - progress.answeredCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <View style={styles.segmentsRow}>
                    {Array.from({ length: progress.recipientsCount }).map((_, i) => (
                      <View key={i} style={[styles.segment, i < progress.answeredCount && styles.segmentFilled]} />
                    ))}
                  </View>
                  <Text style={styles.lateText}>
                    {progress.lateNames === null
                      ? "Les noms des retardataires s'afficheront quand la plupart auront répondu."
                      : progress.lateNames.length === 0
                        ? "Tout le monde a répondu !"
                        : `On attend encore : ${progress.lateNames.join(", ")}. N'hésite pas à les relancer !`}
                  </Text>
                </View>
              )}

              <Pressable onPress={() => router.replace("/home")}>
                <Text style={styles.linkTextDark}>Retour à l&apos;accueil</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                {notParticipating
                  ? "Une session est en cours, mais tu n'y participes pas cette fois."
                  : "Aucune session en cours pour le moment."}
              </Text>
              <Pressable onPress={() => router.replace("/home")}>
                <Text style={styles.linkTextDark}>Retour à l&apos;accueil</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  emptyText: { fontSize: 15, fontFamily: FONTS.bodySemi, color: S.ink, textAlign: "center", maxWidth: 320 },

  titleRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingTop: 2 },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backArrow: { fontSize: 24, color: S.ink, fontFamily: FONTS.bodyHeavy },
  title: { fontFamily: FONTS.title, fontSize: 24, color: S.ink },

  main: { padding: 16, paddingTop: 10, gap: 14, maxWidth: 480, width: "100%", alignSelf: "center" },

  // ---------- Carte de la question ----------
  card: {
    position: "relative",
    padding: 20,
    borderRadius: RADIUS.card,
    overflow: "hidden",
    gap: 12,
  },
  cardAction: { backgroundColor: S.action, ...solidShadow(S.actionShadow) },
  cardWaiting: { backgroundColor: S.waiting, ...solidShadow(S.waitingShadow) },
  decorDisc: { position: "absolute" },
  sunOuter: { top: -46, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: S.sun, opacity: 0.22 },
  sunInner: { top: -12, right: -6, width: 82, height: 82, borderRadius: 41, backgroundColor: S.sun, opacity: 0.35 },
  moonLight: { top: 14, right: 26, width: 40, height: 40, borderRadius: 20, backgroundColor: S.sun, opacity: 0.9 },
  moonShadow: { top: 8, right: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: S.waiting },
  star: { position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: S.actionSoft },

  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, zIndex: 1 },
  cardLabel: { fontSize: 13, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.84, textTransform: "uppercase" },
  cardQuestion: { fontFamily: FONTS.title, fontSize: 25, lineHeight: 29, color: S.white, zIndex: 1 },

  deadlinePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    zIndex: 1,
  },
  deadlinePillText: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.actionSoft },

  insetPanel: { zIndex: 1, gap: 8, marginTop: 4, padding: 14, borderRadius: 20, backgroundColor: S.cream },
  insetLabel: { fontSize: 13, fontFamily: FONTS.bodyHeavy, color: S.inkSoft },
  insetAnswer: { fontFamily: FONTS.title, fontSize: 28, lineHeight: 32, color: S.action },
  insetBody: { fontSize: 15, lineHeight: 20, fontFamily: FONTS.body, color: S.ink },

  primaryButton: { minHeight: 50, borderRadius: 25, backgroundColor: S.action, alignItems: "center", justifyContent: "center", ...solidShadow(S.actionShadow, 4) },
  primaryButtonText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 16 },

  sentRow: { zIndex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)" },
  sentLabel: { fontSize: 13, fontFamily: FONTS.bodyHeavy, color: S.waitingSoft },
  sentValue: { fontFamily: FONTS.title, fontSize: 32, lineHeight: 36, color: S.sun },
  modifyButton: { minHeight: 44, paddingHorizontal: 16, borderWidth: 2, borderColor: S.waitingSoft, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  modifyButtonText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 14 },
  revealLine: { zIndex: 1, fontSize: 15, fontFamily: FONTS.bodyBold },

  editContextButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, marginTop: 2, paddingHorizontal: 14, borderWidth: 2, borderColor: S.action, borderRadius: 20 },
  editContextButtonText: { color: S.action, fontFamily: FONTS.bodyHeavy, fontSize: 14 },
  hintText: { fontSize: 12, fontFamily: FONTS.bodyBold, color: S.inkSoft },

  textarea: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: "#EAD9BD", borderRadius: 14, backgroundColor: S.white, fontFamily: FONTS.body, fontSize: 15, color: S.ink },
  rowGap: { flexDirection: "row", alignItems: "center", gap: 14 },
  smallButtonPrimary: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: S.action, alignItems: "center", justifyContent: "center" },
  smallButtonPrimaryText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 14 },
  cancelLink: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.inkSoft },

  teaser: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 4, fontSize: 14, fontFamily: FONTS.bodyBold, color: S.inkOnGround },

  // ---------- Panneaux (avancement, qui a répondu) ----------
  panel: { gap: 10, padding: 16, borderRadius: RADIUS.card, borderWidth: 2, borderColor: S.glassBorder, backgroundColor: S.glass },
  panelHeaderRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  panelTitle: { fontFamily: FONTS.title, fontSize: 19, color: S.ink },
  panelHeaderValue: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.inkOnGround },

  segmentsRow: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.75)" },
  segmentFilled: { backgroundColor: S.action },
  lateText: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.ink },

  participantsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  participantItem: { width: 58, alignItems: "center", gap: 4 },
  participantAvatarPending: { opacity: 0.4 },
  participantCheck: { position: "absolute", right: -5, bottom: -5, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: S.white, backgroundColor: S.action, alignItems: "center", justifyContent: "center" },
  participantCheckText: { color: S.white, fontSize: 11, fontFamily: FONTS.bodyHeavy },
  participantName: { fontSize: 13, fontFamily: FONTS.bodyHeavy, color: S.ink },
  participantNamePending: { opacity: 0.7, fontFamily: FONTS.bodyBold },
  waitingText: { fontSize: 13, fontFamily: FONTS.bodyBold, color: S.inkSoft },
  privacyNote: { fontSize: 12, fontFamily: FONTS.bodyBold, color: S.inkSoft },

  linkTextDark: { textAlign: "center", fontSize: 15, fontFamily: FONTS.bodyHeavy, color: S.inkOnGround },

  errorText: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.alertInk },

  revealButton: { minHeight: 48, borderWidth: 2, borderColor: S.action, borderRadius: 24, backgroundColor: "rgba(255,248,238,0.55)", alignItems: "center", justifyContent: "center" },
  revealButtonText: { color: "#5E260B", fontFamily: FONTS.bodyHeavy, fontSize: 15 },
  smallCenteredText: { textAlign: "center", fontSize: 12, fontFamily: FONTS.bodyBold, color: S.inkOnGround },
});
