"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QaMessage, QaThread, QaSenderType } from "@/types/qa";
import { ChatBubble } from "./chat-bubble";
import { AiResponseCard } from "./ai-response-card";
import { ChatInputBar } from "./chat-input-bar";
import { TypingIndicator } from "./typing-indicator";
import { ContextBadge } from "./context-badge";
import { useQaRealtime } from "@/hooks/use-qa-realtime";
import { Loader2 } from "lucide-react";

interface ChatThreadProps {
  thread: QaThread;
  viewerRole: "student" | "prof";
  viewerId: string;
  onStatusChange?: (status: QaThread["status"]) => void;
}

export function ChatThread({ thread, viewerRole, viewerId, onStatusChange }: ChatThreadProps) {
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [threadStatus, setThreadStatus] = useState(thread.status);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Load messages
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("qa_messages")
        .select("*")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true });

      setMessages(data ?? []);
      setLoading(false);

      // Mark messages as read
      const readCol = viewerRole === "student" ? "read_by_student" : "read_by_prof";
      await supabase
        .from("qa_messages")
        .update({ [readCol]: true })
        .eq("thread_id", thread.id)
        .eq(readCol, false);
    }
    load();
  }, [thread.id, viewerRole]);

  // Realtime
  useQaRealtime(thread.id, useCallback((msg: QaMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    setAiThinking(false);

    // Mark as read
    const readCol = viewerRole === "student" ? "read_by_student" : "read_by_prof";
    supabase
      .from("qa_messages")
      .update({ [readCol]: true })
      .eq("id", msg.id);
  }, [viewerRole]));

  // Auto-trigger AI if thread is ai_pending (just created, AI hasn't responded yet)
  useEffect(() => {
    if (threadStatus !== "ai_pending" || viewerRole !== "student" || messages.length === 0) return;
    // Find the last student message to use as question text
    const lastStudentMsg = [...messages].reverse().find(m => m.sender_type === "student");
    if (!lastStudentMsg?.content) return;

    let cancelled = false;
    setAiThinking(true);

    (async () => {
      try {
        const resp = await fetch("/api/qa/ai-respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: thread.id,
            question_text: lastStudentMsg.content,
            context: {
              matiere_name: thread.matiere?.name ?? "",
              context_label: thread.context_label,
            },
          }),
        });
        const result = await resp.json();
        if (!cancelled && result.success && result.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === result.message.id)) return prev;
            return [...prev, result.message];
          });
          setThreadStatus("ai_answered");
          onStatusChange?.("ai_answered");
        }
      } catch (err) {
        console.error("AI auto-trigger error:", err);
      } finally {
        if (!cancelled) setAiThinking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [threadStatus, messages.length, viewerRole]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, aiThinking]);

  // Send text message
  const handleSendText = async (text: string) => {
    setSending(true);
    const senderType: QaSenderType = viewerRole === "student" ? "student" : "prof";

    // Optimistic insert
    const optimistic: QaMessage = {
      id: crypto.randomUUID(),
      thread_id: thread.id,
      sender_id: viewerId,
      sender_type: senderType,
      content_type: "text",
      content: text,
      media_url: null,
      media_duration_s: null,
      read_by_student: viewerRole === "student",
      read_by_prof: viewerRole === "prof",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    // Insert in DB
    const { data: inserted } = await supabase
      .from("qa_messages")
      .insert({
        thread_id: thread.id,
        sender_id: viewerId,
        sender_type: senderType,
        content_type: "text",
        content: text,
        read_by_student: viewerRole === "student",
        read_by_prof: viewerRole === "prof",
      })
      .select()
      .single();

    if (inserted) {
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? inserted : m)));
    }

    // If student sends first message or any message, trigger AI
    if (viewerRole === "student" && (threadStatus === "ai_pending" || threadStatus === "ai_answered")) {
      setAiThinking(true);
      try {
        const resp = await fetch("/api/qa/ai-respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: thread.id,
            question_text: text,
            context: {
              matiere_name: thread.matiere?.name ?? "",
              context_label: thread.context_label,
            },
          }),
        });
        const result = await resp.json();
        if (result.success && result.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === result.message.id)) return prev;
            return [...prev, result.message];
          });
          setThreadStatus("ai_answered");
          onStatusChange?.("ai_answered");
        }
      } catch (err) {
        console.error("AI response error:", err);
      } finally {
        setAiThinking(false);
      }
    }

    // If prof replies, update status
    if (viewerRole === "prof") {
      await supabase
        .from("qa_threads")
        .update({ status: "prof_answered", updated_at: new Date().toISOString() })
        .eq("id", thread.id);
      setThreadStatus("prof_answered");
      onStatusChange?.("prof_answered");
    }

    setSending(false);
  };

  // Send voice
  const handleSendVoice = async (blob: Blob, duration: number) => {
    setSending(true);
    const senderType: QaSenderType = viewerRole === "student" ? "student" : "prof";

    // Upload
    const formData = new FormData();
    formData.append("file", blob, `voice-${Date.now()}.webm`);
    formData.append("thread_id", thread.id);
    formData.append("content_type", "voice");

    const uploadResp = await fetch("/api/qa/upload-media", {
      method: "POST",
      body: formData,
    });
    const uploadResult = await uploadResp.json();
    if (uploadResult.error) {
      setSending(false);
      return;
    }

    await supabase.from("qa_messages").insert({
      thread_id: thread.id,
      sender_id: viewerId,
      sender_type: senderType,
      content_type: "voice",
      media_url: uploadResult.url,
      media_duration_s: Math.round(duration),
      read_by_student: viewerRole === "student",
      read_by_prof: viewerRole === "prof",
    });

    setSending(false);
  };

  // Send media (image/video)
  const handleSendMedia = async (file: File, type: "image" | "video") => {
    setSending(true);
    const senderType: QaSenderType = viewerRole === "student" ? "student" : "prof";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("thread_id", thread.id);
    formData.append("content_type", type);

    const uploadResp = await fetch("/api/qa/upload-media", {
      method: "POST",
      body: formData,
    });
    const uploadResult = await uploadResp.json();
    if (uploadResult.error) {
      setSending(false);
      return;
    }

    await supabase.from("qa_messages").insert({
      thread_id: thread.id,
      sender_id: viewerId,
      sender_type: senderType,
      content_type: type,
      media_url: uploadResult.url,
      read_by_student: viewerRole === "student",
      read_by_prof: viewerRole === "prof",
    });

    setSending(false);
  };

  // Accept AI answer
  const handleAcceptAi = async () => {
    await supabase
      .from("qa_threads")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", thread.id);
    setThreadStatus("resolved");
    onStatusChange?.("resolved");
  };

  // Escalate to professor
  const handleEscalate = async () => {
    await supabase
      .from("qa_threads")
      .update({ status: "escalated", updated_at: new Date().toISOString() })
      .eq("id", thread.id);
    setThreadStatus("escalated");
    onStatusChange?.("escalated");

    // Create notification for professors
    // This is done server-side or via a function, for now we insert it client-side
    if (thread.matiere_id) {
      const { data: profs } = await supabase
        .from("prof_matieres")
        .select("prof_id")
        .eq("matiere_id", thread.matiere_id);

      if (profs) {
        const notifs = profs.map((p) => ({
          user_id: p.prof_id,
          type: "qa_escalated",
          title: `Nouvelle question d'un étudiant`,
          body: thread.title?.slice(0, 100) ?? "Question en attente",
          link: `/admin/questions-reponses?thread=${thread.id}`,
        }));
        if (notifs.length > 0) {
          await supabase.from("notifications").insert(notifs);
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Context badge */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white shrink-0">
        <ContextBadge
          contextType={thread.context_type}
          contextLabel={thread.context_label}
          compact
        />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-2 bg-[#f0f2f5]">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            Posez votre question ci-dessous
          </p>
        )}

        {messages.map((msg, i) => {
          const isAiMsg = msg.sender_type === "ai";
          const showActions =
            viewerRole === "student" &&
            isAiMsg &&
            threadStatus === "ai_answered" &&
            i === messages.length - 1;

          if (showActions && msg.content) {
            return (
              <AiResponseCard
                key={msg.id}
                content={msg.content}
                onAccept={handleAcceptAi}
                onEscalate={handleEscalate}
                disabled={sending}
              />
            );
          }

          return (
            <ChatBubble
              key={msg.id}
              message={msg}
              viewerRole={viewerRole}
              showAvatar={
                i === 0 || messages[i - 1]?.sender_type !== msg.sender_type
              }
              senderName={
                isAiMsg
                  ? "Assistant IA"
                  : msg.sender_type === "prof"
                  ? thread.assigned_prof
                    ? `${thread.assigned_prof.first_name ?? ""} ${thread.assigned_prof.last_name ?? ""}`.trim() || "Professeur"
                    : "Professeur"
                  : undefined
              }
            />
          );
        })}

        {aiThinking && <TypingIndicator />}
      </div>

      {/* Input bar */}
      {threadStatus !== "resolved" && (
        <ChatInputBar
          onSendText={handleSendText}
          onSendVoice={handleSendVoice}
          onSendMedia={handleSendMedia}
          disabled={sending}
          placeholder={
            viewerRole === "student"
              ? "Posez votre question..."
              : "Répondez à l'étudiant..."
          }
        />
      )}

      {threadStatus === "resolved" && (
        <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100 text-center">
          <p className="text-sm text-emerald-700 font-medium">
            ✓ Question résolue
          </p>
        </div>
      )}
    </div>
  );
}
