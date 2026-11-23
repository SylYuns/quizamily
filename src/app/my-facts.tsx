// Mes faits (écran 5, voir docs/ecrans.md). Refonte « Coucher de soleil » décidée le
// 2026-11-23 (pas de maquette dédiée, mêmes composants que les écrans déjà faits) : bandeau
// famille partagé, panneau « Corrections proposées » en haut (comble un trou repéré à cette
// occasion — voir get_my_pending_corrections, supabase/migrations/20261123140000_*.sql — rien
// n'affichait jusqu'ici le détail des corrections sur mes faits, alors que l'accueil en montre
// déjà le badge), puis la liste de mes faits avec statut en pastille.
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AnswerInput } from "@/components/answer-input";
import { FamilyHeaderBar } from "@/components/family-header";
import { FONTS, RADIUS, S, solidShadow, sunsetBackground } from "@/constants/soleil";
import { parseAnswerValue } from "@/lib/answer-value";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { ensureListItemExists } from "@/lib/list-items";
import { listMyFamilies, resolveMyFamily, setPersistedFamilyId, type MyFamilyMembership } from "@/lib/my-family";
import { substituteQuestionText } from "@/lib/question-text";
import { supabase } from "@/lib/supabase";
import { useInviteLink } from "@/lib/use-invite-link";
import { Template } from "@/types/question-template";

type PostedStatus = "not_posed" | "posed_open" | "revealed";

type Fact = {
  id: string;
  answer_value: string | number;
  context_text: string | null;
  created_at: string;
  template: Template;
  subjectName: string;
  subjectGender: "homme" | "femme" | null;
  relatedName: string | null;
  slotValues: Record<string, string> | null;
  postedStatus: PostedStatus;
};

type PendingCorrection = {
  factId: string;
  questionText: string;
  answerInputKind: string;
  currentValue: string | number;
  proposedValue: string | number;
  comment: string | null;
};

function statusLabel(status: PostedStatus): string {
  if (status === "posed_open") return "Posé, en cours";
  if (status === "revealed") return "Révélé";
  return "Pas encore posé";
}

function statusPillStyle(status: PostedStatus) {
  if (status === "posed_open") return styles.statusPillWaiting;
  if (status === "revealed") return styles.statusPillRevealed;
  return styles.statusPillOpen;
}

