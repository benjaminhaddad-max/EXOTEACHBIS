"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight, ChevronDown, BookOpen, Layers, FileText,
  Play, Shuffle, AlertCircle, Loader2, Check, Minus,
} from "lucide-react";
import type { DossierNode, CoursNode } from "@/app/(eleve)/exercices/actions";
import { buildTrainingSession } from "@/app/(eleve)/exercices/actions";

// ─── Selection helpers ─────────────────────────────────────────────────────────

function getAllCoursIds(node: DossierNode): string[] {
  const ids = node.cours.map((c) => c.id);
  for (const child of node.children) ids.push(...getAllCoursIds(child));
  return ids;
}

function getEffectiveCoursIds(
  selectedIds: Set<string>,
  tree: DossierNode[]
): string[] {
  const result = new Set<string>();

  function walk(node: DossierNode, parentSelected: boolean) {
    const thisSelected = parentSelected || selectedIds.has(node.id);
    for (const c of node.cours) {
      if (thisSelected || selectedIds.has(c.id)) result.add(c.id);
    }
    for (const child of node.children) walk(child, thisSelected);
  }

  for (const root of tree) walk(root, false);
  return [...result];
}

function countEffectiveQuestions(
  selectedIds: Set<string>,
  tree: DossierNode[],
  allCours: CoursNode[]
): number {
  const ids = new Set(getEffectiveCoursIds(selectedIds, tree));
  return allCours.filter((c) => ids.has(c.id)).reduce((s, c) => s + c.nb_questions, 0);
}

type CheckState = "checked" | "unchecked" | "indeterminate";

function getDossierCheckState(node: DossierNode, selectedIds: Set<string>): CheckState {
  if (selectedIds.has(node.id)) return "checked";
  const allIds = getAllCoursIds(node);
  if (allIds.length === 0) return "unchecked";
  const selected = allIds.filter((id) => selectedIds.has(id)).length;
  if (selected === 0) {
    // check if any child dossier is selected or indeterminate
    function anyDown(n: DossierNode): boolean {
      if (selectedIds.has(n.id)) return true;
      return n.children.some(anyDown);
    }
    return node.children.some(anyDown) || selected > 0 ? "unchecked" : "unchecked";
  }
  if (selected === allIds.length) return "checked";
  return "indeterminate";
}

// ─── CheckBox UI ──────────────────────────────────────────────────────────────

function Checkbox({ state, size = 16 }: { state: CheckState; size?: number }) {
  if (state === "checked")
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded bg-[#0e1e35] flex items-center justify-center shrink-0"
      >
        <Check size={size * 0.65} className="text-white" strokeWidth={3} />
      </div>
    );
  if (state === "indeterminate")
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded border-2 border-[#0e1e35] bg-[#0e1e35]/15 flex items-center justify-center shrink-0"
      >
        <Minus size={size * 0.6} className="text-[#0e1e35]" strokeWidth={3} />
      </div>
    );
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded border-2 border-gray-300 group-hover:border-[#0e1e35]/50 shrink-0 transition-colors"
    />
  );
}

// ─── Tree nodes ───────────────────────────────────────────────────────────────

function CoursItem({
  cours,
  selected,
  depth,
  onToggle,
}: {
  cours: CoursNode;
  selected: boolean;
  depth: number;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(cours.id)}
      className="group w-full flex items-center gap-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-left"
      style={{ paddingLeft: depth * 14 + 26 }}
    >
      <Checkbox state={selected ? "checked" : "unchecked"} size={14} />
      <BookOpen size={11} className="text-gray-400 shrink-0" />
      <span className="flex-1 text-xs text-gray-700 truncate">{cours.name}</span>
      <span className="text-[10px] text-gray-400 mr-2 shrink-0">{cours.nb_questions} q.</span>
    </button>
  );
}

