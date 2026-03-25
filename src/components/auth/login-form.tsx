"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Impersonation: si on arrive avec ?impersonate=1, utiliser les tokens stockés
  useEffect(() => {
    if (searchParams.get("impersonate") !== "1") return;
    const raw = localStorage.getItem("sb-impersonate");
    if (!raw) return;
    localStorage.removeItem("sb-impersonate");
    (async () => {
      try {
        const { access_token, refresh_token } = JSON.parse(raw);
        const { data, error: sessErr } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessErr || !data.user) {
          setError("Impersonation échouée: " + (sessErr?.message || "session invalide"));
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .single();
        const dest = profile?.role === "admin" || profile?.role === "superadmin"
          ? "/admin/dashboard" : "/dashboard";
        window.location.assign(dest);
      } catch { setError("Erreur impersonation"); }
    })();
  }, [searchParams, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    let redirected = false;

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data.user) {
        setError("Email ou mot de passe incorrect");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      const destination =
        profile?.role === "admin" || profile?.role === "superadmin"
          ? "/admin/dashboard"
          : "/dashboard";

      redirected = true;
      window.location.assign(destination);
    } catch {
      setError("La connexion a échoué. Réessaie dans quelques secondes.");
    } finally {
      if (!redirected) {
        setLoading(false);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
          placeholder="votre@email.com"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-navy py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
      >
        {loading ? "Connexion..." : "Se connecter"}
      </button>

      <p className="text-center text-sm text-gray-500">
        Pas encore de compte ?{" "}
        <Link href="/register" className="font-medium text-navy hover:underline">
          S&apos;inscrire
        </Link>
      </p>
    </form>
  );
}
