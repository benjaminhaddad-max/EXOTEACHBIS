import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { TrendingUp, Target, ClipboardList, Award, Clock, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProgressionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [attemptsRes, answersRes, matieresRes] = await Promise.all([
    supabase
      .from("serie_attempts")
      .select("id, score, nb_correct, nb_total, ended_at, started_at, time_spent_s, series:series(name, matiere_id, matiere:matieres(name, color))")
      .eq("user_id", user!.id)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false }),
    supabase
      .from("user_answers")
      .select("is_correct, question:questions(matiere_id)")
      .in("attempt_id",
        (await supabase.from("serie_attempts").select("id").eq("user_id", user!.id)).data?.map((a: any) => a.id) ?? []
      ),
    supabase.from("matieres").select("id, name, color").order("name"),
  ]);

  const attempts = (attemptsRes.data ?? []) as any[];
  const matieres = (matieresRes.data ?? []) as any[];

  // Score by matiere
  const matiereStats: Record<string, { name: string; color: string; correct: number; total: number }> = {};
  for (const m of matieres) {
    matiereStats[m.id] = { name: m.name, color: m.color, correct: 0, total: 0 };
  }

  for (const att of attempts) {
    const matiereId = att.series?.matiere_id;
    if (matiereId && matiereStats[matiereId]) {
      matiereStats[matiereId].correct += att.nb_correct ?? 0;
      matiereStats[matiereId].total += att.nb_total ?? 0;
    }
  }

  // Last 30 days attempts (for chart)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentAttempts = attempts.filter(
    (a) => a.ended_at && new Date(a.ended_at) >= thirtyDaysAgo
  );

  // Group by day (last 14 days, max 14 bars)
  const dayMap: Record<string, number[]> = {};
  for (const att of recentAttempts) {
    const day = att.ended_at.slice(0, 10);
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push(att.score ?? 0);
  }

  // Build last 14 days data
  const chartDays: { day: string; label: string; avg: number | null }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const scores = dayMap[key];
    chartDays.push({
      day: key,
      label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      avg: scores?.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    });
  }

  // Global stats
  const completedAttempts = attempts.filter((a) => a.score != null);
  const avgScore = completedAttempts.length > 0
    ? Math.round(completedAttempts.reduce((acc, a) => acc + (a.score ?? 0), 0) / completedAttempts.length)
    : null;
  const totalQuestions = attempts.reduce((acc, a) => acc + (a.nb_total ?? 0), 0);
  const totalCorrect = attempts.reduce((acc, a) => acc + (a.nb_correct ?? 0), 0);
  const totalTime = attempts.reduce((acc, a) => acc + (a.time_spent_s ?? 0), 0);
  const bestScore = completedAttempts.length > 0 ? Math.round(Math.max(...completedAttempts.map((a) => a.score ?? 0))) : null;

  const matiereList = Object.values(matiereStats).filter((m) => m.total > 0);

  return (
    <div>
      <Header title="Progression" />

      {/* Global stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        <StatCard icon={ClipboardList} label="Séries complétées" value={String(completedAttempts.length)} color="indigo" />
        <StatCard icon={Target} label="Score moyen" value={avgScore != null ? `${avgScore}%` : "—"} color={avgScore == null ? "gray" : avgScore >= 70 ? "green" : avgScore >= 50 ? "orange" : "red"} />
        <StatCard icon={Award} label="Meilleur score" value={bestScore != null ? `${bestScore}%` : "—"} color="yellow" />
        <StatCard icon={Clock} label="Temps total" value={formatTime(totalTime)} color="blue" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        {/* Courbe des 14 derniers jours */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Score moyen — 14 derniers jours</h2>
          </div>
          <div className="p-5">
            {recentAttempts.length === 0 ? (
              <div className="h-32 flex items-center justify-center">
                <p className="text-sm text-gray-400">Aucune série complétée ces 14 derniers jours</p>
              </div>
            ) : (
              <div className="flex items-end gap-1 h-36">
                {chartDays.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-400" style={{ fontSize: "9px" }}>
                      {d.avg != null ? `${d.avg}%` : ""}
                    </span>
                    <div
                      className={cn(
                        "w-full rounded-t transition-all",
                        d.avg == null ? "bg-gray-100" :
                        d.avg >= 70 ? "bg-green-400" :
                        d.avg >= 50 ? "bg-amber-400" : "bg-red-400"
                      )}
                      style={{ height: d.avg != null ? `${(d.avg / 100) * 96}px` : "4px", minHeight: "4px" }}
                    />
                    <span className="text-gray-400 rotate-90 origin-center" style={{ fontSize: "8px", whiteSpace: "nowrap" }}>
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats par matière */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
            <BarChart2 className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Performance par matière</h2>
          </div>
          <div className="p-5">
            {matiereList.length === 0 ? (
              <div className="h-32 flex items-center justify-center">
                <p className="text-sm text-gray-400">Aucune donnée disponible</p>
              </div>
            ) : (
              <div className="space-y-3">
                {matiereList
                  .sort((a, b) => b.total - a.total)
                  .slice(0, 6)
                  .map((m) => {
                    const pct = m.total > 0 ? Math.round((m.correct / m.total) * 100) : 0;
                    return (
                      <div key={m.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700 truncate">{m.name}</span>
                          <span className="text-xs font-semibold text-gray-600 shrink-0 ml-2">{pct}% ({m.correct}/{m.total})</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: m.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Historique des tentatives */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Historique complet</h2>
          </div>
          <Link href="/exercices" className="text-xs text-indigo-600 hover:underline">Faire un exercice →</Link>
        </div>

        {attempts.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            Aucun exercice complété pour l'instant.{" "}
            <Link href="/exercices" className="text-indigo-600 hover:underline">Commencer →</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {attempts.slice(0, 20).map((att: any) => {
              const score = att.score as number | null;
              const serieNom = att.series?.name ?? "Série";
              const matiere = att.series?.matiere;
              const date = att.ended_at
                ? new Date(att.ended_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
                : "—";
              const timeStr = att.time_spent_s ? formatTime(att.time_spent_s) : null;

              return (
                <div key={att.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    score == null ? "bg-gray-100 text-gray-500" :
                    score >= 70 ? "bg-green-100 text-green-700" :
                    score >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
                  )}>
                    {score != null ? Math.round(score) : "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{serieNom}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {matiere && (
                        <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: matiere.color, fontSize: "10px" }}>
                          {matiere.name}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{date}</span>
                      {timeStr && <span className="text-xs text-gray-400">· {timeStr}</span>}
                      {att.nb_correct != null && att.nb_total > 0 && (
                        <span className="text-xs text-gray-400">· {att.nb_correct}/{att.nb_total} correctes</span>
                      )}
                    </div>
                  </div>
                  <span className={cn(
                    "text-sm font-bold shrink-0",
                    score == null ? "text-gray-400" :
                    score >= 70 ? "text-green-600" :
                    score >= 50 ? "text-amber-600" : "text-red-500"
                  )}>
                    {score != null ? `${Math.round(score)}%` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds) return "0 min";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string;
  color: "indigo" | "green" | "orange" | "red" | "gray" | "blue" | "yellow";
}) {
  const colors = {
    indigo: "bg-indigo-100 text-indigo-600",
    green: "bg-green-100 text-green-600",
    orange: "bg-orange-100 text-orange-600",
    red: "bg-red-100 text-red-600",
    gray: "bg-gray-100 text-gray-500",
    blue: "bg-blue-100 text-blue-600",
    yellow: "bg-yellow-100 text-yellow-600",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", colors[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
    </div>
  );
}
