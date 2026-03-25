import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import Link from "next/link";
import { Calendar, Clock, Layers, ChevronRight, Lock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function getStatus(debut: string, fin: string): "upcoming" | "active" | "ended" {
  const now = Date.now();
  if (now < new Date(debut).getTime()) return "upcoming";
  if (now > new Date(fin).getTime()) return "ended";
  return "active";
}

const STATUS_STYLES = {
  upcoming: "bg-blue-50 border-blue-200",
  active: "bg-green-50 border-green-200",
  ended: "bg-gray-50 border-gray-200",
};
const STATUS_BADGE = {
  upcoming: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  ended: "bg-gray-100 text-gray-500",
};
const STATUS_LABELS = { upcoming: "À venir", active: "En cours", ended: "Terminé" };

export default async function ExamensElevePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Load visible examens with their series
  const { data: examensRaw } = await supabase
    .from("examens")
    .select("*, examens_series(order_index, series:series(id, name, nb_questions, timed, duration_minutes, type))")
    .eq("visible", true)
    .order("debut_at", { ascending: false });

  const examens = (examensRaw ?? []).map((e: any) => ({
    ...e,
    series: (e.examens_series ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((es: any) => es.series)
      .filter(Boolean),
    examens_series: undefined,
  }));

  // Load user's best attempts per serie
  const { data: attemptsRaw } = await supabase
    .from("serie_attempts")
    .select("series_id, score")
    .eq("user_id", user!.id)
    .not("ended_at", "is", null);

  const bestBySerie = new Map<string, number>();
  for (const a of (attemptsRaw ?? [])) {
    const prev = bestBySerie.get(a.series_id);
    if (prev == null || (a.score ?? 0) > prev) bestBySerie.set(a.series_id, a.score ?? 0);
  }

  return (
    <div>
      <Header title="Examens blancs" />

      {examens.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-12 text-center">
          <Trophy className="mx-auto h-12 w-12 text-navy/30" />
          <h3 className="mt-4 text-lg font-semibold text-navy">Aucun examen disponible</h3>
          <p className="mt-2 text-sm text-gray-500">Les examens apparaîtront ici quand les profs en publieront.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {examens.map((e: any) => {
            const status = getStatus(e.debut_at, e.fin_at);
            const isActive = status === "active";
            return (
              <div
                key={e.id}
                className={cn("rounded-xl border p-5 space-y-4", STATUS_STYLES[status])}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
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
                        jusqu'au {new Date(e.fin_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {e.series.length} série{e.series.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Series */}
                {e.series.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {e.series.map((serie: any) => {
                      const bestScore = bestBySerie.get(serie.id);
                      return (
                        <div key={serie.id} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{serie.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-400">
                                {serie.timed ? `${serie.duration_minutes}min chrono` : "Libre"}
                              </span>
                              {bestScore != null && (
                                <span className={cn(
                                  "text-xs font-semibold flex items-center gap-0.5",
                                  bestScore >= 70 ? "text-green-600" : bestScore >= 50 ? "text-orange-500" : "text-red-500"
                                )}>
                                  <Trophy className="h-2.5 w-2.5" /> {Math.round(bestScore)}%
                                </span>
                              )}
                            </div>
                          </div>
                          {isActive ? (
                            <Link
                              href={`/serie/${serie.id}`}
                              className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-navy text-white text-xs font-semibold rounded-lg hover:bg-navy-light transition-colors"
                            >
                              {bestScore != null ? "Refaire" : "Commencer"}
                              <ChevronRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="shrink-0 flex items-center gap-1 text-xs text-gray-400">
                              <Lock className="h-3 w-3" />
                              {status === "upcoming" ? "À venir" : "Terminé"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
