import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

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

type CentralPerson = {
  id: string;
  display_name: string;
  gender: "homme" | "femme" | null;
  is_deceased: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  "naissance-enfance": "Naissance et enfance",
  jeunesse: "Jeunesse",
  "couple-installation": "Couple et installation",
  "culture-premieres-fois": "Culture et premières fois",
  "retraite-voyages-loisirs": "Retraite, voyages et loisirs",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

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
// Ça couvre 25 des 32 templates du catalogue - le reste viendra avec la gestion des
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

function matchesCondition(condition: string | null, subject: CentralPerson, hasSibling: boolean): boolean {
  if (!condition) return true;
  if (condition === "femme") return subject.gender === "femme";
  if (condition === "homme") return subject.gender === "homme";
  if (condition === "vivant") return !subject.is_deceased;
  if (condition === "a des frères ou sœurs") return hasSibling;
  return true;
}

type Step = "loading" | "chooseSubject" | "chooseTemplate" | "answer" | "confirmation";

export default function AddFactScreen() {
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState("");

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [myPersonId, setMyPersonId] = useState<string | null>(null);
  const [centralPersons, setCentralPersons] = useState<CentralPerson[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [answerValue, setAnswerValue] = useState<string>("");
  const [contextText, setContextText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [noSession, setNoSession] = useState(false);

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

      const { data: centrals } = await supabase
        .from("persons")
        .select("id, display_name, gender, is_deceased")
        .eq("family_id", me.family_id)
        .eq("is_central", true);

      if (cancelled) return;
      const list = centrals ?? [];
      setCentralPersons(list);

      if (list.length === 1) {
        setSubjectId(list[0].id);
        setStep("chooseTemplate");
      } else {
        setStep("chooseSubject");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!subjectId || !familyId) return;
    const currentSubjectId = subjectId;
    const currentFamilyId = familyId;
    let cancelled = false;

    async function loadTemplates() {
      setLoadingTemplates(true);
      const subject = centralPersons.find((p) => p.id === currentSubjectId);
      if (!subject) return;

      const [templatesRes, factsRes, siblingRes] = await Promise.all([
        supabase.from("question_templates").select("*").eq("status", "mvp"),
        supabase.from("facts").select("template_id").eq("subject_person_id", currentSubjectId),
        hasPotentialSibling(currentSubjectId, currentFamilyId),
      ]);

      if (cancelled) return;

      const existingTemplateIds = new Set((factsRes.data ?? []).map((f) => f.template_id));
      const eligible = (templatesRes.data ?? []).filter((t: Template) => {
        if (existingTemplateIds.has(t.id)) return false;
        if (t.related_role || (t.slots && t.slots.length > 0)) return false;
        if (!SUPPORTED_KINDS.includes(t.answer_input_kind)) return false;
        return matchesCondition(t.condition, subject, siblingRes);
      });

      setTemplates(eligible);
      setLoadingTemplates(false);
    }

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [subjectId, familyId, centralPersons, refreshKey]);

  const templatesByCategory = useMemo(() => {
    const groups: Record<string, Template[]> = {};
    for (const t of templates) {
      (groups[t.category] ??= []).push(t);
    }
    return groups;
  }, [templates]);

  function selectTemplate(t: Template) {
    setSelectedTemplate(t);
    setAnswerValue("");
    setContextText("");
    setStep("answer");
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

      setStep("confirmation");
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
    setStep("chooseTemplate");
    setRefreshKey((k) => k + 1); // force a refetch so the just-created fact's template disappears
  }

  if (noSession) {
    return <Redirect href="/" />;
  }

  if (step === "loading") {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (step === "chooseSubject") {
    return (
      <ThemedView style={{ flex: 1 }}>
        <View style={styles.container}>
          <ThemedText type="title">Qui est concerné ?</ThemedText>
          {centralPersons.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                setSubjectId(p.id);
                setStep("chooseTemplate");
              }}
              style={styles.card}
            >
              <ThemedText type="smallBold">{p.display_name}</ThemedText>
            </Pressable>
          ))}
        </View>
      </ThemedView>
    );
  }

  const subject = centralPersons.find((p) => p.id === subjectId);

  if (step === "chooseTemplate") {
    return (
      <ThemedView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <ThemedText type="title">Ajouter un fait sur {subject?.display_name}</ThemedText>

          {loadingTemplates ? (
            <ActivityIndicator />
          ) : templates.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Plus de questions disponibles pour {subject?.display_name} dans cette première version.
            </ThemedText>
          ) : (
            CATEGORY_ORDER.filter((cat) => templatesByCategory[cat]?.length > 0).map((cat) => (
              <View key={cat} style={{ gap: Spacing.two }}>
                <ThemedText type="smallBold">{CATEGORY_LABELS[cat]}</ThemedText>
                {templatesByCategory[cat].map((t) => (
                  <Pressable key={t.id} onPress={() => selectTemplate(t)} style={styles.card}>
                    <ThemedText>{t.template_text.replace("<sujet>", subject?.display_name ?? "")}</ThemedText>
                  </Pressable>
                ))}
              </View>
            ))
          )}

          <Pressable onPress={() => router.replace("/home")}>
            <ThemedText type="linkPrimary">Retour à l&apos;accueil</ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    );
  }

  if (step === "answer" && selectedTemplate) {
    return (
      <ThemedView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <ThemedText type="title">
            {selectedTemplate.template_text.replace("<sujet>", subject?.display_name ?? "")}
          </ThemedText>

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

          <View style={{ flexDirection: "row", gap: Spacing.three }}>
            <Pressable onPress={() => setStep("chooseTemplate")} style={styles.secondaryButton}>
              <ThemedText>Retour</ThemedText>
            </Pressable>
            <Pressable
              onPress={submitFact}
              disabled={submitting || answerValue.trim().length === 0}
              style={[
                styles.primaryButton,
                (submitting || answerValue.trim().length === 0) && { opacity: 0.6 },
              ]}
            >
              <ThemedText style={{ color: "#ffffff" }}>{submitting ? "Enregistrement…" : "Enregistrer"}</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  if (step === "confirmation") {
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

  return null;
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
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="AAAA-MM-JJ"
        style={styles.input}
      />
    );
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
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            style={[styles.chip, value === c && styles.chipSelected]}
          >
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
  card: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
