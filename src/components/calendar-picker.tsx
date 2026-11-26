// Vrai calendrier (grille des jours du mois, navigation mois/année) — demandé par Sylvain le
// 2026-11-26 à la place du champ de date natif du navigateur : cliquer ailleurs que sur le
// segment "jour" du champ natif puis taper la date envoyait les chiffres dans le mauvais
// segment (mois ou année) et n'enregistrait rien. Composant unique (web et natif), pas de
// dépendance native : remplace @react-native-community/datetimepicker.
// Rendu en ligne sous le champ (comme src/components/searchable-dropdown.tsx), jamais en
// recouvrement, pour les mêmes raisons (cartes à overflow: hidden dans add-fact.tsx).
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTH_LABELS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseValue(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

// Lundi en premier (0 = lundi … 6 = dimanche), getDay() renvoie 0 = dimanche.
function firstWeekdayMonFirst(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

export function CalendarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const [open, setOpen] = useState(false);
  const [pickingYear, setPickingYear] = useState(false);
  const parsed = parseValue(value);
  const [viewY, setViewY] = useState(parsed?.y ?? todayY);
  const [viewM, setViewM] = useState(parsed?.m ?? todayM);

  function openPicker() {
    const p = parseValue(value);
    setViewY(p?.y ?? todayY);
    setViewM(p?.m ?? todayM);
    setPickingYear(false);
    setOpen(true);
  }

  const isCurrentMonth = viewY === todayY && viewM === todayM;

  function goPrevMonth() {
    if (viewM === 0) {
      setViewY((y) => y - 1);
      setViewM(11);
    } else {
      setViewM((m) => m - 1);
    }
  }

  function goNextMonth() {
    if (isCurrentMonth) return;
    if (viewM === 11) {
      setViewY((y) => y + 1);
      setViewM(0);
    } else {
      setViewM((m) => m + 1);
    }
  }

  function pickDay(d: number) {
    onChange(`${viewY}-${pad2(viewM + 1)}-${pad2(d)}`);
    setOpen(false);
  }

  function pickYear(y: number) {
    setViewY(y);
    // On choisit une année future par rapport au mois affiché : revenir au mois courant évite
    // de rester sur un mois qui n'existe pas encore pour cette année.
    if (y === todayY && viewM > todayM) setViewM(todayM);
    setPickingYear(false);
  }

  const nDays = daysInMonth(viewY, viewM);
  const firstWd = firstWeekdayMonFirst(viewY, viewM);
  const cells: (number | null)[] = [...Array(firstWd).fill(null), ...Array.from({ length: nDays }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const years = Array.from({ length: todayY - 1800 + 1 }, (_, i) => todayY - i);

  return (
    <View>
      <Pressable onPress={openPicker} style={styles.trigger}>
        <Text style={value ? styles.triggerText : styles.triggerPlaceholder}>
          {parsed ? `${parsed.d} ${MONTH_LABELS[parsed.m]} ${parsed.y}` : "Choisir une date"}
        </Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          {pickingYear ? (
            <FlatList
              data={years}
              keyExtractor={(y) => String(y)}
              style={styles.yearList}
              renderItem={({ item: y }) => (
                <Pressable onPress={() => pickYear(y)} style={[styles.yearItem, y === viewY && styles.yearItemSelected]}>
                  <Text style={[styles.yearItemText, y === viewY && styles.yearItemTextSelected]}>{y}</Text>
                </Pressable>
              )}
            />
          ) : (
            <>
              <View style={styles.header}>
                <Pressable accessibilityLabel="Mois précédent" onPress={goPrevMonth} style={styles.navButton}>
                  <Text style={styles.navButtonText}>‹</Text>
                </Pressable>
                <Pressable onPress={() => setPickingYear(true)} style={styles.monthYearButton}>
                  <Text style={styles.monthYearText}>
                    {MONTH_LABELS[viewM]} {viewY}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Mois suivant"
                  onPress={goNextMonth}
                  disabled={isCurrentMonth}
                  style={[styles.navButton, isCurrentMonth && styles.navButtonDisabled]}
                >
                  <Text style={styles.navButtonText}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((w, i) => (
                  <Text key={i} style={styles.weekdayText}>
                    {w}
                  </Text>
                ))}
              </View>

              <View style={styles.grid}>
                {cells.map((d, i) => {
                  if (d == null) return <View key={i} style={styles.dayCell} />;
                  const isFuture = viewY === todayY && viewM === todayM && d > todayD;
                  const isSelected = parsed && parsed.y === viewY && parsed.m === viewM && parsed.d === d;
                  const isToday = viewY === todayY && viewM === todayM && d === todayD;
                  return (
                    <Pressable
                      key={i}
                      disabled={isFuture}
                      onPress={() => pickDay(d)}
                      style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          isFuture && styles.dayTextDisabled,
                          isSelected && styles.dayTextSelected,
                          isToday && !isSelected && styles.dayTextToday,
                        ]}
                      >
                        {d}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const CELL_SIZE = 36;

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: 12,
    width: "100%",
  },
  triggerText: { fontSize: 15, color: "#000000" },
  triggerPlaceholder: { fontSize: 15, color: "#767676" },
  panel: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: 10,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  navButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 },
  navButtonDisabled: { opacity: 0.3 },
  navButtonText: { fontSize: 20, fontWeight: "700", color: "#2347C5" },
  monthYearButton: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  monthYearText: { fontSize: 16, fontWeight: "700", color: "#1B1F3B", textTransform: "capitalize" },
  weekdayRow: { flexDirection: "row" },
  weekdayText: {
    width: CELL_SIZE,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#5B5F73",
    marginBottom: 4,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: CELL_SIZE / 2,
  },
  dayCellSelected: { backgroundColor: "#2347C5" },
  dayText: { fontSize: 14, color: "#1B1F3B" },
  dayTextDisabled: { color: "#c7c7c7" },
  dayTextSelected: { color: "#ffffff", fontWeight: "700" },
  dayTextToday: { fontWeight: "700", color: "#2347C5" },
  yearList: { maxHeight: 44 * 8 },
  yearItem: { height: 44, justifyContent: "center", paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#e5e5e5" },
  yearItemSelected: { backgroundColor: "#eef4ff" },
  yearItemText: { fontSize: 15 },
  yearItemTextSelected: { fontWeight: "700" },
});
