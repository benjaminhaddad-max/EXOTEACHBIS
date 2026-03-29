"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Dossier, Matiere, Profile } from "@/types/database";
import type { QaThread } from "@/types/qa";
import { QaPedagogieMatiereTreeSidebar } from "./qa-pedagogie-matiere-tree-sidebar";
import { QaThreadList } from "./qa-thread-list";
import { QaChatPanel } from "./qa-chat-panel";
import {
  ArrowLeft,
  BellRing,
  ChevronRight,
  Clock3,
  Inbox,
  User,
  Users2,
} from "lucide-react";

type DashboardView = "queue" | "profs";
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

type ProfSummary = {
  prof: QaProfLite;
  matiereIds: Set<string>;
  matiereNames: string[];
  threadCount: number;
  unresolvedCount: number;
  escalatedCount: number;
  overdueCount: number;
};

const RELANCE_THRESHOLD_HOURS = 48;

function threadMatchesQaTreeSelection(thread: QaThread, matiereIds: Set<string>) {
  if (matiereIds.size === 0) return true;
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

interface QaDashboardProps {
  initialThreads: QaThread[];
  userId: string;
  initialThreadId?: string;
  qaDossiers: Dossier[];
  qaMatieres: Matiere[];
  qaProfs: QaProfLite[];
  profMatieres: ProfMatiereLink[];
}

export function QaDashboard({
  initialThreads,
  userId,
  initialThreadId,
  qaDossiers,
  qaMatieres,
  qaProfs,
  profMatieres,
}: QaDashboardProps) {
  const supabase = createClient();

  const [threads, setThreads] = useState<QaThread[]>(initialThreads);
  const [selectedMatiereIds, setSelectedMatiereIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<QaThread | null>(
    initialThreadId ? initialThreads.find((thread) => thread.id === initialThreadId) ?? null : null
  );
  const [filterMatiere, setFilterMatiere] = useState("all");
  const [queuePreset, setQueuePreset] = useState<QueuePreset>("unresolved");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<DashboardView>("queue");
  const [selectedProfId, setSelectedProfId] = useState<string>("");
  const [profSearch, setProfSearch] = useState("");
  const [remindingProfId, setRemindingProfId] = useState<string | null>(null);
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

  const threadCountByMatiereId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const thread of threads) {
      if (!thread.matiere_id || thread.archived_at) continue;
      counts[thread.matiere_id] = (counts[thread.matiere_id] ?? 0) + 1;
    }
    return counts;
  }, [threads]);

  const matiereMap = useMemo(() => {
    const map = new Map<string, Matiere>();
    for (const matiere of qaMatieres) map.set(matiere.id, matiere);
    return map;
  }, [qaMatieres]);

  const profMatiereMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of profMatieres) {
      if (!map.has(link.prof_id)) map.set(link.prof_id, new Set());
      map.get(link.prof_id)!.add(link.matiere_id);
    }
    return map;
  }, [profMatieres]);

  const threadsVisible = useMemo(() => {
    if (showArchived) return threads;
    return threads.filter((thread) => !thread.archived_at);
  }, [threads, showArchived]);

  const threadsAfterScope = useMemo(() => {
    return threadsVisible.filter((thread) => threadMatchesQaTreeSelection(thread, selectedMatiereIds));
  }, [threadsVisible, selectedMatiereIds]);

  const profSummaries = useMemo<ProfSummary[]>(() => {
    return qaProfs
      .map((prof) => {
        const matiereIds = profMatiereMap.get(prof.id) ?? new Set<string>();
        const relevantThreads = threadsVisible.filter(
          (thread) => thread.matiere_id != null && matiereIds.has(thread.matiere_id)
        );
        const unresolvedThreads = relevantThreads.filter((thread) => thread.status !== "resolved");
        const escalatedThreads = relevantThreads.filter((thread) => thread.status === "escalated");
        const overdueThreads = escalatedThreads.filter((thread) => isThreadOverdue(thread, RELANCE_THRESHOLD_HOURS));

        return {
          prof,
          matiereIds,
          matiereNames: Array.from(matiereIds).map((matiereId) => matiereMap.get(matiereId)?.name ?? "Matière"),
          threadCount: relevantThreads.length,
          unresolvedCount: unresolvedThreads.length,
          escalatedCount: escalatedThreads.length,
          overdueCount: overdueThreads.length,
        };
      })
      .filter((summary) => summary.matiereIds.size > 0 || summary.prof.id === userId)
      .sort((a, b) => {
        if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
        if (b.escalatedCount !== a.escalatedCount) return b.escalatedCount - a.escalatedCount;
        return a.prof.first_name?.localeCompare(b.prof.first_name ?? "") ?? 0;
      });
  }, [matiereMap, profMatiereMap, qaProfs, threadsVisible, userId]);

  useEffect(() => {
    if (selectedProfId && profSummaries.some((summary) => summary.prof.id === selectedProfId)) return;
    const defaultProf = profSummaries.find((summary) => summary.overdueCount > 0) ?? profSummaries[0];
    if (defaultProf) setSelectedProfId(defaultProf.prof.id);
  }, [profSummaries, selectedProfId]);

  const selectedProfSummary = useMemo(
    () => profSummaries.find((summary) => summary.prof.id === selectedProfId) ?? null,
    [profSummaries, selectedProfId]
  );

  const matieres = useMemo(
    () =>
      Array.from(
        new Map(threadsAfterScope.filter((thread) => thread.matiere).map((thread) => [thread.matiere!.id, thread.matiere!])).values()
      ),
    [threadsAfterScope]
  );

  const profThreadsBase = useMemo(() => {
    if (!selectedProfSummary) return threadsAfterScope;
    return threadsAfterScope.filter(
      (thread) => thread.matiere_id != null && selectedProfSummary.matiereIds.has(thread.matiere_id)
    );
  }, [selectedProfSummary, threadsAfterScope]);

  const queueBase = viewMode === "profs" ? profThreadsBase : threadsAfterScope;

  const filteredThreads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const list = queueBase.filter((thread) => {
      if (!matchesQueuePreset(thread, queuePreset)) return false;
      if (viewMode === "queue" && filterMatiere !== "all" && thread.matiere_id !== filterMatiere) return false;
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
  }, [filterMatiere, queueBase, queuePreset, search, viewMode]);

  const overdueThreadIds = useMemo(() => {
    const ids = new Set<string>();
    for (const thread of filteredThreads) {
      if (isThreadOverdue(thread, RELANCE_THRESHOLD_HOURS)) ids.add(thread.id);
    }
    return ids;
  }, [filteredThreads]);

  useEffect(() => {
    if (!selected) return;
    if (filteredThreads.some((thread) => thread.id === selected.id)) return;
    setSelected(null);
    window.history.replaceState(null, "", "/admin/questions-reponses");
  }, [filteredThreads, selected]);

  const unresolvedCount = threadsAfterScope.filter((thread) => thread.status !== "resolved").length;
  const overdue2DaysCount = threadsAfterScope.filter((thread) => isThreadOverdue(thread, 48)).length;
  const overdue3DaysCount = threadsAfterScope.filter((thread) => isThreadOverdue(thread, 72)).length;
  const overdue4DaysCount = threadsAfterScope.filter((thread) => isThreadOverdue(thread, 96)).length;
  const profsToChaseCount = profSummaries.filter((summary) => summary.overdueCount > 0).length;

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

  const handleRemindProf = async (summary: ProfSummary) => {
    setRemindingProfId(summary.prof.id);
    const title =
      summary.overdueCount > 0
        ? `Relance admin : ${summary.overdueCount} question(s) en retard`
        : `Relance admin : ${summary.unresolvedCount} question(s) à traiter`;
    const body =
      summary.overdueCount > 0
        ? `Tu as ${summary.overdueCount} question(s) en retard sur tes matières. Merci de revenir sur le dashboard Questions / Réponses.`
        : `Tu as ${summary.unresolvedCount} question(s) à surveiller sur tes matières.`;

    const { error } = await supabase.from("notifications").insert({
      user_id: summary.prof.id,
      type: "qa_escalated",
      title,
      body,
      link: "/admin/questions-reponses",
    });

    setRemindingProfId(null);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast(
      `Relance envoyée à ${getDisplayName(summary.prof)}. Notif active, mail/SMS à brancher ensuite.`,
      "success"
    );
  };

  const filteredProfSummaries = useMemo(() => {
    const normalizedSearch = profSearch.trim().toLowerCase();
    if (!normalizedSearch) return profSummaries;
    return profSummaries.filter((summary) => {
      const name = getDisplayName(summary.prof).toLowerCase();
      const matieresLabel = summary.matiereNames.join(" ").toLowerCase();
      return name.includes(normalizedSearch) || matieresLabel.includes(normalizedSearch);
    });
  }, [profSearch, profSummaries]);

  const statsCards = [
    {
      id: "overdue_2d",
      label: "En retard > 2 jours",
      value: overdue2DaysCount,
      help: "Première zone de tension à regarder.",
      icon: Clock3,
      tone: "border-amber-100 bg-amber-50 text-amber-900",
      iconTone: "text-amber-500",
      onClick: () => {
        setViewMode("queue");
        setQueuePreset("overdue_2d");
      },
      active: viewMode === "queue" && queuePreset === "overdue_2d",
    },
    {
      id: "overdue_3d",
      label: "En retard > 3 jours",
      value: overdue3DaysCount,
      help: "Là, on commence à avoir un vrai sujet côté prof.",
      icon: Clock3,
      tone: "border-orange-100 bg-orange-50 text-orange-900",
      iconTone: "text-orange-500",
      onClick: () => {
        setViewMode("queue");
        setQueuePreset("overdue_3d");
      },
      active: viewMode === "queue" && queuePreset === "overdue_3d",
    },
    {
      id: "overdue_4d",
      label: "En retard > 4 jours",
      value: overdue4DaysCount,
      help: "Urgence nette, à traiter immédiatement.",
      icon: Clock3,
      tone: "border-red-100 bg-red-50 text-red-900",
      iconTone: "text-red-500",
      onClick: () => {
        setViewMode("queue");
        setQueuePreset("overdue_4d");
      },
      active: viewMode === "queue" && queuePreset === "overdue_4d",
    },
    {
      id: "profs",
      label: "Profs à relancer",
      value: profsToChaseCount,
      help: "Vue directe par prof avec retard et relance admin.",
      icon: Users2,
      tone: "border-blue-100 bg-blue-50 text-blue-900",
      iconTone: "text-blue-500",
      onClick: () => setViewMode("profs"),
      active: viewMode === "profs",
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

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Pilotage Q/R</p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">
              Voir tout de suite ce qui bloque, qui est en retard, et relancer sans friction.
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Le dashboard te sert maintenant à 2 choses : attraper les questions non résolues en vrac, et passer en vue
              professeur pour voir qui prend du retard.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            {[
              { id: "queue" as const, label: "Questions à traiter" },
              { id: "profs" as const, label: "Vue professeurs" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  viewMode === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statsCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={card.onClick}
                className={`rounded-2xl border px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${card.tone} ${
                  card.active ? "ring-2 ring-blue-200" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold opacity-80">{card.label}</p>
                    <p className="mt-1 text-3xl font-bold">{card.value}</p>
                  </div>
                  <div className="rounded-xl bg-white/70 p-2">
                    <Icon className={`h-5 w-5 ${card.iconTone}`} />
                  </div>
                </div>
                <p className="mt-2 text-xs opacity-70">{card.help}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex-1 min-h-0 rounded-2xl border border-gray-200 bg-white overflow-hidden flex">
        {viewMode === "queue" ? (
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
        ) : (
          <div
            className={`w-full lg:w-[320px] border-r border-gray-100 flex flex-col shrink-0 min-h-0 ${
              selected ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="p-3 border-b border-gray-100 shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Vue professeurs</p>
              <p className="mt-1 text-sm text-gray-600">
                Clique sur un prof pour voir son backlog. Le bouton de relance envoie déjà une notif, on branchera le
                mail/SMS ensuite.
              </p>
              <input
                type="text"
                value={profSearch}
                onChange={(event) => setProfSearch(event.target.value)}
                placeholder="Rechercher un professeur..."
                className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredProfSummaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                  Aucun professeur trouvé pour cette recherche.
                </div>
              ) : (
                filteredProfSummaries.map((summary) => {
                  const isActive = summary.prof.id === selectedProfId;
                  return (
                    <div
                      key={summary.prof.id}
                      className={`rounded-2xl border p-3 transition-colors ${
                        isActive ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedProfId(summary.prof.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
                                <User className="h-4 w-4 text-gray-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-900">{getDisplayName(summary.prof)}</p>
                                <p className="truncate text-[11px] text-gray-500">{summary.prof.email}</p>
                              </div>
                            </div>
                          </div>

                          <ChevronRight className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-500" : "text-gray-300"}`} />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">
                            {summary.unresolvedCount} à traiter
                          </span>
                          <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600">
                            {summary.overdueCount} en retard
                          </span>
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                            {summary.escalatedCount} attente prof
                          </span>
                        </div>

                        <p className="mt-2 line-clamp-2 text-[11px] text-gray-500">
                          {summary.matiereNames.length > 0
                            ? summary.matiereNames.join(" · ")
                            : "Aucune matière rattachée"}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemindProf(summary)}
                        disabled={remindingProfId === summary.prof.id}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                      >
                        {remindingProfId === summary.prof.id ? (
                          <>
                            <Clock3 className="h-3.5 w-3.5 animate-spin" />
                            Envoi de la relance...
                          </>
                        ) : (
                          <>
                            <BellRing className="h-3.5 w-3.5" />
                            Relancer le prof
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div
          className={`w-full lg:w-[min(420px,36vw)] border-r border-gray-100 flex flex-col shrink-0 min-h-0 ${
            selected ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="p-3 border-b border-gray-100 space-y-3 shrink-0">
            {viewMode === "queue" ? (
              <>
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                  {queuePreset === "unresolved" && `Backlog non résolu : ${unresolvedCount} question${unresolvedCount > 1 ? "s" : ""}.`}
                  {queuePreset === "overdue_2d" && "Vue active : questions en retard de plus de 2 jours."}
                  {queuePreset === "overdue_3d" && "Vue active : questions en retard de plus de 3 jours."}
                  {queuePreset === "overdue_4d" && "Vue active : questions en retard de plus de 4 jours."}
                  {queuePreset === "all" && "Vue active : toutes les conversations visibles."}
                </div>
                {selectedMatiereIds.size > 0 && (
                  <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
                    Filtre actif : {selectedMatiereIds.size} matière{selectedMatiereIds.size > 1 ? "s" : ""} sélectionnée
                    {selectedMatiereIds.size > 1 ? "s" : ""}
                  </p>
                )}
              </>
            ) : selectedProfSummary ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Prof sélectionné</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{getDisplayName(selectedProfSummary.prof)}</p>
                  <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600">
                    {selectedProfSummary.overdueCount} en retard
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">
                    {selectedProfSummary.unresolvedCount} à traiter
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  Matières : {selectedProfSummary.matiereNames.join(" · ") || "aucune"}
                </p>
              </div>
            ) : null}

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un étudiant, une matière, un contexte..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-100"
                />
                Afficher les archivées
              </label>

              <div className="flex w-full sm:w-auto items-center gap-2">
                {viewMode === "queue" && queuePreset !== "unresolved" && (
                  <button
                    type="button"
                    onClick={() => setQueuePreset("unresolved")}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Voir tout le backlog
                  </button>
                )}

                {viewMode === "queue" && (
                  <select
                    value={filterMatiere}
                    onChange={(event) => setFilterMatiere(event.target.value)}
                    className="w-full sm:w-[220px] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="all">Toutes les matières</option>
                    {matieres.map((matiere) => (
                      <option key={matiere.id} value={matiere.id}>
                        {matiere.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <QaThreadList
            threads={filteredThreads}
            selectedId={selected?.id}
            onSelect={handleThreadSelect}
            onArchiveThread={handleArchiveThread}
            onDeleteThread={handleDeleteThread}
            showArchived={showArchived}
            overdueThreadIds={overdueThreadIds}
          />
        </div>

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
              <p className="text-sm font-semibold text-gray-600">Sélectionne une question pour voir où ça coince.</p>
              <p className="mt-2 max-w-md text-center text-xs text-gray-400">
                {viewMode === "queue"
                  ? "Commence par les cartes du haut pour basculer directement sur les questions en retard ou revenir au backlog complet."
                  : "Choisis un prof à gauche pour voir instantanément son backlog, ses retards, puis ouvrir les conversations concernées."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
