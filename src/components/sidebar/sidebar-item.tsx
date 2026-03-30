"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function SidebarItem({ href, label, icon: Icon }: SidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-r-lg py-2.5 pr-3 pl-3 text-sm font-medium transition-all duration-150",
        isActive
          ? "border-l-2 bg-[rgba(201,168,76,0.1)]"
          : "border-l-2 border-transparent hover:bg-[rgba(255,255,255,0.08)]"
      )}
      style={{ color: isActive ? "#C9A84C" : "rgba(255,255,255,0.65)", borderColor: isActive ? "#C9A84C" : "transparent" }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
