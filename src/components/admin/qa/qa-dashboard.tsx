"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Cours, Dossier, Matiere } from "@/types/database";
import type { QaThread, QaStatus } from "@/types/qa";

function threadMatchesQaTreeSelection(
  t: QaThread,
  matiereIds: Set<string>,
  coursIds: Set<string>
): boolean {
  if (matiereIds.size === 0 && coursIds.size === 0) return true;
  if (!t.matiere_id) return false;
  if (coursIds.size > 0 && matiereIds.size === 0) {
    return t.cours_id != null && coursIds.has(t.cours_id);
  }
  if (matiereIds.size > 0 && coursIds.size === 0) {
    return matiereIds.has(t.matiere_id);
  }
  return matiereIds.has(t.matiere_id) && (!t.cours_id || coursIds.has(t.cours_id));
}
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
  qaCours: Cours[];
}

export function QaDashboard({
  initialThreads,
  userId,
  initialThreadId,
  qaDossiers,
  qaMatieres,
  qaCours,
}: QaDashboardProps) {
  const [threads, setThreads] = useState<QaThread[]>(initialThreads);
  const [selectedMatiereIds, setSelectedMatiereIds] = useState<Set<string>>(new Set());
  const [selectedCoursIds, setSelectedCoursIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<QaThread | null>(
    initialThreadId ? initialThreads.find(t => t.id === initialThreadId) ?? null : null
  );
  const [filterStatus, setFilterStatus] = useState<QaStatus | "all">("all");
  const [filterMatiere, setFilterMatiere] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const supabase = createClient();

  const toggleMatiere = (id: string) =>
    setSelectedMatiereIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAllMatieres = () => {
    setSelectedMatiereIds(new Set());
    setSelectedCoursIds(new Set());
  };

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

    if (data) {
      const list = data as unknown as QaThread[];
      setThreads(list);
      setSelected(cur => {
        if (!cur) return null;
        const u = list.find(t => t.id === cur.id);
        if (!u) return null;
        if (
          u.updated_at === cur.updated_at &&
          u.status === cur.status &&
          (u.archived_at ?? null) === (cur.archived_at ?? null)
        )
          return cur;
        return u;
      });
    }
  };

  const threadCountByMatiereId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of threads) {
      if (!t.matiere_id || t.archived_at) continue;
      m[t.matiere_id] = (m[t.matiere_id] ?? 0) + 1;
    }
    return m;
  }, [threads]);

  const threadCountByCoursId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of threads) {
      if (!t.cours_id || t.archived_at) continue;
      m[t.cours_id] = (m[t.cours_id] ?? 0) + 1;
    }
    return m;
  }, [threads]);

  const threadsVisible = useMemo(() => {
    if (showArchived) return threads;
    return threads.filter(t => !t.archived_at);
  }, [threads, showArchived]);

  const threadsAfterScope = useMemo(() => {
    return threadsVisible.filter(t => threadMatchesQaTreeSelection(t, selectedMatiereIds, selectedCoursIds));
  }, [threadsVisible, selectedMatiereIds, selectedCoursIds]);

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
    if (selectedMatiereIds.size === 0 && selectedCoursIds.size === 0) return;
    if (!threadMatchesQaTreeSelection(selected, selectedMatiereIds, selectedCoursIds)) {
      setSelected(null);
      window.history.replaceState(null, "", "/admin/questions-reponses");
    }
  }, [selectedMatiereIds, selectedCoursIds, selected]);

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

  const handleArchiveThread = async (threadId: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("qa_threads").update({ archived_at: now, updated_at: now }).eq("id", threadId);
    if (error) {
      alert(error.message);
      return;
    }
    await refreshThreads();
    if (!showArchived && selected?.id === threadId) {
      setSelected(null);
      window.history.replaceState(null, "", "/admin/questions-reponses");
    }
  };

  const handleUnarchiveThread = async (threadId: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("qa_threads").update({ archived_at: null, updated_at: now }).eq("id", threadId);
    if (error) {
      alert(error.message);
      return;
    }
    await refreshThreads();
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!confirm("Supprimer définitivement cette conversation ? Tous les messages seront effacés.")) return;
    const { error } = await supabase.from("qa_threads").delete().eq("id", threadId);
    if (error) {
      alert(error.message);
      return;
    }
    await refreshThreads();
    if (selected?.id === threadId) {
      setSelected(null);
      window.history.replaceState(null, "", "/admin/questions-reponses");
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col min-h-0">
      <QaStatsCards threads={threadsAfterScope} />

      <div className="mt-4 flex-1 min-h-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex">
        <div className="hidden lg:flex shrink-0 h-full min-h-0">
          <QaPedagogieMatiereTreeSidebar
            dossiers={qaDossiers}
            matieres={qaMatieres}
            cours={qaCours}
            selectedMatiereIds={selectedMatiereIds}
            selectedCoursIds={selectedCoursIds}
            onToggleMatiere={toggleMatiere}
            onToggleCours={id =>
              setSelectedCoursIds(prev => {
                const n = new Set(prev);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
            onSelectAllMatieres={selectAllMatieres}
            onSetMatiereSelection={setSelectedMatiereIds}
            onSetCoursSelection={setSelectedCoursIds}
            threadCountByMatiereId={threadCountByMatiereId}
            threadCountByCoursId={threadCountByCoursId}
          />
        </div>

        <div
          className={`w-full lg:w-[min(380px,36vw)] border-r border-gray-100 flex flex-col shrink-0 min-h-0 ${
            selected ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="p-3 border-b border-gray-100 space-y-2 shrink-0">
            {(selectedMatiereIds.size > 0 || selectedCoursIds.size > 0) && (
              <p className="text-[10px] text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
                Filtre actif : {selectedMatiereIds.size} matière{selectedMatiereIds.size > 1 ? "s" : ""}
                {selectedCoursIds.size > 0
                  ? `, ${selectedCoursIds.size} chapitre${selectedCoursIds.size > 1 ? "s" : ""}`
                  : ""}{" "}
                — la liste suit la sélection dans l’arborescence (PASS → semestre → matière → chapitre).
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
            <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={e => setShowArchived(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-100"
              />
              Afficher les archivées
            </label>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as QaStatus | "all")}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100"
              >
                <option value="all">Tous les statuts</option>
                <option value="escalated">🔴 Envoyée au prof</option>
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

          <QaThreadList
            threads={filtered}
            selectedId={selected?.id}
            onSelect={handleThreadSelect}
            onArchiveThread={handleArchiveThread}
            onDeleteThread={handleDeleteThread}
            showArchived={showArchived}
          />
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
              <QaChatPanel
                thread={selected}
                userId={userId}
                onResolve={() => refreshThreads()}
                onArchiveThread={handleArchiveThread}
                onUnarchiveThread={handleUnarchiveThread}
                onDeleteThread={handleDeleteThread}
              />
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
