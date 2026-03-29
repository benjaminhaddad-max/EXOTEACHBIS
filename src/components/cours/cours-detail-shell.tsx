"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  FileText,
  FolderOpen,
  Film,
  Link2,
  ExternalLink,
  ClipboardList,
  CheckCircle,
  Clock,
  Play,
  Filter,
  MessageCircleQuestion,
  Download,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfViewer } from "@/components/cours/pdf-viewer";
import { AskQuestionDrawer } from "@/components/qa/ask-question-drawer";
import type { Ressource } from "@/types/database";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SerieItem {
  id: string;
  name: string;
  type: string;
  timed: boolean;
  nb_questions: number;
  nb_questions_for_cours?: number;
  last_attempt: { score: number | null; ended_at: string | null } | null;
}

interface CoursDetailShellProps {
  cours: {
    id: string;
    name: string;
    description: string | null;
    pdf_url: string | null;
    nb_pages: number;
    version: number;
  };
  matiere: { id: string; name: string; color: string } | null;
  dossierId: string | null;
  currentPage: number;
  directSeries: SerieItem[];
  matiereSeries: SerieItem[];
  ressources: Ressource[];
}

type Tab = "fiche" | "documents" | "exercices";
type SerieFilter = "all" | "qcm_supplementaires" | "annales" | "concours_blanc" | "entrainement";

const SERIE_FILTERS: { key: SerieFilter; label: string; color: string }[] = [
  { key: "all", label: "Tout", color: "bg-gray-100 text-gray-700" },
  { key: "qcm_supplementaires", label: "QCM supplémentaires", color: "bg-teal-100 text-teal-700" },
  { key: "annales", label: "Annales classées", color: "bg-amber-100 text-amber-700" },
  { key: "concours_blanc", label: "Concours blancs", color: "bg-orange-100 text-orange-700" },
  { key: "entrainement", label: "Entraînement", color: "bg-blue-100 text-blue-700" },
];

const TYPE_LABEL: Record<string, string> = {
  entrainement: "Entraînement",
  concours_blanc: "Concours blanc",
  revision: "Révision",
  annales: "Annales classées",
  qcm_supplementaires: "QCM supplémentaires",
};

const TYPE_COLOR: Record<string, string> = {
  entrainement: "bg-blue-50 text-blue-600 border-blue-200",
  concours_blanc: "bg-orange-50 text-orange-600 border-orange-200",
  revision: "bg-green-50 text-green-600 border-green-200",
  annales: "bg-amber-50 text-amber-600 border-amber-200",
  qcm_supplementaires: "bg-teal-50 text-teal-600 border-teal-200",
};

