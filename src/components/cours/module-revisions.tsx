"use client";

import { useState } from "react";
import { Brain, RotateCcw, List, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Question } from "@/types/database";

interface ModuleRevisionsProps {
  coursId: string;
  questions: Question[];
}

export function ModuleRevisions({ coursId, questions }: ModuleRevisionsProps) {
  const [mode, setMode] = useState<"1par1" | "liste">("1par1");
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answered, setAnswered] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [includeAnswered, setIncludeAnswered] = useState(false);

  const total = questions.length;
  const done = Object.keys(answered).length;

  if (!started) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-navy px-4 py-3">
          <Brain className="h-4 w-4 text-gold" />
          <h3 className="text-sm font-semibold text-white">Module Révisions</h3>
          <span className="ml-auto text-xs text-white/60">{done}/{total}</span>
        </div>
        <div className="p-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setMode("1par1")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
                mode === "1par1" ? "bg-navy text-white" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              1 par 1
            </button>
            <button
              onClick={() => setMode("liste")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
                mode === "liste" ? "bg-navy text-white" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Liste
            </button>
          </div>

          {/* Progression */}
          <div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-navy transition-all"
                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">{done} / {total} questions répondues</p>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAnswered}
              onChange={(e) => setIncludeAnswered(e.target.checked)}
              className="rounded"
            />
            Inclure les exercices déjà faits
          </label>

          <button
            onClick={() => { setStarted(true); setCurrentIndex(0); }}
            className="w-full rounded-lg bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navy-light transition-colors"
          >
            Démarrer
          </button>
        </div>
      </div>
    );
  }

  if (mode === "liste") {
    return (
      <RevisionListe
        questions={questions}
        answered={answered}
        revealed={revealed}
        onAnswer={(qId, labels) => setAnswered((p) => ({ ...p, [qId]: labels }))}
        onReveal={(qId) => setRevealed((p) => ({ ...p, [qId]: true }))}
        onReset={() => { setStarted(false); setAnswered({}); setRevealed({}); }}
      />
    );
  }

  return (
    <Revision1par1
      questions={questions}
      currentIndex={currentIndex}
      answered={answered}
      revealed={revealed}
      onAnswer={(qId, labels) => setAnswered((p) => ({ ...p, [qId]: labels }))}
      onReveal={(qId) => setRevealed((p) => ({ ...p, [qId]: true }))}
      onNext={() => setCurrentIndex((i) => Math.min(i + 1, questions.length - 1))}
      onPrev={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
      onReset={() => { setStarted(false); setAnswered({}); setRevealed({}); setCurrentIndex(0); }}
    />
  );
}

// =============================================
// Révision 1 par 1
// =============================================
interface Revision1par1Props {
  questions: Question[];
  currentIndex: number;
  answered: Record<string, string[]>;
  revealed: Record<string, boolean>;
  onAnswer: (qId: string, labels: string[]) => void;
  onReveal: (qId: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
}

function Revision1par1({ questions, currentIndex, answered, revealed, onAnswer, onReveal, onNext, onPrev, onReset }: Revision1par1Props) {
  const q = questions[currentIndex];
  const total = questions.length;
  const isAnswered = !!answered[q.id];
  const isRevealed = !!revealed[q.id];
  const selected = answered[q.id] ?? [];

  const toggleOption = (label: string) => {
    if (isRevealed) return;
    if (q.type === "qcm_unique") {
      onAnswer(q.id, [label]);
    } else {
      const current = answered[q.id] ?? [];
      if (current.includes(label)) {
        onAnswer(q.id, current.filter((l) => l !== label));
      } else {
        onAnswer(q.id, [...current, label]);
      }
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-navy px-4 py-3">
        <Brain className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-semibold text-white">Module Révisions</h3>
        <span className="ml-auto text-xs text-white/60">{currentIndex + 1}/{total}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Progression */}
        <div className="h-1.5 w-full rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gold transition-all"
            style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
          />
        </div>

        {/* Question */}
        <p className="text-sm font-medium text-gray-800 leading-relaxed">{q.text}</p>

        {/* Options */}
        <div className="space-y-2">
          {(q.options ?? []).sort((a, b) => a.order_index - b.order_index).map((opt) => {
            const isSelected = selected.includes(opt.label);
            const showResult = isRevealed;
            const correct = opt.is_correct;

            return (
              <button
                key={opt.id}
                onClick={() => toggleOption(opt.label)}
                className={cn(
                  "w-full flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-all",
                  showResult
                    ? correct
                      ? "border-green-300 bg-green-50 text-green-800"
                      : isSelected && !correct
                        ? "border-red-300 bg-red-50 text-red-800"
                        : "border-gray-200 bg-gray-50 text-gray-500"
                    : isSelected
                      ? "border-navy bg-navy/5 text-navy"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                )}
              >
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  showResult
                    ? correct
                      ? "border-green-400 bg-green-100 text-green-700"
                      : isSelected
                        ? "border-red-400 bg-red-100 text-red-700"
                        : "border-gray-300 text-gray-400"
                    : isSelected
                      ? "border-navy bg-navy text-white"
                      : "border-gray-300 text-gray-500"
                )}>
                  {opt.label}
                </span>
                <span className="leading-relaxed">{opt.text}</span>
              </button>
            );
          })}
        </div>

