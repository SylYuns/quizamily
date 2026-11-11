// Accueil famille (écran 4, voir docs/ecrans.md et docs/design.md).
//
// Met en avant, dans l'ordre : le bouton "Participer au quiz" (son état dépend de la phase du
// jeu en cours, voir computeQuizState), "Consulter les connaissances" (ouvre l'arbre), puis
// "Ajouter un souvenir", "Historique" (écran 12, pas encore construit) et "Mes faits".
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FunctionsHttpError } from "@supabase/supabase-js";
import * as Clipboard from "expo-clipboard";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { supabase } from "@/lib/supabase";

const C = {
  ground: "#FFFBF6",
  surface: "#FFFFFF",
  ink: "#1B1F3B",
  inkSoft: "#5B5F73",
  border: "#E2DACE",
  borderSoft: "#EDE6DC",
  blue: "#2347C5",
  blueDark: "#1A3596",
  blueTint: "#E7ECFB",
  blueTintBorder: "#C9D4F4",
  red: "#D62839",
  redDark: "#A81E2C",
  redTint: "#FDE8EA",
};

const PLAYERS_NEEDED_FOR_FIRST_QUIZ = 3;
const LOW_RESERVE_THRESHOLD = 5;

type MyFamily = { familyId: string; familyName: string; firstName: string };

