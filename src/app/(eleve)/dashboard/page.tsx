"use client";

import { Header } from "@/components/header";
import { StatCard } from "@/components/dashboard/stat-card";
import { BookOpen, ClipboardList, FileCheck, TrendingUp } from "lucide-react";
import { useUser } from "@/hooks/use-user";

export default function StudentDashboard() {
  const { profile } = useUser();

  return (
    <div>
      <Header title={profile?.first_name ? `Bienvenue, ${profile.first_name}` : "Dashboard"} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Cours suivis" value="--" icon={BookOpen} />
        <StatCard title="Exercices faits" value="--" icon={ClipboardList} />
        <StatCard title="Examens passés" value="--" icon={FileCheck} />
        <StatCard title="Progression" value="--" icon={TrendingUp} />
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-lg font-semibold text-gray-900">Bientôt disponible</p>
        <p className="mt-2 text-gray-500">
          Vos cours, exercices et statistiques de progression apparaîtront ici.
        </p>
      </div>
    </div>
  );
}
