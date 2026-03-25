"use client";

import { useState, useEffect } from "react";
import { Eye, ArrowLeft } from "lucide-react";

function clearAllAuth() {
  // Remove impersonation flags
  localStorage.removeItem("impersonate_active");
  localStorage.removeItem("impersonate_name");
  localStorage.removeItem("impersonate_admin_access_token");
  localStorage.removeItem("impersonate_admin_refresh_token");
  // Clear all Supabase auth storage
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

export function ImpersonationBanner() {
  const [active, setActive] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const isActive = localStorage.getItem("impersonate_active") === "true";
    if (isActive) {
      setActive(true);
      setName(localStorage.getItem("impersonate_name") || "");
    }
  }, []);

  const handleReturn = () => {
    clearAllAuth();
    window.location.href = "/login";
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
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-xs font-semibold transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Revenir admin
      </button>
    </div>
  );
}
