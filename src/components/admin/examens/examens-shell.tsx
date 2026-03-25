"use client";

import { useState, useTransition } from "react";
import {
  Plus, Pencil, Trash2, X, Check, AlertCircle, Loader2,
  Calendar, Clock, Eye, EyeOff, ListPlus, ListMinus, Layers,
} from "lucide-react";
import type { Serie } from "@/types/database";
import {
  createExamen, updateExamen, deleteExamen,
  addSerieToExamen, removeSerieFromExamen,
} from "@/app/(admin)/admin/examens/actions";
import { createClient } from "@/lib/supabase/client";

export type ExamenWithSeries = {
  id: string;
  name: string;
  description: string | null;
  debut_at: string;
  fin_at: string;
  visible: boolean;
  created_at: string;
  series?: Serie[];
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
}: {
  initialExamens: ExamenWithSeries[];
  allSeries: Serie[];
}) {
  const [examens, setExamens] = useState<ExamenWithSeries[]>(initialExamens);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  // Compositeur state
  const [composeSeries, setComposeSeries] = useState<Serie[]>([]);

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const refreshExamens = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("examens")
      .select("*, examens_series(series_id, order_index, series:series(*))")
      .order("debut_at", { ascending: false });
    if (data) {
      setExamens(
        data.map((e: any) => ({
          ...e,
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
    setComposeSeries(examen.series ?? []);
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
      const res = await addSerieToExamen(examen.id, serie.id, composeSeries.length);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setComposeSeries((prev) => [...prev, serie]);
      showToast("Série ajoutée", "success");
    });
  };

  const handleRemoveSerie = (examen: ExamenWithSeries, serie: Serie) => {
    startTransition(async () => {
      const res = await removeSerieFromExamen(examen.id, serie.id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setComposeSeries((prev) => prev.filter((s) => s.id !== serie.id));
      showToast("Série retirée", "success");
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
        <button
          onClick={() => setModal({ type: "create" })}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C] text-[#0e1e35] text-sm font-semibold rounded-lg hover:bg-[#A8892E] transition-colors"
        >
          <Plus size={14} /> Nouvel examen
        </button>
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
                      </div>
                      {e.description && (
                        <p className="text-xs text-white/50 mt-1">{e.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          Début : {new Date(e.debut_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          Fin : {new Date(e.fin_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers size={11} />
                          {nbSeries} série{nbSeries !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
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
                allSeries={allSeries}
                composeSeries={composeSeries}
                onAdd={(s) => handleAddSerie(modal.examen, s)}
                onRemove={(s) => handleRemoveSerie(modal.examen, s)}
                onClose={() => { setModal(null); refreshExamens(); }}
                isPending={isPending}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// EXAMEN FORM
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
          placeholder="Nom de l'examen..."
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

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => setVisible(!visible)}
          className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${visible ? "bg-[#C9A84C]" : "bg-white/15"}`}
        >
          <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${visible ? "translate-x-4" : ""}`} />
        </div>
        <span className="text-sm text-white/70">Visible par les élèves</span>
      </label>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
          Annuler
        </button>
        <button
          onClick={() => onSubmit({ name: name.trim(), description: description.trim() || undefined, debut_at: new Date(debutAt).toISOString(), fin_at: new Date(finAt).toISOString(), visible })}
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
// COMPOSE MODAL
// =============================================

function ComposeModal({
  examen,
  allSeries,
  composeSeries,
  onAdd,
  onRemove,
  onClose,
  isPending,
}: {
  examen: ExamenWithSeries;
  allSeries: Serie[];
  composeSeries: Serie[];
  onAdd: (s: Serie) => void;
  onRemove: (s: Serie) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const inExamen = new Set(composeSeries.map((s) => s.id));
  const available = allSeries.filter((s) => !inExamen.has(s.id));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Séries — {examen.name}</h2>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-white/50 uppercase tracking-wider mb-3">Dans l'examen ({composeSeries.length})</p>
          <div className="space-y-2 max-h-80 overflow-auto pr-1">
            {composeSeries.length === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">Aucune série</p>
            ) : composeSeries.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="flex-1 text-xs text-white/80 line-clamp-1">{s.name}</p>
                <button
                  onClick={() => onRemove(s)}
                  disabled={isPending}
                  className="text-white/30 hover:text-red-400 transition-colors shrink-0"
                >
                  <ListMinus size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-white/50 uppercase tracking-wider mb-3">Disponibles ({available.length})</p>
          <div className="space-y-2 max-h-80 overflow-auto pr-1">
            {available.length === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">Tout est ajouté</p>
            ) : available.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="flex-1 text-xs text-white/80 line-clamp-1">{s.name}</p>
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