const RESSOURCE_ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  video: Film,
  vimeo: Film,
  lien: Link2,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function CoursDetailShell({
  cours,
  matiere,
  dossierId,
  currentPage,
  directSeries,
  matiereSeries,
  ressources,
}: CoursDetailShellProps) {
  const [tab, setTab] = useState<Tab>("fiche");
  const [serieFilter, setSerieFilter] = useState<SerieFilter>("all");
  const [qaOpen, setQaOpen] = useState(false);

  const hasPdf = !!cours.pdf_url;
  const hasRessources = ressources.length > 0;

  const allSeries = useMemo(() => {
    const directIds = new Set(directSeries.map((s) => s.id));
    const merged = [...directSeries];
    for (const ms of matiereSeries) {
      if (!directIds.has(ms.id) && (ms.nb_questions_for_cours ?? 0) > 0) {
        merged.push(ms);
      }
    }
    return merged;
  }, [directSeries, matiereSeries]);

  const filteredSeries = useMemo(() => {
    if (serieFilter === "all") return allSeries;
    return allSeries.filter((s) => s.type === serieFilter);
  }, [allSeries, serieFilter]);

  const serieTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of allSeries) {
      counts[s.type] = (counts[s.type] ?? 0) + 1;
    }
    return counts;
  }, [allSeries]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "fiche", label: "Fiche de cours" },
    { key: "documents", label: "Documents complémentaires", count: ressources.length },
    { key: "exercices", label: "Exercices", count: allSeries.length },
  ];

  return (
    <div className="space-y-5">
      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 rounded-2xl bg-[#F0F3F8] p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
              tab === t.key
                ? "bg-white text-[#0e1e35] shadow-sm"
                : "text-[#6B7A8D] hover:text-[#0e1e35]"
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                tab === t.key ? "bg-[#0e1e35] text-white" : "bg-[#DDE3EC] text-[#6B7A8D]"
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Fiche de cours ── */}
      {tab === "fiche" && (
        <div className="space-y-4">
          {hasPdf ? (
            <div className="max-w-4xl">
              <PdfViewer
                coursId={cours.id}
                pdfUrl={cours.pdf_url!}
                nbPages={cours.nb_pages ?? 0}
                currentPage={currentPage}
                version={cours.version ?? 1}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#D7E2EF] bg-white py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F0F3F8]">
                <FileText className="h-8 w-8 text-[#C0C8D4]" />
              </div>
              <p className="mt-4 text-sm font-medium text-[#7D8C9E]">Aucune fiche PDF disponible</p>
              <p className="mt-1 text-xs text-[#A2AEBC]">Le professeur ajoutera le cours bientôt</p>
            </div>
          )}
        </div>
      )}

      {/* ── Documents complémentaires ── */}
      {tab === "documents" && (
        <div className="space-y-3">
          {ressources.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#D7E2EF] bg-white py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F3F8]">
                <FolderOpen className="h-7 w-7 text-[#C0C8D4]" />
              </div>
              <p className="mt-3 text-sm font-medium text-[#7D8C9E]">Aucun document complémentaire</p>
              <p className="mt-1 text-xs text-[#A2AEBC]">Les ressources seront ajoutées ici</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ressources.map((r) => {
                const Icon = RESSOURCE_ICON[r.type] ?? FileText;
                const href =
                  r.type === "pdf" ? r.pdf_url :
                  r.type === "vimeo" ? `https://vimeo.com/${r.vimeo_id}` :
                  r.type === "video" ? r.video_url :
                  r.lien_url;

                return (
                  <a
                    key={r.id}
                    href={href ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#4FABDB]/30 hover:shadow-lg"
                  >
                    <div className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      r.type === "pdf" ? "bg-red-50 text-red-500" :
                      r.type === "video" || r.type === "vimeo" ? "bg-purple-50 text-purple-500" :
                      "bg-blue-50 text-blue-500"
                    )}>
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#0e1e35] truncate">{r.titre}</p>
                      {r.sous_titre && (
                        <p className="mt-0.5 text-xs text-[#8A98A9] truncate">{r.sous_titre}</p>
                      )}
                      <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-[#8A98A9]">
                        {r.type === "pdf" ? "PDF" : r.type === "vimeo" ? "Vidéo Vimeo" : r.type === "video" ? "Vidéo" : "Lien"}
                        <ExternalLink size={10} />
                      </span>
                    </div>
                    {r.type === "pdf" && r.pdf_url && (
                      <Download size={16} className="mt-1 shrink-0 text-[#C0C8D4] group-hover:text-[#4FABDB]" />
                    )}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Exercices ── */}
      {tab === "exercices" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={14} className="text-[#8A98A9]" />
            {SERIE_FILTERS.map((f) => {
              const count = f.key === "all" ? allSeries.length : (serieTypeCounts[f.key] ?? 0);
              if (f.key !== "all" && count === 0) return null;
              return (
                <button
                  key={f.key}
                  onClick={() => setSerieFilter(f.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    serieFilter === f.key
                      ? `${f.color} border-current shadow-sm`
                      : "border-[#E2E8F0] bg-white text-[#6B7A8D] hover:border-[#B0BACA]"
                  )}
                >
                  {f.label}
                  <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px]">{count}</span>
                </button>
              );
            })}

            <div className="ml-auto">
              <button
                onClick={() => setQaOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7A8D] transition-all hover:border-[#4FABDB]/40 hover:text-[#4FABDB]"
              >
                <MessageCircleQuestion size={14} />
                Poser une question
              </button>
            </div>
          </div>

          {/* Series list */}
          {filteredSeries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#D7E2EF] bg-white py-14 text-center">
              <ClipboardList className="h-8 w-8 text-[#D0D9E4]" />
              <p className="mt-3 text-sm font-medium text-[#7D8C9E]">
                {serieFilter === "all" ? "Aucune série disponible" : `Aucune série de type "${SERIE_FILTERS.find((f) => f.key === serieFilter)?.label}"`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSeries.map((serie) => {
                const done = serie.last_attempt?.ended_at != null;
                const score = serie.last_attempt?.score;
                const isFromMatiere = !directSeries.some((ds) => ds.id === serie.id);
                const displayCount = isFromMatiere ? (serie.nb_questions_for_cours ?? serie.nb_questions) : serie.nb_questions;

                return (
                  <div
                    key={serie.id}
                    className="flex items-center gap-4 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 transition-all hover:border-[#4FABDB]/20 hover:shadow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#0e1e35] truncate">{serie.name}</p>
                        {isFromMatiere && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-200">
                            Matière
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                          TYPE_COLOR[serie.type] ?? "bg-gray-50 text-gray-600 border-gray-200"
                        )}>
                          {TYPE_LABEL[serie.type] ?? serie.type}
                        </span>
                        {serie.timed && (
                          <span className="flex items-center gap-0.5 text-[10px] text-[#8A98A9]">
                            <Clock className="h-3 w-3" />
                            Chronométré
                          </span>
                        )}
                        <span className="text-[10px] text-[#8A98A9]">
                          {displayCount} question{displayCount !== 1 ? "s" : ""}
                          {isFromMatiere && displayCount !== serie.nb_questions && (
                            <span className="text-amber-500"> / {serie.nb_questions} total</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {done && score != null && (
                        <span className={cn(
                          "text-sm font-bold",
                          score >= 70 ? "text-green-500" : score >= 50 ? "text-orange-500" : "text-red-500"
                        )}>
                          {Math.round(score)}%
                        </span>
                      )}
                      <Link
                        href={`/serie/${serie.id}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all",
                          done
                            ? "bg-[#0e1e35] text-white hover:bg-[#1a2d4a]"
                            : "bg-[#4FABDB] text-white hover:bg-[#3d95c4] shadow-sm shadow-[#4FABDB]/20"
                        )}
                      >
                        {done ? (
                          <>
                            <CheckCircle className="h-3.5 w-3.5" />
                            Reprendre
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            Démarrer
                          </>
                        )}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Q&A Drawer */}
      {qaOpen && (
        <AskQuestionDrawer
          contextType="cours"
          coursId={cours.id}
          matiereId={matiere?.id}
          dossierId={dossierId ?? undefined}
          contextLabel={cours.name}
          onClose={() => setQaOpen(false)}
        />
      )}
    </div>
  );
}
