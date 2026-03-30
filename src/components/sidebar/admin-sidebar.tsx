"use client";

import { useUser } from "@/hooks/use-user";
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  Calendar,
  HelpCircle,
  Trophy,
  MessageSquare,
  MessageCircleQuestion,
  Handshake,
  Eye,
  Brain,
} from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { SidebarItem } from "./sidebar-item";

const adminNavItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pedagogie", label: "Pédagogie & Exercices", icon: GraduationCap },
  { href: "/admin/examens", label: "Examens", icon: Trophy },
  { href: "/admin/coaching", label: "Coaching", icon: Handshake },
  { href: "/admin/questions-reponses", label: "Questions / Réponses", icon: MessageCircleQuestion },
  { href: "/admin/communication", label: "Communication", icon: MessageSquare },
  { href: "/admin/utilisateurs", label: "Administration", icon: Users },
  { href: "/admin/planning", label: "Planning", icon: Calendar },
  { href: "/admin/aide", label: "Aide", icon: HelpCircle },
];

const superAdminExtraItems = [
  { href: "/admin/knowledge-base", label: "Knowledge Base", icon: Brain },
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

export function AdminSidebar() {
  const { profile } = useUser();

  const baseItems =
    !profile
      ? adminNavItems
      : profile.role === "coach"
      ? coachNavItems
      : profile.role === "prof"
        ? profNavItems
        : adminNavItems;

  const navItems = profile?.role === "superadmin"
    ? [...baseItems, ...superAdminExtraItems]
    : baseItems;

  return (
    <SidebarShell>
      {navItems.map((item) => (
        <SidebarItem key={item.href} {...item} />
      ))}
    </SidebarShell>
  );
}
