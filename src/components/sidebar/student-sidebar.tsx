"use client";

import {
  LayoutDashboard,
  BookOpen,
  Dumbbell,
  FileCheck,
  Calendar,
  MessageSquare,
  MessageCircleQuestion,
  UserCircle,
  UsersRound,
  Megaphone,
  Layers,
  TrendingUp,
  Bell,
} from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { SidebarItem } from "./sidebar-item";

const studentNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/annonces", label: "Annonces", icon: Megaphone },
  { href: "/cours", label: "Cours & Exercices", icon: BookOpen },
  { href: "/exercices", label: "Entraînement", icon: Dumbbell },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/examens", label: "Examens", icon: FileCheck },
  { href: "/mes-questions", label: "Mes questions", icon: MessageCircleQuestion },
  { href: "/progression", label: "Progression", icon: TrendingUp },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/forum", label: "Forum", icon: MessageSquare },
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
