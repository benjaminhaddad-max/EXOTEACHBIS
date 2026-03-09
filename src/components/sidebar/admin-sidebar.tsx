"use client";

import {
  LayoutDashboard,
  GraduationCap,
  ClipboardList,
  Settings,
  Users,
  CreditCard,
  Calendar,
  HelpCircle,
} from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { SidebarItem } from "./sidebar-item";

const adminNavItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pedagogie", label: "Pédagogie", icon: GraduationCap },
  { href: "/admin/exercices", label: "Exercices", icon: ClipboardList },
  { href: "/admin/configuration", label: "Configuration", icon: Settings },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/abonnements", label: "Abonnements", icon: CreditCard },
  { href: "/admin/planning", label: "Planning", icon: Calendar },
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
