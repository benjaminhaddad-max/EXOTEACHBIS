"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { MessageCircle, Search, Loader2, Send, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useQaRealtime } from "@/hooks/use-qa-realtime";
import { ChatBubble } from "@/components/qa/chat-bubble";
import { assignCoachToThread, respondToCoachingThread } from "@/app/(admin)/admin/coaching/actions";
import type { QaThread, QaMessage } from "@/types/qa";
import type { Profile } from "@/types/database";

interface CoachingChatThreadsPanelProps {
  threads: QaThread[];
  coaches: Profile[];
  students: Profile[];
  currentProfile: Profile;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  escalated: { label: "En attente", color: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  prof_answered: { label: "Répondu", color: "bg-green-500/15 text-green-300 border-green-500/30" },
  ai_pending: { label: "IA en cours", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  ai_answered: { label: "IA répondu", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  resolved: { label: "Résolu", color: "bg-gray-500/15 text-gray-300 border-gray-500/30" },
};

export function CoachingChatThreadsPanel({ threads: initialThreads, coaches, students, currentProfile }: CoachingChatThreadsPanelProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [search, setSearch] = useState("");
  const [selectedThread, setSelectedThread] = useState<QaThread | null>(null);
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const coachMap = new Map(coaches.map((c) => [c.id, c]));

  const showToast = (msg: string, kind: "success" | "error") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const filtered = threads.filter((t) => {
    if (!search) return true;
    const s = studentMap.get(t.student_id);
    const name = s ? `${s.first_name ?? ""} ${s.last_name ?? ""} ${s.email}`.toLowerCase() : "";
    return name.includes(search.toLowerCase()) || t.title?.toLowerCase().includes(search.toLowerCase());
  });

  // Load messages when thread is selected
  useEffect(() => {
    if (!selectedThread) return;
    setLoadingMessages(true);
    (async () => {
      const { data } = await supabase
        .from("qa_messages")
        .select("*")
        .eq("thread_id", selectedThread.id)
        .order("created_at", { ascending: true });
      setMessages(data ?? []);
      // Mark as read by prof
      await supabase.from("qa_messages").update({ read_by_prof: true }).eq("thread_id", selectedThread.id).eq("read_by_prof", false);
      setLoadingMessages(false);
    })();
  }, [selectedThread?.id, supabase]);

  // Realtime
  useQaRealtime(
    selectedThread?.id ?? null,
    useCallback((msg: QaMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      supabase.from("qa_messages").update({ read_by_prof: true }).eq("id", msg.id);
    }, [supabase]),
  );

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleAssignCoach = (threadId: string, coachId: string) => {
    startTransition(async () => {
      const res = await assignCoachToThread({ thread_id: threadId, coach_id: coachId });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, assigned_coach_id: coachId } : t)));
      showToast("Coach assigné", "success");
    });
  };

  const handleReply = () => {
    if (!selectedThread || !replyText.trim()) return;
    startTransition(async () => {
      const res = await respondToCoachingThread({
        thread_id: selectedThread.id,
        content: replyText.trim(),
        sender_id: currentProfile.id,
        sender_type: currentProfile.role === "coach" ? "coach" : "prof",
      });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setReplyText("");
      if (res.message) {
        setMessages((prev) => [...prev, res.message as QaMessage]);
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-200px)]">
      {/* Thread list */}
      <div className="w-80 shrink-0 flex flex-col" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="p-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs text-white focus:outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-center text-xs py-8" style={{ color: "rgba(255,255,255,0.3)" }}>Aucune conversation</p>
          )}
          {filtered.map((t) => {
            const student = studentMap.get(t.student_id);
            const coach = t.assigned_coach_id ? coachMap.get(t.assigned_coach_id) : null;
            const statusConf = STATUS_LABELS[t.status] ?? STATUS_LABELS.escalated;
            const isSelected = selectedThread?.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedThread(t)}
                className="w-full text-left px-3 py-2.5 transition-colors"
                style={{
                  backgroundColor: isSelected ? "rgba(201,168,76,0.1)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-white truncate">
                    {student ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || student.email : "Élève"}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${statusConf.color}`}>
                    {statusConf.label}
                  </span>
                </div>
                <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{t.title}</p>
                {coach && (
                  <p className="text-[9px] mt-0.5" style={{ color: "rgba(201,168,76,0.6)" }}>
                    → {coach.first_name ?? ""} {coach.last_name ?? ""}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col">
        {!selectedThread ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle size={32} style={{ color: "rgba(255,255,255,0.1)" }} className="mx-auto mb-2" />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Sélectionne une conversation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div>
                <p className="text-sm font-semibold text-white">
                  {(() => {
                    const s = studentMap.get(selectedThread.student_id);
                    return s ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email : "Élève";
                  })()}
                </p>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{selectedThread.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedThread.assigned_coach_id ?? ""}
                  onChange={(e) => handleAssignCoach(selectedThread.id, e.target.value)}
                  className="rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <option value="">Assigner un coach...</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name ?? ""} {c.last_name ?? ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-2" style={{ backgroundColor: "rgba(0,0,0,0.1)" }}>
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-xs py-8" style={{ color: "rgba(255,255,255,0.3)" }}>Aucun message</p>
              ) : (
                messages.map((msg, i) => (
                  <ChatBubble
                    key={msg.id}
                    message={msg}
                    viewerRole="prof"
                    showAvatar={i === 0 || messages[i - 1]?.sender_type !== msg.sender_type}
                    senderName={
                      msg.sender_type === "student"
                        ? (() => { const s = studentMap.get(msg.sender_id ?? ""); return s ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "Élève"; })()
                        : msg.sender_type === "coach"
                          ? (() => { const c = coachMap.get(msg.sender_id ?? ""); return c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "Coach"; })()
                          : undefined
                    }
                  />
                ))
              )}
            </div>

            {/* Reply bar */}
            <div className="flex items-center gap-2 p-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                placeholder="Répondre..."
                className="flex-1 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <button
                onClick={handleReply}
                disabled={!replyText.trim() || isPending}
                className="p-2 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
