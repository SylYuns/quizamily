// Lien d'invitation de la famille (bandeau, voir src/components/family-header.tsx), et carte
// « Lancer votre premier quiz » de l'accueil qui propose aussi d'inviter. Se recharge à chaque
// changement de famille.
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export function useInviteLink(familyId: string | null) {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!familyId) {
        setInviteLink(null);
        return;
      }
      const { data } = await supabase.from("invites").select("token").eq("family_id", familyId).limit(1).maybeSingle();
      if (cancelled) return;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setInviteLink(data ? `${origin}/join/${data.token}` : null);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  async function copy() {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return { inviteLink, copied, copy };
}
