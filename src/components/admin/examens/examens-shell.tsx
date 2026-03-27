"use client";

import { useState, useTransition, useMemo } from "react";
import {
  Plus, Pencil, Trash2, X, Check, AlertCircle, Loader2,
  Calendar, Clock, Eye, EyeOff, Layers,
  BarChart3, Settings2,
  GraduationCap, Building2, ChevronDown, Users,
} from "lucide-react";
import type { Serie, Filiere, Dossier, Groupe, Matiere } from "@/types/database";
import {
  createExamen, updateExamen, deleteExamen,
  toggleResultsVisibility,
  setExamenGroupes,
} from "@/app/(admin)/admin/examens/actions";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

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

export function ExamensShell({
  initialExamens,
  allSeries,
  filieres,
  dossiers,
  allDossiers,
  groupes,
  matieres,
}: {
  initialExamens: ExamenWithSeries[];
  allSeries: Serie[];
  filieres: Filiere[];
  dossiers: Dossier[];
  allDossiers: Dossier[];
  groupes: Groupe[];
  matieres: Matiere[];
}) {
  const [examens, setExamens] = useState<ExamenWithSeries[]>(initialExamens);
  const [seriesList, setSeriesList] = useState<Serie[]>(allSeries);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedGroupeIds, setSelectedGroupeIds] = useState<Set<string>>(new Set());

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

  // Get groupe names for display
  const groupeMap = useMemo(() => {
    const m = new Map<string, Groupe>();
    for (const g of groupes) m.set(g.id, g);
    return m;
  }, [groupes]);

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
      showToast("Examen supprimé", "success");
    });
  };

  const handleToggleResults = (examen: ExamenWithSeries) => {
    startTransition(async () => {
      const newVal = !examen.results_visible;
      const res = await toggleResultsVisibility(examen.id, newVal);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setExamens((prev) => prev.map((e) => e.id === examen.id ? { ...e, results_visible: newVal } : e));
      showToast(newVal ? "Résultats rendus visibles" : "Résultats masqués", "success");
    });
  };


  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
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

      {/* Sidebar */}
      <ExamensSidebar
        dossiers={dossiers}
        groupes={groupes}
        selectedGroupeIds={selectedGroupeIds}
        onToggle={toggleGroupe}
        onSelectAll={selectAll}
      />

      {/* Right content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-white">Examens blancs</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              {filteredExamens.length} examen{filteredExamens.length !== 1 ? "s" : ""}
            </span>
            {selectedGroupeIds.size > 0 && (
              <span className="text-[10px] px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>
                {selectedGroupeIds.size} classe{selectedGroupeIds.size > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/examens/coefficients"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white/70 text-xs font-medium rounded-lg hover:bg-white/15 transition-colors"
            >
              <Settings2 size={13} /> Coefficients
            </Link>
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
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-5">
          {filteredExamens.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Calendar size={40} className="mx-auto mb-3 opacity-30" />
              <p>{selectedGroupeIds.size > 0 ? "Aucun examen pour ces classes" : "Aucun examen créé"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExamens.map((e) => {
                const status = getStatus(e.debut_at, e.fin_at);
                const nbSeries = e.series?.length ?? 0;
                const targetGroupes = (e.groupe_ids ?? []).map(gid => groupeMap.get(gid)).filter(Boolean) as Groupe[];
                return (
                  <Link key={e.id} href={`/admin/examens/${e.id}`} className="block bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-white">{e.name}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>
                            {STATUS_LABELS[status]}
                          </span>
                          {!e.visible && <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/40">Masqué</span>}
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/30">
                            /{e.notation_sur ?? 20}
                          </span>
                        </div>
                        {e.description && (
                          <p className="text-xs text-white/50 mt-1">{e.description}</p>
                        )}
                        {/* Target groupes pills */}
                        {targetGroupes.length > 0 && (
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
                        {/* Serie pills with coefficients */}
                        {(e.examen_series?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {e.examen_series!.map((es) => (
                              <span key={es.series_id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-xs text-white/60">
                                {es.series?.name ?? "—"}
                                <span className="text-[10px] text-[#C9A84C] font-semibold">×{es.coefficient}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Planning des épreuves */}
                        {(e.examen_series ?? []).some(es => es.debut_at) && (
                          <div className="mt-3 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1.5 flex items-center gap-1"><Calendar size={9} /> Planning</p>
                            <div className="space-y-1">
                              {e.examen_series!.filter(es => es.debut_at).sort((a, b) => new Date(a.debut_at!).getTime() - new Date(b.debut_at!).getTime()).map(es => (
                                <div key={es.series_id} className="flex items-center gap-2 text-[10px]">
                                  <span className="text-white/30 w-28 shrink-0">
                                    {new Date(es.debut_at!).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                    {" · "}
                                    {new Date(es.debut_at!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                    {es.fin_at && <>–{new Date(es.fin_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</>}
                                  </span>
                                  <span className="text-white/60 font-medium truncate">{es.series?.name ?? "—"}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0" onClick={(ev) => ev.preventDefault()}>
                        <button
                          onClick={(ev) => { ev.preventDefault(); handleToggleResults(e); }}
                          className={`flex items-center gap-1 p-2 rounded-lg transition-colors text-xs ${
                            e.results_visible
                              ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                              : "bg-white/5 text-white/30 hover:text-white/50"
                          }`}
                          title={e.results_visible ? "Résultats visibles — cliquer pour masquer" : "Résultats masqués — cliquer pour afficher"}
                        >
                          {e.results_visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
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
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal && (
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
                      await setExamenGroupes(modal.examen.id, groupeIds);
                    } else {
                      const res = await createExamen(data);
                      if ("error" in res) { showToast(res.error!, "error"); return; }
                      if (res.id) await setExamenGroupes(res.id, groupeIds);
                    }
                    setModal(null);
                    await refreshExamens();
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

      {/* All */}
      <div className="px-3 pb-1">
        <button onClick={onSelectAll}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{ backgroundColor: selectedGroupeIds.size === 0 ? "rgba(201,168,76,0.15)" : "transparent", color: selectedGroupeIds.size === 0 ? "#E3C286" : "rgba(255,255,255,0.5)", border: selectedGroupeIds.size === 0 ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent" }}>
          <Layers size={12} />
          Tous les examens
        </button>
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
                <button onClick={() => toggleExpand(offer.id)} className="flex-1 flex items-center gap-1.5 px-1 py-1.5 rounded-lg transition-all text-left"
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
                      <button onClick={() => toggleExpand(uni.id)} className="flex-1 flex items-center gap-1 pl-1 pr-2 py-1 rounded-lg text-left transition-all"
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
          {groupes.map(g => {
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
