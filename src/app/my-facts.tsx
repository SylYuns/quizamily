import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { AnswerInput } from "@/components/answer-input";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { parseAnswerValue } from "@/lib/answer-value";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { ensureListItemExists } from "@/lib/list-items";
import { substituteQuestionText } from "@/lib/question-text";
import { supabase } from "@/lib/supabase";
import { Template } from "@/types/question-template";

type PostedStatus = "not_posed" | "posed_open" | "revealed";

type Fact = {
  id: string;
  answer_value: string | number;
  context_text: string | null;
  created_at: string;
  template: Template;
  subjectName: string;
  relatedName: string | null;
  slotValues: Record<string, string> | null;
  postedStatus: PostedStatus;
};

function statusLabel(status: PostedStatus): string {
  if (status === "posed_open") return "Posé dans la session en cours";
  if (status === "revealed") return "Révélé";
  return "Pas encore posé";
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function MyFactsScreen() {
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [error, setError] = useState("");

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [myPersonId, setMyPersonId] = useState<string | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);

  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editAnswerValue, setEditAnswerValue] = useState("");
  const [editContextText, setEditContextText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

      const { data, error: factsError } = await supabase
        .from("facts")
        .select(
          "id, answer_value, context_text, created_at, slot_values, question_templates (*), subject:persons!subject_person_id (display_name), related:persons!related_person_id (display_name)",
        )
        .eq("author_person_id", me.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (factsError) {
        setError(factsError.message);
        setReady(true);
        return;
      }

      const factRows = data ?? [];
      const factIds = factRows.map((row) => row.id);
      const statusByFactId = new Map<string, PostedStatus>();

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

      if (cancelled) return;
      setFacts(
        factRows.map((row) => ({
          id: row.id,
          answer_value: row.answer_value,
          context_text: row.context_text,
          created_at: row.created_at,
          template: row.question_templates as unknown as Template,
          subjectName: (row.subject as unknown as { display_name: string } | null)?.display_name ?? "?",
          relatedName: (row.related as unknown as { display_name: string } | null)?.display_name ?? null,
          slotValues: (row.slot_values as Record<string, string> | null) ?? null,
          postedStatus: statusByFactId.get(row.id) ?? "not_posed",
        })),
      );
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
          f.id === fact.id
            ? { ...f, answer_value: finalAnswer, context_text: editContextText.trim() || null }
            : f,
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

  if (!ready) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Mes faits</ThemedText>

        {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

        {facts.length === 0 && (
          <ThemedText themeColor="textSecondary">
            Tu n&apos;as pas encore ajouté de fait. Retourne à l&apos;accueil pour en ajouter un.
          </ThemedText>
        )}

        {facts.map((fact) => {
          const isEditing = editingFactId === fact.id;
          const questionText = substituteQuestionText(
            fact.template.template_text,
            fact.template.related_role,
            fact.subjectName,
            fact.relatedName,
            fact.slotValues,
          );

          return (
            <View key={fact.id} style={styles.card}>
              <ThemedText themeColor="textSecondary" style={styles.statusBadge}>
                {statusLabel(fact.postedStatus)}
              </ThemedText>
              <ThemedText type="smallBold">{questionText}</ThemedText>

              {!isEditing ? (
                <>
                  <ThemedText>
                    Réponse : {formatAnswerDisplay(fact.template.answer_input_kind, fact.answer_value)}
                  </ThemedText>
                  {fact.context_text && (
                    <ThemedText themeColor="textSecondary">{fact.context_text}</ThemedText>
                  )}
                  <ThemedText themeColor="textSecondary" style={styles.dateText}>
                    Ajouté le {formatCreatedAt(fact.created_at)}
                  </ThemedText>

                  {fact.postedStatus !== "not_posed" ? null : confirmDeleteId === fact.id ? (
                    <View style={styles.actionsRow}>
                      <ThemedText>Supprimer ce fait ?</ThemedText>
                      <Pressable onPress={() => confirmDelete(fact.id)} disabled={deletingId === fact.id}>
                        <ThemedText type="linkPrimary">
                          {deletingId === fact.id ? "Suppression…" : "Oui, supprimer"}
                        </ThemedText>
                      </Pressable>
                      <Pressable onPress={() => setConfirmDeleteId(null)}>
                        <ThemedText type="linkPrimary">Annuler</ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.actionsRow}>
                      <Pressable onPress={() => startEdit(fact)}>
                        <ThemedText type="linkPrimary">Modifier</ThemedText>
                      </Pressable>
                      <Pressable onPress={() => setConfirmDeleteId(fact.id)}>
                        <ThemedText type="linkPrimary">Supprimer</ThemedText>
                      </Pressable>
                    </View>
                  )}
                </>
              ) : (
                <View style={{ gap: Spacing.two }}>
                  <AnswerInput
                    template={fact.template}
                    familyId={familyId!}
                    value={editAnswerValue}
                    onChange={setEditAnswerValue}
                  />
                  <TextInput
                    value={editContextText}
                    onChangeText={setEditContextText}
                    placeholder="Anecdote ou contexte (facultatif)"
                    multiline
                    style={[styles.input, { minHeight: 80 }]}
                  />
                  <View style={styles.actionsRow}>
                    <Pressable
                      onPress={() => saveEdit(fact)}
                      disabled={savingEdit || editAnswerValue.trim().length === 0}
                    >
                      <ThemedText type="linkPrimary">
                        {savingEdit ? "Enregistrement…" : "Enregistrer"}
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={cancelEdit}>
                      <ThemedText type="linkPrimary">Annuler</ThemedText>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })}

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
  input: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
    width: "100%",
  },
  card: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  statusBadge: {
    fontSize: 12,
    textTransform: "uppercase",
  },
  dateText: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
});
