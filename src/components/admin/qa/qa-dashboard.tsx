"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Dossier, Groupe, Matiere, Profile } from "@/types/database";
import type { QaThread } from "@/types/qa";
import { QaPedagogieMatiereTreeSidebar } from "./qa-pedagogie-matiere-tree-sidebar";
import { QaThreadList } from "./qa-thread-list";
import { QaChatPanel } from "./qa-chat-panel";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock3,
  GraduationCap,
  Inbox,
  Layers,
  Users,
} from "lucide-react";

type TopTab = "profs" | "admin";
type QueuePreset =
  | "unresolved"
  | "overdue_2d"
  | "overdue_3d"
  | "overdue_4d"
  | "all";

type QaProfLite = Pick<
  Profile,
  "id" | "first_name" | "last_name" | "email" | "avatar_url" | "phone" | "role"
>;

type ProfMatiereLink = {
  prof_id: string;
  matiere_id: string;
};

type Toast = {
  kind: "success" | "error";
  message: string;
} | null;

const RELANCE_THRESHOLD_HOURS = 48;

function threadMatchesQaTreeSelection(thread: QaThread, matiereIds: Set<string>) {
  if (matiereIds.size === 0) return true;
  if (thread.context_type === "general") return false;
  if (!thread.matiere_id) return false;
  return matiereIds.has(thread.matiere_id);
}

function getDisplayName(profile: QaProfLite | QaThread["student"] | QaThread["assigned_prof"] | null | undefined) {
  if (!profile) return "Professeur";
  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return fullName || profile.email || "Professeur";
}

function getThreadAgeHours(thread: QaThread) {
  const referenceDate = thread.updated_at || thread.created_at;
  return (Date.now() - new Date(referenceDate).getTime()) / 3_600_000;
}

function isThreadOverdue(thread: QaThread, thresholdHours = RELANCE_THRESHOLD_HOURS) {
  return !thread.archived_at && thread.status === "escalated" && getThreadAgeHours(thread) >= thresholdHours;
}

function matchesQueuePreset(thread: QaThread, preset: QueuePreset) {
  switch (preset) {
    case "unresolved":
      return thread.status !== "resolved";
    case "overdue_2d":
      return isThreadOverdue(thread, 48);
    case "overdue_3d":
      return isThreadOverdue(thread, 72);
    case "overdue_4d":
      return isThreadOverdue(thread, 96);
    case "all":
    default:
      return true;
  }
}

function getThreadPriority(thread: QaThread) {
  if (isThreadOverdue(thread, 96)) return 0;
  if (isThreadOverdue(thread, 72)) return 1;
  if (isThreadOverdue(thread, 48)) return 2;
  if (thread.status === "escalated") return 3;
  if (thread.status === "ai_pending") return 4;
  if (thread.status === "ai_answered") return 5;
  if (thread.status === "prof_answered") return 6;
  if (thread.status === "resolved") return 7;
  return 8;
}

function sortThreadsForOps(threads: QaThread[]) {
  return [...threads].sort((a, b) => {
    const priorityDelta = getThreadPriority(a) - getThreadPriority(b);
    if (priorityDelta !== 0) return priorityDelta;
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
  });
}

type GroupeLite = Pick<Groupe, "id" | "name" | "formation_dossier_id">;

type AdminTreeNode = {
  dossier: Dossier;
  children: AdminTreeNode[];
  groupes: GroupeLite[];
  threadCount: number;
};

