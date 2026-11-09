import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type Person = {
  id: string;
  display_name: string;
  is_central: boolean;
};

type Relationship = {
  id: string;
  person_a_id: string;
  person_b_id: string;
  relation_type: "parent_of" | "spouse_of";
};

type RelationKind = "spouse_of" | "parent_of";

function namesOf(ids: string[], personsById: Map<string, Person>): string {
  return ids.map((id) => personsById.get(id)?.display_name ?? "?").join(", ");
}

export default function FamilyTreeScreen() {
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [error, setError] = useState("");

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [personAId, setPersonAId] = useState<string | null>(null);
  const [relationKind, setRelationKind] = useState<RelationKind>("spouse_of");
  const [personBId, setPersonBId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showAddPersonForm, setShowAddPersonForm] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonGender, setNewPersonGender] = useState<"homme" | "femme" | null>(null);
  const [creatingPerson, setCreatingPerson] = useState(false);

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

      const [{ data: personsData }, { data: relsData }] = await Promise.all([
        supabase
          .from("persons")
          .select("id, display_name, is_central")
          .eq("family_id", me.family_id)
          .order("is_central", { ascending: false })
          .order("display_name", { ascending: true }),
        supabase.from("relationships").select("id, person_a_id, person_b_id, relation_type").eq("family_id", me.family_id),
      ]);

      if (cancelled) return;
      setPersons(personsData ?? []);
      setRelationships((relsData ?? []) as Relationship[]);
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const personsById = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);

  function spouseOf(personId: string): string | null {
    const rel = relationships.find(
      (r) => r.relation_type === "spouse_of" && (r.person_a_id === personId || r.person_b_id === personId),
    );
    if (!rel) return null;
    return rel.person_a_id === personId ? rel.person_b_id : rel.person_a_id;
  }

  function parentsOf(personId: string): string[] {
    return relationships.filter((r) => r.relation_type === "parent_of" && r.person_b_id === personId).map((r) => r.person_a_id);
  }

  function childrenOf(personId: string): string[] {
    return relationships.filter((r) => r.relation_type === "parent_of" && r.person_a_id === personId).map((r) => r.person_b_id);
  }

  function siblingsOf(personId: string): string[] {
    const parents = parentsOf(personId);
    if (parents.length === 0) return [];
    const siblingIds = new Set<string>();
    for (const parentId of parents) {
      for (const childId of childrenOf(parentId)) {
        if (childId !== personId) siblingIds.add(childId);
      }
    }
    return Array.from(siblingIds);
  }

  function relationshipExists(aId: string, bId: string, kind: RelationKind): boolean {
    return relationships.some(
      (r) =>
        r.relation_type === kind &&
        ((r.person_a_id === aId && r.person_b_id === bId) ||
          (kind === "spouse_of" && r.person_a_id === bId && r.person_b_id === aId)),
    );
  }

  function resetForm() {
    setShowAddForm(false);
    setPersonAId(null);
    setRelationKind("spouse_of");
    setPersonBId(null);
    setError("");
  }

  function resetPersonForm() {
    setShowAddPersonForm(false);
    setNewPersonName("");
    setNewPersonGender(null);
    setError("");
  }

  async function createPerson() {
    if (!familyId || newPersonName.trim().length === 0) return;
    setCreatingPerson(true);
    setError("");

    const { data, error: insertError } = await supabase
      .from("persons")
      .insert({
        family_id: familyId,
        kind: "profile",
        display_name: newPersonName.trim(),
        gender: newPersonGender,
        is_central: false,
        is_deceased: false,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setCreatingPerson(false);
      return;
    }

    setPersons((prev) => [...prev, { id: data.id, display_name: data.display_name, is_central: false }]);
    setCreatingPerson(false);
    resetPersonForm();
  }

  async function submitRelationship() {
    if (!familyId || !personAId || !personBId) return;
    if (personAId === personBId) {
      setError("Les deux personnes doivent être différentes.");
      return;
    }
    if (relationshipExists(personAId, personBId, relationKind)) {
      setError("Cette relation existe déjà.");
      return;
    }
    if (relationKind === "spouse_of" && (spouseOf(personAId) || spouseOf(personBId))) {
      setError("L'une de ces deux personnes a déjà un·e conjoint·e enregistré·e - pas encore géré (voir roadmap).");
      return;
    }

    setSubmitting(true);
    setError("");
    const { data, error: insertError } = await supabase
      .from("relationships")
      .insert({ family_id: familyId, person_a_id: personAId, person_b_id: personBId, relation_type: relationKind })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    setRelationships((prev) => [...prev, data as Relationship]);
    setSubmitting(false);
    resetForm();
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

  const centralPersons = persons.filter((p) => p.is_central);
  const otherPersons = persons.filter((p) => !p.is_central);

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Arbre familial</ThemedText>
        <ThemedText themeColor="textSecondary">
          Une vue simple des personnes et de leurs liens - pas un arbre généalogique complet.
        </ThemedText>

        {centralPersons.length === 0 && (
          <ThemedText themeColor="textSecondary">Aucune personne centrale dans cette famille.</ThemedText>
        )}

        {centralPersons.map((person) => {
          const spouseId = spouseOf(person.id);
          const parentIds = parentsOf(person.id);
          const childIds = childrenOf(person.id);
          const siblingIds = siblingsOf(person.id);

          return (
            <View key={person.id} style={styles.card}>
              <ThemedText type="smallBold">{person.display_name}</ThemedText>
              {spouseId && <ThemedText themeColor="textSecondary">Conjoint·e : {namesOf([spouseId], personsById)}</ThemedText>}
              {parentIds.length > 0 && (
                <ThemedText themeColor="textSecondary">Parents : {namesOf(parentIds, personsById)}</ThemedText>
              )}
              {siblingIds.length > 0 && (
                <ThemedText themeColor="textSecondary">Frères et sœurs : {namesOf(siblingIds, personsById)}</ThemedText>
              )}
              {childIds.length > 0 && (
                <ThemedText themeColor="textSecondary">Enfants : {namesOf(childIds, personsById)}</ThemedText>
              )}
              {!spouseId && parentIds.length === 0 && siblingIds.length === 0 && childIds.length === 0 && (
                <ThemedText themeColor="textSecondary" style={styles.smallText}>
                  Aucune relation enregistrée pour l&apos;instant.
                </ThemedText>
              )}
            </View>
          );
        })}

        {otherPersons.length > 0 && (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold">Autres membres de la famille</ThemedText>
            {otherPersons.map((p) => (
              <ThemedText key={p.id} themeColor="textSecondary">
                {p.display_name}
              </ThemedText>
            ))}
          </View>
        )}

        {!showAddForm && !showAddPersonForm && (
          <View style={styles.actionsRow}>
            <Pressable onPress={() => setShowAddForm(true)}>
              <ThemedText type="linkPrimary">+ Ajouter une relation</ThemedText>
            </Pressable>
            <Pressable onPress={() => setShowAddPersonForm(true)}>
              <ThemedText type="linkPrimary">+ Ajouter une personne</ThemedText>
            </Pressable>
          </View>
        )}

        {showAddPersonForm && (
          <View style={styles.card}>
            <ThemedText type="smallBold">Ajouter une personne</ThemedText>
            <TextInput
              value={newPersonName}
              onChangeText={setNewPersonName}
              placeholder="Prénom et nom"
              style={styles.input}
            />
            <View style={styles.chipsRow}>
              {(["homme", "femme"] as const).map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setNewPersonGender(g)}
                  style={[styles.chip, newPersonGender === g && styles.chipSelected]}
                >
                  <ThemedText style={newPersonGender === g ? { color: "#ffffff" } : undefined}>
                    {g === "homme" ? "Homme" : "Femme"}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

            <View style={styles.actionsRow}>
              <Pressable onPress={createPerson} disabled={creatingPerson || newPersonName.trim().length === 0}>
                <ThemedText type="linkPrimary">{creatingPerson ? "Création…" : "Enregistrer"}</ThemedText>
              </Pressable>
              <Pressable onPress={resetPersonForm}>
                <ThemedText type="linkPrimary">Annuler</ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {showAddForm && (
          <View style={styles.card}>
            <ThemedText type="smallBold">Ajouter une relation</ThemedText>

            <ThemedText themeColor="textSecondary">Première personne</ThemedText>
            <View style={styles.chipsRow}>
              {persons.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPersonAId(p.id)}
                  style={[styles.chip, personAId === p.id && styles.chipSelected]}
                >
                  <ThemedText style={personAId === p.id ? { color: "#ffffff" } : undefined}>{p.display_name}</ThemedText>
                </Pressable>
              ))}
            </View>

            <ThemedText themeColor="textSecondary">Relation</ThemedText>
            <View style={styles.chipsRow}>
              <Pressable
                onPress={() => setRelationKind("spouse_of")}
                style={[styles.chip, relationKind === "spouse_of" && styles.chipSelected]}
              >
                <ThemedText style={relationKind === "spouse_of" ? { color: "#ffffff" } : undefined}>
                  Conjoint·e de
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setRelationKind("parent_of")}
                style={[styles.chip, relationKind === "parent_of" && styles.chipSelected]}
              >
                <ThemedText style={relationKind === "parent_of" ? { color: "#ffffff" } : undefined}>
                  Parent de
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText themeColor="textSecondary">Deuxième personne</ThemedText>
            <View style={styles.chipsRow}>
              {persons
                .filter((p) => p.id !== personAId)
                .map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setPersonBId(p.id)}
                    style={[styles.chip, personBId === p.id && styles.chipSelected]}
                  >
                    <ThemedText style={personBId === p.id ? { color: "#ffffff" } : undefined}>{p.display_name}</ThemedText>
                  </Pressable>
                ))}
            </View>

            {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

            <View style={styles.actionsRow}>
              <Pressable
                onPress={submitRelationship}
                disabled={submitting || !personAId || !personBId}
              >
                <ThemedText type="linkPrimary">{submitting ? "Enregistrement…" : "Enregistrer"}</ThemedText>
              </Pressable>
              <Pressable onPress={resetForm}>
                <ThemedText type="linkPrimary">Annuler</ThemedText>
              </Pressable>
            </View>
          </View>
        )}

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
  card: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
    width: "100%",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
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
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  smallText: {
    fontSize: 13,
  },
});
