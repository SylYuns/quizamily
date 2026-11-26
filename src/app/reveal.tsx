// Révélation (écran 8, voir docs/ecrans.md). Refonte « Coucher de soleil » décidée et maquettée
// le 2026-11-23 (docs/maquettes/soleil/Revelation.dc.html) : suspense la première fois qu'on
// ouvre la révélation de la semaine (« Découvrir la réponse »), puis la bonne réponse, ma réponse
// à part (trouvé/raté), l'auteur et son anecdote, les résultats des autres groupés par résultat.
// get_revealed_question renvoie maintenant personId par participant (migration
// 20261123120000_respond_and_reveal_rpcs.sql) : sert à isoler ma réponse et à colorer chaque rond
// comme ailleurs dans l'app (avatarColorFor).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { AnswerInput } from "@/components/answer-input";
import { FamilyHeaderBar } from "@/components/family-header";
import { PersonAvatar } from "@/components/soleil";
import { FONTS, RADIUS, S, solidShadow, sunsetBackground } from "@/constants/soleil";
import { parseAnswerValue } from "@/lib/answer-value";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { listMyFamilies, resolveMyFamily, setPersistedFamilyId, type MyFamilyMembership } from "@/lib/my-family";
import { supabase } from "@/lib/supabase";
import { useInviteLink } from "@/lib/use-invite-link";
import { Template } from "@/types/question-template";

type RevealParticipant = {
  personId: string;
  displayName: string;
  answerGiven: string | number | null;
  result: "correct" | "incorrect" | "unanswered" | "voided" | "pending_validation";
};

