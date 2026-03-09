"use client";

import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  FileCheck,
  Calendar,
  MessageSquare,
  UserCircle,
  UsersRound,
} from "lucide-react";
import { SidebarShell } from "./sidebar-shell";
import { SidebarItem } from "./sidebar-item";

const studentNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cours", label: "Cours", icon: BookOpen },
  { href: "/exercices", label: "Exercices", icon: ClipboardList },
  { href: "/examens", label: "Examens", icon: FileCheck },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/forum", label: "Forum", icon: MessageSquare },
  { href: "/profil", label: "Profil", icon: UserCircle },
  { href: "/equipe", label: "Équipe", icon: UsersRound },
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
