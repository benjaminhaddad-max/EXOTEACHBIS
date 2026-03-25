"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import type { User } from "@supabase/supabase-js";

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUser(user);
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(profile);
      }

      setLoading(false);
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        setProfile(profile);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Clear everything immediately — don't wait for async calls
    if (typeof window !== "undefined") {
      // Clear impersonation
      localStorage.removeItem("impersonate_active");
      localStorage.removeItem("impersonate_name");
      localStorage.removeItem("impersonate_admin_access_token");
      localStorage.removeItem("impersonate_admin_refresh_token");
      // Clear all Supabase storage
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith("sb-") || key.includes("supabase")) {
          localStorage.removeItem(key);
        }
      }
      // Clear cookies
      document.cookie.split(";").forEach((c) => {
        const name = c.trim().split("=")[0];
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
    }
    setUser(null);
    setProfile(null);
    // Fire and forget — don't block on these
    supabase.auth.signOut().catch(() => {});
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  };

  return { user, profile, loading, signOut };
}
