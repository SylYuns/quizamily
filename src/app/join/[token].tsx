import type { Session } from "@supabase/supabase-js";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { LoginForm } from "@/components/login-form";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type Gender = "homme" | "femme" | null;

type UnclaimedPerson = {
  id: string;
  display_name: string;
  is_central: boolean;
  parent_names: string[];
};

export default function JoinFamilyScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [familyName, setFamilyName] = useState<string | null>(null);
  const [unclaimed, setUnclaimed] = useState<UnclaimedPerson[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [mode, setMode] = useState<"choose" | "create">("choose");
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<Gender>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (!session || !token) return;
    let cancelled = false;

    async function loadPreview() {
      setLoadingPreview(true);
      const [nameResult, personsResult] = await Promise.all([
        supabase.rpc("get_invite_family_name", { p_token: token }),
        supabase.rpc("get_invite_unclaimed_persons", { p_token: token }),
      ]);
      if (cancelled) return;
      if (nameResult.error || !nameResult.data) {
        setPreviewError("Ce lien d'invitation est invalide ou a expiré.");
      } else {
        setFamilyName(nameResult.data as string);
        const persons = (personsResult.data as UnclaimedPerson[] | null) ?? [];
        setUnclaimed(persons);
        setMode(persons.length > 0 ? "choose" : "create");
      }
      setLoadingPreview(false);
    }

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [session, token]);

  async function claim(personId: string) {
    setClaimingId(personId);
    setError("");
    const { error: rpcError } = await supabase.rpc("claim_person_with_invite", {
      p_token: token,
      p_person_id: personId,
    });
    if (rpcError) {
      setError(rpcError.message);
      setClaimingId(null);
      return;
    }
    router.replace("/home");
  }

  async function join() {
    setJoining(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("join_family_with_invite", {
      p_token: token,
      p_display_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      p_gender: gender,
    });
    if (rpcError) {
      setError(rpcError.message);
      setJoining(false);
      return;
    }
    router.replace("/home");
  }

  if (checkingSession) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!session) {
    return (
      <ThemedView
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.three, padding: Spacing.four }}
      >
        <ThemedText type="title">Vous êtes invité(e) !</ThemedText>
        <ThemedText themeColor="textSecondary">Connectez-vous pour rejoindre la famille.</ThemedText>
        <LoginForm redirectTo={typeof window !== "undefined" ? window.location.href : undefined} />
      </ThemedView>
    );
  }

  if (loadingPreview) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!familyName) {
    return (
      <ThemedView
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.three, padding: Spacing.four }}
      >
        <ThemedText type="title">Lien invalide</ThemedText>
        <ThemedText themeColor="textSecondary">{previewError}</ThemedText>
      </ThemedView>
    );
  }

  if (mode === "choose") {
    return (
      <ThemedView style={{ flex: 1 }}>
        <View style={{ padding: Spacing.four, gap: Spacing.three, maxWidth: 480, width: "100%", alignSelf: "center" }}>
          <ThemedText type="title">Vous êtes invité(e) dans la famille {familyName}</ThemedText>
          <ThemedText themeColor="textSecondary">Es-tu l&apos;une de ces personnes ?</ThemedText>

          {unclaimed.map((person) => (
            <Pressable
              key={person.id}
              onPress={() => claim(person.id)}
              disabled={claimingId !== null}
              style={{
                borderWidth: 1,
                borderColor: "#999999",
                borderRadius: 8,
                padding: Spacing.three,
                opacity: claimingId !== null && claimingId !== person.id ? 0.5 : 1,
              }}
            >
              <ThemedText type="smallBold">{person.display_name}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {person.is_central
                  ? "Personne centrale"
                  : person.parent_names.length > 0
                    ? `Enfant de ${person.parent_names.join(" et ")}`
                    : ""}
              </ThemedText>
              {claimingId === person.id && <ThemedText>Connexion…</ThemedText>}
            </Pressable>
          ))}

          {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

          <Pressable onPress={() => setMode("create")}>
            <ThemedText type="linkPrimary">Je ne suis pas dans cette liste</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView
      style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.three, padding: Spacing.four }}
    >
      <ThemedText type="title">Vous êtes invité(e) dans la famille {familyName}</ThemedText>

      <LabeledInput value={firstName} onChangeText={setFirstName} placeholder="Prénom" />
      <LabeledInput value={lastName} onChangeText={setLastName} placeholder="Nom" />

      <View style={{ flexDirection: "row", gap: Spacing.two }}>
        {(["femme", "homme"] as const).map((g) => (
          <Pressable
            key={g}
            onPress={() => setGender(g)}
            style={{
              borderWidth: 1,
              borderColor: gender === g ? "#3c87f7" : "#999999",
              backgroundColor: gender === g ? "#3c87f7" : "transparent",
              borderRadius: 16,
              paddingVertical: Spacing.two,
              paddingHorizontal: Spacing.three,
            }}
          >
            <ThemedText style={gender === g ? { color: "#ffffff" } : undefined}>
              {g === "femme" ? "Femme" : "Homme"}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}

      <Pressable
        onPress={join}
        disabled={joining || firstName.trim().length === 0 || lastName.trim().length === 0}
        style={{
          backgroundColor: "#3c87f7",
          borderRadius: 8,
          paddingVertical: Spacing.three,
          paddingHorizontal: Spacing.four,
          opacity: joining || firstName.trim().length === 0 || lastName.trim().length === 0 ? 0.6 : 1,
        }}
      >
        <ThemedText style={{ color: "#ffffff" }}>{joining ? "Connexion…" : "Rejoindre la famille"}</ThemedText>
      </Pressable>

      {unclaimed.length > 0 && (
        <Pressable onPress={() => setMode("choose")}>
          <ThemedText type="linkPrimary">Retour à la liste</ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

function LabeledInput(props: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      style={{
        borderWidth: 1,
        borderColor: "#999999",
        borderRadius: 8,
        padding: Spacing.three,
        width: "100%",
        maxWidth: 320,
      }}
    />
  );
}
