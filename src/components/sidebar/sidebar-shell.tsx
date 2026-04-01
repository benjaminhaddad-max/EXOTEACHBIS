"use client";

import { useState } from "react";
import { LogOut, Menu, X, ChevronRight } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useRouter } from "next/navigation";

interface SidebarShellProps {
  children: React.ReactNode;
}

export function SidebarShell({ children }: SidebarShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, signOut, loading } = useUser();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const initials = profile
    ? `${(profile.first_name || "")[0] || ""}${(profile.last_name || "")[0] || ""}`.toUpperCase() || "?"
    : loading ? "" : "?";

  const roleLabel = profile?.role === "superadmin" ? "Super Admin"
    : profile?.role === "admin" ? "Administrateur"
    : profile?.role === "coach" ? "Coach"
    : profile?.role === "prof" ? "Professeur"
    : profile?.role === "eleve" ? "Élève" : "";

  const sidebarContent = (
    <div className="flex h-full flex-col relative overflow-hidden" style={{ background: "linear-gradient(195deg, #0B1628 0%, #0E1E35 35%, #0A1525 100%)" }}>
      {/* Decorative glow */}
      <div className="absolute top-0 left-0 right-0 h-40 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 60% at 30% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 60% at 70% 100%, rgba(79,171,219,0.04) 0%, transparent 70%)" }} />

      {/* Logo */}
      <div className="relative px-5 pt-5 pb-4">
        <img
          src="/logo-diploma-sante-white.svg"
          alt="Diploma Santé"
          className="h-10 object-contain object-left"
          draggable={false}
        />
        <div className="mt-3 h-px" style={{ background: "linear-gradient(90deg, rgba(201,168,76,0.3), rgba(201,168,76,0.08), transparent)" }} />
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {children}
      </nav>

      {/* User card */}
      <div className="relative px-3 pb-3 pt-2">
        <div className="h-px mb-3" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }} />
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold shrink-0"
            style={loading
              ? { backgroundColor: "rgba(255,255,255,0.05)" }
              : { background: "linear-gradient(135deg, rgba(201,168,76,0.25), rgba(201,168,76,0.1))", color: "#E3C286", border: "1px solid rgba(201,168,76,0.2)" }
            }
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[13px] font-semibold text-white/90">
              {loading ? <span className="inline-block h-3 w-20 rounded bg-white/5" /> : `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "—"}
            </p>
            {!loading && roleLabel && (
              <p className="text-[10px] font-medium mt-0.5" style={{ color: "rgba(201,168,76,0.6)" }}>{roleLabel}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-medium transition-all group"
          style={{ color: "rgba(255,255,255,0.35)" }}
          onMouseOver={e => { e.currentTarget.style.color = "rgba(239,68,68,0.8)"; e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.06)"; }}
          onMouseOut={e => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Déconnexion</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 rounded-xl p-2.5 text-white shadow-lg lg:hidden"
        style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(201,168,76,0.2)" }}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-72 shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 z-50 text-white/50 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block lg:w-[260px] lg:shrink-0">
        <div className="fixed inset-y-0 left-0 z-30 w-[260px]" style={{ boxShadow: "4px 0 24px rgba(0,0,0,0.3)" }}>
          {sidebarContent}
        </div>
      </div>
    </>
  );
}
