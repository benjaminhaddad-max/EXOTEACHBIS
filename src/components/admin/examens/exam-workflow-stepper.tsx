"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Download,
  RefreshCw,
  ChevronRight,
  Eye,
} from "lucide-react";
import { removeAllQuestionsFromSerie } from "@/app/(admin)/admin/exercices/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExamWorkflowProps = {
  serieId: string;
  serieName: string;
  serieType: string;
  questionCount: number;
  examDebutAt?: string | null;
  examFinAt?: string | null;
  ueCode?: string;
  subjectName?: string;
  hasCorrections?: boolean;
  onQuestionsChanged: () => void;
  onSujetGenerated?: (url: string) => void;
};

type StepStatus = "pending" | "active" | "done";

type ImportResult = {
  questionsCreated?: number;
  questionsUpdated?: number;
  imagesUploaded?: number;
  sectionsCreated?: number;
  correctAnswersMarked?: number;
};

type PdfFormData = {
  institution: string;
  academicYear: string;
  examTitle: string;
  ueCode: string;
  subjectName: string;
  duration: string;
  dateTime: string;
};

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, title: "Dépôt du sujet", icon: Upload },
  { num: 2, title: "Dépôt de la correction", icon: FileText },
] as const;

const GRID_QUESTION_COUNT = 72; // Always 72 lines in the grid

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExamWorkflowStepper({
  serieId,
  serieName,
  serieType,
  questionCount,
  examDebutAt,
  examFinAt,
  ueCode: propUeCode,
  subjectName: propSubjectName,
  hasCorrections,
  onQuestionsChanged,
  onSujetGenerated,
}: ExamWorkflowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Auto-detect completed steps when props change (questions loaded async)
  useEffect(() => {
    const steps = new Set<number>();
    if (questionCount > 0) steps.add(1);
    if (hasCorrections) { steps.add(1); steps.add(2); }
    if (steps.size > 0) {
      setCompletedSteps(prev => {
        const merged = new Set([...prev, ...steps]);
        return merged.size !== prev.size ? merged : prev;
      });
      if (questionCount > 0 && currentStep === 1) setCurrentStep(2);
    }
  }, [questionCount, hasCorrections]);

  // Auto-generate documents when both steps are already done (returning to page)
  const [autoGenDone, setAutoGenDone] = useState(false);
  useEffect(() => {
    // Set sujet Word URL if questions exist (file was stored during import)
    if (questionCount > 0 && !pdfUrl) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        setPdfUrl(`${supabaseUrl}/storage/v1/object/public/cours-pdfs/examens/${serieId}/sujet.docx?t=${Date.now()}`);
      }
    }
    // Auto-generate grid when correction is done
    if (hasCorrections && questionCount > 0 && !autoGenDone && !gridUrl && !generatingGrid) {
      setAutoGenDone(true);
      autoGenerateOutputs().catch(e => console.error("[autoGen on mount]", e));
    }
  }, [hasCorrections, questionCount]);

  // Step 1 state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef1 = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [importingCorrection, setImportingCorrection] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<ImportResult | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  // Step 3 state
  const [pdfForm, setPdfForm] = useState<PdfFormData>({
    institution: "Diploma Santé",
    academicYear: "2025 - 2026",
    examTitle: serieName,
    ueCode: propUeCode || "",
    subjectName: propSubjectName || "",
    duration: "1H30",
    dateTime: examDebutAt
      ? new Date(examDebutAt).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
  });
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Step 4 state
  const [generatingGrid, setGeneratingGrid] = useState(false);
  const [gridUrl, setGridUrl] = useState<string | null>(null);
  const [gridError, setGridError] = useState<string | null>(null);
  const fileInputGrid = useRef<HTMLInputElement>(null);
  const [uploadingGrid, setUploadingGrid] = useState(false);

  // ─── Step status ──────────────────────────────────────────────────────────────

  function getStepStatus(stepNum: number): StepStatus {
    if (completedSteps.has(stepNum)) return "done";
    if (stepNum === currentStep) return "active";
    return "pending";
  }

  function markComplete(stepNum: number) {
    setCompletedSteps((prev) => new Set([...prev, stepNum]));
  }

  function goToStep(stepNum: number) {
    setCurrentStep(stepNum);
  }

  // ─── Step 1: Import sujet ─────────────────────────────────────────────────────

  async function handleImportSubject(file: File) {
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("serieId", serieId);
    // Exam metadata for cover page update
    formData.append("examTitle", pdfForm.examTitle || serieName);
    formData.append("ueCode", pdfForm.ueCode || "");
    formData.append("subjectName", pdfForm.subjectName || "");
    formData.append("duration", pdfForm.duration || "1H30");
    formData.append("examDate", pdfForm.dateTime || "");
    formData.append("institution", pdfForm.institution || "Diploma Santé");
    formData.append("academicYear", pdfForm.academicYear || "2025 - 2026");

    try {
      const res = await fetch("/api/import-serie", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Erreur lors de l'import");
        return;
      }
      setImportResult({
        questionsCreated: data.questionsCreated ?? data.created ?? 0,
        imagesUploaded: data.imagesUploaded ?? 0,
        sectionsCreated: data.sectionsCreated ?? 0,
      });
      // Store the original .docx URL for direct download
      if (data.sujetDocxUrl) {
        setPdfUrl(data.sujetDocxUrl + "?t=" + Date.now());
        onSujetGenerated?.(data.sujetDocxUrl);
      }
      markComplete(1);
      onQuestionsChanged();
    } catch (err: any) {
      setImportError(err.message || "Erreur réseau");
    } finally {
      setImporting(false);
    }
  }

  async function handleReimport() {
    setImportResult(null);
    setImportError(null);
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.delete(1);
      next.delete(2);
      return next;
    });

    try {
      await removeAllQuestionsFromSerie(serieId);
      onQuestionsChanged();
    } catch (err: any) {
      setImportError("Erreur lors de la suppression : " + err.message);
    }

    if (fileInputRef1.current) fileInputRef1.current.value = "";
  }

  // ─── Step 2: Import correction ────────────────────────────────────────────────

  async function handleImportCorrection(file: File) {
    setImportingCorrection(true);
    setCorrectionError(null);
    setCorrectionResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("serieId", serieId);

    try {
      const res = await fetch("/api/import-serie", {
        method: "POST",
        body: formData,
      });

      // Handle non-JSON responses (timeout, 500, etc.)
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        setCorrectionError(`Erreur serveur (${res.status}). Le serveur n'a pas répondu correctement. Réessayez.`);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setCorrectionError(data.error || `Erreur ${res.status}`);
        return;
      }
      setCorrectionResult({
        questionsUpdated: data.questionsUpdated ?? data.updated ?? data.created ?? 0,
        correctAnswersMarked: data.correctAnswersMarked ?? data.answersMarked ?? 0,
      });
      markComplete(2);
      onQuestionsChanged();

      // Auto-generate PDF + Grid after correction (don't await - fire and forget)
      autoGenerateOutputs().catch(e => console.error("[autoGenerate]", e));
    } catch (err: any) {
      console.error("[correction import]", err);
      setCorrectionError(String(err?.message || err || "Erreur réseau — vérifiez que le deploy Vercel est terminé"));
    } finally {
      setImportingCorrection(false);
    }
  }

  // ─── Auto-generate PDF + Grid ────────────────────────────────────────────────

  async function autoGenerateOutputs() {
    // Sujet Word is already stored during import — no generation needed

    // Generate Grid (always 72 lines)
    setGeneratingGrid(true);
    setGridError(null);
    try {
      const res = await fetch("/api/gen-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serieId,
          questionCount: GRID_QUESTION_COUNT,
          examTitle: pdfForm.examTitle || serieName,
          subjectName: pdfForm.subjectName || "",
          examDate: pdfForm.dateTime || "",
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setGridUrl(data.url + "?t=" + Date.now());
      } else {
        setGridError(data.error || "Erreur génération grille");
      }
    } catch (e: any) { setGridError(e.message); }
    finally { setGeneratingGrid(false); }
  }

  // ─── Step 3: Generate PDF ─────────────────────────────────────────────────────

  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    setPdfError(null);
    setPdfUrl(null);

    try {
      const res = await fetch("/api/generate-exam-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serieId,
          institution: pdfForm.institution,
          academicYear: pdfForm.academicYear,
          examTitle: pdfForm.examTitle,
          ueCode: pdfForm.ueCode,
          subjectName: pdfForm.subjectName,
          duration: pdfForm.duration,
          examDate: pdfForm.dateTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPdfError(data.error || "Erreur lors de la génération");
        return;
      }
      setPdfUrl(data.url);
      markComplete(3);
      onSujetGenerated?.(data.url);
    } catch (err: any) {
      setPdfError(err.message || "Erreur réseau");
    } finally {
      setGeneratingPdf(false);
    }
  }

  // ─── Step 4: Generate grid ────────────────────────────────────────────────────

  async function handleGenerateGrid() {
    setGeneratingGrid(true);
    setGridError(null);
    setGridUrl(null);

    try {
      const res = await fetch("/api/gen-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serieId,
          questionCount,
          examTitle: pdfForm.examTitle || serieName,
          subjectName: pdfForm.subjectName || "",
          examDate: pdfForm.dateTime || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGridError(data.error || "Erreur lors de la génération");
        return;
      }
      setGridUrl(data.url + "?t=" + Date.now());
      markComplete(4);
    } catch (err: any) {
      setGridError(err.message || "Erreur réseau");
    } finally {
      setGeneratingGrid(false);
    }
  }

  async function handleUploadGrid(file: File) {
    setUploadingGrid(true);
    setGridError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("serieId", serieId);

    try {
      const res = await fetch("/api/gen-grid", {
        method: "PUT",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setGridError(data.error || "Erreur lors de l'upload");
        return;
      }
      setGridUrl(data.url + "?t=" + Date.now());
      markComplete(4);
    } catch (err: any) {
      setGridError(err.message || "Erreur réseau");
    } finally {
      setUploadingGrid(false);
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────────

  function renderStepCircle(stepNum: number) {
    const status = getStepStatus(stepNum);
    const StepIcon = STEPS[stepNum - 1].icon;

    if (status === "done") {
      return (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/20 text-green-400">
          <CheckCircle2 size={20} />
        </div>
      );
    }
    if (status === "active") {
      return (
        <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]">
          <span className="text-sm font-bold">{stepNum}</span>
        </div>
      );
    }
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/40">
        <span className="text-sm">{stepNum}</span>
      </div>
    );
  }

  // ─── Step content renderers ───────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          Importez le fichier .docx du sujet d'examen. Les questions, options et images
          seront automatiquement extraites.
        </p>

        {!importResult && !importing && (
          <div>
            <input
              ref={fileInputRef1}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportSubject(f);
              }}
            />
            <button
              onClick={() => fileInputRef1.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-dashed border-[#C9A84C]/40 bg-[#C9A84C]/5 px-6 py-4 text-sm text-[#C9A84C] transition hover:border-[#C9A84C]/70 hover:bg-[#C9A84C]/10"
            >
              <Upload size={18} />
              Choisir un fichier .docx
            </button>
          </div>
        )}

        {importing && (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
            <Loader2 size={18} className="animate-spin text-[#C9A84C]" />
            Import en cours... Analyse du document
          </div>
        )}

        {importError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {importError}
          </div>
        )}

        {importResult && (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              <CheckCircle2 size={16} className="mb-1 mr-2 inline" />
              {importResult.questionsCreated} questions importées
              {(importResult.imagesUploaded ?? 0) > 0 &&
                `, ${importResult.imagesUploaded} images`}
              {(importResult.sectionsCreated ?? 0) > 0 &&
                `, ${importResult.sectionsCreated} sections`}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  markComplete(1);
                  goToStep(2);
                }}
                className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#d4b55c]"
              >
                Vérifier les questions
                <ChevronRight size={16} />
              </button>
              <button
                onClick={handleReimport}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:bg-white/5"
              >
                <RefreshCw size={14} />
                Réimporter
              </button>
            </div>
          </div>
        )}

        {/* Already imported previously */}
        {!importResult && !importing && questionCount > 0 && (
          <div className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
              <CheckCircle2 size={16} className="mb-1 mr-2 inline text-green-400" />
              {questionCount} questions déjà importées
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => goToStep(2)}
                className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#d4b55c]"
              >
                Continuer
                <ChevronRight size={16} />
              </button>
              <button
                onClick={handleReimport}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:bg-white/5"
              >
                <RefreshCw size={14} />
                Réimporter
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderStep2() {
    // If corrections already exist (from DB), show completed state directly
    const alreadyDone = hasCorrections && !correctionResult && !importingCorrection;

    if (alreadyDone) {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            <CheckCircle2 size={16} className="mb-1 mr-2 inline" />
            Correction déjà importée — les documents sont disponibles ci-dessous.
          </div>
          <button
            onClick={() => { setCorrectionResult(null); }}
            className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            <RefreshCw size={12} />
            Réimporter une correction
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          Importez le fichier .docx de la correction. Les bonnes réponses seront
          automatiquement identifiées (surlignage vert) et marquées sur les questions existantes.
        </p>

        {!correctionResult && !importingCorrection && (
          <div>
            <input
              ref={fileInputRef2}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportCorrection(f);
              }}
            />
            <button
              onClick={() => fileInputRef2.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-dashed border-[#C9A84C]/40 bg-[#C9A84C]/5 px-6 py-4 text-sm text-[#C9A84C] transition hover:border-[#C9A84C]/70 hover:bg-[#C9A84C]/10"
            >
              <Upload size={18} />
              Choisir le fichier correction .docx
            </button>
          </div>
        )}

        {importingCorrection && (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
            <Loader2 size={18} className="animate-spin text-[#C9A84C]" />
            Import de la correction en cours...
          </div>
        )}

        {correctionError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {correctionError}
          </div>
        )}

        {correctionResult && (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              <CheckCircle2 size={16} className="mb-1 mr-2 inline" />
              {correctionResult.questionsUpdated ?? 0} questions mises à jour
              {(correctionResult.correctAnswersMarked ?? 0) > 0 &&
                `, ${correctionResult.correctAnswersMarked} réponses correctes marquées`}
              {" — Sujet Word et grille générés automatiquement ci-dessous."}
            </div>
          </div>
        )}
      </div>
    );
  }

  const stepRenderers = [renderStep1, renderStep2];

  // ─── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-white/10 bg-[#0e1e35]">
      {/* ── Stepper header (2 steps) ──────────────────────────────────────────── */}
      <div className="flex items-center border-b border-white/10 px-6 py-4">
        {STEPS.map((step, idx) => (
          <div key={step.num} className="flex items-center">
            <button
              onClick={() => goToStep(step.num)}
              className="flex items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-white/5"
            >
              {renderStepCircle(step.num)}
              <div className="text-left">
                <div
                  className={`text-sm font-medium ${
                    getStepStatus(step.num) === "active"
                      ? "text-[#C9A84C]"
                      : getStepStatus(step.num) === "done"
                      ? "text-green-400"
                      : "text-white/40"
                  }`}
                >
                  {step.title}
                </div>
              </div>
            </button>
            {idx < STEPS.length - 1 && (
              <div
                className={`mx-3 h-px w-8 ${
                  completedSteps.has(step.num)
                    ? "bg-green-500/40"
                    : "bg-white/10"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Step content ───────────────────────────────────────────────────────── */}
      <div className="px-6 py-5">{stepRenderers[currentStep - 1]()}</div>

      {/* ── Auto-generated outputs (after correction) ─────────────────────────── */}
      {(generatingPdf || generatingGrid || pdfUrl || gridUrl || pdfError || gridError) && (
        <div className="border-t border-white/10 px-6 py-5 space-y-4">
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
            Documents générés automatiquement
          </p>

          {/* Loading state */}
          {(generatingPdf || generatingGrid) && (
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              <Loader2 size={18} className="animate-spin text-[#C9A84C]" />
              {"Génération de la grille..."}
            </div>
          )}

          {/* Errors */}
          {pdfError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Word : {pdfError}
            </div>
          )}
          {gridError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Grille : {gridError}
            </div>
          )}

          {/* Download buttons */}
          <div className="flex gap-3">
            {pdfUrl && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(pdfUrl);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `sujet_${serieId}.docx`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch { window.open(pdfUrl, "_blank"); }
                }}
                className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-4 py-2.5 text-sm font-medium text-black transition hover:bg-[#d4b55c]">
                <Download size={16} />
                Télécharger le sujet Word
              </button>
            )}
            {gridUrl && (
              <a href={gridUrl} download target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15">
                <Download size={16} />
                Télécharger la grille (72 QCM)
              </a>
            )}
          </div>

          {/* Regenerate */}
          {(pdfUrl || gridUrl) && (
            <button onClick={autoGenerateOutputs} disabled={generatingPdf || generatingGrid}
              className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors disabled:opacity-40">
              <RefreshCw size={12} />
              Regénérer les documents
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Reusable form field ──────────────────────────────────────────────────────

function FormField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-white/50">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none transition focus:border-[#C9A84C]/50 focus:ring-1 focus:ring-[#C9A84C]/20"
      />
    </div>
  );
}
