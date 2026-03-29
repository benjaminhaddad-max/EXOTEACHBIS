"use client";

import { useState, useTransition } from "react";
import { Eye, Loader2, Users, Search } from "lucide-react";
import type { Groupe, Profile } from "@/types/database";

type GroupeLite = Pick<Groupe, "id" | "name" | "color" | "annee">;
type StudentLite = Pick<Profile, "id" | "first_name" | "last_name" | "email" | "avatar_url" | "groupe_id">;

export function CoachStudentPicker({
  groupes,
  students,
}: {
  groupes: GroupeLite[];
  students: StudentLite[];
}) {
  const [selectedGroupe, setSelectedGroupe] = useState<string>(groupes[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [loadingStudentId, setLoadingStudentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredStudents = students.filter((s) => {
    if (s.groupe_id !== selectedGroupe) return false;
    if (!search) return true;
    const name = `${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const handleImpersonate = (studentId: string) => {
    setLoadingStudentId(studentId);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: studentId }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Erreur");
          setLoadingStudentId(null);
          return;
        }

        // Open impersonate page in same tab (like the existing flow)
        const url = `/impersonate#access_token=${data.access_token}&refresh_token=${data.refresh_token}`;
        window.location.href = url;
      } catch (e: any) {
        setError(e.message);
        setLoadingStudentId(null);
      }
    });
  };

  const getInitials = (s: StudentLite) => {
    return `${(s.first_name?.[0] ?? "").toUpperCase()}${(s.last_name?.[0] ?? "").toUpperCase()}`;
  };

  const getDisplayName = (s: StudentLite) => {
    const name = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
    return name || s.email || "Inconnu";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[#12314d]">Vue élève</h2>
        <p className="text-sm text-[#7d8c9e] mt-1">
          Choisis un élève pour voir la plateforme comme lui.
        </p>
      </div>

      {/* Groupe selector */}
      <div className="flex gap-2 flex-wrap">
        {groupes.map((g) => {
          const count = students.filter((s) => s.groupe_id === g.id).length;
          return (
            <button
              key={g.id}
              onClick={() => { setSelectedGroupe(g.id); setSearch(""); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                selectedGroupe === g.id
                  ? "bg-[#12314d] text-white border-[#12314d] shadow-sm"
                  : "bg-white text-[#5d7085] border-[#e5edf6] hover:border-[#12314d]/30 hover:bg-[#f8fbfe]"
              }`}
            >
              <Users className="h-4 w-4" />
              {g.name}
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                selectedGroupe === g.id ? "bg-white/20 text-white" : "bg-[#e5edf6] text-[#5d7085]"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a98a8]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un élève..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#e5edf6] text-sm focus:outline-none focus:ring-2 focus:ring-[#12314d]/20 focus:border-[#12314d]/40"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Students grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredStudents.map((student) => {
          const isLoading = loadingStudentId === student.id;
          return (
            <div
              key={student.id}
              className="flex items-center justify-between rounded-xl border border-[#e5edf6] bg-white px-4 py-3 hover:border-[#12314d]/20 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                {student.avatar_url ? (
                  <img
                    src={student.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#12314d] text-[11px] font-bold text-white shrink-0">
                    {getInitials(student)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#12314d] truncate">
                    {getDisplayName(student)}
                  </p>
                  <p className="text-[11px] text-[#8a98a8] truncate">{student.email}</p>
                </div>
              </div>
              <button
                onClick={() => handleImpersonate(student.id)}
                disabled={isPending}
                className="ml-2 shrink-0 flex items-center gap-1 rounded-lg bg-[#12314d] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0f2940] disabled:opacity-50 transition-all"
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                Voir
              </button>
            </div>
          );
        })}
      </div>

      {filteredStudents.length === 0 && (
        <p className="text-center text-sm text-[#8a98a8] py-8">
          {search ? "Aucun élève trouvé." : "Aucun élève dans cette classe."}
        </p>
      )}
    </div>
  );
}