function DossierItem({
  node,
  depth,
  selectedIds,
  onToggleDossier,
  onToggleCours,
}: {
  node: DossierNode;
  depth: number;
  selectedIds: Set<string>;
  onToggleDossier: (n: DossierNode) => void;
  onToggleCours: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children.length > 0 || node.cours.length > 0;
  const checkState = getDossierCheckState(node, selectedIds);

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        {/* Expand button */}
        <button
          onClick={() => setExpanded((p) => !p)}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0"
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
          ) : (
            <span className="w-5" />
          )}
        </button>

        {/* Checkbox */}
        <button onClick={() => onToggleDossier(node)} className="shrink-0">
          <Checkbox state={checkState} size={15} />
        </button>

        {/* Color dot */}
        {node.color && (
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: node.color }}
          />
        )}

        {/* Name + count */}
        <button
          onClick={() => { onToggleDossier(node); setExpanded(true); }}
          className="flex-1 flex items-center gap-1.5 min-w-0 text-left"
        >
          <span className="text-sm font-semibold text-gray-800 truncate">{node.name}</span>
        </button>
        <span className="text-[10px] text-gray-400 shrink-0 mr-2">{node.total_questions} q.</span>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.cours.map((c) => (
            <CoursItem
              key={c.id}
              cours={c}
              selected={selectedIds.has(c.id)}
              depth={depth + 1}
              onToggle={onToggleCours}
            />
          ))}
          {node.children.map((child) => (
            <DossierItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              onToggleDossier={onToggleDossier}
              onToggleCours={onToggleCours}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function ExercicesShell({
  tree,
  allCours,
}: {
  tree: DossierNode[];
  allCours: CoursNode[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [questionType, setQuestionType] = useState<"all" | "qcm_unique" | "qcm_multiple">("all");
  const [difficulty, setDifficulty] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [maxQuestions, setMaxQuestions] = useState<number | null>(20);
  const [shuffle, setShuffle] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveCoursIds = useMemo(
    () => getEffectiveCoursIds(selectedIds, tree),
    [selectedIds, tree]
  );

  const selectedQuestionCount = useMemo(
    () => countEffectiveQuestions(selectedIds, tree, allCours),
    [selectedIds, tree, allCours]
  );

  const totalQuestions = useMemo(
    () => allCours.reduce((s, c) => s + c.nb_questions, 0),
    [allCours]
  );

  const hasSelection = effectiveCoursIds.length > 0;

  const toggleDossier = useCallback((node: DossierNode) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allIds = getAllCoursIds(node);

      function removeTree(n: DossierNode) {
        next.delete(n.id);
        n.cours.forEach((c) => next.delete(c.id));
        n.children.forEach(removeTree);
      }

      if (next.has(node.id)) {
        removeTree(node);
      } else {
        // Remove individual cours selections under this dossier, then select dossier
        removeTree(node);
        next.add(node.id);
        // Remove individual cours (already done in removeTree)
        void allIds; // referenced to avoid lint
      }
      return next;
    });
  }, []);

  const toggleCours = useCallback((coursId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(coursId)) next.delete(coursId);
      else next.add(coursId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const ids = new Set<string>();
    function walk(n: DossierNode) {
      ids.add(n.id);
      n.children.forEach(walk);
    }
    tree.forEach(walk);
    setSelectedIds(ids);
  }, [tree]);

  const handleLaunch = () => {
    if (effectiveCoursIds.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await buildTrainingSession({
        coursIds: effectiveCoursIds,
        questionType,
        difficulty,
        maxQuestions,
        shuffle,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.push(`/serie/${res.serieId}`);
    });
  };

  const displayCount =
    maxQuestions && maxQuestions < selectedQuestionCount
      ? maxQuestions
      : selectedQuestionCount;

  return (
    <div
      className="flex rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      style={{ height: "calc(100vh - 130px)", minHeight: 500 }}
    >
      {/* ── LEFT — Arborescence ── */}
      <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/50">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Chapitres</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{totalQuestions} questions disponibles</p>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {tree.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs px-4">
              Aucun contenu avec exercices disponible pour le moment.
            </div>
          ) : (
            tree.map((node) => (
              <DossierItem
                key={node.id}
                node={node}
                depth={0}
                selectedIds={selectedIds}
                onToggleDossier={toggleDossier}
                onToggleCours={toggleCours}
              />
            ))
          )}
        </div>

        {/* Select all / clear */}
        <div className="px-4 py-2 border-t border-gray-100 flex gap-3 bg-white/80">
          <button
            onClick={selectAll}
            className="flex-1 text-xs text-[#0e1e35] hover:underline font-medium"
          >
            Tout sélectionner
          </button>
          <div className="w-px bg-gray-200" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex-1 text-xs text-gray-500 hover:underline"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* ── RIGHT — Configurateur ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!hasSelection ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="w-16 h-16 rounded-2xl bg-[#0e1e35]/6 flex items-center justify-center mb-5">
              <Layers size={28} className="text-[#0e1e35]/40" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-2">
              Configure ton entraînement
            </h3>
            <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
              Sélectionne des chapitres dans l&apos;arbre à gauche. Tu peux choisir une UE entière,
              une matière ou un cours précis.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-sm">
              {[
                { icon: <Layers size={18} className="mx-auto text-navy/50" />, text: "Toute une UE" },
                { icon: <BookOpen size={18} className="mx-auto text-navy/50" />, text: "Une matière" },
                { icon: <FileText size={18} className="mx-auto text-navy/50" />, text: "Un chapitre" },
              ].map((item) => (
                <div
                  key={item.text}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center"
                >
                  <div className="mb-1">{item.icon}</div>
                  <p className="text-xs text-gray-500">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Config panel */
          <div className="flex-1 overflow-y-auto p-6 space-y-7">
            {/* Summary */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {selectedQuestionCount} questions sélectionnées
                </h3>
                {maxQuestions && maxQuestions < selectedQuestionCount && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    {maxQuestions} seront tirées au sort pour l&apos;entraînement
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
              >
                Modifier la sélection
              </button>
            </div>

            <hr className="border-gray-100" />

            {/* Type */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">
                Type de questions
              </label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "all", label: "Toutes" },
                    { value: "qcm_unique", label: "Réponse unique" },
                    { value: "qcm_multiple", label: "Réponses multiples" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setQuestionType(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      questionType === opt.value
                        ? "bg-[#0e1e35] text-white border-[#0e1e35]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-[#0e1e35]/30"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">
                Difficulté
              </label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "all", label: "Toutes" },
                    { value: "easy", label: "Facile" },
                    { value: "medium", label: "Moyen" },
                    { value: "hard", label: "Difficile" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDifficulty(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      difficulty === opt.value
                        ? "bg-[#0e1e35] text-white border-[#0e1e35]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-[#0e1e35]/30"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Nb questions */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">
                Nombre de questions
              </label>
              <div className="flex flex-wrap gap-2">
                {[10, 20, 30, null].map((n) => (
                  <button
                    key={String(n)}
                    onClick={() => setMaxQuestions(n)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      maxQuestions === n
                        ? "bg-[#0e1e35] text-white border-[#0e1e35]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-[#0e1e35]/30"
                    }`}
                  >
                    {n === null ? "Toutes" : n}
                  </button>
                ))}
              </div>
            </div>

            {/* Shuffle */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer w-fit">
                <button
                  onClick={() => setShuffle(!shuffle)}
                  className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${
                    shuffle ? "bg-[#0e1e35]" : "bg-gray-200"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      shuffle ? "translate-x-5" : ""
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <Shuffle size={14} className="text-gray-500" />
                  Ordre aléatoire
                </span>
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                <AlertCircle size={15} className="shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* Launch button */}
        {hasSelection && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/80">
            <button
              onClick={handleLaunch}
              disabled={isPending || selectedQuestionCount === 0}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-[#C9A84C] hover:bg-[#A8892E] disabled:opacity-40 text-[#0e1e35] font-bold rounded-xl transition-colors text-sm shadow-sm"
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Préparation de l&apos;entraînement…
                </>
              ) : (
                <>
                  <Play size={16} fill="currentColor" />
                  Lancer · {displayCount} question{displayCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
