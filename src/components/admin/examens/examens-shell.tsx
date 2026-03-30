"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Plus, Pencil, Trash2, X, Check, AlertCircle, Loader2,
  Calendar, Clock, Eye, EyeOff, Layers,
  BarChart3, Settings2, Upload, FileDown,
  GraduationCap, Building2, ChevronDown, Users,
} from "lucide-react";
import type { Serie, Filiere, Dossier, Groupe, Matiere } from "@/types/database";
import {
  createExamen, updateExamen, deleteExamen,
  toggleResultsVisibility, toggleExamenVisibility,
  setExamenGroupes,
} from "@/app/(admin)/admin/examens/actions";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ParametrageShell } from "@/components/admin/examens/parametrage-shell";
import { useRouter } from "next/navigation";

export type ExamenSerieWithCoeff = {
  series_id: string;
  order_index: number;
  coefficient: number;
  debut_at?: string | null;
  fin_at?: string | null;
  series?: Serie;
};

export type ExamenWithSeries = {
  id: string;
  name: string;
  description: string | null;
  debut_at: string;
  fin_at: string;
  visible: boolean;
  results_visible: boolean;
  notation_sur: number;
  created_at: string;
  series?: Serie[];
  examen_series?: ExamenSerieWithCoeff[];
  groupe_ids?: string[];
};

type Modal =
  | { type: "create" }
  | { type: "edit"; examen: ExamenWithSeries }
  | null;

type Toast = { message: string; kind: "success" | "error" } | null;

function getStatus(debut: string, fin: string): "upcoming" | "active" | "ended" {
  const now = Date.now();
  if (now < new Date(debut).getTime()) return "upcoming";
  if (now > new Date(fin).getTime()) return "ended";
  return "active";
}

const STATUS_COLORS = {
  upcoming: "bg-blue-500/20 text-blue-300",
  active: "bg-green-500/20 text-green-300",
  ended: "bg-gray-500/20 text-gray-400",
};
const STATUS_LABELS = {
  upcoming: "À venir",
  active: "En cours",
  ended: "Terminé",
};

function orderExamens(items: ExamenWithSeries[]) {
  return [...items].sort((a, b) => new Date(b.debut_at).getTime() - new Date(a.debut_at).getTime());
}

function cleanSerieName(name: string) {
  const trimmed = name.trim();
  const parts = trimmed.split(" — ");
  if (parts.length > 1) {
    return parts.slice(1).join(" — ").trim();
  }
  return trimmed;
}

function getSerieDisplayName(serie: Serie | undefined, matiereMap: Map<string, Matiere>) {
  if (!serie) return "—";
  if (serie.matiere_id) {
    const matiere = matiereMap.get(serie.matiere_id);
    if (matiere?.name) return matiere.name;
  }
  return cleanSerieName(serie.name);
}