        {/* Explication */}
        {isRevealed && q.explanation && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            <p className="font-semibold mb-1">Explication</p>
            <p>{q.explanation}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {isAnswered && !isRevealed && (
            <button
              onClick={() => onReveal(q.id)}
              className="flex-1 rounded-lg border border-navy py-2 text-xs font-medium text-navy hover:bg-navy/5 transition-colors"
            >
              Voir la correction
            </button>
          )}
          <div className="flex gap-1 ml-auto">
            <button
              onClick={onPrev}
              disabled={currentIndex === 0}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              ← Préc.
            </button>
            {currentIndex < total - 1 ? (
              <button
                onClick={onNext}
                className="rounded-lg bg-navy px-3 py-2 text-xs font-medium text-white hover:bg-navy-light transition-colors"
              >
                Suiv. →
              </button>
            ) : (
              <button
                onClick={onReset}
                className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Recommencer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Révision en liste
// =============================================
interface RevisionListeProps {
  questions: Question[];
  answered: Record<string, string[]>;
  revealed: Record<string, boolean>;
  onAnswer: (qId: string, labels: string[]) => void;
  onReveal: (qId: string) => void;
  onReset: () => void;
}

function RevisionListe({ questions, answered, revealed, onAnswer, onReveal, onReset }: RevisionListeProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-navy px-4 py-3">
        <Brain className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-semibold text-white">Module Révisions — Liste</h3>
        <button onClick={onReset} className="ml-auto text-xs text-white/60 hover:text-white">
          ← Retour
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {questions.map((q, i) => {
          const selected = answered[q.id] ?? [];
          const isRevealed = !!revealed[q.id];

          const toggleOption = (label: string) => {
            if (isRevealed) return;
            if (q.type === "qcm_unique") {
              onAnswer(q.id, [label]);
            } else {
              if (selected.includes(label)) {
                onAnswer(q.id, selected.filter((l) => l !== label));
              } else {
                onAnswer(q.id, [...selected, label]);
              }
            }
          };

          return (
            <div key={q.id} className="p-4 space-y-3">
              <p className="text-sm font-medium text-gray-800">
                <span className="text-gray-400 mr-2">{i + 1}.</span>
                {q.text}
              </p>
              <div className="space-y-1.5">
                {(q.options ?? []).sort((a, b) => a.order_index - b.order_index).map((opt) => {
                  const isSelected = selected.includes(opt.label);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleOption(opt.label)}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-all",
                        isRevealed
                          ? opt.is_correct
                            ? "border-green-300 bg-green-50 text-green-800"
                            : isSelected
                              ? "border-red-300 bg-red-50 text-red-800"
                              : "border-gray-100 text-gray-400"
                          : isSelected
                            ? "border-navy bg-navy/5 text-navy"
                            : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <span className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                        isSelected ? "border-navy bg-navy text-white" : "border-gray-300 text-gray-400"
                      )}>
                        {opt.label}
                      </span>
                      {opt.text}
                    </button>
                  );
                })}
              </div>
              {!isRevealed && selected.length > 0 && (
                <button
                  onClick={() => onReveal(q.id)}
                  className="text-xs text-navy hover:underline"
                >
                  Voir la correction
                </button>
              )}
              {isRevealed && q.explanation && (
                <p className="text-xs text-blue-700 bg-blue-50 rounded p-2">{q.explanation}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
