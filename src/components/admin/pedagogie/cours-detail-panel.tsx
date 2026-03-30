"use client";

import { useState, useEffect, useTransition, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft, Plus, Pencil, Trash2, GripVertical,
  Check, AlertCircle, Loader2, Layers, BookOpen, ChevronRight, Sparkles, X, Zap, FileText,
  Image as ImageIcon, ChevronDown, Upload, ExternalLink, Download, RefreshCw, Filter,
} from "lucide-react";
import { ImportExoteachModal } from "./import-exoteach-modal";
import type { Cours } from "@/types/database";
import { PdfViewer } from "@/components/cours/pdf-viewer";
import { MathText } from "@/components/ui/math-text";
import { uploadImage } from "@/lib/upload-image";
import {
  createQuestion, updateQuestion, deleteQuestion,
  createSerie, updateSerie, deleteSerie,
  addQuestionToSerie, removeQuestionFromSerie,
  toggleSerieVisible,
} from "@/app/(admin)/admin/exercices/actions";
import {
  getSeriesForCours, getQuestionsForCours,
  getSerieQuestions, getBankQuestionsForSerie,
  getCoursForMatiere, updateQuestionCoursId, getSiblingCours,
} from "@/app/(admin)/admin/pedagogie/actions";
import { createDeck, deleteDeck, createCard, deleteCard } from "@/app/(admin)/admin/flashcards/actions";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────

type QOption = { label: string; text: string; is_correct: boolean; justification: string; image_url?: string | null };

type QuestionFull = {
  id: string; text: string; type: string; difficulty: number;
  explanation: string | null; cours_id: string | null;
  options: (QOption & { id: string; order_index: number })[];
};

type SerieType = "entrainement" | "concours_blanc" | "revision" | "annales" | "qcm_supplementaires";

type SerieFull = {
  id: string; name: string; type: SerieType; timed: boolean;
  duration_minutes: number | null; score_definitif: boolean;
  visible: boolean; nb_questions: number; cours_id: string | null;
  matiere_id?: string | null;
};

const LABELS = ["A", "B", "C", "D", "E"] as const;
const DIFF_COLORS = ["", "text-green-400", "text-green-300", "text-yellow-400", "text-orange-400", "text-red-400"];
const TYPE_COLORS: Record<string, string> = {
  entrainement: "bg-blue-500/20 text-blue-300",
  concours_blanc: "bg-red-500/20 text-red-300",
  revision: "bg-purple-500/20 text-purple-300",
  annales: "bg-amber-500/20 text-amber-300",
  qcm_supplementaires: "bg-teal-500/20 text-teal-300",
};
const TYPE_LABELS: Record<string, string> = {
  entrainement: "Entraînement",
  concours_blanc: "Concours blanc",
  revision: "Révision",
  annales: "Annales corrigées",
  qcm_supplementaires: "QCM supplémentaires",
};

// ─── Question form modal ──────────────────────────────────────────────────

// ─── Image upload helper ──────────────────────────────────────────────────

