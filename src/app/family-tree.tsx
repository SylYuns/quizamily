// Arbre familial (écran 10, voir docs/ecrans.md et docs/design.md).
//
// Consultation : 3 lignes visibles (génération centrée, précédente au-dessus, suivante en
// dessous), glissement horizontal et vertical avec crans, traits à angle droit, compteurs de
// souvenirs. Toucher une personne ouvre son récapitulatif (écran 11) dans un panneau qui monte
// du bas de l'écran ; en même temps, l'arbre remonte d'un cran (la ligne de la personne prend
// la place de la ligne du haut) pour laisser de la place au texte, puis redescend à la
// fermeture. Panneau ouvert : glisser à gauche ou à droite change de personne et met le
// panneau à jour ; pas de glissement vertical ; on ferme avec la croix ou en touchant l'arbre.
// Modifier : toucher une personne la sélectionne ; boutons pour lui ajouter un conjoint, un
// enfant, un frère ou une sœur, ou la relier à une personne existante (dont les personnes
// sans relation, qui ne sont pas affichées dans l'arbre).
//
// Paramètres d'URL (venant des profils de l'accueil) : ?person=<id> centre l'arbre sur cette
// personne, &recap=1 ouvre directement son récapitulatif.
//
// Le placement est calculé par src/lib/family-tree-layout.ts (testé à part).
// Charte « Coucher de soleil » : src/constants/soleil.ts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PersonAvatar } from "@/components/soleil";
import { FONTS, RADIUS, S, solidShadow, sunsetBackground } from "@/constants/soleil";
import {
  buildFamilyTree,
  connectorSegments,
  DEFAULT_METRICS,
  layoutFamilyTree,
  moveFocus,
  rowOffsetsFor,
  type RelationType,
  type RowGeometry,
} from "@/lib/family-tree-layout";
import { listMyFamilies, resolveMyFamily } from "@/lib/my-family";
import { buildRecapByCategory, type RecapCategory, type RecapFact } from "@/lib/recap";
import { supabase } from "@/lib/supabase";

type Person = {
  id: string;
  first_name: string;
  display_name: string;
  is_central: boolean;
  gender: "homme" | "femme" | null;
};

type Relationship = {
  id: string;
  person_a_id: string;
  person_b_id: string;
  relation_type: RelationType;
};

type FactCounts = { revealed: number; toDiscover: number };

type NewPersonKind = "spouse" | "child" | "sibling";
type LinkKind = "spouse" | "parent" | "child" | "sibling";

const SLOT = DEFAULT_METRICS.slot;
// Lignes de l'arbre, en coordonnées de la zone de l'arbre.
const ROW_UP = { top: 24, height: 82, avatar: 46 };
const ROW_CENTER = { top: 196, height: 124, avatar: 60 };
const ROW_DOWN = { top: 410, height: 82, avatar: 46 };
const AREA_HEIGHT = 520;
const TREE_MARGIN_TOP = 8;
// Panneau du récapitulatif ouvert : l'arbre remonte d'un cran (la ligne centrale prend la
// place de la ligne du haut) et le panneau commence juste sous la ligne remontée. Les traits
// qui descendent vers les enfants restent visibles entre la ligne et le panneau.
const PANEL_SHIFT = ROW_UP.top - ROW_CENTER.top;
const PANEL_TOP = TREE_MARGIN_TOP + ROW_UP.top + ROW_CENTER.height + 14;
const PANEL_HIDDEN_Y = 1200;
const PANEL_DURATION_MS = 260;
const SWIPE_X = 30;
const SWIPE_Y = 40;
const USE_NATIVE_DRIVER = Platform.OS !== "web";

function souvenirsLabel(n: number): string {
  if (n === 0) return "Aucun souvenir";
  return n === 1 ? "1 souvenir" : `${n} souvenirs`;
}

