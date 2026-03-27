"use client";

import {
  LayoutDashboard,
  BookOpen,
  FileCheck,
  Calendar,

  MessageCircleQuestion,
  UserCircle,
  UsersRound,
  Megaphone,
  TrendingUp,
  Bell,
  Handshake,
} from "lucide-react";
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
  { href: "/notifications", label: "Notifications", icon: Bell },

  { href: "/equipe", label: "Équipe", icon: UsersRound },
  { href: "/profil", label: "Profil", icon: UserCircle },
];

export function StudentSidebar() {
  return (
    <SidebarShell>
      {studentNavItems.map((item) => (
        <SidebarItem key={item.href} {...item} />
      ))}
    </SidebarShell>
  );
}
