"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageCircleQuestion, Bot, UserRound, Check, Clock, AlertTriangle, ArrowLeft, ChevronRight, Trash2, Archive } from "lucide-react";
import type { QaThread, QaMessage } from "@/types/qa";
import { ChatThread } from "@/components/qa/chat-thread";
import { ContextBadge } from "@/components/qa/context-badge";

interface ThreadWithMeta extends Omit<QaThread, "last_message"> {
  last_message?: Pick<QaMessage, "id" | "sender_type" | "content_type" | "content" | "created_at"> | null;
  unread_count?: number;
}

interface MesQuestionsShellProps {
  threads: ThreadWithMeta[];
  userId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  ai_pending: { label: "En attente IA", color: "text-gray-500 bg-gray-50 border-gray-200", icon: Clock },
  ai_answered: { label: "IA a répondu", color: "text-blue-600 bg-blue-50 border-blue-200", icon: Bot },
  escalated: { label: "Envoyée au prof", color: "text-orange-600 bg-orange-50 border-orange-200", icon: AlertTriangle },
  prof_answered: { label: "Prof a répondu", color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: UserRound },
  resolved: { label: "Résolue", color: "text-gray-500 bg-gray-50 border-gray-200", icon: Check },
};

function formatRelative(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function MesQuestionsShell({ threads: initialThreads, userId }: MesQuestionsShellProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThread, setSelectedThread] = useState<ThreadWithMeta | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const supabase = createClient();

  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    if (!confirm("Supprimer cette conversation ?")) return;
    // Delete messages first, then thread
    await supabase.from("qa_messages").delete().eq("thread_id", threadId);
    await supabase.from("qa_threads").delete().eq("id", threadId);
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  };

  const handleArchiveThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    await supabase.from("qa_threads").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", threadId);
    setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, status: "resolved" as const } : t));
  };

  const activeThreads = threads.filter((t) => t.status !== "resolved");
  const resolvedThreads = threads.filter((t) => t.status === "resolved");
  const displayThreads = showArchived ? resolvedThreads : activeThreads;

  // Mobile: show chat or list
  if (selectedThread) {
    return (
      <div className="max-w-4xl mx-auto">
        {/* Back button + header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setSelectedThread(null)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {selectedThread.title}
            </h3>
            <p className="text-xs text-gray-500 truncate">{selectedThread.context_label}</p>
          </div>
        </div>

        {/* Chat */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
          <ChatThread
            thread={selectedThread as unknown as QaThread}
            viewerRole="student"
            viewerId={userId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "En cours", count: threads.filter(t => ["ai_pending", "ai_answered", "escalated"].includes(t.status)).length, color: "text-blue-600" },
          { label: "Prof a répondu", count: threads.filter(t => t.status === "prof_answered").length, color: "text-emerald-600" },
          { label: "Résolues", count: threads.filter(t => t.status === "resolved").length, color: "text-gray-500" },
          { label: "Total", count: threads.length, color: "text-gray-900" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs: Active / Archived */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowArchived(false)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !showArchived ? "bg-[#0e1e35] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          En cours ({activeThreads.length})
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showArchived ? "bg-[#0e1e35] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Archivées ({resolvedThreads.length})
        </button>
      </div>

      {/* Thread list */}
      {displayThreads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <MessageCircleQuestion className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-400 mb-1">Aucune question</h3>
          <p className="text-sm text-gray-400">
            Posez des questions depuis vos cours ou exercices — l&apos;IA vous répondra immédiatement.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayThreads.map((t) => {
            const cfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.ai_pending;
            const StatusIcon = cfg.icon;
            const lastMsg = t.last_message;
            const hasUnread = (t.unread_count ?? 0) > 0;

            let preview = "";
            if (lastMsg) {
              if (lastMsg.content_type === "text" && lastMsg.content) {
                const prefix = lastMsg.sender_type === "ai" ? "IA: " : lastMsg.sender_type === "prof" ? "Prof: " : "";
                preview = prefix + lastMsg.content.slice(0, 80);
              } else {
                preview = lastMsg.sender_type === "ai" ? "IA: " : lastMsg.sender_type === "prof" ? "Prof: " : "";
                preview += lastMsg.content_type === "voice" ? "🎤 Note vocale" : lastMsg.content_type === "image" ? "📷 Photo" : "📎 Fichier";
              }
            }

            return (
              <button
                key={t.id}
                onClick={() => setSelectedThread(t)}
                className={`w-full text-left bg-white rounded-xl border p-4 hover:border-gray-300 hover:shadow-sm transition-all ${
                  hasUnread ? "border-blue-200 bg-blue-50/30" : "border-gray-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Title + status */}
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`text-sm font-semibold truncate ${hasUnread ? "text-gray-900" : "text-gray-700"}`}>
                        {t.title || "Question"}
                      </h4>
                      <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.color}`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {cfg.label}
                      </span>
                    </div>

                    {/* Context badge */}
                    <div className="mb-1.5">
                      <ContextBadge contextType={t.context_type} contextLabel={t.context_label} compact />
                    </div>

                    {/* Preview */}
                    {preview && (
                      <p className={`text-xs truncate ${hasUnread ? "text-gray-700 font-medium" : "text-gray-500"}`}>
                        {preview}
                      </p>
                    )}
                  </div>

                  {/* Right side: time + actions + chevron */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-gray-400">
                      {lastMsg ? formatRelative(lastMsg.created_at) : formatRelative(t.created_at)}
                    </span>
                    {hasUnread && (
                      <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {t.unread_count}
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      {t.status !== "resolved" && (
                        <button
                          onClick={(e) => handleArchiveThread(e, t.id)}
                          className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500"
                          title="Archiver"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {t.status === "resolved" && (
                        <button
                          onClick={(e) => handleDeleteThread(e, t.id)}
                          className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
