// Arbre familial (écran 10, voir docs/ecrans.md et docs/design.md).
//
// Consultation : 3 lignes visibles (génération centrée, précédente au-dessus, suivante en
// dessous), glissement horizontal et vertical avec crans, traits à angle droit, compteurs de
// souvenirs. Toucher une personne ouvre ses souvenirs (archives, en attendant le
// récapitulatif de l'écran 11).
// Modifier : toucher une personne la sélectionne ; boutons pour lui ajouter un conjoint, un
// enfant, un frère ou une sœur, ou la relier à une personne existante (dont les personnes
// sans relation, qui ne sont pas affichées dans l'arbre).
//
// Le placement est calculé par src/lib/family-tree-layout.ts (testé à part).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router } from "expo-router";
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

import { ThemedView } from "@/components/themed-view";
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
import { supabase } from "@/lib/supabase";

type Person = {
  id: string;
  first_name: string;
  display_name: string;
  is_central: boolean;
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

// Charte (docs/design.md).
const C = {
  ground: "#FFFBF6",
  surface: "#FFFFFF",
  ink: "#1B1F3B",
  inkSoft: "#5B5F73",
  border: "#E2DACE",
  borderSoft: "#EDE6DC",
  blue: "#2347C5",
  blueTint: "#E7ECFB",
  redDark: "#A81E2C",
  redTint: "#FDE8EA",
  line: "#AEBBE3",
};
const AVATAR_COLORS = [
  { bg: "#E7ECFB", fg: "#2347C5" },
  { bg: "#FDE8EA", fg: "#A81E2C" },
  { bg: "#FFF1D6", fg: "#7A4F00" },
  { bg: "#E3F4EC", fg: "#1E6B45" },
];

const SLOT = DEFAULT_METRICS.slot;
// Lignes de l'arbre, en coordonnées de la zone de l'arbre.
const ROW_UP = { top: 24, height: 82, avatar: 46 };
const ROW_CENTER = { top: 196, height: 124, avatar: 60 };
const ROW_DOWN = { top: 410, height: 82, avatar: 46 };
const AREA_HEIGHT = 520;
const SWIPE_X = 30;
const SWIPE_Y = 40;
const USE_NATIVE_DRIVER = Platform.OS !== "web";

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function souvenirsLabel(n: number): string {
  if (n === 0) return "Aucun souvenir";
  return n === 1 ? "1 souvenir" : `${n} souvenirs`;
}

export default function FamilyTreeScreen() {
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

      const { data: me } = await supabase
        .from("persons")
        .select("family_id")
        .eq("user_id", userId)
        .eq("kind", "player")
        .limit(1)
        .maybeSingle();
      if (!me || cancelled) return;
      setFamilyId(me.family_id);

      const [{ data: personsData }, { data: relsData }, { data: factsData }] = await Promise.all([
        supabase
          .from("persons")
          .select("id, first_name, display_name, is_central")
          .eq("family_id", me.family_id)
          .order("created_at", { ascending: true }),
        supabase.from("relationships").select("id, person_a_id, person_b_id, relation_type").eq("family_id", me.family_id),
        supabase.from("facts").select("id, subject_person_id").eq("family_id", me.family_id).eq("status", "active"),
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

      const stored = await AsyncStorage.getItem(`quizamily:treeFocus:${me.family_id}`).catch(() => null);
      if (cancelled) return;
      setPersons((personsData ?? []) as Person[]);
      setRelationships((relsData ?? []) as Relationship[]);
      setCounts(byPerson);
      if (stored) setFocusId(stored);
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
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
  const latest = useRef({ layout, focus, centerX });
  useEffect(() => {
    latest.current = { layout, focus, centerX };
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

          if (Math.abs(gs.dy) < SWIPE_Y) return settle();
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
      .select("id, first_name, display_name, is_central")
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
    router.push({ pathname: "/archive", params: { personId } });
  }

  // ---------- Rendu ----------

  if (noSession) return <Redirect href="/" />;

  if (!ready) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const unlinked = tree.unlinkedPersonIds.map((id) => personsById.get(id)).filter((p): p is Person => !!p);
  const focusPerson = focus ? personsById.get(focus) : undefined;
  const focusUnit = focus ? tree.units[tree.unitOfPerson[focus]] : undefined;
  const focusHasSpouse = !!focus && !!spouseOf(focus);
  // Un conjoint (« pièce rapportée », 2e membre du couple) n'a pas d'ascendance dans cette
  // famille : on ne lui ajoute pas de frère ou sœur.
  const focusIsInLaw = !!focusUnit && focusUnit.members[1] === focus;

  return (
    <View style={styles.screen}>
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
          <Pressable onPress={() => setEditMode(true)} style={styles.outlineButton}>
            <Text style={styles.outlineButtonText}>Modifier</Text>
          </Pressable>
        )}
      </View>

      {!editMode && unlinked.length > 0 && (
        <Pressable onPress={() => setEditMode(true)} style={styles.alertChip}>
          <Text style={styles.alertChipText}>
            ⚠ {unlinked.length === 1 ? "1 personne sans relation" : `${unlinked.length} personnes sans relation`}
          </Text>
        </Pressable>
      )}

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
          <View style={styles.centerBand} />
          {/* eslint-disable-next-line react-hooks/refs -- idem : pan est un Animated.ValueXY stable, lu hors du rendu réactif par design. */}
          <Animated.View style={[StyleSheet.absoluteFill, { transform: pan.getTranslateTransform() }]}>
            {g === 0 && <Text style={styles.topLabel}>Haut de l&apos;arbre : les ancêtres communs</Text>}
            {segments.map((s, i) => (
              <View
                key={`s${i}`}
                pointerEvents="none"
                style={{ position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h, backgroundColor: C.line }}
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
                  const col = colorFor(personId);
                  const isFocus = personId === focus;
                  return (
                    <Pressable
                      key={personId}
                      accessibilityLabel={editMode ? `${p.first_name}, sélectionner` : `${p.first_name}, voir ses souvenirs`}
                      onPress={() => openPerson(personId)}
                      style={[styles.card, { left, top: row.top, width: SLOT, gap: row.isCenter ? 5 : 4 }]}
                    >
                      <View
                        style={[
                          styles.avatar,
                          {
                            width: row.avatar,
                            height: row.avatar,
                            borderRadius: row.avatar / 2,
                            backgroundColor: col.bg,
                            borderColor: isFocus ? C.blue : C.surface,
                            borderWidth: isFocus ? 3 : 2,
                          },
                        ]}
                      >
                        <Text style={{ color: col.fg, fontWeight: "700", fontSize: Math.round(row.avatar * 0.4) }}>
                          {p.first_name.charAt(0).toUpperCase()}
                        </Text>
                        {p.is_central && (
                          <View style={styles.centralBadge}>
                            <Text style={styles.centralBadgeText}>★</Text>
                          </View>
                        )}
                        {editMode && (
                          <View style={styles.editBadge}>
                            <Text style={styles.editBadgeText}>✎</Text>
                          </View>
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: row.isCenter ? 16 : 13, fontWeight: isFocus ? "800" : "700", color: C.ink }}
                      >
                        {p.first_name}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: row.isCenter ? 13 : 11, color: C.inkSoft }}>
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
          <View pointerEvents="none" style={styles.genDots}>
            {tree.generations.map((_, k) => (
              <View
                key={`g${k}`}
                style={{
                  width: k === g ? 10 : 7,
                  height: k === g ? 10 : 7,
                  borderRadius: 5,
                  backgroundColor: k === g ? C.blue : "#C9D4F4",
                }}
              />
            ))}
          </View>
        </View>
      )}

      {!editMode && focus && (
        <View style={styles.hints}>
          <Text style={styles.hintStrong}>Touche une personne pour lire ses souvenirs</Text>
          <Text style={styles.hint}>
            Glisse à gauche ou à droite pour parcourir une génération, vers le haut ou le bas pour changer de génération
          </Text>
        </View>
      )}

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
              <Text style={styles.hint}>Touche une autre personne de l&apos;arbre pour la sélectionner.</Text>
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
              <Text style={styles.hint}>Choisis l&apos;autre personne :</Text>
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
              <Text style={styles.hint}>
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
  screen: { flex: 1, backgroundColor: C.ground },
  titleBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backChevron: { fontSize: 32, lineHeight: 34, color: C.ink },
  title: { fontSize: 22, fontWeight: "700", color: C.ink },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  outlineButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.blue,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: { color: C.blue, fontWeight: "800", fontSize: 15 },
  alertChip: {
    alignSelf: "flex-start",
    marginLeft: 16,
    marginTop: 4,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: C.redTint,
    justifyContent: "center",
  },
  alertChipText: { color: C.redDark, fontWeight: "800", fontSize: 14 },
  treeArea: { height: AREA_HEIGHT, overflow: "hidden", marginTop: 8 },
  centerBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ROW_CENTER.top - 16,
    height: ROW_CENTER.height + 30,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.borderSoft,
  },
  topLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ROW_UP.top + 28,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: C.inkSoft,
  },
  card: { position: "absolute", alignItems: "center" },
  avatar: { alignItems: "center", justifyContent: "center" },
  centralBadge: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.blue,
    borderWidth: 2,
    borderColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  centralBadgeText: { color: "#FFFFFF", fontSize: 11, lineHeight: 13 },
  editBadge: {
    position: "absolute",
    right: -6,
    top: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  editBadgeText: { color: C.blue, fontSize: 12, lineHeight: 14 },
  discoverPill: { marginTop: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: C.blueTint },
  discoverPillText: { color: C.blue, fontSize: 12, fontWeight: "800" },
  genDots: { position: "absolute", right: 8, top: ROW_CENTER.top + 20, alignItems: "center", gap: 8 },
  hints: { paddingHorizontal: 16, paddingTop: 8, alignItems: "center", gap: 6 },
  hintStrong: { fontSize: 15, fontWeight: "700", color: C.ink, textAlign: "center" },
  hint: { fontSize: 13, color: C.inkSoft, textAlign: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  editPanel: { flex: 1, paddingHorizontal: 16 },
  panelCard: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  panelTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  alertTitle: { fontSize: 14, fontWeight: "800", color: C.redDark },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
  },
  chipSelected: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { color: C.ink, fontSize: 14 },
  chipSelectedText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  addChip: {
    borderWidth: 2,
    borderColor: C.blue,
    borderStyle: "dashed",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addChipText: { color: C.blue, fontSize: 14, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: C.surface,
  },
  errorText: { color: C.redDark, fontSize: 14 },
});
