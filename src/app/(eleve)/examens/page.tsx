import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import Link from "next/link";
import { Calendar, Clock, Layers, ChevronRight, Lock, Trophy, BarChart3, Medal } from "lucide-react";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function getStatus(debut: string, fin: string): "upcoming" | "active" | "ended" {
  const now = Date.now();
  if (now < new Date(debut).getTime()) return "upcoming";
  if (now > new Date(fin).getTime()) return "ended";
  return "active";
}

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
const STATUS_LABELS = { upcoming: "A venir", active: "En cours", ended: "Termine" };

export default async function ExamensElevePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get student's profile to know their groupe
  const { data: profile } = await supabase.from("profiles").select("groupe_id").eq("id", user.id).single();
  const studentGroupeId = profile?.groupe_id;

  // Load visible examens with series + coefficients + groupe targeting
  const [examensRes, exGroupesRes] = await Promise.all([
    supabase
      .from("examens")
      .select("*, examens_series(order_index, coefficient, debut_at, fin_at, series:series(id, name, timed, duration_minutes, type))")
      .eq("visible", true)
      .order("debut_at", { ascending: false }),
    supabase.from("examens_groupes").select("*"),
  ]);

  // Build examen -> groupe_ids map
  const examenGroupesMap: Record<string, string[]> = {};
  for (const eg of (exGroupesRes.data ?? [])) {
    if (!examenGroupesMap[eg.examen_id]) examenGroupesMap[eg.examen_id] = [];
    examenGroupesMap[eg.examen_id].push(eg.groupe_id);
  }

  const allExamens = (examensRes.data ?? []).map((e: any) => ({
    ...e,
    examen_series: (e.examens_series ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index),
    series: (e.examens_series ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((es: any) => ({ ...es.series, coefficient: es.coefficient, serie_debut_at: es.debut_at, serie_fin_at: es.fin_at }))
      .filter(Boolean),
    examens_series: undefined,
    groupe_ids: examenGroupesMap[e.id] ?? [],
  }));

  // Filter: show exams that target the student's groupe (or exams with no targeting = available to all)
  const examens = allExamens.filter((e: any) =>
    e.groupe_ids.length === 0 || (studentGroupeId && e.groupe_ids.includes(studentGroupeId))
  );

  // Load user's best attempts per serie
  const { data: attemptsRaw } = await supabase
    .from("serie_attempts")
    .select("series_id, score, nb_correct, nb_total")
    .eq("user_id", user.id)
    .not("ended_at", "is", null);

  const bestBySerie = new Map<string, { score: number; nb_correct: number; nb_total: number }>();
  for (const a of (attemptsRaw ?? [])) {
    const prev = bestBySerie.get(a.series_id);
    if (!prev || (a.score ?? 0) > prev.score) {
      bestBySerie.set(a.series_id, { score: a.score ?? 0, nb_correct: a.nb_correct, nb_total: a.nb_total });
    }
  }

  return (
    <div>
      <Header title="Examens blancs" />

      {examens.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-12 text-center">
          <Trophy className="mx-auto h-12 w-12 text-navy/30" />
          <h3 className="mt-4 text-lg font-semibold text-navy">Aucun examen disponible</h3>
          <p className="mt-2 text-sm text-gray-500">Les examens apparaitront ici quand les profs en publieront.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {examens.map((e: any) => {
            const status = getStatus(e.debut_at, e.fin_at);
            const isActive = status === "active";
            const isEnded = status === "ended";
            const notationSur = e.notation_sur ?? 20;

            // Calculate weighted average if ended and results visible
            let moyenne20: number | null = null;
            let nbSeriesDone = 0;
            if (isEnded && e.results_visible) {
              let weightedSum = 0;
              let totalCoeff = 0;
              for (const serie of e.series) {
                const best = bestBySerie.get(serie.id);
                if (best && best.nb_total > 0) {
                  const s20 = (best.nb_correct / best.nb_total) * notationSur;
                  weightedSum += s20 * (serie.coefficient ?? 1);
                  totalCoeff += serie.coefficient ?? 1;
                  nbSeriesDone++;
                }
              }
              if (totalCoeff > 0) {
                moyenne20 = weightedSum / totalCoeff;
              }
            }

            return (
              <div
                key={e.id}
                className={cn("rounded-xl border p-5 space-y-4", STATUS_STYLES[status])}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-gray-900">{e.name}</h2>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_BADGE[status])}>
                        {STATUS_LABELS[status]}
                      </span>
                    </div>
                    {e.description && (
                      <p className="text-sm text-gray-500 mt-1">{e.description}</p>
                    )}
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(e.debut_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(e.fin_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {e.series.length} serie{e.series.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Score summary for ended exams */}
                  {isEnded && e.results_visible && moyenne20 !== null && (
                    <div className="shrink-0 flex flex-col items-center bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
                      <div className={cn(
                        "text-2xl font-bold",
                        moyenne20 >= notationSur * 0.7 ? "text-green-600" :
                        moyenne20 >= notationSur * 0.5 ? "text-orange-500" : "text-red-500"
                      )}>
                        {moyenne20.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-400">/{notationSur}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{nbSeriesDone}/{e.series.length} series</div>
                    </div>
                  )}
                </div>

                {/* Series */}
                {e.series.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {e.series.map((serie: any) => {
                      const best = bestBySerie.get(serie.id);
                      const coeff = serie.coefficient ?? 1;
                      const hasScore = best && best.nb_total > 0;
                      const score20 = hasScore ? (best.nb_correct / best.nb_total) * notationSur : null;
                      // Per-serie status (uses serie dates if available, else exam dates)
                      const serieDebut = serie.serie_debut_at || e.debut_at;
                      const serieFin = serie.serie_fin_at || e.fin_at;
                      const serieStatus = getStatus(serieDebut, serieFin);
                      const serieIsActive = serieStatus === "active";
                      const serieIsEnded = serieStatus === "ended";
                      const hasOwnDates = !!serie.serie_debut_at;

                      return (
                        <div key={serie.id} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-gray-800 truncate">{serie.name}</p>
                              {coeff !== 1 && (
                                <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-semibold">
                                  x{coeff}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-gray-400">
                                {serie.timed ? `${serie.duration_minutes}min chrono` : "Libre"}
                              </span>
                              {hasOwnDates && (
                                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                  <Calendar className="h-2.5 w-2.5" />
                                  {new Date(serie.serie_debut_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                  {" "}
                                  {new Date(serie.serie_debut_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                  {serie.serie_fin_at && <>–{new Date(serie.serie_fin_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</>}
                                </span>
                              )}
                              {isEnded && e.results_visible && score20 !== null && (
                                <span className={cn(
                                  "text-xs font-semibold flex items-center gap-0.5",
                                  score20 >= notationSur * 0.7 ? "text-green-600" :
                                  score20 >= notationSur * 0.5 ? "text-orange-500" : "text-red-500"
                                )}>
                                  <BarChart3 className="h-2.5 w-2.5" />
                                  {score20.toFixed(1)}/{notationSur}
                                </span>
                              )}
                              {!isEnded && best && (
                                <span className={cn(
                                  "text-xs font-semibold flex items-center gap-0.5",
                                  best.score >= 70 ? "text-green-600" : best.score >= 50 ? "text-orange-500" : "text-red-500"
                                )}>
                                  <Trophy className="h-2.5 w-2.5" /> {Math.round(best.score)}%
                                </span>
                              )}
                            </div>
                          </div>
                          {serieIsActive ? (
                            <Link
                              href={`/serie/${serie.id}`}
                              className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-navy text-white text-xs font-semibold rounded-lg hover:bg-navy-light transition-colors"
                            >
                              {best ? "Refaire" : "Commencer"}
                              <ChevronRight className="h-3 w-3" />
                            </Link>
                          ) : serieIsEnded ? (
                            best ? (
                              <Link
                                href={`/serie/${serie.id}`}
                                className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                Revoir
                                <ChevronRight className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="shrink-0 flex items-center gap-1 text-xs text-gray-400">
                                <Lock className="h-3 w-3" /> Terminé
                              </span>
                            )
                          ) : (
                            <span className="shrink-0 flex items-center gap-1 text-xs text-gray-400">
                              <Lock className="h-3 w-3" /> À venir
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Results link for ended exams */}
                {isEnded && e.results_visible && moyenne20 !== null && (
                  <Link
                    href={`/examens/${e.id}/resultats`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-navy/5 border border-navy/20 rounded-lg text-navy text-sm font-medium hover:bg-navy/10 transition-colors"
                  >
                    <Medal className="h-4 w-4" /> Voir le classement
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
