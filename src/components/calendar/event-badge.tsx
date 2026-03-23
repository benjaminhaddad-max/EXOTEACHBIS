import { cn } from "@/lib/utils";
import type { EventType } from "@/types/database";

export const EVENT_COLORS: Record<EventType, { bg: string; text: string; dot: string }> = {
  cours:    { bg: "bg-blue-100",   text: "text-blue-800",   dot: "bg-blue-500" },
  examen:   { bg: "bg-red-100",    text: "text-red-800",    dot: "bg-red-500" },
  reunion:  { bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
  revision: { bg: "bg-green-100",  text: "text-green-800",  dot: "bg-green-500" },
  autre:    { bg: "bg-gray-100",   text: "text-gray-700",   dot: "bg-gray-400" },
};

export const EVENT_LABELS: Record<EventType, string> = {
  cours:    "Cours",
  examen:   "Examen",
  reunion:  "Réunion",
  revision: "Révision",
  autre:    "Autre",
};

interface EventBadgeProps {
  type: EventType;
  title: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function EventBadge({ type, title, className, onClick }: EventBadgeProps) {
  const colors = EVENT_COLORS[type] ?? EVENT_COLORS.autre;
  return (
    <span
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs font-medium",
        colors.bg,
        colors.text,
        className,
      )}
      title={title}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", colors.dot)} />
      <span className="truncate">{title}</span>
    </span>
  );
}