export default function FamilyTreeScreen() {
  const params = useLocalSearchParams<{ person?: string; recap?: string; family?: string }>();
  const paramPerson = typeof params.person === "string" && params.person.length > 0 ? params.person : null;
  const paramRecap = params.recap === "1";
  const paramFamily = typeof params.family === "string" && params.family.length > 0 ? params.family : null;

  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [error, setError] = useState("");

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [counts, setCounts] = useState<Map<string, FactCounts>>(new Map());

  const [focusId, setFocusId] = useState<string | null>(null);
  const [width, setWidth] = useState(390);
  const [editMode, setEditMode] = useState(false);

  // ---------- Panneau "connaissances" (consultation) ----------
  const [showPanel, setShowPanel] = useState(false);
  const [recapCategories, setRecapCategories] = useState<RecapCategory[]>([]);
  const [recapLoading, setRecapLoading] = useState(false);
  // 0 = panneau fermé, 1 = ouvert ; pilote à la fois le panneau et le décalage de l'arbre.
  const [panelAnim] = useState(() => new Animated.Value(0));

  const [newPersonKind, setNewPersonKind] = useState<NewPersonKind | null>(null);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newGender, setNewGender] = useState<"homme" | "femme" | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkKind, setLinkKind] = useState<LinkKind>("spouse");
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ---------- Chargement ----------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        if (!cancelled) setNoSession(true);
        return;
      }

      const myFamilies = await listMyFamilies(userId);
      const current = await resolveMyFamily(userId, myFamilies, paramFamily);
      if (!current || cancelled) return;
      setFamilyId(current.familyId);

      const [{ data: personsData }, { data: relsData }, { data: factsData }] = await Promise.all([
        supabase
          .from("persons")
          .select("id, first_name, display_name, is_central, gender")
          .eq("family_id", current.familyId)
          .order("created_at", { ascending: true }),
        supabase.from("relationships").select("id, person_a_id, person_b_id, relation_type").eq("family_id", current.familyId),
        supabase.from("facts").select("id, subject_person_id").eq("family_id", current.familyId).eq("status", "active"),
      ]);

      // Statut de chaque fait : révélé (session clôturée), posé (session en cours) ou pas encore posé.
      const facts = factsData ?? [];
      const statusByFact = new Map<string, "open" | "revealed">();
      if (facts.length) {
        const { data: posed } = await supabase
          .from("quiz_questions")
          .select("fact_id, quiz_sessions (status)")
          .in(
            "fact_id",
            facts.map((f) => f.id),
          );
        for (const row of posed ?? []) {
          const status = (row.quiz_sessions as unknown as { status: string } | null)?.status;
          if (status === "closed") statusByFact.set(row.fact_id, "revealed");
          else if (!statusByFact.has(row.fact_id)) statusByFact.set(row.fact_id, "open");
        }
      }
      const byPerson = new Map<string, FactCounts>();
      for (const f of facts) {
        const c = byPerson.get(f.subject_person_id) ?? { revealed: 0, toDiscover: 0 };
        const st = statusByFact.get(f.id);
        if (st === "revealed") c.revealed += 1;
        else if (!st) c.toDiscover += 1;
        byPerson.set(f.subject_person_id, c);
      }

      const stored = await AsyncStorage.getItem(`quizamily:treeFocus:${current.familyId}`).catch(() => null);
      if (cancelled) return;
      setPersons((personsData ?? []) as Person[]);
      setRelationships((relsData ?? []) as Relationship[]);
      setCounts(byPerson);
      // Venant d'un profil de l'accueil : centré sur la personne (et récapitulatif ouvert,
      // sans animation) ; sinon, dernière personne centrée sur cet appareil.
      if (paramPerson) setFocusId(paramPerson);
      else if (stored) setFocusId(stored);
      if (paramPerson && paramRecap) {
        panelAnim.setValue(1);
        setShowPanel(true);
      }
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
    // Paramètres lus une seule fois, à l'ouverture de l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Arbre et placement ----------

  const layout = useMemo(() => {
    const tree = buildFamilyTree(
      persons.map((p) => ({ id: p.id, isCentral: p.is_central })),
      relationships.map((r) => ({ personA: r.person_a_id, personB: r.person_b_id, type: r.relation_type })),
    );
    return layoutFamilyTree(tree);
  }, [persons, relationships]);

  const personsById = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);
  const tree = layout.tree;
  const focus = focusId && tree.unitOfPerson[focusId] ? focusId : tree.rootPersonId;
  const centerX = width / 2;
  const offsets = focus ? rowOffsetsFor(layout, focus, centerX) : null;
  const g = offsets?.focusGeneration ?? 0;

  useEffect(() => {
    if (familyId && focus) AsyncStorage.setItem(`quizamily:treeFocus:${familyId}`, focus).catch(() => {});
  }, [familyId, focus]);

  // Récapitulatif (écran 11) de la personne affichée dans le panneau : get_archive_summary
  // renvoie les faits révélés (category/recap/relatedName/slotValues), assemblés en phrases
  // par src/lib/recap.ts plutôt qu'affichés comme une liste de questions/réponses.
  useEffect(() => {
    if (!showPanel || editMode || !focus) return;
    let cancelled = false;

    async function loadRecap() {
      setRecapLoading(true);
      const { data, error: rpcError } = await supabase.rpc("get_archive_summary", { p_person_id: focus! });
      if (cancelled) return;
      if (rpcError) {
        setRecapCategories([]);
        setRecapLoading(false);
        return;
      }
      const rows =
        (data as
          | {
              category: string;
              recap: string | null;
              relatedRole: string | null;
              answerInputKind: string;
              answer: string | number;
              relatedName: string | null;
              slotValues: Record<string, string> | null;
            }[]
          | null) ?? [];
      const facts: RecapFact[] = rows.map((r) => ({
        category: r.category,
        recap: r.recap,
        relatedRole: r.relatedRole,
        answerInputKind: r.answerInputKind,
        answer: r.answer,
        relatedName: r.relatedName,
        slotValues: r.slotValues,
      }));
      const person = personsById.get(focus!);
      setRecapCategories(buildRecapByCategory(facts, person?.gender ?? null, person?.first_name ?? ""));
      setRecapLoading(false);
    }

    loadRecap();
    return () => {
      cancelled = true;
    };
  }, [showPanel, editMode, focus, personsById]);

  function openPanel() {
    setShowPanel(true);
    Animated.timing(panelAnim, { toValue: 1, duration: PANEL_DURATION_MS, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }

  function closePanel(immediate = false) {
    if (immediate) {
      panelAnim.setValue(0);
      setShowPanel(false);
      return;
    }
    Animated.timing(panelAnim, { toValue: 0, duration: PANEL_DURATION_MS, useNativeDriver: USE_NATIVE_DRIVER }).start(
      ({ finished }) => {
        if (finished) setShowPanel(false);
      },
    );
  }

  // Profil de l'accueil qui n'est pas (encore) placé dans l'arbre (personne sans relation) :
  // l'arbre retombe sur sa personne de départ, on n'ouvre donc pas le récapitulatif d'un autre.
  useEffect(() => {
    function closeIfOrphanProfile() {
      if (ready && paramPerson && !tree.unitOfPerson[paramPerson] && focusId === paramPerson) {
        panelAnim.setValue(0);
        setShowPanel(false);
      }
    }
    closeIfOrphanProfile();
  }, [ready, paramPerson, tree, focusId, panelAnim]);

  const treeShift = useMemo(
    () => panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, PANEL_SHIFT] }),
    [panelAnim],
  );
  const panelTranslate = useMemo(
    () => panelAnim.interpolate({ inputRange: [0, 1], outputRange: [PANEL_HIDDEN_Y, 0] }),
    [panelAnim],
  );

  const rows = useMemo(() => {
    const list: (RowGeometry & { isCenter: boolean })[] = [];
    if (!offsets) return list;
    if (g > 0) list.push({ generation: g - 1, ...ROW_UP, isCenter: false });
    list.push({ generation: g, ...ROW_CENTER, isCenter: true });
    if (g + 1 < tree.generations.length) list.push({ generation: g + 1, ...ROW_DOWN, isCenter: false });
    return list;
  }, [offsets, g, tree.generations.length]);

  const segments = useMemo(
    () => (offsets ? connectorSegments(layout, rows, offsets.offsets) : []),
    [layout, rows, offsets],
  );

  // ---------- Glissement avec crans ----------

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const axis = useRef<"x" | "y" | null>(null);
  const pendingStart = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef({ layout, focus, centerX, panelOpen: showPanel });
  useEffect(() => {
    latest.current = { layout, focus, centerX, panelOpen: showPanel };
  });

  const settle = () => {
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: USE_NATIVE_DRIVER, bounciness: 4 }).start();
  };

  // Après un changement de personne centrée, on repart de la position où était le contenu
  // sous le doigt, puis on glisse jusqu'au cran (pas de saut).
  useLayoutEffect(() => {
    if (!pendingStart.current) return;
    pan.setValue(pendingStart.current);
    pendingStart.current = null;
    settle();
  });

  const panResponder = useMemo(
    () =>
      // pan vient de useRef(...).current : l'API Animated de React Native est conçue pour être lue/mutée hors du cycle de rendu React.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        // Un toucher bref reste un appui sur la carte ; dès que le doigt glisse, l'arbre
        // prend la main (y compris quand le geste commence sur une carte).
        onMoveShouldSetPanResponder: (_e, gs) => Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8,
        onMoveShouldSetPanResponderCapture: (_e, gs) => Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8,
        onPanResponderGrant: () => {
          axis.current = null;
        },
        onPanResponderMove: (_e, gs) => {
          if (!axis.current) axis.current = Math.abs(gs.dx) > Math.abs(gs.dy) ? "x" : "y";
          // Panneau ouvert : pas de changement de génération, l'arbre ne suit pas le doigt
          // verticalement (il faut d'abord fermer le panneau).
          if (axis.current === "y" && latest.current.panelOpen) return;
          pan.setValue(axis.current === "x" ? { x: gs.dx, y: 0 } : { x: 0, y: gs.dy });
        },
        onPanResponderRelease: (_e, gs) => {
          const { layout: lay, focus: current, centerX: cx } = latest.current;
          if (!current) return settle();
          const before = rowOffsetsFor(lay, current, cx);
          if (!before) return settle();

          if (axis.current === "x") {
            if (Math.abs(gs.dx) < SWIPE_X) return settle();
            const steps = Math.max(1, Math.round(Math.abs(gs.dx) / SLOT));
            let next = current;
            for (let i = 0; i < steps; i++) next = moveFocus(lay, next, gs.dx < 0 ? "right" : "left");
            if (next === current) return settle();
            const after = rowOffsetsFor(lay, next, cx);
            if (!after) return settle();
            const gen = before.focusGeneration;
            pendingStart.current = { x: before.offsets[gen] + gs.dx - after.offsets[gen], y: 0 };
            setFocusId(next);
            return;
          }

          if (latest.current.panelOpen || Math.abs(gs.dy) < SWIPE_Y) return settle();
          const move = gs.dy < 0 ? "down" : "up";
          const next = moveFocus(lay, current, move, cx);
          if (next === current) return settle();
          const after = rowOffsetsFor(lay, next, cx);
          if (!after) return settle();
          const gen = after.focusGeneration;
          const oldX = before.offsets[gen] ?? after.offsets[gen];
          const rowShift = move === "down" ? ROW_DOWN.top - ROW_CENTER.top : ROW_UP.top - ROW_CENTER.top;
          pendingStart.current = { x: oldX - after.offsets[gen], y: rowShift + gs.dy };
          setFocusId(next);
        },
        onPanResponderTerminate: () => settle(),
      }),
    // pan et latest sont des refs stables ; settle ne dépend que de pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------- Modifications ----------

  function spouseOf(personId: string): string | null {
    const rel = relationships.find(
      (r) => r.relation_type === "spouse_of" && (r.person_a_id === personId || r.person_b_id === personId),
    );
    if (!rel) return null;
    return rel.person_a_id === personId ? rel.person_b_id : rel.person_a_id;
  }

  function relationshipExists(a: string, b: string, type: RelationType): boolean {
    const symmetric = type !== "parent_of";
    return relationships.some(
      (r) =>
        r.relation_type === type &&
        ((r.person_a_id === a && r.person_b_id === b) || (symmetric && r.person_a_id === b && r.person_b_id === a)),
    );
  }

  function closeForms() {
    setNewPersonKind(null);
    setNewFirstName("");
    setNewLastName("");
    setNewGender(null);
    setShowLinkForm(false);
    setLinkKind("spouse");
    setLinkTargetId(null);
    setError("");
  }

  async function insertRelations(newRels: { person_a_id: string; person_b_id: string; relation_type: RelationType }[]) {
    if (!familyId || !newRels.length) return true;
    const { data, error: insertError } = await supabase
      .from("relationships")
      .insert(newRels.map((r) => ({ family_id: familyId, ...r })))
      .select("id, person_a_id, person_b_id, relation_type");
    if (insertError) {
      setError(insertError.message);
      return false;
    }
    setRelationships((prev) => [...prev, ...((data ?? []) as Relationship[])]);
    return true;
  }

  async function createRelatedPerson() {
    if (!familyId || !focus || !newPersonKind || newFirstName.trim().length === 0) return;
    setSaving(true);
    setError("");
    const { data: created, error: insertError } = await supabase
      .from("persons")
      .insert({
        family_id: familyId,
        kind: "profile",
        first_name: newFirstName.trim(),
        last_name: newLastName.trim(),
        gender: newGender,
        is_central: false,
        is_deceased: false,
      })
      .select("id, first_name, display_name, is_central, gender")
      .single();
    if (insertError || !created) {
      setError(insertError?.message ?? "Création impossible.");
      setSaving(false);
      return;
    }
    setPersons((prev) => [...prev, created as Person]);

    const unit = tree.units[tree.unitOfPerson[focus]];
    let rels: { person_a_id: string; person_b_id: string; relation_type: RelationType }[] = [];
    if (newPersonKind === "spouse") {
      rels = [{ person_a_id: focus, person_b_id: created.id, relation_type: "spouse_of" }];
    } else if (newPersonKind === "child") {
      rels = unit.members.map((m) => ({ person_a_id: m, person_b_id: created.id, relation_type: "parent_of" as const }));
    } else {
      const parentUnit = unit.parentUnitId ? tree.units[unit.parentUnitId] : null;
      rels = parentUnit
        ? parentUnit.members.map((m) => ({ person_a_id: m, person_b_id: created.id, relation_type: "parent_of" as const }))
        : [{ person_a_id: focus, person_b_id: created.id, relation_type: "sibling_of" }];
    }
    const ok = await insertRelations(rels);
    setSaving(false);
    if (ok) closeForms();
  }

  async function linkExistingPerson() {
    if (!focus || !linkTargetId) return;
    if (focus === linkTargetId) {
      setError("Les deux personnes doivent être différentes.");
      return;
    }
    const rel =
      linkKind === "spouse"
        ? { person_a_id: focus, person_b_id: linkTargetId, relation_type: "spouse_of" as const }
        : linkKind === "parent"
          ? { person_a_id: focus, person_b_id: linkTargetId, relation_type: "parent_of" as const }
          : linkKind === "child"
            ? { person_a_id: linkTargetId, person_b_id: focus, relation_type: "parent_of" as const }
            : { person_a_id: focus, person_b_id: linkTargetId, relation_type: "sibling_of" as const };
    if (relationshipExists(rel.person_a_id, rel.person_b_id, rel.relation_type)) {
      setError("Cette relation existe déjà.");
      return;
    }
    if (linkKind === "spouse" && (spouseOf(focus) || spouseOf(linkTargetId))) {
      setError("L'une de ces deux personnes a déjà un·e conjoint·e enregistré·e (un seul conjoint par personne pour l'instant).");
      return;
    }
    setSaving(true);
    setError("");
    const ok = await insertRelations([rel]);
    setSaving(false);
    if (ok) closeForms();
  }

  function openPerson(personId: string) {
    if (editMode) {
      closeForms();
      setFocusId(personId);
      return;
    }
    // Pas de navigation : l'arbre se recentre sur la personne touchée et le panneau monte du
    // bas de l'écran (voir docs/ecrans.md écran 10/11).
    setFocusId(personId);
    openPanel();
  }

  // ---------- Rendu ----------

  if (noSession) return <Redirect href="/" />;


  if (!ready) {
    return (
      <View style={[styles.screen, sunsetBackground, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={S.action} />
      </View>
    );
  }

  const unlinked = tree.unlinkedPersonIds.map((id) => personsById.get(id)).filter((p): p is Person => !!p);
  const focusPerson = focus ? personsById.get(focus) : undefined;
  const focusUnit = focus ? tree.units[tree.unitOfPerson[focus]] : undefined;
  const focusHasSpouse = !!focus && !!spouseOf(focus);
  // Un conjoint (« pièce rapportée », 2e membre du couple) n'a pas d'ascendance dans cette
  // famille : on ne lui ajoute pas de frère ou sœur.
  const focusIsInLaw = !!focusUnit && focusUnit.members[1] === focus;
  const focusCounts = focus ? counts.get(focus) : undefined;

  return (
    <View style={[styles.screen, sunsetBackground]}>
      <View style={styles.titleBar}>
        <Pressable accessibilityLabel="Retour à l'accueil" onPress={() => router.replace("/home")} style={styles.iconButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{editMode ? "Modifier l'arbre" : "Connaissances"}</Text>
        <View style={{ flex: 1 }} />
        {editMode ? (
          <Pressable
            onPress={() => {
              closeForms();
              setEditMode(false);
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Terminé</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              closePanel(true);
              setEditMode(true);
            }}
            style={styles.glassButton}
          >
            <Text style={styles.glassButtonText}>✎ Modifier</Text>
          </Pressable>
        )}
      </View>

      {!editMode && unlinked.length > 0 && (
        <Pressable
          onPress={() => {
            closePanel(true);
            setEditMode(true);
          }}
          style={styles.alertChip}
        >
          <Text style={styles.alertChipText}>
            ⚠ {unlinked.length === 1 ? "1 personne sans relation" : `${unlinked.length} personnes sans relation`}
          </Text>
        </Pressable>
      )}

      <View style={{ flex: 1 }}>
        {!focus ? (
          <View style={styles.empty}>
            <Text style={styles.hintStrong}>Aucune personne dans la famille pour l&apos;instant.</Text>
          </View>
        ) : (
          <View
            style={styles.treeArea}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            {...panResponder.panHandlers}
          >
            {/* Bande de la génération centrée : pleine largeur, sans arrondis (avec des
                arrondis, on croyait à une sélection). Elle remonte avec l'arbre. */}
            <Animated.View style={[styles.centerBand, { transform: [{ translateY: treeShift }] }]} />
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                // eslint-disable-next-line react-hooks/refs -- pan est un Animated.ValueXY stable, lu hors du rendu réactif par design.
                { transform: [...pan.getTranslateTransform(), { translateY: treeShift }] },
              ]}
            >
              {g === 0 && !showPanel && <Text style={styles.topLabel}>Haut de l&apos;arbre : les ancêtres communs</Text>}
              {segments.map((s, i) => (
                <View
                  key={`s${i}`}
                  pointerEvents="none"
                  style={{ position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h, backgroundColor: S.line }}
                />
              ))}
              {rows.map((row) => {
                const off = offsets?.offsets[row.generation] ?? 0;
                return (tree.generations[row.generation] ?? []).flatMap((unitId) =>
                  tree.units[unitId].members.map((personId) => {
                    const left = layout.personX[personId] + off;
                    if (left > width + SLOT * 4 || left < -SLOT * 5) return null;
                    const p = personsById.get(personId);
                    if (!p) return null;
                    const c = counts.get(personId) ?? { revealed: 0, toDiscover: 0 };
                    const isFocus = personId === focus;
                    return (
                      <Pressable
                        key={personId}
                        accessibilityLabel={editMode ? `${p.first_name}, sélectionner` : `${p.first_name}, voir ses souvenirs`}
                        onPress={() => openPerson(personId)}
                        style={[styles.card, { left, top: row.top, width: SLOT, gap: row.isCenter ? 5 : 3 }]}
                      >
                        <PersonAvatar
                          personId={personId}
                          firstName={p.first_name}
                          size={row.avatar}
                          isCentral={p.is_central}
                          focused={isFocus}
                        >
                          {editMode && (
                            <View style={styles.editBadge}>
                              <Text style={styles.editBadgeText}>✎</Text>
                            </View>
                          )}
                        </PersonAvatar>
                        <Text numberOfLines={1} style={[styles.cardName, { fontSize: row.isCenter ? 18 : 14 }]}>
                          {p.first_name}
                        </Text>
                        <Text numberOfLines={1} style={[styles.cardCount, { fontSize: row.isCenter ? 13 : 11 }]}>
                          {souvenirsLabel(c.revealed)}
                        </Text>
                        {row.isCenter && c.toDiscover > 0 && (
                          <View style={styles.discoverPill}>
                            <Text style={styles.discoverPillText}>{c.toDiscover} à découvrir</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  }),
                );
              })}
            </Animated.View>
            {!showPanel && (
              <View pointerEvents="none" style={styles.genDots}>
                {tree.generations.map((_, k) => (
                  <View
                    key={`g${k}`}
                    style={{
                      width: k === g ? 11 : 8,
                      height: k === g ? 11 : 8,
                      borderRadius: 6,
                      backgroundColor: k === g ? S.action : "rgba(255,248,238,0.8)",
                    }}
                  />
                ))}
              </View>
            )}
            {/* Panneau ouvert : toucher l'arbre le ferme ; les glissements horizontaux restent
                captés par l'arbre (panResponder, phase de capture) et changent de personne. */}
            {showPanel && (
              <Pressable
                accessibilityLabel="Fermer les souvenirs"
                onPress={() => closePanel()}
                style={[StyleSheet.absoluteFill, { zIndex: 2 }]}
              />
            )}
          </View>
        )}

        {!editMode && focus && !showPanel && (
          <View style={styles.hints}>
            <Text style={styles.hintStrong}>Touche une personne pour lire ses souvenirs</Text>
            <Text style={styles.hint}>
              Glisse à gauche ou à droite pour parcourir une génération, vers le haut ou le bas pour changer de génération
            </Text>
          </View>
        )}

        {!editMode && showPanel && focus && focusPerson && (
          <Animated.View style={[styles.panel, { transform: [{ translateY: panelTranslate }] }]}>
            <View style={styles.panelHandle} />
            <View style={styles.panelHeader}>
              <PersonAvatar personId={focus} firstName={focusPerson.first_name} size={50} isCentral={focusPerson.is_central} />
              <View style={{ flex: 1 }}>
                <Text style={styles.panelHeaderName} numberOfLines={1}>
                  {focusPerson.display_name}
                </Text>
                <Text style={styles.panelHeaderSub}>{souvenirsLabel(focusCounts?.revealed ?? 0)}</Text>
              </View>
              <Pressable accessibilityLabel="Fermer" onPress={() => closePanel()} style={styles.closeButton}>
                <Text style={styles.closeIcon}>✕</Text>
              </Pressable>
            </View>
            {/* Le texte défile quand la personne a beaucoup de souvenirs. */}
            <ScrollView contentContainerStyle={styles.panelContent}>
              {recapLoading ? (
                <ActivityIndicator color={S.action} />
              ) : recapCategories.length === 0 ? (
                <Text style={styles.recapEmpty}>Aucun souvenir révélé pour l&apos;instant.</Text>
              ) : (
                recapCategories.map((cat) => (
                  <View key={cat.category} style={{ gap: 4 }}>
                    <Text style={styles.recapCategoryLabel}>{cat.label}</Text>
                    <Text style={styles.recapText}>{cat.text}</Text>
                  </View>
                ))
              )}
              {!recapLoading && (focusCounts?.toDiscover ?? 0) > 0 && (
                <View style={styles.recapDiscover}>
                  <Text style={styles.recapDiscoverText}>
                    {focusCounts!.toDiscover} souvenir{focusCounts!.toDiscover === 1 ? "" : "s"} à découvrir dans les
                    prochains quiz
                  </Text>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        )}
      </View>

      {editMode && (
        <ScrollView style={styles.editPanel} contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
          {focusPerson && focusUnit && !newPersonKind && !showLinkForm && (
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>Pour {focusPerson.first_name} :</Text>
              <View style={styles.chipsRow}>
                {!focusHasSpouse && (
                  <Pressable onPress={() => setNewPersonKind("spouse")} style={styles.addChip}>
                    <Text style={styles.addChipText}>+ Conjoint·e</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setNewPersonKind("child")} style={styles.addChip}>
                  <Text style={styles.addChipText}>+ Enfant</Text>
                </Pressable>
                {!focusIsInLaw && (
                  <Pressable onPress={() => setNewPersonKind("sibling")} style={styles.addChip}>
                    <Text style={styles.addChipText}>+ Frère ou sœur</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setShowLinkForm(true)} style={styles.addChip}>
                  <Text style={styles.addChipText}>Relier à une personne…</Text>
                </Pressable>
              </View>
              <Text style={styles.hintOnCream}>Touche une autre personne de l&apos;arbre pour la sélectionner.</Text>
            </View>
          )}

          {newPersonKind && focusPerson && (
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>
                {newPersonKind === "spouse"
                  ? `Conjoint·e de ${focusPerson.first_name}`
                  : newPersonKind === "child"
                    ? `Enfant de ${focusUnit?.members.map((m) => personsById.get(m)?.first_name ?? "?").join(" et ")}`
                    : `Frère ou sœur de ${focusPerson.first_name}`}
              </Text>
              <TextInput value={newFirstName} onChangeText={setNewFirstName} placeholder="Prénom" style={styles.input} />
              <TextInput
                value={newLastName}
                onChangeText={setNewLastName}
                placeholder="Nom (facultatif)"
                style={styles.input}
              />
              <View style={styles.chipsRow}>
                {(["homme", "femme"] as const).map((gender) => (
                  <Pressable
                    key={gender}
                    onPress={() => setNewGender(gender)}
                    style={[styles.chip, newGender === gender && styles.chipSelected]}
                  >
                    <Text style={newGender === gender ? styles.chipSelectedText : styles.chipText}>
                      {gender === "homme" ? "Homme" : "Femme"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}
              <View style={styles.chipsRow}>
                <Pressable
                  onPress={createRelatedPerson}
                  disabled={saving || newFirstName.trim().length === 0}
                  style={[styles.primaryButton, (saving || newFirstName.trim().length === 0) && { opacity: 0.5 }]}
                >
                  <Text style={styles.primaryButtonText}>{saving ? "Enregistrement…" : "Enregistrer"}</Text>
                </Pressable>
                <Pressable onPress={closeForms} style={styles.outlineButton}>
                  <Text style={styles.outlineButtonText}>Annuler</Text>
                </Pressable>
              </View>
            </View>
          )}

          {showLinkForm && focusPerson && (
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>{focusPerson.first_name} est…</Text>
              <View style={styles.chipsRow}>
                {(
                  [
                    ["spouse", "Conjoint·e de"],
                    ["parent", "Parent de"],
                    ["child", "Enfant de"],
                    ["sibling", "Frère ou sœur de"],
                  ] as const
                ).map(([kind, label]) => (
                  <Pressable
                    key={kind}
                    onPress={() => setLinkKind(kind)}
                    style={[styles.chip, linkKind === kind && styles.chipSelected]}
                  >
                    <Text style={linkKind === kind ? styles.chipSelectedText : styles.chipText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hintOnCream}>Choisis l&apos;autre personne :</Text>
              <View style={styles.chipsRow}>
                {[...unlinked, ...persons.filter((p) => !tree.unlinkedPersonIds.includes(p.id))]
                  .filter((p) => p.id !== focus)
                  .map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setLinkTargetId(p.id)}
                      style={[styles.chip, linkTargetId === p.id && styles.chipSelected]}
                    >
                      <Text style={linkTargetId === p.id ? styles.chipSelectedText : styles.chipText}>
                        {p.display_name}
                        {tree.unlinkedPersonIds.includes(p.id) ? " ⚠" : ""}
                      </Text>
                    </Pressable>
                  ))}
              </View>
              {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}
              <View style={styles.chipsRow}>
                <Pressable
                  onPress={linkExistingPerson}
                  disabled={saving || !linkTargetId}
                  style={[styles.primaryButton, (saving || !linkTargetId) && { opacity: 0.5 }]}
                >
                  <Text style={styles.primaryButtonText}>{saving ? "Enregistrement…" : "Relier"}</Text>
                </Pressable>
                <Pressable onPress={closeForms} style={styles.outlineButton}>
                  <Text style={styles.outlineButtonText}>Annuler</Text>
                </Pressable>
              </View>
            </View>
          )}

          {unlinked.length > 0 && !newPersonKind && (
            <View style={styles.panelCard}>
              <Text style={styles.alertTitle}>⚠ À placer dans l&apos;arbre ({unlinked.length})</Text>
              <Text style={styles.hintOnCream}>
                Ces personnes n&apos;ont pas encore de relation avec l&apos;arbre : sélectionne une personne de l&apos;arbre,
                puis touche un nom pour la relier.
              </Text>
              <View style={styles.chipsRow}>
                {unlinked.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setShowLinkForm(true);
                      setLinkTargetId(p.id);
                    }}
                    style={styles.chip}
                  >
                    <Text style={styles.chipText}>{p.display_name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  titleBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingTop: 14, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backChevron: { fontSize: 34, lineHeight: 36, color: S.ink },
  title: { fontFamily: FONTS.title, fontSize: 25, color: S.ink },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: RADIUS.pill,
    backgroundColor: S.action,
    alignItems: "center",
    justifyContent: "center",
    ...solidShadow(S.actionShadow, 4),
  },
  primaryButtonText: { color: S.white, fontFamily: FONTS.bodyHeavy, fontSize: 15 },
  glassButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: S.glassBorder,
    backgroundColor: "rgba(255,248,238,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  glassButtonText: { color: S.actionShadow, fontFamily: FONTS.bodyHeavy, fontSize: 15 },
  outlineButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: S.action,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: { color: S.action, fontFamily: FONTS.bodyHeavy, fontSize: 15 },
  alertChip: {
    alignSelf: "flex-start",
    marginLeft: 16,
    marginTop: 4,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: S.alertBg,
    justifyContent: "center",
    ...solidShadow("rgba(138,58,18,0.18)", 3),
  },
  alertChipText: { color: S.alertInk, fontFamily: FONTS.bodyHeavy, fontSize: 14 },
  treeArea: { height: AREA_HEIGHT, overflow: "hidden", marginTop: TREE_MARGIN_TOP },
  centerBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ROW_CENTER.top - 16,
    height: ROW_CENTER.height + 30,
    backgroundColor: "rgba(255,244,232,0.45)",
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: S.glassBorder,
  },
  topLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ROW_UP.top + 28,
    textAlign: "center",
    fontSize: 14,
    fontFamily: FONTS.bodyBold,
    color: S.inkOnGround,
  },
  card: { position: "absolute", alignItems: "center" },
  cardName: { fontFamily: FONTS.title, color: S.ink, lineHeight: 21 },
  cardCount: { fontFamily: FONTS.bodyBold, color: S.inkOnGround },
  editBadge: {
    position: "absolute",
    right: -6,
    top: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: S.action,
    borderWidth: 2,
    borderColor: S.white,
    alignItems: "center",
    justifyContent: "center",
  },
  editBadgeText: { color: S.white, fontSize: 12, lineHeight: 14 },
  // Petite pastille : deux pastilles voisines (couple) ne doivent pas se toucher.
  discoverPill: { marginTop: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: S.waiting },
  discoverPillText: { color: S.waitingSoft, fontSize: 11, fontFamily: FONTS.bodyHeavy },
  genDots: { position: "absolute", right: 10, top: ROW_CENTER.top + 20, alignItems: "center", gap: 8 },
  hints: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.tile,
    borderWidth: 2,
    borderColor: S.glassBorder,
    backgroundColor: S.glass,
    alignItems: "center",
    gap: 4,
  },
  hintStrong: { fontSize: 15, fontFamily: FONTS.bodyHeavy, color: S.ink, textAlign: "center" },
  hint: { fontSize: 13, fontFamily: FONTS.bodySemi, color: S.inkOnGround, textAlign: "center" },
  hintOnCream: { fontSize: 13, fontFamily: FONTS.bodySemi, color: S.inkSoft },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },

  // ---------- Panneau du récapitulatif (monte du bas) ----------
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    top: PANEL_TOP,
    bottom: 0,
    zIndex: 4,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    backgroundColor: S.cream,
    boxShadow: "0px -6px 24px rgba(94,38,11,0.22)",
  },
  panelHandle: { alignSelf: "center", width: 44, height: 5, marginTop: 10, borderRadius: 3, backgroundColor: "#E3C9B0" },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 20,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 10,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  panelHeaderName: { fontFamily: FONTS.title, fontSize: 24, color: S.ink },
  panelHeaderSub: { fontFamily: FONTS.bodyBold, fontSize: 14, color: S.inkSoft },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: S.creamStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: { fontSize: 18, color: S.action, fontFamily: FONTS.bodyHeavy },
  panelContent: { gap: 14, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, width: "100%", maxWidth: 640, alignSelf: "center" },
  recapCategoryLabel: {
    fontSize: 13,
    fontFamily: FONTS.bodyHeavy,
    color: S.action,
    textTransform: "uppercase",
    letterSpacing: 0.78,
  },
  recapText: { fontSize: 16, lineHeight: 23, fontFamily: FONTS.body, color: S.ink },
  recapEmpty: { fontSize: 15, fontFamily: FONTS.bodySemi, color: S.inkSoft },
  recapDiscover: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: S.waiting,
  },
  recapDiscoverText: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.waitingSoft },

  // ---------- Mode Modifier ----------
  editPanel: { flex: 1, paddingHorizontal: 16 },
  panelCard: {
    gap: 10,
    padding: 16,
    borderRadius: 28,
    backgroundColor: S.cream,
    ...solidShadow(undefined, 6),
  },
  panelTitle: { fontSize: 16, fontFamily: FONTS.bodyHeavy, color: S.ink },
  alertTitle: { fontSize: 14, fontFamily: FONTS.bodyHeavy, color: S.alertInk },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 2,
    borderColor: "#EAD9BD",
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: S.white,
  },
  chipSelected: { backgroundColor: S.action, borderColor: S.action },
  chipText: { color: S.ink, fontSize: 14, fontFamily: FONTS.bodyBold },
  chipSelectedText: { color: S.white, fontSize: 14, fontFamily: FONTS.bodyHeavy },
  addChip: {
    borderWidth: 2,
    borderColor: S.action,
    borderStyle: "dashed",
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addChipText: { color: S.action, fontSize: 14, fontFamily: FONTS.bodyHeavy },
  input: {
    borderWidth: 2,
    borderColor: "#EAD9BD",
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    fontFamily: FONTS.body,
    color: S.ink,
    backgroundColor: S.white,
  },
  errorText: { color: S.alertInk, fontSize: 14, fontFamily: FONTS.bodyBold },
});