type QuizState =
  | { kind: "demarrage"; playersCount: number; factsCount: number }
  | {
      kind: "strong" | "muted";
      title: string;
      sub: string;
      link?: string;
      badge?: number;
      onPress: () => void;
    };

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [noSession, setNoSession] = useState(false);
  const [families, setFamilies] = useState<MyFamily[]>([]);
  const [familyIndex, setFamilyIndex] = useState(0);
  const [myPersonId, setMyPersonId] = useState<string | null>(null);

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFamilyMenu, setShowFamilyMenu] = useState(false);
  const [showBurger, setShowBurger] = useState(false);
  const [burgerMessage, setBurgerMessage] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [knowledgeSub, setKnowledgeSub] = useState("");
  const [reserveAlert, setReserveAlert] = useState<string | null>(null);
  const [correctionsBadge, setCorrectionsBadge] = useState(0);

  async function loadFamilyDashboard(familyId: string, personId: string) {
    const [{ data: playersData }, { data: factsData }, { data: sessionsData }, { data: correctionsCount }] =
      await Promise.all([
        supabase.from("persons").select("id").eq("family_id", familyId).eq("kind", "player"),
        supabase.from("facts").select("id, subject_person_id").eq("family_id", familyId).eq("status", "active"),
        supabase
          .from("quiz_sessions")
          .select("id, status, closes_at")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false }),
        supabase.rpc("get_my_pending_corrections_count", { p_family_id: familyId }),
      ]);

    const players = playersData ?? [];
    const facts = factsData ?? [];
    const sessions = sessionsData ?? [];
    setCorrectionsBadge((correctionsCount as number | null) ?? 0);

    const factIds = facts.map((f) => f.id);
    const everPosed = new Set<string>();
    const revealed = new Set<string>();
    if (factIds.length > 0) {
      const { data: posedRows } = await supabase
        .from("quiz_questions")
        .select("fact_id, quiz_sessions (status)")
        .in("fact_id", factIds);
      for (const row of posedRows ?? []) {
        everPosed.add(row.fact_id);
        const status = (row.quiz_sessions as unknown as { status: string } | null)?.status;
        if (status === "closed") revealed.add(row.fact_id);
      }
    }
    const neverPosedCount = facts.filter((f) => !everPosed.has(f.id)).length;
    const revealedSubjects = new Set(facts.filter((f) => revealed.has(f.id)).map((f) => f.subject_person_id));

    if (sessions.length === 0) {
      setQuizState({ kind: "demarrage", playersCount: players.length, factsCount: facts.length });
      setKnowledgeSub("Découvre et complète l'arbre de la famille");
      setReserveAlert(null);
      return;
    }

    setKnowledgeSub(`${revealed.size} souvenir${revealed.size === 1 ? "" : "s"} sur ${revealedSubjects.size} personne${revealedSubjects.size === 1 ? "" : "s"}`);
    setReserveAlert(
      neverPosedCount < LOW_RESERVE_THRESHOLD
        ? `Plus que ${neverPosedCount} question${neverPosedCount === 1 ? "" : "s"} en réserve : ajoutez des souvenirs !`
        : null,
    );

    const mostRecent = sessions[0];

    if (mostRecent.status === "open") {
      const { data: qq } = await supabase
        .from("quiz_questions")
        .select("id, fact_id, facts (author_person_id)")
        .eq("session_id", mostRecent.id)
        .limit(1)
        .maybeSingle();

      if (!qq) {
        setQuizState(mutedState("Quiz en cours", "Impossible de charger la question en cours.", null));
        return;
      }

      const authorPersonId = (qq.facts as unknown as { author_person_id: string } | null)?.author_person_id ?? null;
      const dateLabel = new Date(mostRecent.closes_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

      if (authorPersonId === personId) {
        // question_recipients ne laisse chacun voir que sa propre ligne tant que la session
        // est ouverte (voir docs/data-model.md) : l'auteur passe par get_question_participants
        // (security definer) pour savoir qui a répondu, sans jamais voir le contenu des réponses.
        const [{ data: participants }, { data: pendingData }] = await Promise.all([
          supabase.rpc("get_question_participants", { p_quiz_question_id: qq.id }),
          supabase.rpc("get_pending_validations", { p_quiz_question_id: qq.id }),
        ]);
        const participantRows = (participants as { answered: boolean }[] | null) ?? [];
        const pendingGroups = (pendingData?.pending as { count: number }[] | undefined) ?? [];
        const pendingCount = pendingGroups.reduce((sum, g) => sum + g.count, 0);
        if (pendingCount > 0) {
          setQuizState(
            strongState(
              `${pendingCount} réponse${pendingCount === 1 ? "" : "s"} à valider`,
              `Ta question · ${participantRows.length} joueur${participantRows.length === 1 ? "" : "s"} ont répondu`,
              pendingCount,
              () => router.push("/validate"),
            ),
          );
        } else {
          const answeredCount = participantRows.filter((p) => p.answered).length;
          setQuizState(
            mutedState(
              "Ta question est en jeu",
              `${answeredCount} joueur${answeredCount === 1 ? "" : "s"} sur ${participantRows.length} ont répondu · révélation le ${dateLabel}`,
              "Voir ma question",
              () => router.push("/respond"),
            ),
          );
        }
        return;
      }

      const { data: myRecipientRow } = await supabase
        .from("question_recipients")
        .select("result")
        .eq("quiz_question_id", qq.id)
        .eq("person_id", personId)
        .maybeSingle();
      const myRow = myRecipientRow;
      if (!myRow) {
        setQuizState(
          mutedState("Un quiz est en cours", "Tu n'y participes pas cette fois : tu as rejoint après la pioche.", null),
        );
        return;
      }

      if (myRow.result === "unanswered") {
        setQuizState(
          strongState("Une question t'attend", `À répondre avant le ${dateLabel}`, 1, () => router.push("/respond")),
        );
      } else {
        setQuizState(
          mutedState("Réponse envoyée", `Révélation le ${dateLabel}`, "Voir ou modifier ma réponse", () =>
            router.push("/respond"),
          ),
        );
      }
      return;
    }

    // Session la plus récente clôturée : "La révélation est là !" tant qu'elle n'a pas été
    // consultée (reveal.tsx marque la dernière session vue sur l'appareil), sinon "entre-deux".
    const lastSeen = await AsyncStorage.getItem(`quizamily:lastSeenReveal:${familyId}`).catch(() => null);
    if (lastSeen !== mostRecent.id) {
      setQuizState(
        strongState("La révélation est là !", "Découvre qui avait trouvé", 1, () => router.push("/reveal")),
      );
      return;
    }

    if (neverPosedCount === 0) {
      setQuizState(
        mutedState(
          "Pas de prochain quiz",
          "Il n'y a plus de souvenirs à piocher.",
          "Ajouter des souvenirs",
          () => router.push("/add-fact"),
        ),
      );
    } else {
      setQuizState(
        mutedState("Quiz terminé", "En attente du prochain quiz", "Revoir la dernière révélation", () =>
          router.push("/reveal"),
        ),
      );
    }
  }

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
        .select("id, family_id, first_name, families(name)")
        .eq("user_id", userId)
        .eq("kind", "player");

      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setLoading(false);
        return;
      }

      setFamilies(
        data.map((row) => ({
          familyId: row.family_id,
          familyName: (row.families as unknown as { name: string } | null)?.name ?? "Famille",
          firstName: row.first_name,
        })),
      );
      setMyPersonId(data[0].id);

      const { data: inviteRow } = await supabase
        .from("invites")
        .select("token")
        .eq("family_id", data[0].family_id)
        .limit(1)
        .maybeSingle();
      if (inviteRow && !cancelled) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        setInviteLink(`${origin}/join/${inviteRow.token}`);
      }

      await loadFamilyDashboard(data[0].family_id, data[0].id);
      if (!cancelled) setLoading(false);
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
    setTimeout(() => setCopied(false), 2000);
  }

  async function createSessionNow() {
    const familyId = families[familyIndex]?.familyId;
    if (!familyId || !myPersonId) return;
    setCreatingSession(true);
    setBurgerMessage(null);

    const { data, error } = await supabase.functions.invoke("create-quiz-session", { body: { family_id: familyId } });

    if (error) {
      let message = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON : on garde le message générique
        }
      }
      setBurgerMessage(`Erreur : ${message}`);
    } else {
      setBurgerMessage(`Session créée : ${data.recipientsCreated} réponse(s) attendue(s).`);
      await loadFamilyDashboard(familyId, myPersonId);
    }
    setCreatingSession(false);
    setShowBurger(false);
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={C.blue} />
      </View>
    );
  }

  if (noSession) {
    return <Redirect href="/" />;
  }

  if (families.length === 0) {
    return <Redirect href="/family-setup" />;
  }

  const family = families[familyIndex];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => setShowFamilyMenu((v) => !v)} style={styles.familyButton}>
          <Text style={styles.familyButtonText}>{family.familyName}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Inviter dans la famille"
          onPress={copyInviteLink}
          style={styles.inviteButton}
        >
          <Text style={styles.inviteIcon}>{copied ? "✓" : "+"}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityLabel="Menu" onPress={() => setShowBurger((v) => !v)} style={styles.burgerButton}>
          <Text style={styles.burgerIcon}>☰</Text>
        </Pressable>
      </View>

      {showFamilyMenu && (
        <View style={styles.dropdown}>
          {families.map((f, i) => (
            <Pressable
              key={f.familyId}
              onPress={() => {
                setFamilyIndex(i);
                setShowFamilyMenu(false);
                setLoading(true);
                loadFamilyDashboard(f.familyId, myPersonId!).then(() => setLoading(false));
              }}
              style={styles.dropdownItem}
            >
              <Text style={i === familyIndex ? styles.dropdownItemTextActive : styles.dropdownItemText}>
                {f.familyName}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => router.push("/family-setup")} style={styles.dropdownItem}>
            <Text style={styles.dropdownItemText}>+ Créer une autre famille</Text>
          </Pressable>
        </View>
      )}

      {showBurger && (
        <View style={[styles.dropdown, { right: 16, left: undefined, alignSelf: "flex-end" }]}>
          <Pressable onPress={createSessionNow} disabled={creatingSession} style={styles.dropdownItem}>
            <Text style={styles.dropdownItemText}>
              {creatingSession ? "Création…" : "Créer une session maintenant (test)"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setShowBurger(false);
              supabase.auth.signOut();
            }}
            style={styles.dropdownItem}
          >
            <Text style={styles.dropdownItemText}>Se déconnecter</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.main}>
        <Text style={styles.greeting}>
          Bonjour <Text style={styles.greetingName}>{family.firstName}</Text>
        </Text>

        {burgerMessage && <Text style={styles.burgerMessage}>{burgerMessage}</Text>}

        {quizState?.kind === "demarrage" ? (
          <View style={styles.startCard}>
            <Text style={styles.startTitle}>Lancer votre premier quiz</Text>
            <Text style={styles.startSub}>
              Le premier quiz démarre dès que la famille compte {PLAYERS_NEEDED_FOR_FIRST_QUIZ} joueurs et quelques
              souvenirs.
            </Text>
            <View style={{ gap: 10 }}>
              <StartStep done label="Famille créée" />
              <StartStep
                done={quizState.playersCount >= PLAYERS_NEEDED_FOR_FIRST_QUIZ}
                label={
                  quizState.playersCount >= PLAYERS_NEEDED_FOR_FIRST_QUIZ
                    ? `${quizState.playersCount} joueurs`
                    : `${quizState.playersCount} joueur${quizState.playersCount === 1 ? "" : "s"} sur ${PLAYERS_NEEDED_FOR_FIRST_QUIZ} · encore ${PLAYERS_NEEDED_FOR_FIRST_QUIZ - quizState.playersCount} à inviter`
                }
              />
              <StartStep
                done={quizState.factsCount > 0}
                label={`${quizState.factsCount} souvenir${quizState.factsCount === 1 ? "" : "s"} ajouté${quizState.factsCount === 1 ? "" : "s"} pour l'instant`}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={copyInviteLink} style={styles.startButtonPrimary}>
                <Text style={styles.startButtonPrimaryText}>{copied ? "Lien copié !" : "Inviter des membres"}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/add-fact")} style={styles.startButtonSecondary}>
                <Text style={styles.startButtonSecondaryText}>Ajouter un souvenir</Text>
              </Pressable>
            </View>
          </View>
        ) : quizState?.kind === "strong" ? (
          <Pressable onPress={quizState.onPress} style={styles.quizStrong}>
            <View style={styles.quizStrongTop}>
              <Text style={styles.quizLabel}>Participer au quiz</Text>
              {!!quizState.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{quizState.badge}</Text>
                </View>
              )}
            </View>
            <Text style={styles.quizStrongTitle}>{quizState.title}</Text>
            <Text style={styles.quizStrongSub}>{quizState.sub}</Text>
          </Pressable>
        ) : quizState?.kind === "muted" ? (
          <Pressable onPress={quizState.onPress} style={styles.quizMuted}>
            <Text style={[styles.quizLabel, { color: C.blue }]}>Participer au quiz</Text>
            <Text style={styles.quizMutedTitle}>{quizState.title}</Text>
            <Text style={styles.quizMutedSub}>{quizState.sub}</Text>
            {quizState.link && (
              <Text style={styles.quizMutedLink}>
                {quizState.link} <Text>→</Text>
              </Text>
            )}
          </Pressable>
        ) : null}

        <Pressable onPress={() => router.push("/family-tree")} style={styles.knowledgeButton}>
          <View style={styles.knowledgeIcon}>
            <FamilyGlyph />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.knowledgeTitle}>Consulter les connaissances</Text>
            <Text style={styles.knowledgeSub}>{knowledgeSub}</Text>
          </View>
        </Pressable>

        <View style={styles.addCard}>
          <Pressable onPress={() => router.push("/add-fact")} style={styles.addButton}>
            <View style={styles.addIcon}>
              <Text style={styles.addIconText}>+</Text>
            </View>
            <Text style={styles.addTitle}>Ajouter un souvenir</Text>
          </Pressable>
          {reserveAlert && (
            <View style={styles.alertBanner}>
              <Text style={styles.alertIcon}>⚠</Text>
              <Text style={styles.alertText}>{reserveAlert}</Text>
            </View>
          )}
        </View>

        <View style={styles.tilesRow}>
          <View style={styles.tile}>
            <Text style={styles.tileText}>Historique</Text>
          </View>
          <Pressable onPress={() => router.push("/my-facts")} style={styles.tile}>
            <Text style={styles.tileText}>Mes faits</Text>
            {correctionsBadge > 0 && (
              <View style={styles.tileBadge}>
                <Text style={styles.tileBadgeText}>{correctionsBadge}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function strongState(
  title: string,
  sub: string,
  badge: number | undefined,
  onPress: () => void,
): QuizState {
  return { kind: "strong", title, sub, badge, onPress };
}

function mutedState(
  title: string,
  sub: string,
  link: string | null,
  onPress?: () => void,
): QuizState {
  return { kind: "muted", title, sub, link: link ?? undefined, onPress: onPress ?? (() => {}) };
}

// Pas de vraies icônes vectorielles pour l'instant (comme pour l'arbre familial, voir
// docs/ecrans.md écran 10) : un petit glyphe dessiné avec des Views plutôt qu'un emoji.
function FamilyGlyph() {
  return (
    <View style={{ width: 26, height: 22 }}>
      <View style={[styles.glyphDot, { left: 7, top: 0 }]} />
      <View style={[styles.glyphDot, { left: 0, top: 11 }]} />
      <View style={[styles.glyphDot, { left: 14, top: 11 }]} />
    </View>
  );
}

function StartStep({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={[styles.stepCircle, done && styles.stepCircleDone]}>
        {done && <Text style={styles.stepCheck}>✓</Text>}
      </View>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSoft,
  },
  familyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
    backgroundColor: C.surface,
  },
  familyButtonText: { fontFamily: "Fredoka_600SemiBold", fontSize: 17, color: C.ink },
  chevron: { fontSize: 14, color: C.ink },
  inviteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.blueTint,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteIcon: { fontSize: 20, color: C.blue, fontWeight: "700" },
  burgerButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  burgerIcon: { fontSize: 20, color: C.ink },
  dropdown: {
    position: "absolute",
    top: 60,
    left: 16,
    zIndex: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 220,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12 },
  dropdownItemText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: C.ink },
  dropdownItemTextActive: { fontFamily: "Nunito_800ExtraBold", fontSize: 15, color: C.blue },
  main: { padding: 16, paddingTop: 18, gap: 14, maxWidth: 480, width: "100%", alignSelf: "center" },
  greeting: { fontSize: 16, color: C.inkSoft },
  greetingName: { color: C.ink, fontFamily: "Nunito_700Bold" },
  burgerMessage: { fontSize: 14, color: C.inkSoft },

  quizLabel: { fontSize: 14, fontFamily: "Nunito_700Bold", letterSpacing: 0.84, textTransform: "uppercase", opacity: 0.85 },
  quizStrong: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: C.blue,
    gap: 10,
    shadowColor: C.blueDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  quizStrongTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
  quizStrongTitle: { fontFamily: "Fredoka_600SemiBold", fontSize: 27, lineHeight: 30, color: "#FFFFFF" },
  quizStrongSub: { fontSize: 15, color: "#FFFFFF", opacity: 0.9 },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    backgroundColor: C.red,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontFamily: "Nunito_800ExtraBold", fontSize: 15 },
  quizMuted: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 8,
    borderLeftColor: C.blue,
    borderRightWidth: 8,
    borderRightColor: C.red,
    gap: 10,
    shadowColor: "rgba(27,31,59,0.08)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 14,
  },
  quizMutedTitle: { fontFamily: "Fredoka_600SemiBold", fontSize: 27, lineHeight: 30, color: C.ink },
  quizMutedSub: { fontSize: 15, color: C.inkSoft },
  quizMutedLink: { fontSize: 15, fontFamily: "Nunito_700Bold", color: C.blue },

  knowledgeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 112,
    padding: 20,
    borderRadius: 22,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 8,
    borderLeftColor: C.blue,
    borderRightWidth: 8,
    borderRightColor: C.red,
    shadowColor: "rgba(27,31,59,0.08)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 14,
  },
  knowledgeIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: C.blueTint,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphDot: { position: "absolute", width: 11, height: 11, borderRadius: 6, backgroundColor: C.blue },
  knowledgeTitle: { fontFamily: "Fredoka_600SemiBold", fontSize: 23, color: C.ink },
  knowledgeSub: { fontSize: 15, color: C.inkSoft },

  addCard: { borderWidth: 2, borderColor: C.blueTintBorder, borderRadius: 18, backgroundColor: C.surface, overflow: "hidden" },
  addButton: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 12 },
  addIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.blue, alignItems: "center", justifyContent: "center" },
  addIconText: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  addTitle: { fontFamily: "Fredoka_600SemiBold", fontSize: 20, color: C.ink },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.redTint },
  alertIcon: { fontSize: 16, color: C.redDark },
  alertText: { fontSize: 14, fontFamily: "Nunito_700Bold", color: C.redDark, flexShrink: 1 },

  tilesRow: { flexDirection: "row", gap: 12 },
  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    backgroundColor: C.surface,
  },
  tileText: { fontFamily: "Nunito_800ExtraBold", fontSize: 16, color: C.ink },
  tileBadge: {
    marginLeft: "auto",
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    backgroundColor: C.red,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Nunito_800ExtraBold" },

  startCard: { padding: 20, borderWidth: 2, borderColor: C.blueTintBorder, borderRadius: 22, backgroundColor: C.surface, gap: 14 },
  startTitle: { fontFamily: "Fredoka_600SemiBold", fontSize: 25, color: C.ink },
  startSub: { fontSize: 15, lineHeight: 20, color: C.inkSoft },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleDone: { backgroundColor: C.blue },
  stepCheck: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  stepLabel: { fontSize: 16, color: C.ink },
  startButtonPrimary: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: C.blue, alignItems: "center", justifyContent: "center" },
  startButtonPrimaryText: { color: "#FFFFFF", fontFamily: "Nunito_800ExtraBold", fontSize: 15 },
  startButtonSecondary: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 2, borderColor: C.blue, alignItems: "center", justifyContent: "center" },
  startButtonSecondaryText: { color: C.blue, fontFamily: "Nunito_800ExtraBold", fontSize: 15 },
});
