"use client";

import type { QaThread } from "@/types/qa";
import { User, Bot, CheckCircle2, AlertCircle, Clock, MessageSquare } from "lucide-react";

interface QaThreadListProps {
  threads: QaThread[];
  selectedId?: string;
  onSelect: (thread: QaThread) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Bot }> = {
  ai_pending: { label: "IA en cours", color: "bg-gray-100 text-gray-600", icon: Clock },
  ai_answered: { label: "IA répondu", color: "bg-blue-100 text-blue-600", icon: Bot },
  escalated: { label: "Escaladée", color: "bg-red-100 text-red-600", icon: AlertCircle },
  prof_answered: { label: "Prof répondu", color: "bg-amber-100 text-amber-600", icon: MessageSquare },
  resolved: { label: "Résolue", color: "bg-emerald-100 text-emerald-600", icon: CheckCircle2 },
};

export function QaThreadList({ threads, selectedId, onSelect }: QaThreadListProps) {
  if (threads.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6">
        <MessageSquare className="w-8 h-8 mb-2 text-gray-200" />
        <p className="text-sm">Aucune question</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {threads.map((t) => {
        const isSelected = t.id === selectedId;
        const status = statusConfig[t.status] ?? statusConfig.ai_pending;
        const StatusIcon = status.icon;
        const studentName =
          t.student
            ? `${t.student.first_name ?? ""} ${t.student.last_name ?? ""}`.trim() || t.student.email
            : "Étudiant";

        const lastMsg = Array.isArray(t.last_message)
          ? (t.last_message as unknown as QaThread["last_message"][])?.[0]
          : t.last_message;

        const preview =
          lastMsg?.content_type === "text"
            ? lastMsg.content?.slice(0, 80) ?? ""
            : lastMsg?.content_type === "voice"
            ? "🎤 Note vocale"
            : lastMsg?.content_type === "image"
            ? "📷 Photo"
            : lastMsg?.content_type === "video"
            ? "🎥 Vidéo"
            : t.title.slice(0, 80);

        const time = new Date(t.updated_at ?? t.created_at).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
              isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-gray-400" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {studentName}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">{time}</span>
                </div>

                {/* Context & matiere */}
                <div className="flex items-center gap-1.5 mt-0.5">
                  {t.matiere && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: `${t.matiere.color}15`,
                        color: t.matiere.color,
                      }}
                    >
                      {t.matiere.name}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.color}`}>
                    <StatusIcon className="w-2.5 h-2.5 inline mr-0.5" />
                    {status.label}
                  </span>
                </div>

                {/* Preview */}
                <p className="text-xs text-gray-500 truncate mt-1">{preview}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
