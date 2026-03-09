"use client";

import { useUser } from "@/hooks/use-user";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { profile } = useUser();

  return (
    <header className="mb-8 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      </div>
      <div className="hidden lg:flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">
            {profile?.first_name} {profile?.last_name}
          </p>
          <p className="text-xs text-gray-500">
            {profile?.role === "admin" ? "Administrateur" : "Élève"}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-semibold text-gold">
          {profile
            ? `${(profile.first_name || "")[0] || ""}${(profile.last_name || "")[0] || ""}`.toUpperCase()
            : "?"}
        </div>
      </div>
    </header>
  );
}
