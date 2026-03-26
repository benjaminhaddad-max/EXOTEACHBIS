"use client";

import { useUser } from "@/hooks/use-user";
import {
  LayoutDashboard,
  GraduationCap,
  Settings,
  Users,
  CreditCard,
  Calendar,
  HelpCircle,
  Trophy,
  Megaphone,
  Layers,
  MessageCircleQuestion,
  Handshake,
} from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { SidebarItem } from "./sidebar-item";

const adminNavItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pedagogie", label: "Pédagogie & Exercices", icon: GraduationCap },
  { href: "/admin/examens", label: "Examens", icon: Trophy },
  { href: "/admin/coaching", label: "Coaching", icon: Handshake },
  // { href: "/admin/flashcards", label: "Flashcards", icon: Layers }, // Intégré dans Pédagogie & Exercices
  { href: "/admin/questions-reponses", label: "Questions / Réponses", icon: MessageCircleQuestion },
  { href: "/admin/annonces", label: "Annonces", icon: Megaphone },
  { href: "/admin/utilisateurs", label: "Administration", icon: Users },
  // { href: "/admin/abonnements", label: "Abonnements", icon: CreditCard }, // Désactivé temporairement
  { href: "/admin/planning", label: "Planning", icon: Calendar },
  { href: "/admin/formulaires", label: "Formulaires", icon: Settings },
  { href: "/admin/aide", label: "Aide", icon: HelpCircle },
];

export function AdminSidebar() {
  const { profile } = useUser();
  const navItems = profile?.role === "prof" || profile?.role === "coach"
    ? adminNavItems.filter((item) => item.href === "/admin/annonces" || item.href === "/admin/coaching")
    : adminNavItems;

  return (
    <SidebarShell>
      {navItems.map((item) => (
        <SidebarItem key={item.href} {...item} />
      ))}
    </SidebarShell>
  );
}