function ImageUploadBtn({
  current, onUploaded, folder, label,
}: { current?: string | null; onUploaded: (url: string | null) => void; folder: string; label: string }) {
  const [uploading, setUploading] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadImage(file, folder);
    if ("error" in res) { alert(res.error); } else { onUploaded(res.url); }
    setUploading(false);
    e.target.value = "";
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {current && (
        <div className="relative group">
          <img src={current} alt="" className="h-16 rounded-lg border border-white/20 object-cover" />
          <button type="button" onClick={() => onUploaded(null)}
            className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <X size={10} className="text-white" />
          </button>
        </div>
      )}
      <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${uploading ? "border-[#C9A84C]/30 text-[#C9A84C]/50" : "border-white/15 text-white/40 hover:border-white/30 hover:text-white/70"}`}>
        {uploading ? <Loader2 size={11} className="animate-spin" /> : <ImageIcon size={11} />}
        {current ? "Changer" : label}
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
    </div>
  );
}

// ─── Question form modal ──────────────────────────────────────────────────

function QuestionModal({
  initial, coursId, onSave, onClose,
}: {
  initial?: QuestionFull; coursId: string;
  onSave: (data: any) => Promise<void>; onClose: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 2);
  const [imageUrl, setImageUrl] = useState<string | null>((initial as any)?.image_url ?? null);
  const [options, setOptions] = useState<QOption[]>(
    initial?.options?.sort((a, b) => a.order_index - b.order_index)
      .map((o) => ({ label: o.label, text: o.text, is_correct: o.is_correct, justification: (o as any).justification ?? "", image_url: (o as any).image_url ?? null }))
    ?? LABELS.map((l) => ({ label: l, text: "", is_correct: false, justification: "", image_url: null }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setOpt = (i: number, field: string, value: any) =>
    setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) { setError("Texte requis"); return; }
    setSaving(true);
    await onSave({ text, explanation, type: "qcm_multiple", difficulty, cours_id: coursId, matiere_id: null, image_url: imageUrl, options });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 p-6 shadow-2xl" style={{ backgroundColor: "#0e1e35" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">{initial ? "Modifier la question" : "Nouvelle question"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Énoncé */}
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Énoncé * <span className="normal-case font-normal text-white/25">(supporte $LaTeX$)</span></label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
              className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none resize-none"
              placeholder="Texte de la question... ($\alpha$, $$\frac{a}{b}$$)" />
            <div className="mt-2">
              <ImageUploadBtn current={imageUrl} onUploaded={setImageUrl} folder={`questions/${coursId}`} label="Ajouter un schéma à l'énoncé" />
            </div>
          </div>

          {/* Propositions */}
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Propositions A–E</label>
            <div className="space-y-3">
              {options.map((opt, i) => (
                <div key={opt.label} className={`rounded-xl border ${opt.is_correct ? "border-green-500/30 bg-green-500/8" : "border-white/10 bg-white/4"}`}>
                  <div className="flex items-start gap-2 px-3 pt-3 pb-2">
                    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${opt.is_correct ? "bg-green-500 text-white" : "bg-white/10 text-white/50"}`}>{opt.label}</span>
                    <input value={opt.text} onChange={(e) => setOpt(i, "text", e.target.value)}
                      className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                      placeholder={`Proposition ${opt.label}... (supporte $LaTeX$)`} />
                    <div className="flex gap-1.5 shrink-0">
                      <button type="button" onClick={() => setOpt(i, "is_correct", true)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${opt.is_correct ? "bg-green-500 border-green-500 text-white" : "border-white/20 text-white/40"}`}>V</button>
                      <button type="button" onClick={() => setOpt(i, "is_correct", false)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${!opt.is_correct ? "bg-red-500 border-red-500 text-white" : "border-white/20 text-white/40"}`}>F</button>
                    </div>
                  </div>
                  <div className="px-3 pb-3 space-y-2">
                    <input value={opt.justification} onChange={(e) => setOpt(i, "justification", e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/60 placeholder-white/20 focus:outline-none"
                      placeholder={`Justification ${opt.label}...`} />
                    <ImageUploadBtn
                      current={opt.image_url ?? null}
                      onUploaded={(url) => setOpt(i, "image_url", url)}
                      folder={`questions/${coursId}/options`}
                      label="Schéma pour cette proposition"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Difficulté */}
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Difficulté</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((d) => (
                <button key={d} type="button" onClick={() => setDifficulty(d)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${difficulty === d ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/10 text-white/40"}`}>{d}</button>
              ))}
            </div>
          </div>

          {/* Explication */}
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Explication (optionnelle)</label>
            <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2}
              className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none resize-none"
              placeholder="Explication générale..." />
          </div>

          {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm">Annuler</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-[#0e1e35] font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {initial ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Serie form modal ─────────────────────────────────────────────────────

function SerieModal({
  initial, coursId, onSave, onClose,
}: {
  initial?: SerieFull; coursId: string;
  onSave: (data: any) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<"concours_blanc" | "revision" | "annales" | "qcm_supplementaires">(initial?.type as any ?? "annales");
  const [timed, setTimed] = useState(initial?.timed ?? false);
  const [duration, setDuration] = useState(String(initial?.duration_minutes ?? 30));
  const [scoreDefinitif, setScoreDefinitif] = useState(initial?.score_definitif ?? false);
  const [visible, setVisible] = useState(initial?.visible ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ name, type, timed, duration_minutes: timed ? Number(duration) : null, score_definitif: scoreDefinitif, visible, cours_id: coursId, matiere_id: null });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl" style={{ backgroundColor: "#0e1e35" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">{initial ? "Modifier la série" : "Nouvelle série"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Nom *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none"
              placeholder="Nom de la série..." />
          </div>
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Type de série</label>
            <div className="grid grid-cols-2 gap-2">
              {(["annales", "qcm_supplementaires", "concours_blanc", "revision"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`py-2.5 px-3 rounded-lg text-[11px] font-bold border transition-colors text-left ${type === t ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-white/8">
            {[
              ["Chronométré", timed, (v: boolean) => setTimed(v)],
              ["Score définitif", scoreDefinitif, (v: boolean) => setScoreDefinitif(v)],
              ["Visible pour les élèves", visible, (v: boolean) => setVisible(v)],
            ].map(([label, val, set]: any) => (
              <label key={label} className="flex items-center justify-between py-2.5 cursor-pointer">
                <span className="text-sm text-white/70">{label}</span>
                <button type="button" onClick={() => set(!val)}
                  className={`w-10 h-5.5 rounded-full flex items-center px-0.5 transition-colors ${val ? "bg-[#C9A84C]" : "bg-white/15"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? "translate-x-[18px]" : ""}`} />
                </button>
              </label>
            ))}
            {timed && (
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-white/70">Durée (min)</span>
                <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={1}
                  className="w-20 bg-white/8 border border-white/12 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none" />
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm">Annuler</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-[#0e1e35] font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {initial ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Serie Editor Modal (questions + settings) ────────────────────────────

function SerieEditorModal({
  serie,
  coursId,
  allCourseQuestions,
  onClose,
  onSaved,
}: {
  serie: SerieFull;
  coursId: string;
  allCourseQuestions: QuestionFull[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(serie.name);
  const [type, setType] = useState<"concours_blanc" | "revision" | "annales" | "qcm_supplementaires">(
    serie.type === "entrainement" ? "revision" : serie.type as any
  );
  const [timed, setTimed] = useState(serie.timed);
  const [duration, setDuration] = useState(String(serie.duration_minutes ?? 30));
  const [scoreDefinitif, setScoreDefinitif] = useState(serie.score_definitif);
  const [visible, setVisible] = useState(serie.visible);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const [serieQuestions, setSerieQuestions] = useState<QuestionFull[]>([]);
  const [bankQuestions, setBankQuestions] = useState<{ id: string; text: string; difficulty: number; type: string }[]>([]);
  const [loadingQ, setLoadingQ] = useState(true);
  const [expandedQ, setExpandedQ] = useState<Set<string>>(new Set());
  const [editingQ, setEditingQ] = useState<QuestionFull | null>(null);
  const [creatingQ, setCreatingQ] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [matiereCours, setMatiereCours] = useState<{ id: string; name: string }[]>([]);
  const [assigningCours, setAssigningCours] = useState<string | null>(null);

  const isChapterAssignable = type === "annales" || type === "concours_blanc";

  const loadAll = useCallback(async () => {
    setLoadingQ(true);
    try {
      const [qs, bank] = await Promise.all([
        getSerieQuestions(serie.id),
        getBankQuestionsForSerie(coursId, serie.id),
      ]);
      setSerieQuestions(qs as any);
      setBankQuestions(bank as any);
    } catch (e) {
      console.error("[SerieEditorModal] exception:", e);
    } finally {
      setLoadingQ(false);
    }
  }, [serie.id, coursId]);

  useEffect(() => {
    if (!isChapterAssignable) return;
    if (serie.matiere_id) {
      getCoursForMatiere(serie.matiere_id).then(setMatiereCours);
    } else {
      getSiblingCours(coursId).then(setMatiereCours);
    }
  }, [isChapterAssignable, serie.matiere_id, coursId]);

  const handleAssignCours = async (questionId: string, newCoursId: string | null) => {
    setAssigningCours(questionId);
    await updateQuestionCoursId(questionId, newCoursId);
    setSerieQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, cours_id: newCoursId } : q))
    );
    setAssigningCours(null);
  };

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    await updateSerie(serie.id, {
      name, type, timed,
      duration_minutes: timed ? Number(duration) : null,
      score_definitif: scoreDefinitif, visible,
      cours_id: coursId, matiere_id: null,
    });
    setSavingSettings(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
    onSaved();
  };

  const handleRemove = async (qId: string) => {
    setRemoving(qId);
    await removeQuestionFromSerie(serie.id, qId);
    await loadAll();
    setRemoving(null);
  };

  const handleAdd = async (qId: string) => {
    setAdding(qId);
    await addQuestionToSerie(serie.id, qId, serieQuestions.length);
    await loadAll();
    setAdding(null);
  };

  const toggleQ = (id: string) =>
    setExpandedQ((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportMsg(null);
    try {
      const form = new FormData();
      form.append("serieId", serie.id);
      form.append("file", file);
      const res = await fetch("/api/import-serie", { method: "POST", body: form });
      const json = await res.json();
      if (json.success) {
        setImportMsg({ text: json.message, ok: true });
        await loadAll();
      } else {
        setImportMsg({ text: json.error ?? "Erreur import", ok: false });
      }
    } catch (err: any) {
      setImportMsg({ text: err.message ?? "Erreur", ok: false });
    } finally {
      setImporting(false);
      setTimeout(() => setImportMsg(null), 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/8 shrink-0">
          <div className="flex-1 min-w-0">
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="bg-transparent text-sm font-bold text-white placeholder-white/30 focus:outline-none w-full"
              placeholder="Nom de la série..." />
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[type]}`}>{TYPE_LABELS[type]}</span>
              <span className="text-[10px] text-white/30">{serieQuestions.length} question{serieQuestions.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          {/* Import Word */}
          <input ref={importRef} type="file" accept=".docx" className="hidden" onChange={handleImport} />
          <button onClick={() => importRef.current?.click()} disabled={importing}
            title="Importer un Word modifié pour mettre à jour la série"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40">
            {importing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Importer
          </button>

          {/* Export Word */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-colors">
              <Download size={12} /> Word
            </button>
            <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:flex flex-col w-44 rounded-xl border border-white/10 shadow-xl overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>
              <a href={`/api/export-serie?serieId=${serie.id}`} download
                className="flex items-center gap-2 px-3 py-2.5 text-xs text-white/70 hover:bg-white/8 hover:text-white transition-colors">
                <FileText size={12} /> Sujet (sans correction)
              </a>
              <a href={`/api/export-serie?serieId=${serie.id}&corrections=1`} download
                className="flex items-center gap-2 px-3 py-2.5 text-xs text-white/70 hover:bg-white/8 hover:text-white transition-colors">
                <Check size={12} /> Avec corrections
              </a>
            </div>
          </div>
          <button onClick={handleSaveSettings} disabled={savingSettings}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${savedMsg ? "bg-green-600 text-white" : "bg-[#C9A84C] text-[#0e1e35]"} disabled:opacity-50`}>
            {savingSettings ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {savedMsg ? "Enregistré !" : "Enregistrer"}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40"><X size={16} /></button>
        </div>

        {/* Import feedback */}
        {importMsg && (
          <div className={`px-5 py-2 text-xs font-medium flex items-center gap-2 ${importMsg.ok ? "bg-green-600/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
            {importMsg.ok ? <Check size={12} /> : <AlertCircle size={12} />}
            {importMsg.text}
          </div>
        )}

        {/* Body — left settings | right questions */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Settings ── */}
          <div className="w-52 shrink-0 border-r border-white/8 p-4 space-y-4 overflow-y-auto">
            <div>
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Type</p>
              <div className="space-y-1.5">
                {(["annales", "qcm_supplementaires", "concours_blanc", "revision"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`w-full py-2 px-3 rounded-lg text-[11px] font-semibold border text-left transition-colors ${type === t ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-white/8">
              {([
                ["Chronométré", timed, (v: boolean) => setTimed(v)],
                ["Score définitif", scoreDefinitif, (v: boolean) => setScoreDefinitif(v)],
                ["Visible élèves", visible, (v: boolean) => setVisible(v)],
              ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
                <label key={label} className="flex items-center justify-between py-2.5 cursor-pointer">
                  <span className="text-xs text-white/60">{label}</span>
                  <button type="button" onClick={() => set(!val)}
                    className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${val ? "bg-[#C9A84C]" : "bg-white/15"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? "translate-x-4" : ""}`} />
                  </button>
                </label>
              ))}
              {timed && (
                <div className="py-2.5">
                  <span className="text-xs text-white/60 block mb-1.5">Durée (min)</span>
                  <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={1}
                    className="w-full bg-white/8 border border-white/12 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none" />
                </div>
              )}
            </div>
          </div>

          {/* ── Questions ── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-3">
              Questions dans cette série ({serieQuestions.length})
            </p>

            {loadingQ ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={18} className="animate-spin text-white/30" />
              </div>
            ) : serieQuestions.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-white/8 p-6 text-center">
                <BookOpen size={18} className="mx-auto text-white/20 mb-2" />
                <p className="text-xs text-white/30">Aucune question — ajoutez-en depuis la banque ci-dessous</p>
              </div>
            ) : (
              serieQuestions.map((q, idx) => {
                const isOpen = expandedQ.has(q.id);
                const opts = (q.options ?? []).sort((a: any, b: any) => a.order_index - b.order_index);
                return (
                  <div key={q.id} className="rounded-xl border border-white/8 bg-white/4 overflow-hidden">
                    <div className="flex items-start gap-2.5 p-3 cursor-pointer hover:bg-white/4" onClick={() => toggleQ(q.id)}>
                      <span className="text-[10px] font-bold text-white/25 mt-0.5 shrink-0 w-4 text-center">{idx + 1}</span>
                      <ChevronRight size={13} className={`mt-0.5 text-white/40 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      <div className="flex-1 min-w-0">
                        <MathText text={q.text} className="text-xs text-white/80 leading-snug line-clamp-2" />
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {q.difficulty && <span className={`text-[10px] ${DIFF_COLORS[q.difficulty]}`}>★ {q.difficulty}</span>}
                          <span className="text-[10px] text-white/30">{opts.filter((o: any) => o.is_correct).length}V · {opts.filter((o: any) => !o.is_correct).length}F</span>
                          {isChapterAssignable && matiereCours.length > 0 && (
                            <select
                              value={q.cours_id ?? ""}
                              onChange={(e) => { e.stopPropagation(); handleAssignCours(q.id, e.target.value || null); }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={assigningCours === q.id}
                              className={`text-[10px] rounded-md border px-1.5 py-0.5 outline-none transition-colors cursor-pointer ${
                                q.cours_id
                                  ? "border-[#C9A84C]/40 bg-[#C9A84C]/10 text-[#C9A84C] font-semibold"
                                  : "border-white/15 bg-white/5 text-white/40"
                              } ${assigningCours === q.id ? "opacity-50" : ""}`}
                            >
                              <option value="" className="bg-[#0e1e35] text-white/50">— Chapitre —</option>
                              {matiereCours.map((c) => (
                                <option key={c.id} value={c.id} className="bg-[#0e1e35] text-white">{c.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setEditingQ(q)}
                          title="Modifier la question"
                          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleRemove(q.id)} disabled={removing === q.id}
                          title="Retirer de la série"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors disabled:opacity-40">
                          {removing === q.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-2 border-t border-white/8 space-y-1.5 bg-white/95 rounded-b-xl">
                        {(q as any).image_url && (
                          <div className="flex justify-center py-3 px-4 mb-2 bg-white rounded-xl border border-gray-100">
                            <img src={(q as any).image_url} alt="" className="max-h-52 object-contain" />
                          </div>
                        )}
                        {opts.map((opt: any) => (
                          <div key={opt.label} className={`text-xs px-3 py-2.5 rounded-lg flex items-start gap-2.5 ${opt.is_correct ? "bg-green-500 text-white" : "bg-red-50 text-gray-700 border border-red-100"}`}>
                            <span className={`font-bold shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${opt.is_correct ? "bg-white/20 text-white" : "bg-red-100 text-red-600"}`}>{opt.label}</span>
                            <div className="flex-1 min-w-0">
                              <MathText text={opt.text} className="font-medium" />
                              {opt.image_url && <img src={opt.image_url} alt="" className="mt-1 max-h-16 rounded" />}
                              {opt.justification && (
                                <p className={`text-[11px] mt-1 leading-snug ${opt.is_correct ? "text-white/80" : "text-gray-500"}`}>
                                  💡 {opt.justification}
                                </p>
                              )}
                            </div>
                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${opt.is_correct ? "bg-white/20 text-white" : "bg-red-100 text-red-600"}`}>
                              {opt.is_correct ? "VRAI" : "FAUX"}
                            </span>
                          </div>
                        ))}
                        {q.explanation && (
                          <p className="text-[11px] text-gray-500 italic pt-2 border-t border-gray-200 flex gap-1.5 items-start">
                            <span className="text-amber-500">💡</span>{q.explanation}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* ── Ajouter une question ── */}
            <div className="pt-3 border-t border-white/8 space-y-2">
              {/* Banque : questions du cours pas encore dans la série */}
              {bankQuestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                    Questions disponibles ({bankQuestions.length})
                  </p>
                  {bankQuestions.map((q) => (
                    <div key={q.id} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <MathText text={q.text} className="text-xs text-white/50 line-clamp-1" />
                      </div>
                      <button onClick={() => handleAdd(q.id)} disabled={adding === q.id}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#C9A84C]/20 text-[#C9A84C] text-[10px] font-bold hover:bg-[#C9A84C]/30 transition-colors disabled:opacity-40">
                        {adding === q.id ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                        Ajouter
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Créer une nouvelle question */}
              <button onClick={() => setCreatingQ(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-white/10 text-xs text-white/40 hover:text-white/70 hover:border-white/25 transition-colors">
                <Plus size={13} /> Créer une nouvelle question
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-modal: edit question */}
      {editingQ && (
        <QuestionModal
          initial={editingQ as any}
          coursId={coursId}
          onSave={async (data) => {
            const res = await updateQuestion(editingQ.id, data);
            if (!("error" in res)) { await loadAll(); setEditingQ(null); }
          }}
          onClose={() => setEditingQ(null)}
        />
      )}

      {/* Sub-modal: create question + add to serie */}
      {creatingQ && (
        <QuestionModal
          coursId={coursId}
          onSave={async (data) => {
            const res = await createQuestion(data);
            if (!("error" in res) && "id" in res) {
              await addQuestionToSerie(serie.id, res.id as string, serieQuestions.length);
              await loadAll();
            }
            setCreatingQ(false);
          }}
          onClose={() => setCreatingQ(false)}
        />
      )}
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

// ─── Inline AI Modal (chapter level) ─────────────────────────────────────

function ChapterAIModal({ cours, onSaved, onClose }: { cours: Cours; onSaved: () => void; onClose: () => void }) {
  const [topic, setTopic] = useState(cours.name);
  const [nb, setNb] = useState(5);
  const [diff, setDiff] = useState(3);
  const [step, setStep] = useState<"config" | "loading" | "preview" | "saving">("config");
  const [generated, setGenerated] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const diffLabel = ["", "Facile", "Moyen–", "Moyen", "Difficile", "Expert"][diff];

  const handleGenerate = async () => {
    setError(""); setStep("loading");
    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sujet: topic, nb_questions: nb, type: "qcm_multiple", difficulte: diff }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); setStep("config"); return; }
      setGenerated(json.questions ?? []);
      setStep("preview");
    } catch (e: any) { setError(e.message); setStep("config"); }
  };

  const handleSave = async () => {
    setStep("saving");
    const { batchCreateQuestions } = await import("@/app/(admin)/admin/exercices/actions");
    const questions = generated.map((q) => ({ ...q, cours_id: cours.id, type: "qcm_multiple" as const }));
    const res = await batchCreateQuestions(questions);
    setSavedMsg(`${res.created ?? generated.length} questions sauvegardées !`);
    setTimeout(() => { onSaved(); onClose(); }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[#C9A84C]" />
            <span className="text-sm font-bold text-white">IA — {cours.name}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === "config" && (
            <>
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">Sujet / thème</label>
                <input value={topic} onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">Questions</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={2} max={20} value={nb} onChange={(e) => setNb(Number(e.target.value))} className="flex-1 accent-[#C9A84C]" />
                    <span className="w-6 text-center text-sm font-bold text-[#C9A84C]">{nb}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">Difficulté</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={1} max={5} value={diff} onChange={(e) => setDiff(Number(e.target.value))} className="flex-1 accent-[#C9A84C]" />
                    <span className="w-16 text-right text-xs font-semibold text-[#C9A84C]">{diffLabel}</span>
                  </div>
                </div>
              </div>
              {error && <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400"><AlertCircle size={12} />{error}</div>}
              <button onClick={handleGenerate} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35] text-sm font-bold transition-colors">
                <Sparkles size={14} /> Générer {nb} questions
              </button>
            </>
          )}
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="animate-spin text-[#C9A84C]" />
              <p className="text-sm text-white/50">Claude génère {nb} questions pour ce chapitre...</p>
            </div>
          )}
          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/50">{generated.length} questions — vérifiez avant de sauvegarder</p>
                <button onClick={() => setStep("config")} className="text-xs text-white/30 hover:text-white/60">← Reconfigurer</button>
              </div>
              {generated.map((q, i) => (
                <div key={i} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                  <p className="text-xs text-white/80 leading-relaxed">{q.text}</p>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {q.options?.map((o: any) => (
                      <span key={o.label} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${o.is_correct ? "bg-green-500/20 text-green-400" : "bg-white/6 text-white/30"}`}>{o.label}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {step === "saving" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              {savedMsg ? (
                <><div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center"><Check size={18} className="text-green-400" /></div>
                <p className="text-sm font-semibold text-white">{savedMsg}</p></>
              ) : (
                <><Loader2 size={24} className="animate-spin text-[#C9A84C]" /><p className="text-sm text-white/50">Sauvegarde...</p></>
              )}
            </div>
          )}
        </div>
        {step === "preview" && (
          <div className="px-5 py-3 border-t border-white/8 shrink-0">
            <button onClick={handleSave} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold transition-colors">
              <Check size={14} /> Sauvegarder {generated.length} questions dans ce chapitre
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chapter Flashcards (sidebar) ──────────────────────────────────────────

type FlashDeck = { id: string; name: string; cours_id: string | null; visible: boolean; cards?: { id: string; front: string; back: string }[] };

function ChapterFlashcards({ coursId, coursName }: { coursId: string; coursName: string }) {
  const [decks, setDecks] = useState<FlashDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [addingCard, setAddingCard] = useState<string | null>(null);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");

  // AI generation
  const [showAI, setShowAI] = useState(false);
  const [aiTopic, setAiTopic] = useState(coursName);
  const [aiNb, setAiNb] = useState(10);
  const [aiStep, setAiStep] = useState<"config" | "loading" | "preview" | "saving">("config");
  const [aiCards, setAiCards] = useState<{ front: string; back: string }[]>([]);
  const [aiError, setAiError] = useState("");
  const [aiDeckName, setAiDeckName] = useState(`Flashcards — ${coursName}`);

  const supabase = createClient();

  const loadDecks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("flashcard_decks")
      .select("id, name, cours_id, visible")
      .eq("cours_id", coursId)
      .order("created_at", { ascending: false });
    setDecks((data as FlashDeck[]) ?? []);
    setLoading(false);
  }, [coursId]);

  useEffect(() => { loadDecks(); }, [loadDecks]);

  const loadCards = async (deckId: string) => {
    const { data } = await supabase
      .from("flashcards")
      .select("id, front, back")
      .eq("deck_id", deckId)
      .order("order_index");
    setDecks((prev) => prev.map((d) => d.id === deckId ? { ...d, cards: (data ?? []) as any } : d));
  };

  const toggle = (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const d = decks.find((x) => x.id === id);
    if (!d?.cards) loadCards(id);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createDeck({ name: newName.trim(), cours_id: coursId });
    setNewName(""); setShowCreate(false);
    loadDecks();
  };

  const handleDeleteDeck = async (id: string) => {
    if (!confirm("Supprimer ce deck ?")) return;
    await deleteDeck(id);
    loadDecks();
  };

  const handleAddCard = async (deckId: string) => {
    if (!cardFront.trim() || !cardBack.trim()) return;
    const deck = decks.find((d) => d.id === deckId);
    await createCard({ deck_id: deckId, front: cardFront.trim(), back: cardBack.trim(), order_index: deck?.cards?.length ?? 0 });
    setCardFront(""); setCardBack(""); setAddingCard(null);
    loadCards(deckId);
  };

  const handleDeleteCard = async (cardId: string, deckId: string) => {
    await deleteCard(cardId);
    loadCards(deckId);
  };

  // AI handlers
  const handleAIGenerate = async () => {
    setAiError(""); setAiStep("loading");
    try {
      const res = await fetch("/api/generate-flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sujet: aiTopic, nb_cards: aiNb }),
      });
      const json = await res.json();
      if (json.error) { setAiError(json.error); setAiStep("config"); return; }
      setAiCards(json.cards ?? []);
      setAiStep("preview");
    } catch (e: any) { setAiError(e.message); setAiStep("config"); }
  };

  const handleAISave = async () => {
    setAiStep("saving");
    const deckRes = await createDeck({ name: aiDeckName.trim() || `Flashcards — ${coursName}`, cours_id: coursId });
    const deckId = (deckRes as any)?.id;
    if (!deckId) { setAiError("Erreur création deck"); setAiStep("config"); return; }
    for (let i = 0; i < aiCards.length; i++) {
      await createCard({ deck_id: deckId, front: aiCards[i].front, back: aiCards[i].back, order_index: i });
    }
    setShowAI(false); setAiStep("config"); setAiCards([]);
    loadDecks();
  };

  const handleRemoveAICard = (idx: number) => {
    setAiCards((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <section className="space-y-3">
      {/* AI generation button */}
      <button onClick={() => { setShowAI(true); setAiTopic(coursName); setAiDeckName(`Flashcards — ${coursName}`); setAiStep("config"); setAiCards([]); }}
        className="w-full flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/6 px-3 py-2.5 hover:bg-indigo-500/12 transition-colors">
        <Sparkles size={14} className="text-indigo-400 shrink-0" />
        <span className="text-xs font-bold text-indigo-300">Générer avec l&apos;IA</span>
        <span className="text-[10px] text-white/30 ml-1 truncate">— crée un deck automatiquement</span>
      </button>

      {/* Manual create */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          Decks <span className="text-white/25 normal-case font-normal">({decks.length})</span>
        </h3>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-white/50 text-[11px] font-bold transition-colors">
          <Plus size={11} /> Manuel
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-white/30" /></div>
      ) : decks.length === 0 && !showCreate ? (
        <div className="rounded-xl border-2 border-dashed border-white/8 p-5 text-center">
          <Layers size={18} className="mx-auto text-white/20 mb-2" />
          <p className="text-xs text-white/30">Aucun deck pour ce chapitre</p>
          <p className="text-[10px] text-white/20 mt-1">Utilisez l&apos;IA pour en générer un</p>
        </div>
      ) : (
        <div className="space-y-2">
          {decks.map((deck) => {
            const isOpen = expanded === deck.id;
            return (
              <div key={deck.id} className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03]" onClick={() => toggle(deck.id)}>
                  <ChevronRight size={12} className={`text-white/30 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <Layers size={13} className="text-indigo-400 shrink-0" />
                  <span className="flex-1 text-xs font-bold text-white/80 truncate">{deck.name}</span>
                  <span className="text-[10px] text-white/30">{deck.cards?.length ?? "…"}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteDeck(deck.id); }}
                    className="p-1 rounded hover:bg-red-500/20 text-white/20 hover:text-red-400"><Trash2 size={11} /></button>
                </div>
                {isOpen && (
                  <div className="border-t border-white/5 px-3 py-2 space-y-1.5">
                    {deck.cards?.map((c, i) => (
                      <div key={c.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-white/[0.02] group">
                        <span className="text-[9px] text-white/20 font-mono mt-0.5 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-white/70 leading-tight">{c.front}</p>
                          <p className="text-[10px] text-white/40 leading-tight mt-0.5">{c.back}</p>
                        </div>
                        <button onClick={() => handleDeleteCard(c.id, deck.id)}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-white/20 hover:text-red-400"><Trash2 size={10} /></button>
                      </div>
                    ))}
                    {addingCard === deck.id ? (
                      <div className="space-y-1.5 pt-1">
                        <input value={cardFront} onChange={(e) => setCardFront(e.target.value)} placeholder="Recto (question)..."
                          className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/80 placeholder:text-white/25 focus:outline-none focus:border-indigo-400/40" />
                        <input value={cardBack} onChange={(e) => setCardBack(e.target.value)} placeholder="Verso (réponse)..."
                          className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/80 placeholder:text-white/25 focus:outline-none focus:border-indigo-400/40"
                          onKeyDown={(e) => { if (e.key === "Enter") handleAddCard(deck.id); }} />
                        <div className="flex gap-1.5">
                          <button onClick={() => handleAddCard(deck.id)} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30">Ajouter</button>
                          <button onClick={() => { setAddingCard(null); setCardFront(""); setCardBack(""); }} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white/30 hover:text-white/50">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingCard(deck.id)}
                        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-white/10 text-[10px] font-semibold text-white/25 hover:text-indigo-300 hover:border-indigo-400/30">
                        <Plus size={10} /> Ajouter une carte
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du deck..."
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/80 placeholder:text-white/25 focus:outline-none focus:border-indigo-400/40" autoFocus />
          <div className="flex gap-1.5">
            <button onClick={handleCreate} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30">Créer</button>
            <button onClick={() => { setShowCreate(false); setNewName(""); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/30 hover:text-white/50">Annuler</button>
          </div>
        </div>
      )}

      {/* AI Generation Modal */}
      {showAI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-400" />
                <span className="text-sm font-bold text-white">Générer des flashcards — {coursName}</span>
              </div>
              <button onClick={() => setShowAI(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40"><X size={15} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {aiStep === "config" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">Nom du deck</label>
                    <input value={aiDeckName} onChange={(e) => setAiDeckName(e.target.value)}
                      className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">Sujet / thème</label>
                    <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)}
                      className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">Nombre de cartes</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={5} max={30} value={aiNb} onChange={(e) => setAiNb(Number(e.target.value))} className="flex-1 accent-indigo-400" />
                      <span className="w-6 text-center text-sm font-bold text-indigo-400">{aiNb}</span>
                    </div>
                  </div>
                  {aiError && <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400"><AlertCircle size={12} />{aiError}</div>}
                  <button onClick={handleAIGenerate}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold transition-colors">
                    <Sparkles size={14} /> Générer {aiNb} flashcards
                  </button>
                </>
              )}
              {aiStep === "loading" && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                  <p className="text-sm text-white/50">Claude génère {aiNb} flashcards...</p>
                </div>
              )}
              {aiStep === "preview" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white/50">{aiCards.length} cartes générées — vérifiez avant de sauvegarder</p>
                    <button onClick={() => setAiStep("config")} className="text-xs text-white/30 hover:text-white/60">← Reconfigurer</button>
                  </div>
                  {aiCards.map((card, i) => (
                    <div key={i} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 group relative">
                      <p className="text-xs font-semibold text-indigo-300 leading-snug">{card.front}</p>
                      <p className="text-xs text-white/50 mt-1 leading-snug">{card.back}</p>
                      <button onClick={() => handleRemoveAICard(i)}
                        className="absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-all">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {aiStep === "saving" && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                  <p className="text-sm text-white/50">Sauvegarde du deck...</p>
                </div>
              )}
            </div>
            {aiStep === "preview" && aiCards.length > 0 && (
              <div className="px-5 py-3 border-t border-white/8 shrink-0">
                <button onClick={handleAISave}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold transition-colors">
                  <Check size={14} /> Sauvegarder {aiCards.length} flashcards
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function CoursDetailPanel({
  cours,
  onBack,
}: {
  cours: Cours;
  onBack: () => void;
}) {
  const [series, setSeries] = useState<SerieFull[]>([]);
  const [questions, setQuestions] = useState<QuestionFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [modal, setModal] = useState<
    | { type: "create_question" }
    | { type: "edit_question"; q: QuestionFull }
    | { type: "create_serie" }
    | { type: "edit_serie"; s: SerieFull }
    | { type: "import_exoteach" }
    | null
  >(null);
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [, startTransition] = useTransition();
  const [sidebarTab, setSidebarTab] = useState<"qcm" | "annales" | "flashcards">("qcm");

  const qcmSeries = useMemo(() => series.filter((s) => s.type !== "annales"), [series]);
  const annalesSeries = useMemo(() => series.filter((s) => s.type === "annales"), [series]);

  const showToast = useCallback((message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [seriesData, questionsData] = await Promise.all([
      getSeriesForCours(cours.id),
      getQuestionsForCours(cours.id),
    ]);
    setSeries(seriesData as any);
    setQuestions(questionsData as any);
    setLoading(false);
  }, [cours.id]);

  useEffect(() => { load(); }, [load]);

  const handleSaveQuestion = async (data: any, editId?: string) => {
    const res = editId ? await updateQuestion(editId, data) : await createQuestion(data);
    if ("error" in res) { showToast(res.error!, "error"); return; }
    await load();
    setModal(null);
    showToast(editId ? "Question modifiée" : "Question créée", "success");
  };

  const handleDeleteQuestion = (id: string) => {
    if (!confirm("Supprimer cette question ?")) return;
    startTransition(async () => {
      const res = await deleteQuestion(id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      showToast("Question supprimée", "success");
    });
  };

  const handleSaveSerie = async (data: any, editId?: string) => {
    const res = editId ? await updateSerie(editId, data) : await createSerie(data);
    if ("error" in res) { showToast(res.error!, "error"); return; }
    await load();
    setModal(null);
    showToast(editId ? "Série modifiée" : "Série créée", "success");
  };

  const handleDeleteSerie = (id: string) => {
    if (!confirm("Supprimer cette série ?")) return;
    startTransition(async () => {
      const res = await deleteSerie(id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setSeries((prev) => prev.filter((s) => s.id !== id));
      showToast("Série supprimée", "success");
    });
  };

  const handleToggleVisible = async (id: string, visible: boolean) => {
    // Mise à jour optimiste immédiate
    setSeries((prev) => prev.map((s) => s.id === id ? { ...s, visible } : s));
    const res = await toggleSerieVisible(id, visible);
    if (res && "error" in res) {
      // Revert si erreur
      setSeries((prev) => prev.map((s) => s.id === id ? { ...s, visible: !visible } : s));
      showToast("Erreur lors du changement de visibilité", "error");
    } else {
      showToast(visible ? "Série visible par les élèves" : "Série masquée", "success");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F5F6FA]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.kind === "success" ? "bg-green-600/90" : "bg-red-600/90"} text-white`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Header — blanc avec back + titre + actions */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors shrink-0">
            <ArrowLeft size={14} /> Retour au dossier
          </button>
          <div className="w-px h-4 bg-gray-200 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-navy truncate">{cours.name}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {questions.length} question{questions.length !== 1 ? "s" : ""} · {series.length} série{series.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={() => setShowAI(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#C9A84C]/40 bg-[#C9A84C]/10 hover:bg-[#C9A84C]/20 text-[#C9A84C] text-xs font-semibold rounded-lg transition-colors">
            <Sparkles size={12} /> IA
          </button>
        </div>
      </div>

      {/* Body — split PDF gauche / sidebar droite */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── GAUCHE : fiche PDF ── */}
        <div className="flex-1 overflow-y-auto p-4">
          {cours.pdf_url ? (
            <PdfViewer
              coursId={cours.id}
              pdfUrl={cours.pdf_url}
              nbPages={cours.nb_pages ?? 0}
              currentPage={1}
              version={cours.version ?? 1}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white h-full min-h-64 text-center px-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 mb-3">
                <FileText className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-400">Aucune fiche PDF pour ce cours</p>
              <p className="mt-1 text-xs text-gray-300">Cliquez sur &quot;Modifier&quot; pour uploader un PDF</p>
            </div>
          )}
        </div>

        {/* ── DROITE : sidebar navy avec onglets Séries / Flashcards ── */}
        <div className="w-96 shrink-0 border-l border-gray-200 flex flex-col overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>
          {/* Onglets */}
          <div className="shrink-0 flex border-b border-white/10">
            <button
              onClick={() => setSidebarTab("qcm")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold transition-colors border-b-2 ${
                sidebarTab === "qcm"
                  ? "border-teal-400 text-teal-400"
                  : "border-transparent text-white/40 hover:text-white/60"
              }`}
            >
              <Layers size={12} />
              Séries {qcmSeries.length > 0 && <span className="text-[9px] opacity-70">({qcmSeries.length})</span>}
            </button>
            <button
              onClick={() => setSidebarTab("annales")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold transition-colors border-b-2 ${
                sidebarTab === "annales"
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-white/40 hover:text-white/60"
              }`}
            >
              <FileText size={12} />
              Annales {annalesSeries.length > 0 && <span className="text-[9px] opacity-70">({annalesSeries.length})</span>}
            </button>
            <button
              onClick={() => setSidebarTab("flashcards")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold transition-colors border-b-2 ${
                sidebarTab === "flashcards"
                  ? "border-indigo-400 text-indigo-400"
                  : "border-transparent text-white/40 hover:text-white/60"
              }`}
            >
              <BookOpen size={12} />
              Flashcards
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-white/30" />
              </div>
            ) : sidebarTab === "qcm" || sidebarTab === "annales" ? (
              <>
                {/* ── Séries / Annales ── */}
                {(() => {
                  const tabSeries = sidebarTab === "qcm" ? qcmSeries : annalesSeries;
                  const accentColor = sidebarTab === "qcm" ? "#2dd4bf" : "#fbbf24";
                  const emptyLabel = sidebarTab === "qcm" ? "Aucune série" : "Aucune annale";
                  return (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setModal({ type: "import_exoteach" })}
                            title="Importer des séries depuis ExoTeach"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#C9A84C]/40 hover:bg-[#C9A84C]/10 text-[#C9A84C] text-[11px] font-bold transition-colors">
                            <Download size={11} /> ExoTeach
                          </button>
                          <button onClick={() => setModal({ type: "create_serie" })}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35] text-[11px] font-bold transition-colors">
                            <Plus size={11} /> Ajouter
                          </button>
                        </div>
                      </div>

                      {tabSeries.length === 0 ? (
                        <div className="rounded-xl border-2 border-dashed border-white/8 p-5 text-center">
                          <Layers size={20} className="mx-auto text-white/20 mb-2" />
                          <p className="text-xs text-white/30">{emptyLabel} — crée-en une</p>
                          <button onClick={() => setModal({ type: "create_serie" })} className="mt-2 text-xs hover:underline" style={{ color: accentColor }}>
                            + Nouvelle série
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {tabSeries.map((s) => (
                            <a
                              key={s.id}
                              href={`/serie/${s.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-xl border border-white/8 bg-white/4 p-3 flex items-center gap-3 cursor-pointer hover:bg-white/8 transition-colors group block"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-white group-hover:text-[#C9A84C] transition-colors">{s.name}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[s.type]}`}>{TYPE_LABELS[s.type]}</span>
                                  {!s.visible && <span className="text-[10px] text-white/30">Masquée</span>}
                                </div>
                                <p className="text-[11px] text-white/40 mt-1">
                                  {s.nb_questions} question{s.nb_questions !== 1 ? "s" : ""}
                                  {s.timed && ` · ${s.duration_minutes}min`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.preventDefault()}>
                                <button onClick={(e) => { e.preventDefault(); setModal({ type: "edit_serie", s }); }}
                                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                                  title="Modifier la série">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={(e) => { e.preventDefault(); handleDeleteSerie(s.id); }}
                                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })()}
              </>
            ) : (
              /* ── Flashcards ── */
              <ChapterFlashcards coursId={cours.id} coursName={cours.name} />
            )}
          </div>
        </div>{/* end sidebar navy */}
      </div>{/* end body split */}

      {/* AI Modal */}
      {showAI && (
        <ChapterAIModal
          cours={cours}
          onSaved={() => load()}
          onClose={() => setShowAI(false)}
        />
      )}

      {/* Modals */}
      {modal?.type === "create_question" && (
        <QuestionModal coursId={cours.id} onSave={(d) => handleSaveQuestion(d)} onClose={() => setModal(null)} />
      )}
      {modal?.type === "edit_question" && (
        <QuestionModal initial={modal.q as any} coursId={cours.id} onSave={(d) => handleSaveQuestion(d, modal.q.id)} onClose={() => setModal(null)} />
      )}
      {modal?.type === "create_serie" && (
        <SerieModal coursId={cours.id} onSave={(d) => handleSaveSerie(d)} onClose={() => setModal(null)} />
      )}
      {modal?.type === "edit_serie" && (
        <SerieEditorModal
          serie={modal.s}
          coursId={cours.id}
          allCourseQuestions={questions}
          onClose={() => setModal(null)}
          onSaved={() => load()}
        />
      )}
      {modal?.type === "import_exoteach" && (
        <ImportExoteachModal
          coursId={cours.id}
          onClose={() => setModal(null)}
          onDone={() => load()}
        />
      )}
    </div>
  );
}
