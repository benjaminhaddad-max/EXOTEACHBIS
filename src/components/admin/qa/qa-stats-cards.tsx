"use client";

import type { QaThread } from "@/types/qa";
import { AlertCircle, Bot, CheckCircle2, Clock } from "lucide-react";

interface QaStatsCardsProps {
  threads: QaThread[];
}

export function QaStatsCards({ threads }: QaStatsCardsProps) {
  const escalated = threads.filter((t) => t.status === "escalated").length;
  const aiAnswered = threads.filter((t) => t.status === "ai_answered").length;
  const profAnswered = threads.filter((t) => t.status === "prof_answered").length;
  const resolved = threads.filter((t) => t.status === "resolved").length;

  const today = new Date().toDateString();
  const resolvedToday = threads.filter(
    (t) => t.status === "resolved" && t.resolved_at && new Date(t.resolved_at).toDateString() === today
  ).length;

  const cards = [
    {
      label: "Escaladées",
      value: escalated,
      icon: AlertCircle,
      color: "text-red-600 bg-red-50 border-red-100",
      iconColor: "text-red-500",
    },
    {
      label: "En attente IA",
      value: aiAnswered,
      icon: Bot,
      color: "text-blue-600 bg-blue-50 border-blue-100",
      iconColor: "text-blue-500",
    },
    {
      label: "Prof répondu",
      value: profAnswered,
      icon: Clock,
      color: "text-amber-600 bg-amber-50 border-amber-100",
      iconColor: "text-amber-500",
    },
    {
      label: "Résolues aujourd'hui",
      value: resolvedToday,
      icon: CheckCircle2,
      color: "text-emerald-600 bg-emerald-50 border-emerald-100",
      iconColor: "text-emerald-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className={`rounded-xl border px-4 py-3 ${c.color}`}
          >
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${c.iconColor}`} />
              <span className="text-xs font-medium opacity-80">{c.label}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{c.value}</p>
          </div>
        );
      })}
    </div>
  );
}