function AdminFormationNode({
  node,
  depth,
  selectedGroupeId,
  onSelectGroupe,
  threadCountByGroupe,
}: {
  node: AdminTreeNode;
  depth: number;
  selectedGroupeId: string | null;
  onSelectGroupe: (id: string | null) => void;
  threadCountByGroupe: Map<string, number>;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasBranch = node.children.length > 0 || node.groupes.length > 0;

  const dType = node.dossier.dossier_type;
  const isOffer = dType === "offer";
  const isUniv = dType === "university";

  const textCls = isOffer
    ? "text-[12px] font-bold text-indigo-900"
    : isUniv
    ? "text-[11px] font-semibold text-blue-800"
    : "text-[10.5px] font-semibold text-gray-700";

  const iconCls = isOffer ? "text-indigo-500" : isUniv ? "text-blue-500" : "text-gray-400";
  const Icon = isOffer ? GraduationCap : isUniv ? Building2 : Layers;

  return (
    <div>
      <div
        className="flex items-center gap-0.5 py-0.5 hover:bg-gray-100/60 rounded-md cursor-pointer"
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => hasBranch && setExpanded((p) => !p)}
      >
        <span className="w-5 h-6 flex items-center justify-center shrink-0 text-gray-300">
          {hasBranch ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : null}
        </span>
        <Icon className={`w-3.5 h-3.5 shrink-0 ${iconCls}`} />
        <span className={`flex-1 truncate ml-1.5 ${textCls}`}>{node.dossier.name}</span>
        {node.threadCount > 0 && (
          <span className="text-[9px] tabular-nums px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium shrink-0 mr-1">
            {node.threadCount}
          </span>
        )}
      </div>

      {expanded && (
        <div>
          {node.children.map((ch) => (
            <AdminFormationNode
              key={ch.dossier.id}
              node={ch}
              depth={depth + 1}
              selectedGroupeId={selectedGroupeId}
              onSelectGroupe={onSelectGroupe}
              threadCountByGroupe={threadCountByGroupe}
            />
          ))}
          {node.groupes.map((g) => {
            const count = threadCountByGroupe.get(g.id) ?? 0;
            const isActive = selectedGroupeId === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelectGroupe(isActive ? null : g.id)}
                className={`w-full flex items-center gap-1.5 py-1 rounded-md text-left transition-colors ${
                  isActive ? "bg-blue-600 text-white" : "hover:bg-gray-100/80"
                }`}
                style={{ paddingLeft: (depth + 1) * 12 + 24 }}
              >
                <Users className={`w-3 h-3 shrink-0 ${isActive ? "text-white/70" : "text-slate-400"}`} />
                <span className={`flex-1 truncate text-[10px] font-medium ${isActive ? "text-white" : "text-slate-700"}`}>
                  {g.name}
                </span>
                {count > 0 && (
                  <span className={`text-[9px] tabular-nums px-1.5 py-0.5 rounded-full font-medium shrink-0 mr-2 ${
                    isActive ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface QaDashboardProps {
  initialThreads: QaThread[];
  userId: string;
  userRole?: string;
  initialThreadId?: string;
  qaDossiers: Dossier[];
  qaMatieres: Matiere[];
  qaProfs: QaProfLite[];
  profMatieres: ProfMatiereLink[];
  qaGroupes?: GroupeLite[];
}

export function QaDashboard({
  initialThreads,
  userId,
  userRole,
  initialThreadId,
  qaDossiers,
  qaMatieres,
  qaProfs,
  profMatieres,
  qaGroupes = [],
}: QaDashboardProps) {
  const supabase = createClient();

  const [threads, setThreads] = useState<QaThread[]>(initialThreads);
  const isProf = userRole === "prof";
  const [topTab, setTopTab] = useState<TopTab>(() => {
    if (isProf) return "profs"; // Profs always see their Q&A, no admin tab
    const initial = initialThreadId ? initialThreads.find((t) => t.id === initialThreadId) : null;
    return initial?.context_type === "general" ? "admin" : "profs";
  });
  const [selectedMatiereIds, setSelectedMatiereIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<QaThread | null>(
    initialThreadId ? initialThreads.find((thread) => thread.id === initialThreadId) ?? null : null
  );
  const [filterMatiere, setFilterMatiere] = useState("all");
  const [queuePreset, setQueuePreset] = useState<QueuePreset>("unresolved");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const showToast = (message: string, kind: "success" | "error" = "success") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3200);
  };

  const toggleMatiere = (id: string) =>
    setSelectedMatiereIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllMatieres = () => setSelectedMatiereIds(new Set());

  const refreshThreads = async () => {
    const { data } = await supabase
      .from("qa_threads")
      .select(`
        *,
        student:profiles!qa_threads_student_id_fkey(id, first_name, last_name, email, avatar_url, groupe_id),
        matiere:matieres(id, name, color),
        assigned_prof:profiles!qa_threads_assigned_prof_id_fkey(id, first_name, last_name, email, avatar_url, phone, role),
        last_message:qa_messages(id, content, content_type, sender_type, created_at)
      `)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false, referencedTable: "qa_messages" })
      .limit(1, { referencedTable: "qa_messages" });

    if (!data) return;

    const list = data as unknown as QaThread[];
    setThreads(list);
    setSelected((current) => {
      if (!current) return null;
      return list.find((thread) => thread.id === current.id) ?? null;
    });
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
  }, [supabase]);

  // ─── Derived: split threads by type ─────────────────────────────────────────
  const profThreads = useMemo(() => threads.filter((t) => t.context_type !== "general"), [threads]);
  const adminThreads = useMemo(() => threads.filter((t) => t.context_type === "general"), [threads]);

  const profUnresolvedCount = useMemo(() => profThreads.filter((t) => t.status !== "resolved" && !t.archived_at).length, [profThreads]);
  const adminUnresolvedCount = useMemo(() => adminThreads.filter((t) => t.status !== "resolved" && !t.archived_at).length, [adminThreads]);

  // ─── Prof Q&A derived data ──────────────────────────────────────────────────
  const threadCountByMatiereId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const thread of profThreads) {
      if (!thread.matiere_id || thread.archived_at) continue;
      counts[thread.matiere_id] = (counts[thread.matiere_id] ?? 0) + 1;
    }
    return counts;
  }, [profThreads]);

  const threadsVisible = useMemo(() => {
    if (showArchived) return profThreads;
    return profThreads.filter((thread) => !thread.archived_at);
  }, [profThreads, showArchived]);

  const threadsAfterScope = useMemo(() => {
    return threadsVisible.filter((thread) => threadMatchesQaTreeSelection(thread, selectedMatiereIds));
  }, [threadsVisible, selectedMatiereIds]);

  const matieres = useMemo(
    () =>
      Array.from(
        new Map(threadsAfterScope.filter((thread) => thread.matiere).map((thread) => [thread.matiere!.id, thread.matiere!])).values()
      ),
    [threadsAfterScope]
  );

  const filteredProfThreads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const list = threadsAfterScope.filter((thread) => {
      if (!matchesQueuePreset(thread, queuePreset)) return false;
      if (filterMatiere !== "all" && thread.matiere_id !== filterMatiere) return false;
      if (!normalizedSearch) return true;

      const studentName = getDisplayName(thread.student).toLowerCase();
      const matiereName = thread.matiere?.name?.toLowerCase() ?? "";
      const title = thread.title?.toLowerCase() ?? "";
      const contextLabel = thread.context_label?.toLowerCase() ?? "";

      return (
        studentName.includes(normalizedSearch) ||
        matiereName.includes(normalizedSearch) ||
        title.includes(normalizedSearch) ||
        contextLabel.includes(normalizedSearch)
      );
    });

    return sortThreadsForOps(list);
  }, [filterMatiere, threadsAfterScope, queuePreset, search]);

  const overdueThreadIds = useMemo(() => {
    const ids = new Set<string>();
    for (const thread of filteredProfThreads) {
      if (isThreadOverdue(thread, RELANCE_THRESHOLD_HOURS)) ids.add(thread.id);
    }
    return ids;
  }, [filteredProfThreads]);

  // ─── Admin Q&A derived data ─────────────────────────────────────────────────
  const [adminSearch, setAdminSearch] = useState("");
  const [adminShowArchived, setAdminShowArchived] = useState(false);
  const [adminSelectedGroupeId, setAdminSelectedGroupeId] = useState<string | null>(null);

  // Build formation tree: dossier (offer/university) → groupes
  const adminFormationTree = useMemo(() => {
    const dossierMap = new Map<string, Dossier>();
    for (const d of qaDossiers) dossierMap.set(d.id, d);

    type TreeNode = {
      dossier: Dossier;
      children: TreeNode[];
      groupes: GroupeLite[];
      threadCount: number;
    };

    const groupesByFormation = new Map<string, GroupeLite[]>();
    for (const g of qaGroupes) {
      if (!g.formation_dossier_id) continue;
      if (!groupesByFormation.has(g.formation_dossier_id)) groupesByFormation.set(g.formation_dossier_id, []);
      groupesByFormation.get(g.formation_dossier_id)!.push(g);
    }

    // Count admin threads per groupe
    const threadCountByGroupe = new Map<string, number>();
    for (const t of adminThreads) {
      const gid = (t.student as any)?.groupe_id;
      if (gid) threadCountByGroupe.set(gid, (threadCountByGroupe.get(gid) ?? 0) + 1);
    }

    const childrenByParent = new Map<string | null, Dossier[]>();
    for (const d of qaDossiers) {
      const pid = d.parent_id ?? null;
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid)!.push(d);
    }

    function buildNode(d: Dossier): TreeNode {
      const children = (childrenByParent.get(d.id) ?? []).map(buildNode);
      const groupes = groupesByFormation.get(d.id) ?? [];
      const groupeCount = groupes.reduce((acc, g) => acc + (threadCountByGroupe.get(g.id) ?? 0), 0);
      const childCount = children.reduce((acc, c) => acc + c.threadCount, 0);
      return { dossier: d, children, groupes, threadCount: groupeCount + childCount };
    }

    const roots = (childrenByParent.get(null) ?? []).map(buildNode);
    return { roots, threadCountByGroupe };
  }, [qaDossiers, qaGroupes, adminThreads]);

  const filteredAdminThreads = useMemo(() => {
    let base = adminShowArchived ? adminThreads : adminThreads.filter((t) => !t.archived_at);
    if (adminSelectedGroupeId) {
      base = base.filter((t) => (t.student as any)?.groupe_id === adminSelectedGroupeId);
    }
    const normalizedSearch = adminSearch.trim().toLowerCase();
    if (!normalizedSearch) return sortThreadsForOps(base);
    return sortThreadsForOps(
      base.filter((t) => {
        const studentName = getDisplayName(t.student).toLowerCase();
        const title = t.title?.toLowerCase() ?? "";
        return studentName.includes(normalizedSearch) || title.includes(normalizedSearch);
      })
    );
  }, [adminThreads, adminSearch, adminShowArchived, adminSelectedGroupeId]);

  // ─── Stats for prof tab ─────────────────────────────────────────────────────
  const unresolvedCount = threadsAfterScope.filter((thread) => thread.status !== "resolved").length;
  const overdue2DaysCount = threadsAfterScope.filter((thread) => isThreadOverdue(thread, 48)).length;
  const overdue3DaysCount = threadsAfterScope.filter((thread) => isThreadOverdue(thread, 72)).length;
  const overdue4DaysCount = threadsAfterScope.filter((thread) => isThreadOverdue(thread, 96)).length;

  // ─── Handlers ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) return;
    const currentThreads = topTab === "admin" ? filteredAdminThreads : filteredProfThreads;
    if (currentThreads.some((thread) => thread.id === selected.id)) return;
    setSelected(null);
    window.history.replaceState(null, "", "/admin/questions-reponses");
  }, [filteredProfThreads, filteredAdminThreads, selected, topTab]);

  const handleThreadSelect = (thread: QaThread) => {
    setSelected(thread);
    window.history.replaceState(null, "", `/admin/questions-reponses?thread=${thread.id}`);
  };

  const handleBack = () => {
    setSelected(null);
    window.history.replaceState(null, "", "/admin/questions-reponses");
  };

  const handleArchiveThread = async (threadId: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("qa_threads").update({ archived_at: now, updated_at: now }).eq("id", threadId);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    await refreshThreads();
  };

  const handleUnarchiveThread = async (threadId: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("qa_threads").update({ archived_at: null, updated_at: now }).eq("id", threadId);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    await refreshThreads();
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!confirm("Supprimer définitivement cette conversation ? Tous les messages seront effacés.")) return;
    const { error } = await supabase.from("qa_threads").delete().eq("id", threadId);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    await refreshThreads();
  };

  const handleTabSwitch = (tab: TopTab) => {
    setTopTab(tab);
    setSelected(null);
    window.history.replaceState(null, "", "/admin/questions-reponses");
  };

  const statsCards = [
    {
      id: "overdue_2d",
      label: "En retard > 2j",
      value: overdue2DaysCount,
      icon: Clock3,
      tone: "border-amber-100 bg-amber-50 text-amber-900",
      iconTone: "text-amber-500",
      onClick: () => setQueuePreset("overdue_2d"),
      active: queuePreset === "overdue_2d",
    },
    {
      id: "overdue_3d",
      label: "En retard > 3j",
      value: overdue3DaysCount,
      icon: Clock3,
      tone: "border-orange-100 bg-orange-50 text-orange-900",
      iconTone: "text-orange-500",
      onClick: () => setQueuePreset("overdue_3d"),
      active: queuePreset === "overdue_3d",
    },
    {
      id: "overdue_4d",
      label: "En retard > 4j",
      value: overdue4DaysCount,
      icon: Clock3,
      tone: "border-red-100 bg-red-50 text-red-900",
      iconTone: "text-red-500",
      onClick: () => setQueuePreset("overdue_4d"),
      active: queuePreset === "overdue_4d",
    },
  ] as const;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col min-h-0">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-xl ${
            toast.kind === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ═══════════ TOP TAB BAR (hidden for profs) ═══════════ */}
      {!isProf && <div className="shrink-0 mb-4 flex items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1.5">
        {[
          {
            id: "profs" as TopTab,
            label: "Q/R Professeurs",
            icon: GraduationCap,
            badge: profUnresolvedCount,
            badgeColor: "bg-orange-500",
          },
          {
            id: "admin" as TopTab,
            label: "Q/R Administration",
            icon: Building2,
            badge: adminUnresolvedCount,
            badgeColor: "bg-blue-500",
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = topTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabSwitch(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-bold transition-all ${
                isActive
                  ? "bg-[#0e1e35] text-white shadow-md"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4.5 h-4.5" />
              {tab.label}
              {tab.badge > 0 && (
                <span
                  className={`ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${
                    isActive ? "bg-white/25" : tab.badgeColor
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>}

      {/* ═══════════ PROF TAB ═══════════ */}
      {topTab === "profs" && (
        <>
          {/* Stats cards (hidden for profs — they ARE the ones being relanced) */}
          {!isProf && <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Pilotage Q/R Professeurs</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Backlog non résolu : <span className="font-bold text-gray-900">{unresolvedCount}</span> question{unresolvedCount > 1 ? "s" : ""}
                </p>
              </div>
              {queuePreset !== "unresolved" && (
                <button
                  type="button"
                  onClick={() => setQueuePreset("unresolved")}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Voir tout le backlog
                </button>
              )}
            </div>
            <div className="grid gap-3 grid-cols-3">
              {statsCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={card.onClick}
                    className={`rounded-2xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${card.tone} ${
                      card.active ? "ring-2 ring-blue-200" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold opacity-80">{card.label}</p>
                        <p className="mt-1 text-2xl font-bold">{card.value}</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-2">
                        <Icon className={`h-4 w-4 ${card.iconTone}`} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>}

          {/* Main content: tree + thread list + chat */}
          <div className="flex-1 min-h-0 rounded-2xl border border-gray-200 bg-white overflow-hidden flex">
            {/* Pedagogy tree sidebar */}
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

            {/* Thread list */}
            <div
              className={`w-full lg:w-[min(420px,36vw)] border-r border-gray-100 flex flex-col shrink-0 min-h-0 ${
                selected ? "hidden lg:flex" : "flex"
              }`}
            >
              <div className="p-3 border-b border-gray-100 space-y-3 shrink-0">
                {selectedMatiereIds.size > 0 && (
                  <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
                    Filtre actif : {selectedMatiereIds.size} matière{selectedMatiereIds.size > 1 ? "s" : ""} sélectionnée
                    {selectedMatiereIds.size > 1 ? "s" : ""}
                  </p>
                )}

                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un étudiant, une matière, un contexte..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(event) => setShowArchived(event.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-100"
                    />
                    Afficher les archivées
                  </label>

                  <select
                    value={filterMatiere}
                    onChange={(event) => setFilterMatiere(event.target.value)}
                    className="w-[200px] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="all">Toutes les matières</option>
                    {matieres.map((matiere) => (
                      <option key={matiere.id} value={matiere.id}>
                        {matiere.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <QaThreadList
                threads={filteredProfThreads}
                selectedId={selected?.id}
                onSelect={handleThreadSelect}
                onArchiveThread={handleArchiveThread}
                onDeleteThread={handleDeleteThread}
                showArchived={showArchived}
                overdueThreadIds={overdueThreadIds}
              />
            </div>

            {/* Chat panel */}
            <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${!selected ? "hidden lg:flex" : "flex"}`}>
              {selected ? (
                <>
                  <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
                    <button onClick={handleBack} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium truncate">{getDisplayName(selected.student)}</span>
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
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 px-6">
                  <Inbox className="w-12 h-12 mb-3 text-gray-200" />
                  <p className="text-sm font-semibold text-gray-600">Sélectionne une question pour voir la conversation.</p>
                  <p className="mt-2 max-w-md text-center text-xs text-gray-400">
                    Utilise les cartes en haut pour filtrer par retard, ou l&apos;arbre à gauche pour filtrer par matière.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════ ADMIN TAB ═══════════ */}
      {topTab === "admin" && (
        <div className="flex-1 min-h-0 rounded-2xl border border-gray-200 bg-white overflow-hidden flex">
          {/* Formation tree sidebar */}
          <div className="hidden lg:flex flex-col shrink-0 border-r border-gray-200 overflow-y-auto h-full bg-gray-50/60 w-[min(260px,28vw)]">
            <div className="px-3 pt-3 pb-2 shrink-0 border-b border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Formations & Classes</p>
            </div>

            <div className="px-2 pt-2 pb-1">
              <button
                type="button"
                onClick={() => setAdminSelectedGroupeId(null)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  !adminSelectedGroupeId
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <Layers size={13} />
                Toutes les questions
                {adminUnresolvedCount > 0 && (
                  <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    !adminSelectedGroupeId ? "bg-white/25 text-white" : "bg-blue-100 text-blue-700"
                  }`}>
                    {adminUnresolvedCount}
                  </span>
                )}
              </button>
            </div>

            <div className="px-2 pb-3 flex-1 min-h-0 space-y-0.5">
              {adminFormationTree.roots.map((node) => (
                <AdminFormationNode
                  key={node.dossier.id}
                  node={node}
                  depth={0}
                  selectedGroupeId={adminSelectedGroupeId}
                  onSelectGroupe={setAdminSelectedGroupeId}
                  threadCountByGroupe={adminFormationTree.threadCountByGroupe}
                />
              ))}
            </div>
          </div>

          {/* Thread list */}
          <div
            className={`w-full lg:w-[min(400px,34vw)] border-r border-gray-100 flex flex-col shrink-0 min-h-0 ${
              selected ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="p-3 border-b border-gray-100 space-y-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                  <Building2 className="h-3.5 w-3.5 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Questions administratives</p>
                  <p className="text-[11px] text-gray-500">
                    {adminUnresolvedCount} en attente · {adminThreads.length} total
                  </p>
                </div>
              </div>

              <input
                type="text"
                value={adminSearch}
                onChange={(event) => setAdminSearch(event.target.value)}
                placeholder="Rechercher un étudiant, un sujet..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />

              <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={adminShowArchived}
                  onChange={(event) => setAdminShowArchived(event.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-100"
                />
                Afficher les archivées
              </label>
            </div>

            <QaThreadList
              threads={filteredAdminThreads}
              selectedId={selected?.id}
              onSelect={handleThreadSelect}
              onArchiveThread={handleArchiveThread}
              onDeleteThread={handleDeleteThread}
              showArchived={adminShowArchived}
              overdueThreadIds={new Set()}
            />
          </div>

          {/* Chat panel */}
          <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${!selected ? "hidden lg:flex" : "flex"}`}>
            {selected ? (
              <>
                <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
                  <button onClick={handleBack} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-medium truncate">{getDisplayName(selected.student)}</span>
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
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 px-6">
                <Building2 className="w-12 h-12 mb-3 text-gray-200" />
                <p className="text-sm font-semibold text-gray-600">Sélectionne une question pour répondre.</p>
                <p className="mt-2 max-w-md text-center text-xs text-gray-400">
                  Les étudiants posent ici des questions générales à l&apos;administration (logistique, inscription, etc.).
                  Répondez directement dans le chat.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
