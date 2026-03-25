"use client";

import { useState, useTransition } from "react";
import { Check, AlertCircle, Loader2, Pencil } from "lucide-react";
import { updateProfile } from "@/app/(eleve)/profil/actions";
import type { Profile } from "@/types/database";

export function ProfilForm({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(profile.first_name ?? "");
  const [lastName, setLastName] = useState(profile.last_name ?? "");
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateProfile({ first_name: firstName, last_name: lastName });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      showToast("Profil mis à jour", "success");
      setEditing(false);
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
      {toast && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
            toast.kind === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Informations personnelles</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-navy border border-navy/20 rounded-lg hover:bg-navy/5 transition-colors"
          >
            <Pencil size={12} /> Modifier
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Prénom</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Nom</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setEditing(false); setFirstName(profile.first_name ?? ""); setLastName(profile.last_name ?? ""); }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-semibold rounded-lg hover:bg-navy-light disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Prénom</p>
              <p className="text-sm font-medium text-gray-900">{profile.first_name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Nom</p>
              <p className="text-sm font-medium text-gray-900">{profile.last_name || "—"}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Email</p>
            <p className="text-sm text-gray-700">{profile.email}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Membre depuis</p>
            <p className="text-sm text-gray-700">
              {new Date(profile.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
