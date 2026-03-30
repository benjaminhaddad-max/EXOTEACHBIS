"use client";

import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
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

  const sidebarContent = (
    <div className="flex h-full flex-col" style={{ backgroundColor: "#0e1e35" }}>
      {/* Logo */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }} className="py-3 px-4">
        <img
          src="/logo-ds.svg"
          alt="Diploma Santé"
          className="w-full h-14 object-contain object-left"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {children}
      </nav>

      {/* User + Logout */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }} className="p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
            style={loading
              ? { backgroundColor: "rgba(255,255,255,0.05)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }
              : { backgroundColor: "rgba(201,168,76,0.2)", color: "#C9A84C", boxShadow: "inset 0 0 0 1px rgba(201,168,76,0.3)" }
            }
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium" style={{ color: "#ffffff" }}>
              {loading ? <span className="inline-block h-3 w-24 rounded" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} /> : `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "—"}
            </p>
            <p className="truncate text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
              {loading ? "" : profile?.role === "superadmin" ? "Super Admin"
                : profile?.role === "admin" ? "Administrateur"
                : profile?.role === "coach" ? "Coach"
                : profile?.role === "prof" ? "Professeur"
                : profile?.role === "eleve" ? "Élève"
                : ""}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgba(255,255,255,0.1)]"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          <LogOut className="h-4 w-4" />
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
        className="fixed top-4 left-4 z-50 rounded-lg p-2 text-white shadow-lg lg:hidden"
        style={{ backgroundColor: "#0e1e35" }}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-72 shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 z-50 text-white/70 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block lg:w-72 lg:shrink-0">
        <div className="fixed inset-y-0 left-0 z-30 w-72">{sidebarContent}</div>
      </div>
    </>
  );
}
