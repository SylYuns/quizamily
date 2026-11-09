import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import DateInput from "@/components/date-input";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type Template = {
  id: string;
  category: string;
  template_text: string;
  answer_input_kind: string;
  list_name: string | null;
  related_role: string | null;
  slots: string[] | null;
  condition: string | null;
};

type Person = {
  id: string;
  display_name: string;
  gender: "homme" | "femme" | null;
  is_deceased: boolean;
  is_central: boolean;
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

const COUNTRIES = [
  "France",
  "Allemagne",
  "Belgique",
  "Suisse",
  "Italie",
  "Espagne",
  "Portugal",
  "Royaume-Uni",
  "Irlande",
  "Pays-Bas",
  "Luxembourg",
  "Autriche",
  "Grèce",
  "Pologne",
  "République tchèque",
  "Hongrie",
  "Roumanie",
  "Bulgarie",
  "Croatie",
  "Suède",
  "Norvège",
  "Danemark",
  "Finlande",
  "Islande",
  "Russie",
  "Ukraine",
  "Turquie",
  "Maroc",
  "Algérie",
  "Tunisie",
  "Égypte",
  "Sénégal",
  "Côte d'Ivoire",
  "Mali",
  "Cameroun",
  "Madagascar",
  "Liban",
  "Israël",
  "États-Unis",
  "Canada",
  "Mexique",
  "Brésil",
  "Argentine",
  "Chili",
  "Pérou",
  "Chine",
  "Japon",
  "Corée du Sud",
  "Inde",
  "Thaïlande",
  "Vietnam",
  "Indonésie",
  "Australie",
  "Nouvelle-Zélande",
  "Maurice",
  "Réunion",
  "Guadeloupe",
  "Martinique",
  "Polynésie française",
  "Nouvelle-Calédonie",
];

// Portée réduite pour ce premier écran : templates sans personne liée (<conjoint>) ni
// élément à choisir (<pays>), et sans les types city/place (pas encore de widget dédié).
// Ça couvre 24 des 32 templates du catalogue - le reste viendra avec la gestion des
// personnes liées.
const SUPPORTED_KINDS = ["date", "year", "age", "number", "country", "list", "free_text"];

async function hasPotentialSibling(personId: string, famId: string): Promise<boolean> {
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
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [showAllPersons, setShowAllPersons] = useState(false);

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

      const { data: persons } = await supabase
        .from("persons")
        .select("id, display_name, gender, is_deceased, is_central")
        .eq("family_id", me.family_id)
        .order("is_central", { ascending: false })
        .order("display_name", { ascending: true });

      if (cancelled) return;
      const list = persons ?? [];
      setAllPersons(list);

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
      const supportedForSubject = (templatesRes.data ?? []).filter((t: Template) => {
        if (t.related_role || (t.slots && t.slots.length > 0)) return false;
        if (!SUPPORTED_KINDS.includes(t.answer_input_kind)) return false;
        return matchesCondition(t.condition, subject, siblingRes);
      });
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
      let finalAnswer: string | number = answerValue.trim();
      if (["year", "age", "number"].includes(selectedTemplate.answer_input_kind)) {
        const n = Number(answerValue.trim());
        if (Number.isNaN(n)) throw new Error("Merci de saisir un nombre valide.");
        finalAnswer = n;
      } else if (finalAnswer === "") {
        throw new Error("Merci de renseigner une réponse.");
      }

      if (selectedTemplate.answer_input_kind === "list" && selectedTemplate.list_name) {
        const { data: existingItem } = await supabase
          .from("list_items")
          .select("id")
          .eq("list_name", selectedTemplate.list_name)
          .ilike("value", finalAnswer as string)
          .maybeSingle();

        if (!existingItem) {
          await supabase.from("list_items").insert({
            list_name: selectedTemplate.list_name,
            value: finalAnswer,
            status: "pending",
            family_id: familyId,
            created_by_person_id: myPersonId,
          });
        }
      }

      const { error: factError } = await supabase.from("facts").insert({
        family_id: familyId,
        template_id: selectedTemplate.id,
        subject_person_id: subjectId,
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
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
                      {hasMoreCategories && (
                        <Pressable onPress={() => setShowAllCategories(true)} style={styles.chip}>
                          <ThemedText>+</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  </ScrollView>
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
                {searchResults.map((t) => (
                  <Pressable key={t.id} onPress={() => selectTemplate(t)} style={styles.questionOption}>
                    <ThemedText>{t.template_text.replace("<sujet>", subject?.display_name ?? "")}</ThemedText>
                  </Pressable>
                ))}
                {searchResults.length === 0 && (
                  <ThemedText themeColor="textSecondary">Aucune question ne correspond.</ThemedText>
                )}
              </>
            )}
          </>
        )}

        {selectedTemplate && (
          <View style={{ gap: Spacing.three }}>
            <View style={[styles.card, styles.chipSelected]}>
              <ThemedText style={{ color: "#ffffff" }}>
                {selectedTemplate.template_text.replace("<sujet>", subject?.display_name ?? "")}
              </ThemedText>
            </View>

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
              <ThemedText style={{ color: "#ffffff" }}>{submitting ? "Enregistrement…" : "Enregistrer"}</ThemedText>
            </Pressable>
          </View>
        )}

        <Pressable onPress={() => router.replace("/home")}>
          <ThemedText type="linkPrimary">Retour à l&apos;accueil</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

function AnswerInput(props: {
  template: Template;
  familyId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { template, familyId, value, onChange } = props;
  const kind = template.answer_input_kind;

  const [listOptions, setListOptions] = useState<string[]>([]);

  useEffect(() => {
    if (kind !== "list" || !template.list_name) return;
    let cancelled = false;
    supabase
      .from("list_items")
      .select("value, status, family_id")
      .eq("list_name", template.list_name)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const options = data
          .filter((row) => row.status === "approved" || row.family_id === familyId)
          .map((row) => row.value);
        setListOptions(Array.from(new Set(options)).sort());
      });
    return () => {
      cancelled = true;
    };
  }, [kind, template.list_name, familyId]);

  if (kind === "date") {
    return <DateInput value={value} onChange={onChange} />;
  }

  if (kind === "year" || kind === "age" || kind === "number") {
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={kind === "year" ? "Année" : kind === "age" ? "Âge" : "Nombre"}
        keyboardType="number-pad"
        style={styles.input}
      />
    );
  }

  if (kind === "country") {
    return (
      <View style={styles.chipsRow}>
        {COUNTRIES.map((c) => (
          <Pressable key={c} onPress={() => onChange(c)} style={[styles.chip, value === c && styles.chipSelected]}>
            <ThemedText style={value === c ? { color: "#ffffff" } : undefined}>{c}</ThemedText>
          </Pressable>
        ))}
      </View>
    );
  }

  if (kind === "list") {
    return (
      <View style={{ gap: Spacing.two }}>
        <View style={styles.chipsRow}>
          {listOptions.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[styles.chip, value === opt && styles.chipSelected]}
            >
              <ThemedText style={value === opt ? { color: "#ffffff" } : undefined}>{opt}</ThemedText>
            </Pressable>
          ))}
        </View>
        <ThemedText themeColor="textSecondary">Pas dans la liste ?</ThemedText>
        <TextInput value={value} onChangeText={onChange} placeholder="Nouvelle valeur" style={styles.input} />
      </View>
    );
  }

  return <TextInput value={value} onChangeText={onChange} placeholder="Réponse" style={styles.input} />;
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
