import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ProfilForm } from "@/components/profil/profil-form";
import { Trophy, ClipboardList, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ProfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, attemptsRes, progressRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("serie_attempts")
      .select("id, score, nb_correct, nb_total, ended_at, series:series(name)")
      .eq("user_id", user.id)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(10),
    supabase
      .from("user_progress")
      .select("pct_complete")
      .eq("user_id", user.id),
  ]);

  const profile = profileRes.data as Profile;
  const attempts = (attemptsRes.data ?? []) as any[];
  const progresses = progressRes.data ?? [];

  const completedAttempts = attempts.filter((a) => a.score != null);
  const avgScore = completedAttempts.length > 0
    ? Math.round(completedAttempts.reduce((acc, a) => acc + (a.score ?? 0), 0) / completedAttempts.length)
    : null;
  const avgProgress = progresses.length > 0
    ? Math.round(progresses.reduce((acc, p) => acc + p.pct_complete, 0) / progresses.length)
    : 0;

  return (
    <div>
      <Header title="Mon profil" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {profile.student_id && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-500">Num\u00E9ro {profile.role === "eleve" ? "\u00E9tudiant" : "plateforme"}</p>
                <p className="text-2xl font-bold font-mono text-blue-900 mt-1">{profile.student_id}</p>
              </div>
              <p className="text-xs text-blue-400">Ce num\u00E9ro est votre identifiant sur la plateforme</p>
            </div>
          )}
          <ProfilForm profile={profile} />

          {/* Recent attempts */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
              <ClipboardList className="h-4 w-4 text-navy" />
              <h2 className="text-sm font-semibold text-gray-900">Historique des exercices</h2>
            </div>
            {attempts.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                Aucun exercice effectué pour l'instant.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {attempts.map((a) => {
                  const score = a.score as number | null;
                  const scoreColor = score == null ? "text-gray-400"
                    : score >= 70 ? "text-green-600"
                    : score >= 50 ? "text-orange-500"
                    : "text-red-500";
                  const bgColor = score == null ? "bg-gray-100 text-gray-500"
                    : score >= 70 ? "bg-green-100 text-green-700"
                    : score >= 50 ? "bg-orange-100 text-orange-600"
                    : "bg-red-100 text-red-600";
                  return (
                    <div key={a.id} className="flex items-center gap-4 px-5 py-3">
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold", bgColor)}>
                        {score != null ? `${Math.round(score)}` : "—"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {(a.series as any)?.name ?? "Série d'exercices"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {a.nb_correct}/{a.nb_total} bonnes réponses ·{" "}
                          {new Date(a.ended_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <span className={cn("text-sm font-bold shrink-0", scoreColor)}>
                        {score != null ? `${Math.round(score)}%` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column — stats */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Statistiques</h3>
          <StatCard
            icon={ClipboardList}
            label="Séries terminées"
            value={String(completedAttempts.length)}
            color="navy"
          />
          <StatCard
            icon={Target}
            label="Score moyen"
            value={avgScore != null ? `${avgScore}%` : "—"}
            color={avgScore == null ? "gray" : avgScore >= 70 ? "green" : avgScore >= 50 ? "orange" : "red"}
          />
          <StatCard
            icon={TrendingUp}
            label="Progression cours"
            value={`${avgProgress}%`}
            color="blue"
          />
          <StatCard
            icon={Trophy}
            label="Meilleur score"
            value={completedAttempts.length > 0
              ? `${Math.round(Math.max(...completedAttempts.map((a) => a.score ?? 0)))}%`
              : "—"}
            color="green"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
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
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", colors[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
