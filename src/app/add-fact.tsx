import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { AnswerInput } from "@/components/answer-input";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { COUNTRIES } from "@/constants/countries";
import { Spacing } from "@/constants/theme";
import { parseAnswerValue } from "@/lib/answer-value";
import { ensureListItemExists } from "@/lib/list-items";
import { supabase } from "@/lib/supabase";
import { Template } from "@/types/question-template";

type Person = {
  id: string;
  display_name: string;
  gender: "homme" | "femme" | null;
  is_deceased: boolean;
  is_central: boolean;
};

type Relationship = {
  person_a_id: string;
  person_b_id: string;
  relation_type: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  "naissance-enfance": "Naissance et enfance",
  jeunesse: "Jeunesse",
  "couple-installation": "Couple et installation",
  "culture-premieres-fois": "Culture et premières fois",
  "retraite-voyages-loisirs": "Retraite, voyages et loisirs",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
const MAX_VISIBLE_CATEGORIES = 3;
const MAX_VISIBLE_PERSONS = 3;

function findRelatedPersonId(relationships: Relationship[], subjectId: string): string | null {
  const rel = relationships.find(
    (r) => r.relation_type === "spouse_of" && (r.person_a_id === subjectId || r.person_b_id === subjectId),
  );
  if (!rel) return null;
  return rel.person_a_id === subjectId ? rel.person_b_id : rel.person_a_id;
}

// Remplace <sujet>/<conjoint>/<pays> par leur valeur connue. <conjoint>/<pays> peuvent être
// inconnus tant que l'auteur n'a pas résolu la personne liée ou l'élément choisi : on affiche
// alors une tournure générique plutôt que le nom littéral du template.
function substituteTemplateText(
  t: Template,
  subjectName: string,
  relatedName: string | null,
  slotValues: Record<string, string>,
): string {
  let text = t.template_text.replace("<sujet>", subjectName);
  if (t.related_role) {
    text = text.replace(`<${t.related_role}>`, relatedName ?? "son/sa conjoint·e");
  }
  for (const slot of t.slots ?? []) {
    text = text.replace(`<${slot}>`, slotValues[slot] ?? `(${slot} à préciser)`);
  }
  return text;
}

// Adelphes : liés directement (sibling_of, dans un sens ou l'autre), ou partageant un parent.
async function hasPotentialSibling(personId: string, famId: string): Promise<boolean> {
  const { data: directLinks } = await supabase
    .from("relationships")
    .select("id")
    .eq("family_id", famId)
    .eq("relation_type", "sibling_of")
    .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`)
    .limit(1);
  if ((directLinks ?? []).length > 0) return true;

  const { data: parentLinks } = await supabase
    .from("relationships")
    .select("person_a_id")
    .eq("family_id", famId)
    .eq("relation_type", "parent_of")
    .eq("person_b_id", personId);

  const parentIds = (parentLinks ?? []).map((r) => r.person_a_id);
  if (parentIds.length === 0) return false;

  const { data: siblingLinks } = await supabase
    .from("relationships")
    .select("person_b_id")
    .eq("family_id", famId)
    .eq("relation_type", "parent_of")
    .in("person_a_id", parentIds)
    .neq("person_b_id", personId);

  return (siblingLinks ?? []).length > 0;
}

function matchesCondition(condition: string | null, subject: Person, hasSibling: boolean): boolean {
  if (!condition) return true;
  if (condition === "femme") return subject.gender === "femme";
  if (condition === "homme") return subject.gender === "homme";
  if (condition === "vivant") return !subject.is_deceased;
  if (condition === "a des frères ou sœurs") return hasSibling;
  return true;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function AddFactScreen() {
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [error, setError] = useState("");

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [myPersonId, setMyPersonId] = useState<string | null>(null);
  const [allPersons, setAllPersons] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [showAllPersons, setShowAllPersons] = useState(false);

  const [relatedPersonId, setRelatedPersonId] = useState<string | null>(null);
  const [showSpouseCreator, setShowSpouseCreator] = useState(false);
  const [newSpouseFirstName, setNewSpouseFirstName] = useState("");
  const [newSpouseLastName, setNewSpouseLastName] = useState("");
  const [newSpouseGender, setNewSpouseGender] = useState<"homme" | "femme" | null>(null);
  const [creatingSpouse, setCreatingSpouse] = useState(false);
  const [slotValues, setSlotValues] = useState<Record<string, string>>({});

  const [templates, setTemplates] = useState<Template[]>([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [answerValue, setAnswerValue] = useState<string>("");
  const [contextText, setContextText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

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

      const [{ data: persons }, { data: rels }] = await Promise.all([
        supabase
          .from("persons")
          .select("id, display_name, gender, is_deceased, is_central")
          .eq("family_id", me.family_id)
          .order("is_central", { ascending: false })
          .order("display_name", { ascending: true }),
        supabase.from("relationships").select("person_a_id, person_b_id, relation_type").eq("family_id", me.family_id),
      ]);

      if (cancelled) return;
      const list = persons ?? [];
      setAllPersons(list);
      setRelationships(rels ?? []);

      let initialSubjectId = list.length > 0 ? list[0].id : null;
      let initialCategory: string | null = null;
      try {
        const stored = await AsyncStorage.getItem(`quizamily:addFact:${me.id}`);
        if (stored) {
          const parsed = JSON.parse(stored) as { subjectId?: string; selectedCategory?: string | null };
          if (parsed.subjectId && list.some((p) => p.id === parsed.subjectId)) {
            initialSubjectId = parsed.subjectId;
          }
          if (typeof parsed.selectedCategory === "string") initialCategory = parsed.selectedCategory;
        }
      } catch {
        // préférences locales corrompues ou indisponibles : on repart des valeurs par défaut
      }

      setSubjectId(initialSubjectId);
      setSelectedCategory(initialCategory);
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mémorise le dernier sujet et thème choisis, en local sur l'appareil pour ce joueur
  // (pas partagé avec le reste de la famille), pour retrouver le même contexte la prochaine fois.
  useEffect(() => {
    if (!myPersonId || !ready) return;
    AsyncStorage.setItem(
      `quizamily:addFact:${myPersonId}`,
      JSON.stringify({ subjectId, selectedCategory })
    ).catch(() => {});
  }, [myPersonId, ready, subjectId, selectedCategory]);


  useEffect(() => {
    if (!subjectId || !familyId) return;
    const currentSubjectId = subjectId;
    const currentFamilyId = familyId;
    let cancelled = false;

    async function loadTemplates() {
      setLoadingTemplates(true);
      const subject = allPersons.find((p) => p.id === currentSubjectId);
      if (!subject) return;

      const [templatesRes, factsRes, siblingRes] = await Promise.all([
        supabase.from("question_templates").select("*").eq("status", "mvp"),
        supabase.from("facts").select("template_id").eq("subject_person_id", currentSubjectId),
        hasPotentialSibling(currentSubjectId, currentFamilyId),
      ]);

      if (cancelled) return;

      const existingTemplateIds = new Set((factsRes.data ?? []).map((f) => f.template_id));
      const supportedForSubject = (templatesRes.data ?? []).filter((t: Template) =>
        matchesCondition(t.condition, subject, siblingRes),
      );
      const eligible = supportedForSubject.filter((t) => !existingTemplateIds.has(t.id));

      setTemplates(eligible);
      setAnsweredCount(supportedForSubject.length - eligible.length);
      setLoadingTemplates(false);
      // Un thème restauré (préférence locale) peut ne plus correspondre au sujet courant :
      // on l'efface plutôt que de filtrer silencieusement toutes les questions.
      setSelectedCategory((c) => (c && !eligible.some((t) => t.category === c) ? null : c));
    }

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [subjectId, familyId, allPersons, refreshKey]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates) counts[t.category] = (counts[t.category] ?? 0) + 1;
    return counts;
  }, [templates]);

  const availableCategories = CATEGORY_ORDER.filter((c) => (categoryCounts[c] ?? 0) > 0);
  const visibleCategories = showAllCategories
    ? availableCategories
    : availableCategories.slice(0, MAX_VISIBLE_CATEGORIES);
  const hasMoreCategories = availableCategories.length > MAX_VISIBLE_CATEGORIES;

  const searchResults = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return templates.filter((t) => {
      if (selectedCategory && t.category !== selectedCategory) return false;
      if (query.length > 0 && !t.template_text.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [templates, selectedCategory, searchText]);

  function selectSubject(id: string) {
    setSubjectId(id);
    setShowAllPersons(false);
    setSelectedCategory(null);
    setShowAllCategories(false);
    setSearchText("");
    setSelectedTemplate(null);
  }

  function selectTemplate(t: Template) {
    setSelectedTemplate(t);
    setAnswerValue("");
    setContextText("");
    setError("");
    setFiltersCollapsed(true);
    setSlotValues({});
    setShowSpouseCreator(false);
    setNewSpouseFirstName("");
    setNewSpouseLastName("");
    setNewSpouseGender(null);
    setRelatedPersonId(t.related_role && subjectId ? findRelatedPersonId(relationships, subjectId) : null);
  }

  async function createSpouse() {
    if (!subjectId || !familyId || newSpouseFirstName.trim().length === 0 || newSpouseLastName.trim().length === 0) return;
    setCreatingSpouse(true);
    setError("");

    try {
      const { data: spouse, error: spouseError } = await supabase
        .from("persons")
        .insert({
          family_id: familyId,
          kind: "profile",
          first_name: newSpouseFirstName.trim(),
          last_name: newSpouseLastName.trim(),
          gender: newSpouseGender,
          is_central: false,
          is_deceased: false,
        })
        .select()
        .single();
      if (spouseError) throw spouseError;

      // Le lien spouse_of n'est enregistré qu'à la validation du fait (submitFact), pour ne
      // pas laisser une relation orpheline si l'auteur abandonne en cours de route - la
      // personne elle-même doit en revanche déjà exister pour que le fait puisse la référencer.
      setAllPersons((prev) => [
        ...prev,
        { id: spouse.id, display_name: spouse.display_name, gender: spouse.gender, is_deceased: false, is_central: false },
      ]);
      setRelatedPersonId(spouse.id);
      setShowSpouseCreator(false);
      setNewSpouseFirstName("");
      setNewSpouseLastName("");
      setNewSpouseGender(null);
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setCreatingSpouse(false);
    }
  }

  function pickExistingSpouse(personId: string) {
    setRelatedPersonId(personId);
  }

  function resetFilters() {
    setSelectedCategory(null);
    setSearchText("");
    setShowAllCategories(false);
  }

  function pickRandom() {
    if (searchResults.length === 0) return;
    const t = searchResults[Math.floor(Math.random() * searchResults.length)];
    selectTemplate(t);
  }

  async function submitFact() {
    if (!selectedTemplate || !subjectId || !myPersonId || !familyId) return;
    setSubmitting(true);
    setError("");

    try {
      const parsed = parseAnswerValue(selectedTemplate.answer_input_kind, answerValue);
      if (!parsed.ok) throw new Error(parsed.error);
      const finalAnswer = parsed.value;

      if (selectedTemplate.answer_input_kind === "list" && selectedTemplate.list_name) {
        await ensureListItemExists({
          listName: selectedTemplate.list_name,
          value: finalAnswer as string,
          familyId,
          personId: myPersonId,
        });
      }

      if (selectedTemplate.related_role && relatedPersonId && findRelatedPersonId(relationships, subjectId) === null) {
        const { error: relError } = await supabase.from("relationships").insert({
          family_id: familyId,
          person_a_id: subjectId,
          person_b_id: relatedPersonId,
          relation_type: "spouse_of",
        });
        if (relError) throw relError;
        setRelationships((prev) => [...prev, { person_a_id: subjectId, person_b_id: relatedPersonId, relation_type: "spouse_of" }]);
      }

      const { error: factError } = await supabase.from("facts").insert({
        family_id: familyId,
        template_id: selectedTemplate.id,
        subject_person_id: subjectId,
        related_person_id: selectedTemplate.related_role ? relatedPersonId : null,
        slot_values: Object.keys(slotValues).length > 0 ? slotValues : null,
        author_person_id: myPersonId,
        answer_value: finalAnswer,
        context_text: contextText.trim().length > 0 ? contextText.trim() : null,
      });
      if (factError) throw factError;

      setJustSaved(true);
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  function addAnother() {
    setSelectedTemplate(null);
    setAnswerValue("");
    setContextText("");
    setError("");
    setSearchText("");
    setJustSaved(false);
    setRelatedPersonId(null);
    setSlotValues({});
    setShowSpouseCreator(false);
    setNewSpouseFirstName("");
    setNewSpouseLastName("");
    setNewSpouseGender(null);
    setRefreshKey((k) => k + 1); // force a refetch so the just-created fact's template disappears
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

  if (justSaved) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.three, padding: Spacing.four }}>
        <ThemedText type="title">Fait ajouté 🎉</ThemedText>
        <Pressable onPress={addAnother} style={styles.primaryButton}>
          <ThemedText style={{ color: "#ffffff" }}>Ajouter un autre fait</ThemedText>
        </Pressable>
        <Pressable onPress={() => router.replace("/home")}>
          <ThemedText type="linkPrimary">Retour à l&apos;accueil</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const subject = allPersons.find((p) => p.id === subjectId);
  const visiblePersons = allPersons.slice(0, MAX_VISIBLE_PERSONS);
  const otherPersons = allPersons.slice(MAX_VISIBLE_PERSONS);
  const filtersAreCollapsed = filtersCollapsed && !!selectedTemplate;
  const answeredLabel = `${answeredCount} fait${answeredCount === 1 ? "" : "s"} ajouté${answeredCount === 1 ? "" : "s"}`;

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Ajouter un fait</ThemedText>

        {filtersAreCollapsed ? (
          <Pressable onPress={() => setFiltersCollapsed(false)} style={styles.filtersSummary}>
            <ThemedText type="linkPrimary">
              {subject?.display_name}
              {selectedCategory ? ` · ${CATEGORY_LABELS[selectedCategory]}` : ""} — Modifier les filtres
            </ThemedText>
          </Pressable>
        ) : (
          <>
            {/* 1-4 : sujet */}
            <ThemedText type="smallBold">Sur qui ?</ThemedText>
            <View style={styles.personsRow}>
              {visiblePersons.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => selectSubject(p.id)}
                  style={[styles.personCard, subjectId === p.id && styles.personCardSelected]}
                >
                  <View style={styles.avatarPlaceholder}>
                    <ThemedText style={{ color: "#ffffff" }} type="smallBold">
                      {initials(p.display_name)}
                    </ThemedText>
                  </View>
                  <ThemedText style={{ textAlign: "center" }}>{p.display_name}</ThemedText>
                </Pressable>
              ))}
              {otherPersons.length > 0 && (
                <Pressable
                  onPress={() => setShowAllPersons((v) => !v)}
                  style={[styles.personCard, styles.otherPersonCard]}
                >
                  <View style={[styles.avatarPlaceholder, { backgroundColor: "#999999" }]}>
                    <ThemedText style={{ color: "#ffffff" }} type="smallBold">
                      …
                    </ThemedText>
                  </View>
                  <ThemedText style={{ textAlign: "center" }}>Autre</ThemedText>
                </Pressable>
              )}
            </View>

            {showAllPersons && (
              <View style={styles.chipsRow}>
                {otherPersons.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => selectSubject(p.id)}
                    style={[styles.chip, subjectId === p.id && styles.chipSelected]}
                  >
                    <ThemedText style={subjectId === p.id ? { color: "#ffffff" } : undefined}>
                      {p.display_name}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            )}

            {!loadingTemplates && (
              <ThemedText themeColor="textSecondary" style={styles.counterText}>
                {subject?.display_name} : {answeredLabel}, {templates.length} question
                {templates.length === 1 ? "" : "s"} restante{templates.length === 1 ? "" : "s"}.
              </ThemedText>
            )}

            {/* 5-9 : thèmes */}
            {templates.length > 0 && (
              <>
                <ThemedText type="smallBold">Thème</ThemedText>
                {showAllCategories ? (
                  <View style={styles.chipsRow}>
                    {availableCategories.map((cat) => (
                      <Pressable
                        key={cat}
                        onPress={() => setSelectedCategory((c) => (c === cat ? null : cat))}
                        style={[styles.chip, selectedCategory === cat && styles.chipSelected]}
                      >
                        <ThemedText style={selectedCategory === cat ? { color: "#ffffff" } : undefined}>
                          {CATEGORY_LABELS[cat]}
                        </ThemedText>
                      </Pressable>
                    ))}
                    <Pressable onPress={() => setShowAllCategories(false)} style={styles.chip}>
                      <ThemedText>−</ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.themeRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeScroll}>
                      <View style={styles.chipsRowNoWrap}>
                        {visibleCategories.map((cat) => (
                          <Pressable
                            key={cat}
                            onPress={() => setSelectedCategory((c) => (c === cat ? null : cat))}
                            style={[styles.chip, selectedCategory === cat && styles.chipSelected]}
                          >
                            <ThemedText style={selectedCategory === cat ? { color: "#ffffff" } : undefined}>
                              {CATEGORY_LABELS[cat]}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                    {hasMoreCategories && (
                      <Pressable onPress={() => setShowAllCategories(true)} style={styles.chip}>
                        <ThemedText>+</ThemedText>
                      </Pressable>
                    )}
                  </View>
                )}
              </>
            )}

            {/* 10 : recherche */}
            {loadingTemplates ? (
              <ActivityIndicator />
            ) : templates.length === 0 ? (
              <ThemedText themeColor="textSecondary">
                Plus de questions disponibles pour {subject?.display_name} dans cette première version.
              </ThemedText>
            ) : (
              <>
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="🔍 Rechercher une question (ex: école, voyage...)"
                  style={styles.searchInput}
                />

                <View style={styles.chipsRow}>
                  {(selectedCategory || searchText.length > 0) && (
                    <Pressable onPress={resetFilters}>
                      <ThemedText type="linkPrimary">Réinitialiser les filtres</ThemedText>
                    </Pressable>
                  )}
                  {searchResults.length > 0 && (
                    <Pressable onPress={pickRandom}>
                      <ThemedText type="linkPrimary">🎲 Surprends-moi</ThemedText>
                    </Pressable>
                  )}
                </View>

                {/* 11 : résultats */}
                {searchResults.map((t) => {
                  const knownRelated = subjectId ? allPersons.find((p) => p.id === findRelatedPersonId(relationships, subjectId)) : null;
                  return (
                    <Pressable key={t.id} onPress={() => selectTemplate(t)} style={styles.questionOption}>
                      <ThemedText>
                        {substituteTemplateText(t, subject?.display_name ?? "", knownRelated?.display_name ?? null, {})}
                      </ThemedText>
                    </Pressable>
                  );
                })}
                {searchResults.length === 0 && (
                  <ThemedText themeColor="textSecondary">Aucune question ne correspond.</ThemedText>
                )}
              </>
            )}
          </>
        )}

        {selectedTemplate && (() => {
          const relatedPerson = allPersons.find((p) => p.id === relatedPersonId) ?? null;
          const needsRelated = !!selectedTemplate.related_role && !relatedPersonId;
          const missingSlots = (selectedTemplate.slots ?? []).filter((s) => !slotValues[s]);
          const readyForAnswer = !needsRelated && missingSlots.length === 0;

          return (
            <View style={{ gap: Spacing.three }}>
              <View style={[styles.card, styles.chipSelected]}>
                <ThemedText style={{ color: "#ffffff" }}>
                  {substituteTemplateText(selectedTemplate, subject?.display_name ?? "", relatedPerson?.display_name ?? null, slotValues)}
                </ThemedText>
              </View>

              {needsRelated && (
                <View style={{ gap: Spacing.two }}>
                  <ThemedText type="smallBold">
                    Qui est le conjoint ou la conjointe de {subject?.display_name} ?
                  </ThemedText>
                  <View style={styles.chipsRow}>
                    {allPersons
                      .filter((p) => p.id !== subjectId)
                      .map((p) => (
                        <Pressable key={p.id} onPress={() => pickExistingSpouse(p.id)} style={styles.chip}>
                          <ThemedText>{p.display_name}</ThemedText>
                        </Pressable>
                      ))}
                    <Pressable onPress={() => setShowSpouseCreator(true)} style={styles.chip}>
                      <ThemedText>+ Nouvelle personne</ThemedText>
                    </Pressable>
                  </View>
                  {showSpouseCreator && (
                    <View style={{ gap: Spacing.two }}>
                      <TextInput
                        value={newSpouseFirstName}
                        onChangeText={setNewSpouseFirstName}
                        placeholder="Prénom"
                        style={styles.input}
                      />
                      <TextInput
                        value={newSpouseLastName}
                        onChangeText={setNewSpouseLastName}
                        placeholder="Nom"
                        style={styles.input}
                      />
                      <View style={styles.chipsRow}>
                        {(["homme", "femme"] as const).map((g) => (
                          <Pressable
                            key={g}
                            onPress={() => setNewSpouseGender(g)}
                            style={[styles.chip, newSpouseGender === g && styles.chipSelected]}
                          >
                            <ThemedText style={newSpouseGender === g ? { color: "#ffffff" } : undefined}>
                              {g === "homme" ? "Homme" : "Femme"}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                      <Pressable
                        onPress={createSpouse}
                        disabled={creatingSpouse || newSpouseFirstName.trim().length === 0 || newSpouseLastName.trim().length === 0}
                        style={[
                          styles.secondaryButton,
                          (creatingSpouse || newSpouseFirstName.trim().length === 0 || newSpouseLastName.trim().length === 0) && {
                            opacity: 0.6,
                          },
                        ]}
                      >
                        <ThemedText>{creatingSpouse ? "Création…" : "Ajouter cette personne"}</ThemedText>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {missingSlots.map((slot) =>
                slot === "pays" ? (
                  <View key={slot} style={{ gap: Spacing.two }}>
                    <ThemedText type="smallBold">Quel pays ?</ThemedText>
                    <View style={styles.chipsRow}>
                      {COUNTRIES.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => setSlotValues((v) => ({ ...v, [slot]: c }))}
                          style={styles.chip}
                        >
                          <ThemedText>{c}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null,
              )}

              {!readyForAnswer && error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

              {readyForAnswer && (
                <>
                  {/* 12 : réponse */}
                  <AnswerInput
                    template={selectedTemplate}
                    familyId={familyId!}
                    value={answerValue}
                    onChange={setAnswerValue}
                  />

                  <ThemedText type="smallBold">Anecdote ou contexte (facultatif)</ThemedText>
                  <TextInput
                    value={contextText}
                    onChangeText={setContextText}
                    placeholder="Une histoire à raconter autour de cette réponse..."
                    multiline
                    style={[styles.input, { minHeight: 80 }]}
                  />

                  {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

                  <Pressable
                    onPress={submitFact}
                    disabled={submitting || answerValue.trim().length === 0}
                    style={[styles.primaryButton, (submitting || answerValue.trim().length === 0) && { opacity: 0.6 }]}
                  >
                    <ThemedText style={{ color: "#ffffff" }}>
                      {submitting ? "Enregistrement…" : "Enregistrer"}
                    </ThemedText>
                  </Pressable>
                </>
              )}
            </View>
          );
        })()}

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
  searchInput: {
    borderWidth: 1,
    borderColor: "#d9dbe0",
    borderRadius: 24,
    backgroundColor: "#f0f0f3",
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    width: "100%",
  },
  counterText: {
    fontSize: 13,
  },
  card: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
  },
  questionOption: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: Spacing.three,
    borderLeftWidth: 4,
    borderLeftColor: "#3c87f7",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  filtersSummary: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
    borderStyle: "dashed",
  },
  personsRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  personCard: {
    alignItems: "center",
    gap: Spacing.one,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 12,
    padding: Spacing.two,
    width: 84,
  },
  personCardSelected: {
    borderColor: "#3c87f7",
  },
  otherPersonCard: {
    opacity: 0.8,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3c87f7",
    alignItems: "center",
    justifyContent: "center",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  chipsRowNoWrap: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: Spacing.two,
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  themeScroll: {
    flex: 1,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 16,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  chipSelected: {
    backgroundColor: "#3c87f7",
    borderColor: "#3c87f7",
  },
  primaryButton: {
    backgroundColor: "#3c87f7",
    borderRadius: 8,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
  },
});
