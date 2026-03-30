"use client";

import {
  LayoutDashboard,
  BookOpen,
  FileCheck,
  Calendar,

  MessageCircleQuestion,
  UserCircle,
  Megaphone,
  TrendingUp,
  GraduationCap,
  Trophy,
  MessageSquare,

  Handshake,
  Eye,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { SidebarShell } from "./sidebar-shell";
import { SidebarItem } from "./sidebar-item";

const studentNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/annonces", label: "Annonces", icon: Megaphone },
  { href: "/cours", label: "Cours & Exercices", icon: BookOpen },
  { href: "/examens", label: "Examens", icon: FileCheck },
  { href: "/mes-questions", label: "Mes questions", icon: MessageCircleQuestion },
  { href: "/progression", label: "Progression", icon: TrendingUp },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/coaching", label: "Coaching", icon: Handshake },
  { href: "/profil", label: "Profil", icon: UserCircle },
];

const profNavItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pedagogie", label: "Pédagogie & Exercices", icon: GraduationCap },
  { href: "/admin/examens", label: "Examens", icon: Trophy },
  { href: "/admin/questions-reponses", label: "Questions / Réponses", icon: MessageCircleQuestion },
  { href: "/admin/communication", label: "Communication", icon: MessageSquare },
  { href: "/admin/planning", label: "Planning", icon: Calendar },
];

const coachNavItems = [
  { href: "/admin/coaching", label: "Coaching", icon: Handshake },
  { href: "/vue-eleve", label: "Vue élève", icon: Eye },
];

export function StudentSidebar() {
  const { profile, loading } = useUser();

  if (loading || !profile) {
    return <SidebarShell>{null}</SidebarShell>;
  }

  const navItems = profile.role === "coach" ? coachNavItems : profile.role === "prof" ? profNavItems : studentNavItems;

  return (
    <SidebarShell>
      {navItems.map((item) => (
        <SidebarItem key={item.href} {...item} />
      ))}
    </SidebarShell>
  );
}
