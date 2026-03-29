"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Calendar, ChevronRight, Clock, Layers, Lock, Medal, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

type ExamStatus = "upcoming" | "active" | "ended";

export type StudentExamSerieView = {
  id: string;
  name: string;
  timed: boolean;
  duration_minutes: number | null;
  serie_debut_at: string | null;
  serie_fin_at: string | null;
  status: ExamStatus;
  hasOwnDates: boolean;
  score20: number | null;
  scorePercent: number | null;
  hasAttempt: boolean;
};

export type StudentExamView = {
  id: string;
  name: string;
  description: string | null;
  debut_at: string;
  fin_at: string;
  status: ExamStatus;
  results_visible: boolean;
  notation_sur: number;
  moyenne20: number | null;
  nbSeriesDone: number;
  series: StudentExamSerieView[];
};

const STATUS_STYLES = {
  upcoming: "bg-blue-50 border-blue-200",
  active: "bg-green-50 border-green-200 ring-2 ring-green-300/30",
  ended: "bg-gray-50 border-gray-200",
};

const STATUS_BADGE = {
  upcoming: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  ended: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS = {
  upcoming: "A venir",
  active: "En cours",
  ended: "Termine",
};

type TabKey = "upcoming" | "past";

function EmptyState({ tab }: { tab: TabKey }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-12 text-center">
      <Trophy className="mx-auto h-12 w-12 text-navy/30" />
      <h3 className="mt-4 text-lg font-semibold text-navy">
        {tab === "upcoming" ? "Aucun examen à venir" : "Aucun examen passé"}
      </h3>
      <p className="mt-2 text-sm text-gray-500">
        {tab === "upcoming"
          ? "Les prochains concours blancs apparaitront ici dès qu'ils seront publiés."
          : "Les concours blancs terminés s'afficheront ici après leur passage."}
      </p>
    </div>
  );
}

export function ExamensEleveShell({ examens }: { examens: StudentExamView[] }) {
  const upcomingExamens = useMemo(
    () =>
      examens
        .filter((exam) => exam.status !== "ended")
        .sort((a, b) => new Date(a.debut_at).getTime() - new Date(b.debut_at).getTime()),
    [examens]
  );

  const pastExamens = useMemo(
    () =>
      examens
        .filter((exam) => exam.status === "ended")
        .sort((a, b) => new Date(b.debut_at).getTime() - new Date(a.debut_at).getTime()),
    [examens]
  );

  const [tab, setTab] = useState<TabKey>(upcomingExamens.length > 0 ? "upcoming" : "past");
  const currentExamens = tab === "upcoming" ? upcomingExamens : pastExamens;

  if (examens.length === 0) {
    return <EmptyState tab="upcoming" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Mes concours blancs</p>
          <p className="mt-1 text-sm text-gray-500">
            Sépare clairement ce qui arrive bientôt de ce qui est déjà passé.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setTab("upcoming")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              tab === "upcoming" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            )}
          >
            A venir
            <span className="ml-1 text-gray-400">({upcomingExamens.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("past")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              tab === "past" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            )}
          >
            Passés
            <span className="ml-1 text-gray-400">({pastExamens.length})</span>
          </button>
        </div>
      </div>

      {currentExamens.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-5">
          {currentExamens.map((exam) => {
            const isEnded = exam.status === "ended";

            return (
              <div key={exam.id} className={cn("rounded-xl border p-5 space-y-4", STATUS_STYLES[exam.status])}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-gray-900">{exam.name}</h2>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_BADGE[exam.status])}>
                        {STATUS_LABELS[exam.status]}
                      </span>
                    </div>

                    {exam.description && <p className="mt-1 text-sm text-gray-500">{exam.description}</p>}

                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(exam.debut_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(exam.fin_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {exam.series.length} serie{exam.series.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {isEnded && exam.results_visible && exam.moyenne20 !== null && (
                    <div className="shrink-0 flex flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                      <div
                        className={cn(
                          "text-2xl font-bold",
                          exam.moyenne20 >= exam.notation_sur * 0.7
                            ? "text-green-600"
                            : exam.moyenne20 >= exam.notation_sur * 0.5
                              ? "text-orange-500"
                              : "text-red-500"
                        )}
                      >
                        {exam.moyenne20.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-400">/{exam.notation_sur}</div>
                      <div className="mt-0.5 text-[10px] text-gray-400">
                        {exam.nbSeriesDone}/{exam.series.length} series
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {exam.series.map((serie) => {
                    const serieIsActive = serie.status === "active";
                    const serieIsEnded = serie.status === "ended";

                    return (
                      <div
                        key={serie.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-gray-800">{serie.name}</p>
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-400">
                              {serie.timed ? `${serie.duration_minutes}min chrono` : "Libre"}
                            </span>

                            {serie.hasOwnDates && serie.serie_debut_at && (
                              <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                                <Calendar className="h-2.5 w-2.5" />
                                {new Date(serie.serie_debut_at).toLocaleDateString("fr-FR", {
                                  day: "numeric",
                                  month: "short",
                                })}
                                {" "}
                                {new Date(serie.serie_debut_at).toLocaleTimeString("fr-FR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {serie.serie_fin_at && (
                                  <>
                                    –{new Date(serie.serie_fin_at).toLocaleTimeString("fr-FR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </>
                                )}
                              </span>
                            )}

                            {isEnded && exam.results_visible && serie.score20 !== null && (
                              <span
                                className={cn(
                                  "flex items-center gap-0.5 text-xs font-semibold",
                                  serie.score20 >= exam.notation_sur * 0.7
                                    ? "text-green-600"
                                    : serie.score20 >= exam.notation_sur * 0.5
                                      ? "text-orange-500"
                                      : "text-red-500"
                                )}
                              >
                                <BarChart3 className="h-2.5 w-2.5" />
                                {serie.score20.toFixed(1)}/{exam.notation_sur}
                              </span>
                            )}

                            {!isEnded && serie.scorePercent !== null && (
                              <span
                                className={cn(
                                  "flex items-center gap-0.5 text-xs font-semibold",
                                  serie.scorePercent >= 70
                                    ? "text-green-600"
                                    : serie.scorePercent >= 50
                                      ? "text-orange-500"
                                      : "text-red-500"
                                )}
                              >
                                <Trophy className="h-2.5 w-2.5" />
                                {serie.scorePercent}%
                              </span>
                            )}
                          </div>
                        </div>

                        {serieIsActive ? (
                          <Link
                            href={`/serie/${serie.id}`}
                            className="shrink-0 flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-light"
                          >
                            {serie.hasAttempt ? "Refaire" : "Commencer"}
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        ) : serieIsEnded ? (
                          serie.hasAttempt ? (
                            <Link
                              href={`/serie/${serie.id}`}
                              className="shrink-0 flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200"
                            >
                              Revoir
                              <ChevronRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="shrink-0 flex items-center gap-1 text-xs text-gray-400">
                              <Lock className="h-3 w-3" />
                              Terminé
                            </span>
                          )
                        ) : (
                          <span className="shrink-0 flex items-center gap-1 text-xs text-gray-400">
                            <Lock className="h-3 w-3" />
                            À venir
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isEnded && exam.results_visible && exam.moyenne20 !== null && (
                  <Link
                    href={`/examens/${exam.id}/resultats`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-navy/20 bg-navy/5 py-2.5 text-sm font-medium text-navy transition-colors hover:bg-navy/10"
                  >
                    <Medal className="h-4 w-4" />
                    Voir le classement
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
