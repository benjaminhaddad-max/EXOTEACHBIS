"use client";

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
} from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { SidebarItem } from "./sidebar-item";

const adminNavItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pedagogie", label: "Pédagogie & Exercices", icon: GraduationCap },
  { href: "/admin/examens", label: "Examens", icon: Trophy },
  { href: "/admin/flashcards", label: "Flashcards", icon: Layers },
  { href: "/admin/annonces", label: "Annonces", icon: Megaphone },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/abonnements", label: "Abonnements", icon: CreditCard },
  { href: "/admin/planning", label: "Planning", icon: Calendar },
  { href: "/admin/configuration", label: "Configuration", icon: Settings },
  { href: "/admin/aide", label: "Aide", icon: HelpCircle },
];

export function AdminSidebar() {
  return (
    <SidebarShell>
      {adminNavItems.map((item) => (
        <SidebarItem key={item.href} {...item} />
      ))}
    </SidebarShell>
  );
}
