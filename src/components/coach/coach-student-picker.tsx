"use client";

import { useState, useTransition } from "react";
import { Eye, Loader2, Users } from "lucide-react";
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
  const [isPending, startTransition] = useTransition();
  const [loadingGroupeId, setLoadingGroupeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = (groupeId: string) => {
    // Find first student in this groupe
    const student = students.find((s) => s.groupe_id === groupeId);
    if (!student) {
      setError("Aucun élève dans cette classe.");
      return;
    }

    setLoadingGroupeId(groupeId);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: student.id }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Erreur");
          setLoadingGroupeId(null);
          return;
        }

        const url = `/impersonate#access_token=${data.access_token}&refresh_token=${data.refresh_token}`;
        window.location.href = url;
      } catch (e: any) {
        setError(e.message);
        setLoadingGroupeId(null);
      }
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-[#12314d]">Vue élève</h2>
        <p className="text-sm text-[#7d8c9e] mt-1">
          Choisis une classe pour voir la plateforme comme un élève.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
        {groupes.map((g) => {
          const count = students.filter((s) => s.groupe_id === g.id).length;
          const isLoading = loadingGroupeId === g.id;

          return (
            <button
              key={g.id}
              onClick={() => handleConnect(g.id)}
              disabled={isPending || count === 0}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-[#e5edf6] bg-white p-6 hover:border-[#12314d] hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#f0f4f9] group-hover:bg-[#12314d] transition-all">
                {isLoading ? (
                  <Loader2 className="h-6 w-6 text-[#12314d] group-hover:text-white animate-spin" />
                ) : (
                  <Users className="h-6 w-6 text-[#5d7085] group-hover:text-white transition-all" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-[#12314d]">{g.name}</p>
                <p className="text-[11px] text-[#8a98a8] mt-0.5">{count} élève{count > 1 ? "s" : ""}</p>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-medium text-[#5d7085] group-hover:text-[#12314d] transition-all">
                <Eye className="h-3 w-3" />
                Se connecter
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
