"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MessageCircleQuestion,
  Bot,
  UserRound,
  Check,
  Clock,
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Trash2,
  Archive,
  BookOpen,
  GraduationCap,
  HelpCircle,
  Building2,
  Plus,
  Send,
  Paperclip,
  X,
  Loader2,
  Mail,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import type { QaThread, QaMessage, QaContextType } from "@/types/qa";
import { ChatThread } from "@/components/qa/chat-thread";
import { ContextBadge } from "@/components/qa/context-badge";

interface ThreadWithMeta extends Omit<QaThread, "last_message"> {
  last_message?: Pick<QaMessage, "id" | "sender_type" | "content_type" | "content" | "created_at"> | null;
  unread_count?: number;
}

interface MesQuestionsShellProps {
  threads: ThreadWithMeta[];
  userId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  ai_pending: { label: "En attente IA", color: "text-gray-500 bg-gray-50 border-gray-200", icon: Clock },
  ai_answered: { label: "IA a répondu", color: "text-blue-600 bg-blue-50 border-blue-200", icon: Bot },
  escalated: { label: "Envoyée au prof", color: "text-orange-600 bg-orange-50 border-orange-200", icon: AlertTriangle },
  prof_answered: { label: "Prof a répondu", color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: UserRound },
  resolved: { label: "Résolue", color: "text-gray-500 bg-gray-50 border-gray-200", icon: Check },
};

type StatusFilter = "all" | "ai_answered" | "escalated" | "prof_answered" | "resolved";

const STATUS_FILTERS: { id: StatusFilter; label: string; icon: typeof Clock; matchStatuses: string[] }[] = [
  { id: "all", label: "Toutes", icon: MessageCircleQuestion, matchStatuses: [] },
  { id: "ai_answered", label: "Répondu par l'IA", icon: Bot, matchStatuses: ["ai_answered"] },
  { id: "escalated", label: "Envoyé au professeur", icon: AlertTriangle, matchStatuses: ["escalated"] },
  { id: "prof_answered", label: "Prof a répondu", icon: UserRound, matchStatuses: ["prof_answered"] },
  { id: "resolved", label: "Résolue", icon: Check, matchStatuses: ["resolved"] },
];

type ContextFilter = "all" | "cours" | "qcm" | "matiere";

const CONTEXT_FILTERS: { id: ContextFilter; label: string; icon: typeof BookOpen; matchTypes: QaContextType[] }[] = [
  { id: "all", label: "Tout", icon: MessageCircleQuestion, matchTypes: [] },
  { id: "cours", label: "Cours", icon: BookOpen, matchTypes: ["cours"] },
  { id: "qcm", label: "Exercices", icon: HelpCircle, matchTypes: ["qcm_question", "qcm_option"] },
  { id: "matiere", label: "Matière", icon: GraduationCap, matchTypes: ["matiere", "dossier"] },
];

