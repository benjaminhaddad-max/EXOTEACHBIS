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
  MessageSquare,
  Layers,
  MessageCircleQuestion,
  Handshake,
  BookOpen,
  Eye,
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
  const { profile, loading } = useUser();

  // Don't render nav items until profile is loaded to avoid flashing wrong sidebar
  if (loading || !profile) {
    return <SidebarShell>{null}</SidebarShell>;
  }

  const navItems = profile.role === "coach"
    ? coachNavItems
    : profile.role === "prof"
      ? profNavItems
      : adminNavItems;

  return (
    <SidebarShell>
      {navItems.map((item) => (
        <SidebarItem key={item.href} {...item} />
      ))}
    </SidebarShell>
  );
}
