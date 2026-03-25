"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, Check, X, RotateCcw, BookOpen, Lightbulb, AlertTriangle, MessageCircleQuestion } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Question, Serie } from "@/types/database";
import { MathText } from "@/components/ui/math-text";
import { AskQuestionFab } from "@/components/qa/ask-question-fab";

// ─── Types ─────────────────────────────────────────────────────────────────

interface QOption {
  id: string;
  label: string;
  text: string;
  is_correct: boolean;
  order_index: number;
  justification?: string | null;
  question_id?: string;
  image_url?: string | null;
}

interface QuestionWithOptions extends Omit<Question, "options"> {
  options: QOption[];
  image_url?: string | null;
}

interface QcmPlayerProps {
  serie: Serie;
  questions: QuestionWithOptions[];
  userId: string;
}

type PlayerState = "setup" | "playing" | "results";

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const TYPE_LABELS: Record<string, string> = {
  entrainement: "Entraînement",
  concours_blanc: "Concours blanc",
  revision: "Révision",
  qcm_supplementaires: "QCM d'entraînement",
  annales: "Annales corrigées",
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  entrainement: { bg: "#EFF6FF", text: "#1D4ED8" },
  concours_blanc: { bg: "#FEF2F2", text: "#DC2626" },
  revision: { bg: "#F5F3FF", text: "#7C3AED" },
};

// ─── Setup Screen ─────────────────────────────────────────────────────────

