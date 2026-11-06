import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type SendStatus = "idle" | "sending" | "sent" | "error";

export default function ConnexionScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function sendMagicLink() {
    setStatus("sending");
    setErrorMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (checkingSession) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (session) {
    return (
      <ThemedView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: Spacing.three,
          padding: Spacing.four,
        }}
      >
        <ThemedText type="title">Connecté</ThemedText>
        <ThemedText themeColor="textSecondary">{session.user.email}</ThemedText>
        <Pressable onPress={() => supabase.auth.signOut()}>
          <ThemedText type="linkPrimary">Se déconnecter</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: Spacing.three,
        padding: Spacing.four,
      }}
    >
      <ThemedText type="title">Quizamily</ThemedText>

      {status === "sent" ? (
        <ThemedText>Un lien de connexion vous a été envoyé par email.</ThemedText>
      ) : (
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
      )}
    </ThemedView>
  );
}
