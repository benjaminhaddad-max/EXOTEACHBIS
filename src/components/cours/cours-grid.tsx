"use client";

import Link from "next/link";
import { BookOpen, ClipboardList, ChevronRight, Layers } from "lucide-react";

type DossierCard = {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  icon_url?: string | null;
  etiquettes?: string[];
  nbCours: number;
  nbQuestions: number;
  progress: number;
  matieres: { id: string; name: string; color: string }[];
};

// Palette de dégradés prédéfinis qui tournent selon l'index
const GRADIENTS = [
  ["#E8F4FD", "#BFD9F2"],   // bleu
  ["#FDE8F0", "#F2BFD4"],   // rose
  ["#E8FDF0", "#BFF2D4"],   // vert
  ["#FDF5E8", "#F2DFB F"],  // orange
  ["#F0E8FD", "#D4BFF2"],   // violet
  ["#E8FDFD", "#BFF2F2"],   // cyan
  ["#FDE8E8", "#F2BFBF"],   // rouge
  ["#F5FDE8", "#DCF2BF"],   // lime
];


export function CoursGrid({ dossiers }: { dossiers: DossierCard[] }) {
  if (!dossiers.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <BookOpen className="h-12 w-12 text-gray-300 mb-3" />
        <p className="text-base font-semibold text-gray-600">Aucun cours disponible</p>
        <p className="text-sm text-gray-400 mt-1">Les cours seront ajoutés prochainement.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {dossiers.map((dossier) => (
        <DossierCardItem key={dossier.id} dossier={dossier} />
      ))}
    </div>
  );
}

function DossierCardItem({ dossier }: { dossier: DossierCard }) {
  const color = dossier.color ?? "#6366F1";
  const bg1 = color + "22";
  const bg2 = color + "44";

  const firstMatiere = dossier.matieres[0];

  return (
    <div className="group flex flex-col rounded-2xl overflow-hidden shadow-sm border border-gray-100 bg-white hover:shadow-md transition-all duration-200">
      {/* Top — coloré */}
      <div
        className="relative flex items-start justify-between p-5 pb-4 min-h-[130px]"
        style={{ background: `linear-gradient(135deg, ${bg1} 0%, ${bg2} 100%)` }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: color + "33", color }}
            >
              Dossier
            </span>
            {dossier.etiquettes?.map((tag) => (
              <span
                key={tag}
                className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: color + "15", color }}
              >
                {tag}
              </span>
            ))}
          </div>
          <h3 className="text-base font-bold text-gray-900 leading-tight">{dossier.name}</h3>
          {dossier.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{dossier.description}</p>
          )}
        </div>

        {/* Illustration */}
        <div
          className="ml-3 flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl text-3xl"
          style={{ backgroundColor: color + "22" }}
        >
          {dossier.icon_url ? (
            <img src={dossier.icon_url} alt="" className="w-9 h-9 object-contain" />
          ) : (
            <Layers className="w-7 h-7" style={{ color }} />
          )}
        </div>
      </div>

      {/* Bottom — blanc */}
      <div className="flex flex-col flex-1 p-4 pt-3 gap-3">
        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" style={{ color }} />
            <span className="font-medium text-gray-700">{dossier.nbCours}</span> cours
          </span>
          <span className="text-gray-300">·</span>
          <span className="flex items-center gap-1">
            <ClipboardList className="h-3.5 w-3.5" style={{ color }} />
            <span className="font-medium text-gray-700">{dossier.nbQuestions}</span> exercices
          </span>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">Progression</span>
            <span className="text-xs font-semibold" style={{ color }}>{dossier.progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${dossier.progress}%`, backgroundColor: color }}
            />
          </div>
        </div>

        {/* Bouton Accéder */}
        <div className="mt-auto pt-1">
          {firstMatiere ? (
            <Link
              href={`/cours/matiere/${firstMatiere.id}`}
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: color }}
            >
              Accéder
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <button
              disabled
              className="flex items-center justify-center w-full py-2 rounded-xl text-sm font-semibold text-gray-400 bg-gray-100 cursor-not-allowed"
            >
              Bientôt disponible
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
