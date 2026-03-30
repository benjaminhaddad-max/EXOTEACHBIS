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
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  GraduationCap,
  Inbox,
  Layers,
  Loader2,
  Send,
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
  const [filterFormation, setFilterFormation] = useState("all");
  const [filterUni, setFilterUni] = useState("all");
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

  // ─── Formation filter derived data ─────────────────────────────────────────
  const availableOffers = useMemo(
    () => qaDossiers.filter((d) => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index),
    [qaDossiers]
  );

  const matiereToOfferId = useMemo(() => {
    const byId = new Map(qaDossiers.map((d) => [d.id, d]));
    const map = new Map<string, string>();
    for (const mat of qaMatieres) {
      let cur = byId.get(mat.dossier_id);
      while (cur) {
        if (cur.dossier_type === "offer") {
          map.set(mat.id, cur.id);
          break;
        }
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
    }
    return map;
  }, [qaDossiers, qaMatieres]);

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
      if (filterFormation !== "all" && thread.matiere_id && matiereToOfferId.get(thread.matiere_id) !== filterFormation) return false;
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
  }, [filterMatiere, filterFormation, matiereToOfferId, threadsAfterScope, queuePreset, search]);

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
      {topTab === "profs" && isProf && (
        <>
          {/* Main content: tree + thread list + chat (prof view) */}
          <div className="flex-1 min-h-0 rounded-2xl border border-gray-200 bg-white overflow-hidden flex">
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
            <div className={`w-full lg:w-[min(420px,36vw)] border-r border-gray-100 flex flex-col shrink-0 min-h-0 ${selected ? "hidden lg:flex" : "flex"}`}>
              <div className="p-3 border-b border-gray-100 space-y-3 shrink-0">
                {availableOffers.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => { setFilterFormation("all"); setFilterMatiere("all"); }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${filterFormation === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>Toutes</button>
                    {availableOffers.map((offer) => (
                      <button key={offer.id} type="button" onClick={() => { setFilterFormation(filterFormation === offer.id ? "all" : offer.id); setFilterMatiere("all"); }}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${filterFormation === offer.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>{offer.name}</button>
                    ))}
                  </div>
                )}
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un étudiant, une matière, un contexte..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer select-none">
                    <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-100" />
                    Afficher les archivées
                  </label>
                  <select value={filterMatiere} onChange={(e) => setFilterMatiere(e.target.value)}
                    className="w-[200px] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    <option value="all">Toutes les matières</option>
                    {matieres.filter((m) => filterFormation === "all" || matiereToOfferId.get(m.id) === filterFormation).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <QaThreadList threads={filteredProfThreads} selectedId={selected?.id} onSelect={handleThreadSelect}
                onArchiveThread={handleArchiveThread} onDeleteThread={handleDeleteThread} showArchived={showArchived} overdueThreadIds={overdueThreadIds} />
            </div>
            <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${!selected ? "hidden lg:flex" : "flex"}`}>
              {selected ? (
                <>
                  <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
                    <button onClick={handleBack} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
                    <span className="text-sm font-medium truncate">{getDisplayName(selected.student)}</span>
                  </div>
                  <QaChatPanel thread={selected} userId={userId} onResolve={() => refreshThreads()}
                    onArchiveThread={handleArchiveThread} onUnarchiveThread={handleUnarchiveThread} onDeleteThread={handleDeleteThread} />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 px-6">
                  <Inbox className="w-12 h-12 mb-3 text-gray-200" />
                  <p className="text-sm font-semibold text-gray-600">Sélectionne une question pour voir la conversation.</p>
                  <p className="mt-2 max-w-md text-center text-xs text-gray-400">Utilise les cartes en haut pour filtrer par retard, ou l&apos;arbre à gauche pour filtrer par matière.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════ ADMIN PROF OVERSIGHT TAB ═══════════ */}
      {topTab === "profs" && !isProf && (() => {
        const overdueThreshold = queuePreset === "overdue_4d" ? 96 : queuePreset === "overdue_3d" ? 72 : 48;

        // All overdue threads (not archived, escalated, over threshold)
        const allOverdueThreads = profThreads.filter((t) => !t.archived_at && isThreadOverdue(t, overdueThreshold));

        // Build matiere → university mapping
        const matiereToUniId = new Map<string, string>();
        const dossierById = new Map(qaDossiers.map((d) => [d.id, d]));
        for (const mat of qaMatieres) {
          let cur = dossierById.get(mat.dossier_id);
          while (cur) {
            if (cur.dossier_type === "university") { matiereToUniId.set(mat.id, cur.id); break; }
            cur = cur.parent_id ? dossierById.get(cur.parent_id) : undefined;
          }
        }

        // Universities for selected formation
        const unisForFormation = filterFormation === "all" ? [] :
          qaDossiers.filter((d) => d.dossier_type === "university" && d.parent_id === filterFormation).sort((a, b) => a.order_index - b.order_index);

        // Filter by formation, university, matiere
        const overdueFiltered = allOverdueThreads.filter((t) => {
          if (!t.matiere_id) return filterFormation === "all";
          if (filterFormation !== "all" && matiereToOfferId.get(t.matiere_id) !== filterFormation) return false;
          if (filterUni !== "all" && matiereToUniId.get(t.matiere_id) !== filterUni) return false;
          if (filterMatiere !== "all" && t.matiere_id !== filterMatiere) return false;
          return true;
        });

        // All matières available for current formation/university selection
        const availableMatieres = qaMatieres.filter((m) => {
          if (filterFormation !== "all" && matiereToOfferId.get(m.id) !== filterFormation) return false;
          if (filterUni !== "all" && matiereToUniId.get(m.id) !== filterUni) return false;
          return true;
        });

        // Build prof → matiere mapping from profMatieres
        const profToMatiereIds = new Map<string, Set<string>>();
        for (const pm of profMatieres) {
          if (!profToMatiereIds.has(pm.prof_id)) profToMatiereIds.set(pm.prof_id, new Set());
          profToMatiereIds.get(pm.prof_id)!.add(pm.matiere_id);
        }

        // Group overdue threads by professor
        type ProfOverdue = { prof: QaProfLite; threads: QaThread[] };
        const profMap = new Map<string, ProfOverdue>();

        for (const thread of overdueFiltered) {
          // If explicitly assigned, attribute to that prof
          if (thread.assigned_prof_id && thread.assigned_prof) {
            if (!profMap.has(thread.assigned_prof_id)) {
              profMap.set(thread.assigned_prof_id, { prof: thread.assigned_prof as unknown as QaProfLite, threads: [] });
            }
            profMap.get(thread.assigned_prof_id)!.threads.push(thread);
          } else if (thread.matiere_id) {
            // Otherwise, attribute to all profs who teach this matière
            for (const prof of qaProfs) {
              const mats = profToMatiereIds.get(prof.id);
              if (mats?.has(thread.matiere_id)) {
                if (!profMap.has(prof.id)) profMap.set(prof.id, { prof, threads: [] });
                const existing = profMap.get(prof.id)!;
                if (!existing.threads.some((t) => t.id === thread.id)) existing.threads.push(thread);
              }
            }
          }
        }

        const profsWithOverdue = Array.from(profMap.values())
          .filter((p) => p.threads.length > 0)
          .sort((a, b) => b.threads.length - a.threads.length);

        const totalOverdueProfs = profsWithOverdue.length;
        const totalOverdueThreads = overdueFiltered.length;

        return (
          <>
            {/* Stats cards */}
            <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Suivi retards Q/R Professeurs</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    <span className="font-bold text-gray-900">{totalOverdueProfs}</span> prof{totalOverdueProfs > 1 ? "s" : ""} en retard
                    {" "}— <span className="font-bold text-gray-900">{totalOverdueThreads}</span> question{totalOverdueThreads > 1 ? "s" : ""} non traitée{totalOverdueThreads > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 grid-cols-3">
                {statsCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button key={card.id} type="button" onClick={card.onClick}
                      className={`rounded-2xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${card.tone} ${card.active ? "ring-2 ring-blue-200" : ""}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold opacity-80">{card.label}</p>
                          <p className="mt-1 text-2xl font-bold">{card.value}</p>
                        </div>
                        <div className="rounded-xl bg-white/70 p-2"><Icon className={`h-4 w-4 ${card.iconTone}`} /></div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filters: Formation → Université → Matière */}
            <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-3 mb-4 space-y-2">
              {/* Formation */}
              {availableOffers.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-20 shrink-0">Formation</span>
                  <button type="button" onClick={() => { setFilterFormation("all"); setFilterUni("all"); setFilterMatiere("all"); }}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${filterFormation === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>Toutes</button>
                  {availableOffers.map((offer) => (
                    <button key={offer.id} type="button" onClick={() => { setFilterFormation(filterFormation === offer.id ? "all" : offer.id); setFilterUni("all"); setFilterMatiere("all"); }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${filterFormation === offer.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>{offer.name}</button>
                  ))}
                </div>
              )}
              {/* Université */}
              {filterFormation !== "all" && unisForFormation.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-20 shrink-0">Université</span>
                  <button type="button" onClick={() => { setFilterUni("all"); setFilterMatiere("all"); }}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${filterUni === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>Toutes</button>
                  {unisForFormation.map((uni) => (
                    <button key={uni.id} type="button" onClick={() => { setFilterUni(filterUni === uni.id ? "all" : uni.id); setFilterMatiere("all"); }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${filterUni === uni.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>{uni.name.replace("Université ", "")}</button>
                  ))}
                </div>
              )}
              {/* Matière */}
              {availableMatieres.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-20 shrink-0">Matière</span>
                  <button type="button" onClick={() => setFilterMatiere("all")}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${filterMatiere === "all" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>Toutes</button>
                  {availableMatieres.map((mat) => (
                    <button key={mat.id} type="button" onClick={() => setFilterMatiere(filterMatiere === mat.id ? "all" : mat.id)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${filterMatiere === mat.id ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>{mat.name}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Prof list grouped */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              {profsWithOverdue.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
                  <Inbox className="w-10 h-10 mx-auto text-gray-200 mb-3" />
                  <p className="text-sm font-semibold text-gray-600">Aucun prof en retard</p>
                  <p className="text-xs text-gray-400 mt-1">Toutes les questions ont été traitées dans les délais.</p>
                </div>
              ) : profsWithOverdue.map(({ prof, threads: overdueThreadsList }) => (
                <div key={prof.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  {/* Prof header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                      {(prof.first_name?.[0] ?? "").toUpperCase()}{(prof.last_name?.[0] ?? "").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{getDisplayName(prof)}</p>
                      <p className="text-[11px] text-gray-500">{prof.email}</p>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-100">
                      {overdueThreadsList.length} question{overdueThreadsList.length > 1 ? "s" : ""} en retard
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch("/api/qa/relance", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ prof_id: prof.id, thread_ids: overdueThreadsList.map((t) => t.id) }),
                        });
                        if (res.ok) showToast(`Relance envoyée à ${getDisplayName(prof)}`, "success");
                        else showToast("Erreur lors de la relance", "error");
                      }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                    >
                      <Send size={12} />
                      Repinger
                    </button>
                  </div>
                  {/* Thread list */}
                  <div className="divide-y divide-gray-50">
                    {overdueThreadsList.sort((a, b) => getThreadAgeHours(b) - getThreadAgeHours(a)).map((thread) => {
                      const ageHours = getThreadAgeHours(thread);
                      const ageDays = Math.floor(ageHours / 24);
                      return (
                        <a
                          key={thread.id}
                          href={`/admin/questions-reponses?thread=${thread.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate group-hover:text-blue-600">
                              {thread.title || thread.context_label || "Question sans titre"}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {thread.matiere && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">{thread.matiere.name}</span>
                              )}
                              <span className="text-[10px] text-gray-400">par {getDisplayName(thread.student)}</span>
                            </div>
                          </div>
                          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            ageDays >= 4 ? "bg-red-100 text-red-700" : ageDays >= 3 ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {ageDays}j retard
                          </span>
                          <ExternalLink size={12} className="shrink-0 text-gray-300 group-hover:text-blue-500" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}

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
