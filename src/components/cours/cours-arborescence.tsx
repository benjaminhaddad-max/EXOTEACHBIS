"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, BookOpen, Layers, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dossier, Matiere } from "@/types/database";

interface CoursArborescenceProps {
  dossiers: Dossier[];
}

export function CoursArborescence({ dossiers }: CoursArborescenceProps) {
  if (!dossiers.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-16 text-center">
        <BookOpen className="h-12 w-12 text-gray-300" />
        <p className="mt-4 text-lg font-semibold text-gray-700">Aucun cours disponible</p>
        <p className="mt-1 text-sm text-gray-400">Les cours seront ajoutés prochainement.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dossiers.map((dossier) => (
        <DossierCard key={dossier.id} dossier={dossier} />
      ))}
    </div>
  );
}

function DossierCard({ dossier }: { dossier: Dossier }) {
  const [open, setOpen] = useState(true);
  const matieres = dossier.matieres ?? [];
  const totalCours = matieres.reduce((acc, m) => acc + (m.nb_cours ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header dossier */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-gray-50"
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: dossier.color + "20" }}
        >
          {dossier.icon_url ? (
            <img src={dossier.icon_url} alt="" className="h-6 w-6 object-contain" />
          ) : (
            <FolderOpen className="h-5 w-5" style={{ color: dossier.color }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{dossier.name}</p>
          <p className="text-xs text-gray-500">
            {matieres.length} matière{matieres.length !== 1 ? "s" : ""} · {totalCours} cours
          </p>
        </div>
        <ChevronRight
          className={cn(
            "h-5 w-5 shrink-0 text-gray-400 transition-transform",
            open && "rotate-90"
          )}
        />
      </button>

      {/* Liste matières */}
      {open && matieres.length > 0 && (
        <div className="border-t border-gray-100 grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
          {matieres.map((matiere) => (
            <MatiereRow key={matiere.id} matiere={matiere} />
          ))}
        </div>
      )}

      {open && matieres.length === 0 && (
        <div className="border-t border-gray-100 p-4 text-center text-sm text-gray-400">
          Aucune matière dans ce dossier
        </div>
      )}
    </div>
  );
}

function MatiereRow({ matiere }: { matiere: Matiere }) {
  return (
    <Link
      href={`/cours/matiere/${matiere.id}`}
      className="flex items-center gap-3 p-4 transition-colors hover:bg-gray-50 group"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: matiere.color + "20" }}
      >
        <Layers className="h-4 w-4" style={{ color: matiere.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 group-hover:text-navy truncate">
          {matiere.name}
        </p>
        <p className="text-xs text-gray-400">{matiere.nb_cours ?? 0} cours</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-navy transition-colors" />
    </Link>
  );
}
