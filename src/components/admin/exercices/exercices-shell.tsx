"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import {
  Plus, Pencil, Trash2, X, Check, AlertCircle, Loader2,
  BookOpen, Layers, ChevronRight, ChevronDown, Eye, EyeOff,
  Sparkles, Play, GripVertical, ListPlus, ListMinus,
} from "lucide-react";
import type { Question, Option, Serie } from "@/types/database";
import {
  createQuestion, updateQuestion, deleteQuestion,
  createSerie, updateSerie, deleteSerie,
  addQuestionToSerie, removeQuestionFromSerie,
  reorderSerieQuestions, batchCreateQuestions, toggleSerieVisible,
} from "@/app/(admin)/admin/exercices/actions";

// ─── Types ─────────────────────────────────────────────────────────────────

export type QuestionWithOptions = Question & { options: Option[] };
export type SerieWithCount = Serie & { nb_questions: number };

type DossierRaw = { id: string; name: string; color: string | null; parent_id: string | null; order_index: number };
type CoursRaw = { id: string; name: string; dossier_id: string | null; order_index: number };

type DossierNode = DossierRaw & { children: DossierNode[]; cours: CoursRaw[] };

type Modal =
  | { type: "create_question"; coursId?: string }
  | { type: "edit_question"; question: QuestionWithOptions }
  | { type: "create_serie"; coursId?: string }
  | { type: "edit_serie"; serie: SerieWithCount }
  | { type: "composer"; serie: SerieWithCount }
  | { type: "generate_ai"; coursId?: string }
  | null;

type Toast = { message: string; kind: "success" | "error" } | null;

const DIFF_LABELS = ["", "Très facile", "Facile", "Moyen", "Difficile", "Très difficile"];
const DIFF_COLORS = ["", "text-green-400", "text-green-300", "text-yellow-400", "text-orange-400", "text-red-400"];
const TYPE_LABELS: Record<string, string> = { entrainement: "Entraînement", concours_blanc: "Concours blanc", revision: "Révision", annales: "Annales corrigées", qcm_supplementaires: "QCM supplémentaires" };
const TYPE_COLORS: Record<string, string> = {
  entrainement: "bg-blue-500/20 text-blue-300",
  concours_blanc: "bg-red-500/20 text-red-300",
  revision: "bg-purple-500/20 text-purple-300",
};
const LABELS: ("A" | "B" | "C" | "D" | "E")[] = ["A", "B", "C", "D", "E"];

// ─── Tree builder ──────────────────────────────────────────────────────────

function buildTree(dossiers: DossierRaw[], cours: CoursRaw[], parentId: string | null = null): DossierNode[] {
  return dossiers
    .filter((d) => d.parent_id === parentId)
    .sort((a, b) => a.order_index - b.order_index)
    .map((d) => ({
      ...d,
      children: buildTree(dossiers, cours, d.id),
      cours: cours.filter((c) => c.dossier_id === d.id).sort((a, b) => a.order_index - b.order_index),
    }));
}

// ─── Tree components ───────────────────────────────────────────────────────

