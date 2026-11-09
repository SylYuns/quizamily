import React from "react";

import { Spacing } from "@/constants/theme";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

// Web has no native calendar widget in react-native; a plain HTML date input
// renders the browser's own calendar picker and keeps the "YYYY-MM-DD" value
// format identical to the native DateTimePicker variant (date-input.tsx).
export default function DateInput({ value, onChange }: Props) {
  return React.createElement("input", {
    type: "date",
    value,
    max: new Date().toISOString().slice(0, 10),
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    style: {
      border: "1px solid #999999",
      borderRadius: 8,
      padding: Spacing.three,
      width: "100%",
      fontSize: 16,
      fontFamily: "inherit",
      boxSizing: "border-box",
    },
  });
}
