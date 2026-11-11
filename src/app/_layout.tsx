import { Fredoka_500Medium, Fredoka_600SemiBold, useFonts as useFredoka } from "@expo-google-fonts/fredoka";
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, useFonts as useNunito } from "@expo-google-fonts/nunito";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { supabase } from "@/lib/supabase";

// Polices de la charte (docs/design.md), pour l'instant utilisées par l'écran d'accueil.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fredokaLoaded, fredokaError] = useFredoka({ Fredoka_500Medium, Fredoka_600SemiBold });
  const [nunitoLoaded, nunitoError] = useNunito({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const fontsReady = (fredokaLoaded || !!fredokaError) && (nunitoLoaded || !!nunitoError);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync();
  }, [fontsReady]);

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

  if (!fontsReady) return null;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
