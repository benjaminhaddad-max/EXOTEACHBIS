"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, CheckCircle, Clock, Play, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { AskQuestionDrawer } from "@/components/qa/ask-question-drawer";

interface SerieItem {
  id: string;
  name: string;
  type: string;
  timed: boolean;
  nb_questions: number;
  last_attempt: { score: number | null; ended_at: string | null } | null;
}

interface SeriesListProps {
  series: SerieItem[];
  onAskQuestion?: () => void;
  qaContext?: {
    coursId: string;
    matiereId?: string;
    dossierId?: string;
    contextLabel?: string;
  };
}

const typeLabel: Record<string, string> = {
  entrainement: "QCM d'entraînement",
  concours_blanc: "Concours blanc",
  revision: "Révision",
  annales: "Annales corrigées",
  qcm_supplementaires: "QCM supplémentaires",
};

const typeColor: Record<string, string> = {
  entrainement: "bg-blue-100 text-blue-700",
  concours_blanc: "bg-orange-100 text-orange-700",
  revision: "bg-green-100 text-green-700",
  annales: "bg-amber-100 text-amber-700",
  qcm_supplementaires: "bg-teal-100 text-teal-700",
};

export function SeriesList({ series, onAskQuestion, qaContext }: SeriesListProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleAsk = onAskQuestion ?? (qaContext ? () => setDrawerOpen(true) : undefined);

  return (
    <>
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 bg-navy px-4 py-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-gold" />
          <h3 className="text-sm font-semibold text-white">Séries d&apos;exercices</h3>
        </div>
        {handleAsk && (
          <button
            onClick={handleAsk}
            title="Poser une question"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <MessageCircleQuestion size={14} />
            <span className="hidden sm:inline">Question</span>
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {series.length === 0 && (
          <div className="px-4 py-8 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-gray-200" />
            <p className="mt-2 text-sm text-gray-400">Aucune série disponible</p>
            <p className="text-xs text-gray-300 mt-1">Le professeur ajoutera des exercices bientôt</p>
          </div>
        )}
        {series.map((serie) => {
          const done = serie.last_attempt?.ended_at != null;
          const score = serie.last_attempt?.score;

          return (
            <div key={serie.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{serie.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", typeColor[serie.type] ?? "bg-gray-100 text-gray-600")}>
                    {typeLabel[serie.type] ?? serie.type}
                  </span>
                  {serie.timed && (
                    <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                      <Clock className="h-3 w-3" />
                      Chronométré
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">{serie.nb_questions} questions</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {done && score != null && (
                  <span className={cn(
                    "text-xs font-semibold",
                    score >= 70 ? "text-green-600" : score >= 50 ? "text-orange-500" : "text-red-500"
                  )}>
                    {Math.round(score)}%
                  </span>
                )}
                <Link
                  href={`/serie/${serie.id}`}
                  className="flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-light transition-colors"
                >
                  {done ? (
                    <>
                      <CheckCircle className="h-3 w-3" />
                      Reprendre
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" />
                      Démarrer
                    </>
                  )}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {drawerOpen && qaContext && (
      <AskQuestionDrawer
        contextType="cours"
        coursId={qaContext.coursId}
        matiereId={qaContext.matiereId}
        dossierId={qaContext.dossierId}
        contextLabel={qaContext.contextLabel}
        onClose={() => setDrawerOpen(false)}
      />
    )}
    </>
  );
}
