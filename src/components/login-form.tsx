import { useState } from "react";
import { Pressable, TextInput } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type SendStatus = "idle" | "sending" | "sent" | "error";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function sendMagicLink() {
    setStatus("sending");
    setErrorMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo ?? (typeof window !== "undefined" ? window.location.origin : undefined),
      },
    });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return <ThemedText>Un lien de connexion vous a été envoyé par email.</ThemedText>;
  }

  return (
    <>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Votre email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={{
          borderWidth: 1,
          borderColor: "#999999",
          borderRadius: 8,
          padding: Spacing.three,
          width: "100%",
          maxWidth: 320,
        }}
      />
      <Pressable
        onPress={sendMagicLink}
        disabled={status === "sending" || email.trim().length === 0}
        style={{
          backgroundColor: "#3c87f7",
          borderRadius: 8,
          paddingVertical: Spacing.three,
          paddingHorizontal: Spacing.four,
          opacity: status === "sending" || email.trim().length === 0 ? 0.6 : 1,
        }}
      >
        <ThemedText style={{ color: "#ffffff" }}>
          {status === "sending" ? "Envoi…" : "Recevoir le lien de connexion"}
        </ThemedText>
      </Pressable>
      {status === "error" && <ThemedText themeColor="text">{errorMessage}</ThemedText>}
    </>
  );
}
