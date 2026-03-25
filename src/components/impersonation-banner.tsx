"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Eye } from "lucide-react";

export function ImpersonationBanner() {
  const [active, setActive] = useState(false);
  const [name, setName] = useState("");
  const [returning, setReturning] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const isActive = localStorage.getItem("impersonate_active") === "true";
    if (isActive) {
      setActive(true);
      setName(localStorage.getItem("impersonate_name") || "");
    }
  }, []);

  const handleReturn = async () => {
    setReturning(true);
    try {
      const accessToken = localStorage.getItem("impersonate_admin_access_token");
      const refreshToken = localStorage.getItem("impersonate_admin_refresh_token");

      if (!accessToken || !refreshToken) {
        // No saved admin session — redirect to login
        localStorage.removeItem("impersonate_active");
        localStorage.removeItem("impersonate_name");
        localStorage.removeItem("impersonate_admin_access_token");
        localStorage.removeItem("impersonate_admin_refresh_token");
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      // Sign out the impersonated user
      await supabase.auth.signOut();

      // Restore admin session
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      // Cleanup localStorage
      localStorage.removeItem("impersonate_active");
      localStorage.removeItem("impersonate_name");
      localStorage.removeItem("impersonate_admin_access_token");
      localStorage.removeItem("impersonate_admin_refresh_token");

      if (error) {
        // Token expired — redirect to login
        router.push("/login");
        return;
      }

      router.push("/admin/utilisateurs");
      router.refresh();
    } catch {
      localStorage.removeItem("impersonate_active");
      router.push("/login");
    }
  };

  if (!active) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-500 text-white px-4 py-1.5 flex items-center justify-center gap-3 text-sm font-medium shadow-md">
      <Eye className="w-4 h-4 shrink-0" />
      <span>
        Connecté en tant que <strong>{name}</strong>
      </span>
      <button
        onClick={handleReturn}
        disabled={returning}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:opacity-50"
      >
        <ArrowLeft className="w-3 h-3" />
        {returning ? "Retour..." : "Revenir admin"}
      </button>
    </div>
  );
}
