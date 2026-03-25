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
    const lastStudentMsg = [...messages].reverse().find(m => m.sender_type === "student");
    if (!lastStudentMsg?.content) return;

    let cancelled = false;
    setAiThinking(true);

    (async () => {
      let gotResponse = false;
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
          gotResponse = true;
        }
      } catch (err) {
        console.error("AI auto-trigger fetch error:", err);
      }

      // Fallback polling if fetch failed
      if (!cancelled && !gotResponse) {
        for (let i = 0; i < 15 && !cancelled; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const { data: aiMsgs } = await supabase
            .from("qa_messages")
            .select("*")
            .eq("thread_id", thread.id)
            .eq("sender_type", "ai")
            .order("created_at", { ascending: false })
            .limit(1);
          if (!cancelled && aiMsgs && aiMsgs.length > 0) {
            const aiMsg = aiMsgs[0];
            setMessages((prev) => {
              if (prev.some((m) => m.id === aiMsg.id)) return prev;
              return [...prev, aiMsg];
            });
            setThreadStatus("ai_answered");
            onStatusChange?.("ai_answered");
            break;
          }
        }
      }

      if (!cancelled) setAiThinking(false);
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

    // If student sends a message, trigger AI response
    if (viewerRole === "student" && threadStatus !== "resolved") {
      setAiThinking(true);
      let gotAiResponse = false;

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
          gotAiResponse = true;
        }
      } catch (err) {
        console.error("AI response fetch error:", err);
      }

      // Fallback: if fetch failed (e.g. auth issue with impersonation),
      // poll the DB for the AI response
      if (!gotAiResponse) {
        for (let attempt = 0; attempt < 15; attempt++) {
          await new Promise(r => setTimeout(r, 2000));
          const { data: newMsgs } = await supabase
            .from("qa_messages")
            .select("*")
            .eq("thread_id", thread.id)
            .eq("sender_type", "ai")
            .order("created_at", { ascending: false })
            .limit(1);
          if (newMsgs && newMsgs.length > 0) {
            const aiMsg = newMsgs[0];
            setMessages((prev) => {
              if (prev.some((m) => m.id === aiMsg.id)) return prev;
              return [...prev, aiMsg];
            });
            setThreadStatus("ai_answered");
            onStatusChange?.("ai_answered");
            gotAiResponse = true;
            break;
          }
        }
      }

      setAiThinking(false);
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

    // Upload directly via Supabase Storage client (no API route)
    const storagePath = `voice/${thread.id}/${Date.now()}.webm`;
    const { error: uploadErr } = await supabase.storage
      .from("qa-media")
      .upload(storagePath, blob, { contentType: blob.type || "audio/webm", upsert: true });

    if (uploadErr) {
      console.error("Voice upload error:", uploadErr);
      setSending(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);

    // Insert message — will appear via Realtime subscription
    await supabase.from("qa_messages").insert({
      thread_id: thread.id,
      sender_id: viewerId,
      sender_type: senderType,
      content_type: "voice",
      media_url: urlData.publicUrl,
      media_duration_s: Math.round(duration),
      read_by_student: viewerRole === "student",
      read_by_prof: viewerRole === "prof",
    });

    setSending(false);
  };

  // Send media (image/video/document)
  const handleSendMedia = async (file: File, type: "image" | "video" | "document") => {
    setSending(true);
    const senderType: QaSenderType = viewerRole === "student" ? "student" : "prof";

    // Upload directly via Supabase Storage client
    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `${type}/${thread.id}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("qa-media")
      .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: true });

    if (uploadErr) {
      console.error("Media upload error:", uploadErr);
      setSending(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);
    const dbType = type === "document" ? "image" : type;

    await supabase.from("qa_messages").insert({
      thread_id: thread.id,
      sender_id: viewerId,
      sender_type: senderType,
      content_type: dbType,
      media_url: urlData.publicUrl,
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
          // Show accept/escalate buttons on the last AI message when student view
          const showActions =
            viewerRole === "student" &&
            isAiMsg &&
            (threadStatus === "ai_answered" || threadStatus === "ai_pending") &&
            // Last AI message in the list
            !messages.slice(i + 1).some(m => m.sender_type === "ai");

          return (
            <div key={msg.id}>
              <ChatBubble
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
              {/* Action buttons under the AI bubble — only when AI just answered */}
              {showActions && (
                <div className="flex gap-2 px-12 mt-1 mb-2">
                  <button
                    onClick={handleAcceptAi}
                    disabled={sending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium
                      bg-emerald-50 text-emerald-700 border border-emerald-200
                      hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    ✓ Satisfaisante
                  </button>
                  <button
                    onClick={handleEscalate}
                    disabled={sending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium
                      bg-orange-50 text-orange-700 border border-orange-200
                      hover:bg-orange-100 transition-colors disabled:opacity-50"
                  >
                    Demander au prof
                  </button>
                </div>
              )}
            </div>
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
