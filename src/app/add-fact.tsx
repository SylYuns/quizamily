// Nouveau fait (écran 5, voir docs/ecrans.md et docs/design.md). Refonte « Coucher de soleil »
// décidée et maquettée le 2026-11-20 (docs/maquettes/soleil/Fait.dc.html) : personnes en rangée
// qui défile, repère des thèmes, carte par thème glissée horizontalement, question qui s'agrandit
// sur place, recherche fixe en bas. La répartition des questions (à renseigner / mes questions
// modifiables / déjà renseignées) est calculée par src/lib/add-fact-catalog.ts, module pur testé
// séparément.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ScrollViewInstance,
} from "react-native";

import { AnswerInput } from "@/components/answer-input";
import { FamilyHeaderBar } from "@/components/family-header";
import { SearchableDropdown } from "@/components/searchable-dropdown";
import { PersonAvatar } from "@/components/soleil";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/constants/categories";
import { COUNTRIES } from "@/constants/countries";
import { FONTS, RADIUS, S, solidShadow, sunsetBackground } from "@/constants/soleil";
import { buildAddFactCatalog, type CategoryBucket } from "@/lib/add-fact-catalog";
import { parseAnswerValue } from "@/lib/answer-value";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { resolveGenderedTokens, type Gender } from "@/lib/gender";
import { ensureListItemExists } from "@/lib/list-items";
import { listMyFamilies, resolveMyFamily, setPersistedFamilyId, type MyFamilyMembership } from "@/lib/my-family";
import { substituteQuestionText } from "@/lib/question-text";
import { supabase } from "@/lib/supabase";
import { useInviteLink } from "@/lib/use-invite-link";
import { Template } from "@/types/question-template";

type Person = {
  id: string;
  first_name: string;
  display_name: string;
  gender: "homme" | "femme" | null;
  is_deceased: boolean;
  is_central: boolean;
};

type Relationship = { person_a_id: string; person_b_id: string; relation_type: string };

type FactStatus = "not_posed" | "open" | "revealed";

type Fact = {
  id: string;
  template_id: string;
  author_person_id: string;
  related_person_id: string | null;
  slot_values: Record<string, string> | null;
  context_text: string | null;
  status: FactStatus;
};

const CARD_BG: Record<string, string> = {
  "naissance-enfance": "#FFE9A8",
  jeunesse: "#CDEDE5",
  "couple-installation": "#FFD9DC",
  "retraite-voyages-loisirs": "#FFD0B0",
  "culture-premieres-fois": "#DCD0F2",
};

const CARD_GAP = 10;

