"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { QaMessage, QaThread } from "@/types/qa";
import { ChatBubble } from "@/components/qa/chat-bubble";
import { ChatInputBar } from "@/components/qa/chat-input-bar";
import { useQaRealtime } from "@/hooks/use-qa-realtime";

interface CoachingChatSectionProps {
  userId: string;
  universityName: string;
  initialThread: QaThread | null;
}

const API_URL = "/api/qa/coaching-thread";

async function callApi(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? "Erreur inattendue.");
  return data;
}

export function CoachingChatSection({ userId, universityName, initialThread }: CoachingChatSectionProps) {
  const [thread, setThread] = useState<QaThread | null>(initialThread);
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [loading, setLoading] = useState(!!initialThread);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Load messages on mount if thread exists
  useEffect(() => {
    if (!thread) { setLoading(false); return; }
    (async () => {
      try {
        const result = await callApi("get_messages", { threadId: thread.id });
        setMessages(result.messages ?? []);
      } catch (err) {
        console.error("Failed to load coaching messages:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [thread?.id]);

  // Realtime
  useQaRealtime(
    thread?.id ?? null,
    useCallback((msg: QaMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      supabase.from("qa_messages").update({ read_by_student: true }).eq("id", msg.id);
    }, [supabase]),
  );

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Send text
  const handleSendText = async (text: string) => {
    setSending(true);
    try {
      if (!thread) {
        const result = await callApi("create_thread", { text });
        setThread(result.thread);
        setMessages(result.message ? [result.message] : []);
      } else {
        const optimistic: QaMessage = {
          id: crypto.randomUUID(),
          thread_id: thread.id,
          sender_id: userId,
          sender_type: "student",
          content_type: "text",
          content: text,
          media_url: null,
          media_duration_s: null,
          read_by_student: true,
          read_by_prof: false,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimistic]);
        const result = await callApi("send_message", { threadId: thread.id, text });
        if (result.message) {
          setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? result.message : m)));
        }
      }
    } catch (err) {
      console.error("Failed to send coaching message:", err);
    } finally {
      setSending(false);
    }
  };

  // Send voice
  const handleSendVoice = async (blob: Blob, duration: number) => {
    if (!thread) return;
    setSending(true);
    try {
      const storagePath = `voice/${thread.id}/${Date.now()}.webm`;
      const { error: uploadErr } = await supabase.storage
        .from("qa-media")
        .upload(storagePath, blob, { contentType: blob.type || "audio/webm", upsert: true });
      if (uploadErr) { console.error("Voice upload error:", uploadErr); setSending(false); return; }
      const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);
      await callApi("send_message", {
        threadId: thread.id, text: "", contentType: "voice",
        mediaUrl: urlData.publicUrl, mediaDuration: Math.round(duration),
      });
    } catch (err) {
      console.error("Voice send error:", err);
    } finally {
      setSending(false);
    }
  };

  // Send media
  const handleSendMedia = async (file: File, type: "image" | "video" | "document") => {
    if (!thread) return;
    setSending(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const storagePath = `${type}/${thread.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("qa-media")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: true });
      if (uploadErr) { console.error("Media upload error:", uploadErr); setSending(false); return; }
      const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);
      const dbType = type === "document" ? "image" : type;
      await callApi("send_message", { threadId: thread.id, text: "", contentType: dbType, mediaUrl: urlData.publicUrl });
    } catch (err) {
      console.error("Media send error:", err);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ height: "min(70vh, 600px)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b border-gray-200 bg-gray-50">
        <MessageCircle size={16} className="text-amber-600" />
        <span className="text-sm font-semibold text-gray-900">
          Chat avec un de nos coachs{universityName ? ` de ${universityName}` : ""}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-2 bg-[#f0f2f5]">
        {messages.length === 0 && !thread && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
            <MessageCircle size={32} className="text-gray-300" />
            <p className="text-sm text-center text-gray-400">
              Pose ta question à nos coachs ! Tu peux écrire un message ou envoyer une note vocale.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            viewerRole="student"
            showAvatar={i === 0 || messages[i - 1]?.sender_type !== msg.sender_type}
            senderName={
              msg.sender_type === "coach" || msg.sender_type === "prof"
                ? "Coach"
                : msg.sender_type === "ai"
                  ? "Assistant IA"
                  : undefined
            }
          />
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0">
        <ChatInputBar
          onSendText={handleSendText}
          onSendVoice={handleSendVoice}
          onSendMedia={handleSendMedia}
          disabled={sending}
          placeholder={thread ? "Écris ton message..." : "Pose ta première question..."}
        />
      </div>
    </div>
  );
}
