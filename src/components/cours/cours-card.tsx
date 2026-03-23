"use client";

import Link from "next/link";
import { FileText, ClipboardList, ChevronRight, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Cours } from "@/types/database";

interface CoursCardProps {
  cours: Cours & {
    series?: { id: string; name: string; type: string; nb_questions: number }[];
    user_progress?: { pct_complete: number; current_page: number } | null;
  };
}

export function CoursCard({ cours }: CoursCardProps) {
  const progress = cours.user_progress?.pct_complete ?? 0;
  const nbSeries = cours.series?.length ?? 0;
  const totalQuestions = cours.series?.reduce((acc, s) => acc + (s.nb_questions ?? 0), 0) ?? 0;
  const completed = progress >= 100;

  return (
    <Link
      href={`/cours/${cours.id}`}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md hover:border-navy/30 overflow-hidden"
    >
      {/* Thumbnail / header coloré */}
      <div className="relative h-28 bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center overflow-hidden">
        <FileText className="h-12 w-12 text-blue-300" />
        {completed && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            <CheckCircle className="h-3 w-3" />
            Terminé
          </div>
        )}
        {cours.version > 1 && (
          <div className="absolute top-2 left-2 rounded-full bg-white/80 px-2 py-0.5 text-xs text-gray-500">
            v{cours.version}
          </div>
        )}
      </div>

      {/* Contenu */}
      <div className="flex flex-1 flex-col p-4">
        <p className="font-semibold text-gray-900 group-hover:text-navy line-clamp-2 leading-tight">
          {cours.name}
        </p>

        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {cours.nb_pages} pages
          </span>
          {nbSeries > 0 && (
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3 w-3" />
              {totalQuestions} exercices
            </span>
          )}
        </div>

        {/* Barre de progression */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Progression</span>
            <span className={cn("text-xs font-medium", completed ? "text-green-600" : "text-navy")}>
              {progress}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                completed ? "bg-green-500" : "bg-navy"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2">
        <span className="text-xs text-gray-400">
          {progress === 0 ? "Commencer" : progress < 100 ? "Reprendre" : "Revoir"}
        </span>
        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-navy transition-colors" />
      </div>
    </Link>
  );
}
