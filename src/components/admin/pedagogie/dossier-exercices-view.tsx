"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Sparkles, Loader2, Check, AlertCircle, X, ChevronRight,
  Plus, Eye, EyeOff, BookOpen, Layers, PlusCircle, Trophy, BookMarked,
  Pencil, Trash2, GripVertical, ListPlus, ListMinus, Search,
  FileDown, FileUp, ChevronDown,
} from "lucide-react";
import { AnnalesIcon, QcmIcon, ConcoursIcon, RevisionIcon, FlashcardIcon } from "./dossier-icons";
import type { Dossier, Cours } from "@/types/database";
import { MathText } from "@/components/ui/math-text";
import { InlineQuestionEditor } from "./cours-detail-panel";
import { getSeriesByDossier, getSerieQuestions, getBankQuestionsForSerie, updateQuestionCoursId } from "@/app/(admin)/admin/pedagogie/actions";
import { toggleSerieVisible, deleteSerie, createSerie, updateSerie, updateSerieAnnee, addQuestionToSerie, removeQuestionFromSerie, removeAllQuestionsFromSerie, createQuestion, updateQuestion, getSeriesSections } from "@/app/(admin)/admin/exercices/actions";
import { batchCreateQuestions } from "@/app/(admin)/admin/exercices/actions";
import { FlashcardsSection } from "./flashcards-section";
import { ImportExoteachModal } from "./import-exoteach-modal";
import { AccFabricator } from "./acc-fabricator";
import { AccCheck } from "./acc-check";
import ExamWorkflowStepper from "../examens/exam-workflow-stepper";

// ─── Types ────────────────────────────────────────────────────────────────

export type SerieType = "annales" | "qcm_supplementaires" | "concours_blanc" | "revision";

export type SerieSummary = {
  id: string; name: string; type: string; visible: boolean;
  timed: boolean; duration_minutes: number | null;
  score_definitif: boolean; cours_id: string | null;
  nb_questions: number; annee: string | null;
};

export type CoursBasic = { id: string; name: string; dossier_id: string; etiquettes?: string[] };

const TYPE_CONFIG: Record<SerieType, { label: string; icon: React.ReactNode; svgIcon: React.ReactNode; color: string; textColor: string; bg: string; border: string; gradient: string; glowColor: string }> = {
  annales:             { label: "Annales corrigées",   icon: <BookOpen size={14} />,   svgIcon: <AnnalesIcon className="h-[18px] w-[18px]" />,   color: "text-amber-300",  textColor: "#FCD34D", bg: "bg-amber-500/15",  border: "border-amber-500/30", gradient: "linear-gradient(135deg, rgba(252,211,77,0.15) 0%, rgba(217,119,6,0.05) 100%)", glowColor: "rgba(252,211,77,0.18)" },
  qcm_supplementaires: { label: "QCM supplémentaires", icon: <PlusCircle size={14} />, svgIcon: <QcmIcon className="h-[18px] w-[18px]" />,       color: "text-teal-300",   textColor: "#5EEAD4", bg: "bg-teal-500/15",   border: "border-teal-500/30", gradient: "linear-gradient(135deg, rgba(94,234,212,0.15) 0%, rgba(20,184,166,0.05) 100%)", glowColor: "rgba(94,234,212,0.18)" },
  concours_blanc:      { label: "Concours blanc",      icon: <Trophy size={14} />,     svgIcon: <ConcoursIcon className="h-[18px] w-[18px]" />,  color: "text-red-300",    textColor: "#FCA5A5", bg: "bg-red-500/15",    border: "border-red-500/30", gradient: "linear-gradient(135deg, rgba(252,165,165,0.15) 0%, rgba(239,68,68,0.05) 100%)", glowColor: "rgba(252,165,165,0.18)" },
  revision:            { label: "Révision",            icon: <BookMarked size={14} />, svgIcon: <RevisionIcon className="h-[18px] w-[18px]" />,  color: "text-purple-300", textColor: "#C4B5FD", bg: "bg-purple-500/15", border: "border-purple-500/30", gradient: "linear-gradient(135deg, rgba(196,181,253,0.15) 0%, rgba(139,92,246,0.05) 100%)", glowColor: "rgba(196,181,253,0.18)" },
};

const TYPES: SerieType[] = ["annales", "qcm_supplementaires", "concours_blanc", "revision"];

// ─── Smart AI Modal ────────────────────────────────────────────────────────

type Chapter = { id: string; name: string; path: string; dossier_id: string };

function buildChapters(dossierId: string, allDossiers: Dossier[], cours: CoursBasic[], pathSoFar = ""): Chapter[] {
  const dossier = allDossiers.find((d) => d.id === dossierId);
  const name = dossier?.name ?? "";
  const path = pathSoFar ? `${pathSoFar} › ${name}` : name;
  const direct = cours.filter((c) => c.dossier_id === dossierId).map((c) => ({ id: c.id, name: c.name, path, dossier_id: dossierId }));
  const childChapters = allDossiers.filter((d) => d.parent_id === dossierId).flatMap((d) => buildChapters(d.id, allDossiers, cours, path));
  return [...direct, ...childChapters];
}

