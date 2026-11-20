// Accueil famille (écran 4, voir docs/ecrans.md et docs/design.md).
//
// Met en avant, dans l'ordre : le bouton "Participer au quiz" (son état dépend de la phase du
// jeu en cours, voir computeQuizState), "Consulter les connaissances" (ouvre l'arbre ; 4 profils
// tirés au hasard ouvrent directement l'arbre sur la personne, récapitulatif ouvert), puis
// "Ajouter un souvenir", "Historique" (écran 12, pas encore construit) et "Mes faits".
//
// Charte « Coucher de soleil » (src/constants/soleil.ts) : fond en dégradé, cartes colorées ;
// bouton du quiz brun-orangé quand une action est attendue, prune quand on attend.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FamilyHeaderBar } from "@/components/family-header";
import { PersonAvatar } from "@/components/soleil";
import { FONTS, RADIUS, S, solidShadow, sunsetBackground } from "@/constants/soleil";
import { pickHomeProfiles, type ProfileCandidate } from "@/lib/home-profiles";
import { supabase } from "@/lib/supabase";
import { useInviteLink } from "@/lib/use-invite-link";

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

  const { copied, copy: copyInviteLink } = useInviteLink(families[familyIndex]?.familyId ?? null);

  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [knowledgeSub, setKnowledgeSub] = useState("");
  const [profiles, setProfiles] = useState<ProfileCandidate[]>([]);
  const [reserveAlert, setReserveAlert] = useState<string | null>(null);
  const [correctionsBadge, setCorrectionsBadge] = useState(0);

  async function loadFamilyDashboard(familyId: string, personId: string) {
    const [{ data: personsData }, { data: factsData }, { data: sessionsData }, { data: correctionsCount }] =
      await Promise.all([
        supabase.from("persons").select("id, kind, first_name, is_central").eq("family_id", familyId),
        supabase.from("facts").select("id, subject_person_id").eq("family_id", familyId).eq("status", "active"),
        supabase
          .from("quiz_sessions")
          .select("id, status, closes_at")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false }),
        supabase.rpc("get_my_pending_corrections_count", { p_family_id: familyId }),
      ]);

    const familyPersons = personsData ?? [];
    const players = familyPersons.filter((p) => p.kind === "player");
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

    // Profils de la tuile « Consulter les connaissances » : tirés à chaque chargement de
    // l'accueil (règle dans src/lib/home-profiles.ts).
    const revealedBySubject = new Map<string, number>();
    for (const f of facts) {
      if (revealed.has(f.id)) revealedBySubject.set(f.subject_person_id, (revealedBySubject.get(f.subject_person_id) ?? 0) + 1);
    }
    setProfiles(
      pickHomeProfiles(
        familyPersons.map((p) => ({
          id: p.id,
          firstName: p.first_name,
          isCentral: p.is_central,
          revealedCount: revealedBySubject.get(p.id) ?? 0,
        })),
      ),
    );

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

      await loadFamilyDashboard(data[0].family_id, data[0].id);
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function switchFamily(familyId: string) {
    setFamilyIndex(families.findIndex((f) => f.familyId === familyId));
    setLoading(true);
    loadFamilyDashboard(familyId, myPersonId!).then(() => setLoading(false));
  }

  if (loading) {
    return (
      <View style={[styles.screen, sunsetBackground, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={S.action} />
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

  function openTree(personId?: string) {
    if (personId) router.push({ pathname: "/family-tree", params: { person: personId, recap: "1" } });
    else router.push("/family-tree");
  }

  return (
    <View style={[styles.screen, sunsetBackground]}>
      <FamilyHeaderBar
        families={families}
        currentFamilyId={family.familyId}
        onSwitchFamily={switchFamily}
        copied={copied}
        onCopyInvite={copyInviteLink}
        onSessionCreated={() => loadFamilyDashboard(family.familyId, myPersonId!)}
      />

      <ScrollView contentContainerStyle={styles.main}>
        <Text style={styles.greeting}>Bonjour {family.firstName}</Text>

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
            {/* Décor : un soleil qui se couche dans le coin. */}
            <View pointerEvents="none" style={[styles.decorDisc, styles.sunOuter]} />
            <View pointerEvents="none" style={[styles.decorDisc, styles.sunInner]} />
            <View style={styles.quizStrongTop}>
              <Text style={[styles.quizLabel, { color: S.actionSoft }]}>Participer au quiz</Text>
              {!!quizState.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{quizState.badge}</Text>
                </View>
              )}
            </View>
            <Text style={styles.quizTitle}>{quizState.title}</Text>
            <Text style={[styles.quizSub, { color: S.actionSoft }]}>{quizState.sub}</Text>
          </Pressable>
        ) : quizState?.kind === "muted" ? (
          <Pressable onPress={quizState.onPress} style={styles.quizMuted}>
            {/* Décor : une lune (deux disques superposés) et deux étoiles. */}
            <View pointerEvents="none" style={[styles.decorDisc, styles.moonLight]} />
            <View pointerEvents="none" style={[styles.decorDisc, styles.moonShadow]} />
            <View pointerEvents="none" style={[styles.star, { top: 58, right: 70 }]} />
            <View pointerEvents="none" style={[styles.star, { top: 24, right: 88, width: 4, height: 4 }]} />
            <Text style={[styles.quizLabel, { color: S.waitingSoft }]}>Participer au quiz</Text>
            <Text style={styles.quizTitle}>{quizState.title}</Text>
            <Text style={[styles.quizSub, { color: S.waitingSoft }]}>{quizState.sub}</Text>
            {quizState.link && <Text style={styles.quizMutedLink}>{quizState.link} ›</Text>}
          </Pressable>
        ) : null}

        {/* Toucher un profil ouvre l'arbre sur la personne, récapitulatif ouvert ; toucher
            ailleurs sur la tuile ouvre l'arbre normalement. */}
        <Pressable onPress={() => openTree()} style={styles.knowledgeTile}>
          {profiles.length > 0 && (
            <View style={styles.profilesGrid}>
              {profiles.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityLabel={`Voir ${p.firstName} dans l'arbre`}
                  onPress={() => openTree(p.id)}
                  hitSlop={4}
                >
                  <PersonAvatar personId={p.id} firstName={p.firstName} size={58} isCentral={p.isCentral} />
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.knowledgeTitle} numberOfLines={2}>
              Consulter les connaissances
            </Text>
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
  screen: { flex: 1 },
  main: { padding: 16, paddingTop: 8, gap: 14, maxWidth: 480, width: "100%", alignSelf: "center" },
  greeting: { fontFamily: FONTS.title, fontSize: 26, color: S.ink },

  // ---------- Bouton du quiz ----------
  quizLabel: { fontSize: 14, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.84, textTransform: "uppercase" },
  quizTitle: { fontFamily: FONTS.title, fontSize: 30, lineHeight: 33, color: S.white },
  quizSub: { fontSize: 15, fontFamily: FONTS.bodySemi },
  quizStrong: {
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderRadius: RADIUS.card,
    backgroundColor: S.action,
    gap: 10,
    overflow: "hidden",
    ...solidShadow(S.actionShadow),
  },
  quizStrongTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
  quizMuted: {
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderRadius: RADIUS.card,
    backgroundColor: S.waiting,
    gap: 10,
    overflow: "hidden",
    ...solidShadow(S.waitingShadow),
  },
  quizMutedLink: { fontSize: 15, fontFamily: FONTS.bodyHeavy, color: S.sun },
  decorDisc: { position: "absolute" },
  sunOuter: { top: -46, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: S.sun, opacity: 0.22 },
  sunInner: { top: -12, right: -6, width: 82, height: 82, borderRadius: 41, backgroundColor: S.sun, opacity: 0.35 },
  moonLight: { top: 14, right: 26, width: 46, height: 46, borderRadius: 23, backgroundColor: S.sun, opacity: 0.9 },
  moonShadow: { top: 8, right: 14, width: 46, height: 46, borderRadius: 23, backgroundColor: S.waiting },
  star: { position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: S.actionSoft },
  badge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    backgroundColor: S.sun,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: S.ink, fontFamily: FONTS.bodyHeavy, fontSize: 16 },

  // ---------- Connaissances ----------
  knowledgeTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    minHeight: 104,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: RADIUS.card,
    backgroundColor: S.knowledge,
    ...solidShadow(),
  },
  // 2 colonnes de ronds de 58 px : jusqu'à 4 profils en carré.
  profilesGrid: { width: 126, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  knowledgeTitle: { fontFamily: FONTS.title, fontSize: 20, lineHeight: 23, color: S.ink },
  knowledgeSub: { fontSize: 15, fontFamily: FONTS.bodySemi, color: S.knowledgeInk },

  // ---------- Ajouter un souvenir ----------
  addCard: { borderRadius: 28, backgroundColor: S.sun, overflow: "hidden", ...solidShadow(undefined, 6) },
  addButton: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 66, paddingHorizontal: 18, paddingVertical: 11 },
  addIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: S.action, alignItems: "center", justifyContent: "center" },
  addIconText: { color: S.white, fontSize: 24, fontFamily: FONTS.bodyHeavy },
  addTitle: { fontFamily: FONTS.title, fontSize: 21, color: S.ink },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: S.alertBg },
  alertIcon: { fontSize: 16, color: S.alertInk },
  alertText: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.alertInk, flexShrink: 1 },

  // ---------- Tuiles ----------
  tilesRow: { flexDirection: "row", gap: 12 },
  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: S.glassBorder,
    borderRadius: RADIUS.tile,
    backgroundColor: S.glass,
  },
  tileText: { fontFamily: FONTS.bodyHeavy, fontSize: 16, color: S.ink },
  tileBadge: {
    marginLeft: "auto",
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    backgroundColor: S.badgeRed,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeText: { color: S.white, fontSize: 13, fontFamily: FONTS.bodyHeavy },

  // ---------- Famille qui démarre ----------
  startCard: { padding: 20, borderRadius: RADIUS.card, backgroundColor: S.cream, gap: 14, ...solidShadow() },
  startTitle: { fontFamily: FONTS.title, fontSize: 25, color: S.ink },
  startSub: { fontSize: 15, lineHeight: 20, fontFamily: FONTS.bodySemi, color: S.inkSoft },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: S.action,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleDone: { backgroundColor: S.action },
  stepCheck: { color: S.white, fontSize: 14, fontFamily: FONTS.bodyHeavy },
  stepLabel: { fontSize: 16, fontFamily: FONTS.bodySemi, color: S.ink },
  startButtonPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: RADIUS.pill,
    backgroundColor: S.action,
    alignItems: "center",
    justifyContent: "center",
    ...solidShadow(S.actionShadow, 4),
  },
  startButtonPrimaryText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 15 },
  startButtonSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: S.action,
    alignItems: "center",
    justifyContent: "center",
  },
  startButtonSecondaryText: { color: S.action, fontFamily: FONTS.bodyHeavy, fontSize: 15 },
});
