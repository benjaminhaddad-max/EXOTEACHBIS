"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { MessageCircle, Search, Loader2, Send, Check, AlertCircle, CheckCheck, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useQaRealtime } from "@/hooks/use-qa-realtime";
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
  escalated: { label: "En attente", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  prof_answered: { label: "Répondu", color: "bg-green-100 text-green-700 border-green-200" },
  ai_pending: { label: "IA en cours", color: "bg-blue-100 text-blue-700 border-blue-200" },
  ai_answered: { label: "IA répondu", color: "bg-blue-100 text-blue-700 border-blue-200" },
  resolved: { label: "Résolu", color: "bg-gray-100 text-gray-500 border-gray-200" },
};

function getInitials(p: Profile): string {
  return ((p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")).toUpperCase() || "?";
}

function getFullName(p: Profile): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email;
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

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

  useEffect(() => {
    if (!selectedThread) return;
    setLoadingMessages(true);
    (async () => {
      const { data } = await supabase.from("qa_messages").select("*").eq("thread_id", selectedThread.id).order("created_at", { ascending: true });
      setMessages(data ?? []);
      await supabase.from("qa_messages").update({ read_by_prof: true }).eq("thread_id", selectedThread.id).eq("read_by_prof", false);
      setLoadingMessages(false);
    })();
  }, [selectedThread?.id, supabase]);

  useQaRealtime(
    selectedThread?.id ?? null,
    useCallback((msg: QaMessage) => {
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      supabase.from("qa_messages").update({ read_by_prof: true }).eq("id", msg.id);
    }, [supabase]),
  );

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
        thread_id: selectedThread.id, content: replyText.trim(),
        sender_id: currentProfile.id, sender_type: currentProfile.role === "coach" ? "coach" : "prof",
      });
      if ("error" in res && res.error) { showToast(res.error, "error"); return; }
      setReplyText("");
      if ("message" in res && res.message) setMessages((prev) => [...prev, res.message as QaMessage]);
    });
  };

  return (
    <div className="flex" style={{ height: "calc(100vh - 280px)", minHeight: 400 }}>
      {/* ─── Thread list (left sidebar) ─── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un élève..."
              className="w-full rounded-lg pl-8 pr-3 py-2 text-xs text-gray-900 bg-gray-50 border border-gray-200 focus:outline-none focus:border-gray-300"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-center text-xs py-8 text-gray-400">Aucune conversation</p>
          )}
          {filtered.map((t) => {
            const student = studentMap.get(t.student_id);
            const coach = t.assigned_coach_id ? coachMap.get(t.assigned_coach_id) : null;
            const sc = STATUS_LABELS[t.status] ?? STATUS_LABELS.escalated;
            const isSelected = selectedThread?.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedThread(t)}
                className={`w-full text-left px-3 py-3 border-b border-gray-100 transition-colors flex gap-3 ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {student ? getInitials(student) : "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {student ? getFullName(student) : "Élève"}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatTime(t.updated_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-gray-500 truncate flex-1">{t.title}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${sc.color}`}>{sc.label}</span>
                  </div>
                  {coach && (
                    <p className="text-[10px] text-amber-600 mt-0.5">→ {getFullName(coach)}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Chat panel (right) ─── */}
      <div className="flex-1 flex flex-col bg-white">
        {!selectedThread ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400">Sélectionne une conversation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                  {(() => { const s = studentMap.get(selectedThread.student_id); return s ? getInitials(s) : "?"; })()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {(() => { const s = studentMap.get(selectedThread.student_id); return s ? getFullName(s) : "Élève"; })()}
                  </p>
                  <p className="text-[10px] text-gray-400">{selectedThread.title}</p>
                </div>
              </div>
              <select
                value={selectedThread.assigned_coach_id ?? ""}
                onChange={(e) => handleAssignCoach(selectedThread.id, e.target.value)}
                className="rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white border border-gray-200 focus:outline-none"
              >
                <option value="">Assigner un coach...</option>
                {coaches.map((c) => <option key={c.id} value={c.id}>{getFullName(c)}</option>)}
              </select>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 bg-[#f0f2f5]">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-xs py-8 text-gray-400">Aucun message</p>
              ) : (
                messages.map((msg) => {
                  const isStudent = msg.sender_type === "student";
                  const sender = msg.sender_id ? (studentMap.get(msg.sender_id) ?? coachMap.get(msg.sender_id)) : null;
                  return (
                    <div key={msg.id} className={`flex ${isStudent ? "justify-start" : "justify-end"} px-3 mb-1.5`}>
                      {isStudent && (
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0 mr-1.5 mt-auto">
                          {sender ? getInitials(sender) : "?"}
                        </div>
                      )}
                      <div className={`max-w-[70%] min-w-[80px] px-3 py-2 ${isStudent ? "bg-white border border-gray-200 rounded-2xl rounded-bl-sm" : "bg-[#0e1e35] text-white rounded-2xl rounded-br-sm"}`}>
                        {isStudent && sender && (
                          <p className="text-[10px] font-semibold text-indigo-600 mb-0.5">{getFullName(sender)}</p>
                        )}
                        <p className={`text-[13px] leading-relaxed whitespace-pre-wrap break-words ${isStudent ? "text-gray-900" : "text-white"}`}>
                          {msg.content}
                        </p>
                        <div className="flex items-center gap-1 justify-end mt-0.5">
                          <span className={`text-[10px] ${isStudent ? "text-gray-400" : "text-white/50"}`}>{formatTime(msg.created_at)}</span>
                          {!isStudent && (msg.read_by_student ? <CheckCheck size={13} className="text-blue-400" /> : <Check size={13} className="text-white/40" />)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply bar */}
            <div className="flex items-center gap-2 p-3 shrink-0 border-t border-gray-200 bg-white">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                placeholder="Répondre à l'élève..."
                className="flex-1 rounded-lg px-3 py-2 text-sm text-gray-900 bg-gray-50 border border-gray-200 focus:outline-none focus:border-gray-300"
              />
              <button
                onClick={handleReply}
                disabled={!replyText.trim() || isPending}
                className="p-2 rounded-lg disabled:opacity-50 bg-[#0e1e35] text-white hover:bg-[#152a45] transition-colors"
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
