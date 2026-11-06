import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY doivent être définis dans .env",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // PKCE (le défaut) exige que le lien soit ouvert sur le même appareil/navigateur qui a
    // demandé la connexion (un "code verifier" local doit correspondre). Pour une app à lien
    // magique où les gens ouvrent souvent l'email sur un autre appareil (ex: demandé sur
    // l'ordinateur, cliqué depuis le téléphone), ça casserait la connexion. Le flux "implicit"
    // fonctionne sur n'importe quel appareil, au prix d'une protection un peu plus faible
    // contre l'interception du lien - un compromis raisonnable ici.
    flowType: "implicit",
  },
});
