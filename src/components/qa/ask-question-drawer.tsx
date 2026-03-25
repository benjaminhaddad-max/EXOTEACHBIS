"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, MessageCircleQuestion } from "lucide-react";
import type { QaContextProps, QaThread } from "@/types/qa";
import { resolveQaContextClient } from "@/lib/qa/context";
import { ChatThread } from "./chat-thread";
import { ContextBadge } from "./context-badge";
import { ChatInputBar } from "./chat-input-bar";

interface AskQuestionDrawerProps extends QaContextProps {
  onClose: () => void;
}

export function AskQuestionDrawer({ onClose, ...ctx }: AskQuestionDrawerProps) {
  const [thread, setThread] = useState<QaThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [resolvedLabel, setResolvedLabel] = useState(ctx.contextLabel ?? "");
  const [resolvedMatiereId, setResolvedMatiereId] = useState(ctx.matiereId ?? "");
  const [userId, setUserId] = useState<string>("");

  const supabase = createClient();

  // Initialize: resolve context + find existing thread + get user
  useEffect(() => {
    async function init() {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Resolve context
      if (!ctx.contextLabel || !ctx.matiereId) {
        const resolved = await resolveQaContextClient(ctx);
        setResolvedLabel(resolved.contextLabel);
        setResolvedMatiereId(resolved.matiereId);
      }

      // Look for existing open thread with same context
      let query = supabase
        .from("qa_threads")
        .select("*, matiere:matieres(id, name, color)")
        .eq("student_id", user.id)
        .eq("context_type", ctx.contextType)
        .in("status", ["ai_pending", "ai_answered", "escalated", "prof_answered"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (ctx.questionId) query = query.eq("question_id", ctx.questionId);
      else if (ctx.coursId) query = query.eq("cours_id", ctx.coursId);
      else if (ctx.matiereId) query = query.eq("matiere_id", ctx.matiereId);
      else if (ctx.dossierId) query = query.eq("dossier_id", ctx.dossierId);

      const { data } = await query;
      if (data && data.length > 0) {
        setThread(data[0] as QaThread);
      }

      setLoading(false);
    }
    init();
  }, []);

  // Create a new thread when user sends first message
  const handleFirstMessage = useCallback(async (text: string) => {
    if (!userId || !resolvedMatiereId) return;
    setCreating(true);

    const { data: newThread, error } = await supabase
      .from("qa_threads")
      .insert({
        student_id: userId,
        context_type: ctx.contextType,
        dossier_id: ctx.dossierId ?? null,
        matiere_id: resolvedMatiereId,
        cours_id: ctx.coursId ?? null,
        question_id: ctx.questionId ?? null,
        option_id: ctx.optionId ?? null,
        serie_id: ctx.serieId ?? null,
        context_label: resolvedLabel,
        title: text.slice(0, 120),
        status: "ai_pending",
      })
      .select("*, matiere:matieres(id, name, color)")
      .single();

    if (error || !newThread) {
      console.error("Failed to create thread:", error);
      setCreating(false);
      return;
    }

    // Insert the student's first message
    await supabase.from("qa_messages").insert({
      thread_id: newThread.id,
      sender_id: userId,
      sender_type: "student",
      content_type: "text",
      content: text,
      read_by_student: true,
    });

    setThread(newThread as QaThread);
    setCreating(false);

    // Trigger AI response
    try {
      const resp = await fetch("/api/qa/ai-respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: newThread.id,
          question_text: text,
          context: {
            matiere_name: (newThread as QaThread).matiere?.name ?? "",
            context_label: resolvedLabel,
          },
        }),
      });
      await resp.json();
      // Thread will update via realtime
    } catch (err) {
      console.error("AI respond error:", err);
    }
  }, [userId, resolvedMatiereId, resolvedLabel, ctx, supabase]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="relative w-full sm:w-[440px] h-[85vh] sm:h-[600px] sm:max-h-[85vh]
          bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl
          flex flex-col overflow-hidden
          animate-in slide-in-from-bottom duration-300"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white shrink-0">
          <div className="w-9 h-9 rounded-full bg-[#0e1e35] text-white flex items-center justify-center">
            <MessageCircleQuestion className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Question</h3>
            {resolvedLabel && (
              <p className="text-xs text-gray-500 truncate">{resolvedLabel}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : thread ? (
          <ChatThread
            thread={thread}
            viewerRole="student"
            viewerId={userId}
          />
        ) : (
          /* New thread — show context + first message input */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <MessageCircleQuestion className="w-8 h-8 text-blue-500" />
              </div>
              <h4 className="text-base font-semibold text-gray-900 mb-1">
                Posez votre question
              </h4>
              <p className="text-sm text-gray-500 mb-4">
                L&apos;IA vous répondra immédiatement. Si la réponse ne vous convient pas,
                vous pourrez demander l&apos;aide d&apos;un professeur.
              </p>
              {resolvedLabel && (
                <ContextBadge
                  contextType={ctx.contextType}
                  contextLabel={resolvedLabel}
                />
              )}
            </div>

            {creating ? (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Envoi en cours...
              </div>
            ) : (
              <ChatInputBar
                onSendText={handleFirstMessage}
                onSendVoice={async () => {}}
                onSendMedia={async () => {}}
                placeholder="Écrivez votre question..."
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
