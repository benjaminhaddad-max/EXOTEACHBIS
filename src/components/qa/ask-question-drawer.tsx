"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, MessageCircleQuestion } from "lucide-react";
import type { QaContextProps, QaThread } from "@/types/qa";
import { resolveQaContextClient } from "@/lib/qa/context-client";
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

  const callStudentThreadApi = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const response = await fetch("/api/qa/student-thread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error ?? "Erreur inattendue.");
    }

    return data;
  }, []);

  // Initialize: resolve context + find existing thread + get user
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    async function init() {
      try {
        // Safety timeout — never spin forever
        timeout = setTimeout(() => setLoading(false), 8000);

        // Resolve context (skip if already provided)
        if (!ctx.contextLabel || !ctx.matiereId) {
          try {
            const resolved = await resolveQaContextClient(ctx.contextType, {
              dossierId: ctx.dossierId,
              matiereId: ctx.matiereId,
              coursId: ctx.coursId,
              questionId: ctx.questionId,
              optionId: ctx.optionId,
              serieId: ctx.serieId,
            });
            setResolvedLabel(resolved.contextLabel);
            setResolvedMatiereId(resolved.matiereId);
          } catch {
            setResolvedLabel(ctx.contextLabel ?? ctx.contextType);
          }
        }

        const bootstrap = await callStudentThreadApi("bootstrap", {
          contextType: ctx.contextType,
          dossierId: ctx.dossierId,
          matiereId: ctx.matiereId,
          coursId: ctx.coursId,
          questionId: ctx.questionId,
          optionId: ctx.optionId,
          serieId: ctx.serieId,
        });

        if (bootstrap?.userId) {
          setUserId(bootstrap.userId);
        }

        if (bootstrap?.thread) {
          setThread(bootstrap.thread as QaThread);
        }
      } catch (err) {
        console.error("Q&A drawer init error:", err);
        setErrorMsg(err instanceof Error ? err.message : "Impossible d'ouvrir la messagerie.");
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    }
    init();
    return () => clearTimeout(timeout);
  }, [callStudentThreadApi, ctx.contextLabel, ctx.contextType, ctx.coursId, ctx.dossierId, ctx.matiereId, ctx.optionId, ctx.questionId, ctx.serieId]);

  // Create a new thread when user sends first message
  const [errorMsg, setErrorMsg] = useState("");
  const handleFirstMessage = useCallback(async (text: string) => {
    setCreating(true);
    setErrorMsg("");

    try {
      const result = await callStudentThreadApi("create_text_thread", {
        contextType: ctx.contextType,
        dossierId: ctx.dossierId,
        resolvedMatiereId: resolvedMatiereId || null,
        coursId: ctx.coursId,
        questionId: ctx.questionId,
        optionId: ctx.optionId,
        serieId: ctx.serieId,
        resolvedLabel: resolvedLabel || ctx.contextType,
        text,
      });

      if (result?.userId) {
        setUserId(result.userId);
      }

      if (result?.thread) {
        setThread(result.thread as QaThread);
      } else {
        setErrorMsg("Impossible de créer la conversation.");
      }
    } catch (err: any) {
      console.error("handleFirstMessage error:", err);
      setErrorMsg("Erreur inattendue: " + (err?.message ?? "inconnue"));
    } finally {
      setCreating(false);
    }
    // AI response will be triggered by ChatThread's ai_pending auto-trigger
  }, [callStudentThreadApi, resolvedMatiereId, resolvedLabel, ctx]);

  // Helper: create thread then upload media as first message
  const createThreadAndUploadMedia = useCallback(async (
    file: File | Blob,
    contentType: "voice" | "image" | "video" | "document",
    duration?: number,
  ) => {
    if (!userId) return;
    setCreating(true);

    const title = contentType === "voice" ? "Note vocale"
      : contentType === "document" ? "Document PDF"
      : contentType === "video" ? "Vidéo"
      : "Photo";

    const { data: newThread, error } = await supabase
      .from("qa_threads")
      .insert({
        student_id: userId,
        context_type: ctx.contextType,
        dossier_id: ctx.dossierId ?? null,
        matiere_id: resolvedMatiereId || null,
        cours_id: ctx.coursId ?? null,
        question_id: ctx.questionId ?? null,
        option_id: ctx.optionId ?? null,
        serie_id: ctx.serieId ?? null,
        context_label: resolvedLabel,
        title,
        status: "ai_pending",
      })
      .select("*, matiere:matieres(id, name, color)")
      .single();

    if (error || !newThread) {
      console.error("Failed to create thread:", error);
      setCreating(false);
      return;
    }

    // Upload media directly via Supabase Storage client (no API route needed)
    const ext = contentType === "voice" ? "webm"
      : contentType === "document" ? "pdf"
      : file instanceof File ? (file.name.split(".").pop() || "bin") : "bin";
    const storagePath = `${contentType}/${newThread.id}/${Date.now()}.${ext}`;
    const mimeType = file.type || (contentType === "voice" ? "audio/webm" : "application/octet-stream");

    try {
      const { error: uploadErr } = await supabase.storage
        .from("qa-media")
        .upload(storagePath, file, { contentType: mimeType, upsert: true });

      if (uploadErr) {
        console.error("Storage upload error:", uploadErr);
        // Fallback: insert text message
        await supabase.from("qa_messages").insert({
          thread_id: newThread.id,
          sender_id: userId,
          sender_type: "student",
          content_type: "text",
          content: `[${title} — erreur upload: ${uploadErr.message}]`,
          read_by_student: true,
        });
      } else {
        const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);
        const dbType = contentType === "document" ? "text" : contentType;
        const { error: msgErr } = await supabase.from("qa_messages").insert({
          thread_id: newThread.id,
          sender_id: userId,
          sender_type: "student",
          content_type: dbType,
          media_url: urlData.publicUrl,
          media_duration_s: duration ?? null,
          read_by_student: true,
        });
        if (msgErr) console.error("Message insert error:", msgErr);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      await supabase.from("qa_messages").insert({
        thread_id: newThread.id,
        sender_id: userId,
        sender_type: "student",
        content_type: "text",
        content: `[${title} — échec de l'envoi]`,
        read_by_student: true,
      });
    }

    setThread(newThread as QaThread);
    setCreating(false);
  }, [userId, resolvedMatiereId, resolvedLabel, ctx, supabase]);

  const handleFirstVoice = useCallback(async (blob: Blob, duration: number) => {
    await createThreadAndUploadMedia(blob, "voice", duration);
  }, [createThreadAndUploadMedia]);

  const handleFirstMedia = useCallback(async (file: File, type: "image" | "video" | "document") => {
    await createThreadAndUploadMedia(file, type);
  }, [createThreadAndUploadMedia]);

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
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatThread
              thread={thread}
              viewerRole="student"
              viewerId={userId}
            />
          </div>
        ) : (
          /* New thread — show context + first message input */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-start pt-6 px-5 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <MessageCircleQuestion className="w-6 h-6 text-blue-500" />
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">
                Posez votre question
              </h4>
              <p className="text-xs text-gray-500 mb-3 max-w-[320px]">
                L&apos;IA vous répondra immédiatement. Si la réponse ne vous convient pas,
                vous pourrez demander l&apos;aide d&apos;un professeur.
              </p>
              {errorMsg && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 max-w-full">
                  {errorMsg}
                </div>
              )}
              {resolvedLabel && (
                <div className="max-w-full">
                  <ContextBadge
                    contextType={ctx.contextType}
                    contextLabel={resolvedLabel}
                  />
                </div>
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
                onSendVoice={handleFirstVoice}
                onSendMedia={handleFirstMedia}
                placeholder="Écrivez votre question..."
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