function formatRelative(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function AdminMailForm({ userId, onSent }: { userId: string; onSent: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const handleRemoveFile = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError("L'objet et le message sont requis.");
      return;
    }
    setSending(true);
    setError("");

    try {
      const { data: newThread, error: threadErr } = await supabase
        .from("qa_threads")
        .insert({
          student_id: userId,
          context_type: "general" as QaContextType,
          context_label: "Question à l'administration",
          title: subject.trim(),
          status: "escalated",
        })
        .select("*, matiere:matieres(id, name, color)")
        .single();

      if (threadErr || !newThread) {
        setError("Erreur lors de la création du message.");
        setSending(false);
        return;
      }

      let fullContent = body.trim();

      if (attachments.length > 0) {
        const uploadedUrls: string[] = [];
        for (const file of attachments) {
          const ext = file.name.split(".").pop() || "bin";
          const storagePath = `admin-mail/${newThread.id}/${Date.now()}-${file.name}`;
          const { error: uploadErr } = await supabase.storage
            .from("qa-media")
            .upload(storagePath, file, { contentType: file.type, upsert: true });

          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from("qa-media").getPublicUrl(storagePath);
            uploadedUrls.push(`📎 ${file.name}: ${urlData.publicUrl}`);
          }
        }
        if (uploadedUrls.length > 0) {
          fullContent += "\n\n--- Pièces jointes ---\n" + uploadedUrls.join("\n");
        }
      }

      await supabase.from("qa_messages").insert({
        thread_id: newThread.id,
        sender_id: userId,
        sender_type: "student",
        content_type: "text",
        content: fullContent,
        read_by_student: true,
      });

      setSent(true);
      setTimeout(() => {
        onSent();
      }, 1500);
    } catch (err: any) {
      setError(err?.message ?? "Erreur inattendue");
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
          <Check className="w-7 h-7 text-emerald-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Message envoyé !</h3>
        <p className="text-sm text-gray-500">L&apos;administration vous répondra dans les meilleurs délais.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {/* Subject */}
        <div className="border-b border-gray-100 px-5 py-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">Objet</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex: Demande de justificatif d'absence..."
            className="w-full text-sm text-gray-900 placeholder-gray-300 outline-none bg-transparent"
          />
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Écrivez votre message ici..."
            rows={8}
            className="w-full text-sm text-gray-900 placeholder-gray-300 outline-none bg-transparent resize-none leading-relaxed"
          />
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="px-5 pb-3 flex flex-wrap gap-2">
            {attachments.map((file, idx) => {
              const isImage = file.type.startsWith("image/");
              return (
                <div key={idx} className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs">
                  {isImage ? <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5 text-orange-500" />}
                  <span className="text-gray-700 max-w-[150px] truncate">{file.name}</span>
                  <span className="text-gray-400">{(file.size / 1024).toFixed(0)} Ko</span>
                  <button onClick={() => handleRemoveFile(idx)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions bar */}
        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleAddFiles} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Pièce jointe
            </button>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !body.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#0e1e35] to-[#1a3a5c] text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Envoyer
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

export function MesQuestionsShell({ threads: initialThreads, userId }: MesQuestionsShellProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThread, setSelectedThread] = useState<ThreadWithMeta | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [contextFilter, setContextFilter] = useState<ContextFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [mainTab, setMainTab] = useState<"questions" | "administration">("questions");
  const supabase = createClient();

  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    if (!confirm("Supprimer cette conversation ?")) return;
    await supabase.from("qa_messages").delete().eq("thread_id", threadId);
    await supabase.from("qa_threads").delete().eq("id", threadId);
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  };

  const handleArchiveThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    await supabase.from("qa_threads").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", threadId);
    setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, status: "resolved" as const } : t));
  };

  const pedagogicalThreads = threads.filter((t) => t.context_type !== "general");
  const adminThreads = threads.filter((t) => t.context_type === "general");

  const activeThreads = pedagogicalThreads.filter((t) => t.status !== "resolved");
  const resolvedThreads = pedagogicalThreads.filter((t) => t.status === "resolved");
  const baseThreads = showArchived ? resolvedThreads : activeThreads;

  const filteredThreads = useMemo(() => {
    let result = baseThreads;

    if (contextFilter !== "all") {
      const filter = CONTEXT_FILTERS.find((f) => f.id === contextFilter);
      if (filter && filter.matchTypes.length > 0) {
        result = result.filter((t) => filter.matchTypes.includes(t.context_type));
      }
    }

    if (statusFilter !== "all") {
      const filter = STATUS_FILTERS.find((f) => f.id === statusFilter);
      if (filter && filter.matchStatuses.length > 0) {
        result = result.filter((t) => filter.matchStatuses.includes(t.status));
      }
    }

    return result;
  }, [baseThreads, contextFilter, statusFilter]);

  const filterCounts = useMemo(() => {
    const counts: Record<ContextFilter, number> = { all: 0, cours: 0, qcm: 0, matiere: 0 };
    for (const t of baseThreads) {
      counts.all++;
      for (const f of CONTEXT_FILTERS) {
        if (f.id !== "all" && f.matchTypes.includes(t.context_type)) {
          counts[f.id]++;
        }
      }
    }
    return counts;
  }, [baseThreads]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: 0, ai_answered: 0, escalated: 0, prof_answered: 0, resolved: 0 };
    for (const t of baseThreads) {
      counts.all++;
      for (const f of STATUS_FILTERS) {
        if (f.id !== "all" && f.matchStatuses.includes(t.status)) {
          counts[f.id]++;
        }
      }
    }
    return counts;
  }, [baseThreads]);

  if (selectedThread) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setSelectedThread(null)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {selectedThread.title}
            </h3>
            <p className="text-xs text-gray-500 truncate">{selectedThread.context_label}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
          <ChatThread
            thread={selectedThread as unknown as QaThread}
            viewerRole="student"
            viewerId={userId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "En cours", count: pedagogicalThreads.filter(t => ["ai_pending", "ai_answered", "escalated"].includes(t.status)).length, color: "text-blue-600" },
          { label: "Prof a répondu", count: pedagogicalThreads.filter(t => t.status === "prof_answered").length, color: "text-emerald-600" },
          { label: "Résolues", count: pedagogicalThreads.filter(t => t.status === "resolved").length, color: "text-gray-500" },
          { label: "Total", count: threads.length, color: "text-gray-900" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Main tabs: Mes questions / Administration */}
      <div className="flex items-center gap-3 mb-5 border-b border-gray-200">
        <button
          onClick={() => setMainTab("questions")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${
            mainTab === "questions"
              ? "border-[#0e1e35] text-[#0e1e35]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <MessageCircleQuestion className="w-4 h-4" />
          Mes questions
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${mainTab === "questions" ? "bg-[#0e1e35] text-white" : "bg-gray-100 text-gray-400"}`}>
            {pedagogicalThreads.length}
          </span>
        </button>
        <button
          onClick={() => setMainTab("administration")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${
            mainTab === "administration"
              ? "border-[#0e1e35] text-[#0e1e35]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <Mail className="w-4 h-4" />
          Administration
          {adminThreads.length > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${mainTab === "administration" ? "bg-[#0e1e35] text-white" : "bg-gray-100 text-gray-400"}`}>
              {adminThreads.length}
            </span>
          )}
        </button>
      </div>

      {mainTab === "questions" && (
        <>
          {/* Context filter pills */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            {CONTEXT_FILTERS.map((f) => {
              const Icon = f.icon;
              const count = filterCounts[f.id];
              const isActive = contextFilter === f.id;
              if (f.id !== "all" && count === 0) return null;
              return (
                <button
                  key={f.id}
                  onClick={() => setContextFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-[#0e1e35] text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {f.label}
                  <span className={`ml-0.5 text-[10px] font-bold ${isActive ? "text-white/70" : "text-gray-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tabs: Active / Archived */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => { setShowArchived(false); setStatusFilter("all"); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !showArchived ? "bg-[#0e1e35] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              En cours ({activeThreads.length})
            </button>
            <button
              onClick={() => { setShowArchived(true); setStatusFilter("all"); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showArchived ? "bg-[#0e1e35] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Archivées ({resolvedThreads.length})
            </button>
          </div>

          {/* Status filter pills */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {STATUS_FILTERS.map((f) => {
              if (f.id === "resolved" && !showArchived) return null;
              if (f.id === "resolved" && showArchived) return null;
              const Icon = f.icon;
              const count = statusCounts[f.id];
              const isActive = statusFilter === f.id;
              if (f.id !== "all" && count === 0) return null;
              return (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all border ${
                    isActive
                      ? f.id === "ai_answered" ? "bg-blue-50 text-blue-600 border-blue-200"
                      : f.id === "escalated" ? "bg-orange-50 text-orange-600 border-orange-200"
                      : f.id === "prof_answered" ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                      : "bg-gray-100 text-gray-700 border-gray-300"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {f.label}
                  {count > 0 && (
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${isActive ? "opacity-70" : "text-gray-400"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Thread list */}
          {filteredThreads.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <MessageCircleQuestion className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-400 mb-1">
                {statusFilter !== "all" || contextFilter !== "all" ? "Aucune question avec ces filtres" : "Aucune question"}
              </h3>
              <p className="text-sm text-gray-400">
                Posez des questions depuis vos cours ou exercices — l&apos;IA vous répondra immédiatement.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredThreads.map((t) => {
                const cfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.ai_pending;
                const StatusIcon = cfg.icon;
                const lastMsg = t.last_message;
                const hasUnread = (t.unread_count ?? 0) > 0;

                let preview = "";
                if (lastMsg) {
                  if (lastMsg.content_type === "text" && lastMsg.content) {
                    const prefix = lastMsg.sender_type === "ai" ? "IA: " : lastMsg.sender_type === "prof" ? "Prof: " : "";
                    preview = prefix + lastMsg.content.slice(0, 80);
                  } else {
                    preview = lastMsg.sender_type === "ai" ? "IA: " : lastMsg.sender_type === "prof" ? "Prof: " : "";
                    preview += lastMsg.content_type === "voice" ? "🎤 Note vocale" : lastMsg.content_type === "image" ? "📷 Photo" : "📎 Fichier";
                  }
                }

                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedThread(t)}
                    className={`w-full text-left bg-white rounded-xl border p-4 hover:border-gray-300 hover:shadow-sm transition-all ${
                      hasUnread ? "border-blue-200 bg-blue-50/30" : "border-gray-100"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className={`text-sm font-semibold truncate ${hasUnread ? "text-gray-900" : "text-gray-700"}`}>
                            {t.title || "Question"}
                          </h4>
                          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.color}`}>
                            <StatusIcon className="w-2.5 h-2.5" />
                            {cfg.label}
                          </span>
                        </div>

                        <div className="mb-1.5">
                          <ContextBadge contextType={t.context_type} contextLabel={t.context_label} compact />
                        </div>

                        {preview && (
                          <p className={`text-xs truncate ${hasUnread ? "text-gray-700 font-medium" : "text-gray-500"}`}>
                            {preview}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-gray-400">
                          {lastMsg ? formatRelative(lastMsg.created_at) : formatRelative(t.created_at)}
                        </span>
                        {hasUnread && (
                          <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {t.unread_count}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          {t.status !== "resolved" && (
                            <button
                              onClick={(e) => handleArchiveThread(e, t.id)}
                              className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500"
                              title="Archiver"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {t.status === "resolved" && (
                            <button
                              onClick={(e) => handleDeleteThread(e, t.id)}
                              className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {mainTab === "administration" && (
        <div className="space-y-6">
          {/* New admin message form */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0e1e35] to-[#1a3a5c] flex items-center justify-center">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Nouveau message à l&apos;administration</h3>
                <p className="text-xs text-gray-500">Envoyez un message avec objet et pièces jointes</p>
              </div>
            </div>
            <AdminMailForm userId={userId} onSent={() => window.location.reload()} />
          </div>

          {/* Previous admin threads */}
          {adminThreads.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Messages précédents ({adminThreads.length})
              </p>
              <div className="space-y-2">
                {adminThreads.map((t) => {
                  const cfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.escalated;
                  const StatusIcon = cfg.icon;
                  const lastMsg = t.last_message;
                  const hasUnread = (t.unread_count ?? 0) > 0;

                  let preview = "";
                  if (lastMsg) {
                    if (lastMsg.content_type === "text" && lastMsg.content) {
                      const prefix = lastMsg.sender_type === "prof" ? "Admin: " : "";
                      preview = prefix + lastMsg.content.slice(0, 80);
                    } else {
                      preview = "📎 Fichier joint";
                    }
                  }

                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedThread(t)}
                      className={`w-full text-left bg-white rounded-xl border p-4 hover:border-gray-300 hover:shadow-sm transition-all ${
                        hasUnread ? "border-blue-200 bg-blue-50/30" : "border-gray-100"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4 className={`text-sm font-semibold truncate ${hasUnread ? "text-gray-900" : "text-gray-700"}`}>
                              {t.title || "Question à l'administration"}
                            </h4>
                            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.color}`}>
                              <StatusIcon className="w-2.5 h-2.5" />
                              {cfg.label}
                            </span>
                          </div>
                          {preview && (
                            <p className={`text-xs truncate ${hasUnread ? "text-gray-700 font-medium" : "text-gray-500"}`}>
                              {preview}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10px] text-gray-400">
                            {lastMsg ? formatRelative(lastMsg.created_at) : formatRelative(t.created_at)}
                          </span>
                          {hasUnread && (
                            <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                              {t.unread_count}
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
