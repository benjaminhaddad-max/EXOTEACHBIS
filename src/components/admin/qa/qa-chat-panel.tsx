"use client";

import type { QaThread } from "@/types/qa";
import { ChatThread } from "@/components/qa/chat-thread";
import { buildDeepLink } from "@/lib/qa/deep-link";
import { ExternalLink, User, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface QaChatPanelProps {
  thread: QaThread;
  userId: string;
  onResolve?: () => void;
}

export function QaChatPanel({ thread, userId, onResolve }: QaChatPanelProps) {
  const deepLink = buildDeepLink(thread);
  const supabase = createClient();

  const studentName = thread.student
    ? `${thread.student.first_name ?? ""} ${thread.student.last_name ?? ""}`.trim() || thread.student.email
    : "Étudiant";

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
            <p className="text-sm font-semibold text-gray-900 truncate">{studentName}</p>
            <p className="text-[10px] text-gray-400 truncate">{thread.context_label}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Deep link */}
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

          {/* Resolve button */}
          {thread.status !== "resolved" && (
            <button
              onClick={handleResolve}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              Résoudre
            </button>
          )}
        </div>
      </div>

      {/* Chat */}
      <ChatThread
        thread={thread}
        viewerRole="prof"
        viewerId={userId}
      />
    </div>
  );
}
