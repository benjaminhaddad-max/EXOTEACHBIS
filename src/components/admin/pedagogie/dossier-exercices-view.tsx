"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Sparkles, Loader2, Check, AlertCircle, X, ChevronRight,
  Plus, Eye, EyeOff, BookOpen, Layers, PlusCircle, Trophy, BookMarked,
  Pencil, Trash2, GripVertical, ListPlus, ListMinus, Search,
  FileDown, FileUp, ChevronDown,
} from "lucide-react";
import type { Dossier, Cours } from "@/types/database";
import { MathText } from "@/components/ui/math-text";
import { getSeriesByDossier, getSerieQuestions, getBankQuestionsForSerie } from "@/app/(admin)/admin/pedagogie/actions";
import { toggleSerieVisible, deleteSerie, createSerie, updateSerie, updateSerieAnnee, addQuestionToSerie, removeQuestionFromSerie, createQuestion, updateQuestion } from "@/app/(admin)/admin/exercices/actions";
import { batchCreateQuestions } from "@/app/(admin)/admin/exercices/actions";
import { FlashcardsSection } from "./flashcards-section";

// ─── Types ────────────────────────────────────────────────────────────────

export type SerieType = "annales" | "qcm_supplementaires" | "concours_blanc" | "revision";

export type SerieSummary = {
  id: string; name: string; type: string; visible: boolean;
  timed: boolean; duration_minutes: number | null;
  score_definitif: boolean; cours_id: string | null;
  nb_questions: number; annee: string | null;
};

export type CoursBasic = { id: string; name: string; dossier_id: string };

const TYPE_CONFIG: Record<SerieType, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  annales:             { label: "Annales corrigées",   icon: <BookOpen size={14} />,   color: "text-amber-300",  bg: "bg-amber-500/15",  border: "border-amber-500/30" },
  qcm_supplementaires: { label: "QCM supplémentaires", icon: <PlusCircle size={14} />, color: "text-teal-300",   bg: "bg-teal-500/15",   border: "border-teal-500/30" },
  concours_blanc:      { label: "Concours blanc",      icon: <Trophy size={14} />,     color: "text-red-300",    bg: "bg-red-500/15",    border: "border-red-500/30" },
  revision:            { label: "Révision",            icon: <BookMarked size={14} />, color: "text-purple-300", bg: "bg-purple-500/15", border: "border-purple-500/30" },
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

