"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ImpersonatePage() {
  const [status, setStatus] = useState("Connexion en cours...");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      try {
        // Lire les tokens depuis le hash (pas envoyé au serveur)
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (!accessToken || !refreshToken) {
          setStatus("Tokens manquants.");
          return;
        }

        // D'abord se déconnecter (vider la session admin)
        await supabase.auth.signOut();

        // Puis se connecter avec les tokens de l'utilisateur cible
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error || !data.user) {
          setStatus("Erreur: " + (error?.message || "session invalide"));
          return;
        }

        // Déterminer la destination
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, first_name, last_name")
          .eq("id", data.user.id)
          .single();

        const name = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
        setStatus(`Connecté en tant que ${name || data.user.email}...`);

        const dest = profile?.role === "admin" || profile?.role === "superadmin"
          ? "/admin/dashboard"
          : "/dashboard";

        setTimeout(() => {
          router.push(dest);
          router.refresh();
        }, 500);
      } catch (e: any) {
        setStatus("Erreur: " + e.message);
      }
    })();
  }, [supabase, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0e1e35, #162d4a)" }}>
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-white/20 border-t-[#C9A84C] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/80 text-sm font-medium">{status}</p>
      </div>
    </div>
  );
}
