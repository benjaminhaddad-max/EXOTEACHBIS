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
  breadcrumb?: BreadcrumbItem[];
}

export function Header({ title, breadcrumb }: HeaderProps) {
  const { profile } = useUser();

  const roleLabel =
    profile?.role === "superadmin" ? "Super Admin"
    : profile?.role === "admin" ? "Administrateur"
    : profile?.role === "coach" ? "Coach"
    : profile?.role === "prof" ? "Professeur"
    : "Élève";

  return (
    <header className="mb-8 border-b border-gray-200 pb-5">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-2 flex items-center gap-1 text-xs text-gray-400">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              {item.href ? (
                <Link href={item.href} className="hover:text-navy transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className="text-gray-600 font-medium">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">{title}</h1>
          <div className="mt-1.5 h-0.5 w-10 rounded-full bg-gold" />
        </div>
        <div className="hidden lg:flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-xs text-gray-500">{roleLabel}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-semibold text-gold ring-2 ring-gold/30">
            {profile
              ? `${(profile.first_name || "")[0] || ""}${(profile.last_name || "")[0] || ""}`.toUpperCase()
              : "?"}
          </div>
        </div>
      </div>
    </header>
  );
}
