import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import DateInput from "@/components/date-input";
import { ThemedText } from "@/components/themed-text";
import { COUNTRIES } from "@/constants/countries";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { Template } from "@/types/question-template";

export function AnswerInput(props: {
  template: Template;
  familyId: string;
  value: string;
  onChange: (v: string) => void;
  /**
   * Pour un joueur qui répond : ne proposer que les valeurs validées de la liste globale,
   * pas celles ajoutées par la famille. Une valeur ajoutée par l'auteur en créant le fait
   * serait sinon une suggestion qui trahit la bonne réponse. Le joueur peut toujours la
   * taper lui-même (comparaison après normalisation).
   */
  hideFamilyItems?: boolean;
}) {
  const { template, familyId, value, onChange, hideFamilyItems = false } = props;
  const kind = template.answer_input_kind;

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

  if (kind === "list" && template.list_name) {
    return (
      <ListSearchInput
        listName={template.list_name}
        category={template.list_category ?? null}
        familyId={hideFamilyItems ? null : familyId}
        value={value}
        onChange={onChange}
        answerMode={hideFamilyItems}
      />
    );
  }

  return <TextInput value={value} onChangeText={onChange} placeholder="Réponse" style={styles.input} />;
}

type Suggestion = { value: string; is_family_item: boolean };

// Champ des listes de référence (2026-11-19) : on tape quelques lettres, la base renvoie les
// meilleures correspondances (search_list_items, sans tenir compte des accents ni des
// majuscules). Les listes peuvent compter des milliers de valeurs : on n'affiche jamais tout.
function ListSearchInput(props: {
  listName: string;
  category: string | null;
  /** null : valeurs validées seulement (écran de réponse) ; sinon, + ajouts de cette famille. */
  familyId: string | null;
  value: string;
  onChange: (v: string) => void;
  answerMode: boolean;
}) {
  const { listName, category, familyId, value, onChange, answerMode } = props;
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length === 0 || query === picked) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("search_list_items", {
        p_list_name: listName,
        p_query: query,
        p_category: category,
        p_family_id: familyId,
        p_limit: 8,
      });
      if (!cancelled) setSuggestions((data ?? []) as Suggestion[]);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, picked, listName, category, familyId]);

  const typed = value.trim();
  const exactMatch = suggestions.some((s) => s.value.toLowerCase() === typed.toLowerCase());

  return (
    <View style={{ gap: Spacing.two }}>
      <TextInput
        value={value}
        onChangeText={(text) => {
          setPicked(null);
          onChange(text);
        }}
        placeholder="Tape les premières lettres…"
        autoCorrect={false}
        style={styles.input}
      />
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable
              key={`${s.value}-${s.is_family_item ? "f" : "g"}`}
              onPress={() => {
                setPicked(s.value);
                onChange(s.value);
              }}
              style={styles.suggestion}
            >
              <ThemedText>{s.value}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
      {typed.length > 0 && typed !== picked && !exactMatch && (
        <ThemedText themeColor="textSecondary">
          {answerMode
            ? "Pas dans les propositions ? Tape ta réponse en entier."
            : `« ${typed} » n'est pas dans la liste : la valeur sera ajoutée pour ta famille.`}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  suggestions: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    overflow: "hidden",
  },
  suggestion: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  input: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
    width: "100%",
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
});
