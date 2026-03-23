"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Clock, ChevronLeft, ChevronRight, Send,
  CheckCircle, XCircle, Trophy, RotateCcw, Timer,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Question, Serie } from "@/types/database";

interface QcmPlayerProps {
  serie: Serie;
  questions: Question[];
  userId: string;
}

type PlayerState = "setup" | "playing" | "results";

export function QcmPlayer({ serie, questions, userId }: QcmPlayerProps) {
  const [state, setState] = useState<PlayerState>("setup");
  const [timed, setTimed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(
    (serie.duration_minutes ?? 20) * 60
  );
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [results, setResults] = useState<{
    score: number;
    nb_correct: number;
    details: { question: Question; selected: string[]; correct: boolean }[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // Timer countdown
  useEffect(() => {
    if (state !== "playing" || !timed) return;
    if (timeLeft <= 0) { handleSubmit(); return; }
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [state, timed, timeLeft]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const startGame = async (withTimer: boolean) => {
    setTimed(withTimer);
    setStartTime(new Date());

    // Créer la tentative en DB
    const { data } = await supabase
      .from("serie_attempts")
      .insert({
        user_id: userId,
        series_id: serie.id,
        timed: withTimer,
      })
      .select("id")
      .single();

    if (data) setAttemptId(data.id);
    setState("playing");
  };

  const toggleAnswer = (label: string) => {
    const qId = questions[currentIndex].id;
    const q = questions[currentIndex];
    setAnswers((prev) => {
      const current = prev[qId] ?? [];
      if (q.type === "qcm_unique") {
        return { ...prev, [qId]: [label] };
      } else {
        if (current.includes(label)) {
          return { ...prev, [qId]: current.filter((l) => l !== label) };
        } else {
          return { ...prev, [qId]: [...current, label] };
        }
      }
    });
  };

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    const endTime = new Date();
    const totalSeconds = startTime
      ? Math.round((endTime.getTime() - startTime.getTime()) / 1000)
      : 0;

    // Calculer les résultats
    const details = questions.map((q) => {
      const selected = answers[q.id] ?? [];
      const correctLabels = q.options!.filter((o) => o.is_correct).map((o) => o.label as string);
      const isCorrect =
        q.type === "qcm_unique"
          ? selected.length === 1 && correctLabels.includes(selected[0])
          : correctLabels.length === selected.length &&
            correctLabels.every((l) => selected.includes(l));
      return { question: q, selected, correct: isCorrect };
    });

    const nbCorrect = details.filter((d) => d.correct).length;
    const score = questions.length > 0 ? (nbCorrect / questions.length) * 100 : 0;

    // Sauvegarder en DB
    if (attemptId) {
      await supabase
        .from("serie_attempts")
        .update({
          ended_at: endTime.toISOString(),
          score: Math.round(score * 100) / 100,
          nb_correct: nbCorrect,
          nb_total: questions.length,
          time_spent_s: totalSeconds,
        })
        .eq("id", attemptId);

      // Sauvegarder les réponses
      const answerRows = details.map((d) => ({
        attempt_id: attemptId,
        question_id: d.question.id,
        selected_labels: d.selected,
        is_correct: d.correct,
      }));
      await supabase.from("user_answers").insert(answerRows);
    }

    setResults({ score, nb_correct: nbCorrect, details });
    setState("results");
    setSubmitting(false);
  }, [submitting, questions, answers, startTime, attemptId, supabase]);

  // =============================================
  // ÉCRAN SETUP
  // =============================================
  if (state === "setup") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-navy px-6 py-5">
            <h1 className="text-xl font-bold text-white">{serie.name}</h1>
            <p className="mt-1 text-sm text-white/60">{questions.length} questions</p>
          </div>

          <div className="p-6 space-y-4">
            {serie.score_definitif && (
              <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Votre note sera définitive et ne pourra pas être modifiée.
                </p>
              </div>
            )}

            <p className="text-sm text-gray-600">
              Souhaitez-vous faire cet exercice de façon chronométrée ?
            </p>

            {serie.timed && (
              <p className="text-xs text-gray-400">
                Durée : {serie.duration_minutes ?? 20} minutes
              </p>
            )}

            <div className="flex gap-3">
              {serie.timed && (
                <button
                  onClick={() => startGame(true)}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-navy py-3 text-sm font-semibold text-white hover:bg-navy-light transition-colors"
                >
                  <Timer className="h-4 w-4" />
                  Lancer le chronomètre
                </button>
              )}
              <button
                onClick={() => startGame(false)}
                className={cn(
                  "flex-1 rounded-lg py-3 text-sm font-semibold transition-colors",
                  serie.timed
                    ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    : "bg-navy text-white hover:bg-navy-light"
                )}
              >
                {serie.timed ? "Sans chronomètre" : "Commencer"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =============================================
  // ÉCRAN RÉSULTATS
  // =============================================
  if (state === "results" && results) {
    const { score, nb_correct, details } = results;
    const color = score >= 70 ? "text-green-600" : score >= 50 ? "text-orange-500" : "text-red-500";
    const bgColor = score >= 70 ? "bg-green-50 border-green-200" : score >= 50 ? "bg-orange-50 border-orange-200" : "bg-red-50 border-red-200";

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Score card */}
        <div className={cn("rounded-xl border p-6 text-center", bgColor)}>
          <Trophy className={cn("mx-auto h-12 w-12", color)} />
          <p className={cn("mt-3 text-4xl font-bold", color)}>
            {Math.round(score)}%
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {nb_correct} / {questions.length} bonnes réponses
          </p>
          <p className="mt-2 text-xs text-gray-500">{serie.name}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => router.back()}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← Retour au cours
          </button>
          <button
            onClick={() => {
              setAnswers({});
              setCurrentIndex(0);
              setResults(null);
              setState("setup");
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-navy py-2.5 text-sm font-semibold text-white hover:bg-navy-light transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Recommencer
          </button>
        </div>

        {/* Correction détaillée */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Correction détaillée</h2>
          {details.map((d, i) => (
            <QuestionResult key={d.question.id} index={i} detail={d} />
          ))}
        </div>
      </div>
    );
  }

  // =============================================
  // ÉCRAN JEU
  // =============================================
  const q = questions[currentIndex];
  const selected = answers[q.id] ?? [];
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const allAnswered = questions.every((q) => (answers[q.id] ?? []).length > 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Quitter
        </button>
        <span className="text-sm font-medium text-gray-700">{serie.name}</span>
        {timed && (
          <div className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
            timeLeft < 60 ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-700"
          )}>
            <Clock className="h-4 w-4" />
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Progression */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Question {currentIndex + 1} / {questions.length}</span>
          <span className="text-xs text-gray-400">
            {Object.keys(answers).length} répondues
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-navy transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        {/* Tags */}
        {q.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {q.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-medium text-navy">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Texte */}
        <p className="text-base font-medium text-gray-900 leading-relaxed">{q.text}</p>
        <p className="text-xs text-gray-400">
          {q.type === "qcm_multiple"
            ? "Cochez la ou les propositions exactes :"
            : "Une seule réponse correcte :"}
        </p>

        {/* Options */}
        <div className="space-y-2.5">
          {q.options!.map((opt) => {
            const isSelected = selected.includes(opt.label);
            return (
              <button
                key={opt.id}
                onClick={() => toggleAnswer(opt.label)}
                className={cn(
                  "w-full flex items-start gap-3 rounded-xl border p-4 text-left text-sm transition-all",
                  isSelected
                    ? "border-navy bg-navy/5 ring-1 ring-navy/30"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                )}
              >
                <span className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all",
                  isSelected
                    ? "border-navy bg-navy text-white"
                    : "border-gray-300 text-gray-500"
                )}>
                  {opt.label}
                </span>
                <span className="leading-relaxed pt-0.5">{opt.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Précédent
        </button>

        {/* Dots navigation */}
        <div className="flex gap-1.5 overflow-x-auto max-w-xs">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                "h-2.5 w-2.5 rounded-full shrink-0 transition-all",
                i === currentIndex
                  ? "bg-navy scale-125"
                  : (answers[q.id]?.length ?? 0) > 0
                    ? "bg-navy/40"
                    : "bg-gray-200"
              )}
            />
          ))}
        </div>

        {currentIndex < questions.length - 1 ? (
          <button
            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-light transition-colors"
          >
            Suivant
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
              allAnswered
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-navy text-white hover:bg-navy-light",
              submitting && "opacity-50 cursor-not-allowed"
            )}
          >
            <Send className="h-4 w-4" />
            {submitting ? "Envoi..." : "Terminer"}
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================
// Résultat d'une question (correction)
// =============================================
function QuestionResult({
  index,
  detail,
}: {
  index: number;
  detail: { question: Question; selected: string[]; correct: boolean };
}) {
  const { question: q, selected, correct } = detail;
  const correctLabels = q.options!.filter((o) => o.is_correct).map((o) => o.label);

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3",
      correct ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
    )}>
      <div className="flex items-start gap-3">
        {correct ? (
          <CheckCircle className="h-5 w-5 shrink-0 text-green-500 mt-0.5" />
        ) : (
          <XCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
        )}
        <p className="text-sm font-medium text-gray-800">
          <span className="text-gray-400 mr-1.5">{index + 1}.</span>
          {q.text}
        </p>
      </div>

      <div className="space-y-1.5 ml-8">
        {q.options!.map((opt) => {
          const wasSelected = selected.includes(opt.label);
          const isCorrect = opt.is_correct;
          return (
            <div
              key={opt.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                isCorrect
                  ? "border-green-300 bg-green-100 text-green-800"
                  : wasSelected && !isCorrect
                    ? "border-red-300 bg-red-100 text-red-800"
                    : "border-gray-200 bg-white text-gray-500"
              )}
            >
              <span className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold border",
                isCorrect ? "border-green-500 bg-green-200 text-green-800"
                : wasSelected ? "border-red-500 bg-red-200 text-red-800"
                : "border-gray-300 text-gray-400"
              )}>
                {opt.label}
              </span>
              {opt.text}
              {isCorrect && <CheckCircle className="ml-auto h-3 w-3 text-green-500 shrink-0" />}
              {wasSelected && !isCorrect && <XCircle className="ml-auto h-3 w-3 text-red-500 shrink-0" />}
            </div>
          );
        })}
      </div>

      {q.explanation && (
        <div className="ml-8 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
          <span className="font-semibold">Explication :</span> {q.explanation}
        </div>
      )}
    </div>
  );
}
