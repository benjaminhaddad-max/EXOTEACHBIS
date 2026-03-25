import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import {
  Users, ClipboardList, BookOpen, MessageSquare,
  TrendingUp, Eye, UsersRound, CheckSquare
} from "lucide-react";
import { cn } from "@/lib/utils";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [
    usersResult, coursResult, questionsResult,
    answersResult, groupesResult, postsResult,
    attemptsResult, progressResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("cours").select("id", { count: "exact", head: true }).eq("visible", true),
    supabase.from("questions").select("id", { count: "exact", head: true }),
    supabase.from("user_answers").select("id", { count: "exact", head: true }),
    supabase.from("groupes").select("id", { count: "exact", head: true }),
    supabase.from("posts").select("id", { count: "exact", head: true }),
    supabase.from("serie_attempts").select("id", { count: "exact", head: true }).not("ended_at", "is", null),
    supabase.from("user_progress").select("pct_complete"),
  ]);

  const progresses = progressResult.data ?? [];
  const avgProgress = progresses.length > 0
    ? Math.round(progresses.reduce((acc, p) => acc + (p.pct_complete ?? 0), 0) / progresses.length)
    : 0;

  const stats = [
    {
      title: "Utilisateurs inscrits",
      value: (usersResult.count ?? 0).toLocaleString("fr-FR"),
      icon: Users,
      description: "Comptes actifs",
      color: "blue" as const,
    },
    {
      title: "Cours publiés",
      value: (coursResult.count ?? 0).toLocaleString("fr-FR"),
      icon: BookOpen,
      description: "Fiches disponibles",
      color: "navy" as const,
    },
    {
      title: "Exercices",
      value: (questionsResult.count ?? 0).toLocaleString("fr-FR"),
      icon: ClipboardList,
      description: "Questions au total",
      color: "purple" as const,
    },
    {
      title: "Réponses soumises",
      value: (answersResult.count ?? 0).toLocaleString("fr-FR"),
      icon: CheckSquare,
      description: "Toutes séries confondues",
      color: "green" as const,
    },
    {
      title: "Groupes",
      value: (groupesResult.count ?? 0).toLocaleString("fr-FR"),
      icon: UsersRound,
      description: "Classes actives",
      color: "orange" as const,
    },
    {
      title: "Messages forum",
      value: (postsResult.count ?? 0).toLocaleString("fr-FR"),
      icon: MessageSquare,
      description: "Questions & annonces",
      color: "pink" as const,
    },
    {
      title: "Séries terminées",
      value: (attemptsResult.count ?? 0).toLocaleString("fr-FR"),
      icon: TrendingUp,
      description: "Tentatives complètes",
      color: "teal" as const,
    },
    {
      title: "Progression moyenne",
      value: `${avgProgress}%`,
      icon: Eye,
      description: "Sur tous les cours",
      color: "gray" as const,
    },
  ];

  return (
    <div>
      <Header title="Tableau de bord" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <AdminStatCard key={stat.title} {...stat} />
        ))}
      </div>
    </div>
  );
}

type StatColor = "blue" | "navy" | "purple" | "green" | "orange" | "pink" | "teal" | "gray";

function AdminStatCard({
  title, value, icon: Icon, description, color,
}: {
  title: string; value: string; icon: any; description: string; color: StatColor;
}) {
  const colorMap: Record<StatColor, string> = {
    blue: "bg-blue-100 text-blue-600",
    navy: "bg-navy/10 text-navy",
    purple: "bg-purple-100 text-purple-600",
    green: "bg-green-100 text-green-600",
    orange: "bg-orange-100 text-orange-600",
    pink: "bg-pink-100 text-pink-600",
    teal: "bg-teal-100 text-teal-600",
    gray: "bg-gray-100 text-gray-500",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={cn("mb-4 flex h-10 w-10 items-center justify-center rounded-lg", colorMap[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm font-semibold text-gray-800">{title}</p>
      <p className="text-xs text-gray-400 mt-0.5">{description}</p>
    </div>
  );
}
