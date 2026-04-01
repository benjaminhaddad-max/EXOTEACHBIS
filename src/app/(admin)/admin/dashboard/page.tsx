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
  const colorMap: Record<StatColor, { bg: string; text: string; glow: string }> = {
    blue:   { bg: "rgba(59,130,246,0.12)", text: "#60A5FA", glow: "rgba(59,130,246,0.08)" },
    navy:   { bg: "rgba(79,171,219,0.12)", text: "#4FABDB", glow: "rgba(79,171,219,0.08)" },
    purple: { bg: "rgba(147,51,234,0.12)", text: "#A78BFA", glow: "rgba(147,51,234,0.08)" },
    green:  { bg: "rgba(16,185,129,0.12)", text: "#34D399", glow: "rgba(16,185,129,0.08)" },
    orange: { bg: "rgba(245,158,11,0.12)", text: "#FBBF24", glow: "rgba(245,158,11,0.08)" },
    pink:   { bg: "rgba(236,72,153,0.12)", text: "#F472B6", glow: "rgba(236,72,153,0.08)" },
    teal:   { bg: "rgba(20,184,166,0.12)", text: "#2DD4BF", glow: "rgba(20,184,166,0.08)" },
    gray:   { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.6)", glow: "rgba(255,255,255,0.03)" },
  };
  const c = colorMap[color];
  return (
    <div className="rounded-xl border border-white/[0.06] p-5 transition-all hover:border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.03)", boxShadow: `0 0 24px ${c.glow}` }}>
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: c.bg, color: c.text }}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-3xl font-bold text-white/90">{value}</p>
      <p className="mt-1 text-sm font-semibold text-white/70">{title}</p>
      <p className="text-xs text-white/35 mt-0.5">{description}</p>
    </div>
  );
}
