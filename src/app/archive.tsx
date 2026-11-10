import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { formatAnswerDisplay } from "@/lib/format-answer";
import { supabase } from "@/lib/supabase";

type CentralPerson = {
  id: string;
  displayName: string;
};

type ArchiveEntry = {
  quizQuestionId: string;
  questionText: string;
  answerInputKind: string;
  answer: string | number;
};

export default function ArchiveScreen() {
  // Ouvert depuis l'arbre familial (écran 10) : la personne touchée est présélectionnée,
  // même si ce n'est pas une personne centrale. En attendant le récapitulatif (écran 11).
  const { personId } = useLocalSearchParams<{ personId?: string }>();
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [error, setError] = useState("");

  const [centralPersons, setCentralPersons] = useState<CentralPerson[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<CentralPerson | null>(null);
  const [entries, setEntries] = useState<ArchiveEntry[] | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);

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

      const { data, error: personsError } = await supabase
        .from("persons")
        .select("id, display_name")
        .eq("family_id", me.family_id)
        .eq("is_central", true)
        .order("display_name", { ascending: true });

      if (cancelled) return;
      if (personsError) {
        setError(personsError.message);
        setReady(true);
        return;
      }

      const persons = (data ?? []).map((row) => ({ id: row.id, displayName: row.display_name }));
      setCentralPersons(persons);
      if (personId) {
        const fromTree = persons.find((p) => p.id === personId);
        if (fromTree) {
          setSelectedPerson(fromTree);
        } else {
          const { data: other } = await supabase
            .from("persons")
            .select("id, display_name")
            .eq("family_id", me.family_id)
            .eq("id", personId)
            .maybeSingle();
          if (cancelled) return;
          if (other) setSelectedPerson({ id: other.id, displayName: other.display_name });
        }
      } else if (persons.length === 1) {
        setSelectedPerson(persons[0]);
      }
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  useEffect(() => {
    if (!selectedPerson) return;
    let cancelled = false;

    async function loadEntries() {
      setLoadingEntries(true);
      setError("");
      const { data, error: rpcError } = await supabase.rpc("get_archive_summary", {
        p_person_id: selectedPerson!.id,
      });
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
      } else {
        setEntries(data as ArchiveEntry[]);
      }
      setLoadingEntries(false);
    }

    loadEntries();
    return () => {
      cancelled = true;
    };
  }, [selectedPerson]);

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

  const showPersonChooser = centralPersons.length > 1 && !selectedPerson;

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">Archives</ThemedText>

        {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

        {centralPersons.length === 0 && (
          <ThemedText themeColor="textSecondary">Aucune personne centrale dans cette famille.</ThemedText>
        )}

        {showPersonChooser && (
          <View style={{ gap: Spacing.two }}>
            <ThemedText themeColor="textSecondary">De qui veux-tu voir les archives ?</ThemedText>
            {centralPersons.map((person) => (
              <Pressable key={person.id} onPress={() => setSelectedPerson(person)} style={styles.card}>
                <ThemedText type="smallBold">{person.displayName}</ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {selectedPerson && !showPersonChooser && (
          <>
            {centralPersons.length > 1 && (
              <Pressable
                onPress={() => {
                  setSelectedPerson(null);
                  setEntries(null);
                }}
              >
                <ThemedText type="linkPrimary">Changer de personne</ThemedText>
              </Pressable>
            )}

            <ThemedText themeColor="textSecondary">
              Questions révélées concernant {selectedPerson.displayName}
            </ThemedText>

            {loadingEntries && <ActivityIndicator />}

            {!loadingEntries && entries !== null && entries.length === 0 && (
              <ThemedText themeColor="textSecondary">
                Aucune question révélée pour l&apos;instant.
              </ThemedText>
            )}

            {!loadingEntries &&
              entries !== null &&
              entries.map((entry) => {
                return (
                  <Pressable
                    key={entry.quizQuestionId}
                    style={styles.card}
                    onPress={() =>
                      router.push({ pathname: "/reveal", params: { questionId: entry.quizQuestionId } })
                    }
                  >
                    <ThemedText type="smallBold">{entry.questionText}</ThemedText>
                    <ThemedText themeColor="textSecondary">
                      {formatAnswerDisplay(entry.answerInputKind, entry.answer)}
                    </ThemedText>
                  </Pressable>
                );
              })}
          </>
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
});
