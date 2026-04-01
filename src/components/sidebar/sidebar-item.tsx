"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

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
      className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200"
      style={isActive ? {
        background: "linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.04) 100%)",
        color: "#E3C286",
      } : {
        color: "rgba(255,255,255,0.5)",
      }}
      onMouseOver={e => { if (!isActive) { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; } }}
      onMouseOut={e => { if (!isActive) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; } }}
    >
      {/* Active indicator */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" style={{ background: "linear-gradient(180deg, #E3C286, #C9A84C)" }} />
      )}
      {/* Icon container */}
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-all duration-200"
        style={isActive ? {
          background: "rgba(201,168,76,0.15)",
          boxShadow: "0 0 12px rgba(201,168,76,0.1)",
        } : {
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <Icon className="h-[16px] w-[16px]" style={isActive ? { color: "#E3C286" } : {}} />
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
