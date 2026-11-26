import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { CalendarPicker } from "@/components/calendar-picker";
import { SearchableDropdown } from "@/components/searchable-dropdown";
import { ThemedText } from "@/components/themed-text";
import { COUNTRIES } from "@/constants/countries";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { Template } from "@/types/question-template";

// Calculées une fois (pas à chaque rendu) : 126 âges (0 à 125) et 1001 années (1800 à 2800).
const AGE_OPTIONS = Array.from({ length: 126 }, (_, i) => String(i));
const YEAR_OPTIONS = Array.from({ length: 1001 }, (_, i) => String(1800 + i));
const YEAR_DEFAULT_VISIBLE = "2000";

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
    return <CalendarPicker value={value} onChange={onChange} />;
  }

  if (kind === "year") {
    return (
      <SearchableDropdown
        value={value}
        onChange={onChange}
        options={YEAR_OPTIONS}
        initialScrollValue={YEAR_DEFAULT_VISIBLE}
        placeholder="Année, par exemple 1965"
        keyboardType="number-pad"
      />
    );
  }

  if (kind === "age") {
    return <SearchableDropdown value={value} onChange={onChange} options={AGE_OPTIONS} placeholder="Âge" keyboardType="number-pad" />;
  }

  if (kind === "number") {
    return <TextInput value={value} onChangeText={onChange} placeholder="Nombre" keyboardType="number-pad" style={styles.input} />;
  }

  if (kind === "country") {
    return <SearchableDropdown value={value} onChange={onChange} options={COUNTRIES} placeholder="Tape pour chercher un pays" />;
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
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);

  async function fetchOptions(query: string): Promise<string[]> {
    const { data } = await supabase.rpc("search_list_items", {
      p_list_name: listName,
      p_query: query,
      p_category: category,
      p_family_id: familyId,
      p_limit: 8,
    });
    const values = ((data ?? []) as Suggestion[]).map((s) => s.value);
    return Array.from(new Set(values));
  }

  const typed = value.trim();
  const exactMatch = currentOptions.some((o) => o.toLowerCase() === typed.toLowerCase());

  return (
    <View style={{ gap: Spacing.two }}>
      <SearchableDropdown
        value={value}
        onChange={onChange}
        fetchOptions={fetchOptions}
        onOptionsChange={setCurrentOptions}
        placeholder="Tape pour chercher…"
      />
      {typed.length > 0 && !exactMatch && (
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
  input: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
    width: "100%",
  },
});
