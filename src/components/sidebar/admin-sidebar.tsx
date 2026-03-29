"use client";

import { useUser } from "@/hooks/use-user";
import { usePathname } from "next/navigation";
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
  ArrowLeft,
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

const coachNavItems = [
  { href: "/admin/coaching", label: "Coaching", icon: Handshake },
  { href: "/vue-eleve", label: "Vue élève", icon: Eye },
];

export function AdminSidebar() {
  const { profile } = useUser();
  const pathname = usePathname();

  // On /admin/coaching, admins see the coach sidebar (immersive coach view)
  const isCoachingPage = pathname === "/admin/coaching";
  const isCoachRole = profile?.role === "coach";

  const showCoachSidebar = isCoachRole || isCoachingPage;

  const navItems = showCoachSidebar
    ? [
        ...coachNavItems,
        // Admins get a "back to admin" link
        ...(!isCoachRole ? [{ href: "/admin/dashboard", label: "Retour admin", icon: ArrowLeft }] : []),
      ]
    : profile?.role === "prof"
      ? adminNavItems.filter((item) => item.href === "/admin/communication" || item.href === "/admin/coaching")
      : adminNavItems;

  return (
    <SidebarShell>
      {navItems.map((item) => (
        <SidebarItem key={item.href} {...item} />
      ))}
    </SidebarShell>
  );
}
