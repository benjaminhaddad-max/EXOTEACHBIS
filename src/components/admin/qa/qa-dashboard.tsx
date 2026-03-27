"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Dossier, Matiere } from "@/types/database";
import type { QaThread, QaStatus } from "@/types/qa";
import { QaPedagogieMatiereTreeSidebar } from "./qa-pedagogie-matiere-tree-sidebar";
import { QaThreadList } from "./qa-thread-list";
import { QaChatPanel } from "./qa-chat-panel";
import { QaStatsCards } from "./qa-stats-cards";
import { ArrowLeft, Inbox } from "lucide-react";

interface QaDashboardProps {
  initialThreads: QaThread[];
  userId: string;
  initialThreadId?: string;
  qaDossiers: Dossier[];
  qaMatieres: Matiere[];
}

export function QaDashboard({
  initialThreads,
  userId,
  initialThreadId,
  qaDossiers,
  qaMatieres,
}: QaDashboardProps) {
  const [threads, setThreads] = useState<QaThread[]>(initialThreads);
  const [selectedMatiereIds, setSelectedMatiereIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<QaThread | null>(
    initialThreadId ? initialThreads.find(t => t.id === initialThreadId) ?? null : null
  );
  const [filterStatus, setFilterStatus] = useState<QaStatus | "all">("all");
  const [filterMatiere, setFilterMatiere] = useState<string>("all");
  const [search, setSearch] = useState("");
  const supabase = createClient();

  const toggleMatiere = (id: string) =>
    setSelectedMatiereIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAllMatieres = () => setSelectedMatiereIds(new Set());

  useEffect(() => {
    const channel = supabase
      .channel("qa-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "qa_threads" }, () => {
        refreshThreads();
      })
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

    if (data) setThreads(data as unknown as QaThread[]);
  };

  const threadCountByMatiereId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of threads) {
      if (!t.matiere_id) continue;
      m[t.matiere_id] = (m[t.matiere_id] ?? 0) + 1;
    }
    return m;
  }, [threads]);

  const threadsAfterScope = useMemo(() => {
    if (selectedMatiereIds.size === 0) return threads;
    return threads.filter(t => t.matiere_id != null && selectedMatiereIds.has(t.matiere_id));
  }, [threads, selectedMatiereIds]);

  const filtered = threadsAfterScope.filter(t => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterMatiere !== "all" && t.matiere_id !== filterMatiere) return false;
    if (search) {
      const q = search.toLowerCase();
      const studentName = `${t.student?.first_name ?? ""} ${t.student?.last_name ?? ""}`.toLowerCase();
      return studentName.includes(q) || t.title.toLowerCase().includes(q) || t.context_label.toLowerCase().includes(q);
    }
    return true;
  });

  useEffect(() => {
    if (!selected) return;
    if (selectedMatiereIds.size === 0) return;
    const mid = selected.matiere_id;
    if (!mid || !selectedMatiereIds.has(mid)) {
      setSelected(null);
      window.history.replaceState(null, "", "/admin/questions-reponses");
    }
  }, [selectedMatiereIds, selected]);

  const matieres = Array.from(
    new Map(threadsAfterScope.filter(t => t.matiere).map(t => [t.matiere!.id, t.matiere!])).values()
  );

  const handleThreadSelect = (t: QaThread) => {
    setSelected(t);
    window.history.replaceState(null, "", `/admin/questions-reponses?thread=${t.id}`);
  };

  const handleBack = () => {
    setSelected(null);
    window.history.replaceState(null, "", "/admin/questions-reponses");
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col min-h-0">
      <QaStatsCards threads={threadsAfterScope} />

      <div className="mt-4 flex-1 min-h-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex">
        <div className="hidden lg:flex shrink-0 h-full min-h-0">
          <QaPedagogieMatiereTreeSidebar
            dossiers={qaDossiers}
            matieres={qaMatieres}
            selectedMatiereIds={selectedMatiereIds}
            onToggleMatiere={toggleMatiere}
            onSelectAllMatieres={selectAllMatieres}
            onSetMatiereSelection={setSelectedMatiereIds}
            threadCountByMatiereId={threadCountByMatiereId}
          />
        </div>

        <div
          className={`w-full lg:w-[min(380px,36vw)] border-r border-gray-100 flex flex-col shrink-0 min-h-0 ${
            selected ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="p-3 border-b border-gray-100 space-y-2 shrink-0">
            {selectedMatiereIds.size > 0 && (
              <p className="text-[10px] text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
                Filtre actif : {selectedMatiereIds.size} matière{selectedMatiereIds.size > 1 ? "s" : ""} — la liste ne montre que les questions rattachées à ces matières.
              </p>
            )}
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un étudiant..."
              className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 border border-gray-100
                placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as QaStatus | "all")}
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
                onChange={e => setFilterMatiere(e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100"
              >
                <option value="all">Toutes les matières</option>
                {matieres.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <QaThreadList threads={filtered} selectedId={selected?.id} onSelect={handleThreadSelect} />
        </div>

        <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${!selected ? "hidden lg:flex" : "flex"}`}>
          {selected ? (
            <>
              <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
                <button onClick={handleBack} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium truncate">
                  {selected.student
                    ? `${selected.student.first_name ?? ""} ${selected.student.last_name ?? ""}`.trim()
                    : "Étudiant"}
                </span>
              </div>
              <QaChatPanel thread={selected} userId={userId} onResolve={() => refreshThreads()} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <Inbox className="w-12 h-12 mb-3 text-gray-200" />
              <p className="text-sm">Sélectionnez une question pour y répondre</p>
              <p className="text-xs text-gray-400 mt-2 max-w-xs text-center hidden lg:block">
                Filtrez par semestre et matière dans la colonne de gauche (même logique que Pédagogie / Exercices).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