function SmartAIModal({ chapters, coursList, matiereName, availableSections, onSaved, onClose }: {
  chapters: Chapter[]; coursList?: CoursBasic[]; matiereName: string; availableSections?: string[]; onSaved: () => void; onClose: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [nb, setNb] = useState(10);
  const [diff, setDiff] = useState(3);
  const [aiSection, setAiSection] = useState<string>(availableSections?.[0] ?? "");

  // Filter chapters by section
  const filteredChapters = React.useMemo(() => {
    if (!availableSections || !aiSection || !coursList) return chapters;
    const sectionCoursIds = new Set(coursList.filter((c) => c.etiquettes?.[0] === aiSection).map((c) => c.id));
    return chapters.filter((ch) => sectionCoursIds.has(ch.id));
  }, [chapters, coursList, availableSections, aiSection]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(chapters.map((c) => c.id)));

  // Update selection when section changes
  React.useEffect(() => {
    setSelectedIds(new Set(filteredChapters.map((c) => c.id)));
  }, [aiSection]); // eslint-disable-line
  const [step, setStep] = useState<"config" | "loading" | "preview" | "saving">("config");
  const [generated, setGenerated] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const diffLabel = ["", "Facile", "Moyen–", "Moyen", "Difficile", "Expert"][diff];

  const handleGenerate = async () => {
    setError(""); setStep("loading");
    const selected = chapters.filter((c) => selectedIds.has(c.id));
    try {
      const res = await fetch("/api/generate-questions-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters: selected, topic, nbQuestions: nb, difficulty: diff, matiereName }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); setStep("config"); return; }
      setGenerated(json.questions ?? []);
      setStep("preview");
    } catch (e: any) { setError(e.message); setStep("config"); }
  };

  const handleSave = async () => {
    setStep("saving");
    const res = await batchCreateQuestions(generated.map((q) => ({ ...q, type: "qcm_multiple" as const })));
    setSavedCount(res.created);
    setTimeout(() => { onSaved(); onClose(); }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[#C9A84C]" />
            <span className="text-sm font-bold text-white">Génération IA — {matiereName}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === "config" && (
            <>
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">Sujet <span className="normal-case font-normal text-white/25">(optionnel)</span></label>
                <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="ex. Liaisons chimiques..." className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">Questions : {nb}</label>
                  <input type="range" min={3} max={50} value={nb} onChange={(e) => setNb(Number(e.target.value))} className="w-full accent-[#C9A84C]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">Difficulté : {diffLabel}</label>
                  <input type="range" min={1} max={5} value={diff} onChange={(e) => setDiff(Number(e.target.value))} className="w-full accent-[#C9A84C]" />
                </div>
              </div>
              {availableSections && availableSections.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 block">Section *</label>
                  <select
                    value={aiSection}
                    onChange={(e) => setAiSection(e.target.value)}
                    className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25"
                  >
                    {availableSections.map((s) => (
                      <option key={s} value={s} className="bg-[#0e1e35] text-white">{s}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Chapitres ({selectedIds.size}/{filteredChapters.length})</label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedIds(new Set(filteredChapters.map((c) => c.id)))} className="text-[10px] text-white/30 hover:text-white/60">Tout</button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-[10px] text-white/30 hover:text-white/60">Aucun</button>
                  </div>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto rounded-xl border border-white/8 p-2">
                  {filteredChapters.map((c) => (
                    <label key={c.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/4 cursor-pointer">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => setSelectedIds((p) => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} className="mt-0.5 accent-[#C9A84C]" />
                      <div className="min-w-0"><p className="text-xs font-medium text-white truncate">{c.name}</p><p className="text-[10px] text-white/30 truncate">{c.path}</p></div>
                    </label>
                  ))}
                  {filteredChapters.length === 0 && <p className="text-xs text-white/30 text-center py-3">Aucun cours dans cette section</p>}
                </div>
              </div>
              {error && <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400"><AlertCircle size={12} />{error}</div>}
              <button onClick={handleGenerate} disabled={selectedIds.size === 0} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#C9A84C] hover:bg-[#A8892E] disabled:opacity-40 text-[#0e1e35] text-sm font-bold">
                <Sparkles size={14} /> Générer {nb} questions
              </button>
            </>
          )}
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="animate-spin text-[#C9A84C]" />
              <p className="text-sm text-white/50">Claude génère et assigne les questions aux chapitres...</p>
            </div>
          )}
          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/50">{generated.length} questions générées</p>
                <button onClick={() => setStep("config")} className="text-xs text-white/30 hover:text-white/60">← Reconfigurer</button>
              </div>
              {generated.map((q, i) => (
                <div key={i} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                  <p className="text-xs text-white/80 leading-relaxed">{q.text}</p>
                  <div className="flex gap-1 mt-1.5">{q.options?.map((o: any) => (<span key={o.label} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${o.is_correct ? "bg-green-500/20 text-green-400" : "bg-white/6 text-white/30"}`}>{o.label}</span>))}</div>
                </div>
              ))}
            </div>
          )}
          {step === "saving" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              {savedCount > 0 ? (<><div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center"><Check size={18} className="text-green-400" /></div><p className="text-sm font-semibold text-white">{savedCount} questions sauvegardées !</p></>) : (<><Loader2 size={24} className="animate-spin text-[#C9A84C]" /><p className="text-sm text-white/50">Sauvegarde...</p></>)}
            </div>
          )}
        </div>
        {step === "preview" && generated.length > 0 && (
          <div className="px-5 py-3 border-t border-white/8 shrink-0">
            <button onClick={handleSave} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold">
              <Check size={14} /> Sauvegarder {generated.length} questions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared Labels ────────────────────────────────────────────────────────

const TYPE_LABELS_LOCAL: Record<SerieType, string> = {
  annales: "Annales corrigées",
  qcm_supplementaires: "QCM supplémentaires",
  concours_blanc: "Concours blanc",
  revision: "Révision",
};

// ─── Edit Serie Modal ──────────────────────────────────────────────────────

function EditSerieModal({
  serie,
  coursList,
  onSaved,
  onClose,
}: {
  serie: SerieSummary;
  coursList: CoursBasic[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(serie.name);
  const [type, setType] = React.useState<SerieType>(serie.type as SerieType);
  const [coursId, setCoursId] = React.useState(serie.cours_id ?? "");
  const [timed, setTimed] = React.useState(serie.timed);
  const [duration, setDuration] = React.useState(String(serie.duration_minutes ?? 30));
  const [scoreDefinitif, setScoreDefinitif] = React.useState(serie.score_definitif);
  const [visible, setVisible] = React.useState(serie.visible);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Le nom est requis"); return; }
    setSaving(true);
    setError("");
    const effectiveCoursId = coursId || coursList[0]?.id || null;
    const res = await updateSerie(serie.id, {
      name: name.trim(),
      type,
      timed,
      duration_minutes: timed ? Number(duration) : null,
      score_definitif: scoreDefinitif,
      visible,
      cours_id: effectiveCoursId,
      matiere_id: null,
    });
    if ("error" in res) { setError((res as any).error ?? "Erreur"); setSaving(false); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl" style={{ backgroundColor: "#0e1e35" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Modifier la série</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50"><X size={16} /></button>
        </div>
        {error && <p className="mb-3 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-400">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Nom *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus
              className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25"
              placeholder="Nom de la série..." />
          </div>
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["annales", "qcm_supplementaires", "concours_blanc", "revision"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`py-2 px-3 rounded-lg text-[11px] font-bold border transition-colors text-left ${type === t ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                  {TYPE_LABELS_LOCAL[t]}
                </button>
              ))}
            </div>
          </div>
          {coursList.length > 0 && (
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Cours associé <span className="font-normal text-white/30 normal-case">(optionnel)</span></label>
              <select value={coursId} onChange={(e) => setCoursId(e.target.value)}
                className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25">
                <option value="">— Toute la matière (pas de chapitre spécifique) —</option>
                {coursList.map((c) => <option key={c.id} value={c.id} className="bg-[#0e1e35] text-white">{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="divide-y divide-white/8">
            <label className="flex items-center justify-between py-2.5 cursor-pointer">
              <span className="text-sm text-white/70">Visible pour les élèves</span>
              <button type="button" onClick={() => setVisible(!visible)}
                className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${visible ? "bg-[#C9A84C]" : "bg-white/15"}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${visible ? "translate-x-5" : ""}`} />
              </button>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm hover:bg-white/5 transition-colors">Annuler</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-[#0e1e35] font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#E8C97B] transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Full Serie Editor Modal ───────────────────────────────────────────────

export function FullSerieEditor({
  serie, coursList, onClose, onSaved, readonlyType,
  examDebutAt, examFinAt, examName,
}: {
  serie: SerieSummary; coursList: CoursBasic[];
  onClose: () => void; onSaved: () => void;
  readonlyType?: boolean;
  examDebutAt?: string | null;
  examFinAt?: string | null;
  examName?: string;
}) {
  // Settings
  const [name, setName] = useState(serie.name);
  const [type, setType] = useState<SerieType>(
    (["annales","qcm_supplementaires","concours_blanc","revision"].includes(serie.type) ? serie.type : "annales") as SerieType
  );
  const [timed, setTimed] = useState(serie.timed);
  const [duration, setDuration] = useState(String(serie.duration_minutes ?? 30));
  const [scoreDefinitif, setScoreDefinitif] = useState(serie.score_definitif);
  const [visible, setVisible] = useState(serie.visible);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // Questions + Sections
  const [serieQuestions, setSerieQuestions] = useState<any[]>([]);
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loadingQ, setLoadingQ] = useState(true);
  const [expandedQ, setExpandedQ] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const [removingAll, setRemovingAll] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  // Chapter assignment
  const [assigningCours, setAssigningCours] = useState<string | null>(null);
  const isChapterAssignable = serie.type === "annales" || serie.type === "concours_blanc";

  // Import/Export
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const importRef = React.useRef<HTMLInputElement>(null);

  // Workflow mode for concours_blanc
  const [showWorkflow, setShowWorkflow] = useState(false);
  const isConcoursBlanc = serie.type === "concours_blanc";

  const coursId = serie.cours_id ?? coursList[0]?.id ?? "";

  const loadAll = useCallback(async () => {
    setLoadingQ(true);
    try {
      const [qs, bank, secs] = await Promise.all([
        getSerieQuestions(serie.id),
        coursId ? getBankQuestionsForSerie(coursId, serie.id) : Promise.resolve([]),
        getSeriesSections(serie.id),
      ]);
      setSerieQuestions(qs as any);
      setBankQuestions(bank as any);
      setSections(secs as any);
    } catch (e) { console.error("[FullSerieEditor]", e); }
    finally { setLoadingQ(false); }
  }, [serie.id, coursId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    await updateSerie(serie.id, {
      name, type, timed,
      duration_minutes: timed ? Number(duration) : null,
      score_definitif: scoreDefinitif, visible,
      cours_id: coursId || null, matiere_id: null,
    });
    setSavingSettings(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
    onSaved();
  };

  const handleRemoveQ = async (qId: string) => {
    setRemoving(qId);
    await removeQuestionFromSerie(serie.id, qId);
    await loadAll();
    setRemoving(null);
  };

  const handleRemoveAll = async () => {
    if (!confirm(`Supprimer les ${serieQuestions.length} questions de cette série ?`)) return;
    setRemovingAll(true);
    await removeAllQuestionsFromSerie(serie.id);
    await loadAll();
    setRemovingAll(false);
  };

  const handleAddQ = async (qId: string) => {
    setAdding(qId);
    await addQuestionToSerie(serie.id, qId, serieQuestions.length);
    await loadAll();
    setAdding(null);
  };

  const toggleQ = (id: string) =>
    setExpandedQ((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleAssignCours = async (questionId: string, newCoursId: string | null) => {
    setAssigningCours(questionId);
    await updateQuestionCoursId(questionId, newCoursId);
    setSerieQuestions((prev) => prev.map((q: any) => q.id === questionId ? { ...q, cours_id: newCoursId } : q));
    setAssigningCours(null);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("serieId", serie.id);
      fd.append("file", file);
      const res = await fetch("/api/import-serie", { method: "POST", body: fd });
      const json = await res.json();
      if (json.success) { setImportMsg({ text: json.message, ok: true }); await loadAll(); }
      else { setImportMsg({ text: json.error ?? "Erreur import", ok: false }); }
    } catch (err: any) { setImportMsg({ text: err.message ?? "Erreur", ok: false }); }
    finally { setImporting(false); setTimeout(() => setImportMsg(null), 5000); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
      <div className="w-full max-w-6xl h-[92vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/8 shrink-0">
          <div className="flex-1 min-w-0">
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="bg-transparent text-sm font-bold text-white placeholder-white/30 focus:outline-none w-full"
              placeholder="Nom de la série..." />
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_CONFIG[type].bg} ${TYPE_CONFIG[type].color}`}>{TYPE_CONFIG[type].label}</span>
              <span className="text-[10px] text-white/30">{serieQuestions.length} question{serieQuestions.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          {/* Workflow button for concours_blanc */}
          {isConcoursBlanc && (
            <button onClick={() => setShowWorkflow(!showWorkflow)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${showWorkflow ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/15 text-white/60 hover:text-white hover:border-white/30"}`}>
              <Layers size={12} />
              Workflow
            </button>
          )}
          {/* Import */}
          <input ref={importRef} type="file" accept=".docx" className="hidden" onChange={handleImport} />
          <button onClick={() => importRef.current?.click()} disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40">
            {importing ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
            Importer
          </button>
          {serieQuestions.length > 0 && (
            <button onClick={handleRemoveAll} disabled={removingAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-red-500/30 text-red-400/70 hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10 transition-colors disabled:opacity-40">
              {removingAll ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Vider
            </button>
          )}
          {/* Export */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-colors">
              <FileDown size={12} /> Word
            </button>
            <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:flex flex-col w-44 rounded-xl border border-white/10 shadow-xl overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>
              <a href={`/api/export-serie?serieId=${serie.id}`} download
                className="flex items-center gap-2 px-3 py-2.5 text-xs text-white/70 hover:bg-white/8 hover:text-white transition-colors">
                <FileDown size={12} /> Sujet (sans correction)
              </a>
              <a href={`/api/export-serie?serieId=${serie.id}&corrections=1`} download
                className="flex items-center gap-2 px-3 py-2.5 text-xs text-white/70 hover:bg-white/8 hover:text-white transition-colors border-t border-white/8">
                <Check size={12} /> Avec corrections
              </a>
            </div>
          </div>
          {/* Preview */}
          <a href={`/serie/${serie.id}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-colors">
            <Eye size={12} /> Vue élève
          </a>
          {/* Save */}
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

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Settings */}
          <div className="w-52 shrink-0 border-r border-white/8 p-4 space-y-4 overflow-y-auto">
            <div>
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Type</p>
              <div className="space-y-1.5">
                {TYPES.map((t) => {
                  const isSelected = type === t;
                  const isDisabled = readonlyType && !isSelected;
                  return (
                    <button key={t} type="button" onClick={() => !isDisabled && setType(t)}
                      disabled={isDisabled}
                      className={`w-full py-2 px-3 rounded-lg text-[11px] font-semibold border text-left transition-colors
                        ${isSelected ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : ""}
                        ${isDisabled ? "border-white/5 text-white/15 cursor-not-allowed opacity-40" : ""}
                        ${!isSelected && !isDisabled ? "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60" : ""}
                      `}>
                      {TYPE_CONFIG[t].label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="divide-y divide-white/8">
              <label className="flex items-center justify-between py-2.5 cursor-pointer">
                <span className="text-xs text-white/60">Visible élèves</span>
                <button type="button" onClick={() => setVisible(!visible)}
                  className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${visible ? "bg-[#C9A84C]" : "bg-white/15"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${visible ? "translate-x-4" : ""}`} />
                </button>
              </label>
            </div>
          </div>

          {/* Right: Questions or Workflow */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {/* Workflow mode for concours_blanc */}
            {isConcoursBlanc && (showWorkflow || serieQuestions.length === 0) && !loadingQ ? (
              <ExamWorkflowStepper
                serieId={serie.id}
                serieName={name}
                serieType={serie.type}
                questionCount={serieQuestions.length}
                examDebutAt={examDebutAt}
                examFinAt={examFinAt}
                ueCode={(() => { const m = (examName || name).match(/(UE\s*\d+)/i); return m ? m[1] : ""; })()}
                subjectName={(() => { const m = (examName || name).match(/UE\s*\d+\s*[-–—]\s*(.+?)$/i); return m ? m[1].trim() : ""; })()}
                onQuestionsChanged={loadAll}
              />
            ) : (
            <>
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
              serieQuestions.map((q: any, idx: number) => {
                const isOpen = expandedQ.has(q.id);
                const opts = (q.options ?? []).sort((a: any, b: any) => a.order_index - b.order_index);
                // Section header: show when section changes
                const prevSectionId = idx > 0 ? serieQuestions[idx - 1]?.section_id : null;
                const curSection = q.section_id && q.section_id !== prevSectionId
                  ? sections.find((s: any) => s.id === q.section_id)
                  : null;
                return (
                  <React.Fragment key={q.id}>
                  {curSection && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 mt-2 mb-1">
                      <p className="text-xs font-bold text-blue-400">{curSection.title}</p>
                      {curSection.intro_text && <p className="text-[10px] text-blue-300/70 mt-1 line-clamp-2">{curSection.intro_text}</p>}
                      {curSection.image_url && <img src={curSection.image_url} alt="" className="mt-2 max-h-24 rounded-lg border border-blue-500/20" />}
                    </div>
                  )}
                  <div className="rounded-xl border border-white/8 bg-white/4 overflow-hidden">
                    <div className="flex items-start gap-2.5 p-3 cursor-pointer hover:bg-white/4" onClick={() => toggleQ(q.id)}>
                      <span className="text-[10px] font-bold text-white/25 mt-0.5 shrink-0 w-4 text-center">{idx + 1}</span>
                      <ChevronRight size={13} className={`mt-0.5 text-white/40 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      <div className="flex-1 min-w-0">
                        <MathText text={q.text} className="text-xs text-white/80 leading-snug line-clamp-2" />
                        <div className="flex gap-2 mt-1">
                          {q.difficulty && <span className="text-[10px] text-amber-400">★ {q.difficulty}</span>}
                          <span className="text-[10px] text-white/30">{opts.filter((o: any) => o.is_correct).length}V · {opts.filter((o: any) => !o.is_correct).length}F</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isChapterAssignable && coursList.length > 0 && (
                          <select
                            value={q.cours_id ?? ""}
                            onChange={(e) => handleAssignCours(q.id, e.target.value || null)}
                            disabled={assigningCours === q.id}
                            className={`text-[10px] rounded-md border px-1.5 py-0.5 outline-none transition-colors cursor-pointer ${
                              q.cours_id
                                ? "border-[#C9A84C]/40 bg-[#C9A84C]/10 text-[#C9A84C] font-semibold"
                                : "border-white/15 bg-white/5 text-white/40"
                            } ${assigningCours === q.id ? "opacity-50" : ""}`}
                          >
                            <option value="" className="bg-[#0e1e35] text-white/50">— Chapitre —</option>
                            {coursList.map((c) => (
                              <option key={c.id} value={c.id} className="bg-[#0e1e35] text-white">{c.name}</option>
                            ))}
                          </select>
                        )}
                        <button onClick={() => handleRemoveQ(q.id)} disabled={removing === q.id}
                          title="Retirer de la série"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors disabled:opacity-40">
                          {removing === q.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <InlineQuestionEditor
                        question={{ ...q, options: opts }}
                        options={opts}
                        coursId={q.cours_id ?? serie.cours_id ?? ""}
                        onSaved={() => loadAll()}
                      />
                    )}
                  </div>
                  </React.Fragment>
                );
              })
            )}


          </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Annale Serie Card with year picker ────────────────────────────────────

function AnnaleSerieCard({ serie, anneesList, coursNameStr, checked, onCheck, onOpen, onEdit, onDelete, onArchive, onAnneeChange }: {
  serie: SerieSummary; anneesList: string[]; coursNameStr: string;
  checked?: boolean; onCheck?: () => void;
  onOpen: () => void; onEdit: () => void; onDelete: () => void;
  onArchive?: () => void;
  onAnneeChange: (annee: string | null) => Promise<void>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [customAnnee, setCustomAnnee] = useState("");

  const handlePick = async (a: string | null) => {
    setShowPicker(false);
    await onAnneeChange(a);
  };

  const cfg = TYPE_CONFIG.annales;
  return (
    <div className="group relative rounded-xl p-3.5 flex items-start gap-3 transition-all duration-200 hover:shadow-[0_2px_16px_rgba(0,0,0,0.2)]"
      style={{ borderLeft: `3px solid ${cfg.textColor}40`, background: "transparent" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderLeftColor = cfg.textColor; e.currentTarget.style.background = cfg.gradient; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = `${cfg.textColor}40`; e.currentTarget.style.background = "transparent"; }}>

      {onCheck && <input type="checkbox" checked={!!checked} onChange={onCheck}
        className="shrink-0 mt-1.5 h-3.5 w-3.5 rounded border-white/20 cursor-pointer accent-amber-400" />}

      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110"
        style={{ background: "rgba(252,211,77,0.1)", border: "1px solid rgba(252,211,77,0.2)" }}>
        <AnnalesIcon className="h-[18px] w-[18px]" />
      </div>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
        <p className="text-[12px] font-bold text-white/90 group-hover:text-white transition-colors truncate">{serie.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-0.5 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[8px] font-bold text-green-400/70">
            <Eye size={8} /> Visible
          </span>
          <span className="text-[9px] text-white/30">
            {serie.nb_questions} question{serie.nb_questions !== 1 ? "s" : ""}
            {serie.timed && ` · ${serie.duration_minutes}min`}
          </span>
          {serie.cours_id && <span className="text-[9px] text-white/20 truncate">{coursNameStr}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 relative">
        <button onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}
          className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold border transition-all duration-150 ${serie.annee ? "text-amber-300 hover:shadow-[0_0_8px_rgba(252,211,77,0.15)]" : "text-white/25 hover:text-amber-300/60"}`}
          style={serie.annee ? { background: "rgba(252,211,77,0.1)", borderColor: "rgba(252,211,77,0.25)" } : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
          {serie.annee ?? "+ année"}
        </button>
        {showPicker && (
          <div className="absolute right-0 top-8 z-50 min-w-[140px] rounded-xl border border-white/10 shadow-2xl p-1.5 space-y-0.5 backdrop-blur-xl"
            style={{ backgroundColor: "rgba(14,30,53,0.95)" }} onClick={(e) => e.stopPropagation()}>
            {anneesList.map((a) => (
              <button key={a} onClick={() => handlePick(a)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${serie.annee === a ? "bg-amber-500/20 text-amber-300" : "text-white/60 hover:bg-white/8 hover:text-white"}`}>
                {a}
              </button>
            ))}
            <div className="border-t border-white/8 mt-1 pt-1">
              <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); if (customAnnee.trim()) { await handlePick(customAnnee.trim()); setCustomAnnee(""); } }}>
                <input autoFocus value={customAnnee} onChange={(e) => setCustomAnnee(e.target.value)} placeholder="2023-2024"
                  className="flex-1 px-2 py-1 rounded-lg bg-white/8 border border-white/10 text-[10px] text-white placeholder-white/25 focus:outline-none focus:border-amber-400/40 min-w-0" />
                <button type="submit" className="px-1.5 rounded-lg bg-amber-500/20 text-amber-300 text-[10px] hover:bg-amber-500/30"><Check size={10} /></button>
              </form>
            </div>
            {serie.annee && (
              <button onClick={() => handlePick(null)}
                className="w-full text-left px-2.5 py-1 rounded-lg text-[10px] text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                Retirer l&apos;année
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {onArchive && (
            <button onClick={onArchive} className="p-1.5 rounded-lg hover:bg-orange-500/10 text-white/20 hover:text-orange-400 transition-colors" title="Archiver">
              <EyeOff size={12} />
            </button>
          )}
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/8 text-white/20 hover:text-[#7DD3FC] transition-colors" title="Éditer">
            <Pencil size={12} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors" title="Supprimer">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function DossierExercicesView({
  dossierId,
  dossierName,
  allDossiers,
  availableSections,
  hiddenTabs,
  onNewSerie,
}: {
  dossierId: string;
  dossierName: string;
  allDossiers: Dossier[];
  availableSections?: string[];
  hiddenTabs?: string[];
  onNewSerie?: (type: SerieType) => void;
}) {
  const visibleTypes = TYPES.filter((t) => !hiddenTabs?.includes(t));
  const [activeTab, setActiveTab] = useState<SerieType | "flashcards" | "acc_fabricator">(visibleTypes[0] ?? "qcm_supplementaires");
  const [showAccCheck, setShowAccCheck] = useState(false);
  const [series, setSeries] = useState<SerieSummary[]>([]);
  const [cours, setCours] = useState<CoursBasic[]>([]);
  const [matiereId, setMatiereId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [showNewSerie, setShowNewSerie] = useState(false);
  const [newSerieType, setNewSerieType] = useState<SerieType>("qcm_supplementaires");
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editSerie, setEditSerie] = useState<SerieSummary | null>(null);
  const [composeSerie, setComposeSerie] = useState<SerieSummary | null>(null);
  const [selectedAnnee, setSelectedAnnee] = useState<string | null>(null);
  const [showAddAnnee, setShowAddAnnee] = useState(false);
  const [newAnnee, setNewAnnee] = useState("");
  const [showImportExoteach, setShowImportExoteach] = useState(false);
  const [checkedSerieIds, setCheckedSerieIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const res = await getSeriesByDossier(dossierId);
    setSeries(res.series as SerieSummary[]);
    setCours(res.cours as CoursBasic[]);
    setMatiereId((res as any).matiereIds?.[0] ?? null);
    setLoading(false);
  }, [dossierId, refreshKey]); // eslint-disable-line

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-open a serie if ?serie=X is in the URL
  const searchParams = useSearchParams();
  useEffect(() => {
    const serieId = searchParams.get("serie");
    if (serieId && series.length > 0 && !composeSerie) {
      const found = series.find(s => s.id === serieId);
      if (found) setComposeSerie(found);
    }
  }, [searchParams, series]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const handleToggleVisible = async (id: string, visible: boolean) => {
    await toggleSerieVisible(id, visible);
    setSeries((prev) => prev.map((s) => s.id === id ? { ...s, visible } : s));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette série ?")) return;
    const res = await deleteSerie(id);
    if ("error" in res) { showToast(res.error!, false); return; }
    setSeries((prev) => prev.filter((s) => s.id !== id));
    showToast("Série supprimée", true);
  };

  const toggleCheckedSerie = (id: string) => setCheckedSerieIds((prev) => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  const handleBulkArchive = async () => {
    if (checkedSerieIds.size === 0) return;
    for (const id of checkedSerieIds) await toggleSerieVisible(id, false);
    setSeries((prev) => prev.map((s) => checkedSerieIds.has(s.id) ? { ...s, visible: false } : s));
    showToast(`${checkedSerieIds.size} série(s) archivée(s)`, true);
    setCheckedSerieIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (checkedSerieIds.size === 0) return;
    if (!confirm(`Supprimer définitivement ${checkedSerieIds.size} série(s) ?`)) return;
    for (const id of checkedSerieIds) await deleteSerie(id);
    setSeries((prev) => prev.filter((s) => !checkedSerieIds.has(s.id)));
    showToast(`${checkedSerieIds.size} série(s) supprimée(s)`, true);
    setCheckedSerieIds(new Set());
  };

  const handleBulkRestore = async () => {
    if (checkedSerieIds.size === 0) return;
    for (const id of checkedSerieIds) await toggleSerieVisible(id, true);
    setSeries((prev) => prev.map((s) => checkedSerieIds.has(s.id) ? { ...s, visible: true } : s));
    showToast(`${checkedSerieIds.size} série(s) restaurée(s)`, true);
    setCheckedSerieIds(new Set());
  };

  const totalSeries = series.filter((s) => s.visible).length;
  const totalQuestions = series.reduce((a, s) => a + (s.nb_questions ?? 0), 0);
  const chapters = buildChapters(dossierId, allDossiers, cours);
  const seriesByType = (type: SerieType) => series.filter((s) => s.type === type && s.visible);
  const archivedSeries = series.filter((s) => !s.visible);
  const coursName = (id: string | null) => cours.find((c) => c.id === id)?.name ?? "";

  // Year bubbles for annales
  const anneesList = Array.from(new Set(seriesByType("annales").map((s) => s.annee).filter(Boolean) as string[])).sort().reverse();
  const filteredAnnales = selectedAnnee
    ? seriesByType("annales").filter((s) => s.annee === selectedAnnee)
    : seriesByType("annales");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.ok ? "bg-green-600/90" : "bg-red-600/90"} text-white`}>
          {toast.ok ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Compact header: stats + actions + tabs — all in ~70px */}
      <div className="shrink-0 px-4 pt-2.5 pb-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Row 1: stats badges + action buttons */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(201,168,76,0.1)", color: "#E3C286", border: "1px solid rgba(201,168,76,0.15)" }}>
              {loading ? "…" : totalSeries} <span className="text-[9px] font-medium opacity-60 uppercase">séries</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(125,211,252,0.08)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(125,211,252,0.1)" }}>
              {loading ? "…" : totalQuestions} <span className="text-[9px] font-medium opacity-50 uppercase">questions</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowAI(true)} disabled={cours.length === 0} title="Générer avec l'IA"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all disabled:opacity-30 hover:shadow-[0_0_12px_rgba(201,168,76,0.1)]"
              style={{ background: "rgba(201,168,76,0.08)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.18)" }}>
              <Sparkles size={11} /> IA
            </button>
            <button onClick={() => setShowImportExoteach(true)} title="Importer via ExoTeach"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all hover:shadow-[0_0_12px_rgba(94,234,212,0.08)]"
              style={{ background: "rgba(94,234,212,0.06)", color: "#5EEAD4", border: "1px solid rgba(94,234,212,0.12)" }}>
              <FileDown size={11} /> Import
            </button>
          </div>
        </div>
        {/* Row 2: type tabs — horizontal, compact */}
        <div className="flex gap-0.5 -mb-px">
          {TYPES.filter((t) => !hiddenTabs?.includes(t)).map((t) => {
            const cfg = TYPE_CONFIG[t];
            const count = seriesByType(t).length;
            const isActive = activeTab === t;
            return (
              <button key={t} onClick={() => { setActiveTab(t); setSelectedChapter(null); }}
                className="relative flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[10px] font-bold uppercase tracking-wide transition-all"
                style={isActive
                  ? { background: cfg.gradient, color: cfg.textColor, borderBottom: `2px solid ${cfg.textColor}` }
                  : { color: "rgba(255,255,255,0.35)", borderBottom: "2px solid transparent" }
                }>
                <span className="flex h-5 w-5 items-center justify-center rounded shrink-0" style={isActive ? { background: `${cfg.textColor}18` } : {}}>
                  {cfg.svgIcon}
                </span>
                <span className="hidden sm:inline whitespace-nowrap">{cfg.label}</span>
                {count > 0 && <span className={`text-[9px] rounded px-1 py-px font-bold ${isActive ? cfg.bg + " " + cfg.color : "bg-white/[0.06] text-white/30"}`}>{count}</span>}
              </button>
            );
          })}
          {!hiddenTabs?.includes("flashcards") && (
            <button onClick={() => { setActiveTab("flashcards"); setSelectedChapter(null); }}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[10px] font-bold uppercase tracking-wide transition-all"
              style={activeTab === "flashcards"
                ? { background: "linear-gradient(135deg, rgba(165,180,252,0.12) 0%, rgba(99,102,241,0.04) 100%)", color: "#A5B4FC", borderBottom: "2px solid #A5B4FC" }
                : { color: "rgba(255,255,255,0.35)", borderBottom: "2px solid transparent" }
              }>
              <span className="flex h-5 w-5 items-center justify-center rounded shrink-0" style={activeTab === "flashcards" ? { background: "rgba(165,180,252,0.18)" } : {}}>
                <FlashcardIcon className="h-3.5 w-3.5" />
              </span>
              <span className="hidden sm:inline">Flashcards</span>
            </button>
          )}
        </div>
      </div>

      {/* Bulk actions bar */}
      {checkedSerieIds.size > 0 && (
        <div className="shrink-0 flex items-center gap-3 mx-4 mt-3 px-3 py-2 rounded-xl border border-[#C9A84C]/30 bg-[#C9A84C]/10">
          <span className="text-[11px] font-bold text-[#C9A84C]">{checkedSerieIds.size} sélectionnée{checkedSerieIds.size > 1 ? "s" : ""}</span>
          <button type="button" onClick={handleBulkArchive}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/10 text-white/70 hover:bg-white/15 transition-colors">
            <EyeOff size={11} /> Archiver
          </button>
          <button type="button" onClick={handleBulkRestore}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/10 text-white/70 hover:bg-white/15 transition-colors">
            <Eye size={11} /> Restaurer
          </button>
          <button type="button" onClick={handleBulkDelete}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors">
            <Trash2 size={11} /> Supprimer
          </button>
          <button type="button" onClick={() => setCheckedSerieIds(new Set())}
            className="ml-auto text-[10px] text-white/40 hover:text-white/60">Désélectionner</button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "acc_fabricator" ? (
          <AccFabricator dossierId={dossierId} dossierName={dossierName} />
        ) : activeTab === "flashcards" ? (
          <FlashcardsSection dossierId={dossierId} cours={cours.map(c => ({ id: c.id, name: c.name }))} dossierName={dossierName} />
        ) : loading ? (
          <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-white/30" /></div>
        ) : activeTab === "annales" ? (
          /* ─── Annales with year bubbles ─── */
          <div className="space-y-3">
            {/* Year filter bubbles */}
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={() => setSelectedAnnee(null)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${!selectedAnnee ? "bg-amber-500/25 border-amber-400/50 text-amber-300" : "border-white/12 text-white/40 hover:border-white/25 hover:text-white/60"}`}>
                Toutes
              </button>
              {anneesList.map((a) => (
                <button key={a} onClick={() => setSelectedAnnee(selectedAnnee === a ? null : a)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${selectedAnnee === a ? "bg-amber-500/25 border-amber-400/50 text-amber-300" : "border-white/12 text-white/40 hover:border-amber-400/40 hover:text-amber-300/60"}`}>
                  {a}
                </button>
              ))}
              {/* Add year button */}
              {showAddAnnee ? (
                <form className="flex items-center gap-1.5" onSubmit={(e) => {
                  e.preventDefault();
                  if (newAnnee.trim()) { setSelectedAnnee(newAnnee.trim()); setShowAddAnnee(false); setNewAnnee(""); }
                }}>
                  <input autoFocus value={newAnnee} onChange={(e) => setNewAnnee(e.target.value)}
                    placeholder="2024-2025"
                    className="w-24 px-2 py-1 rounded-full bg-white/8 border border-amber-400/30 text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-400/60" />
                  <button type="submit" className="p-1 rounded-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"><Check size={12} /></button>
                  <button type="button" onClick={() => setShowAddAnnee(false)} className="p-1 rounded-full text-white/30 hover:text-white/60"><X size={12} /></button>
                </form>
              ) : (
                <button onClick={() => setShowAddAnnee(true)}
                  className="px-2.5 py-1.5 rounded-full border border-dashed border-white/15 text-[11px] text-white/30 hover:border-amber-400/30 hover:text-amber-300/60 transition-colors flex items-center gap-1">
                  <Plus size={10} /> Année
                </button>
              )}
            </div>

            {/* Verify ACC button */}
            <button
              onClick={() => setShowAccCheck(true)}
              className="w-full flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/6 px-3 py-2 hover:bg-blue-500/12 transition-colors"
            >
              <Search size={14} className="text-blue-400 shrink-0" />
              <span className="text-xs font-bold text-blue-400">Vérifier les ACC</span>
              <span className="text-[10px] text-white/30 ml-1 truncate">— comparer avec les chapitres bruts</span>
            </button>

            {/* Series list */}
            {filteredAnnales.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-white/8 p-6 text-center">
                <BookOpen size={16} className="mx-auto text-white/20" />
                <p className="text-xs text-white/30 mt-2">
                  {selectedAnnee ? `Aucune annale pour ${selectedAnnee}` : "Aucune annale corrigée"}
                </p>
                <button onClick={() => { setNewSerieType("annales"); setShowNewSerie(true); }}
                  className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <Plus size={12} /> {selectedAnnee ? `Ajouter un sujet ${selectedAnnee}` : "Créer une annale"}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAnnales.map((s) => (
                  <AnnaleSerieCard key={s.id} serie={s} anneesList={anneesList} coursNameStr={coursName(s.cours_id)}
                    checked={checkedSerieIds.has(s.id)} onCheck={() => toggleCheckedSerie(s.id)}
                    onOpen={() => window.open(`/serie/${s.id}`, "_blank")}
                    onEdit={() => setComposeSerie(s)}
                    onDelete={() => handleDelete(s.id)}
                    onArchive={() => handleToggleVisible(s.id, false)}
                    onAnneeChange={async (a) => {
                      await updateSerieAnnee(s.id, a);
                      setSeries((prev) => prev.map((x) => x.id === s.id ? { ...x, annee: a } : x));
                    }}
                  />
                ))}
                <button onClick={() => { setNewSerieType("annales"); setShowNewSerie(true); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed text-xs font-semibold transition-colors text-amber-300 border-amber-400/30 hover:bg-white/4">
                  <Plus size={12} /> Nouvelle annale
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ─── Other types (default rendering) ─── */
          (() => {
            const cfg = TYPE_CONFIG[activeTab as SerieType];
            const allTypeSeries = seriesByType(activeTab as SerieType);

            const chapterCounts = new Map<string, number>();
            for (const s of allTypeSeries) {
              const cName = s.cours_id ? coursName(s.cours_id) : "";
              if (cName) chapterCounts.set(cName, (chapterCounts.get(cName) ?? 0) + 1);
            }
            const chapterNames = Array.from(chapterCounts.keys()).sort();
            const hasChapters = chapterNames.length > 1;

            const displaySeries = selectedChapter
              ? allTypeSeries.filter((s) => s.cours_id && coursName(s.cours_id) === selectedChapter)
              : allTypeSeries;

            return (
              <>
                {/* Chapter filter pills */}
                {hasChapters && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-white/25 mr-1">Chapitre</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setSelectedChapter(null)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-150"
                        style={!selectedChapter ? {
                          background: cfg.gradient, color: cfg.textColor,
                          border: `1px solid ${cfg.textColor}40`,
                          boxShadow: `0 0 8px ${cfg.glowColor}`,
                        } : {
                          background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        Tout <span className="ml-1 text-[8px] opacity-60">{allTypeSeries.length}</span>
                      </button>
                      {chapterNames.map((name) => (
                        <button key={name}
                          onClick={() => setSelectedChapter(selectedChapter === name ? null : name)}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-150 max-w-[200px] truncate"
                          style={selectedChapter === name ? {
                            background: cfg.gradient, color: cfg.textColor,
                            border: `1px solid ${cfg.textColor}40`,
                            boxShadow: `0 0 8px ${cfg.glowColor}`,
                          } : {
                            background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {name} <span className="ml-1 text-[8px] opacity-60">{chapterCounts.get(name)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {displaySeries.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-white/8 p-6 text-center">
                    {cfg.icon}
                    <p className="text-xs text-white/30 mt-2">
                      {selectedChapter ? `Aucune série pour "${selectedChapter}"` : `Aucune série "${cfg.label}"`}
                    </p>
                    <button onClick={() => { setNewSerieType(activeTab as SerieType); setShowNewSerie(true); }}
                      className={`mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                      <Plus size={12} /> Créer une série
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {displaySeries.map((s) => (
                      <div key={s.id} className="group relative rounded-xl p-3.5 flex items-start gap-3 transition-all duration-200 hover:shadow-[0_2px_16px_rgba(0,0,0,0.2)]"
                        style={{ borderLeft: `3px solid ${cfg.textColor}40`, background: "transparent" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderLeftColor = cfg.textColor; e.currentTarget.style.background = cfg.gradient; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = `${cfg.textColor}40`; e.currentTarget.style.background = "transparent"; }}>

                        <input type="checkbox" checked={checkedSerieIds.has(s.id)} onChange={() => toggleCheckedSerie(s.id)}
                          className="shrink-0 mt-1.5 h-3.5 w-3.5 rounded border-white/20 cursor-pointer" style={{ accentColor: cfg.textColor }} />

                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110"
                          style={{ background: `${cfg.textColor}12`, border: `1px solid ${cfg.textColor}25` }}>
                          {cfg.svgIcon}
                        </div>

                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => window.open(`/serie/${s.id}`, "_blank")}>
                          <p className="text-[12px] font-bold text-white/90 group-hover:text-white transition-colors truncate">{s.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="flex items-center gap-0.5 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[8px] font-bold text-green-400/70">
                              <Eye size={8} /> Visible
                            </span>
                            <span className="text-[9px] text-white/30">
                              {s.nb_questions} question{s.nb_questions !== 1 ? "s" : ""}
                              {s.timed && ` · ${s.duration_minutes}min`}
                            </span>
                            {s.cours_id && !selectedChapter && <span className="text-[9px] text-white/20 truncate">{coursName(s.cours_id)}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <button onClick={() => handleToggleVisible(s.id, false)} className="p-1.5 rounded-lg hover:bg-orange-500/10 text-white/20 hover:text-orange-400 transition-colors" title="Archiver">
                            <EyeOff size={12} />
                          </button>
                          <button onClick={() => setComposeSerie(s)} className="p-1.5 rounded-lg hover:bg-white/8 text-white/20 hover:text-[#7DD3FC] transition-colors" title="Éditer">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors" title="Supprimer">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => { setNewSerieType(activeTab as SerieType); setShowNewSerie(true); }}
                      className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed text-xs font-semibold transition-colors ${cfg.color} border-current/30 hover:bg-white/4`}>
                      <Plus size={12} /> Nouvelle série
                    </button>
                  </div>
                )}
              </>
            );
          })()
        )}

        {/* ── Archives ── */}
        {activeTab !== "flashcards" && archivedSeries.length > 0 && (
          <div className="mt-6 pt-4 border-t border-white/8">
            <button onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 text-[11px] font-semibold text-white/30 hover:text-white/50 transition-colors mb-2">
              <EyeOff size={12} />
              Archives ({archivedSeries.length})
              <ChevronDown size={12} className={`transition-transform ${showArchived ? "rotate-180" : ""}`} />
            </button>
            {showArchived && (
              <div className="space-y-2">
                {archivedSeries.map((s) => (
                  <div key={s.id} className="rounded-xl border border-white/5 bg-white/2 p-3 flex items-start gap-3 opacity-60">
                    <input type="checkbox" checked={checkedSerieIds.has(s.id)} onChange={() => toggleCheckedSerie(s.id)}
                      className="shrink-0 mt-1 rounded border-white/20 bg-white/5 text-[#C9A84C] focus:ring-[#C9A84C]/30" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white/60 truncate">{s.name}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{s.nb_questions} question{s.nb_questions !== 1 ? "s" : ""} · {TYPE_CONFIG[s.type as SerieType]?.label ?? s.type}</p>
                    </div>
                    <button onClick={() => { toggleSerieVisible(s.id, true); setSeries((prev) => prev.map((x) => x.id === s.id ? { ...x, visible: true } : x)); }}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors" title="Restaurer">
                      <Eye size={12} />
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors" title="Supprimer">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Serie Modal */}
      {showNewSerie && (
        <NewSerieModal
          initialType={newSerieType}
          coursList={cours}
          matiereId={matiereId}
          defaultAnnee={selectedAnnee}
          availableSections={availableSections}
          onSaved={() => { setRefreshKey((k) => k + 1); setShowNewSerie(false); }}
          onClose={() => setShowNewSerie(false)}
        />
      )}

      {/* AI Modal */}
      {showAI && (
        <SmartAIModal
          chapters={chapters}
          coursList={cours}
          matiereName={dossierName}
          availableSections={availableSections}
          onSaved={() => setRefreshKey((k) => k + 1)}
          onClose={() => setShowAI(false)}
        />
      )}

      {showImportExoteach && (
        <ImportExoteachModal
          coursId=""
          matiereId={matiereId}
          defaultType={activeTab !== "flashcards" ? activeTab : "annales"}
          onDone={() => { setShowImportExoteach(false); setRefreshKey((k) => k + 1); }}
          onClose={() => setShowImportExoteach(false)}
        />
      )}

      {/* Edit Serie Modal (legacy — pencil now opens FullSerieEditor via composeSerie) */}

      {/* Full Serie Editor */}
      {composeSerie && (
        <FullSerieEditor
          serie={composeSerie}
          coursList={cours}
          onSaved={() => setRefreshKey((k) => k + 1)}
          onClose={() => { setComposeSerie(null); setRefreshKey((k) => k + 1); }}
        />
      )}

      {/* ACC Check Modal */}
      {showAccCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8 shrink-0">
              <div className="flex items-center gap-2">
                <Search size={15} className="text-blue-400" />
                <span className="text-sm font-bold text-white">Vérificateur ACC — {dossierName}</span>
              </div>
              <button onClick={() => setShowAccCheck(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40"><X size={15} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <AccCheck
                dossierName={dossierName}
                existingSeries={seriesByType("annales")}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New Serie Modal ────────────────────────────────────────────────────────

function NewSerieModal({
  initialType, coursList, matiereId, defaultAnnee, availableSections, onSaved, onClose,
}: {
  initialType: SerieType;
  coursList: CoursBasic[];
  matiereId?: string | null;
  defaultAnnee?: string | null;
  availableSections?: string[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SerieType>(initialType);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [coursId, setCoursId] = useState<string>("");
  const [annee, setAnnee] = useState(defaultAnnee ?? "");
  const [timed, setTimed] = useState(false);
  const [duration, setDuration] = useState("30");
  const [scoreDefinitif, setScoreDefinitif] = useState(false);
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Le nom est requis"); return; }
    if (availableSections && selectedSections.size === 0) { setError("Choisissez au moins une section"); return; }
    setSaving(true);
    setError("");
    // Use first cours of selected sections as fallback, or first cours overall
    const sectionCours = availableSections && selectedSections.size > 0
      ? coursList.filter((c) => selectedSections.has(c.etiquettes?.[0] ?? ""))
      : coursList;
    const effectiveCoursId = coursId || sectionCours[0]?.id || coursList[0]?.id || null;
    const res = await createSerie({
      name: name.trim(),
      type,
      timed,
      duration_minutes: timed ? Number(duration) : null,
      score_definitif: scoreDefinitif,
      visible,
      cours_id: effectiveCoursId,
      matiere_id: effectiveCoursId ? null : (matiereId ?? null),
      annee: type === "annales" && annee.trim() ? annee.trim() : null,
      sections: selectedSections.size > 0 ? [...selectedSections] : undefined,
    });
    if ("error" in res) { setError(res.error ?? "Erreur"); setSaving(false); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl" style={{ backgroundColor: "#0e1e35" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Nouvelle série</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50"><X size={16} /></button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-400">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom */}
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Nom *</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)} required autoFocus
              className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25"
              placeholder="Nom de la série..."
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Type de série</label>
            <div className="grid grid-cols-2 gap-2">
              {(["annales", "qcm_supplementaires", "concours_blanc", "revision"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`py-2 px-3 rounded-lg text-[11px] font-bold border transition-colors text-left ${type === t ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                  {TYPE_LABELS_LOCAL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Année (only for annales) */}
          {type === "annales" && (
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Année universitaire</label>
              <input
                value={annee} onChange={(e) => setAnnee(e.target.value)}
                placeholder="2024-2025"
                className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50"
              />
            </div>
          )}

          {/* Sections (si link_rules) — multi-select */}
          {availableSections && availableSections.length > 0 && (
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Section(s) *</label>
              <div className="space-y-1.5 rounded-xl border border-white/10 p-2.5">
                {availableSections.map((s) => (
                  <label key={s} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition ${selectedSections.has(s) ? "bg-[#C9A84C]/15 border border-[#C9A84C]/30" : "border border-transparent hover:bg-white/5"}`}>
                    <input
                      type="checkbox"
                      checked={selectedSections.has(s)}
                      onChange={() => setSelectedSections((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; })}
                      className="h-3.5 w-3.5 rounded accent-[#C9A84C]"
                    />
                    <span className={`text-sm font-medium ${selectedSections.has(s) ? "text-[#C9A84C]" : "text-white/60"}`}>{s}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Toggles */}
          <div className="divide-y divide-white/8">
            <label className="flex items-center justify-between py-2.5 cursor-pointer">
              <span className="text-sm text-white/70">Visible pour les élèves</span>
              <button type="button" onClick={() => setVisible(!visible)}
                className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${visible ? "bg-[#C9A84C]" : "bg-white/15"}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${visible ? "translate-x-5" : ""}`} />
              </button>
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm hover:bg-white/5 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-[#0e1e35] font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#E8C97B] transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Créer la série
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