type RevealData = {
  questionText: string;
  subjectName: string;
  subjectPersonId: string;
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

// L'écart ne se calcule que pour une réponse numérique (année, âge, nombre) : pour les autres
// types, un écart n'a pas de sens.
function numericGap(kind: string, given: string | number, correct: string | number): string | null {
  if (!["year", "age", "number"].includes(kind)) return null;
  const a = Number(given);
  const b = Number(correct);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const diff = Math.abs(a - b);
  if (diff === 0) return null;
  return kind === "year" || kind === "age" ? `à ${diff} an${diff === 1 ? "" : "s"} près` : `à ${diff} près`;
}

// Animations jouées une seule fois, au moment de « Découvrir la réponse » (voir ecrans.md,
// écran 8) : sur le canvas des maquettes elles tournent en boucle pour qu'on les voie, ici elles
// ne jouent qu'au moment où `animate` est vrai au montage du composant — jamais en rouvrant une
// révélation déjà vue sur cet appareil (showSuspense alors déjà à false, voir plus bas).
// Pas de Reanimated : react-native-reanimated est une dépendance transitive jamais utilisée dans
// l'app, dont la seule convention d'animation existante (src/app/family-tree.tsx) est l'API
// Animated native, pilote désactivé sur web (useNativeDriver non pris en charge pour tout, voir
// USE_NATIVE_DRIVER ci-dessous).
const USE_NATIVE_DRIVER = Platform.OS !== "web";

const CONFETTI_COLORS = [S.sun, S.action, "#9FD3C7", "#B9A3E3", "#F7A06A", S.flagBlue, S.flagRed, S.white, S.knowledge];

function Confetti() {
  // eslint-disable-next-line react-hooks/refs -- pieces est une liste d'Animated.Value stable (créée une seule fois), lue hors du rendu réactif par design, comme `pan` dans family-tree.tsx.
  const pieces = useRef(
    Array.from({ length: 22 }).map((_, i) => ({
      left: (i * 37 + 11) % 380,
      size: 7 + (i % 3) * 3,
      round: i % 3 === 0,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: (i * 90) % 900,
      duration: 1400 + (i % 4) * 220,
      progress: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    Animated.parallel(
      pieces.map((p) =>
        Animated.timing(p.progress, {
          toValue: 1,
          duration: p.duration,
          delay: p.delay,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ),
    ).start();
  }, [pieces]);

  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {/* eslint-disable-next-line react-hooks/refs -- lit les Animated.Value stables de `pieces` pour positionner chaque confetti. */}
      {pieces.map((p, i) => {
        const translateY = p.progress.interpolate({ inputRange: [0, 1], outputRange: [-20, 460] });
        const rotate = p.progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "540deg"] });
        const opacity = p.progress.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: p.left,
              width: p.size,
              height: p.round ? p.size : p.size * 1.6,
              borderRadius: p.round ? p.size / 2 : 2,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}

// La bonne réponse « surgit » : agrandissement puis léger dépassement avant de se stabiliser
// (spring naturellement oscillant), avec une légère rotation qui revient à 0.
function AnswerCartouche({ label, value, small, animate }: { label: string; value: string; small: boolean; animate: boolean }) {
  // eslint-disable-next-line react-hooks/refs -- progress est un Animated.Value stable, lu hors du rendu réactif par design, comme `pan` dans family-tree.tsx.
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.spring(progress, { toValue: 1, friction: 5, tension: 140, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [animate, progress]);

  // eslint-disable-next-line react-hooks/refs -- interpole le même Animated.Value stable.
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  // eslint-disable-next-line react-hooks/refs -- idem.
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["-10deg", "0deg"] });

  return (
    <Animated.View style={[styles.answerCartouche, { transform: [{ scale }, { rotate }] }]}>
      <Text style={styles.answerCartoucheLabel}>{label}</Text>
      <Text style={[styles.answerCartoucheValue, small && styles.answerCartoucheValueSmall]}>{value}</Text>
    </Animated.View>
  );
}

// La carte de ma réponse tremble brièvement quand j'ai raté (pas de confettis dans ce cas).
function ShakeView({ style, animate, children }: { style: StyleProp<ViewStyle>; animate: boolean; children: ReactNode }) {
  // eslint-disable-next-line react-hooks/refs -- shakeX est un Animated.Value stable, lu hors du rendu réactif par design, comme `pan` dans family-tree.tsx.
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.sequence(
      [-7, 7, -5, 4, -2, 0].map((toValue) =>
        Animated.timing(shakeX, { toValue, duration: 55, useNativeDriver: USE_NATIVE_DRIVER }),
      ),
    ).start();
  }, [animate, shakeX]);

  return <Animated.View style={[style, { transform: [{ translateX: shakeX }] }]}>{children}</Animated.View>;
}

export default function RevealScreen() {
  const params = useLocalSearchParams<{ questionId?: string; family?: string }>();
  const fromArchive = typeof params.questionId === "string" && params.questionId.length > 0;
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
  const [reveal, setReveal] = useState<RevealData | null>(null);
  // Suspense seulement pour la révélation de la semaine, la première fois qu'on l'ouvre sur cet
  // appareil (pas depuis les archives, pas en rouvrant une révélation déjà vue).
  const [showSuspense, setShowSuspense] = useState(false);
  const [discovered, setDiscovered] = useState(false);

  const [quizQuestionId, setQuizQuestionId] = useState<string | null>(null);
  const [factId, setFactId] = useState<string | null>(null);
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

  const didLoad = useRef(false);

  async function loadFactExtras(fId: string) {
    // La bonne réponse n'est plus lisible directement sur facts (migration
    // 20261110140000) : get_fact_answer la renvoie une fois le fait révélé.
    const [{ data: fact }, { data: answer }] = await Promise.all([
      supabase.from("facts").select("author_person_id, question_templates (*)").eq("id", fId).maybeSingle(),
      supabase.rpc("get_fact_answer", { p_fact_id: fId }),
    ]);
    if (!fact) return;
    const a = (answer ?? null) as {
      answer_value: string | number | null;
      answer_history: HistoryEntry[] | null;
      pending_correction: PendingCorrection | null;
    } | null;
    setAuthorPersonId(fact.author_person_id);
    setCurrentAnswerValue(a?.answer_value ?? null);
    setTemplate(fact.question_templates as unknown as Template);
    setPendingCorrection(a?.pending_correction ?? null);
    setAnswerHistory(a?.answer_history ?? []);
  }

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

  useEffect(() => {
    if (!familyId || !myPersonId || didLoad.current) return;
    didLoad.current = true;
    let cancelled = false;

    async function load() {
      let resolvedQuizQuestionId: string | null = null;
      let resolvedFactId: string | null = null;
      let isWeeklyFirstView = false;

      if (fromArchive) {
        const { data: quizQuestion } = await supabase
          .from("quiz_questions")
          .select("id, fact_id")
          .eq("id", params.questionId as string)
          .maybeSingle();
        if (cancelled || !quizQuestion) {
          setReady(true);
          return;
        }
        resolvedQuizQuestionId = quizQuestion.id;
        resolvedFactId = quizQuestion.fact_id;
      } else {
        const { data: session } = await supabase
          .from("quiz_sessions")
          .select("id")
          .eq("family_id", familyId)
          .eq("status", "closed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;
        if (!session) {
          setReady(true);
          return;
        }

        // L'accueil (écran 4) affiche "La révélation est là !" tant que la dernière session
        // close n'a pas été consultée ici : on marque celle-ci comme vue. Sert aussi à savoir
        // si c'est la toute première consultation (pour le suspense).
        const lastSeen = await AsyncStorage.getItem(`quizamily:lastSeenReveal:${familyId}`).catch(() => null);
        isWeeklyFirstView = lastSeen !== session.id;
        AsyncStorage.setItem(`quizamily:lastSeenReveal:${familyId}`, session.id).catch(() => {});

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
        resolvedQuizQuestionId = quizQuestion.id;
        resolvedFactId = quizQuestion.fact_id;
      }

      if (!resolvedQuizQuestionId || !resolvedFactId) {
        setReady(true);
        return;
      }

      setQuizQuestionId(resolvedQuizQuestionId);
      setFactId(resolvedFactId);

      const [{ data, error: rpcError }, { data: myRecipient }] = await Promise.all([
        supabase.rpc("get_revealed_question", { p_quiz_question_id: resolvedQuizQuestionId }),
        supabase
          .from("question_recipients")
          .select("answer_given")
          .eq("quiz_question_id", resolvedQuizQuestionId)
          .eq("person_id", myPersonId)
          .maybeSingle(),
        loadFactExtras(resolvedFactId),
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
        setShowSuspense(isWeeklyFirstView);
      }
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [familyId, myPersonId, fromArchive, params.questionId]);

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
    if (quizQuestionId) {
      const { data } = await supabase.rpc("get_revealed_question", { p_quiz_question_id: quizQuestionId });
      setReveal(data as RevealData);
    }
    setDecidingCorrection(false);
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

  const isAuthor = myPersonId !== null && myPersonId === authorPersonId;
  const displayedAnswer = currentAnswerValue !== null ? currentAnswerValue : reveal?.correctAnswer ?? "";
  const myParticipant = reveal?.participants.find((p) => p.personId === myPersonId) ?? null;
  const isWin = myParticipant?.result === "correct";
  const isLoss = myParticipant != null && myParticipant.result !== "correct" && myParticipant.result !== "unanswered";
  const others = (reveal?.participants ?? []).filter((p) => p.personId !== myPersonId);
  const rightRows = others.filter((p) => p.result === "correct");
  const wrongRows = others.filter((p) => p.result === "incorrect" || p.result === "voided");
  const unansweredRows = others.filter((p) => p.result === "unanswered" || p.result === "pending_validation");
  const totalParticipants = reveal?.participants.length ?? 0;
  const correctCount = reveal?.participants.filter((p) => p.result === "correct").length ?? 0;

  return (
    <View style={[styles.screen, sunsetBackground]}>
      <FamilyHeaderBar
        title="Révélation"
        onBack={() => (fromArchive ? router.back() : router.replace("/home"))}
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
      ) : error.length > 0 || !reveal ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{error || "Aucune révélation disponible pour le moment."}</Text>
          <Pressable onPress={() => router.replace("/home")}>
            <Text style={styles.linkTextDark}>Retour à l&apos;accueil</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.main}>
          <View style={[styles.card, styles.cardWaiting]}>
            <View pointerEvents="none" style={[styles.decorDot, { top: 18, right: 30 }]} />
            <View pointerEvents="none" style={[styles.decorDot, { top: 46, right: 60, width: 4, height: 4 }]} />
            <View pointerEvents="none" style={[styles.decorDot, { top: 30, right: 96, width: 3, height: 3 }]} />

            <View style={styles.cardHeaderRow}>
              <PersonAvatar personId={reveal.subjectPersonId} firstName={reveal.subjectName} size={44} isCentral={false} />
              <Text style={[styles.cardLabel, { color: S.waitingSoft }]}>Révélation de la semaine</Text>
            </View>
            <Text style={styles.cardQuestion}>{reveal.questionText}</Text>

            {showSuspense && !discovered ? (
              <>
                <View style={styles.suspenseBox}>
                  <Text style={styles.suspenseText}>? ? ? ?</Text>
                </View>
                <Pressable onPress={() => setDiscovered(true)} style={styles.discoverButton}>
                  <Text style={styles.discoverButtonText}>Découvrir la réponse</Text>
                </Pressable>
              </>
            ) : (
              <AnswerCartouche
                label="Bonne réponse"
                value={formatAnswerDisplay(reveal.answerInputKind, displayedAnswer)}
                small={typeof displayedAnswer === "string" && displayedAnswer.length > 10}
                animate={showSuspense}
              />
            )}
          </View>

          {showSuspense && discovered && isWin && <Confetti />}

          {showSuspense && !discovered && (
            <Text style={styles.suspenseSub}>
              {totalParticipants} joueur{totalParticipants === 1 ? "" : "s"} ont tenté leur chance… et qui a posé la
              question ?
            </Text>
          )}

          {(!showSuspense || discovered) && (
            <>
              {isWin && (
                <View style={styles.resultCardWin}>
                  <View style={styles.resultIconWin}>
                    <Text style={styles.resultIconWinText}>✓</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.resultTitle}>Bravo, tu as trouvé !</Text>
                    <Text style={styles.resultSub}>
                      Ta réponse : {formatAnswerDisplay(reveal.answerInputKind, myParticipant!.answerGiven ?? "")}
                    </Text>
                  </View>
                </View>
              )}
              {isLoss && (
                <ShakeView style={styles.resultCardLoss} animate={showSuspense}>
                  <View style={styles.resultIconLoss}>
                    <Text style={styles.resultIconLossText}>✗</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.resultTitle}>Raté, de peu !</Text>
                    <Text style={styles.resultSubDark}>
                      Tu avais dit {formatAnswerDisplay(reveal.answerInputKind, myParticipant!.answerGiven ?? "")}
                      {(() => {
                        const gap = numericGap(reveal.answerInputKind, myParticipant!.answerGiven ?? "", reveal.correctAnswer);
                        return gap ? ` · ${gap}` : "";
                      })()}
                    </Text>
                  </View>
                </ShakeView>
              )}
              {myPersonId !== null && myPersonId !== authorPersonId && !myParticipant && (
                <View style={styles.resultCardNeutral}>
                  <Text style={styles.resultSubDark}>Tu n&apos;as pas répondu cette fois.</Text>
                </View>
              )}

              <View style={styles.panelCream}>
                <View style={styles.cardHeaderRow}>
                  <PersonAvatar personId={authorPersonId ?? reveal.authorName} firstName={reveal.authorName} size={44} isCentral={false} />
                  <View>
                    <Text style={styles.authorLabel}>Question posée par</Text>
                    <Text style={styles.authorName}>{reveal.authorName}</Text>
                  </View>
                </View>
                {reveal.contextText && (
                  <Text style={styles.quote}>
                    <Text style={styles.quoteMark}>“ </Text>
                    {reveal.contextText}
                  </Text>
                )}
              </View>

              {answerHistory.length > 0 && (
                <View style={{ gap: 6 }}>
                  {answerHistory.map((h, i) => (
                    <Text key={i} style={styles.historyText}>
                      Corrigé le {new Date(h.correctedAt).toLocaleDateString("fr-FR")} :{" "}
                      {formatAnswerDisplay(reveal.answerInputKind, h.oldValue)} →{" "}
                      {formatAnswerDisplay(reveal.answerInputKind, h.newValue)}
                      {h.note ? ` (${h.note})` : ""}
                    </Text>
                  ))}
                </View>
              )}

              {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}

              {pendingCorrection?.status === "pending" && (
                <View style={styles.panelCream}>
                  <Text style={styles.panelTitle}>Correction proposée</Text>
                  <Text style={styles.resultSubDark}>
                    Nouvelle valeur : {formatAnswerDisplay(reveal.answerInputKind, pendingCorrection.proposedValue)}
                  </Text>
                  {pendingCorrection.comment && <Text style={styles.resultSubDark}>{pendingCorrection.comment}</Text>}
                  {isAuthor ? (
                    <View style={styles.rowGap}>
                      <Pressable onPress={() => decideCorrection(true)} disabled={decidingCorrection}>
                        <Text style={styles.linkTextAction}>Accepter</Text>
                      </Pressable>
                      <Pressable onPress={() => decideCorrection(false)} disabled={decidingCorrection}>
                        <Text style={styles.linkTextAction}>Refuser</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.resultSubDark}>En attente de validation par l&apos;auteur.</Text>
                  )}
                </View>
              )}

              {pendingCorrection?.status === "refused" && (
                <Text style={styles.historyText}>
                  Une correction a été proposée ({formatAnswerDisplay(reveal.answerInputKind, pendingCorrection.proposedValue)}
                  ) puis refusée par l&apos;auteur.
                </Text>
              )}

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{correctCount} joueurs sur {totalParticipants} ont trouvé</Text>

                {rightRows.length > 0 && (
                  <>
                    <Text style={styles.groupLabel}>Ont trouvé</Text>
                    {rightRows.map((p) => (
                      <View key={p.personId} style={styles.resultRow}>
                        <PersonAvatar personId={p.personId} firstName={p.displayName} size={38} isCentral={false} />
                        <Text style={styles.resultRowName}>{p.displayName}</Text>
                        <View style={styles.pillRight}>
                          <Text style={styles.pillRightText}>
                            ✓ {formatAnswerDisplay(reveal.answerInputKind, p.answerGiven ?? "")}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {wrongRows.length > 0 && (
                  <>
                    <Text style={styles.groupLabel}>Se sont trompés</Text>
                    {wrongRows.map((p) => {
                      const gap = numericGap(reveal.answerInputKind, p.answerGiven ?? "", reveal.correctAnswer);
                      return (
                        <View key={p.personId} style={styles.resultRow}>
                          <PersonAvatar personId={p.personId} firstName={p.displayName} size={38} isCentral={false} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.resultRowName}>{p.displayName}</Text>
                            {gap && <Text style={styles.gapText}>{gap}</Text>}
                            {p.result === "voided" && <Text style={styles.gapText}>Annulée</Text>}
                          </View>
                          <View style={styles.pillWrong}>
                            <Text style={styles.pillWrongText}>
                              {formatAnswerDisplay(reveal.answerInputKind, p.answerGiven ?? "")}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}

                {unansweredRows.length > 0 && (
                  <>
                    <Text style={styles.groupLabel}>N&apos;ont pas répondu</Text>
                    {unansweredRows.map((p) => (
                      <View key={p.personId} style={styles.resultRow}>
                        <PersonAvatar personId={p.personId} firstName={p.displayName} size={38} isCentral={false} style={{ opacity: 0.5 }} />
                        <Text style={[styles.resultRowName, { flex: 1, opacity: 0.7 }]}>{p.displayName}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>

              <Pressable
                onPress={() =>
                  router.push({ pathname: "/family-tree", params: { person: reveal.subjectPersonId, recap: "1", family: familyId! } })
                }
                style={styles.knowledgeTile}
              >
                <PersonAvatar personId={reveal.subjectPersonId} firstName={reveal.subjectName} size={44} isCentral={false} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.knowledgeTitle}>Tous les souvenirs de {reveal.subjectName}</Text>
                  <Text style={styles.knowledgeSub}>Celui-ci vient de s&apos;y ajouter</Text>
                </View>
                <Text style={styles.chevronRight}>›</Text>
              </Pressable>

              <Pressable onPress={() => router.replace("/home")} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Retour à l&apos;accueil</Text>
              </Pressable>

              {!isAuthor && pendingCorrection?.status !== "pending" && template && familyId && (
                <>
                  {showCorrectionForm ? (
                    <View style={{ gap: 10 }}>
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
                      <View style={styles.rowGap}>
                        <Pressable
                          onPress={submitCorrection}
                          disabled={submittingCorrection || correctionValue.trim().length === 0}
                        >
                          <Text style={styles.linkTextAction}>
                            {submittingCorrection ? "Envoi…" : "Proposer cette correction"}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => setShowCorrectionForm(false)}>
                          <Text style={styles.linkTextDark}>Annuler</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable onPress={openCorrectionForm} style={{ alignSelf: "center" }}>
                      <Text style={styles.correctionLink}>Une erreur dans la réponse ? Proposer une correction</Text>
                    </Pressable>
                  )}
                </>
              )}
            </>
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

  card: { position: "relative", padding: 20, borderRadius: RADIUS.card, overflow: "hidden", gap: 14 },
  cardWaiting: { backgroundColor: S.waiting, ...solidShadow(S.waitingShadow) },
  confettiLayer: { position: "absolute", left: 0, right: 0, top: 0, height: 480, overflow: "hidden", zIndex: 5 },
  decorDot: { position: "absolute", borderRadius: 3, backgroundColor: S.actionSoft },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, zIndex: 1 },
  cardLabel: { fontSize: 13, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.84, textTransform: "uppercase" },
  cardQuestion: { fontFamily: FONTS.title, fontSize: 24, lineHeight: 28, color: S.white, zIndex: 1 },

  suspenseBox: { zIndex: 1, height: 96, borderRadius: 22, borderWidth: 3, borderStyle: "dashed", borderColor: "rgba(255,217,194,0.6)", alignItems: "center", justifyContent: "center" },
  suspenseText: { fontFamily: FONTS.title, fontSize: 48, color: S.waitingSoft },
  discoverButton: { zIndex: 1, minHeight: 56, borderRadius: 28, backgroundColor: S.sun, alignItems: "center", justifyContent: "center", ...solidShadow("#C99A2E", 5) },
  discoverButtonText: { fontFamily: FONTS.title, fontSize: 20, color: S.ink },
  suspenseSub: { textAlign: "center", fontSize: 14, fontFamily: FONTS.bodyBold, color: S.inkOnGround },

  answerCartouche: { zIndex: 1, alignItems: "center", gap: 4, paddingVertical: 14, paddingHorizontal: 10, borderRadius: 22, backgroundColor: S.cream },
  answerCartoucheLabel: { fontSize: 13, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.6, textTransform: "uppercase", color: S.action },
  answerCartoucheValue: { fontFamily: FONTS.title, fontSize: 48, lineHeight: 52, color: S.ink, textAlign: "center" },
  answerCartoucheValueSmall: { fontSize: 28, lineHeight: 32 },

  resultCardWin: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: RADIUS.card, backgroundColor: S.sun, ...solidShadow("#C99A2E", 5) },
  resultIconWin: { width: 48, height: 48, borderRadius: 24, backgroundColor: S.action, alignItems: "center", justifyContent: "center" },
  resultIconWinText: { color: S.white, fontSize: 22, fontFamily: FONTS.bodyHeavy },
  resultCardLoss: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: RADIUS.card, backgroundColor: S.cream, borderWidth: 3, borderColor: S.badgeRed, ...solidShadow() },
  resultIconLoss: { width: 48, height: 48, borderRadius: 24, backgroundColor: S.alertBg, alignItems: "center", justifyContent: "center" },
  resultIconLossText: { color: S.alertInk, fontSize: 22, fontFamily: FONTS.bodyHeavy },
  resultCardNeutral: { padding: 16, borderRadius: RADIUS.card, backgroundColor: S.cream },
  resultTitle: { fontFamily: FONTS.title, fontSize: 21, color: S.ink },
  resultSub: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.inkOnGround },
  resultSubDark: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.inkSoft },

  panelCream: { gap: 8, padding: 16, borderRadius: RADIUS.card, backgroundColor: S.cream, ...solidShadow() },
  authorLabel: { fontSize: 12, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.6, textTransform: "uppercase", color: S.action },
  authorName: { fontFamily: FONTS.title, fontSize: 19, color: S.ink },
  quote: { marginTop: 2, fontSize: 15, lineHeight: 21, fontStyle: "italic", color: S.ink, paddingLeft: 4 },
  quoteMark: { fontFamily: FONTS.title, fontSize: 22, color: S.action },

  historyText: { fontSize: 13, fontFamily: FONTS.bodySemi, color: S.inkSoft },

  panel: { gap: 10, padding: 16, borderRadius: RADIUS.card, borderWidth: 2, borderColor: S.glassBorder, backgroundColor: S.glass },
  panelTitle: { fontFamily: FONTS.title, fontSize: 19, color: S.ink },
  groupLabel: { marginTop: 4, fontSize: 12, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.6, textTransform: "uppercase", color: S.inkSoft },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  resultRowName: { fontSize: 16, fontFamily: FONTS.bodyHeavy, color: S.ink },
  pillRight: { maxWidth: 200, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: S.sun },
  pillRightText: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.ink, textAlign: "right" },
  pillWrong: { maxWidth: 200, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: S.alertBg },
  pillWrongText: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.alertInk, textAlign: "right" },
  gapText: { fontSize: 12, fontFamily: FONTS.bodyBold, color: S.inkSoft },

  knowledgeTile: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: RADIUS.card, backgroundColor: S.knowledge, ...solidShadow() },
  knowledgeTitle: { fontFamily: FONTS.title, fontSize: 17, color: S.ink },
  knowledgeSub: { fontSize: 13, fontFamily: FONTS.bodySemi, color: S.knowledgeInk },
  chevronRight: { fontSize: 20, color: S.action, fontFamily: FONTS.bodyHeavy },

  primaryButton: { minHeight: 50, borderRadius: 25, backgroundColor: S.action, alignItems: "center", justifyContent: "center", ...solidShadow(S.actionShadow, 4) },
  primaryButtonText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 16 },

  correctionLink: { fontSize: 14, fontFamily: FONTS.bodyBold, color: "#5E260B" },

  linkTextDark: { textAlign: "center", fontSize: 15, fontFamily: FONTS.bodyHeavy, color: S.inkOnGround },
  linkTextAction: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.action },
  rowGap: { flexDirection: "row", alignItems: "center", gap: 14 },
  errorText: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.alertInk },
  input: { height: 46, paddingHorizontal: 14, borderWidth: 2, borderColor: "#EAD9BD", borderRadius: 14, backgroundColor: S.white, fontFamily: FONTS.body, fontSize: 15, color: S.ink },
});