function SetupScreen({
  serie,
  nbQuestions,
  onStart,
}: {
  serie: Serie;
  nbQuestions: number;
  onStart: (timed: boolean) => Promise<void> | void;
}) {
  const [starting, setStarting] = useState(false);

  const handleStart = async (timed: boolean) => {
    setStarting(true);
    try {
      await onStart(timed);
    } catch (err) {
      console.error("Failed to start game:", err);
      setStarting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0e1e35 0%, #162d4a 50%, #091525 100%)" }}
    >
      <div className="w-full max-w-lg">
        {/* Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "rgba(255,255,255,0.97)",
            border: "1px solid rgba(201,168,76,0.25)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.3), 0 0 40px rgba(201,168,76,0.08)",
          }}
        >
          {/* Gold accent top */}
          <div className="h-1.5" style={{ background: "linear-gradient(90deg, #A8892E, #C9A84C, #E8C97B, #C9A84C, #A8892E)" }} />

          <div className="p-8">
            {/* Type badge */}
            <span
              className="inline-block text-[11px] font-bold tracking-wide uppercase px-3 py-1.5 rounded-full mb-5"
              style={{ backgroundColor: "#0e1e35", color: "#C9A84C" }}
            >
              {TYPE_LABELS[serie.type] ?? serie.type}
            </span>

            {/* Title */}
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2 tracking-tight">{serie.name}</h1>
            {serie.description && (
              <p className="text-sm text-gray-500 mb-6">{serie.description}</p>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="rounded-xl p-4 text-center" style={{ backgroundColor: "#0e1e35" }}>
                <p className="text-2xl font-extrabold" style={{ color: "#C9A84C" }}>{nbQuestions}</p>
                <p className="text-[11px] text-white/60 mt-0.5 font-medium">questions</p>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ backgroundColor: "#0e1e35" }}>
                <p className="text-2xl font-extrabold" style={{ color: "#C9A84C" }}>
                  {nbQuestions * 5}
                </p>
                <p className="text-[11px] text-white/60 mt-0.5 font-medium">propositions</p>
              </div>
            </div>

            {/* Warning if score definitif */}
            {serie.score_definitif && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 p-3 mb-6 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Score définitif — ta première tentative sera enregistrée.</span>
              </div>
            )}

            {/* Format info */}
            <div
              className="rounded-xl p-3.5 mb-8 text-xs flex items-start gap-2"
              style={{ backgroundColor: "rgba(14,30,53,0.06)", color: "#0e1e35" }}
            >
              <BookOpen size={14} className="shrink-0 mt-0.5 opacity-60" />
              <span>Format PASS/LAS — Pour chaque question, évalue chacune des 5 propositions : <strong>VRAI</strong> ou <strong>FAUX</strong>.</span>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              {serie.timed && (
                <button
                  onClick={() => handleStart(true)}
                  disabled={starting}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all duration-150 active:scale-[0.97] disabled:opacity-60"
                  style={{ backgroundColor: "#0e1e35", color: "white" }}
                >
                  <Clock size={15} />
                  {starting ? "Chargement..." : `Commencer avec chronomètre · ${serie.duration_minutes}min`}
                </button>
              )}
              <button
                onClick={() => handleStart(false)}
                disabled={starting}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all duration-150 active:scale-[0.97] disabled:opacity-60"
                style={{
                  backgroundColor: "#C9A84C",
                  color: "#0e1e35",
                  boxShadow: "0 4px 15px rgba(201,168,76,0.3)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#E8C97B"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(201,168,76,0.45)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#C9A84C"; e.currentTarget.style.boxShadow = "0 4px 15px rgba(201,168,76,0.3)"; }}
              >
                {starting ? "Chargement..." : "Commencer sans chronomètre"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Proposition Row (V/F toggle) ─────────────────────────────────────────

function PropositionRow({
  option,
  answer,
  onToggle,
  disabled,
}: {
  option: QOption;
  answer: "vrai" | "faux" | null;
  onToggle: (label: string, value: "vrai" | "faux" | null) => void;
  disabled: boolean;
}) {
  const isChecked = answer === "vrai";

  const handleClick = () => {
    if (disabled) return;
    onToggle(option.label, isChecked ? "faux" : "vrai");
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl border transition-all select-none ${
        disabled ? "cursor-default" : "cursor-pointer active:scale-[0.995]"
      } ${
        isChecked
          ? "border-sky-300 bg-sky-50/70 shadow-sm"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50"
      }`}
    >
      {/* Checkbox */}
      <div className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
        isChecked ? "border-sky-500 bg-sky-500" : "border-gray-300 bg-white"
      }`}>
        {isChecked && <Check size={12} className="text-white" strokeWidth={3} />}
      </div>

      {/* Label */}
      <span className={`shrink-0 text-sm font-bold transition-colors ${
        isChecked ? "text-sky-600" : "text-gray-500"
      }`}>
        {option.label}
      </span>

      {/* Text */}
      <div className={`flex-1 text-sm leading-relaxed ${
        isChecked ? "text-gray-900" : "text-gray-600"
      }`}>
        <MathText text={option.text} />
        {(option as any).image_url && (
          <div className="flex justify-center mt-2 p-2 bg-white rounded-lg border border-gray-100">
            <img src={(option as any).image_url} alt="" className="max-h-40 object-contain" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Playing Screen ───────────────────────────────────────────────────────

function PlayingScreen({
  questions,
  serie,
  timed,
  timeLeft,
  answers,
  currentIndex,
  submitting,
  onToggle,
  onNavigate,
  onSubmit,
}: {
  questions: QuestionWithOptions[];
  serie: Serie;
  timed: boolean;
  timeLeft: number;
  answers: Record<string, Record<string, "vrai" | "faux">>;
  currentIndex: number;
  submitting: boolean;
  onToggle: (questionId: string, label: string, value: "vrai" | "faux") => void;
  onNavigate: (idx: number) => void;
  onSubmit: () => void;
}) {
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const scrollToQuestion = (idx: number) => {
    onNavigate(idx);
    questionRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const getStatus = (q: QuestionWithOptions): "complete" | "partial" | "none" => {
    const qA = answers[q.id] ?? {};
    const opts = q.options ?? [];
    const answered = Object.keys(qA).length;
    if (answered === 0) return "none";
    if (opts.every((o) => qA[o.label])) return "complete";
    return "partial";
  };

  const totalComplete = questions.filter((q) => getStatus(q) === "complete").length;
  const totalAnswered = questions.filter((q) => getStatus(q) !== "none").length;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "#F5F6FA" }}>

      {/* ── TOP HEADER ── */}
      <header className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <img src="/logo-ds.svg" alt="Diploma Santé" className="h-8 w-auto object-contain" style={{ filter: "brightness(0) saturate(100%) invert(8%) sepia(27%) saturate(2124%) hue-rotate(188deg) brightness(95%) contrast(103%)" }} />
          <div className="h-5 w-px bg-gray-200" />
          <div>
            <p className="text-sm font-bold text-gray-900">{serie.name}</p>
            <p className="text-xs text-gray-400">{serie.type === "concours_blanc" ? "Concours blanc" : serie.type === "revision" ? "Révision" : serie.type === "entrainement" ? "Entraînement" : "QCM"}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {timed && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono font-bold ${timeLeft < 60 ? "bg-red-50 text-red-600 border border-red-200" : "bg-gray-100 text-gray-700"}`}>
              <Clock size={14} />
              {formatTime(timeLeft)}
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy text-white text-sm font-bold">
            <span className="text-gold">{totalComplete}</span>
            <span className="text-white/50">/</span>
            <span>{questions.length}</span>
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="w-52 shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
          {/* Score */}
          <div className="px-4 py-3.5 border-b border-gray-100">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-navy">{totalComplete}</span>
              <span className="text-sm font-normal text-gray-400">/ {questions.length} terminé</span>
            </div>
            {/* Dots row like ExoTeach */}
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {questions.map((q, i) => {
                const s = getStatus(q);
                return (
                  <button key={q.id} onClick={() => scrollToQuestion(i)}
                    className={`h-2.5 w-2.5 rounded-full transition-all ${
                      s === "complete" ? "bg-green-500" :
                      s === "partial" ? "bg-amber-400" :
                      "bg-gray-200 hover:bg-gray-300"
                    }`}
                    title={`Question ${i + 1}`}
                  />
                );
              })}
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${(totalComplete / questions.length) * 100}%`, backgroundColor: "#0e1e35" }}
              />
            </div>
          </div>

          {/* Question list */}
          <div className="flex-1 overflow-y-auto py-1.5">
            {questions.map((q, i) => {
              const status = getStatus(q);
              const isActive = i === currentIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => scrollToQuestion(i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    isActive ? "bg-navy/8 border-l-2 border-navy" : "border-l-2 border-transparent hover:bg-gray-50"
                  }`}
                >
                  {/* Status dot */}
                  <div className={`shrink-0 h-2 w-2 rounded-full ${
                    status === "complete" ? "bg-green-500" :
                    status === "partial" ? "bg-amber-400" :
                    "bg-gray-200"
                  }`} />
                  <span className={`text-xs font-semibold ${isActive ? "text-navy" : "text-gray-600"}`}>
                    {i + 1}
                  </span>
                  <span className="text-[10px] text-gray-400 truncate">{TYPE_LABELS[serie.type] ?? "QCM"}</span>
                </button>
              );
            })}
          </div>

          {/* Submit button */}
          <div className="shrink-0 p-3 border-t border-gray-100">
            <button
              onClick={onSubmit}
              disabled={submitting || totalAnswered === 0}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
              style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
            >
              {submitting ? "Envoi…" : totalComplete === questions.length ? "Terminer" : `Terminer (${totalComplete}/${questions.length})`}
            </button>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
            {questions.map((q, i) => {
              const opts = (q.options ?? []).sort((a, b) => a.order_index - b.order_index);
              const qA = answers[q.id] ?? {};
              const status = getStatus(q);

              return (
                <div
                  key={q.id}
                  ref={(el) => { questionRefs.current[i] = el; }}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  {/* Question header */}
                  <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex-wrap">
                    <div
                      className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: "#0e1e35", color: "#C9A84C" }}
                    >
                      {i + 1}
                    </div>
                    <span className="text-sm font-bold text-gray-800">QCM {i + 1}</span>
                    {(serie as any).cours?.name && (
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                        {(serie as any).cours.name}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[serie.type] ?? "QCM"}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      {status === "complete" && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                          <Check size={10} strokeWidth={3} /> Complété
                        </span>
                      )}
                      {status === "partial" && (
                        <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          En cours
                        </span>
                      )}
                      <AskQuestionFab
                        mini
                        contextType="qcm_question"
                        questionId={q.id}
                        serieId={serie.id}
                        coursId={serie.cours_id ?? undefined}
                        matiereId={serie.matiere_id ?? undefined}
                      />
                    </div>
                  </div>

                  {/* Question text */}
                  <div className="px-5 py-4">
                    <div className="text-sm font-medium text-gray-800 leading-relaxed">
                      <MathText text={q.text} />
                      {(q as any).image_url && (
                        <div className="flex justify-center mt-3 mb-1 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <img src={(q as any).image_url} alt="" className="max-h-56 object-contain" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Options */}
                  <div className="px-5 pb-5 space-y-2">
                    {opts.map((opt) => (
                      <PropositionRow
                        key={opt.id}
                        option={opt}
                        answer={qA[opt.label] ?? null}
                        onToggle={(label, value) => value !== null && onToggle(q.id, label, value)}
                        disabled={submitting}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Bottom submit */}
            <div className="pb-6 flex justify-center">
              <button
                onClick={onSubmit}
                disabled={submitting || totalAnswered === 0}
                className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 shadow-sm"
                style={{ backgroundColor: "#0e1e35", color: "white" }}
              >
                {submitting ? "Enregistrement…" : `Soumettre mes réponses`}
              </button>
            </div>
          </div>
        </main>

      </div>
    </div>
  );
}

// ─── Correction proposition ────────────────────────────────────────────────

function CorrectionProposition({
  opt,
  userAnswer,
}: {
  opt: QOption;
  userAnswer: "vrai" | "faux" | null;
}) {
  const correctAnswer = opt.is_correct ? "vrai" : "faux";
  const isCorrect = userAnswer === correctAnswer;
  const notAnswered = userAnswer === null;

  return (
    <div
      className="rounded-xl border p-3 space-y-2"
      style={{
        borderColor: notAnswered ? "#E5E7EB" : isCorrect ? "#BBF7D0" : "#FECACA",
        backgroundColor: notAnswered ? "#F9FAFB" : isCorrect ? "#F0FDF4" : "#FEF2F2",
      }}
    >
      <div className="flex items-start gap-3">
        {/* Correctness icon */}
        <div
          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
          style={{
            backgroundColor: notAnswered ? "#9CA3AF" : isCorrect ? "#10B981" : "#EF4444",
          }}
        >
          {notAnswered ? (
            <span className="text-white text-[9px] font-bold">?</span>
          ) : isCorrect ? (
            <Check size={10} className="text-white" strokeWidth={3} />
          ) : (
            <X size={10} className="text-white" strokeWidth={3} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "#0e1e35",
                color: "#C9A84C",
              }}
            >
              {opt.label}
            </span>
            <p className="text-sm text-gray-800 flex-1">{opt.text}</p>
          </div>

          {/* Answer comparison */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {userAnswer && (
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded"
                style={{
                  backgroundColor: isCorrect ? "#DCFCE7" : "#FEE2E2",
                  color: isCorrect ? "#16A34A" : "#DC2626",
                }}
              >
                Ta réponse : {userAnswer === "vrai" ? "VRAI" : "FAUX"}
              </span>
            )}
            {!isCorrect && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-green-100 text-green-700">
                Bonne réponse : {correctAnswer === "vrai" ? "VRAI" : "FAUX"}
              </span>
            )}
            {notAnswered && (
              <span className="text-[11px] text-gray-500">Non répondu · bonne réponse : {correctAnswer === "vrai" ? "VRAI" : "FAUX"}</span>
            )}
          </div>
        </div>
      </div>

      {/* Justification */}
      {opt.justification && (
        <div className="flex items-start gap-2 pl-8 pt-1">
          <Lightbulb size={13} className="shrink-0 text-amber-500 mt-0.5" />
          <p className="text-xs text-gray-600 leading-relaxed">{opt.justification}</p>
        </div>
      )}
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────

function ResultsScreen({
  results,
  questions,
  answers,
  serie,
  onRestart,
  onBack,
}: {
  results: { score: number; nb_correct: number; nb_props_correct: number; nb_props_total: number; details: any[] };
  questions: QuestionWithOptions[];
  answers: Record<string, Record<string, "vrai" | "faux">>;
  serie: Serie;
  onRestart: () => void;
  onBack: () => void;
}) {
  const [expandedQs, setExpandedQs] = useState<Set<string>>(new Set());

  const toggleQ = (id: string) => {
    setExpandedQs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const scoreColor = results.score >= 70 ? "#16A34A" : results.score >= 50 ? "#D97706" : "#DC2626";
  const propScore = Math.round((results.nb_props_correct / Math.max(results.nb_props_total, 1)) * 100);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F8F7FF" }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <ChevronLeft size={16} /> Retour
          </button>
          <span className="text-sm font-semibold text-gray-700">{serie.name}</span>
          <button onClick={onRestart} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <RotateCcw size={14} /> Recommencer
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Score card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-6">
            {/* Score circle */}
            <div
              className="shrink-0 w-24 h-24 rounded-full flex flex-col items-center justify-center border-4"
              style={{ borderColor: scoreColor }}
            >
              <span className="text-2xl font-bold" style={{ color: scoreColor }}>{Math.round(results.score)}%</span>
              <span className="text-[10px] text-gray-400">général</span>
            </div>

            {/* Stats */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs text-gray-500">Questions entièrement correctes</p>
                <p className="text-lg font-bold text-gray-900">
                  {results.nb_correct} <span className="text-gray-400 text-sm font-normal">/ {questions.length}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Propositions correctes</p>
                <p className="text-lg font-bold" style={{ color: scoreColor }}>
                  {results.nb_props_correct} <span className="text-gray-400 text-sm font-normal">/ {results.nb_props_total} · {propScore}%</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Per-question correction */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Correction détaillée</h2>

          {questions.map((q, i) => {
            const opts = (q.options ?? []).sort((a, b) => a.order_index - b.order_index);
            const qA = answers[q.id] ?? {};
            const allCorrect = opts.every((o) => (qA[o.label] === "vrai") === o.is_correct);
            const nbCorrectProps = opts.filter((o) => (qA[o.label] === "vrai") === o.is_correct).length;
            const expanded = expandedQs.has(q.id);

            return (
              <div key={q.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                {/* Question header */}
                <button
                  onClick={() => toggleQ(q.id)}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  {/* Status */}
                  <div
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                    style={{ backgroundColor: allCorrect ? "#10B981" : nbCorrectProps >= opts.length * 0.8 ? "#F59E0B" : "#EF4444" }}
                  >
                    {allCorrect
                      ? <Check size={12} className="text-white" strokeWidth={3} />
                      : <X size={12} className="text-white" strokeWidth={3} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-400">Q{i + 1}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                        backgroundColor: allCorrect ? "#DCFCE7" : "#FEE2E2",
                        color: allCorrect ? "#16A34A" : "#DC2626",
                      }}>
                        {nbCorrectProps}/{opts.length} props. correctes
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 line-clamp-2">{q.text}</p>
                  </div>

                  <ChevronRight size={16} className={`shrink-0 text-gray-400 transition-transform mt-1 ${expanded ? "rotate-90" : ""}`} />
                </button>

                {/* Expanded correction */}
                {expanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-gray-50">
                    {opts.map((opt) => (
                      <CorrectionProposition
                        key={opt.id}
                        opt={opt}
                        userAnswer={qA[opt.label] ?? null}
                      />
                    ))}
                    {q.explanation && (
                      <div className="flex items-start gap-2 pt-2 pl-1">
                        <Lightbulb size={14} className="shrink-0 text-amber-500 mt-0.5" />
                        <p className="text-sm text-gray-600 italic">{q.explanation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors hover:bg-gray-50"
            style={{ borderColor: "#0e1e35", color: "#0e1e35" }}
          >
            ← Retour au cours
          </button>
          <button
            onClick={onRestart}
            className="flex-1 py-3 rounded-xl text-sm font-bold transition-colors"
            style={{ backgroundColor: "#0e1e35", color: "white" }}
          >
            Recommencer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main QcmPlayer ───────────────────────────────────────────────────────

export function QcmPlayer({ serie, questions, userId }: QcmPlayerProps) {
  const [playerState, setPlayerState] = useState<PlayerState>("setup");
  const [timed, setTimed] = useState(false);
  const [timeLeft, setTimeLeft] = useState((serie.duration_minutes ?? 20) * 60);
  // answers: Record<questionId, Record<label, "vrai" | "faux">>
  const [answers, setAnswers] = useState<Record<string, Record<string, "vrai" | "faux">>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // Timer
  useEffect(() => {
    if (playerState !== "playing" || !timed) return;
    if (timeLeft <= 0) { handleSubmit(); return; }
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  });

  const startGame = async (withTimer: boolean) => {
    setTimed(withTimer);
    setStartTime(new Date());
    const { data, error } = await supabase
      .from("serie_attempts")
      .insert({ user_id: userId, series_id: serie.id, timed: withTimer })
      .select("id")
      .single();
    if (error) {
      console.error("Failed to create attempt:", error);
      // Still allow playing even if attempt creation fails
    }
    if (data) setAttemptId(data.id);
    setPlayerState("playing");
  };

  const handleToggle = (questionId: string, label: string, value: "vrai" | "faux") => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? {}), [label]: value },
    }));
  };

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    const endTime = new Date();
    const totalSeconds = startTime ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) : 0;

    // Compute results
    let nbCorrectQuestions = 0;
    let nbPropsCorrect = 0;
    let nbPropsTotal = 0;

    const details = questions.map((q) => {
      const opts = (q.options ?? []).sort((a, b) => a.order_index - b.order_index);
      const qA = answers[q.id] ?? {};
      const propsCorrect = opts.filter((o) => (qA[o.label] === "vrai") === o.is_correct).length;
      const allCorrect = propsCorrect === opts.length;
      if (allCorrect) nbCorrectQuestions++;
      nbPropsCorrect += propsCorrect;
      nbPropsTotal += opts.length;

      // selected_labels = labels marked as VRAI (backward compat)
      const selectedLabels = opts.filter((o) => qA[o.label] === "vrai").map((o) => o.label);

      return { question: q, selected: selectedLabels, correct: allCorrect };
    });

    const score = questions.length > 0 ? (nbCorrectQuestions / questions.length) * 100 : 0;

    // Save to DB
    if (attemptId) {
      await supabase.from("serie_attempts").update({
        ended_at: endTime.toISOString(),
        score: Math.round(score * 100) / 100,
        nb_correct: nbCorrectQuestions,
        nb_total: questions.length,
        time_spent_s: totalSeconds,
      }).eq("id", attemptId);

      const answerRows = details.map((d) => ({
        attempt_id: attemptId,
        question_id: d.question.id,
        selected_labels: d.selected,
        is_correct: d.correct,
      }));
      if (answerRows.length > 0) {
        await supabase.from("user_answers").insert(answerRows);
      }
    }

    setResults({ score, nb_correct: nbCorrectQuestions, nb_props_correct: nbPropsCorrect, nb_props_total: nbPropsTotal, details });
    setSubmitting(false);
    setPlayerState("results");
  }, [submitting, startTime, questions, answers, attemptId, supabase]);

  const handleRestart = () => {
    setPlayerState("setup");
    setAnswers({});
    setCurrentIndex(0);
    setStartTime(null);
    setAttemptId(null);
    setResults(null);
    setSubmitting(false);
    setTimeLeft((serie.duration_minutes ?? 20) * 60);
  };

  const handleBack = () => {
    router.back();
  };

  if (playerState === "setup") {
    return <SetupScreen serie={serie} nbQuestions={questions.length} onStart={startGame} />;
  }

  if (playerState === "playing") {
    return (
      <PlayingScreen
        questions={questions}
        serie={serie}
        timed={timed}
        timeLeft={timeLeft}
        answers={answers}
        currentIndex={currentIndex}
        submitting={submitting}
        onToggle={handleToggle}
        onNavigate={setCurrentIndex}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <ResultsScreen
      results={results}
      questions={questions}
      answers={answers}
      serie={serie}
      onRestart={handleRestart}
      onBack={handleBack}
    />
  );
}
