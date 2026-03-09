"use client";

import { Header } from "@/components/header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Users, ClipboardList, CreditCard, TrendingUp, BookOpen, Eye } from "lucide-react";

export default function AdminDashboard() {
  return (
    <div>
      <Header title="Tableau de bord" />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Utilisateurs inscrits"
          value="--"
          icon={Users}
          description="Total des comptes"
        />
        <StatCard
          title="Exercices"
          value="--"
          icon={ClipboardList}
          description="Exercices disponibles"
        />
        <StatCard
          title="Abonnements actifs"
          value="--"
          icon={CreditCard}
          description="En cours"
        />
        <StatCard
          title="Cours"
          value="--"
          icon={BookOpen}
          description="Publiés"
        />
        <StatCard
          title="Vues totales"
          value="--"
          icon={Eye}
          description="Ce mois-ci"
        />
        <StatCard
          title="Taux de complétion"
          value="--"
          icon={TrendingUp}
          description="Moyenne globale"
        />
      </div>
    </div>
  );
}
