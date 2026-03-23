"use client";

import Link from "next/link";
import { ClipboardList, CheckCircle, Clock, Play } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

const typeLabel: Record<string, string> = {
  entrainement: "QCM d'entraînement",
  concours_blanc: "Concours blanc",
  revision: "Révision",
};

const typeColor: Record<string, string> = {
  entrainement: "bg-blue-100 text-blue-700",
  concours_blanc: "bg-orange-100 text-orange-700",
  revision: "bg-green-100 text-green-700",
};

export function SeriesList({ series }: SeriesListProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-navy px-4 py-3">
        <ClipboardList className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-semibold text-white">Séries d'exercices</h3>
      </div>

      <div className="divide-y divide-gray-100">
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
  );
}
