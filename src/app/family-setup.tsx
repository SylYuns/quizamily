import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type Gender = "homme" | "femme" | null;

type CentralPerson = {
  firstName: string;
  lastName: string;
  gender: Gender;
  isDeceased: boolean;
  relationshipLabel: string;
};

const RELATIONSHIP_OPTIONS = [
  "Mère",
  "Père",
  "Grand-mère",
  "Grand-père",
  "Arrière-grand-mère",
  "Arrière-grand-père",
  "Tante",
  "Oncle",
  "Marraine",
  "Parrain",
  "Autre",
];

function emptyCentralPerson(): CentralPerson {
  return { firstName: "", lastName: "", gender: null, isDeceased: false, relationshipLabel: "" };
}

export default function FamilySetupScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [familyName, setFamilyName] = useState("");
  const [myFirstName, setMyFirstName] = useState("");
  const [myLastName, setMyLastName] = useState("");
  const [myGender, setMyGender] = useState<Gender>(null);
  const [centralPersons, setCentralPersons] = useState<CentralPerson[]>([emptyCentralPerson()]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  function updateCentralPerson(index: number, patch: Partial<CentralPerson>) {
    setCentralPersons((prev) => prev.map((cp, i) => (i === index ? { ...cp, ...patch } : cp)));
  }

  function addCentralPerson() {
    if (centralPersons.length >= 4) return;
    setCentralPersons((prev) => [...prev, emptyCentralPerson()]);
  }

  function removeCentralPerson(index: number) {
    setCentralPersons((prev) => prev.filter((_, i) => i !== index));
  }

  async function createFamily() {
    if (!userId) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: familyRow, error: familyError } = await supabase
        .from("families")
        .insert({ name: familyName.trim() })
        .select()
        .single();
      if (familyError) throw familyError;

      const familyId = familyRow.id as string;

      const { error: meError } = await supabase.from("persons").insert({
        family_id: familyId,
        kind: "player",
        user_id: userId,
        display_name: `${myFirstName.trim()} ${myLastName.trim()}`.trim(),
        gender: myGender,
      });
      if (meError) throw meError;

      for (const cp of centralPersons) {
        const { error: cpError } = await supabase.from("persons").insert({
          family_id: familyId,
          kind: "profile",
          display_name: `${cp.firstName.trim()} ${cp.lastName.trim()}`.trim(),
          relationship_label: cp.relationshipLabel,
          gender: cp.gender,
          is_central: true,
          is_deceased: cp.isDeceased,
        });
        if (cpError) throw cpError;
      }

      const { data: inviteRow, error: inviteError } = await supabase
        .from("invites")
        .insert({ family_id: familyId })
        .select()
        .single();
      if (inviteError) throw inviteError;

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setInviteLink(`${origin}/join/${inviteRow.token}`);
      setStep(4);
    } catch (e) {
      const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : null;
      setError(message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
  }

  const canGoNextFromStep0 = familyName.trim().length > 0;
  const canGoNextFromStep1 = myFirstName.trim().length > 0 && myLastName.trim().length > 0;
  const canGoNextFromStep2 = centralPersons.every(
    (cp) => cp.firstName.trim().length > 0 && cp.lastName.trim().length > 0 && cp.relationshipLabel.length > 0,
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three, maxWidth: 480, width: "100%", alignSelf: "center" }}>
        {step === 0 && (
          <>
            <ThemedText type="title">Nouvelle famille</ThemedText>
            <ThemedText themeColor="textSecondary">Comment s&apos;appelle ta famille ?</ThemedText>
            <LabeledInput value={familyName} onChangeText={setFamilyName} placeholder="Nom de la famille" />
            <NextButton disabled={!canGoNextFromStep0} onPress={() => setStep(1)} />
          </>
        )}

        {step === 1 && (
          <>
            <ThemedText type="title">Tes infos</ThemedText>
            <LabeledInput value={myFirstName} onChangeText={setMyFirstName} placeholder="Prénom" />
            <LabeledInput value={myLastName} onChangeText={setMyLastName} placeholder="Nom" />
            <GenderPicker value={myGender} onChange={setMyGender} />
            <View style={styles.row}>
              <BackButton onPress={() => setStep(0)} />
              <NextButton disabled={!canGoNextFromStep1} onPress={() => setStep(2)} />
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <ThemedText type="title">Personne(s) centrale(s)</ThemedText>
            <ThemedText themeColor="textSecondary">
              La ou les personnes autour de qui tournera le jeu (1 à 4), par exemple une grand-mère.
            </ThemedText>
            {centralPersons.map((cp, index) => (
              <View key={index} style={styles.centralPersonCard}>
                <LabeledInput
                  value={cp.firstName}
                  onChangeText={(v) => updateCentralPerson(index, { firstName: v })}
                  placeholder="Prénom"
                />
                <LabeledInput
                  value={cp.lastName}
                  onChangeText={(v) => updateCentralPerson(index, { lastName: v })}
                  placeholder="Nom"
                />
                <GenderPicker value={cp.gender} onChange={(g) => updateCentralPerson(index, { gender: g })} />
                <View style={styles.switchRow}>
                  <ThemedText>Décédé(e)</ThemedText>
                  <Switch
                    value={cp.isDeceased}
                    onValueChange={(v) => updateCentralPerson(index, { isDeceased: v })}
                  />
                </View>
                <ThemedText themeColor="textSecondary">Son lien de parenté avec toi</ThemedText>
                <View style={styles.chipsRow}>
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => updateCentralPerson(index, { relationshipLabel: option })}
                      style={[styles.chip, cp.relationshipLabel === option && styles.chipSelected]}
                    >
                      <ThemedText style={cp.relationshipLabel === option ? { color: "#ffffff" } : undefined}>
                        {option}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
                {centralPersons.length > 1 && (
                  <Pressable onPress={() => removeCentralPerson(index)}>
                    <ThemedText type="linkPrimary">Retirer cette personne</ThemedText>
                  </Pressable>
                )}
              </View>
            ))}
            {centralPersons.length < 4 && (
              <Pressable onPress={addCentralPerson}>
                <ThemedText type="linkPrimary">+ Ajouter une personne centrale</ThemedText>
              </Pressable>
            )}
            <View style={styles.row}>
              <BackButton onPress={() => setStep(1)} />
              <NextButton disabled={!canGoNextFromStep2} onPress={() => setStep(3)} />
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <ThemedText type="title">Récapitulatif</ThemedText>
            <ThemedText>Famille : {familyName}</ThemedText>
            <ThemedText>
              Toi : {myFirstName} {myLastName}
            </ThemedText>
            {centralPersons.map((cp, index) => (
              <ThemedText key={index}>
                {cp.firstName} {cp.lastName} — {cp.relationshipLabel}
                {cp.isDeceased ? " (décédé·e)" : ""}
              </ThemedText>
            ))}
            {error.length > 0 && <ThemedText themeColor="text">{error}</ThemedText>}
            <View style={styles.row}>
              <BackButton onPress={() => setStep(2)} />
              <Pressable
                onPress={createFamily}
                disabled={submitting}
                style={[styles.primaryButton, submitting && { opacity: 0.6 }]}
              >
                <ThemedText style={{ color: "#ffffff" }}>
                  {submitting ? "Création…" : "Créer la famille"}
                </ThemedText>
              </Pressable>
            </View>
          </>
        )}

        {step === 4 && inviteLink && (
          <>
            <ThemedText type="title">Famille créée 🎉</ThemedText>
            <ThemedText themeColor="textSecondary">
              Partage ce lien avec les autres membres pour qu&apos;ils rejoignent la famille :
            </ThemedText>
            <ThemedText selectable style={styles.inviteLink}>
              {inviteLink}
            </ThemedText>
            <Pressable onPress={copyInviteLink} style={styles.secondaryButton}>
              <ThemedText>{copied ? "Copié !" : "Copier le lien"}</ThemedText>
            </Pressable>
            <Pressable onPress={() => router.replace("/home")} style={styles.primaryButton}>
              <ThemedText style={{ color: "#ffffff" }}>Continuer</ThemedText>
            </Pressable>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function LabeledInput(props: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      style={styles.input}
    />
  );
}

function GenderPicker(props: { value: Gender; onChange: (g: Gender) => void }) {
  return (
    <View style={styles.chipsRow}>
      {(["femme", "homme"] as const).map((g) => (
        <Pressable
          key={g}
          onPress={() => props.onChange(g)}
          style={[styles.chip, props.value === g && styles.chipSelected]}
        >
          <ThemedText style={props.value === g ? { color: "#ffffff" } : undefined}>
            {g === "femme" ? "Femme" : "Homme"}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

function NextButton(props: { disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.primaryButton, props.disabled && { opacity: 0.5 }]}
    >
      <ThemedText style={{ color: "#ffffff" }}>Suivant</ThemedText>
    </Pressable>
  );
}

function BackButton(props: { onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.secondaryButton}>
      <ThemedText>Retour</ThemedText>
    </Pressable>
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
  row: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
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
  centralPersonCard: {
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  primaryButton: {
    backgroundColor: "#3c87f7",
    borderRadius: 8,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
  },
  inviteLink: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 8,
    padding: Spacing.three,
  },
});
