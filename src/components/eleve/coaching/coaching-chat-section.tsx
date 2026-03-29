"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, Phone, MoreVertical, Check, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { QaMessage, QaThread } from "@/types/qa";
import type { Profile } from "@/types/database";
import { ChatInputBar } from "@/components/qa/chat-input-bar";
import { VoiceNotePlayer } from "@/components/qa/voice-note-player";
import { MediaPreview } from "@/components/qa/media-preview";
import { useQaRealtime } from "@/hooks/use-qa-realtime";

interface CoachingChatSectionProps {
  currentProfile: Profile;
  universityName: string;
  initialThread: QaThread | null;
  coaches: Profile[];
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

function getInitials(profile: Profile): string {
  const f = profile.first_name?.[0] ?? "";
  const l = profile.last_name?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

function getFullName(profile: Profile): string {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function CoachingChatSection({ currentProfile, universityName, initialThread, coaches }: CoachingChatSectionProps) {
  const userId = currentProfile.id;
  const [thread, setThread] = useState<QaThread | null>(initialThread);
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [loading, setLoading] = useState(!!initialThread);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Coach info for header
  const mainCoach = coaches[0] ?? null;
  const coachName = mainCoach ? getFullName(mainCoach) : "Coach Diploma Santé";
  const coachInitials = mainCoach ? getInitials(mainCoach) : "DS";

  // Build a map of sender profiles for display
  const profileMap = new Map<string, Profile>();
  profileMap.set(currentProfile.id, currentProfile);
  for (const c of coaches) profileMap.set(c.id, c);

  // Load messages
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
          id: crypto.randomUUID(), thread_id: thread.id, sender_id: userId,
          sender_type: "student", content_type: "text", content: text,
          media_url: null, media_duration_s: null,
          read_by_student: true, read_by_prof: false, created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimistic]);
        const result = await callApi("send_message", { threadId: thread.id, text });
        if (result.message) setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? result.message : m)));
      }
    } catch (err) { console.error("Send error:", err); }
    finally { setSending(false); }
  };

  const ensureThread = async (): Promise<string | null> => {
    if (thread) return thread.id;
    try {
      const result = await callApi("create_thread", { text: "📎" });
      if (result.thread) { setThread(result.thread); if (result.message) setMessages([result.message]); return result.thread.id; }
    } catch (err) { console.error("Thread creation error:", err); }
    return null;
  };

  const handleSendVoice = async (blob: Blob, duration: number) => {
    setSending(true);
    try {
      const threadId = await ensureThread();
      if (!threadId) { setSending(false); return; }
      const storagePath = `voice/${threadId}/${Date.now()}.webm`;
      const { error: uploadErr } = await supabase.storage.from("qa-media").upload(storagePath, blob, { contentType: blob.type || "audio/webm", upsert: true });
      if (uploadErr) { setSending(false); return; }
      const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);
      await callApi("send_message", { threadId, text: "", contentType: "voice", mediaUrl: urlData.publicUrl, mediaDuration: Math.round(duration) });
    } catch (err) { console.error("Voice error:", err); }
    finally { setSending(false); }
  };

  const handleSendMedia = async (file: File, type: "image" | "video" | "document") => {
    setSending(true);
    try {
      const threadId = await ensureThread();
      if (!threadId) { setSending(false); return; }
      const ext = file.name.split(".").pop() || "bin";
      const storagePath = `${type}/${threadId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("qa-media").upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: true });
      if (uploadErr) { setSending(false); return; }
      const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);
      await callApi("send_message", { threadId, text: "", contentType: type === "document" ? "image" : type, mediaUrl: urlData.publicUrl });
    } catch (err) { console.error("Media error:", err); }
    finally { setSending(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh] bg-[#0b141a] rounded-xl">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  // Group messages by date for separators
  const messagesWithDates: { type: "date"; label: string; key: string }[] | { type: "msg"; msg: QaMessage; key: string }[] = [];
  let lastDate = "";
  for (const msg of messages) {
    const d = new Date(msg.created_at).toDateString();
    if (d !== lastDate) {
      (messagesWithDates as any[]).push({ type: "date", label: formatDateSeparator(msg.created_at), key: `date-${d}` });
      lastDate = d;
    }
    (messagesWithDates as any[]).push({ type: "msg", msg, key: msg.id });
  }

  return (
    <div className="flex flex-col rounded-xl overflow-hidden shadow-lg" style={{ height: "calc(100vh - 200px)", minHeight: 500 }}>
      {/* ─── WhatsApp Header ─── */}
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ backgroundColor: "#075E54" }}>
        {/* Coach avatar */}
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: "#128C7E" }}>
          {mainCoach?.avatar_url ? (
            <img src={mainCoach.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            coachInitials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{coachName}</p>
          <p className="text-[11px] text-green-200 truncate">
            Coach {universityName ? `· ${universityName}` : "· Diploma Santé"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <Phone size={18} className="text-white" />
          </button>
          <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <MoreVertical size={18} className="text-white" />
          </button>
        </div>
      </div>

      {/* ─── Messages area with WhatsApp wallpaper ─── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-2"
        style={{
          backgroundColor: "#0b141a",
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {messages.length === 0 && !thread && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: "#128C7E" }}>
              <span className="text-2xl font-bold text-white">{coachInitials}</span>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">{coachName}</p>
              <p className="text-sm text-gray-400 mt-1">Coach {universityName ? `· ${universityName}` : "· Diploma Santé"}</p>
            </div>
            <div className="rounded-lg px-4 py-2 mt-2 max-w-xs text-center" style={{ backgroundColor: "#182229" }}>
              <p className="text-xs text-gray-400">
                Envoie un message pour démarrer la conversation avec ton coach.
              </p>
            </div>
          </div>
        )}

        {(messagesWithDates as any[]).map((item: any) => {
          if (item.type === "date") {
            return (
              <div key={item.key} className="flex justify-center my-3">
                <span className="px-3 py-1 rounded-lg text-[11px] font-medium" style={{ backgroundColor: "#182229", color: "rgba(255,255,255,0.6)" }}>
                  {item.label}
                </span>
              </div>
            );
          }

          const msg = item.msg as QaMessage;
          const isMine = msg.sender_type === "student";
          const senderProfile = msg.sender_id ? profileMap.get(msg.sender_id) : null;
          const isRead = isMine && msg.read_by_prof;

          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} px-3 mb-1`}>
              {/* Avatar for coach messages */}
              {!isMine && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mr-1.5 mt-auto" style={{ backgroundColor: "#128C7E" }}>
                  {senderProfile ? getInitials(senderProfile) : "C"}
                </div>
              )}

              <div
                className="max-w-[75%] min-w-[80px] px-2.5 py-1.5 relative"
                style={{
                  backgroundColor: isMine ? "#005C4B" : "#1F2C34",
                  borderRadius: isMine ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
                }}
              >
                {/* Sender name for coach */}
                {!isMine && senderProfile && (
                  <p className="text-[11px] font-semibold mb-0.5" style={{ color: "#53BDEB" }}>
                    {getFullName(senderProfile)}
                  </p>
                )}

                {/* Text content */}
                {msg.content_type === "text" && msg.content && (
                  <p className="text-[13.5px] text-white leading-relaxed whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                )}

                {/* Voice note */}
                {msg.content_type === "voice" && msg.media_url && (
                  <VoiceNotePlayer url={msg.media_url} duration={msg.media_duration_s} accent={isMine ? "student" : "prof"} />
                )}

                {/* Image */}
                {msg.content_type === "image" && msg.media_url && (
                  <MediaPreview url={msg.media_url} type="image" accent={isMine ? "student" : "prof"} />
                )}

                {/* Video */}
                {msg.content_type === "video" && msg.media_url && (
                  <MediaPreview url={msg.media_url} type="video" accent={isMine ? "student" : "prof"} />
                )}

                {/* Time + read receipt */}
                <div className="flex items-center gap-1 justify-end mt-0.5">
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                    {formatTime(msg.created_at)}
                  </span>
                  {isMine && (
                    isRead
                      ? <CheckCheck size={14} style={{ color: "#53BDEB" }} />
                      : <Check size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Input bar ─── */}
      <div className="shrink-0" style={{ backgroundColor: "#1F2C34" }}>
        <ChatInputBar
          onSendText={handleSendText}
          onSendVoice={handleSendVoice}
          onSendMedia={handleSendMedia}
          disabled={sending}
          placeholder={thread ? "Message" : "Message"}
        />
      </div>
    </div>
  );
}
