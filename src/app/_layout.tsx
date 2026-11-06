import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { supabase } from "@/lib/supabase";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Expo Router consomme/réécrit l'URL (y compris sur les routes dynamiques comme
    // /join/[token]) avant que le client Supabase ait pu lire le fragment #access_token=...
    // laissé par un lien magique, donc detectSessionInUrl ne suffit pas partout. On traite
    // le fragment nous-mêmes ici, une fois, au niveau racine (donc sur n'importe quel écran).
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    supabase.auth.setSession({ access_token, refresh_token }).then(() => {
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", cleanUrl);
    });
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
