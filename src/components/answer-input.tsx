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

  const [listOptions, setListOptions] = useState<string[]>([]);

  useEffect(() => {
    if (kind !== "list" || !template.list_name) return;
    let cancelled = false;
    let query = supabase.from("list_items").select("value, status, family_id").eq("list_name", template.list_name);
    if (hideFamilyItems) query = query.eq("status", "approved");
    query.then(({ data }) => {
      if (cancelled || !data) return;
      const options = data
        .filter((row) => row.status === "approved" || (!hideFamilyItems && row.family_id === familyId))
        .map((row) => row.value);
      setListOptions(Array.from(new Set(options)).sort());
    });
    return () => {
      cancelled = true;
    };
  }, [kind, template.list_name, familyId, hideFamilyItems]);

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
