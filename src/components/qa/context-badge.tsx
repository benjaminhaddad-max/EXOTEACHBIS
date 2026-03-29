"use client";

import { BookOpen, Building2, Folder, GraduationCap, HelpCircle, MessageCircle } from "lucide-react";
import type { QaContextType } from "@/types/qa";

const icons: Record<QaContextType, typeof Folder> = {
  dossier: Folder,
  matiere: GraduationCap,
  cours: BookOpen,
  qcm_question: HelpCircle,
  qcm_option: HelpCircle,
  coaching: MessageCircle,
  general: Building2,
};

const colors: Record<QaContextType, string> = {
  dossier: "bg-blue-50 text-blue-700 border-blue-200",
  matiere: "bg-purple-50 text-purple-700 border-purple-200",
  cours: "bg-emerald-50 text-emerald-700 border-emerald-200",
  qcm_question: "bg-amber-50 text-amber-700 border-amber-200",
  qcm_option: "bg-amber-50 text-amber-700 border-amber-200",
  coaching: "bg-yellow-50 text-yellow-700 border-yellow-200",
  general: "bg-slate-50 text-slate-700 border-slate-200",
};

interface ContextBadgeProps {
  contextType: QaContextType;
  contextLabel: string;
  compact?: boolean;
}

export function ContextBadge({ contextType, contextLabel, compact }: ContextBadgeProps) {
  const Icon = icons[contextType] ?? Folder;
  const color = colors[contextType] ?? colors.dossier;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
        <Icon className="w-3 h-3" />
        <span className="truncate max-w-[280px]">{contextLabel}</span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border max-w-full overflow-hidden ${color}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <div className="min-w-0 overflow-hidden">
        <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
          Question sur
        </p>
        <p className="text-xs font-medium leading-snug line-clamp-2 break-words">{contextLabel}</p>
      </div>
    </div>
  );
}
