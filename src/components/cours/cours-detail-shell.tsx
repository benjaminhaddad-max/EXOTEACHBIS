"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  Film,
  Link2,
  ExternalLink,
  ClipboardList,
  CheckCircle,
  Clock,
  Play,
  MessageCircleQuestion,
  Download,
  Layers,
  BookOpen,
  Sparkles,
  ChevronRight,
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

interface FlashcardDeckItem {
  id: string;
  name: string;
  description: string | null;
  nb_cards: number;
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
  flashcardDecks?: FlashcardDeckItem[];
}

type SidebarTab = "series" | "flashcards";

const SERIE_TYPE_STYLE: Record<string, { label: string; active: string; icon: string }> = {
  qcm_supplementaires: { label: "QCM supplémentaires", active: "bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/30", icon: "🧪" },
  annales:             { label: "Annales classées corrigées", active: "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30", icon: "📋" },
  concours_blanc:      { label: "Concours blancs", active: "bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/30", icon: "🏆" },
  entrainement:        { label: "Entraînement", active: "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30", icon: "💪" },
  revision:            { label: "Révision", active: "bg-purple-500/20 text-purple-300 ring-1 ring-purple-400/30", icon: "📖" },
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
  flashcardDecks = [],
}: CoursDetailShellProps) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("series");
  const [qaOpen, setQaOpen] = useState(false);
  const [pdfPage, setPdfPage] = useState(currentPage);

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

  const serieTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of allSeries) {
      counts[s.type] = (counts[s.type] ?? 0) + 1;
    }
    return counts;
  }, [allSeries]);

  return (
    <div className="flex gap-0 rounded-2xl overflow-hidden border border-[#E2E8F0] bg-white shadow-sm" style={{ minHeight: "75vh" }}>

      {/* ═══════════ LEFT: Fiche de cours + docs ═══════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* PDF header bar */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-[#E8EDF3] bg-[#FAFBFD]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0e1e35]">
              <BookOpen size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#0e1e35]">Fiche de cours</p>
              {cours.nb_pages > 0 && (
                <p className="text-[10px] text-[#8A98A9]">{cours.nb_pages} pages · v{cours.version}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setQaOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#6B7A8D] transition-all hover:border-[#4FABDB]/40 hover:text-[#4FABDB] hover:shadow-sm"
          >
            <MessageCircleQuestion size={14} />
            Question sur la page {pdfPage}
          </button>
        </div>

        {/* PDF viewer */}
        <div className="flex-1 overflow-y-auto">
          {cours.pdf_url ? (
            <div className="p-4">
              <PdfViewer
                coursId={cours.id}
                pdfUrl={cours.pdf_url}
                nbPages={cours.nb_pages ?? 0}
                currentPage={currentPage}
                version={cours.version ?? 1}
                onPageChange={setPdfPage}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F0F3F8]">
                <FileText className="h-8 w-8 text-[#C0C8D4]" />
              </div>
              <p className="mt-4 text-sm font-medium text-[#7D8C9E]">Aucune fiche PDF disponible</p>
              <p className="mt-1 text-xs text-[#A2AEBC]">Le professeur ajoutera le cours bientôt</p>
            </div>
          )}

          {/* Documents complémentaires — inline under PDF */}
          {ressources.length > 0 && (
            <div className="px-4 pb-4">
              <div className="border-t border-[#E8EDF3] pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[#8A98A9] mb-3">
                  Documents complémentaires
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                        className="group flex items-center gap-3 rounded-xl border border-[#E8EDF3] bg-[#FAFBFD] px-3.5 py-3 transition-all hover:border-[#4FABDB]/30 hover:bg-white hover:shadow-sm"
                      >
                        <div className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          r.type === "pdf" ? "bg-red-50 text-red-500" :
                          r.type === "video" || r.type === "vimeo" ? "bg-purple-50 text-purple-500" :
                          "bg-blue-50 text-blue-500"
                        )}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#0e1e35] truncate">{r.titre}</p>
                          <span className="text-[10px] text-[#8A98A9] uppercase tracking-wider">
                            {r.type === "pdf" ? "PDF" : r.type === "vimeo" ? "Vidéo" : r.type === "video" ? "Vidéo" : "Lien"}
                          </span>
                        </div>
                        <ExternalLink size={12} className="shrink-0 text-[#C0C8D4] group-hover:text-[#4FABDB]" />
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ RIGHT: Sidebar navy — Séries / Flashcards ═══════════ */}
      <div className="w-[380px] shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>

        {/* Sidebar tabs */}
        <div className="shrink-0 flex border-b border-white/10">
          <button
            onClick={() => setSidebarTab("series")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-bold transition-colors border-b-2",
              sidebarTab === "series"
                ? "border-[#C9A84C] text-[#C9A84C]"
                : "border-transparent text-white/40 hover:text-white/60"
            )}
          >
            <ClipboardList size={14} />
            Séries
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              sidebarTab === "series" ? "bg-[#C9A84C]/20 text-[#C9A84C]" : "bg-white/8 text-white/30"
            )}>
              {allSeries.length}
            </span>
          </button>
          <button
            onClick={() => setSidebarTab("flashcards")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-bold transition-colors border-b-2",
              sidebarTab === "flashcards"
                ? "border-indigo-400 text-indigo-400"
                : "border-transparent text-white/40 hover:text-white/60"
            )}
          >
            <Layers size={14} />
            Flashcards
            {flashcardDecks.length > 0 && (
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                sidebarTab === "flashcards" ? "bg-indigo-500/20 text-indigo-400" : "bg-white/8 text-white/30"
              )}>
                {flashcardDecks.length}
              </span>
            )}
          </button>
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto p-3">
          {sidebarTab === "series" ? (
            <div className="space-y-4">
              {/* Grouped by type */}
              {allSeries.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-white/8 p-6 text-center">
                  <ClipboardList size={20} className="mx-auto text-white/15 mb-2" />
                  <p className="text-xs text-white/30">Aucune série disponible</p>
                </div>
              ) : (
                Object.entries(serieTypeCounts)
                  .sort(([a], [b]) => {
                    const order = ["qcm_supplementaires", "annales", "concours_blanc", "entrainement", "revision"];
                    return order.indexOf(a) - order.indexOf(b);
                  })
                  .map(([type, count]) => {
                    const style = SERIE_TYPE_STYLE[type];
                    if (!style || count === 0) return null;
                    const seriesOfType = allSeries.filter((s) => s.type === type);

                    return (
                      <div key={type}>
                        {/* Section header */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">{style.icon}</span>
                          <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">{style.label}</span>
                          <span className="text-[10px] text-white/25 font-semibold">{count}</span>
                        </div>

                        {/* Series cards */}
                        <div className="space-y-1.5">
                          {seriesOfType.map((serie) => {
                            const done = serie.last_attempt?.ended_at != null;
                            const score = serie.last_attempt?.score;
                            const isFromMatiere = !directSeries.some((ds) => ds.id === serie.id);
                            const displayCount = isFromMatiere ? (serie.nb_questions_for_cours ?? serie.nb_questions) : serie.nb_questions;

                            return (
                              <Link
                                key={serie.id}
                                href={`/serie/${serie.id}`}
                                className="block rounded-xl border border-white/8 bg-white/[0.03] p-3 transition-all hover:bg-white/[0.06] hover:border-white/15 group"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-white/85 truncate group-hover:text-white transition-colors">
                                      {serie.name}
                                    </p>
                                    <div className="mt-1 flex items-center gap-2">
                                      {isFromMatiere && (
                                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-300">
                                          Matière
                                        </span>
                                      )}
                                      <span className="text-[10px] text-white/30">
                                        {displayCount} question{displayCount !== 1 ? "s" : ""}
                                        {serie.timed && " · ⏱"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {done && score != null && (
                                      <span className={cn(
                                        "text-xs font-bold",
                                        score >= 70 ? "text-green-400" : score >= 50 ? "text-orange-400" : "text-red-400"
                                      )}>
                                        {Math.round(score)}%
                                      </span>
                                    )}
                                    <div className={cn(
                                      "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors",
                                      done
                                        ? "bg-white/10 text-white/60 group-hover:bg-white/15"
                                        : "bg-[#4FABDB]/20 text-[#4FABDB] group-hover:bg-[#4FABDB]/30"
                                    )}>
                                      {done ? <CheckCircle size={10} /> : <Play size={10} />}
                                      {done ? "Refaire" : "Go"}
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
              )}

              {/* Q&A button */}
              <button
                onClick={() => setQaOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-2.5 text-xs font-semibold text-white/35 hover:text-white/60 hover:border-white/25 transition-colors"
              >
                <MessageCircleQuestion size={13} />
                Poser une question sur ce chapitre
              </button>
            </div>
          ) : (
            /* ── Flashcards tab ── */
            <div className="space-y-2.5">
              {flashcardDecks.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-white/8 p-8 text-center">
                  <Layers size={24} className="mx-auto text-white/15 mb-3" />
                  <p className="text-xs text-white/30">Aucun deck de flashcards</p>
                  <p className="text-[10px] text-white/20 mt-1">Votre professeur en ajoutera bientôt</p>
                </div>
              ) : (
                flashcardDecks.map((deck) => (
                  <Link
                    key={deck.id}
                    href={`/cours/flashcards/${deck.id}`}
                    className="block rounded-xl border border-white/8 bg-white/[0.03] p-3.5 transition-all hover:bg-white/[0.06] hover:border-indigo-400/30 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400 group-hover:bg-indigo-500/25 transition-colors">
                        <Layers size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white/85 truncate group-hover:text-indigo-300 transition-colors">
                          {deck.name}
                        </p>
                        {deck.description && (
                          <p className="text-[10px] text-white/30 truncate mt-0.5">{deck.description}</p>
                        )}
                        <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[9px] font-bold text-indigo-400">
                          <Sparkles size={8} />
                          {deck.nb_cards} carte{deck.nb_cards !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <ChevronRight size={14} className="shrink-0 text-white/20 group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Q&A Drawer */}
      {qaOpen && (
        <AskQuestionDrawer
          contextType="cours"
          coursId={cours.id}
          matiereId={matiere?.id}
          dossierId={dossierId ?? undefined}
          contextLabel={`${cours.name} — Page ${pdfPage}/${cours.nb_pages}`}
          onClose={() => setQaOpen(false)}
        />
      )}
    </div>
  );
}
