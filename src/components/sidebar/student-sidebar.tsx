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

  Handshake,
  MessageSquare,
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

const coachNavItems = [
  { href: "/admin/coaching", label: "Coaching", icon: Handshake },
  { href: "/admin/communication", label: "Communication", icon: MessageSquare },
  { href: "/cours", label: "Cours & Exercices", icon: BookOpen },
  { href: "/vue-eleve", label: "Vue élève", icon: Eye },
];

export function StudentSidebar() {
  const { profile } = useUser();
  const navItems = profile?.role === "coach" ? coachNavItems : studentNavItems;

  return (
    <SidebarShell>
      {navItems.map((item) => (
        <SidebarItem key={item.href} {...item} />
      ))}
    </SidebarShell>
  );
}
