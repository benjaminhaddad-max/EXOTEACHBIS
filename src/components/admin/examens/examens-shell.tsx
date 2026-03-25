"use client";

import { useState, useTransition, useRef } from "react";
import {
  Plus, Pencil, Trash2, X, Check, AlertCircle, Loader2,
  Calendar, Clock, Eye, EyeOff, ListPlus, ListMinus, Layers,
  BarChart3, ChevronRight, Settings2, Upload, Download, FileText,
} from "lucide-react";
import type { Serie, Filiere, SerieType } from "@/types/database";
import {
  createExamen, updateExamen, deleteExamen,
  addSerieToExamen, removeSerieFromExamen,
  updateSerieCoefficient, toggleResultsVisibility,
} from "@/app/(admin)/admin/examens/actions";
import { createSerie } from "@/app/(admin)/admin/exercices/actions";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export type ExamenSerieWithCoeff = {
  series_id: string;
  order_index: number;
  coefficient: number;
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
};

type Modal =
  | { type: "create" }
  | { type: "edit"; examen: ExamenWithSeries }
  | { type: "compose"; examen: ExamenWithSeries }
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
}: {
  initialExamens: ExamenWithSeries[];
  allSeries: Serie[];
  filieres: Filiere[];
}) {
  const [examens, setExamens] = useState<ExamenWithSeries[]>(initialExamens);
  const [seriesList, setSeriesList] = useState<Serie[]>(allSeries);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const [composeSeries, setComposeSeries] = useState<ExamenSerieWithCoeff[]>([]);

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const refreshSeries = async () => {
    const supabase = createClient();
    const { data } = await supabase.from("series").select("*").eq("visible", true).order("name");
    if (data) setSeriesList(data as Serie[]);
  };

  const refreshExamens = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("examens")
      .select("*, examens_series(series_id, order_index, coefficient, series:series(*))")
      .order("debut_at", { ascending: false });
    if (data) {
      setExamens(
        data.map((e: any) => ({
          ...e,
          examen_series: (e.examens_series ?? [])
            .sort((a: any, b: any) => a.order_index - b.order_index),
          series: (e.examens_series ?? [])
            .sort((a: any, b: any) => a.order_index - b.order_index)
            .map((es: any) => es.series)
            .filter(Boolean),
          examens_series: undefined,
        }))
      );
    }
  };

  const openCompose = (examen: ExamenWithSeries) => {
    setComposeSeries(examen.examen_series ?? []);
    setModal({ type: "compose", examen });
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

  const handleAddSerie = (examen: ExamenWithSeries, serie: Serie) => {
    startTransition(async () => {
      const res = await addSerieToExamen(examen.id, serie.id, composeSeries.length, 1);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setComposeSeries((prev) => [...prev, { series_id: serie.id, order_index: prev.length, coefficient: 1, series: serie }]);
      showToast("Série ajoutée", "success");
    });
  };

  const handleRemoveSerie = (examen: ExamenWithSeries, serieId: string) => {
    startTransition(async () => {
      const res = await removeSerieFromExamen(examen.id, serieId);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setComposeSeries((prev) => prev.filter((s) => s.series_id !== serieId));
      showToast("Série retirée", "success");
    });
  };

  const handleCoeffChange = (examen: ExamenWithSeries, serieId: string, coeff: number) => {
    startTransition(async () => {
      const res = await updateSerieCoefficient(examen.id, serieId, coeff);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setComposeSeries((prev) =>
        prev.map((s) => s.series_id === serieId ? { ...s, coefficient: coeff } : s)
      );
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
    <div className="flex flex-col h-full min-h-0">
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

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <h1 className="text-xl font-semibold text-white">Examens blancs</h1>
          <p className="text-xs text-white/50 mt-0.5">{examens.length} examen{examens.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/examens/coefficients"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white/70 text-sm font-medium rounded-lg hover:bg-white/15 transition-colors"
          >
            <Settings2 size={14} /> Coefficients filières
          </Link>
          <button
            onClick={() => setModal({ type: "create" })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C] text-[#0e1e35] text-sm font-semibold rounded-lg hover:bg-[#A8892E] transition-colors"
          >
            <Plus size={14} /> Nouvel examen
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6">
        {examens.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
            <p>Aucun examen créé</p>
          </div>
        ) : (
          <div className="space-y-3">
            {examens.map((e) => {
              const status = getStatus(e.debut_at, e.fin_at);
              const nbSeries = e.series?.length ?? 0;
              return (
                <div key={e.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
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
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleResults(e)}
                        className={`flex items-center gap-1 p-2 rounded-lg transition-colors text-xs ${
                          e.results_visible
                            ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                            : "bg-white/5 text-white/30 hover:text-white/50"
                        }`}
                        title={e.results_visible ? "Résultats visibles — cliquer pour masquer" : "Résultats masqués — cliquer pour afficher"}
                      >
                        {e.results_visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <Link
                        href={`/admin/examens/${e.id}/resultats`}
                        className="flex items-center gap-1 p-2 hover:bg-[#C9A84C]/10 rounded-lg text-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors text-xs"
                      >
                        <BarChart3 size={13} />
                      </Link>
                      <button
                        onClick={() => openCompose(e)}
                        className="flex items-center gap-1 p-2 hover:bg-[#C9A84C]/10 rounded-lg text-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors text-xs"
                      >
                        <ListPlus size={13} /> Séries
                      </button>
                      <button
                        onClick={() => setModal({ type: "edit", examen: e })}
                        className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteExamen(e.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg text-white/50 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                onSubmit={(data) => {
                  startTransition(async () => {
                    const res = modal.type === "edit"
                      ? await updateExamen(modal.examen.id, data)
                      : await createExamen(data);
                    if ("error" in res) { showToast(res.error!, "error"); return; }
                    setModal(null);
                    await refreshExamens();
                    showToast(modal.type === "create" ? "Examen créé" : "Examen modifié", "success");
                  });
                }}
                onClose={() => setModal(null)}
                isPending={isPending}
              />
            )}
            {modal.type === "compose" && (
              <ComposeModal
                examen={modal.examen}
                allSeries={seriesList}
                composeSeries={composeSeries}
                onAdd={(s) => handleAddSerie(modal.examen, s)}
                onRemove={(id) => handleRemoveSerie(modal.examen, id)}
                onCoeffChange={(serieId, coeff) => handleCoeffChange(modal.examen, serieId, coeff)}
                onSerieCreated={async (newSerie) => {
                  await refreshSeries();
                  handleAddSerie(modal.examen, newSerie);
                }}
                onClose={() => { setModal(null); refreshExamens(); }}
                isPending={isPending}
                showToast={showToast}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// EXAMEN FORM (with notation_sur + results_visible)
// =============================================

function ExamenForm({
  examen,
  onSubmit,
  onClose,
  isPending,
}: {
  examen?: ExamenWithSeries;
  onSubmit: (data: any) => void;
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
          })}
          disabled={isPending || !name.trim() || !debutAt || !finAt}
          className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0e1e35] text-sm font-semibold rounded-lg hover:bg-[#A8892E] disabled:opacity-50 transition-colors"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {examen ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </div>
  );
}

// =============================================
// COMPOSE MODAL (with coefficients + create + import/export)
// =============================================

const SERIE_TYPES: { value: SerieType; label: string }[] = [
  { value: "concours_blanc", label: "Concours blanc" },
  { value: "revision", label: "Révision" },
  { value: "annales", label: "Annales" },
  { value: "entrainement", label: "Entraînement" },
  { value: "qcm_supplementaires", label: "QCM supplémentaires" },
];

function ComposeModal({
  examen,
  allSeries,
  composeSeries,
  onAdd,
  onRemove,
  onCoeffChange,
  onSerieCreated,
  onClose,
  isPending,
  showToast,
}: {
  examen: ExamenWithSeries;
  allSeries: Serie[];
  composeSeries: ExamenSerieWithCoeff[];
  onAdd: (s: Serie) => void;
  onRemove: (serieId: string) => void;
  onCoeffChange: (serieId: string, coeff: number) => void;
  onSerieCreated: (s: Serie) => void;
  onClose: () => void;
  isPending: boolean;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const inExamen = new Set(composeSeries.map((s) => s.series_id));
  const available = allSeries.filter((s) => !inExamen.has(s.id));
  const [search, setSearch] = useState("");
  const filtered = available.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<SerieType>("concours_blanc");
  const [creating, setCreating] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importName, setImportName] = useState("");
  const [showImport, setShowImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateSerie = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await createSerie({
        name: newName.trim(),
        type: newType,
        timed: false,
        score_definitif: false,
        visible: true,
      });
      if ("error" in res) {
        showToast(res.error!, "error");
        return;
      }
      const newSerie: Serie = {
        id: res.id!,
        name: newName.trim(),
        type: newType,
        description: null,
        cours_id: null,
        matiere_id: null,
        timed: false,
        duration_minutes: null,
        score_definitif: false,
        visible: true,
        annee: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onSerieCreated(newSerie);
      setNewName("");
      setShowCreate(false);
      showToast("Série créée et ajoutée", "success");
    } finally {
      setCreating(false);
    }
  };

  const handleImportWord = async (file: File) => {
    if (!importName.trim()) {
      showToast("Donnez un nom à la série", "error");
      return;
    }
    setImporting(true);
    try {
      const res = await createSerie({
        name: importName.trim(),
        type: "concours_blanc",
        timed: false,
        score_definitif: false,
        visible: true,
      });
      if ("error" in res) {
        showToast(res.error!, "error");
        return;
      }
      const serieId = res.id!;
      const formData = new FormData();
      formData.append("serieId", serieId);
      formData.append("file", file);
      const importRes = await fetch("/api/import-serie", { method: "POST", body: formData });
      const importData = await importRes.json();
      if (!importRes.ok || importData.error) {
        showToast(importData.error || "Erreur d'import", "error");
        return;
      }
      const newSerie: Serie = {
        id: serieId,
        name: importName.trim(),
        type: "concours_blanc",
        description: null,
        cours_id: null,
        matiere_id: null,
        timed: false,
        duration_minutes: null,
        score_definitif: false,
        visible: true,
        annee: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onSerieCreated(newSerie);
      setImportName("");
      setShowImport(false);
      showToast(importData.message || "Série importée et ajoutée", "success");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const exportSerie = (serieId: string, corrections: boolean) => {
    window.open(`/api/export-serie?serieId=${serieId}&corrections=${corrections ? "1" : "0"}`, "_blank");
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Séries & Coefficients — {examen.name}</h2>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
      </div>

      {/* Actions : créer ou importer */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowCreate(!showCreate); setShowImport(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showCreate ? "bg-[#C9A84C] text-[#0e1e35]" : "bg-white/10 text-white/70 hover:bg-white/15"
          }`}
        >
          <Plus size={13} /> Nouvelle série
        </button>
        <button
          onClick={() => { setShowImport(!showImport); setShowCreate(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showImport ? "bg-[#C9A84C] text-[#0e1e35]" : "bg-white/10 text-white/70 hover:bg-white/15"
          }`}
        >
          <Upload size={13} /> Importer Word
        </button>
      </div>

      {/* Formulaire de création */}
      {showCreate && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <p className="text-xs text-white/50 font-medium">Créer une nouvelle série</p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom de la série…"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            onKeyDown={(e) => e.key === "Enter" && handleCreateSerie()}
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as SerieType)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/30"
          >
            {SERIE_TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-[#0e1e35]">{t.label}</option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleCreateSerie}
              disabled={creating || !newName.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C] text-[#0e1e35] text-xs font-semibold rounded-lg hover:bg-[#A8892E] disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Créer & ajouter
            </button>
          </div>
        </div>
      )}

      {/* Formulaire d'import Word */}
      {showImport && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <p className="text-xs text-white/50 font-medium">Importer depuis un fichier Word (.docx)</p>
          <input
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            placeholder="Nom de la série…"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.doc"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportWord(f);
            }}
            className="w-full text-xs text-white/60 file:mr-3 file:py-1.5 file:px-3 file:bg-white/10 file:border-0 file:text-xs file:text-white/70 file:rounded-lg file:cursor-pointer hover:file:bg-white/20"
          />
          {importing && (
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Loader2 size={12} className="animate-spin" /> Import en cours…
            </div>
          )}
          <button
            onClick={() => setShowImport(false)}
            className="px-3 py-1.5 text-xs text-white/50 hover:text-white transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* In exam */}
        <div>
          <p className="text-xs text-white/50 uppercase tracking-wider mb-3">
            Dans l&apos;examen ({composeSeries.length})
          </p>
          <div className="space-y-2 max-h-96 overflow-auto pr-1">
            {composeSeries.length === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">Aucune série</p>
            ) : composeSeries.map((es) => (
              <div key={es.series_id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="flex-1 text-xs text-white/80 line-clamp-1">{es.series?.name ?? "?"}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-white/40">Coeff.</span>
                  <input
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={es.coefficient}
                    onChange={(e) => onCoeffChange(es.series_id, Number(e.target.value) || 1)}
                    className="w-14 px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-xs text-[#C9A84C] text-center focus:outline-none focus:border-[#C9A84C]/50"
                  />
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button
                    onClick={() => exportSerie(es.series_id, false)}
                    title="Export sujet"
                    className="p-1 text-white/20 hover:text-white/60 transition-colors"
                  >
                    <FileText size={11} />
                  </button>
                  <button
                    onClick={() => exportSerie(es.series_id, true)}
                    title="Export correction"
                    className="p-1 text-white/20 hover:text-green-400/60 transition-colors"
                  >
                    <Download size={11} />
                  </button>
                </div>
                <button
                  onClick={() => onRemove(es.series_id)}
                  disabled={isPending}
                  className="text-white/30 hover:text-red-400 transition-colors shrink-0"
                >
                  <ListMinus size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Available */}
        <div>
          <p className="text-xs text-white/50 uppercase tracking-wider mb-3">Disponibles ({available.length})</p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer…"
            className="w-full mb-2 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />
          <div className="space-y-2 max-h-80 overflow-auto pr-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">Aucune série disponible</p>
            ) : filtered.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="flex-1 text-xs text-white/80 line-clamp-1">{s.name}</p>
                <div className="flex gap-0.5 shrink-0">
                  <button
                    onClick={() => exportSerie(s.id, false)}
                    title="Export sujet"
                    className="p-1 text-white/20 hover:text-white/60 transition-colors"
                  >
                    <FileText size={11} />
                  </button>
                  <button
                    onClick={() => exportSerie(s.id, true)}
                    title="Export correction"
                    className="p-1 text-white/20 hover:text-green-400/60 transition-colors"
                  >
                    <Download size={11} />
                  </button>
                </div>
                <button
                  onClick={() => onAdd(s)}
                  disabled={isPending}
                  className="text-white/30 hover:text-green-400 transition-colors shrink-0"
                >
                  <ListPlus size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button onClick={onClose} className="px-4 py-2 bg-[#C9A84C] text-[#0e1e35] text-sm font-semibold rounded-lg hover:bg-[#A8892E] transition-colors">
          Fermer
        </button>
      </div>
    </div>
  );
}
