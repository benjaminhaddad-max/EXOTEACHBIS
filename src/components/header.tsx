"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useUser } from "@/hooks/use-user";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbItem[];
}

export function Header({ title, subtitle, breadcrumb }: HeaderProps) {
  const { profile } = useUser();

  const roleLabel =
    profile?.role === "superadmin" ? "Super Admin"
    : profile?.role === "admin" ? "Administrateur"
    : profile?.role === "coach" ? "Coach"
    : profile?.role === "prof" ? "Professeur"
    : "Élève";

  return (
    <header className="mb-8 pb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-2 flex items-center gap-1 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              {item.href ? (
                <Link href={item.href} className="transition-colors" style={{ color: "rgba(201,168,76,0.6)" }}
                  onMouseOver={e => e.currentTarget.style.color = "#C9A84C"}
                  onMouseOut={e => e.currentTarget.style.color = "rgba(201,168,76,0.6)"}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white/90">{title}</h1>
          {subtitle && <p className="text-sm text-white/50 mt-0.5">{subtitle}</p>}
          <div className="mt-1.5 h-0.5 w-10 rounded-full" style={{ background: "linear-gradient(90deg, #C9A84C, rgba(201,168,76,0.3))" }} />
        </div>
        <div className="hidden lg:flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-white/80">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{roleLabel}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold" style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.08))", color: "#E3C286", border: "1px solid rgba(201,168,76,0.2)" }}>
            {profile
              ? `${(profile.first_name || "")[0] || ""}${(profile.last_name || "")[0] || ""}`.toUpperCase()
              : "?"}
          </div>
        </div>
      </div>
    </header>
  );
}
