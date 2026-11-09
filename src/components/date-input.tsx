import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

function parseValue(value: string): Date {
  if (value) {
    const parsed = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DateInput({ value, onChange }: Props) {
  const [show, setShow] = useState(false);

  return (
    <View>
      <Pressable onPress={() => setShow(true)} style={styles.input}>
        <ThemedText themeColor={value ? "text" : "textSecondary"}>{value || "Choisir une date"}</ThemedText>
      </Pressable>
      {show && (
        <DateTimePicker
          value={parseValue(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          maximumDate={new Date()}
          onChange={(_event, date) => {
            if (Platform.OS !== "ios") setShow(false);
            if (date) onChange(formatDate(date));
          }}
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
    padding: Spacing.three,
    width: "100%",
  },
});