function findRelatedPersonId(relationships: Relationship[], subjectId: string): string | null {
  const rel = relationships.find(
    (r) => r.relation_type === "spouse_of" && (r.person_a_id === subjectId || r.person_b_id === subjectId),
  );
  if (!rel) return null;
  return rel.person_a_id === subjectId ? rel.person_b_id : rel.person_a_id;
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

// Pour une question pas encore créée : <conjoint>/<pays> peuvent être inconnus tant que l'auteur
// ne les a pas choisis, contrairement à substituteQuestionText (src/lib/question-text.ts) qui
// suppose un fait déjà résolu.
// Random en paramètre par défaut (comme pickHomeProfiles) : un appel direct à Math.random() dans
// le corps d'un composant est refusé par la règle react-hooks/purity.
function pickRandomTemplate(pool: Template[], random: () => number = Math.random): Template {
  return pool[Math.floor(random() * pool.length)];
}

function previewQuestionText(
  t: Template,
  subjectName: string,
  relatedName: string | null,
  slotValues: Record<string, string>,
  subjectGender: Gender,
): string {
  let text = resolveGenderedTokens(t.template_text, subjectGender).replace("<sujet>", subjectName);
  if (t.related_role) text = text.replace(`<${t.related_role}>`, relatedName ?? "son/sa conjoint·e");
  for (const slot of t.slots ?? []) text = text.replace(`<${slot}>`, slotValues[slot] ?? `(${slot} à préciser)`);
  return text;
}

type QuestionSegment = { text: string; editableKey?: string };

// Comme previewQuestionText, mais en segments : l'élément déjà choisi (conjoint, pays…) devient
// un segment à part (`editableKey`), affiché souligné en pointillés et cliquable dans
// OpenTileEditor pour le reprendre sans perdre le reste de la saisie en cours (demandé le
// 2026-11-23 — jusque-là, il fallait "Annuler" toute la question en cas de mauvais clic).
// Uniquement pour une question en cours de création ("new") : un fait déjà créé ("edit") garde
// son conjoint/pays fixes, pas encore modifiables depuis cet écran.
function buildQuestionSegments(
  t: Template,
  subjectName: string,
  relatedName: string | null,
  slotValues: Record<string, string>,
  subjectGender: Gender,
): QuestionSegment[] {
  const base = resolveGenderedTokens(t.template_text, subjectGender).replace("<sujet>", subjectName);

  const markers: { token: string; editableKey: string; value: string | null }[] = [];
  if (t.related_role) markers.push({ token: `<${t.related_role}>`, editableKey: "related", value: relatedName });
  for (const slot of t.slots ?? []) markers.push({ token: `<${slot}>`, editableKey: slot, value: slotValues[slot] ?? null });

  let segments: QuestionSegment[] = [{ text: base }];
  for (const marker of markers) {
    const next: QuestionSegment[] = [];
    for (const seg of segments) {
      if (seg.editableKey) {
        next.push(seg);
        continue;
      }
      const idx = seg.text.indexOf(marker.token);
      if (idx === -1) {
        next.push(seg);
        continue;
      }
      const before = seg.text.slice(0, idx);
      const after = seg.text.slice(idx + marker.token.length);
      if (before) next.push({ text: before });
      if (marker.value !== null) {
        next.push({ text: marker.value, editableKey: marker.editableKey });
      } else {
        next.push({ text: marker.editableKey === "related" ? "son/sa conjoint·e" : `(${marker.editableKey} à préciser)` });
      }
      if (after) next.push({ text: after });
    }
    segments = next;
  }
  return segments;
}

type OpenTile = {
  kind: "new" | "edit";
  template: Template;
  fact?: Fact;
  initial: { answerValue: string; contextText: string; relatedPersonId: string | null; slotValues: Record<string, string> };
};

export default function AddFactScreen() {
  const params = useLocalSearchParams<{ family?: string }>();
  const paramFamily = typeof params.family === "string" && params.family.length > 0 ? params.family : null;

  const { width } = useWindowDimensions();
  const CARD_WIDTH = Math.min(380, width - 56);

  const [noSession, setNoSession] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [familiesLoaded, setFamiliesLoaded] = useState(false);
  const [families, setFamilies] = useState<MyFamilyMembership[]>([]);
  const [familyIndex, setFamilyIndex] = useState(0);

  const [ready, setReady] = useState(false);
  const [allPersons, setAllPersons] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [myAnswers, setMyAnswers] = useState<Map<string, string | number>>(new Map());

  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [hasSibling, setHasSibling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  const [openTile, setOpenTile] = useState<OpenTile | null>(null);
  const [relatedPersonId, setRelatedPersonId] = useState<string | null>(null);
  const [showSpouseCreator, setShowSpouseCreator] = useState(false);
  const [newSpouseFirstName, setNewSpouseFirstName] = useState("");
  const [newSpouseLastName, setNewSpouseLastName] = useState("");
  const [newSpouseGender, setNewSpouseGender] = useState<"homme" | "femme" | null>(null);
  const [creatingSpouse, setCreatingSpouse] = useState(false);
  const [slotValues, setSlotValues] = useState<Record<string, string>>({});
  const [answerValue, setAnswerValue] = useState("");
  const [contextText, setContextText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const cardsScrollRef = useRef<ScrollViewInstance>(null);
  const didInitialScroll = useRef(false);

  const family = families[familyIndex] as MyFamilyMembership | undefined;
  const familyId = family?.familyId ?? null;
  const myPersonId = family?.personId ?? null;

  const { copied, copy: copyInviteLink } = useInviteLink(familyId);

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

  // Personnes, relations, catalogue et mes réponses : pour toute la famille, indépendants du sujet.
  useEffect(() => {
    if (!familyId || !myPersonId) return;
    let cancelled = false;

    async function load() {
      setReady(false);
      const [{ data: personsData }, { data: relsData }, { data: templatesData }, { data: answersData }] = await Promise.all([
        supabase
          .from("persons")
          .select("id, first_name, display_name, gender, is_deceased, is_central")
          .eq("family_id", familyId)
          .order("is_central", { ascending: false })
          .order("display_name", { ascending: true }),
        supabase.from("relationships").select("person_a_id, person_b_id, relation_type").eq("family_id", familyId),
        supabase.from("question_templates").select("*").eq("status", "mvp"),
        supabase.rpc("get_my_fact_answers", { p_family_id: familyId }),
      ]);

      if (cancelled) return;
      const persons = (personsData ?? []) as Person[];
      setAllPersons(persons);
      setRelationships((relsData ?? []) as Relationship[]);
      setTemplates((templatesData ?? []) as Template[]);
      setMyAnswers(
        new Map(
          ((answersData ?? []) as { fact_id: string; answer_value: string | number }[]).map((r) => [r.fact_id, r.answer_value]),
        ),
      );

      let initialSubjectId = persons.length > 0 ? persons[0].id : null;
      let initialCategory: string | null = null;
      try {
        const stored = await AsyncStorage.getItem(`quizamily:addFact:${myPersonId}`);
        if (stored) {
          const parsed = JSON.parse(stored) as { subjectId?: string; category?: string | null };
          if (parsed.subjectId && persons.some((p) => p.id === parsed.subjectId)) {
            initialSubjectId = parsed.subjectId;
          }
          if (typeof parsed.category === "string") initialCategory = parsed.category;
        }
      } catch {
        // préférences locales corrompues ou indisponibles : on repart des valeurs par défaut
      }

      setSubjectId(initialSubjectId);
      setActiveCategory(initialCategory);
      didInitialScroll.current = false;
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [familyId, myPersonId]);

  // Faits du sujet choisi (tous auteurs), pour la répartition par thème et le récapitulatif rapide.
  useEffect(() => {
    if (!subjectId || !familyId) return;
    let cancelled = false;

    async function load() {
      const [{ data: factsData }, siblingResult] = await Promise.all([
        supabase
          .from("facts")
          .select("id, template_id, author_person_id, related_person_id, slot_values, context_text")
          .eq("family_id", familyId)
          .eq("subject_person_id", subjectId)
          .eq("status", "active"),
        hasPotentialSibling(subjectId!, familyId!),
      ]);

      if (cancelled) return;
      const rows = factsData ?? [];
      const factIds = rows.map((f) => f.id);
      const statusByFact = new Map<string, "open" | "revealed">();
      if (factIds.length > 0) {
        const { data: posed } = await supabase
          .from("quiz_questions")
          .select("fact_id, quiz_sessions (status)")
          .in("fact_id", factIds);
        for (const row of posed ?? []) {
          const status = (row.quiz_sessions as unknown as { status: string } | null)?.status;
          if (status === "closed") statusByFact.set(row.fact_id, "revealed");
          else if (!statusByFact.has(row.fact_id)) statusByFact.set(row.fact_id, "open");
        }
      }

      if (cancelled) return;
      setFacts(
        rows.map((f) => ({
          id: f.id,
          template_id: f.template_id,
          author_person_id: f.author_person_id,
          related_person_id: f.related_person_id,
          slot_values: f.slot_values as Record<string, string> | null,
          context_text: f.context_text,
          status: statusByFact.get(f.id) === "revealed" ? "revealed" : statusByFact.has(f.id) ? "open" : "not_posed",
        })),
      );
      setHasSibling(siblingResult);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [subjectId, familyId, refreshKey]);

  const subject = allPersons.find((p) => p.id === subjectId) ?? null;

  const catalog = useMemo(() => {
    if (!subject || !myPersonId) return null;
    return buildAddFactCatalog({
      templates,
      facts,
      subject: { gender: subject.gender, is_deceased: subject.is_deceased },
      hasSibling,
      myPersonId,
      categoryOrder: CATEGORY_ORDER,
    });
  }, [templates, facts, subject, hasSibling, myPersonId]);

  const templatesById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  // Mémorise le dernier sujet et thème choisis, en local sur l'appareil pour ce joueur.
  useEffect(() => {
    if (!myPersonId || !ready) return;
    AsyncStorage.setItem(`quizamily:addFact:${myPersonId}`, JSON.stringify({ subjectId, category: activeCategory })).catch(
      () => {},
    );
  }, [myPersonId, ready, subjectId, activeCategory]);

  // Recentre le défilement des cartes sur le thème actif (nouveau sujet, ou thème restauré).
  useEffect(() => {
    function syncActiveCategory() {
      if (!catalog || catalog.categories.length === 0) return;
      const idx = catalog.categories.findIndex((c) => c.category === activeCategory);
      const targetIndex = idx >= 0 ? idx : 0;
      const resolved = catalog.categories[targetIndex];
      if (resolved.category !== activeCategory) setActiveCategory(resolved.category);
      cardsScrollRef.current?.scrollTo({ x: targetIndex * (CARD_WIDTH + CARD_GAP), animated: didInitialScroll.current });
      didInitialScroll.current = true;
    }
    syncActiveCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit réagir qu'au changement de catalogue/sujet, pas à chaque frappe
  }, [catalog, subjectId]);

  function relatedNameFor(id: string | null): string | null {
    if (!id) return null;
    return allPersons.find((p) => p.id === id)?.display_name ?? null;
  }

  function relatedPersonNameForTemplate(t: Template): string | null {
    if (!t.related_role || !subjectId) return null;
    return relatedNameFor(findRelatedPersonId(relationships, subjectId));
  }

  function matchesSearch(t: Template, query: string): boolean {
    if (!subject) return false;
    const text = previewQuestionText(t, subject.display_name, relatedPersonNameForTemplate(t), {}, subject.gender);
    return text.toLowerCase().includes(query.trim().toLowerCase());
  }

  function visibleAvailable(cat: CategoryBucket<Fact>): Template[] {
    const query = searchText.trim();
    // La question ouverte reste dans la liste, à sa place : l'éditeur s'affiche à la place de
    // sa tuile (voir renderOpenTileEditor), elle n'est plus exclue puis réaffichée en haut.
    return query.length > 0 ? cat.available.filter((t) => matchesSearch(t, query)) : cat.available;
  }

  const isDirty =
    !!openTile &&
    (answerValue !== openTile.initial.answerValue ||
      contextText !== openTile.initial.contextText ||
      relatedPersonId !== openTile.initial.relatedPersonId ||
      JSON.stringify(slotValues) !== JSON.stringify(openTile.initial.slotValues) ||
      newSpouseFirstName.trim().length > 0 ||
      newSpouseLastName.trim().length > 0);

  const locked = !!openTile && isDirty;

  function resetOpenTileFields() {
    setShowSpouseCreator(false);
    setNewSpouseFirstName("");
    setNewSpouseLastName("");
    setNewSpouseGender(null);
    setConfirmDelete(false);
    setError("");
  }

  function openNewTile(template: Template) {
    if (locked || !subjectId) return;
    const related = template.related_role ? findRelatedPersonId(relationships, subjectId) : null;
    resetOpenTileFields();
    setAnswerValue("");
    setContextText("");
    setSlotValues({});
    setRelatedPersonId(related);
    setOpenTile({ kind: "new", template, initial: { answerValue: "", contextText: "", relatedPersonId: related, slotValues: {} } });
  }

  function openEditTile(fact: Fact) {
    if (locked) return;
    const template = templatesById.get(fact.template_id);
    if (!template) return;
    const existingAnswer = myAnswers.get(fact.id);
    const answerStr = existingAnswer != null ? String(existingAnswer) : "";
    const slots = fact.slot_values ?? {};
    resetOpenTileFields();
    setAnswerValue(answerStr);
    setContextText(fact.context_text ?? "");
    setSlotValues(slots);
    setRelatedPersonId(fact.related_person_id);
    setOpenTile({
      kind: "edit",
      template,
      fact,
      initial: { answerValue: answerStr, contextText: fact.context_text ?? "", relatedPersonId: fact.related_person_id, slotValues: slots },
    });
  }

  function closeTile() {
    setOpenTile(null);
    setConfirmDelete(false);
  }

  function selectSubject(id: string) {
    if (locked || id === subjectId) return;
    setOpenTile(null);
    setSubjectId(id);
    setSearchText("");
  }

  function jumpToCategory(category: string) {
    if (locked) return;
    setOpenTile(null);
    setActiveCategory(category);
    const idx = catalog?.categories.findIndex((c) => c.category === category) ?? -1;
    if (idx >= 0) cardsScrollRef.current?.scrollTo({ x: idx * (CARD_WIDTH + CARD_GAP), animated: true });
  }

  function handleCardsScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!catalog || catalog.categories.length === 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP));
    const cat = catalog.categories[Math.max(0, Math.min(idx, catalog.categories.length - 1))];
    if (cat) setActiveCategory(cat.category);
  }

  function pickRandomFrom(cat: CategoryBucket<Fact>) {
    if (locked) return;
    const pool = visibleAvailable(cat);
    if (pool.length === 0) return;
    openNewTile(pickRandomTemplate(pool));
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

      setAllPersons((prev) => [
        ...prev,
        {
          id: spouse.id,
          first_name: spouse.first_name,
          display_name: spouse.display_name,
          gender: spouse.gender,
          is_deceased: false,
          is_central: false,
        },
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

  async function submitNew() {
    if (openTile?.kind !== "new" || !subjectId || !myPersonId || !familyId) return;
    const template = openTile.template;
    setSubmitting(true);
    setError("");

    try {
      const parsed = parseAnswerValue(template.answer_input_kind, answerValue);
      if (!parsed.ok) throw new Error(parsed.error);
      const finalAnswer = parsed.value;

      if (template.answer_input_kind === "list" && template.list_name) {
        await ensureListItemExists({
          listName: template.list_name,
          category: template.list_category ?? null,
          value: finalAnswer as string,
          familyId,
          personId: myPersonId,
        });
      }

      if (template.related_role && relatedPersonId && findRelatedPersonId(relationships, subjectId) === null) {
        const { error: relError } = await supabase.from("relationships").insert({
          family_id: familyId,
          person_a_id: subjectId,
          person_b_id: relatedPersonId,
          relation_type: "spouse_of",
        });
        if (relError) throw relError;
        setRelationships((prev) => [...prev, { person_a_id: subjectId, person_b_id: relatedPersonId, relation_type: "spouse_of" }]);
      }

      const { data: inserted, error: factError } = await supabase
        .from("facts")
        .insert({
          family_id: familyId,
          template_id: template.id,
          subject_person_id: subjectId,
          related_person_id: template.related_role ? relatedPersonId : null,
          slot_values: Object.keys(slotValues).length > 0 ? slotValues : null,
          author_person_id: myPersonId,
          answer_value: finalAnswer,
          context_text: contextText.trim().length > 0 ? contextText.trim() : null,
        })
        .select("id")
        .single();
      if (factError) throw factError;

      // La réponse n'est pas relisible via un simple select sur facts (voir get_my_fact_answers) :
      // on la connaît déjà puisqu'on vient de l'enregistrer, pas besoin d'un aller-retour de plus.
      setMyAnswers((prev) => new Map(prev).set(inserted.id, finalAnswer));
      setOpenTile(null);
      setJustAddedId(inserted.id);
      setTimeout(() => setJustAddedId((id) => (id === inserted.id ? null : id)), 2500);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit() {
    if (openTile?.kind !== "edit" || !myPersonId || !familyId) return;
    const { template, fact } = openTile;
    if (!fact) return;
    setSubmitting(true);
    setError("");

    try {
      const parsed = parseAnswerValue(template.answer_input_kind, answerValue);
      if (!parsed.ok) throw new Error(parsed.error);
      const finalAnswer = parsed.value;

      if (template.answer_input_kind === "list" && template.list_name) {
        await ensureListItemExists({
          listName: template.list_name,
          category: template.list_category ?? null,
          value: finalAnswer as string,
          familyId,
          personId: myPersonId,
        });
      }

      const { error: updateError } = await supabase
        .from("facts")
        .update({
          answer_value: finalAnswer,
          context_text: contextText.trim().length > 0 ? contextText.trim() : null,
        })
        .eq("id", fact.id);
      if (updateError) throw updateError;

      setMyAnswers((prev) => new Map(prev).set(fact.id, finalAnswer));
      setOpenTile(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteCurrentFact() {
    if (openTile?.kind !== "edit" || !openTile.fact) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from("facts").delete().eq("id", openTile.fact.id);
    if (!deleteError) {
      setOpenTile(null);
      setConfirmDelete(false);
      setRefreshKey((k) => k + 1);
    } else {
      setError(deleteError.message);
    }
    setDeleting(false);
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
    setSubjectId(null);
    setActiveCategory(null);
    setOpenTile(null);
  }

  // Rendue à la place exacte de la tuile touchée (dans la liste "à renseigner" ou "Mes
  // questions"), jamais hissée en haut de la carte : sinon, en étant scrollé plus bas, la
  // question semble disparaître (signalé par l'utilisateur le 2026-11-23 — la carte ne
  // suivait pas le saut en haut).
  function renderOpenTileEditor(subjectPerson: Person, tile: OpenTile, key: string) {
    return (
      <OpenTileEditor
        key={key}
        openTile={tile}
        subject={subjectPerson}
        relatedPersonId={relatedPersonId}
        relatedName={relatedNameFor(relatedPersonId)}
        slotValues={slotValues}
        answerValue={answerValue}
        contextText={contextText}
        error={error}
        submitting={submitting}
        isDirty={isDirty}
        confirmDelete={confirmDelete}
        deleting={deleting}
        familyId={familyId!}
        allPersons={allPersons}
        showSpouseCreator={showSpouseCreator}
        newSpouseFirstName={newSpouseFirstName}
        newSpouseLastName={newSpouseLastName}
        newSpouseGender={newSpouseGender}
        creatingSpouse={creatingSpouse}
        onAnswerChange={setAnswerValue}
        onContextChange={setContextText}
        onSlotChange={(slot, value) => setSlotValues((v) => ({ ...v, [slot]: value }))}
        onEditSlot={(key) => {
          if (key === "related") {
            setRelatedPersonId(null);
            setShowSpouseCreator(false);
          } else {
            setSlotValues((v) => {
              const next = { ...v };
              delete next[key];
              return next;
            });
          }
        }}
        onPickExistingSpouse={setRelatedPersonId}
        onShowSpouseCreator={() => setShowSpouseCreator(true)}
        onNewSpouseFirstName={setNewSpouseFirstName}
        onNewSpouseLastName={setNewSpouseLastName}
        onNewSpouseGender={setNewSpouseGender}
        onCreateSpouse={createSpouse}
        onCancel={closeTile}
        onSubmit={tile.kind === "new" ? submitNew : submitEdit}
        onConfirmDelete={() => setConfirmDelete(true)}
        onCancelDelete={() => setConfirmDelete(false)}
        onDelete={deleteCurrentFact}
      />
    );
  }

  return (
    <View style={[styles.screen, sunsetBackground]}>
      <FamilyHeaderBar
        title="Ajouter un souvenir"
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

      {!ready || !catalog || !subject ? (
        <View style={styles.centered}>
          <ActivityIndicator color={S.action} />
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!locked}
            style={styles.personsScroll}
            contentContainerStyle={styles.personsRow}
          >
            {allPersons.map((p) => (
              <Pressable
                key={p.id}
                accessibilityLabel={`Ajouter un souvenir sur ${p.first_name}`}
                onPress={() => selectSubject(p.id)}
                style={[styles.personItem, subjectId === p.id && styles.personItemSelected]}
              >
                <PersonAvatar personId={p.id} firstName={p.first_name} size={48} isCentral={p.is_central} focused={subjectId === p.id} />
                <Text style={styles.personName}>{p.first_name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.recapRow}>
            <Text style={styles.recapText}>
              <Text style={styles.recapName}>{subject.first_name}</Text> · {catalog.counts.revealed} souvenir
              {catalog.counts.revealed === 1 ? "" : "s"} connu{catalog.counts.revealed === 1 ? "" : "s"} · {catalog.counts.reserve} en
              réserve
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!locked}
            style={styles.themeScroll}
            contentContainerStyle={styles.themeRow}
          >
            {catalog.categories.map((cat) => {
              const isActive = cat.category === activeCategory;
              const query = searchText.trim();
              const resultCount = query.length > 0 ? visibleAvailable(cat).length : 0;
              const dimmed = query.length > 0 && !isActive && resultCount === 0;
              return (
                <Pressable
                  key={cat.category}
                  onPress={() => jumpToCategory(cat.category)}
                  style={[styles.themePill, isActive && styles.themePillActive, dimmed && styles.themePillDimmed]}
                >
                  <Text style={[styles.themePillText, isActive && styles.themePillTextActive]}>{CATEGORY_LABELS[cat.category]}</Text>
                  {cat.isComplete && <Text style={[styles.themeCheck, isActive && styles.themePillTextActive]}>✓</Text>}
                  {query.length > 0 && resultCount > 0 && (
                    <View style={styles.themeBadge}>
                      <Text style={styles.themeBadgeText}>{resultCount}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {locked && (
            <View style={styles.lockBanner}>
              <Text style={styles.lockBannerText}>Enregistre ou annule pour changer de thème ou de personne</Text>
            </View>
          )}

          <ScrollView
            ref={cardsScrollRef}
            horizontal
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!locked}
            onMomentumScrollEnd={handleCardsScrollEnd}
            contentContainerStyle={styles.cardsRow}
            style={styles.cardsScroll}
          >
            {catalog.categories.map((cat) => {
              const avail = visibleAvailable(cat);
              const query = searchText.trim();
              const showEmptySearch = query.length > 0 && avail.length === 0 && openTile?.template.category !== cat.category;
              const elsewhere = showEmptySearch
                ? catalog.categories
                    .filter((c) => c.category !== cat.category)
                    .map((c) => ({ cat: c, n: visibleAvailable(c).length }))
                    .filter((x) => x.n > 0)
                : [];
              // "Mes questions" garde la question en cours de modification à sa place (voir
              // renderOpenTileEditor) ; "Déjà renseignées" n'a jamais rien de cliquable, donc
              // jamais rien à y remplacer.
              const mineVisible = cat.mine;
              const othersVisible = cat.others;

              return (
                <View key={cat.category} style={[styles.card, { width: CARD_WIDTH, backgroundColor: CARD_BG[cat.category] ?? S.cream }]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{CATEGORY_LABELS[cat.category]}</Text>
                    {!cat.isComplete && (
                      <Pressable onPress={() => pickRandomFrom(cat)} style={styles.surpriseButton}>
                        <Text style={styles.surpriseButtonText}>🎲 Surprends-moi</Text>
                      </Pressable>
                    )}
                  </View>

                  <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardBody}>
                    {cat.isComplete && !(openTile && openTile.template.category === cat.category && openTile.kind === "new") && (
                      <View style={styles.completeBanner}>
                        <Text style={styles.completeBannerIcon}>✓</Text>
                        <Text style={styles.completeBannerText}>Tout est renseigné pour {subject.first_name} dans ce thème</Text>
                      </View>
                    )}

                    {showEmptySearch && (
                      <View style={styles.searchEmptyCard}>
                        <Text style={styles.searchEmptyTitle}>Aucune question « {query} » dans ce thème</Text>
                        {elsewhere.length > 0 && <Text style={styles.searchEmptySub}>Mais il y en a ailleurs :</Text>}
                        {elsewhere.map(({ cat: c, n }) => (
                          <Pressable key={c.category} onPress={() => jumpToCategory(c.category)} style={styles.searchEmptyLink}>
                            <Text style={styles.searchEmptyLinkText}>
                              {n} question{n === 1 ? "" : "s"} dans {CATEGORY_LABELS[c.category]}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {avail.map((t) =>
                      openTile?.kind === "new" && openTile.template.id === t.id ? (
                        renderOpenTileEditor(subject, openTile, `t-${t.id}`)
                      ) : (
                        <Pressable key={`t-${t.id}`} onPress={() => openNewTile(t)} style={styles.availableTile}>
                          <Text style={styles.availableTileText}>
                            {previewQuestionText(t, subject.display_name, relatedPersonNameForTemplate(t), {}, subject.gender)}
                          </Text>
                          <Text style={styles.plusIcon}>+</Text>
                        </Pressable>
                      ),
                    )}

                    {mineVisible.length > 0 && <Text style={styles.groupLabel}>Mes questions (modifiables)</Text>}
                    {mineVisible.map((f) => {
                      if (openTile?.kind === "edit" && openTile.fact?.id === f.id) {
                        return renderOpenTileEditor(subject, openTile, `m-${f.id}`);
                      }
                      const t = templatesById.get(f.template_id);
                      if (!t) return null;
                      const answer = myAnswers.get(f.id);
                      return (
                        <Pressable key={`m-${f.id}`} onPress={() => openEditTile(f)} style={styles.mineTile}>
                          <Text style={styles.mineTileText}>
                            {substituteQuestionText(t.template_text, t.related_role, subject.display_name, relatedNameFor(f.related_person_id), f.slot_values, subject.gender)}
                          </Text>
                          <View style={styles.mineTileFooter}>
                            <Text style={styles.mineAnswerPill} numberOfLines={1}>
                              Ta réponse : {answer != null ? formatAnswerDisplay(t.answer_input_kind, answer) : "…"}
                            </Text>
                            <Text style={styles.modifyLink}>✎ Modifier</Text>
                          </View>
                          {justAddedId === f.id && <Text style={styles.addedTag}>Ajouté !</Text>}
                        </Pressable>
                      );
                    })}

                    {othersVisible.length > 0 && <Text style={styles.groupLabel}>Déjà renseignées</Text>}
                    {othersVisible.map((f) => {
                      const t = templatesById.get(f.template_id);
                      if (!t) return null;
                      return (
                        <View key={`o-${f.id}`} style={styles.otherTile}>
                          <Text style={styles.otherTileText}>
                            {substituteQuestionText(t.template_text, t.related_role, subject.display_name, relatedNameFor(f.related_person_id), f.slot_values, subject.gender)}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })}
          </ScrollView>

          {!locked && (
            <View style={styles.searchBar}>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="🔍 Rechercher une question (école, voyage…)"
                style={styles.searchInput}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

function OpenTileEditor(props: {
  openTile: OpenTile;
  subject: Person;
  relatedPersonId: string | null;
  relatedName: string | null;
  slotValues: Record<string, string>;
  answerValue: string;
  contextText: string;
  error: string;
  submitting: boolean;
  isDirty: boolean;
  confirmDelete: boolean;
  deleting: boolean;
  familyId: string;
  allPersons: Person[];
  showSpouseCreator: boolean;
  newSpouseFirstName: string;
  newSpouseLastName: string;
  newSpouseGender: "homme" | "femme" | null;
  creatingSpouse: boolean;
  onAnswerChange: (v: string) => void;
  onContextChange: (v: string) => void;
  onSlotChange: (slot: string, value: string) => void;
  /** L'utilisateur a touché un élément déjà choisi (conjoint ou pays) dans le texte de la
   * question : reprend juste ce choix-là, sans toucher au reste de la saisie en cours. */
  onEditSlot: (key: string) => void;
  onPickExistingSpouse: (id: string) => void;
  onShowSpouseCreator: () => void;
  onNewSpouseFirstName: (v: string) => void;
  onNewSpouseLastName: (v: string) => void;
  onNewSpouseGender: (g: "homme" | "femme") => void;
  onCreateSpouse: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const { openTile, subject } = props;
  const { template } = openTile;
  // Garde un sélecteur affiché tant qu'on y tape, même si la valeur tapée ressemble déjà à un
  // choix complet (ex. un seul caractère dans le pays) : sans ça, le champ se refermait dès la
  // première lettre puisque la valeur devenait "non vide" (repéré en testant à l'écran).
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const needsRelated = !!template.related_role && (!props.relatedPersonId || editingKey === "related");
  const missingSlots = (template.slots ?? []).filter((s) => !props.slotValues[s] || editingKey === s);
  const readyForAnswer = !needsRelated && missingSlots.length === 0;

  return (
    <View style={styles.openTile}>
      {openTile.kind === "edit" ? (
        <Text style={styles.openTileQuestion}>
          {substituteQuestionText(template.template_text, template.related_role, subject.display_name, props.relatedName, props.slotValues, subject.gender)}
        </Text>
      ) : (
        <Text style={styles.openTileQuestion}>
          {buildQuestionSegments(template, subject.display_name, props.relatedName, props.slotValues, subject.gender).map((seg, i) =>
            seg.editableKey ? (
              <Text
                key={i}
                onPress={() => props.onEditSlot(seg.editableKey!)}
                suppressHighlighting
                style={styles.editableSegment}
              >
                {seg.text}
              </Text>
            ) : (
              <Text key={i}>{seg.text}</Text>
            ),
          )}
        </Text>
      )}

      {needsRelated && (
        <View style={styles.spouseBlock}>
          <Text style={styles.fieldLabel}>Qui est le conjoint ou la conjointe de {subject.first_name} ?</Text>
          <View style={styles.chipsRow}>
            {props.allPersons
              .filter((p) => p.id !== subject.id)
              .map((p) => (
                <Pressable key={p.id} onPress={() => props.onPickExistingSpouse(p.id)} style={styles.chip}>
                  <Text style={styles.chipText}>{p.display_name}</Text>
                </Pressable>
              ))}
            <Pressable onPress={props.onShowSpouseCreator} style={styles.chip}>
              <Text style={styles.chipText}>+ Nouvelle personne</Text>
            </Pressable>
          </View>
          {props.showSpouseCreator && (
            <View style={{ gap: 8 }}>
              <TextInput value={props.newSpouseFirstName} onChangeText={props.onNewSpouseFirstName} placeholder="Prénom" style={styles.input} />
              <TextInput value={props.newSpouseLastName} onChangeText={props.onNewSpouseLastName} placeholder="Nom" style={styles.input} />
              <View style={styles.chipsRow}>
                {(["homme", "femme"] as const).map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => props.onNewSpouseGender(g)}
                    style={[styles.chip, props.newSpouseGender === g && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, props.newSpouseGender === g && styles.chipTextSelected]}>
                      {g === "homme" ? "Homme" : "Femme"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={props.onCreateSpouse}
                disabled={props.creatingSpouse || props.newSpouseFirstName.trim().length === 0 || props.newSpouseLastName.trim().length === 0}
                style={[
                  styles.secondaryButton,
                  (props.creatingSpouse || props.newSpouseFirstName.trim().length === 0 || props.newSpouseLastName.trim().length === 0) && {
                    opacity: 0.6,
                  },
                ]}
              >
                <Text style={styles.secondaryButtonText}>{props.creatingSpouse ? "Création…" : "Ajouter cette personne"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {missingSlots.map((slot) =>
        slot === "pays" ? (
          <View key={slot} style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Quel pays ?</Text>
            <SearchableDropdown
              value={props.slotValues[slot] ?? ""}
              onChange={(v) => props.onSlotChange(slot, v)}
              onFocusChange={(focused) => setEditingKey(focused ? slot : null)}
              options={COUNTRIES}
              placeholder="Tape pour chercher un pays"
            />
          </View>
        ) : null,
      )}

      {!readyForAnswer && props.error.length > 0 && <Text style={styles.errorText}>{props.error}</Text>}

      {readyForAnswer && (
        <>
          <AnswerInput template={template} familyId={props.familyId} value={props.answerValue} onChange={props.onAnswerChange} />

          <Text style={styles.fieldLabel}>Anecdote (facultatif)</Text>
          <TextInput
            value={props.contextText}
            onChangeText={props.onContextChange}
            placeholder="Un détail, un souvenir qui va avec…"
            multiline
            style={[styles.textarea]}
          />

          {props.error.length > 0 && <Text style={styles.errorText}>{props.error}</Text>}

          {openTile.kind === "edit" &&
            (props.confirmDelete ? (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmText}>Supprimer ce fait ?</Text>
                <Pressable onPress={props.onDelete} disabled={props.deleting}>
                  <Text style={styles.deleteConfirmLink}>{props.deleting ? "Suppression…" : "Oui, supprimer"}</Text>
                </Pressable>
                <Pressable onPress={props.onCancelDelete}>
                  <Text style={styles.cancelLink}>Annuler</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={props.onConfirmDelete}>
                <Text style={styles.deleteLink}>Supprimer ce fait</Text>
              </Pressable>
            ))}

          <View style={styles.openTileActions}>
            {!props.isDirty && <Text style={styles.closeHint}>Touche ailleurs pour refermer</Text>}
            <View style={{ flex: 1 }} />
            <Pressable onPress={props.onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={props.onSubmit}
              disabled={props.submitting || props.answerValue.trim().length === 0}
              style={[styles.saveButton, (props.submitting || props.answerValue.trim().length === 0) && { opacity: 0.6 }]}
            >
              <Text style={styles.saveButtonText}>{props.submitting ? "Enregistrement…" : "Enregistrer"}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  titleRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingTop: 2 },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backArrow: { fontSize: 24, color: S.ink, fontFamily: FONTS.bodyHeavy },
  title: { fontFamily: FONTS.title, fontSize: 24, color: S.ink },

  // flexGrow/flexShrink à 0 : un ScrollView horizontal sans style explicite peut sinon s'étirer
  // pour occuper l'espace vertical disponible (constaté à l'écran), au lieu de ne prendre que la
  // hauteur de son contenu.
  personsScroll: { flexGrow: 0, flexShrink: 0 },
  personsRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 6 },
  personItem: { alignItems: "center", gap: 3, width: 64, paddingVertical: 5, paddingHorizontal: 4, borderRadius: 18 },
  personItemSelected: { backgroundColor: "rgba(255,248,238,0.55)" },
  personName: { fontFamily: FONTS.titleMedium, fontSize: 13, color: S.ink },

  recapRow: { paddingHorizontal: 16, paddingTop: 8 },
  recapText: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.ink },
  recapName: { fontFamily: FONTS.title, fontSize: 15 },

  themeScroll: { flexGrow: 0, flexShrink: 0 },
  themeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  themePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
    backgroundColor: "rgba(255,248,238,0.55)",
  },
  themePillActive: { borderColor: S.action, backgroundColor: S.action },
  themePillDimmed: { opacity: 0.5 },
  themePillText: { fontFamily: FONTS.bodyHeavy, fontSize: 14, color: S.ink },
  themePillTextActive: { color: S.white },
  themeCheck: { fontSize: 12, color: S.ink },
  themeBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: S.sun,
    alignItems: "center",
    justifyContent: "center",
  },
  themeBadgeText: { fontSize: 12, fontFamily: FONTS.bodyHeavy, color: S.ink },

  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: S.waiting,
  },
  lockBannerText: { fontSize: 13, fontFamily: FONTS.bodyHeavy, color: S.waitingSoft },

  cardsScroll: { flex: 1, marginTop: 10 },
  cardsRow: { paddingLeft: 16, paddingRight: 16, gap: CARD_GAP },
  card: {
    borderRadius: 30,
    overflow: "hidden",
    ...solidShadow("rgba(138,58,18,0.22)", 7),
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  cardTitle: { flex: 1, fontFamily: FONTS.title, fontSize: 21, color: S.ink },
  surpriseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: S.action,
    ...solidShadow(S.actionShadow, 3),
  },
  surpriseButtonText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 13 },

  cardScroll: { flex: 1 },
  cardBody: { gap: 8, paddingHorizontal: 12, paddingBottom: 16 },

  completeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: S.action,
  },
  completeBannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: S.sun,
    color: S.ink,
    textAlign: "center",
    textAlignVertical: "center",
    fontFamily: FONTS.bodyHeavy,
    fontSize: 16,
  },
  completeBannerText: { flex: 1, color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 15, lineHeight: 20 },

  searchEmptyCard: { gap: 8, padding: 16, borderRadius: 20, backgroundColor: "rgba(255,251,244,0.7)" },
  searchEmptyTitle: { fontSize: 15, fontFamily: FONTS.bodyHeavy, color: S.ink, textAlign: "center" },
  searchEmptySub: { fontSize: 14, fontFamily: FONTS.bodySemi, color: S.inkSoft, textAlign: "center" },
  searchEmptyLink: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: S.white,
    alignItems: "center",
    justifyContent: "center",
  },
  searchEmptyLinkText: { fontFamily: FONTS.bodyHeavy, fontSize: 14, color: S.ink },

  availableTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: S.cream,
    ...solidShadow("rgba(138,58,18,0.15)", 3),
  },
  availableTileText: { flex: 1, fontFamily: FONTS.bodySemi, fontSize: 15, color: S.ink, lineHeight: 19 },
  plusIcon: { fontSize: 18, color: S.action, fontFamily: FONTS.bodyHeavy },

  groupLabel: { marginTop: 6, fontSize: 12, fontFamily: FONTS.bodyHeavy, letterSpacing: 0.6, textTransform: "uppercase", color: S.inkSoft },

  mineTile: {
    gap: 8,
    padding: 12,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(138,58,18,0.35)",
    backgroundColor: S.cream,
    ...solidShadow("rgba(138,58,18,0.15)", 3),
  },
  mineTileText: { fontFamily: FONTS.bodySemi, fontSize: 15, color: S.ink, lineHeight: 19 },
  mineTileFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  mineAnswerPill: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: S.creamStrong,
    fontSize: 13,
    fontFamily: FONTS.bodyBold,
    color: S.inkOnGround,
  },
  modifyLink: { fontSize: 13, fontFamily: FONTS.bodyHeavy, color: S.action },
  addedTag: { fontSize: 12, fontFamily: FONTS.bodyHeavy, color: S.action },

  otherTile: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.35)" },
  otherTileText: { fontSize: 14, fontFamily: FONTS.bodySemi, color: S.inkSoft, lineHeight: 18 },

  openTile: {
    gap: 10,
    padding: 14,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: S.action,
    backgroundColor: "#FFFBF4",
    ...solidShadow("rgba(138,58,18,0.25)", 5),
  },
  openTileQuestion: { fontFamily: FONTS.title, fontSize: 18, color: S.ink, lineHeight: 23 },
  editableSegment: {
    color: S.action,
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: S.action,
  },
  fieldLabel: { fontSize: 13, fontFamily: FONTS.bodyHeavy, color: S.inkSoft },
  spouseBlock: { gap: 8 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#EAD9BD", borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: S.white },
  chipSelected: { backgroundColor: S.action, borderColor: S.action },
  chipText: { fontFamily: FONTS.bodyBold, fontSize: 14, color: S.ink },
  chipTextSelected: { color: S.white },
  input: { height: 46, paddingHorizontal: 14, borderWidth: 2, borderColor: "#EAD9BD", borderRadius: 14, backgroundColor: S.white, fontFamily: FONTS.body, fontSize: 16, color: S.ink },
  textarea: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: "#EAD9BD", borderRadius: 14, backgroundColor: S.white, fontFamily: FONTS.body, fontSize: 15, color: S.ink },
  errorText: { fontSize: 14, fontFamily: FONTS.bodyBold, color: S.alertInk },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  confirmText: { fontSize: 14, fontFamily: FONTS.bodySemi, color: S.ink },
  deleteLink: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.alertInk },
  deleteConfirmLink: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.alertInk },
  cancelLink: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.inkSoft },
  openTileActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  closeHint: { flex: 1, fontSize: 12, fontFamily: FONTS.bodyBold, color: S.inkSoft },
  cancelButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: RADIUS.pill, borderWidth: 2, borderColor: S.action, alignItems: "center", justifyContent: "center" },
  cancelButtonText: { color: S.action, fontFamily: FONTS.bodyHeavy, fontSize: 15 },
  saveButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: RADIUS.pill, backgroundColor: S.action, alignItems: "center", justifyContent: "center", ...solidShadow(S.actionShadow, 4) },
  saveButtonText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 15 },
  secondaryButton: { minHeight: 44, borderRadius: 14, borderWidth: 2, borderColor: S.action, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: S.action, fontFamily: FONTS.bodyHeavy, fontSize: 14 },

  searchBar: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: {
    height: 50,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: S.white,
    borderRadius: 25,
    backgroundColor: "rgba(255,248,238,0.92)",
    fontFamily: FONTS.bodyBold,
    fontSize: 15,
    color: S.ink,
    ...solidShadow("rgba(138,58,18,0.2)", 4),
  },
});