function SmartAIModal({ chapters, matiereName, onSaved, onClose }: {
  chapters: Chapter[]; matiereName: string; onSaved: () => void; onClose: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [nb, setNb] = useState(10);
  const [diff, setDiff] = useState(3);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(chapters.map((c) => c.id)));
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
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Chapitres ({selectedIds.size}/{chapters.length})</label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedIds(new Set(chapters.map((c) => c.id)))} className="text-[10px] text-white/30 hover:text-white/60">Tout</button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-[10px] text-white/30 hover:text-white/60">Aucun</button>
                  </div>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto rounded-xl border border-white/8 p-2">
                  {chapters.map((c) => (
                    <label key={c.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/4 cursor-pointer">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => setSelectedIds((p) => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} className="mt-0.5 accent-[#C9A84C]" />
                      <div className="min-w-0"><p className="text-xs font-medium text-white truncate">{c.name}</p><p className="text-[10px] text-white/30 truncate">{c.path}</p></div>
                    </label>
                  ))}
                  {chapters.length === 0 && <p className="text-xs text-white/30 text-center py-3">Aucun cours disponible</p>}
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
            {([
              ["Chronométré", timed, (v: boolean) => setTimed(v)],
              ["Score définitif", scoreDefinitif, (v: boolean) => setScoreDefinitif(v)],
              ["Visible pour les élèves", visible, (v: boolean) => setVisible(v)],
            ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
              <label key={label} className="flex items-center justify-between py-2.5 cursor-pointer">
                <span className="text-sm text-white/70">{label}</span>
                <button type="button" onClick={() => set(!val)}
                  className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${val ? "bg-[#C9A84C]" : "bg-white/15"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? "translate-x-5" : ""}`} />
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
}: {
  serie: SerieSummary; coursList: CoursBasic[];
  onClose: () => void; onSaved: () => void;
  readonlyType?: boolean;
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

  // Questions
  const [serieQuestions, setSerieQuestions] = useState<any[]>([]);
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);
  const [loadingQ, setLoadingQ] = useState(true);
  const [expandedQ, setExpandedQ] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  // Import/Export
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const importRef = React.useRef<HTMLInputElement>(null);

  const coursId = serie.cours_id ?? coursList[0]?.id ?? "";

  const loadAll = useCallback(async () => {
    setLoadingQ(true);
    try {
      const [qs, bank] = await Promise.all([
        getSerieQuestions(serie.id),
        coursId ? getBankQuestionsForSerie(coursId, serie.id) : Promise.resolve([]),
      ]);
      setSerieQuestions(qs as any);
      setBankQuestions(bank as any);
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

  const handleAddQ = async (qId: string) => {
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
          {/* Import */}
          <input ref={importRef} type="file" accept=".docx" className="hidden" onChange={handleImport} />
          <button onClick={() => importRef.current?.click()} disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40">
            {importing ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
            Importer
          </button>
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

          {/* Right: Questions */}
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
              serieQuestions.map((q: any, idx: number) => {
                const isOpen = expandedQ.has(q.id);
                const opts = (q.options ?? []).sort((a: any, b: any) => a.order_index - b.order_index);
                return (
                  <div key={q.id} className="rounded-xl border border-white/8 bg-white/4 overflow-hidden">
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
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleRemoveQ(q.id)} disabled={removing === q.id}
                          title="Retirer de la série"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors disabled:opacity-40">
                          {removing === q.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-2 border-t border-white/8 space-y-1.5 bg-white/95 rounded-b-xl">
                        {q.image_url && (
                          <div className="flex justify-center py-3 px-4 mb-2 bg-white rounded-xl border border-gray-100">
                            <img src={q.image_url} alt="" className="max-h-52 object-contain" />
                          </div>
                        )}
                        {opts.map((opt: any) => (
                          <div key={opt.label} className={`text-xs px-3 py-2.5 rounded-lg flex items-start gap-2.5 ${opt.is_correct ? "bg-green-500 text-white" : "bg-red-50 text-gray-700 border border-red-100"}`}>
                            <span className={`font-bold shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${opt.is_correct ? "bg-white/20 text-white" : "bg-red-100 text-red-600"}`}>{opt.label}</span>
                            <div className="flex-1 min-w-0">
                              <MathText text={opt.text} className="font-medium" />
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

            {/* Bank questions */}
            <div className="pt-3 border-t border-white/8 space-y-2">
              {bankQuestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                    Questions disponibles ({bankQuestions.length})
                  </p>
                  {bankQuestions.map((q: any) => (
                    <div key={q.id} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <MathText text={q.text} className="text-xs text-white/50 line-clamp-1" />
                      </div>
                      <button onClick={() => handleAddQ(q.id)} disabled={adding === q.id}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#C9A84C]/20 text-[#C9A84C] text-[10px] font-bold hover:bg-[#C9A84C]/30 transition-colors disabled:opacity-40">
                        {adding === q.id ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                        Ajouter
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Annale Serie Card with year picker ────────────────────────────────────

function AnnaleSerieCard({ serie, anneesList, coursNameStr, onOpen, onEdit, onDelete, onAnneeChange }: {
  serie: SerieSummary; anneesList: string[]; coursNameStr: string;
  onOpen: () => void; onEdit: () => void; onDelete: () => void;
  onAnneeChange: (annee: string | null) => Promise<void>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [customAnnee, setCustomAnnee] = useState("");

  const handlePick = async (a: string | null) => {
    setShowPicker(false);
    await onAnneeChange(a);
  };

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3 flex items-start gap-3 hover:bg-white/5 transition-colors">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-white truncate">{serie.name}</p>
        </div>
        <p className="text-[10px] text-white/40 mt-0.5">
          {serie.nb_questions} question{serie.nb_questions !== 1 ? "s" : ""}
          {serie.timed && ` · ${serie.duration_minutes}min`}
          {serie.cours_id && <span className="text-white/25"> · {coursNameStr}</span>}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 relative">
        {/* Year badge — clickable */}
        <button onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}
          className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-colors ${serie.annee ? "bg-amber-500/15 text-amber-300 border-amber-500/25 hover:bg-amber-500/25" : "bg-white/5 text-white/30 border-white/10 hover:border-amber-400/30 hover:text-amber-300/60"}`}>
          {serie.annee ?? "+ année"}
        </button>
        {/* Picker dropdown */}
        {showPicker && (
          <div className="absolute right-0 top-7 z-50 min-w-[140px] rounded-xl border border-white/15 bg-[#0e1e35] shadow-2xl p-1.5 space-y-0.5"
            onClick={(e) => e.stopPropagation()}>
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
        <button onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
          title="Éditer la série">
          <Pencil size={12} />
        </button>
        <button onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
          title="Supprimer">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function DossierExercicesView({
  dossierId,
  dossierName,
  allDossiers,
  onNewSerie,
}: {
  dossierId: string;
  dossierName: string;
  allDossiers: Dossier[];
  onNewSerie?: (type: SerieType) => void;
}) {
  const [activeTab, setActiveTab] = useState<SerieType | "flashcards">("annales");
  const [series, setSeries] = useState<SerieSummary[]>([]);
  const [cours, setCours] = useState<CoursBasic[]>([]);
  const [matiereId, setMatiereId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [showNewSerie, setShowNewSerie] = useState(false);
  const [newSerieType, setNewSerieType] = useState<SerieType>("annales");
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editSerie, setEditSerie] = useState<SerieSummary | null>(null);
  const [composeSerie, setComposeSerie] = useState<SerieSummary | null>(null);
  const [selectedAnnee, setSelectedAnnee] = useState<string | null>(null);
  const [showAddAnnee, setShowAddAnnee] = useState(false);
  const [newAnnee, setNewAnnee] = useState("");

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

  const totalSeries = series.length;
  const totalQuestions = series.reduce((a, s) => a + (s.nb_questions ?? 0), 0);
  const chapters = buildChapters(dossierId, allDossiers, cours);
  const seriesByType = (type: SerieType) => series.filter((s) => s.type === type);
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

      {/* Header avec stats + bouton IA */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-white/8 space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/8 bg-white/3 p-3 text-center">
            <p className="text-xl font-bold text-[#C9A84C]">{loading ? "…" : totalSeries}</p>
            <p className="text-[10px] text-white/40">Séries</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/3 p-3 text-center">
            <p className="text-xl font-bold text-white">{loading ? "…" : totalQuestions}</p>
            <p className="text-[10px] text-white/40">Questions</p>
          </div>
        </div>
        {/* AI button */}
        <button onClick={() => setShowAI(true)} disabled={cours.length === 0}
          className="w-full flex items-center gap-2 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/6 px-3 py-2 hover:bg-[#C9A84C]/12 transition-colors disabled:opacity-40">
          <Sparkles size={14} className="text-[#C9A84C] shrink-0" />
          <span className="text-xs font-bold text-[#C9A84C]">Générer avec l&apos;IA</span>
          <span className="text-[10px] text-white/30 ml-1 truncate">— assigne automatiquement aux chapitres</span>
        </button>
      </div>

      {/* 5 Type Tabs (4 series + flashcards) */}
      <div className="shrink-0 flex border-b border-white/8">
        {TYPES.map((t) => {
          const cfg = TYPE_CONFIG[t];
          const count = seriesByType(t).length;
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 flex flex-col items-center py-2.5 px-1 text-center border-b-2 transition-colors ${activeTab === t ? `border-current ${cfg.color}` : "border-transparent text-white/30 hover:text-white/50"}`}>
              {cfg.icon}
              <span className="text-[9px] font-bold mt-1 leading-tight">{cfg.label}</span>
              {count > 0 && <span className={`text-[9px] rounded-full px-1.5 mt-0.5 font-bold ${activeTab === t ? cfg.bg + " " + cfg.color : "bg-white/10 text-white/30"}`}>{count}</span>}
            </button>
          );
        })}
        {/* Flashcards tab */}
        <button onClick={() => setActiveTab("flashcards")}
          className={`flex-1 flex flex-col items-center py-2.5 px-1 text-center border-b-2 transition-colors ${activeTab === "flashcards" ? "border-current text-indigo-300" : "border-transparent text-white/30 hover:text-white/50"}`}>
          <Layers size={14} />
          <span className="text-[9px] font-bold mt-1 leading-tight">Flashcards</span>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "flashcards" ? (
          <FlashcardsSection dossierId={dossierId} cours={cours.map(c => ({ id: c.id, name: c.name }))} />
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
                    onOpen={() => window.open(`/serie/${s.id}`, "_blank")}
                    onEdit={() => setComposeSerie(s)}
                    onDelete={() => handleDelete(s.id)}
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
          <>
            {seriesByType(activeTab).length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-white/8 p-6 text-center">
                {TYPE_CONFIG[activeTab].icon}
                <p className="text-xs text-white/30 mt-2">Aucune série &quot;{TYPE_CONFIG[activeTab].label}&quot;</p>
                <button onClick={() => { setNewSerieType(activeTab); setShowNewSerie(true); }}
                  className={`mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${TYPE_CONFIG[activeTab].bg} ${TYPE_CONFIG[activeTab].color} ${TYPE_CONFIG[activeTab].border} border`}>
                  <Plus size={12} /> Créer une série
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {seriesByType(activeTab).map((s) => (
                  <div key={s.id} className="rounded-xl border border-white/8 bg-white/3 p-3 flex items-start gap-3 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => window.open(`/serie/${s.id}`, "_blank")}>
                      <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {s.nb_questions} question{s.nb_questions !== 1 ? "s" : ""}
                        {s.timed && ` · ${s.duration_minutes}min`}
                        {s.cours_id && <span className="text-white/25"> · {coursName(s.cours_id)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setComposeSerie(s)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                        title="Éditer la série">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDelete(s.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                        title="Supprimer">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={() => { setNewSerieType(activeTab); setShowNewSerie(true); }}
                  className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed text-xs font-semibold transition-colors ${TYPE_CONFIG[activeTab].color} border-current/30 hover:bg-white/4`}>
                  <Plus size={12} /> Nouvelle série
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* New Serie Modal */}
      {showNewSerie && (
        <NewSerieModal
          initialType={newSerieType}
          coursList={cours}
          matiereId={matiereId}
          defaultAnnee={selectedAnnee}
          onSaved={() => { setRefreshKey((k) => k + 1); setShowNewSerie(false); }}
          onClose={() => setShowNewSerie(false)}
        />
      )}

      {/* AI Modal */}
      {showAI && (
        <SmartAIModal
          chapters={chapters}
          matiereName={dossierName}
          onSaved={() => setRefreshKey((k) => k + 1)}
          onClose={() => setShowAI(false)}
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
    </div>
  );
}

// ─── New Serie Modal ────────────────────────────────────────────────────────

function NewSerieModal({
  initialType, coursList, matiereId, defaultAnnee, onSaved, onClose,
}: {
  initialType: SerieType;
  coursList: CoursBasic[];
  matiereId?: string | null;
  defaultAnnee?: string | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SerieType>(initialType);
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
    setSaving(true);
    setError("");
    // Si "Toute la matière" (coursId vide), utiliser le 1er cours comme rattachement
    const effectiveCoursId = coursId || coursList[0]?.id || null;
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

          {/* Cours associé */}
          {coursList.length > 0 && (
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Cours associé <span className="font-normal text-white/30 normal-case">(optionnel)</span></label>
              <select
                value={coursId} onChange={(e) => setCoursId(e.target.value)}
                className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25"
              >
                <option value="">— Toute la matière (pas de chapitre spécifique) —</option>
                {coursList.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0e1e35] text-white">{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Toggles */}
          <div className="divide-y divide-white/8">
            {([
              ["Chronométré", timed, (v: boolean) => setTimed(v)],
              ["Score définitif", scoreDefinitif, (v: boolean) => setScoreDefinitif(v)],
              ["Visible pour les élèves", visible, (v: boolean) => setVisible(v)],
            ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
              <label key={label} className="flex items-center justify-between py-2.5 cursor-pointer">
                <span className="text-sm text-white/70">{label}</span>
                <button type="button" onClick={() => set(!val)}
                  className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${val ? "bg-[#C9A84C]" : "bg-white/15"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? "translate-x-5" : ""}`} />
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
