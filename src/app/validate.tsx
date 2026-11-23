// Valider les réponses libres (écran 7, voir docs/ecrans.md). Refonte « Coucher de soleil »
// décidée le 2026-11-23 (pas de maquette dédiée : étape à part de celle de « Répondre »/
// « Révélation », on reprend les composants déjà posés — bandeau, panneaux, pilules d'action).
// La validation reste anonyme (get_pending_validations/validate_pending_answers, security
// definer) : aucun nom de joueur n'apparaît jamais sur cet écran, seulement la valeur reçue et
// son nombre d'occurrences.
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FamilyHeaderBar } from "@/components/family-header";
import { FONTS, RADIUS, S, solidShadow, sunsetBackground } from "@/constants/soleil";
import { listMyFamilies, resolveMyFamily, setPersistedFamilyId, type MyFamilyMembership } from "@/lib/my-family";
import { supabase } from "@/lib/supabase";
import { useInviteLink } from "@/lib/use-invite-link";

type AnswerGroup = {
  value: string | number;
  count: number;
  recipientIds?: string[];
};

export default function ValidateScreen() {
  const params = useLocalSearchParams<{ family?: string }>();
  const paramFamily = typeof params.family === "string" && params.family.length > 0 ? params.family : null;

  const [noSession, setNoSession] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [familiesLoaded, setFamiliesLoaded] = useState(false);
  const [families, setFamilies] = useState<MyFamilyMembership[]>([]);
  const [familyIndex, setFamilyIndex] = useState(0);

  const family = families[familyIndex] as MyFamilyMembership | undefined;
  const familyId = family?.familyId ?? null;
  const { copied, copy: copyInviteLink } = useInviteLink(familyId);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const [quizQuestionId, setQuizQuestionId] = useState<string | null>(null);
  const [readyToValidate, setReadyToValidate] = useState(true);
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
    setReadyToValidate((data?.readyToValidate as boolean | undefined) ?? true);
    setAutoValidated((data?.autoValidated as AnswerGroup[] | undefined) ?? []);
    setPending((data?.pending as AnswerGroup[] | undefined) ?? []);
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
    if (!familyId) return;
    let cancelled = false;

    async function load() {
      setReady(false);
      setError("");

      const { data: session } = await supabase
        .from("quiz_sessions")
        .select("id")
        .eq("family_id", familyId)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!session) {
        setQuizQuestionId(null);
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
        setQuizQuestionId(null);
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
  }, [familyId]);

  async function decide(group: AnswerGroup, accept: boolean) {
    if (!quizQuestionId || !group.recipientIds) return;
    setDecidingValue(String(group.value));
    setError("");

    const { data: revealed, error: rpcError } = await supabase.rpc("validate_pending_answers", {
      p_quiz_question_id: quizQuestionId,
      p_recipient_ids: group.recipientIds,
      p_accept: accept,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else if (revealed === true) {
      // Deadline passée et dernière validation faite : la question vient d'être révélée.
      router.replace({ pathname: "/reveal", params: familyId ? { family: familyId } : {} });
      return;
    } else {
      await loadPendingValidations(quizQuestionId);
    }
    setDecidingValue(null);
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

  return (
    <View style={[styles.screen, sunsetBackground]}>
      <FamilyHeaderBar
        families={families}
        currentFamilyId={family!.familyId}
        onSwitchFamily={switchFamily}
        copied={copied}
        onCopyInvite={copyInviteLink}
      />

      <View style={styles.titleRow}>
        <Pressable accessibilityLabel="Retour à l'accueil" onPress={() => router.replace("/home")} style={styles.backButton}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Valider les réponses</Text>
      </View>

      {!ready ? (
        <View style={styles.centered}>
          <ActivityIndicator color={S.action} />
        </View>
      ) : !quizQuestionId ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Aucune session en cours pour le moment.</Text>
          <Pressable onPress={() => router.replace("/home")}>
            <Text style={styles.linkTextDark}>Retour à l&apos;accueil</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.main}>
          <Text style={styles.subtitle}>
            La validation est anonyme : tu ne vois pas qui a donné quelle réponse, seulement les valeurs reçues et
            leur nombre.
          </Text>

          {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}

          {!readyToValidate ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoCardIcon}>⏳</Text>
              <Text style={styles.infoCardText}>
                Pas encore assez de réponses reçues pour valider de façon anonyme. Reviens un peu plus tard, ou une
                fois que presque tout le monde aura répondu.
              </Text>
            </View>
          ) : pending.length === 0 ? (
            <View style={styles.doneCard}>
              <View style={styles.doneIcon}>
                <Text style={styles.doneIconText}>✓</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.doneTitle}>Tout est validé !</Text>
                <Text style={styles.doneSub}>Retourne à « Ma question » pour déclencher la révélation.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.panel}>
              <View style={styles.panelHeaderRow}>
                <Text style={styles.panelTitle}>À valider</Text>
                <Text style={styles.panelHeaderValue}>
                  {pending.length} réponse{pending.length === 1 ? "" : "s"} différente{pending.length === 1 ? "" : "s"}
                </Text>
              </View>
              {pending.map((group) => (
                <View key={String(group.value)} style={styles.groupCard}>
                  <View style={styles.groupHeaderRow}>
                    <Text style={styles.groupValue} numberOfLines={2}>
                      « {String(group.value)} »
                    </Text>
                    <View style={styles.countPill}>
                      <Text style={styles.countPillText}>
                        {group.count} réponse{group.count === 1 ? "" : "s"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.actionsRow}>
                    <Pressable
                      onPress={() => decide(group, true)}
                      disabled={decidingValue === String(group.value)}
                      style={[styles.acceptButton, decidingValue === String(group.value) && { opacity: 0.6 }]}
                    >
                      <Text style={styles.acceptButtonText}>✓ Accepter</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => decide(group, false)}
                      disabled={decidingValue === String(group.value)}
                      style={[styles.refuseButton, decidingValue === String(group.value) && { opacity: 0.6 }]}
                    >
                      <Text style={styles.refuseButtonText}>✗ Refuser</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {autoValidated.length > 0 && (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Déjà validées automatiquement</Text>
              {autoValidated.map((group) => (
                <View key={String(group.value)} style={styles.autoRow}>
                  <View style={styles.autoCheck}>
                    <Text style={styles.autoCheckText}>✓</Text>
                  </View>
                  <Text style={styles.autoRowText} numberOfLines={2}>
                    « {String(group.value)} » — {group.count} réponse{group.count === 1 ? "" : "s"}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Pressable onPress={() => router.push({ pathname: "/respond", params: { family: familyId! } })} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Retourner à Ma question</Text>
          </Pressable>

          <Pressable onPress={() => router.replace("/home")}>
            <Text style={styles.linkTextDark}>Retour à l&apos;accueil</Text>
          </Pressable>
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
  subtitle: { fontSize: 14, lineHeight: 19, fontFamily: FONTS.bodySemi, color: S.inkOnGround },
  errorText: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.alertInk },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: RADIUS.card,
    backgroundColor: S.cream,
    ...solidShadow(),
  },
  infoCardIcon: { fontSize: 24 },
  infoCardText: { flex: 1, fontSize: 14, lineHeight: 19, fontFamily: FONTS.bodySemi, color: S.inkSoft },

  doneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: RADIUS.card,
    backgroundColor: S.sun,
    ...solidShadow("#C99A2E", 5),
  },
  doneIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: S.action, alignItems: "center", justifyContent: "center" },
  doneIconText: { color: S.white, fontSize: 22, fontFamily: FONTS.bodyHeavy },
  doneTitle: { fontFamily: FONTS.title, fontSize: 20, color: S.ink },
  doneSub: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.inkOnGround },

  panel: { gap: 12, padding: 16, borderRadius: RADIUS.card, borderWidth: 2, borderColor: S.glassBorder, backgroundColor: S.glass },
  panelHeaderRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  panelTitle: { fontFamily: FONTS.title, fontSize: 19, color: S.ink },
  panelHeaderValue: { fontSize: 13, fontFamily: FONTS.bodyHeavy, color: S.inkOnGround },

  groupCard: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: S.cream },
  groupHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  groupValue: { flex: 1, fontFamily: FONTS.title, fontSize: 18, color: S.ink },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: S.creamStrong },
  countPillText: { fontSize: 12, fontFamily: FONTS.bodyHeavy, color: S.inkOnGround },

  actionsRow: { flexDirection: "row", gap: 10 },
  acceptButton: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: S.action, alignItems: "center", justifyContent: "center", ...solidShadow(S.actionShadow, 3) },
  acceptButtonText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 14 },
  refuseButton: { flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 2, borderColor: S.badgeRed, alignItems: "center", justifyContent: "center" },
  refuseButtonText: { color: S.badgeRed, fontFamily: FONTS.bodyHeavy, fontSize: 14 },

  autoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  autoCheck: { width: 26, height: 26, borderRadius: 13, backgroundColor: S.action, alignItems: "center", justifyContent: "center" },
  autoCheckText: { color: S.white, fontSize: 13, fontFamily: FONTS.bodyHeavy },
  autoRowText: { flex: 1, fontSize: 14, fontFamily: FONTS.bodySemi, color: S.inkSoft },

  primaryButton: { minHeight: 50, borderRadius: 25, backgroundColor: S.action, alignItems: "center", justifyContent: "center", ...solidShadow(S.actionShadow, 4) },
  primaryButtonText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 16 },
  linkTextDark: { textAlign: "center", fontSize: 15, fontFamily: FONTS.bodyHeavy, color: S.inkOnGround },
});