function CoursItem({
  cours, nbQ, nbS, selected, onClick,
}: {
  cours: CoursRaw; nbQ: number; nbS: number; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 py-1.5 pr-3 rounded-lg text-left transition-colors"
      style={{
        paddingLeft: 32,
        backgroundColor: selected ? "rgba(227,194,134,0.15)" : "transparent",
      }}
      onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
    >
      <BookOpen size={11} className="shrink-0" style={{ color: selected ? "#C9A84C" : "rgba(255,255,255,0.35)" }} />
      <span className="flex-1 text-xs truncate" style={{ color: selected ? "#C9A84C" : "rgba(255,255,255,0.7)" }}>
        {cours.name}
      </span>
      <div className="flex gap-1 shrink-0">
        {nbQ > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">{nbQ}Q</span>}
        {nbS > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">{nbS}S</span>}
      </div>
    </button>
  );
}

function DossierItem({
  node, depth, selectedCoursId, onSelectCours, qByCours, sByCours,
}: {
  node: DossierNode; depth: number; selectedCoursId: string | null;
  onSelectCours: (id: string) => void;
  qByCours: Map<string, number>; sByCours: Map<string, number>;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasContent = node.children.length > 0 || node.cours.length > 0;
  const totalQ = useMemo(() => {
    function sum(n: DossierNode): number {
      return n.cours.reduce((s, c) => s + (qByCours.get(c.id) ?? 0), 0) + n.children.reduce((s, ch) => s + sum(ch), 0);
    }
    return sum(node);
  }, [node, qByCours]);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1.5 rounded-lg cursor-pointer transition-colors pr-2"
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => setExpanded((p) => !p)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
      >
        <div className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
          {hasContent ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : null}
        </div>
        {node.color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node.color }} />}
        <span className="flex-1 text-xs font-semibold truncate text-white/80">{node.name}</span>
        {totalQ > 0 && <span className="text-[9px] text-white/30 shrink-0">{totalQ}q</span>}
      </div>
      {expanded && hasContent && (
        <div>
          {node.cours.map((c) => (
            <CoursItem
              key={c.id}
              cours={c}
              nbQ={qByCours.get(c.id) ?? 0}
              nbS={sByCours.get(c.id) ?? 0}
              selected={selectedCoursId === c.id}
              onClick={() => onSelectCours(c.id)}
            />
          ))}
          {node.children.map((child) => (
            <DossierItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedCoursId={selectedCoursId}
              onSelectCours={onSelectCours}
              qByCours={qByCours}
              sByCours={sByCours}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Question card ─────────────────────────────────────────────────────────

function QuestionCard({
  q, onEdit, onDelete,
}: {
  q: QuestionWithOptions; onEdit: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 overflow-hidden">
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-white/4 transition-colors"
        onClick={() => setOpen((p) => !p)}
      >
        <ChevronRight size={14} className={`mt-0.5 text-white/40 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/90 line-clamp-2">{q.text}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
              {q.type === "qcm_unique" ? "Réponse unique" : "Réponses multiples"}
            </span>
            {q.difficulty && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full bg-white/10 ${DIFF_COLORS[q.difficulty]}`}>
                ★ {DIFF_LABELS[q.difficulty]}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-white/8">
          {(q.options ?? []).sort((a, b) => a.order_index - b.order_index).map((opt) => (
            <div key={opt.id} className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded-lg ${opt.is_correct ? "bg-green-500/15 text-green-300" : "text-white/50"}`}>
              <span className="font-bold shrink-0 w-4">{opt.label}.</span>
              <span>{opt.text}</span>
              {opt.is_correct && <Check size={11} className="ml-auto shrink-0 mt-0.5" />}
            </div>
          ))}
          {q.explanation && (
            <p className="text-xs text-white/40 italic pt-1 border-t border-white/8">{q.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Serie card ─────────────────────────────────────────────────────────────

function SerieCard({
  s, onEdit, onDelete, onToggleVisible, onCompose,
}: {
  s: SerieWithCount; onEdit: () => void; onDelete: () => void;
  onToggleVisible: (v: boolean) => void; onCompose: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{s.name}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[s.type]}`}>
            {TYPE_LABELS[s.type]}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-white/40">
          <span>{s.nb_questions} question{s.nb_questions !== 1 ? "s" : ""}</span>
          {s.timed && <span>{s.duration_minutes}min</span>}
          {s.score_definitif && <span>Définitif</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onCompose}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-medium transition-colors"
        >
          <GripVertical size={12} /> Composer
        </button>
        <button
          onClick={() => onToggleVisible(!s.visible)}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
          title={s.visible ? "Masquer" : "Rendre visible"}
        >
          {s.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Question Form (modal) ─────────────────────────────────────────────────

function QuestionForm({
  initial, coursId, cours, onSave, onClose,
}: {
  initial?: QuestionWithOptions; coursId?: string; cours: CoursRaw[];
  onSave: (data: any) => Promise<void>; onClose: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [type, setType] = useState<"qcm_unique" | "qcm_multiple">(initial?.type ?? "qcm_unique");
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 2);
  const [selectedCoursId, setSelectedCoursId] = useState(initial?.cours_id ?? coursId ?? "");
  const [options, setOptions] = useState<{ label: string; text: string; is_correct: boolean; justification: string }[]>(
    initial?.options?.sort((a, b) => a.order_index - b.order_index).map((o) => ({
      label: o.label, text: o.text, is_correct: o.is_correct, justification: (o as any).justification ?? ""
    }))
    ?? LABELS.map((l) => ({ label: l, text: "", is_correct: false, justification: "" }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateOption = (i: number, field: string, value: string | boolean) =>
    setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o));

  const setCorrect = (i: number, val: boolean) => updateOption(i, "is_correct", val);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!text.trim()) { setError("Le texte est requis"); return; }
    if (options.some((o) => !o.text.trim())) { setError("Toutes les propositions doivent avoir un texte"); return; }
    setSaving(true);
    await onSave({ text, explanation, type: "qcm_multiple", difficulty, cours_id: selectedCoursId || null, matiere_id: null, options });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Cours */}
      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Cours associé</label>
        <select
          value={selectedCoursId}
          onChange={(e) => setSelectedCoursId(e.target.value)}
          className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]/50"
        >
          <option value="">— Sans cours —</option>
          {cours.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Type */}
      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Type</label>
        <div className="flex gap-2">
          {(["qcm_unique", "qcm_multiple"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${type === t ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/10 text-white/50 hover:border-white/20"}`}>
              {t === "qcm_unique" ? "Réponse unique" : "Réponses multiples"}
            </button>
          ))}
        </div>
      </div>

      {/* Text */}
      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Question *</label>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={3}
          className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#C9A84C]/50 resize-none"
          placeholder="Énoncé de la question..."
        />
      </div>

      {/* Options — format PASS/LAS : V/F + justification par proposition */}
      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">
          Propositions A–E (VRAI / FAUX)
        </label>
        <div className="space-y-3">
          {options.map((opt, i) => (
            <div key={opt.label} className={`rounded-xl border transition-colors ${opt.is_correct ? "border-green-500/30 bg-green-500/8" : "border-white/10 bg-white/4"}`}>
              {/* Label + texte + VRAI/FAUX */}
              <div className="flex items-start gap-2 px-3 pt-3 pb-2">
                <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${opt.is_correct ? "bg-green-500 text-white" : "bg-white/10 text-white/50"}`}>
                  {opt.label}
                </span>
                <input
                  value={opt.text} onChange={(e) => updateOption(i, "text", e.target.value)}
                  className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                  placeholder={`Proposition ${opt.label}...`}
                />
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => setCorrect(i, true)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${opt.is_correct ? "bg-green-500 border-green-500 text-white" : "border-white/20 text-white/40 hover:border-green-400 hover:text-green-400"}`}>
                    VRAI
                  </button>
                  <button type="button" onClick={() => setCorrect(i, false)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${!opt.is_correct ? "bg-red-500 border-red-500 text-white" : "border-white/20 text-white/40 hover:border-red-400 hover:text-red-400"}`}>
                    FAUX
                  </button>
                </div>
              </div>
              {/* Justification */}
              <div className="px-3 pb-3">
                <input
                  value={opt.justification} onChange={(e) => updateOption(i, "justification", e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/60 placeholder-white/20 focus:outline-none focus:border-white/20"
                  placeholder={`Justification ${opt.label} (optionnelle)...`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Difficulté</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((d) => (
            <button key={d} type="button" onClick={() => setDifficulty(d)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${difficulty === d ? "border-[#C9A84C]/50 bg-[#C9A84C]/15 text-[#C9A84C]" : "border-white/10 text-white/40 hover:border-white/20"}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Explanation */}
      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Explication (optionnelle)</label>
        <textarea
          value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2}
          className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#C9A84C]/50 resize-none"
          placeholder="Explication affichée après réponse..."
        />
      </div>

      {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12} />{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm hover:bg-white/5 transition-colors">
          Annuler
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-[#0e1e35] font-bold text-sm hover:bg-[#A8892E] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {initial ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </form>
  );
}

// ─── Serie Form ────────────────────────────────────────────────────────────

function SerieForm({
  initial, coursId, cours, onSave, onClose,
}: {
  initial?: SerieWithCount; coursId?: string; cours: CoursRaw[];
  onSave: (data: any) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<"entrainement" | "concours_blanc" | "revision" | "annales" | "qcm_supplementaires">(initial?.type as any ?? "annales");
  const [timed, setTimed] = useState(initial?.timed ?? false);
  const [duration, setDuration] = useState(String(initial?.duration_minutes ?? 30));
  const [scoreDefinitif, setScoreDefinitif] = useState(initial?.score_definitif ?? false);
  const [visible, setVisible] = useState(initial?.visible ?? true);
  const [selectedCoursId, setSelectedCoursId] = useState(initial?.cours_id ?? coursId ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      name, type, timed,
      duration_minutes: timed ? Number(duration) : null,
      score_definitif: scoreDefinitif, visible,
      cours_id: selectedCoursId || null, matiere_id: null,
    });
    setSaving(false);
  };

  const toggle = (label: string, val: boolean, set: (v: boolean) => void) => (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm text-white/70">{label}</span>
      <button type="button" onClick={() => set(!val)}
        className={`w-10 h-5.5 rounded-full flex items-center px-0.5 transition-colors ${val ? "bg-[#C9A84C]" : "bg-white/15"}`}>
        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? "translate-x-[18px]" : ""}`} />
      </button>
    </label>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Nom *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#C9A84C]/50"
          placeholder="Nom de la série..." />
      </div>

      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(["annales", "qcm_supplementaires", "concours_blanc", "revision"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`py-2 px-3 rounded-lg text-[11px] font-semibold border text-left transition-colors ${type === t ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/10 text-white/50 hover:border-white/20"}`}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">
          Cours associé <span className="font-normal text-white/30 normal-case">(optionnel)</span>
        </label>
        <select value={selectedCoursId} onChange={(e) => setSelectedCoursId(e.target.value)}
          className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]/50">
          <option value="">— Toute la matière (pas de chapitre spécifique) —</option>
          {cours.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="divide-y divide-white/8">
        {toggle("Chronométré", timed, setTimed)}
        {timed && (
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-white/70">Durée (minutes)</span>
            <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={1} max={300}
              className="w-20 bg-white/8 border border-white/12 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none" />
          </div>
        )}
        {toggle("Score définitif", scoreDefinitif, setScoreDefinitif)}
        {toggle("Visible pour les élèves", visible, setVisible)}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm hover:bg-white/5 transition-colors">
          Annuler
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-[#0e1e35] font-bold text-sm hover:bg-[#A8892E] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {initial ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </form>
  );
}

// ─── Composer Modal ────────────────────────────────────────────────────────

function ComposerModal({
  serie, allQuestions, onClose,
}: {
  serie: SerieWithCount; allQuestions: QuestionWithOptions[]; onClose: () => void;
}) {
  const [inSerie, setInSerie] = useState<QuestionWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [, startTransition] = useTransition();

  useMemo(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase
        .from("series_questions")
        .select("question_id, order_index, questions(*, options(*))")
        .eq("series_id", serie.id)
        .order("order_index");
      if (data) {
        setInSerie(data.filter((r: any) => r.questions).map((r: any) => r.questions as QuestionWithOptions));
      }
      setLoading(false);
    }
    load();
  }, [serie.id]);

  const inSerieIds = useMemo(() => new Set(inSerie.map((q) => q.id)), [inSerie]);
  const available = useMemo(
    () => allQuestions.filter((q) => !inSerieIds.has(q.id) && (!search || q.text.toLowerCase().includes(search.toLowerCase()))),
    [allQuestions, inSerieIds, search]
  );

  const handleAdd = (q: QuestionWithOptions) => {
    startTransition(async () => {
      await addQuestionToSerie(serie.id, q.id, inSerie.length);
      setInSerie((prev) => [...prev, q]);
    });
  };

  const handleRemove = (q: QuestionWithOptions) => {
    startTransition(async () => {
      await removeQuestionFromSerie(serie.id, q.id);
      setInSerie((prev) => prev.filter((x) => x.id !== q.id));
    });
  };

  return (
    <div className="flex gap-4 h-[500px]">
      {/* In serie */}
      <div className="flex-1 flex flex-col">
        <p className="text-xs text-white/50 font-semibold uppercase tracking-wider mb-2">Dans la série ({inSerie.length})</p>
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-white/30" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {inSerie.length === 0 && <p className="text-xs text-white/30 text-center py-8">Aucune question</p>}
            {inSerie.map((q, i) => (
              <div key={q.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/5 border border-white/8">
                <span className="text-xs text-white/30 w-5 shrink-0">{i + 1}.</span>
                <span className="flex-1 text-xs text-white/80 line-clamp-2">{q.text}</span>
                <button onClick={() => handleRemove(q)} className="shrink-0 p-1 rounded hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors">
                  <ListMinus size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px bg-white/8" />

      {/* Available */}
      <div className="flex-1 flex flex-col">
        <p className="text-xs text-white/50 font-semibold uppercase tracking-wider mb-2">Banque ({available.length})</p>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..."
          className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none mb-2" />
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {available.map((q) => (
            <div key={q.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/5 border border-white/8">
              <span className="flex-1 text-xs text-white/80 line-clamp-2">{q.text}</span>
              <button onClick={() => handleAdd(q)} className="shrink-0 p-1 rounded hover:bg-green-500/20 text-white/30 hover:text-green-400 transition-colors">
                <ListPlus size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AI Generate Modal ─────────────────────────────────────────────────────

function AIModal({
  coursId, cours, onGenerated, onClose,
}: {
  coursId?: string; cours: CoursRaw[]; onGenerated: () => void; onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [nbQ, setNbQ] = useState(10);
  const [qType, setQType] = useState<"qcm_unique" | "qcm_multiple" | "mixed">("qcm_unique");
  const [selectedCoursId, setSelectedCoursId] = useState(coursId ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleGenerate = async () => {
    if (!subject.trim()) { setError("Décris le sujet"); return; }
    setError(""); setGenerating(true);
    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, nbQ, qType, coursId: selectedCoursId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setSuccess(`${data.count} questions créées !`);
      setTimeout(() => { onGenerated(); onClose(); }, 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Cours associé</label>
        <select value={selectedCoursId} onChange={(e) => setSelectedCoursId(e.target.value)}
          className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]/50">
          <option value="">— Sans cours —</option>
          {cours.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Sujet / contenu *</label>
        <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={4}
          className="w-full bg-white/8 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#C9A84C]/50 resize-none"
          placeholder="Ex: Colle sur la régulation de la glycémie, les hormones pancréatiques, l'insuline et le glucagon..." />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Nb de questions</label>
          <div className="flex gap-1.5">
            {[5, 10, 20, 30].map((n) => (
              <button key={n} type="button" onClick={() => setNbQ(n)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${nbQ === n ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/10 text-white/50"}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <label className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1.5 block">Type</label>
          <div className="flex gap-1.5">
            {(["qcm_unique", "qcm_multiple", "mixed"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setQType(t)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-colors ${qType === t ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]" : "border-white/10 text-white/50"}`}>
                {t === "qcm_unique" ? "Unique" : t === "qcm_multiple" ? "Multiple" : "Mixte"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
      {success && <p className="text-green-400 text-xs flex items-center gap-1"><Check size={12} />{success}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm hover:bg-white/5 transition-colors">
          Annuler
        </button>
        <button type="button" onClick={handleGenerate} disabled={generating}
          className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {generating ? "Génération..." : "Générer"}
        </button>
      </div>
    </div>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────

function ModalWrapper({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 p-6 shadow-2xl" style={{ backgroundColor: "#0e1e35" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main Shell ────────────────────────────────────────────────────────────

export function ExercicesShell({
  dossiers, cours, initialQuestions, initialSeries,
}: {
  dossiers: DossierRaw[]; cours: CoursRaw[];
  initialQuestions: QuestionWithOptions[]; initialSeries: SerieWithCount[];
}) {
  const [questions, setQuestions] = useState<QuestionWithOptions[]>(initialQuestions);
  const [series, setSeries] = useState<SerieWithCount[]>(initialSeries);
  const [selectedCoursId, setSelectedCoursId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();

  const showToast = useCallback((message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const tree = useMemo(() => buildTree(dossiers, cours), [dossiers, cours]);

  const qByCours = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of questions) if (q.cours_id) m.set(q.cours_id, (m.get(q.cours_id) ?? 0) + 1);
    return m;
  }, [questions]);

  const sByCours = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of series) if (s.cours_id) m.set(s.cours_id, (m.get(s.cours_id) ?? 0) + 1);
    return m;
  }, [series]);

  const currentQuestions = useMemo(
    () => selectedCoursId ? questions.filter((q) => q.cours_id === selectedCoursId) : questions,
    [questions, selectedCoursId]
  );

  const currentSeries = useMemo(
    () => selectedCoursId ? series.filter((s) => s.cours_id === selectedCoursId) : series,
    [series, selectedCoursId]
  );

  const currentCoursName = useMemo(
    () => selectedCoursId ? (cours.find((c) => c.id === selectedCoursId)?.name ?? "") : null,
    [cours, selectedCoursId]
  );

  const refreshQuestions = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("questions").select("*, options(*)").order("created_at", { ascending: false });
    if (data) setQuestions(data as QuestionWithOptions[]);
  }, []);

  const refreshSeries = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("series").select("*, series_questions(question_id)").order("created_at", { ascending: false });
    if (data) setSeries(data.map((s: any) => ({ ...s, nb_questions: Array.isArray(s.series_questions) ? s.series_questions.length : 0, series_questions: undefined })));
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────────

  const handleSaveQuestion = async (data: any, editId?: string) => {
    let res;
    if (editId) {
      res = await updateQuestion(editId, data);
    } else {
      res = await createQuestion(data);
    }
    if ("error" in res) { showToast(res.error!, "error"); return; }
    await refreshQuestions();
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
    let res;
    if (editId) {
      res = await updateSerie(editId, data);
    } else {
      res = await createSerie(data);
    }
    if ("error" in res) { showToast(res.error!, "error"); return; }
    await refreshSeries();
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

  const handleToggleVisible = (id: string, visible: boolean) => {
    startTransition(async () => {
      const res = await toggleSerieVisible(id, visible);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setSeries((prev) => prev.map((s) => s.id === id ? { ...s, visible } : s));
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0" style={{ height: "calc(100vh - 8rem)" }}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.kind === "success" ? "bg-green-600/90" : "bg-red-600/90"} text-white`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* ── LEFT: Tree ── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-white/8">
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/8">
          <h1 className="text-base font-bold text-white">Exercices QCM</h1>
          <p className="text-[11px] text-white/40 mt-0.5">
            {questions.length} questions · {series.length} séries
          </p>
        </div>

        {/* Global option */}
        <button
          onClick={() => setSelectedCoursId(null)}
          className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/8 text-left transition-colors"
          style={{ backgroundColor: selectedCoursId === null ? "rgba(227,194,134,0.1)" : "transparent" }}
        >
          <Layers size={14} style={{ color: selectedCoursId === null ? "#C9A84C" : "rgba(255,255,255,0.4)" }} />
          <span className="text-sm font-semibold" style={{ color: selectedCoursId === null ? "#C9A84C" : "rgba(255,255,255,0.6)" }}>
            Banque globale
          </span>
          <span className="ml-auto text-[10px] text-white/30">{questions.length}q</span>
        </button>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {tree.map((node) => (
            <DossierItem
              key={node.id}
              node={node}
              depth={0}
              selectedCoursId={selectedCoursId}
              onSelectCours={setSelectedCoursId}
              qByCours={qByCours}
              sByCours={sByCours}
            />
          ))}
        </div>
      </div>

      {/* ── RIGHT: Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Right header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white">
              {currentCoursName ?? "Banque globale"}
            </h2>
            <p className="text-[11px] text-white/40 mt-0.5">
              {currentQuestions.length} question{currentQuestions.length !== 1 ? "s" : ""} · {currentSeries.length} série{currentSeries.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setModal({ type: "generate_ai", coursId: selectedCoursId ?? undefined })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Sparkles size={13} /> Générer par IA
            </button>
            <button
              onClick={() => setModal({ type: "create_serie", coursId: undefined })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus size={13} /> Série
            </button>
            <button
              onClick={() => setModal({ type: "create_question", coursId: selectedCoursId ?? undefined })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C] hover:bg-[#A8892E] text-[#0e1e35] text-xs font-bold rounded-lg transition-colors"
            >
              <Plus size={13} /> Question
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Questions section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                Questions <span className="text-white/30 normal-case font-normal">({currentQuestions.length})</span>
              </h3>
            </div>
            {currentQuestions.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-white/8 p-8 text-center">
                <BookOpen size={24} className="mx-auto text-white/20 mb-3" />
                <p className="text-sm text-white/30">Aucune question{selectedCoursId ? " pour ce cours" : ""}</p>
                <button onClick={() => setModal({ type: "create_question", coursId: selectedCoursId ?? undefined })}
                  className="mt-3 text-xs text-[#C9A84C] hover:underline">
                  + Ajouter une question
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {currentQuestions.map((q) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    onEdit={() => setModal({ type: "edit_question", question: q })}
                    onDelete={() => handleDeleteQuestion(q.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Séries section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                Séries <span className="text-white/30 normal-case font-normal">({currentSeries.length})</span>
              </h3>
            </div>
            {currentSeries.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-white/8 p-8 text-center">
                <Layers size={24} className="mx-auto text-white/20 mb-3" />
                <p className="text-sm text-white/30">Aucune série{selectedCoursId ? " pour ce cours" : ""}</p>
                <button onClick={() => setModal({ type: "create_serie", coursId: undefined })}
                  className="mt-3 text-xs text-[#C9A84C] hover:underline">
                  + Créer une série
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {currentSeries.map((s) => (
                  <SerieCard
                    key={s.id}
                    s={s}
                    onEdit={() => setModal({ type: "edit_serie", serie: s })}
                    onDelete={() => handleDeleteSerie(s.id)}
                    onToggleVisible={(v) => handleToggleVisible(s.id, v)}
                    onCompose={() => setModal({ type: "composer", serie: s })}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Modals ── */}
      {modal?.type === "create_question" && (
        <ModalWrapper title="Nouvelle question" onClose={() => setModal(null)}>
          <QuestionForm
            coursId={modal.coursId} cours={cours}
            onSave={(data) => handleSaveQuestion(data)}
            onClose={() => setModal(null)}
          />
        </ModalWrapper>
      )}
      {modal?.type === "edit_question" && (
        <ModalWrapper title="Modifier la question" onClose={() => setModal(null)}>
          <QuestionForm
            initial={modal.question} cours={cours}
            onSave={(data) => handleSaveQuestion(data, modal.question.id)}
            onClose={() => setModal(null)}
          />
        </ModalWrapper>
      )}
      {modal?.type === "create_serie" && (
        <ModalWrapper title="Nouvelle série" onClose={() => setModal(null)}>
          <SerieForm
            coursId={modal.coursId} cours={cours}
            onSave={(data) => handleSaveSerie(data)}
            onClose={() => setModal(null)}
          />
        </ModalWrapper>
      )}
      {modal?.type === "edit_serie" && (
        <ModalWrapper title="Modifier la série" onClose={() => setModal(null)}>
          <SerieForm
            initial={modal.serie} cours={cours}
            onSave={(data) => handleSaveSerie(data, modal.serie.id)}
            onClose={() => setModal(null)}
          />
        </ModalWrapper>
      )}
      {modal?.type === "composer" && (
        <ModalWrapper title={`Composer · ${modal.serie.name}`} onClose={() => setModal(null)}>
          <ComposerModal
            serie={modal.serie}
            allQuestions={questions}
            onClose={() => setModal(null)}
          />
        </ModalWrapper>
      )}
      {modal?.type === "generate_ai" && (
        <ModalWrapper title="Générer des questions par IA" onClose={() => setModal(null)}>
          <AIModal
            coursId={modal.coursId} cours={cours}
            onGenerated={refreshQuestions}
            onClose={() => setModal(null)}
          />
        </ModalWrapper>
      )}
    </div>
  );
}
