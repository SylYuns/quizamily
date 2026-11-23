// Liste déroulante saisissable : un champ texte dont la saisie filtre une liste de
// suggestions affichée juste en dessous (jamais en recouvrement — certains écrans l'utilisent
// dans une carte à `overflow: hidden`, comme src/app/add-fact.tsx, qui couperait un panneau
// posé en recouvrement). Deux sources possibles :
// - `options` : liste fixe connue d'avance (âges, années, pays…), filtrée localement ;
// - `fetchOptions` : recherche asynchrone (ex. search_list_items), avec un léger anti-rebond.
// Dans les deux cas, le champ reste une saisie libre classique : taper une valeur absente de
// la liste reste possible (comparée ailleurs après normalisation, ou ajoutée pour la famille
// pour un type liste) — la liste déroulante aide à choisir, elle ne verrouille rien.
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";

const ITEM_HEIGHT = 44;
// 8 lignes visibles avant de devoir faire défiler : 5 (220px) était trop peu pour bien voir où
// on en est dans une liste longue (décidé le 2026-11-23, signalé par l'utilisateur à l'écran).
const VISIBLE_ITEMS = 8;
const MAX_LIST_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function SearchableDropdown(props: {
  value: string;
  onChange: (v: string) => void;
  /** Liste fixe, filtrée localement (sous-chaîne, insensible aux accents/majuscules). */
  options?: string[];
  /** Recherche asynchrone (ex. valeurs serveur) : reçoit la saisie actuelle, peut être vide. */
  fetchOptions?: (query: string) => Promise<string[]>;
  /** Index/valeur sur laquelle centrer la liste à l'ouverture quand le champ est encore vide
   * (ex. "2000" pour une année) — un repère de départ, pas une présélection. */
  initialScrollValue?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  /** Reçoit la liste affichée à chaque mise à jour (ex. pour afficher "pas dans la liste"). */
  onOptionsChange?: (options: string[]) => void;
}) {
  const { value, onChange, options, fetchOptions, initialScrollValue, placeholder, keyboardType, onOptionsChange } = props;

  const [focused, setFocused] = useState(false);
  // Vrai juste après avoir touché le champ (ou choisi une valeur) : affiche la liste entière,
  // centrée sur la valeur actuelle, pour naviguer facilement. Repasse à faux dès la première
  // frappe, qui filtre alors normalement — ne PAS se baser sur "la saisie correspond déjà à
  // une option valide" : pour une liste numérique, un préfixe tapé (ex. "14" en tapant un âge)
  // est presque toujours lui-même une option valide, ce qui bloquait le filtrage en cours de
  // frappe (repéré en testant à l'écran).
  const [browsing, setBrowsing] = useState(false);
  const [asyncResults, setAsyncResults] = useState<string[]>([]);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<string>>(null);

  // Recherche asynchrone : un léger anti-rebond, relancée à chaque frappe (y compris vide,
  // pour afficher des suggestions dès l'ouverture du champ) tant qu'il a le focus.
  useEffect(() => {
    if (!fetchOptions || !focused) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await fetchOptions(value.trim());
      if (!cancelled) setAsyncResults(results);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchOptions, focused, value]);

  const isStatic = !!options;

  const filtered = useMemo(() => {
    if (!isStatic) return asyncResults;
    const base = options!;
    if (browsing) return base;
    const query = normalize(value.trim());
    if (query.length === 0) return base;
    return base.filter((o) => normalize(o).includes(query));
  }, [isStatic, options, browsing, value, asyncResults]);

  useEffect(() => {
    onOptionsChange?.(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne notifier le parent que lorsque la liste affichée change, pas à chaque re-rendu de sa fonction de rappel
  }, [filtered]);

  const scrollTargetValue = browsing ? (isStatic && options!.includes(value) ? value : initialScrollValue) : undefined;
  const scrollTargetIndex = scrollTargetValue ? filtered.indexOf(scrollTargetValue) : -1;

  function handleFocus() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setFocused(true);
    setBrowsing(true);
  }

  function handleChangeText(text: string) {
    setBrowsing(false);
    onChange(text);
  }

  function handleBlur() {
    // Un appui sur une suggestion déclenche d'abord ce blur (côté web notamment) : le délai
    // laisse le temps à onPress de s'exécuter avant que la liste ne se démonte.
    blurTimer.current = setTimeout(() => setFocused(false), 150);
  }

  function pick(v: string) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(v);
    setBrowsing(true);
    setFocused(false);
  }

  const showList = focused && filtered.length > 0;

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCorrect={false}
        style={styles.input}
      />
      {showList && (
        <FlatList
          ref={listRef}
          data={filtered}
          keyExtractor={(item) => item}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          initialScrollIndex={scrollTargetIndex > 0 ? scrollTargetIndex : undefined}
          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
          renderItem={({ item }) => (
            <Pressable onPress={() => pick(item)} style={[styles.item, item === value && styles.itemSelected]}>
              <Text style={[styles.itemText, item === value && styles.itemTextSelected]}>{item}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: 12,
    width: "100%",
  },
  list: {
    maxHeight: MAX_LIST_HEIGHT,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  itemSelected: { backgroundColor: "#eef4ff" },
  itemText: { fontSize: 15 },
  itemTextSelected: { fontWeight: "700" },
});