export function ExamensShell({
  initialExamens,
  allSeries,
  filieres,
  dossiers,
  allDossiers,
  groupes,
  matieres,
  userRole = "admin",
  profMatiereIds,
}: {
  initialExamens: ExamenWithSeries[];
  allSeries: Serie[];
  filieres: Filiere[];
  dossiers: Dossier[];
  allDossiers: Dossier[];
  groupes: Groupe[];
  matieres: Matiere[];
  userRole?: string;
  profMatiereIds?: string[];
}) {
  const isProf = userRole === "prof";
  const profMatiereSet = useMemo(() => profMatiereIds ? new Set(profMatiereIds) : null, [profMatiereIds]);
  const router = useRouter();
  const [examens, setExamens] = useState<ExamenWithSeries[]>(() => orderExamens(initialExamens));
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedGroupeIds, setSelectedGroupeIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"examens" | "parametrage">("examens");
  const [visibilityPendingKey, setVisibilityPendingKey] = useState<string | null>(null);
  const [profSubTab, setProfSubTab] = useState<"passed" | "upcoming">("upcoming");
  const [uploadingSerieId, setUploadingSerieId] = useState<string | null>(null);
  const [generatingGridExamId, setGeneratingGridExamId] = useState<string | null>(null);

  useEffect(() => {
    setExamens(orderExamens(initialExamens));
  }, [initialExamens]);

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const toggleGroupe = (id: string) => setSelectedGroupeIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelectedGroupeIds(new Set());

  // Filter examens by selected groupes
  const filteredExamens = useMemo(() => {
    if (selectedGroupeIds.size === 0) return examens;
    return examens.filter(e => {
      if (!e.groupe_ids || e.groupe_ids.length === 0) return false;
      return e.groupe_ids.some(gid => selectedGroupeIds.has(gid));
    });
  }, [examens, selectedGroupeIds]);

  // For profs: filter examens that have at least one série linked to their matières
  const profFilteredExamens = useMemo(() => {
    if (!isProf || !profMatiereSet) return filteredExamens;
    return filteredExamens.filter(e => {
      const series = e.examen_series ?? [];
      return series.some(es => es.series?.matiere_id && profMatiereSet.has(es.series.matiere_id));
    });
  }, [filteredExamens, isProf, profMatiereSet]);

  const profPassedExamens = useMemo(() =>
    profFilteredExamens.filter(e => getStatus(e.debut_at, e.fin_at) === "ended"),
    [profFilteredExamens]
  );

  const profUpcomingExamens = useMemo(() =>
    profFilteredExamens.filter(e => getStatus(e.debut_at, e.fin_at) !== "ended"),
    [profFilteredExamens]
  );

  const displayExamens = isProf
    ? (profSubTab === "passed" ? profPassedExamens : profUpcomingExamens)
    : filteredExamens;

  // Handle Word upload for a specific série (prof)
  const handleProfUploadWord = async (serieId: string, file: File) => {
    setUploadingSerieId(serieId);
    try {
      const formData = new FormData();
      formData.append("serieId", serieId);
      formData.append("file", file);
      const importRes = await fetch("/api/import-serie", { method: "POST", body: formData });
      const importData = await importRes.json();
      if (!importRes.ok || importData.error) {
        showToast(importData.error || "Erreur d'import", "error");
      } else {
        showToast(importData.message || "Sujet importé", "success");
        router.refresh();
      }
    } finally {
      setUploadingSerieId(null);
    }
  };

  const handleGenerateGrid = async (examen: ExamenWithSeries, nbQuestions: number) => {
    setGeneratingGridExamId(examen.id);
    try {
      const res = await fetch("/api/generate-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: examen.name,
          institution: "",
          nb_questions: nbQuestions,
          nb_choices: 5,
          has_remorse: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "Erreur de génération", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grille-${examen.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Grille PDF téléchargée", "success");
    } finally {
      setGeneratingGridExamId(null);
    }
  };

  // Get groupe names for display
  const groupeMap = useMemo(() => {
    const m = new Map<string, Groupe>();
    for (const g of groupes) m.set(g.id, g);
    return m;
  }, [groupes]);

  const matiereMap = useMemo(() => {
    const m = new Map<string, Matiere>();
    for (const matiere of matieres) m.set(matiere.id, matiere);
    return m;
  }, [matieres]);

  const refreshExamens = async () => {
    const supabase = createClient();
    const [examensRes, exGroupesRes] = await Promise.all([
      supabase
        .from("examens")
        .select("*, examens_series(series_id, order_index, coefficient, debut_at, fin_at, series:series(*))")
        .order("debut_at", { ascending: false }),
      supabase.from("examens_groupes").select("*"),
    ]);
    if (examensRes.data) {
      const examenGroupesMap: Record<string, string[]> = {};
      for (const eg of (exGroupesRes.data ?? [])) {
        if (!examenGroupesMap[eg.examen_id]) examenGroupesMap[eg.examen_id] = [];
        examenGroupesMap[eg.examen_id].push(eg.groupe_id);
      }
      setExamens(
        examensRes.data.map((e: any) => ({
          ...e,
          examen_series: (e.examens_series ?? [])
            .sort((a: any, b: any) => a.order_index - b.order_index),
          series: (e.examens_series ?? [])
            .sort((a: any, b: any) => a.order_index - b.order_index)
            .map((es: any) => es.series)
            .filter(Boolean),
          examens_series: undefined,
          groupe_ids: examenGroupesMap[e.id] ?? [],
        }))
      );
    }
  };

  const handleDeleteExamen = (id: string) => {
    if (!confirm("Supprimer cet examen ?")) return;
    startTransition(async () => {
      const res = await deleteExamen(id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setExamens((prev) => prev.filter((e) => e.id !== id));
      router.refresh();
      showToast("Examen supprimé", "success");
    });
  };

  const handleToggleResults = (examen: ExamenWithSeries) => {
    const pendingKey = `results:${examen.id}`;
    setVisibilityPendingKey(pendingKey);
    startTransition(async () => {
      const newVal = !examen.results_visible;
      const res = await toggleResultsVisibility(examen.id, newVal);
      if ("error" in res) { setVisibilityPendingKey(null); showToast(res.error!, "error"); return; }
      setExamens((prev) => prev.map((e) => e.id === examen.id ? { ...e, results_visible: newVal } : e));
      setVisibilityPendingKey(null);
      router.refresh();
      showToast(newVal ? "Résultats rendus visibles" : "Résultats masqués", "success");
    });
  };

  const handleToggleExamVisibility = (examen: ExamenWithSeries) => {
    const pendingKey = `exam:${examen.id}`;
    setVisibilityPendingKey(pendingKey);
    startTransition(async () => {
      const newVal = !examen.visible;
      const res = await toggleExamenVisibility(examen.id, newVal);
      if ("error" in res) { setVisibilityPendingKey(null); showToast(res.error!, "error"); return; }
      setExamens((prev) => prev.map((e) => e.id === examen.id ? { ...e, visible: newVal } : e));
      setVisibilityPendingKey(null);
      router.refresh();
      showToast(newVal ? "Examen rendu visible aux élèves" : "Examen masqué côté élève", "success");
    });
  };


  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${
            toast.kind === "success" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"
          }`}
        >
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center justify-between px-5 border-b border-white/10 shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.15)" }}>
        <div className="flex items-center gap-0">
          {isProf ? (
            <>
              {(["upcoming", "passed"] as const).map(t => (
                <button key={t} onClick={() => setProfSubTab(t)}
                  className="relative px-5 py-3 text-xs font-semibold transition-colors"
                  style={{ color: profSubTab === t ? "#C9A84C" : "rgba(255,255,255,0.35)" }}>
                  {t === "upcoming" ? "Examens à venir" : "Examens passés"}
                  {profSubTab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ backgroundColor: "#C9A84C" }} />}
                </button>
              ))}
            </>
          ) : (
            <>
              {(["examens", "parametrage"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className="relative px-5 py-3 text-xs font-semibold transition-colors"
                  style={{ color: tab === t ? "#C9A84C" : "rgba(255,255,255,0.35)" }}>
                  {t === "examens" ? "Examens blancs" : "Paramétrage"}
                  {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ backgroundColor: "#C9A84C" }} />}
                </button>
              ))}
            </>
          )}
        </div>
        {!isProf && tab === "examens" && (
          <div className="flex items-center gap-2 py-2">
            {selectedGroupeIds.size === 0 && (
              <span className="text-[11px] italic font-medium" style={{ color: "#C9A84C" }}>← Sélectionne les classes cibles</span>
            )}
            <button
              onClick={() => { if (selectedGroupeIds.size > 0) setModal({ type: "create" }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: selectedGroupeIds.size > 0 ? "#C9A84C" : "rgba(201,168,76,0.3)",
                color: selectedGroupeIds.size > 0 ? "#0e1e35" : "rgba(201,168,76,0.7)",
                border: selectedGroupeIds.size > 0 ? "none" : "1px dashed rgba(201,168,76,0.5)",
                cursor: selectedGroupeIds.size > 0 ? "pointer" : "not-allowed",
              }}
            >
              <Plus size={13} /> Nouvel examen
            </button>
          </div>
        )}
      </div>

      {/* Tab content */}
      {!isProf && tab === "parametrage" ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <ParametrageShell
            dossiers={dossiers}
            allDossiers={allDossiers}
            matieres={matieres}
            filieres={filieres}
            embedded
          />
        </div>
      ) : (
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar — hidden for profs (they see all their matières directly) */}
      {!isProf && (
        <ExamensSidebar
          dossiers={dossiers}
          groupes={groupes}
          selectedGroupeIds={selectedGroupeIds}
          onToggle={toggleGroupe}
          onSelectAll={selectAll}
        />
      )}

      {/* Right content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Sub-header with count */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/5 shrink-0">
          <span className="text-xs font-semibold text-white/60">
            {isProf ? (profSubTab === "passed" ? "Examens passés" : "Examens à venir") : "Examens blancs"}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
            {displayExamens.length} examen{displayExamens.length !== 1 ? "s" : ""}
          </span>
          {!isProf && selectedGroupeIds.size > 0 && (
            <span className="text-[10px] px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>
              {selectedGroupeIds.size} classe{selectedGroupeIds.size > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-5">
          {!isProf && selectedGroupeIds.size === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                <GraduationCap size={26} style={{ color: "rgba(255,255,255,0.15)" }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Sélectionne une formation ou université</p>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>dans le menu à gauche pour voir ses examens blancs</p>
              </div>
            </div>
          ) : displayExamens.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Calendar size={40} className="mx-auto mb-3 opacity-30" />
              <p>{isProf ? (profSubTab === "passed" ? "Aucun examen passé" : "Aucun examen à venir") : "Aucun examen pour ces classes"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayExamens.map((e) => {
                const status = getStatus(e.debut_at, e.fin_at);
                const nbSeries = e.series?.length ?? 0;
                const targetGroupes = (e.groupe_ids ?? []).map(gid => groupeMap.get(gid)).filter(Boolean) as Groupe[];
                const examVisibilityPending = visibilityPendingKey === `exam:${e.id}`;
                const resultsVisibilityPending = visibilityPendingKey === `results:${e.id}`;

                const profSeries = isProf && profMatiereSet
                  ? (e.examen_series ?? []).filter(es => es.series?.matiere_id && profMatiereSet.has(es.series.matiere_id))
                  : (e.examen_series ?? []);

                return (
                  <div key={e.id} className="bg-white/5 border border-white/10 rounded-xl p-5 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/admin/examens/${e.id}`} className="text-sm font-semibold text-white hover:underline">
                            {e.name}
                          </Link>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>
                            {STATUS_LABELS[status]}
                          </span>
                          {!isProf && (
                            <>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.visible ? "bg-green-500/10 text-green-400" : "bg-white/10 text-white/45"}`}>
                                {e.visible ? "Visible aux élèves" : "Masqué aux élèves"}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.results_visible ? "bg-sky-500/10 text-sky-300" : "bg-white/10 text-white/45"}`}>
                                {e.results_visible ? "Résultats visibles" : "Résultats masqués"}
                              </span>
                            </>
                          )}
                        </div>
                        {e.description && (
                          <p className="text-xs text-white/50 mt-1">{e.description}</p>
                        )}
                        {!isProf && targetGroupes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {targetGroupes.map(g => (
                              <span key={g.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: g.color + "20", color: g.color, border: `1px solid ${g.color}30` }}>
                                <Users size={8} /> {g.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {new Date(e.debut_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(e.fin_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Layers size={11} />
                            {nbSeries} série{nbSeries !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* Prof: show their matières' séries with upload button */}
                        {isProf && profSeries.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Vos épreuves</p>
                            {profSeries.map(es => {
                              const serieName = getSerieDisplayName(es.series, matiereMap);
                              const isUploading = uploadingSerieId === es.series_id;
                              return (
                                <div key={es.series_id} className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2.5">
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: es.series?.matiere_id ? (matieres.find(m => m.id === es.series?.matiere_id)?.color ?? "#C9A84C") : "#C9A84C" }} />
                                  <span className="flex-1 text-xs font-medium text-white/70 truncate">{serieName}</span>

                                  {profSubTab === "upcoming" && (
                                    <div className="flex items-center gap-1.5 shrink-0" onClick={ev => ev.stopPropagation()}>
                                      {isUploading ? (
                                        <Loader2 size={13} className="animate-spin text-[#C9A84C]" />
                                      ) : (
                                        <label className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-all hover:bg-[#C9A84C]/20"
                                          style={{ backgroundColor: "rgba(201,168,76,0.1)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.2)" }}>
                                          <Upload size={10} />
                                          Déposer le sujet
                                          <input type="file" accept=".docx,.doc" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) handleProfUploadWord(es.series_id, f); ev.target.value = ""; }} />
                                        </label>
                                      )}
                                      <button
                                        onClick={() => window.open(`/api/export-serie?serieId=${es.series_id}&corrections=0`, "_blank")}
                                        className="p-1 rounded text-white/30 hover:text-white/60 transition-colors"
                                        title="Exporter le sujet"
                                      >
                                        <FileDown size={12} />
                                      </button>
                                    </div>
                                  )}

                                  {profSubTab === "passed" && (
                                    <Link
                                      href={`/admin/examens/${e.id}/resultats`}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all hover:bg-sky-500/20"
                                      style={{ backgroundColor: "rgba(56,189,248,0.1)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.2)" }}
                                    >
                                      <BarChart3 size={10} />
                                      Voir résultats
                                    </Link>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Prof: Generate grid button for upcoming exams */}
                        {isProf && profSubTab === "upcoming" && (e.examen_series?.length ?? 0) > 0 && (
                          <div className="mt-3" onClick={ev => ev.stopPropagation()}>
                            <button
                              onClick={() => {
                                const totalQ = (e.examen_series ?? []).reduce((sum, es) => {
                                  return sum + (es.series as any)?.questions_count || 0;
                                }, 0);
                                const nb = totalQ > 0 ? totalQ : 30;
                                const input = prompt(`Nombre de questions pour la grille (défaut: ${nb}) :`, String(nb));
                                if (input === null) return;
                                const n = parseInt(input, 10);
                                if (isNaN(n) || n < 1) return;
                                handleGenerateGrid(e, n);
                              }}
                              disabled={generatingGridExamId === e.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                              style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.2)" }}
                            >
                              {generatingGridExamId === e.id ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
                              Générer la grille d&apos;examen (PDF)
                            </button>
                          </div>
                        )}

                        {/* Admin: Serie pills */}
                        {!isProf && (e.examen_series?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {e.examen_series!.map((es) => (
                              <span key={es.series_id} className="inline-flex items-center px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-xs text-white/60">
                                {getSerieDisplayName(es.series, matiereMap)}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Planning des épreuves */}
                        {(e.examen_series ?? []).some(es => es.debut_at) && (
                          <div className="mt-3 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1.5 flex items-center gap-1"><Calendar size={9} /> Planning</p>
                            <div className="space-y-1">
                              {(isProf ? profSeries : e.examen_series!).filter(es => es.debut_at).sort((a, b) => new Date(a.debut_at!).getTime() - new Date(b.debut_at!).getTime()).map(es => (
                                <div key={es.series_id} className="flex items-center gap-2 text-[10px]">
                                  <span className="text-white/30 w-28 shrink-0">
                                    {new Date(es.debut_at!).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                    {" · "}
                                    {new Date(es.debut_at!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                    {es.fin_at && <>–{new Date(es.fin_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</>}
                                  </span>
                                  <span className="text-white/60 font-medium truncate">{getSerieDisplayName(es.series, matiereMap)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!isProf && (
                          <div
                            className="mt-3 grid gap-2 md:grid-cols-2"
                            onClick={(ev) => ev.preventDefault()}
                          >
                            <VisibilityControlCard
                              title="Examen visible aux élèves"
                              description="Affiche l'examen et ses séries dans l'espace élève."
                              enabled={e.visible}
                              enabledLabel="Visible"
                              disabledLabel="Masqué"
                              colorClassName={e.visible ? "bg-green-500" : "bg-white/15"}
                              pending={examVisibilityPending}
                              onToggle={() => handleToggleExamVisibility(e)}
                            />
                            <VisibilityControlCard
                              title="Résultats / classement visibles"
                              description={e.visible
                                ? "Affiche la note et le classement aux élèves."
                                : "Sans effet tant que l'examen reste masqué côté élève."}
                              enabled={e.results_visible}
                              enabledLabel="Affichés"
                              disabledLabel="Masqués"
                              colorClassName={e.results_visible ? "bg-sky-500" : "bg-white/15"}
                              pending={resultsVisibilityPending}
                              onToggle={() => handleToggleResults(e)}
                            />
                          </div>
                        )}
                      </div>
                      {!isProf && (
                        <div className="flex gap-1 shrink-0" onClick={(ev) => ev.preventDefault()}>
                          <button
                            onClick={(ev) => { ev.preventDefault(); setModal({ type: "edit", examen: e }); }}
                            className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={(ev) => { ev.preventDefault(); handleDeleteExamen(e.id); }}
                            className="p-2 hover:bg-red-500/20 rounded-lg text-white/50 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals — admin only */}
      {!isProf && modal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-[#0e1e35] border border-white/15 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {(modal.type === "create" || modal.type === "edit") && (
              <ExamenForm
                examen={modal.type === "edit" ? modal.examen : undefined}
                selectedGroupeIds={selectedGroupeIds}
                groupes={groupes}
                groupeMap={groupeMap}
                onSubmit={(data, groupeIds) => {
                  startTransition(async () => {
                    if (modal.type === "edit") {
                      const res = await updateExamen(modal.examen.id, data);
                      if ("error" in res) { showToast(res.error!, "error"); return; }
                      const groupesRes = await setExamenGroupes(modal.examen.id, groupeIds);
                      if ("error" in groupesRes) { showToast(groupesRes.error!, "error"); return; }

                      if (res.examen) {
                        setExamens((prev) =>
                          orderExamens(
                            prev.map((e) =>
                              e.id === modal.examen.id
                                ? {
                                    ...e,
                                    ...res.examen,
                                    groupe_ids: groupeIds,
                                  }
                                : e
                            )
                          )
                        );
                      } else {
                        await refreshExamens();
                      }
                    } else {
                      const res = await createExamen(data);
                      if ("error" in res) { showToast(res.error!, "error"); return; }
                      if (res.id) {
                        const groupesRes = await setExamenGroupes(res.id, groupeIds);
                        if ("error" in groupesRes) { showToast(groupesRes.error!, "error"); return; }
                      }

                      if (res.examen) {
                        setExamens((prev) =>
                          orderExamens([
                            {
                              ...res.examen,
                              series: [],
                              examen_series: [],
                              groupe_ids: groupeIds,
                            },
                            ...prev,
                          ])
                        );
                      } else {
                        await refreshExamens();
                      }
                    }
                    setModal(null);
                    router.refresh();
                    showToast(modal.type === "create" ? "Examen créé" : "Examen modifié", "success");
                  });
                }}
                onClose={() => setModal(null)}
                isPending={isPending}
              />
            )}
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}

function VisibilityControlCard({
  title,
  description,
  enabled,
  enabledLabel,
  disabledLabel,
  colorClassName,
  pending,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
  colorClassName: string;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white/85">{title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-white/35">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          className="shrink-0 rounded-full p-1 hover:bg-white/5 transition-colors disabled:opacity-60"
        >
          <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${colorClassName}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : ""}`} />
          </div>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold">
        {pending ? (
          <>
            <Loader2 size={10} className="animate-spin text-white/35" />
            <span className="text-white/35">Mise à jour…</span>
          </>
        ) : (
          <>
            {enabled ? (
              <Eye size={10} className="text-white/45" />
            ) : (
              <EyeOff size={10} className="text-white/35" />
            )}
            <span className={enabled ? "text-white/70" : "text-white/35"}>
              {enabled ? enabledLabel : disabledLabel}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Examens Sidebar with Checkboxes ────────────────────────────────────

function ExamensSidebar({ dossiers, groupes, selectedGroupeIds, onToggle, onSelectAll }: {
  dossiers: Dossier[]; groupes: Groupe[];
  selectedGroupeIds: Set<string>; onToggle: (id: string) => void; onSelectAll: () => void;
}) {
  const offers = useMemo(() => dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const universities = useMemo(() => dossiers.filter(d => d.dossier_type === "university").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const unisByOffer = useMemo(() => {
    const m = new Map<string, Dossier[]>();
    for (const u of universities) if (u.parent_id) { if (!m.has(u.parent_id)) m.set(u.parent_id, []); m.get(u.parent_id)!.push(u); }
    return m;
  }, [universities]);
  const groupsByUni = useMemo(() => {
    const m = new Map<string, Groupe[]>();
    for (const g of groupes) if (g.formation_dossier_id) { if (!m.has(g.formation_dossier_id)) m.set(g.formation_dossier_id, []); m.get(g.formation_dossier_id)!.push(g); }
    return m;
  }, [groupes]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(offers.map(o => o.id)));
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const getUniGroupIds = (uniId: string) => (groupsByUni.get(uniId) ?? []).map(g => g.id);
  const getOfferGroupIds = (offerId: string) => { const ids: string[] = []; for (const u of (unisByOffer.get(offerId) ?? [])) ids.push(...getUniGroupIds(u.id)); return ids; };

  const Chk = ({ checked, partial }: { checked: boolean; partial?: boolean }) => (
    <div className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0" style={{
      borderColor: checked || partial ? "#C9A84C" : "rgba(255,255,255,0.2)",
      backgroundColor: checked ? "#C9A84C" : "transparent",
    }}>
      {checked && <Check size={9} style={{ color: "#0e1e35" }} strokeWidth={3} />}
      {!checked && partial && <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: "#C9A84C" }} />}
    </div>
  );

  return (
    <div className="flex flex-col shrink-0 border-r border-white/10 overflow-y-auto h-full" style={{ width: 260, backgroundColor: "rgba(0,0,0,0.15)" }}>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
          Formations &amp; Classes
        </p>
      </div>

      {/* Tree with checkboxes */}
      <div className="px-3 pb-2 space-y-0.5 flex-1">
        {offers.map(offer => {
          const offerUnis = unisByOffer.get(offer.id) ?? [];
          const offerIds = getOfferGroupIds(offer.id);
          const allChecked = offerIds.length > 0 && offerIds.every(id => selectedGroupeIds.has(id));
          const someChecked = offerIds.some(id => selectedGroupeIds.has(id));
          const isOpen = expanded.has(offer.id);

          return (
            <div key={offer.id}>
              <div className="flex items-center gap-1">
                <button onClick={() => { const next = new Set(selectedGroupeIds); if (allChecked) for (const id of offerIds) next.delete(id); else for (const id of offerIds) next.add(id); onSelectAll(); setTimeout(() => { for (const id of (allChecked ? [] : [...next])) onToggle(id); }, 0); }}
                  className="p-1 shrink-0"><Chk checked={allChecked} partial={!allChecked && someChecked} /></button>
                <button onClick={() => { toggleExpand(offer.id); const next = new Set(selectedGroupeIds); if (allChecked) { for (const id of offerIds) next.delete(id); } else { for (const id of offerIds) next.add(id); } for (const id of offerIds) { if (next.has(id) !== selectedGroupeIds.has(id)) onToggle(id); } }}
                  className="flex-1 flex items-center gap-1.5 px-1 py-1.5 rounded-lg transition-all text-left"
                  onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")} onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                  <GraduationCap size={11} style={{ color: "#C9A84C" }} />
                  <span className="flex-1 text-[11px] font-bold truncate" style={{ color: "#C9A84C" }}>{offer.name}</span>
                  <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.2)", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                </button>
              </div>

              {isOpen && offerUnis.map(uni => {
                const uniGroups = groupsByUni.get(uni.id) ?? [];
                const uniIds = getUniGroupIds(uni.id);
                const uAll = uniIds.length > 0 && uniIds.every(id => selectedGroupeIds.has(id));
                const uSome = uniIds.some(id => selectedGroupeIds.has(id));
                const isUniOpen = expanded.has(uni.id);

                return (
                  <div key={uni.id} className="ml-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { const next = new Set(selectedGroupeIds); if (uAll) for (const id of uniIds) next.delete(id); else for (const id of uniIds) next.add(id); onSelectAll(); setTimeout(() => { for (const id of [...next]) onToggle(id); }, 0); }}
                        className="p-1 shrink-0"><Chk checked={uAll} partial={!uAll && uSome} /></button>
                      <button onClick={() => { toggleExpand(uni.id); for (const id of uniIds) { const shouldAdd = !uAll; if (shouldAdd !== selectedGroupeIds.has(id)) onToggle(id); } }}
                        className="flex-1 flex items-center gap-1 pl-1 pr-2 py-1 rounded-lg text-left transition-all"
                        onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")} onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                        <Building2 size={9} style={{ color: "#A78BFA" }} />
                        <span className="flex-1 text-[10px] font-semibold truncate" style={{ color: "#A78BFA" }}>{uni.name}</span>
                        {uniGroups.length > 0 && <ChevronDown size={9} style={{ color: "rgba(255,255,255,0.15)", transform: isUniOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />}
                      </button>
                    </div>

                    {isUniOpen && uniGroups.map(g => {
                      const isChecked = selectedGroupeIds.has(g.id);
                      return (
                        <button key={g.id} onClick={() => onToggle(g.id)}
                          className="w-full flex items-center gap-2 pl-6 pr-2 py-1 rounded-lg transition-all text-left"
                          style={{ backgroundColor: isChecked ? "rgba(201,168,76,0.08)" : "transparent" }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = isChecked ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.04)")}
                          onMouseOut={e => (e.currentTarget.style.backgroundColor = isChecked ? "rgba(201,168,76,0.08)" : "transparent")}>
                          <Chk checked={isChecked} />
                          <span className="w-3 h-3 rounded flex items-center justify-center text-[7px] font-bold text-white shrink-0" style={{ backgroundColor: g.color }}>{g.name[0]?.toUpperCase()}</span>
                          <span className="text-[10px] font-medium truncate" style={{ color: isChecked ? "#E3C286" : "rgba(255,255,255,0.6)" }}>{g.name}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="h-4" />
    </div>
  );
}

// =============================================
// EXAMEN FORM (with groupe targeting)
// =============================================

function ExamenForm({
  examen,
  selectedGroupeIds: sidebarGroupeIds,
  groupes,
  groupeMap,
  onSubmit,
  onClose,
  isPending,
}: {
  examen?: ExamenWithSeries;
  selectedGroupeIds: Set<string>;
  groupes: Groupe[];
  groupeMap: Map<string, Groupe>;
  onSubmit: (data: any, groupeIds: string[]) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const toDatetimeLocal = (iso?: string) => {
    if (!iso) return "";
    return new Date(iso).toISOString().slice(0, 16);
  };

  const [name, setName] = useState(examen?.name ?? "");
  const [description, setDescription] = useState(examen?.description ?? "");
  const [debutAt, setDebutAt] = useState(toDatetimeLocal(examen?.debut_at));
  const [finAt, setFinAt] = useState(toDatetimeLocal(examen?.fin_at));
  const [visible, setVisible] = useState(examen?.visible ?? true);
  const [resultsVisible, setResultsVisible] = useState(examen?.results_visible ?? false);
  const [notationSur, setNotationSur] = useState(examen?.notation_sur ?? 20);

  // For edit: use existing groupe_ids; for create: use sidebar selection
  const [formGroupeIds, setFormGroupeIds] = useState<Set<string>>(
    new Set(examen ? (examen.groupe_ids ?? []) : [...sidebarGroupeIds])
  );

  const toggleFormGroupe = (id: string) => setFormGroupeIds(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">
          {examen ? "Modifier l'examen" : "Nouvel examen"}
        </h2>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
      </div>

      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Nom *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Concours Blanc n°X — Faculté"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
        />
      </div>

      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Date de début *</label>
          <input
            type="datetime-local"
            value={debutAt}
            onChange={(e) => setDebutAt(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Date de fin *</label>
          <input
            type="datetime-local"
            value={finAt}
            onChange={(e) => setFinAt(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Notation sur</label>
        <input
          type="number"
          min={1}
          max={100}
          value={notationSur}
          onChange={(e) => setNotationSur(Number(e.target.value))}
          className="w-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/30"
        />
      </div>

      {/* Classes cibles */}
      <div>
        <label className="text-xs text-white/50 mb-2 block flex items-center gap-1.5">
          <Users size={11} /> Classes cibles ({formGroupeIds.size})
        </label>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {groupes.filter(g => sidebarGroupeIds.has(g.id) || (examen?.groupe_ids ?? []).includes(g.id)).map(g => {
            const isSelected = formGroupeIds.has(g.id);
            return (
              <button key={g.id} onClick={() => toggleFormGroupe(g.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: isSelected ? g.color + "25" : "rgba(255,255,255,0.05)",
                  color: isSelected ? g.color : "rgba(255,255,255,0.4)",
                  border: isSelected ? `1px solid ${g.color}40` : "1px solid rgba(255,255,255,0.1)",
                }}>
                <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: g.color }} />
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => setVisible(!visible)}
            className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${visible ? "bg-[#C9A84C]" : "bg-white/15"}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${visible ? "translate-x-4" : ""}`} />
          </div>
          <span className="text-sm text-white/70">Visible par les élèves</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => setResultsVisible(!resultsVisible)}
            className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${resultsVisible ? "bg-green-500" : "bg-white/15"}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${resultsVisible ? "translate-x-4" : ""}`} />
          </div>
          <span className="text-sm text-white/70">Résultats visibles</span>
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
          Annuler
        </button>
        <button
          onClick={() => onSubmit({
            name: name.trim(),
            description: description.trim() || undefined,
            debut_at: new Date(debutAt).toISOString(),
            fin_at: new Date(finAt).toISOString(),
            visible,
            results_visible: resultsVisible,
            notation_sur: notationSur,
          }, [...formGroupeIds])}
          disabled={isPending || !name.trim() || !debutAt || !finAt || formGroupeIds.size === 0}
          className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0e1e35] text-sm font-semibold rounded-lg hover:bg-[#A8892E] disabled:opacity-50 transition-colors"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {examen ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </div>
  );
}

// ComposeModal removed — editing now done on /admin/examens/[examenId]
