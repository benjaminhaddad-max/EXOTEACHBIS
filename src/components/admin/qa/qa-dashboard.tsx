"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QaThread, QaStatus } from "@/types/qa";
import { QaThreadList } from "./qa-thread-list";
import { QaChatPanel } from "./qa-chat-panel";
import { QaStatsCards } from "./qa-stats-cards";
import { ArrowLeft, MessageCircleQuestion, Inbox } from "lucide-react";

interface QaDashboardProps {
  initialThreads: QaThread[];
  userId: string;
  initialThreadId?: string;
}

export function QaDashboard({ initialThreads, userId, initialThreadId }: QaDashboardProps) {
  const [threads, setThreads] = useState<QaThread[]>(initialThreads);
  const [selected, setSelected] = useState<QaThread | null>(
    initialThreadId ? initialThreads.find((t) => t.id === initialThreadId) ?? null : null
  );
  const [filterStatus, setFilterStatus] = useState<QaStatus | "all">("all");
  const [filterMatiere, setFilterMatiere] = useState<string>("all");
  const [search, setSearch] = useState("");
  const supabase = createClient();

  // Realtime subscription for new threads
  useEffect(() => {
    const channel = supabase
      .channel("qa-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qa_threads" },
        () => {
          // Refresh threads
          refreshThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const refreshThreads = async () => {
    const { data } = await supabase
      .from("qa_threads")
      .select(`
        *,
        student:profiles!qa_threads_student_id_fkey(id, first_name, last_name, email, avatar_url, groupe_id),
        matiere:matieres(id, name, color),
        last_message:qa_messages(id, content, content_type, sender_type, created_at)
      `)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false, referencedTable: "qa_messages" })
      .limit(1, { referencedTable: "qa_messages" });

    if (data) {
      setThreads(data as unknown as QaThread[]);
    }
  };

  // Filter threads
  const filtered = threads.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterMatiere !== "all" && t.matiere_id !== filterMatiere) return false;
    if (search) {
      const q = search.toLowerCase();
      const studentName = `${t.student?.first_name ?? ""} ${t.student?.last_name ?? ""}`.toLowerCase();
      return (
        studentName.includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.context_label.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Get unique matieres from threads
  const matieres = Array.from(
    new Map(
      threads
        .filter((t) => t.matiere)
        .map((t) => [t.matiere!.id, t.matiere!])
    ).values()
  );

  const handleThreadSelect = (t: QaThread) => {
    setSelected(t);
    // Update URL without navigation
    window.history.replaceState(null, "", `/admin/questions-reponses?thread=${t.id}`);
  };

  const handleBack = () => {
    setSelected(null);
    window.history.replaceState(null, "", "/admin/questions-reponses");
  };

  return (
    <div className="h-[calc(100vh-4rem)]">
      {/* Stats */}
      <QaStatsCards threads={threads} />

      {/* Main layout */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden h-[calc(100%-120px)] flex">
        {/* Thread list — hide on mobile when chat is open */}
        <div
          className={`w-full lg:w-[380px] border-r border-gray-100 flex flex-col shrink-0 ${
            selected ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Filters */}
          <div className="p-3 border-b border-gray-100 space-y-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un étudiant..."
              className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 border border-gray-100
                placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as QaStatus | "all")}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100"
              >
                <option value="all">Tous les statuts</option>
                <option value="escalated">🔴 Escaladées</option>
                <option value="ai_answered">🤖 IA répondu</option>
                <option value="prof_answered">✅ Prof répondu</option>
                <option value="resolved">✓ Résolues</option>
              </select>
              <select
                value={filterMatiere}
                onChange={(e) => setFilterMatiere(e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100"
              >
                <option value="all">Toutes les matières</option>
                {matieres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* List */}
          <QaThreadList
            threads={filtered}
            selectedId={selected?.id}
            onSelect={handleThreadSelect}
          />
        </div>

        {/* Chat panel */}
        <div className={`flex-1 flex flex-col ${!selected ? "hidden lg:flex" : "flex"}`}>
          {selected ? (
            <>
              {/* Mobile back button */}
              <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <button
                  onClick={handleBack}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium truncate">
                  {selected.student
                    ? `${selected.student.first_name ?? ""} ${selected.student.last_name ?? ""}`.trim()
                    : "Étudiant"}
                </span>
              </div>
              <QaChatPanel
                thread={selected}
                userId={userId}
                onResolve={() => refreshThreads()}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <Inbox className="w-12 h-12 mb-3 text-gray-200" />
              <p className="text-sm">Sélectionnez une question pour y répondre</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
