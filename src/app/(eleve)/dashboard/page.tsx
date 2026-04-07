import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import Link from "next/link";
import { BookOpen, ClipboardList, TrendingUp, Clock, ChevronRight, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, role, student_id")
    .eq("id", user!.id)
    .single();

  const [progressResult, attemptsResult, recentCoursResult] = await Promise.all([
    supabase
      .from("user_progress")
      .select("pct_complete, cours_id, last_seen_at")
      .eq("user_id", user!.id),
    supabase
      .from("serie_attempts")
      .select("id, score, ended_at, series_id")
      .eq("user_id", user!.id)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(5),
    supabase
      .from("user_progress")
      .select(`
        pct_complete, last_seen_at,
        cours:cours (id, name, matiere:matieres (name, color))
      `)
      .eq("user_id", user!.id)
      .order("last_seen_at", { ascending: false })
      .limit(6),
  ]);

  const progresses = progressResult.data ?? [];
  const attempts = attemptsResult.data ?? [];
  const recentCours = recentCoursResult.data ?? [];

  const totalCours = progresses.length;
  const completedCours = progresses.filter((p) => p.pct_complete >= 100).length;
  const avgProgress = totalCours > 0
    ? Math.round(progresses.reduce((acc, p) => acc + p.pct_complete, 0) / totalCours)
    : 0;
  const completedAttempts = attempts.filter((a) => a.score != null);
  const avgScore = completedAttempts.length > 0
    ? Math.round(completedAttempts.reduce((acc, a) => acc + (a.score ?? 0), 0) / completedAttempts.length)
    : null;

  const greeting = profile?.first_name ? `Bonjour, ${profile.first_name}` : "Tableau de bord";

  return (
    <div>
      <Header title={greeting} subtitle={profile?.student_id ? `N\u00B0 \u00E9tudiant : ${profile.student_id}` : undefined} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        <StatCard icon={BookOpen} label="Cours consultés" value={String(totalCours)}
          sub={`${completedCours} terminé${completedCours !== 1 ? "s" : ""}`} color="blue" />
        <StatCard icon={TrendingUp} label="Progression moy." value={`${avgProgress}%`}
          sub="sur tous les cours" color="navy" />
        <StatCard icon={ClipboardList} label="Exercices faits" value={String(completedAttempts.length)}
          sub="séries terminées" color="green" />
        <StatCard icon={Target} label="Score moyen" value={avgScore != null ? `${avgScore}%` : "—"}
          sub="sur les QCM"
          color={avgScore == null ? "gray" : avgScore >= 70 ? "green" : avgScore >= 50 ? "orange" : "red"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Derniers cours */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-navy" />
              <h2 className="text-sm font-semibold text-gray-900">Derniers cours consultés</h2>
            </div>
            <Link href="/cours" className="text-xs text-navy hover:underline">Voir tous</Link>
          </div>

          {recentCours.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              Vous n'avez pas encore consulté de cours.{" "}
              <Link href="/cours" className="text-navy hover:underline">Accéder aux cours →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentCours.map((item: any) => {
                const cours = item.cours;
                if (!cours) return null;
                const matiere = cours.matiere;
                return (
                  <Link key={cours.id} href={`/cours/${cours.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold"
                      style={{ backgroundColor: matiere?.color ?? "#3B82F6" }}>
                      {(cours.name[0] ?? "C").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-navy truncate">{cours.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{matiere?.name}</span>
                        <div className="flex-1 h-1 rounded-full bg-gray-100 max-w-20">
                          <div className="h-full rounded-full bg-navy" style={{ width: `${item.pct_complete}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{item.pct_complete}%</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-navy shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Dernières séries */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-navy" />
              <h2 className="text-sm font-semibold text-gray-900">Dernières séries</h2>
            </div>
            <Link href="/exercices" className="text-xs text-navy hover:underline">Voir tout</Link>
          </div>

          {attempts.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              Aucun exercice fait pour l'instant.{" "}
              <Link href="/cours" className="text-navy hover:underline">Commencer →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {attempts.map((attempt: any) => {
                const score = attempt.score as number | null;
                const color = score == null ? "text-gray-400"
                  : score >= 70 ? "text-green-600"
                  : score >= 50 ? "text-orange-500"
                  : "text-red-500";
                const date = new Date(attempt.ended_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
                return (
                  <div key={attempt.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      score != null && score >= 70 ? "bg-green-100 text-green-700"
                      : score != null && score >= 50 ? "bg-orange-100 text-orange-600"
                      : "bg-red-100 text-red-600"
                    )}>
                      {score != null ? `${Math.round(score)}` : "—"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">Série d'exercices</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3 text-gray-300" />
                        <span className="text-xs text-gray-400">{date}</span>
                      </div>
                    </div>
                    <span className={cn("text-sm font-semibold", color)}>
                      {score != null ? `${Math.round(score)}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {totalCours === 0 && (
        <div className="mt-8 rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-10 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-navy/30" />
          <h3 className="mt-4 text-lg font-semibold text-navy">Commencez votre apprentissage</h3>
          <p className="mt-2 text-sm text-gray-500">
            Accédez à vos cours, lisez les fiches et entraînez-vous avec les QCM.
          </p>
          <Link href="/cours"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-light transition-colors">
            Voir les cours
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub: string;
  color: "blue" | "navy" | "green" | "orange" | "red" | "gray";
}) {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    navy: "bg-navy/10 text-navy",
    green: "bg-green-100 text-green-600",
    orange: "bg-orange-100 text-orange-600",
    red: "bg-red-100 text-red-600",
    gray: "bg-gray-100 text-gray-500",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", colors[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
