"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Calendar, ChevronRight, Clock, Layers, Lock, Medal, Trophy, Users } from "lucide-react";
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
  rankingSummary: {
    rank: number | null;
    participants: number;
    classAverage: number | null;
    topScore: number | null;
  } | null;
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

type TabKey = "upcoming" | "past" | "results";

function EmptyState({ tab }: { tab: TabKey }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-12 text-center">
      <Trophy className="mx-auto h-12 w-12 text-navy/30" />
      <h3 className="mt-4 text-lg font-semibold text-navy">
        {tab === "upcoming"
          ? "Aucun examen à venir"
          : tab === "past"
            ? "Aucun examen passé"
            : "Aucun résultat publié"}
      </h3>
      <p className="mt-2 text-sm text-gray-500">
        {tab === "upcoming"
          ? "Les prochains concours blancs apparaitront ici dès qu'ils seront publiés."
          : tab === "past"
            ? "Les concours blancs terminés s'afficheront ici après leur passage."
            : "Les résultats, classements et statistiques apparaîtront ici dès qu'ils seront publiés."}
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

  const resultsExamens = useMemo(
    () => pastExamens.filter((exam) => exam.results_visible),
    [pastExamens]
  );

  const resultsSummary = useMemo(() => {
    const scoredExamens = resultsExamens.filter((exam) => exam.moyenne20 !== null);
    const average =
      scoredExamens.length > 0
        ? scoredExamens.reduce((sum, exam) => sum + (exam.moyenne20 ?? 0), 0) / scoredExamens.length
        : null;
    const best =
      scoredExamens.length > 0 ? Math.max(...scoredExamens.map((exam) => exam.moyenne20 ?? 0)) : null;

    return {
      published: resultsExamens.length,
      average,
      best,
    };
  }, [resultsExamens]);

  const [tab, setTab] = useState<TabKey>(
    upcomingExamens.length > 0 ? "upcoming" : resultsExamens.length > 0 ? "results" : "past"
  );
  const currentExamens = tab === "upcoming" ? upcomingExamens : tab === "past" ? pastExamens : resultsExamens;

  if (examens.length === 0) {
    return <EmptyState tab="upcoming" />;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
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
          <button
            type="button"
            onClick={() => setTab("results")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              tab === "results" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            )}
          >
            Résultats & stats
            <span className="ml-1 text-gray-400">({resultsExamens.length})</span>
          </button>
        </div>
      </div>

      {currentExamens.length === 0 ? (
        <EmptyState tab={tab} />
      ) : tab === "results" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Résultats publiés</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-2xl font-bold text-navy">{resultsSummary.published}</span>
                <span className="pb-0.5 text-sm text-gray-400">concours</span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Moyenne concours</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-2xl font-bold text-navy">
                  {resultsSummary.average !== null ? resultsSummary.average.toFixed(1) : "—"}
                </span>
                <span className="pb-0.5 text-sm text-gray-400">/20</span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Meilleure note</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-2xl font-bold text-navy">
                  {resultsSummary.best !== null ? resultsSummary.best.toFixed(1) : "—"}
                </span>
                <span className="pb-0.5 text-sm text-gray-400">/20</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {resultsExamens.map((exam) => {
              const completedSeries = exam.series.filter((serie) => serie.hasAttempt).length;
              const topSeries = [...exam.series]
                .filter((serie) => serie.score20 !== null)
                .sort((a, b) => (b.score20 ?? 0) - (a.score20 ?? 0))
                .slice(0, 3);

              return (
                <div key={exam.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-gray-900">{exam.name}</h2>
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Résultats publiés
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(exam.debut_at).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {completedSeries}/{exam.series.length} séries faites
                        </span>
                        <span className="flex items-center gap-1">
                          <BarChart3 className="h-3 w-3" />
                          {exam.series.length} matières
                        </span>
                      </div>

                      {topSeries.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {topSeries.map((serie) => (
                            <div
                              key={serie.id}
                              className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600"
                            >
                              <span className="font-medium text-gray-800">{serie.name?.replace(`${exam.name} — `, "")}</span>
                              <span className="ml-1 text-navy">
                                {serie.score20?.toFixed(1)}/{exam.notation_sur}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <div className="rounded-xl border border-navy/10 bg-navy/5 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                          Ma note
                        </p>
                        <div className="mt-2 flex items-end gap-2">
                          <span
                            className={cn(
                              "text-3xl font-bold",
                              exam.moyenne20 === null
                                ? "text-gray-400"
                                : exam.moyenne20 >= exam.notation_sur * 0.7
                                  ? "text-green-600"
                                  : exam.moyenne20 >= exam.notation_sur * 0.5
                                    ? "text-orange-500"
                                    : "text-red-500"
                            )}
                          >
                            {exam.moyenne20 !== null ? exam.moyenne20.toFixed(1) : "—"}
                          </span>
                          <span className="pb-1 text-sm text-gray-400">/{exam.notation_sur}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {exam.moyenne20 !== null
                            ? "Moyenne pondérée sur les matières complétées."
                            : "Aucune série rendue sur ce concours blanc."}
                        </p>
                      </div>

                      <Link
                        href={`/examens/${exam.id}/resultats`}
                        className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-navy transition-colors hover:border-navy/30 hover:bg-navy/5"
                      >
                        <span className="flex items-center gap-2">
                          <Medal className="h-4 w-4" />
                          Voir résultats détaillés
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === "past" ? (
        <div className="space-y-5">
          {pastExamens.map((exam) => {
            const detailHref = exam.results_visible ? `/examens/${exam.id}/resultats` : null;

            const leftPanel = (
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-gray-900">{exam.name}</h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Terminé
                      </span>
                    </div>

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
                        {exam.series.length} série{exam.series.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {detailHref && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-3 py-1 text-xs font-medium text-navy">
                      Voir le détail
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {exam.series.map((serie) => (
                    <div
                      key={serie.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-gray-800">{serie.name?.replace(`${exam.name} — `, "")}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        <span>{serie.timed ? `${serie.duration_minutes}min chrono` : "Libre"}</span>
                        {serie.hasOwnDates && serie.serie_debut_at && (
                          <span className="flex items-center gap-0.5">
                            <Calendar className="h-2.5 w-2.5" />
                            {new Date(serie.serie_debut_at).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!exam.results_visible && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    Les résultats de ce concours blanc ne sont pas encore visibles.
                  </div>
                )}
              </div>
            );

            return (
              <div key={exam.id} className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  {detailHref ? (
                    <Link
                      href={detailHref}
                      className="block transition-transform hover:-translate-y-0.5"
                    >
                      {leftPanel}
                    </Link>
                  ) : (
                    leftPanel
                  )}
                </div>

                <div className="lg:col-span-1">
                  <div className="rounded-xl border border-gray-200 bg-white p-5 h-full">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                      Classement général
                    </p>

                    {exam.results_visible && exam.rankingSummary ? (
                      <div className="mt-4 space-y-4">
                        <div className="rounded-xl border border-navy/10 bg-navy/5 px-4 py-3">
                          <p className="text-xs text-gray-500">Ton rang</p>
                          <div className="mt-1 flex items-end gap-2">
                            <span className="text-3xl font-bold text-navy">
                              {exam.rankingSummary.rank ?? "—"}
                            </span>
                            <span className="pb-1 text-sm text-gray-400">
                              / {exam.rankingSummary.participants || "—"}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                            <p className="flex items-center gap-1 text-xs text-gray-500">
                              <Users className="h-3 w-3" />
                              Participants
                            </p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">
                              {exam.rankingSummary.participants}
                            </p>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                            <p className="flex items-center gap-1 text-xs text-gray-500">
                              <BarChart3 className="h-3 w-3" />
                              Moyenne promo
                            </p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">
                              {exam.rankingSummary.classAverage !== null
                                ? `${exam.rankingSummary.classAverage.toFixed(1)}/${exam.notation_sur}`
                                : "—"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                            <p className="flex items-center gap-1 text-xs text-gray-500">
                              <Trophy className="h-3 w-3" />
                              Meilleure note
                            </p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">
                              {exam.rankingSummary.topScore !== null
                                ? `${exam.rankingSummary.topScore.toFixed(1)}/${exam.notation_sur}`
                                : "—"}
                            </p>
                          </div>
                        </div>

                        <Link
                          href={detailHref ?? "#"}
                          className="flex items-center justify-between rounded-xl border border-navy/20 bg-navy/5 px-4 py-3 text-sm font-medium text-navy transition-colors hover:bg-navy/10"
                        >
                          <span className="flex items-center gap-2">
                            <Medal className="h-4 w-4" />
                            Ouvrir le détail complet
                          </span>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700">
                        Le classement général apparaîtra ici dès que les résultats seront publiés.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
                            <p className="truncate text-sm font-medium text-gray-800">{serie.name?.replace(`${exam.name} — `, "")}</p>
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

                {isEnded && !exam.results_visible && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    Les résultats de ce concours blanc ne sont pas encore visibles.
                  </div>
                )}

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
