// Résolution de la famille active d'un joueur.
//
// Un joueur a une fiche par famille (voir concept.md) : `persons.user_id` n'est donc pas unique,
// il faut toujours choisir LAQUELLE des lignes est "la famille courante". Avant le 2026-11-20,
// chaque écran refaisait sa propre requête `.limit(1).maybeSingle()` sans ORDER BY pour deviner
// sa famille : rien ne garantit l'ordre renvoyé par Postgres sans tri explicite, et surtout rien
// ne faisait le lien avec la famille affichée ailleurs (bandeau de l'accueil). Résultat observé :
// plusieurs écrans atterrissaient sur une famille différente de celle qu'on venait de consulter.
// Toute résolution de "quelle famille" passe maintenant par ce module, avec un choix mémorisé sur
// l'appareil (AsyncStorage) qui reste cohérent d'un écran à l'autre tant qu'on ne change pas de
// famille explicitement (menu du bandeau, ou lien contenant ?family=...).
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/lib/supabase";

export type MyFamilyMembership = {
  personId: string;
  familyId: string;
  familyName: string;
  firstName: string;
};

const KEY_PREFIX = "quizamily:currentFamily:";

export async function getPersistedFamilyId(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_PREFIX + userId);
  } catch {
    return null;
  }
}

export async function setPersistedFamilyId(userId: string, familyId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + userId, familyId);
  } catch {
    // préférence locale indisponible : tant pis, la résolution retombera sur la 1re famille
  }
}

/** Toutes les familles où ce joueur a une fiche (kind=player), dans un ordre arbitraire. */
export async function listMyFamilies(userId: string): Promise<MyFamilyMembership[]> {
  const { data } = await supabase
    .from("persons")
    .select("id, family_id, first_name, families(name)")
    .eq("user_id", userId)
    .eq("kind", "player");

  return (data ?? []).map((row) => ({
    personId: row.id as string,
    familyId: row.family_id as string,
    familyName: (row.families as unknown as { name: string } | null)?.name ?? "Famille",
    firstName: row.first_name as string,
  }));
}

/**
 * Résout la famille active parmi `families` : un id explicite (ex. paramètre `family` d'un lien)
 * est prioritaire, sinon la dernière famille mémorisée sur l'appareil si elle est toujours
 * valide, sinon la première trouvée. Mémorise systématiquement le résultat, pour que les écrans
 * suivants (atteints sans paramètre explicite) restent sur la même famille.
 */
export async function resolveMyFamily(
  userId: string,
  families: MyFamilyMembership[],
  explicitFamilyId?: string | null,
): Promise<MyFamilyMembership | null> {
  if (families.length === 0) return null;

  const explicitMatch = explicitFamilyId ? families.find((f) => f.familyId === explicitFamilyId) : undefined;
  if (explicitMatch) {
    await setPersistedFamilyId(userId, explicitMatch.familyId);
    return explicitMatch;
  }

  const stored = await getPersistedFamilyId(userId);
  const storedMatch = stored ? families.find((f) => f.familyId === stored) : undefined;
  if (storedMatch) return storedMatch;

  await setPersistedFamilyId(userId, families[0].familyId);
  return families[0];
}
