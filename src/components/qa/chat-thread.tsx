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

  // Load messages
  useEffect(() => {
    async function load() {
      try {
        if (viewerRole === "student") {
          const result = await callStudentThreadApi("get_messages", { threadId: thread.id });
          setMessages(result.messages ?? []);
          if (result.threadStatus && result.threadStatus !== threadStatus) {
            setThreadStatus(result.threadStatus);
            onStatusChange?.(result.threadStatus);
          }
        } else {
          const { data } = await supabase
            .from("qa_messages")
            .select("*")
            .eq("thread_id", thread.id)
            .order("created_at", { ascending: true });

          setMessages(data ?? []);

          await supabase
            .from("qa_messages")
            .update({ read_by_prof: true })
            .eq("thread_id", thread.id)
            .eq("read_by_prof", false);
        }
      } catch (err) {
        console.error("Failed to load thread messages:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [callStudentThreadApi, onStatusChange, supabase, thread.id, threadStatus, viewerRole]);

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
    if (threadStatus !== "ai_pending" || viewerRole !== "student" || messages.length === 0 || thread.context_type === "general") return;
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
          let aiMsg: QaMessage | null = null;

          if (viewerRole === "student") {
            try {
              const result = await callStudentThreadApi("get_messages", { threadId: thread.id });
              const aiMsgs = (result.messages ?? []).filter((msg: QaMessage) => msg.sender_type === "ai");
              aiMsg = aiMsgs[aiMsgs.length - 1] ?? null;
            } catch (err) {
              console.error("Fallback API polling failed:", err);
            }
          } else {
            const { data: aiMsgs } = await supabase
              .from("qa_messages")
              .select("*")
              .eq("thread_id", thread.id)
              .eq("sender_type", "ai")
              .order("created_at", { ascending: false })
              .limit(1);
            aiMsg = aiMsgs?.[0] ?? null;
          }

          if (!cancelled && aiMsg) {
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
  }, [callStudentThreadApi, messages.length, onStatusChange, supabase, thread.id, thread.context_label, thread.matiere?.name, threadStatus, viewerRole]);

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

    let inserted: QaMessage | null = null;

    try {
      if (viewerRole === "student") {
        const result = await callStudentThreadApi("send_text_message", {
          threadId: thread.id,
          text,
        });
        inserted = (result.message as QaMessage) ?? null;
        if (result.threadStatus === "ai_pending") {
          setThreadStatus("ai_pending");
          onStatusChange?.("ai_pending");
        }
      } else {
        const { data } = await supabase
          .from("qa_messages")
          .insert({
            thread_id: thread.id,
            sender_id: viewerId,
            sender_type: senderType,
            content_type: "text",
            content: text,
            read_by_student: false,
            read_by_prof: true,
          })
          .select()
          .single();

        inserted = data ?? null;
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setSending(false);
      return;
    }

    if (inserted) {
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? inserted as QaMessage : m)));
    }

    // If student sends a message, trigger AI response (skip for general/admin questions)
    if (viewerRole === "student" && thread.context_type !== "general") {
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
          let aiMsg: QaMessage | null = null;

          if (viewerRole === "student") {
            try {
              const result = await callStudentThreadApi("get_messages", { threadId: thread.id });
              const aiMsgs = (result.messages ?? []).filter((msg: QaMessage) => msg.sender_type === "ai");
              aiMsg = aiMsgs[aiMsgs.length - 1] ?? null;
            } catch (err) {
              console.error("Fallback API polling failed:", err);
            }
          } else {
            const { data: newMsgs } = await supabase
              .from("qa_messages")
              .select("*")
              .eq("thread_id", thread.id)
              .eq("sender_type", "ai")
              .order("created_at", { ascending: false })
              .limit(1);
            aiMsg = newMsgs?.[0] ?? null;
          }

          if (aiMsg) {
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

  // Edit a student message inline in the bubble
  const [editText, setEditText] = useState("");
  const handleEditMessage = async (msg: QaMessage, newText: string) => {
    // Update in DB
    await supabase
      .from("qa_messages")
      .update({ content: newText })
      .eq("id", msg.id);

    // Update in local state
    setMessages((prev) =>
      prev.map((m) => m.id === msg.id ? { ...m, content: newText } : m)
    );
  };

  const handleDeleteMessage = async (messageId: string) => {
    await supabase.from("qa_messages").delete().eq("id", messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  // Whether student messages can be edited (no prof reply yet)
  const hasProfReply = messages.some((m) => m.sender_type === "prof");

  // Accept AI answer
  const handleAcceptAi = async () => {
    if (viewerRole === "student") {
      try {
        await callStudentThreadApi("update_thread_status", {
          threadId: thread.id,
          status: "resolved",
        });
      } catch (err) {
        console.error("Failed to resolve thread:", err);
        return;
      }
    } else {
      await supabase
        .from("qa_threads")
        .update({ status: "resolved", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", thread.id);
    }
    setThreadStatus("resolved");
    onStatusChange?.("resolved");
  };

  // Escalate to professor
  const handleEscalate = async () => {
    if (viewerRole === "student") {
      try {
        await callStudentThreadApi("update_thread_status", {
          threadId: thread.id,
          status: "escalated",
        });
      } catch (err) {
        console.error("Failed to escalate thread:", err);
        return;
      }
    } else {
      await supabase
        .from("qa_threads")
        .update({ status: "escalated", updated_at: new Date().toISOString() })
        .eq("id", thread.id);

      if (thread.matiere_id) {
        const { data: profs } = await supabase
          .from("prof_matieres")
          .select("prof_id")
          .eq("matiere_id", thread.matiere_id);

        if (profs) {
          const notifs = profs.map((p) => ({
            user_id: p.prof_id,
            type: "qa_escalated",
            title: "Nouvelle question d'un étudiant",
            body: thread.title?.slice(0, 100) ?? "Question en attente",
            link: `/admin/questions-reponses?thread=${thread.id}`,
          }));
          if (notifs.length > 0) {
            await supabase.from("notifications").insert(notifs);
          }
        }
      }
    }

    setThreadStatus("escalated");
    onStatusChange?.("escalated");
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
                onEdit={viewerRole === "student" ? handleEditMessage : undefined}
                onDelete={viewerRole === "student" ? handleDeleteMessage : undefined}
                canModify={viewerRole === "student"}
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

      {/* Input bar — always visible, pinned at bottom */}
      <div className="shrink-0">
      <ChatInputBar
        onSendText={(t) => { setEditText(""); handleSendText(t); }}
        onSendVoice={handleSendVoice}
        onSendMedia={handleSendMedia}
        disabled={sending}
        prefillText={editText}
        placeholder={
          threadStatus === "resolved"
            ? "Rouvrir la conversation..."
            : threadStatus === "escalated"
              ? "Ajouter un message..."
              : viewerRole === "student"
                ? "Posez votre question..."
                : "Répondez à l'étudiant..."
        }
      />
      </div>
    </div>
  );
}
