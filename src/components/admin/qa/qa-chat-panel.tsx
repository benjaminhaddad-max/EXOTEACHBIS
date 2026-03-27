"use client";

import type { QaThread } from "@/types/qa";
import { ChatThread } from "@/components/qa/chat-thread";
import { buildDeepLink } from "@/lib/qa/deep-link";
import { ExternalLink, User, CheckCircle2, Archive, Trash2, ArchiveRestore } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface QaChatPanelProps {
  thread: QaThread;
  userId: string;
  onResolve?: () => void;
  onArchiveThread?: (threadId: string) => void | Promise<void>;
  onUnarchiveThread?: (threadId: string) => void | Promise<void>;
  onDeleteThread?: (threadId: string) => void | Promise<void>;
}

export function QaChatPanel({
  thread,
  userId,
  onResolve,
  onArchiveThread,
  onUnarchiveThread,
  onDeleteThread,
}: QaChatPanelProps) {
  const deepLink = buildDeepLink(thread);
  const supabase = createClient();

  const studentName = thread.student
    ? `${thread.student.first_name ?? ""} ${thread.student.last_name ?? ""}`.trim() || thread.student.email
    : "Étudiant";

  const isArchived = Boolean(thread.archived_at);

  const handleResolve = async () => {
    await supabase
      .from("qa_threads")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id);

    // Notify student
    await supabase.from("notifications").insert({
      user_id: thread.student_id,
      type: "qa_prof_replied",
      title: "Votre question a été résolue",
      body: thread.title?.slice(0, 100) ?? "",
      link: deepLink + `?qa_thread=${thread.id}`,
    });

    onResolve?.();
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header with student info + deep link */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-gray-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{studentName}</p>
              {isArchived && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 shrink-0">
                  Archivée
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 truncate">{thread.context_label}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
              bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Voir le contexte
          </a>

          {thread.status !== "resolved" && !isArchived && (
            <button
              type="button"
              onClick={handleResolve}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              Résoudre
            </button>
          )}

          {isArchived && onUnarchiveThread && (
            <button
              type="button"
              onClick={() => onUnarchiveThread(thread.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              <ArchiveRestore className="w-3 h-3" />
              Désarchiver
            </button>
          )}

          {!isArchived && onArchiveThread && (
            <button
              type="button"
              onClick={() => onArchiveThread(thread.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-100 transition-colors"
              title="Masquer de la liste (l’élève ne la voit plus)"
            >
              <Archive className="w-3 h-3" />
              Archiver
            </button>
          )}

          {onDeleteThread && (
            <button
              type="button"
              onClick={() => onDeleteThread(thread.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                bg-red-50 text-red-700 hover:bg-red-100 border border-red-100 transition-colors"
              title="Suppression définitive"
            >
              <Trash2 className="w-3 h-3" />
              Supprimer
            </button>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatThread
          thread={thread}
          viewerRole="prof"
          viewerId={userId}
        />
      </div>
    </div>
  );
}