function statusPillTextStyle(status: PostedStatus) {
  if (status === "posed_open") return styles.statusPillTextWaiting;
  if (status === "revealed") return styles.statusPillTextRevealed;
  return styles.statusPillTextOpen;
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function MyFactsScreen() {
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
  const [facts, setFacts] = useState<Fact[]>([]);
  const [corrections, setCorrections] = useState<PendingCorrection[]>([]);

  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editAnswerValue, setEditAnswerValue] = useState("");
  const [editContextText, setEditContextText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [decidingCorrectionId, setDecidingCorrectionId] = useState<string | null>(null);

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

  const loadFacts = useCallback(async () => {
    if (!familyId || !myPersonId) return;

    const { data, error: factsError } = await supabase
      .from("facts")
      .select(
        "id, context_text, created_at, slot_values, question_templates (*), subject:persons!subject_person_id (display_name, gender), related:persons!related_person_id (display_name)",
      )
      .eq("author_person_id", myPersonId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (factsError) {
      setError(factsError.message);
      return;
    }

    const factRows = data ?? [];
    const factIds = factRows.map((row) => row.id);
    const statusByFactId = new Map<string, PostedStatus>();

    // La bonne réponse n'est plus lisible directement sur facts (migration
    // 20261110140000) : l'auteur relit les siennes par get_my_fact_answers.
    const { data: answerRows } = await supabase.rpc("get_my_fact_answers", { p_family_id: familyId });
    const answerByFactId = new Map(
      ((answerRows ?? []) as { fact_id: string; answer_value: string | number }[]).map((r) => [r.fact_id, r.answer_value]),
    );

    if (factIds.length > 0) {
      const { data: postedRows } = await supabase
        .from("quiz_questions")
        .select("fact_id, quiz_sessions (status)")
        .in("fact_id", factIds);

      for (const row of postedRows ?? []) {
        const sessionStatus = (row.quiz_sessions as unknown as { status: string } | null)?.status;
        const current = statusByFactId.get(row.fact_id);
        if (sessionStatus === "open") {
          statusByFactId.set(row.fact_id, "posed_open");
        } else if (current !== "posed_open") {
          statusByFactId.set(row.fact_id, "revealed");
        }
      }
    }

    setFacts(
      factRows.map((row) => ({
        id: row.id,
        answer_value: answerByFactId.get(row.id) ?? "",
        context_text: row.context_text,
        created_at: row.created_at,
        template: row.question_templates as unknown as Template,
        subjectName: (row.subject as unknown as { display_name: string } | null)?.display_name ?? "?",
        subjectGender: (row.subject as unknown as { gender: "homme" | "femme" | null } | null)?.gender ?? null,
        relatedName: (row.related as unknown as { display_name: string } | null)?.display_name ?? null,
        slotValues: (row.slot_values as Record<string, string> | null) ?? null,
        postedStatus: statusByFactId.get(row.id) ?? "not_posed",
      })),
    );
  }, [familyId, myPersonId]);

  useEffect(() => {
    if (!familyId || !myPersonId) return;
    let cancelled = false;

    async function load() {
      setReady(false);
      setError("");

      const [{ data: correctionRows }] = await Promise.all([
        supabase.rpc("get_my_pending_corrections", { p_family_id: familyId! }),
        loadFacts(),
      ]);

      if (cancelled) return;
      setCorrections(
        ((correctionRows ?? []) as {
          fact_id: string;
          question_text: string;
          answer_input_kind: string;
          current_value: string | number;
          proposed_value: string | number;
          comment: string | null;
        }[]).map((r) => ({
          factId: r.fact_id,
          questionText: r.question_text,
          answerInputKind: r.answer_input_kind,
          currentValue: r.current_value,
          proposedValue: r.proposed_value,
          comment: r.comment,
        })),
      );
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [familyId, myPersonId, loadFacts]);

  async function decideCorrection(correction: PendingCorrection, accept: boolean) {
    setDecidingCorrectionId(correction.factId);
    setError("");

    const { error: rpcError } = await supabase.rpc("validate_correction", {
      p_fact_id: correction.factId,
      p_accept: accept,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setCorrections((prev) => prev.filter((c) => c.factId !== correction.factId));
      if (accept) await loadFacts();
    }
    setDecidingCorrectionId(null);
  }

  function startEdit(fact: Fact) {
    setEditingFactId(fact.id);
    setEditAnswerValue(String(fact.answer_value));
    setEditContextText(fact.context_text ?? "");
    setConfirmDeleteId(null);
    setError("");
  }

  function cancelEdit() {
    setEditingFactId(null);
  }

  async function saveEdit(fact: Fact) {
    if (!familyId || !myPersonId) return;
    setSavingEdit(true);
    setError("");

    try {
      const parsed = parseAnswerValue(fact.template.answer_input_kind, editAnswerValue);
      if (!parsed.ok) throw new Error(parsed.error);
      const finalAnswer = parsed.value;

      if (fact.template.answer_input_kind === "list" && fact.template.list_name) {
        await ensureListItemExists({
          listName: fact.template.list_name,
          value: finalAnswer as string,
          familyId,
          personId: myPersonId,
        });
      }

      const { error: updateError } = await supabase
        .from("facts")
        .update({
          answer_value: finalAnswer,
          context_text: editContextText.trim().length > 0 ? editContextText.trim() : null,
        })
        .eq("id", fact.id);
      if (updateError) throw updateError;

      setFacts((prev) =>
        prev.map((f) =>
          f.id === fact.id ? { ...f, answer_value: finalAnswer, context_text: editContextText.trim() || null } : f,
        ),
      );
      setEditingFactId(null);
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete(factId: string) {
    setDeletingId(factId);
    const { error: deleteError } = await supabase.from("facts").delete().eq("id", factId);
    if (!deleteError) {
      setFacts((prev) => prev.filter((f) => f.id !== factId));
    } else {
      setError(deleteError.message);
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
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
        <Text style={styles.title}>Mes faits</Text>
      </View>

      {!ready ? (
        <View style={styles.centered}>
          <ActivityIndicator color={S.action} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.main}>
          {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}

          {corrections.map((correction) => {
            const gap =
              correction.answerInputKind === "year" || correction.answerInputKind === "age" || correction.answerInputKind === "number"
                ? Math.abs(Number(correction.currentValue) - Number(correction.proposedValue))
                : null;
            return (
              <View key={correction.factId} style={styles.correctionCard}>
                <Text style={styles.correctionLabel}>Correction proposée</Text>
                <Text style={styles.correctionQuestion}>{correction.questionText}</Text>
                <View style={styles.correctionInset}>
                  <Text style={styles.correctionInsetLabel}>Ta réponse actuelle</Text>
                  <Text style={styles.correctionInsetValue}>
                    {formatAnswerDisplay(correction.answerInputKind, correction.currentValue)}
                  </Text>
                  <Text style={[styles.correctionInsetLabel, { marginTop: 6 }]}>Proposition</Text>
                  <Text style={styles.correctionInsetValueNew}>
                    {formatAnswerDisplay(correction.answerInputKind, correction.proposedValue)}
                    {gap !== null && gap > 0 ? ` (écart de ${gap})` : ""}
                  </Text>
                  {correction.comment && <Text style={styles.correctionComment}>« {correction.comment} »</Text>}
                </View>
                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={() => decideCorrection(correction, true)}
                    disabled={decidingCorrectionId === correction.factId}
                    style={[styles.acceptButton, decidingCorrectionId === correction.factId && { opacity: 0.6 }]}
                  >
                    <Text style={styles.acceptButtonText}>✓ Accepter</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => decideCorrection(correction, false)}
                    disabled={decidingCorrectionId === correction.factId}
                    style={[styles.refuseButtonOnDark, decidingCorrectionId === correction.factId && { opacity: 0.6 }]}
                  >
                    <Text style={styles.refuseButtonOnDarkText}>✗ Refuser</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {facts.length === 0 && (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Tu n&apos;as pas encore ajouté de fait.</Text>
              <Pressable onPress={() => router.replace({ pathname: "/add-fact", params: familyId ? { family: familyId } : {} })}>
                <Text style={styles.linkTextDark}>Ajouter un souvenir</Text>
              </Pressable>
            </View>
          )}

          {facts.map((fact) => {
            const isEditing = editingFactId === fact.id;
            const questionText = substituteQuestionText(
              fact.template.template_text,
              fact.template.related_role,
              fact.subjectName,
              fact.relatedName,
              fact.slotValues,
              fact.subjectGender,
            );

            return (
              <View key={fact.id} style={styles.factCard}>
                <View style={styles.factHeaderRow}>
                  <View style={statusPillStyle(fact.postedStatus)}>
                    <Text style={statusPillTextStyle(fact.postedStatus)}>{statusLabel(fact.postedStatus)}</Text>
                  </View>
                  <Text style={styles.dateText}>{formatCreatedAt(fact.created_at)}</Text>
                </View>
                <Text style={styles.factQuestion}>{questionText}</Text>

                {!isEditing ? (
                  <>
                    <Text style={styles.factAnswer}>
                      Réponse : {formatAnswerDisplay(fact.template.answer_input_kind, fact.answer_value)}
                    </Text>
                    {fact.context_text && <Text style={styles.factContext}>{fact.context_text}</Text>}

                    {fact.postedStatus === "not_posed" &&
                      (confirmDeleteId === fact.id ? (
                        <View style={styles.actionsRow}>
                          <Text style={styles.confirmText}>Supprimer ce fait ?</Text>
                          <Pressable onPress={() => confirmDelete(fact.id)} disabled={deletingId === fact.id}>
                            <Text style={styles.deleteConfirmLink}>{deletingId === fact.id ? "Suppression…" : "Oui, supprimer"}</Text>
                          </Pressable>
                          <Pressable onPress={() => setConfirmDeleteId(null)}>
                            <Text style={styles.cancelLink}>Annuler</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.actionsRow}>
                          <Pressable onPress={() => startEdit(fact)}>
                            <Text style={styles.modifyLink}>✎ Modifier</Text>
                          </Pressable>
                          <Pressable onPress={() => setConfirmDeleteId(fact.id)}>
                            <Text style={styles.deleteLink}>Supprimer</Text>
                          </Pressable>
                        </View>
                      ))}
                  </>
                ) : (
                  <View style={{ gap: 10 }}>
                    <AnswerInput template={fact.template} familyId={familyId!} value={editAnswerValue} onChange={setEditAnswerValue} />
                    <TextInput
                      value={editContextText}
                      onChangeText={setEditContextText}
                      placeholder="Anecdote ou contexte (facultatif)"
                      multiline
                      style={styles.textarea}
                    />
                    <View style={styles.actionsRow}>
                      <Pressable onPress={cancelEdit} style={styles.cancelButton}>
                        <Text style={styles.cancelButtonText}>Annuler</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => saveEdit(fact)}
                        disabled={savingEdit || editAnswerValue.trim().length === 0}
                        style={[styles.saveButton, (savingEdit || editAnswerValue.trim().length === 0) && { opacity: 0.6 }]}
                      >
                        <Text style={styles.saveButtonText}>{savingEdit ? "Enregistrement…" : "Enregistrer"}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })}

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
  errorText: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.alertInk },
  linkTextDark: { textAlign: "center", fontSize: 15, fontFamily: FONTS.bodyHeavy, color: S.inkOnGround },

  // ---------- Correction proposée ----------
  correctionCard: { gap: 12, padding: 18, borderRadius: RADIUS.card, backgroundColor: S.action, ...solidShadow(S.actionShadow) },
  correctionLabel: { fontSize: 13, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.6, textTransform: "uppercase", color: S.actionSoft },
  correctionQuestion: { fontFamily: FONTS.title, fontSize: 19, lineHeight: 23, color: S.white },
  correctionInset: { gap: 2, padding: 14, borderRadius: 18, backgroundColor: S.cream },
  correctionInsetLabel: { fontSize: 12, fontFamily: FONTS.bodyHeavy, color: S.inkSoft },
  correctionInsetValue: { fontFamily: FONTS.bodySemi, fontSize: 16, color: S.ink, textDecorationLine: "line-through" },
  correctionInsetValueNew: { fontFamily: FONTS.title, fontSize: 20, color: S.action },
  correctionComment: { marginTop: 8, fontSize: 14, fontStyle: "italic", fontFamily: FONTS.body, color: S.inkSoft },
  acceptButton: { flex: 1, minHeight: 46, borderRadius: 23, backgroundColor: S.sun, alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: S.ink, fontFamily: FONTS.bodyHeavy, fontSize: 14 },
  refuseButtonOnDark: { flex: 1, minHeight: 46, borderRadius: 23, borderWidth: 2, borderColor: S.actionSoft, alignItems: "center", justifyContent: "center" },
  refuseButtonOnDarkText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 14 },

  // ---------- Carte d'un fait ----------
  factCard: { gap: 8, padding: 16, borderRadius: RADIUS.card, backgroundColor: S.cream, ...solidShadow("rgba(138,58,18,0.15)", 4) },
  factHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  dateText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: S.inkSoft },
  factQuestion: { fontFamily: FONTS.title, fontSize: 17, lineHeight: 21, color: S.ink },
  factAnswer: { fontSize: 15, fontFamily: FONTS.bodyBold, color: S.inkOnGround },
  factContext: { fontSize: 14, lineHeight: 19, fontFamily: FONTS.body, color: S.inkSoft },

  statusPillOpen: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1.5, borderColor: S.action },
  statusPillTextOpen: { fontSize: 11, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.4, textTransform: "uppercase", color: S.action },
  statusPillWaiting: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: S.waiting },
  statusPillTextWaiting: { fontSize: 11, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.4, textTransform: "uppercase", color: S.waitingSoft },
  statusPillRevealed: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: S.sun },
  statusPillTextRevealed: { fontSize: 11, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.4, textTransform: "uppercase", color: S.ink },

  actionsRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  modifyLink: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.action },
  deleteLink: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.alertInk },
  confirmText: { fontSize: 14, fontFamily: FONTS.bodySemi, color: S.ink },
  deleteConfirmLink: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.alertInk },
  cancelLink: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.inkSoft },

  textarea: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: "#EAD9BD", borderRadius: 14, backgroundColor: S.white, fontFamily: FONTS.body, fontSize: 15, color: S.ink },
  cancelButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: RADIUS.pill, borderWidth: 2, borderColor: S.action, alignItems: "center", justifyContent: "center" },
  cancelButtonText: { color: S.action, fontFamily: FONTS.bodyHeavy, fontSize: 15 },
  saveButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: RADIUS.pill, backgroundColor: S.action, alignItems: "center", justifyContent: "center", ...solidShadow(S.actionShadow, 4) },
  saveButtonText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 15 },
});
