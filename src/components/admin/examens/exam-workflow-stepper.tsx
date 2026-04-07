"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, CheckCircle2, Loader2, Download, RefreshCw } from "lucide-react";
import { removeAllQuestionsFromSerie } from "@/app/(admin)/admin/exercices/actions";
import { createClient } from "@/lib/supabase/client";

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

const GRID_QUESTION_COUNT = 72;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExamWorkflowStepper({
  serieId,
  serieName,
  questionCount,
  examDebutAt,
  ueCode: propUeCode,
  subjectName: propSubjectName,
  hasCorrections,
  onQuestionsChanged,
  onSujetGenerated,
}: ExamWorkflowProps) {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [importingSujet, setImportingSujet] = useState(false);
  const [sujetDone, setSujetDone] = useState(questionCount > 0);
  const [sujetError, setSujetError] = useState<string | null>(null);
  const [sujetCount, setSujetCount] = useState(questionCount);
  const fileInputSujet = useRef<HTMLInputElement>(null);

  const [importingCorrection, setImportingCorrection] = useState(false);
  const [correctionDone, setCorrectionDone] = useState(!!hasCorrections);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const fileInputCorrection = useRef<HTMLInputElement>(null);

  const [dragOverSujet, setDragOverSujet] = useState(false);
  const [dragOverCorrection, setDragOverCorrection] = useState(false);

  const onDrop = (handler: (f: File) => void, setDrag: (v: boolean) => void) =>
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer.files?.[0];
      if (f && f.name.endsWith(".docx")) handler(f);
    };
  const onDragOver = (setDrag: (v: boolean) => void) =>
    (e: React.DragEvent) => { e.preventDefault(); setDrag(true); };
  const onDragLeave = (setDrag: (v: boolean) => void) =>
    () => setDrag(false);

  const [generatingGrid, setGeneratingGrid] = useState(false);
  const [gridUrl, setGridUrl] = useState<string | null>(null);
  const [gridError, setGridError] = useState<string | null>(null);

  const [sujetUrl, setSujetUrl] = useState<string | null>(null);

  // Exam date formatted for grid
  const examDate = examDebutAt
    ? new Date(examDebutAt).toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

  // ─── Auto-detect state from props ───────────────────────────────────────────
  useEffect(() => {
    if (questionCount > 0) { setSujetDone(true); setSujetCount(questionCount); }
    if (hasCorrections) setCorrectionDone(true);
  }, [questionCount, hasCorrections]);

  // Set sujet URL if already imported
  useEffect(() => {
    if (questionCount > 0) {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (base) setSujetUrl(`${base}/storage/v1/object/public/cours-pdfs/examens/${serieId}/sujet.docx`);
    }
  }, [questionCount, serieId]);

  // Auto-generate grid when correction is done
  const [autoGenDone, setAutoGenDone] = useState(false);
  useEffect(() => {
    if (correctionDone && questionCount > 0 && !autoGenDone && !gridUrl && !generatingGrid) {
      setAutoGenDone(true);
      generateGrid();
    }
  }, [correctionDone, questionCount]);

  // ─── Upload large file: server creates signed URL, client uploads directly ──
  async function uploadLargeFile(file: File, serieId: string): Promise<string | null> {
    try {
      // Step 1: Get signed upload URL from server (tiny JSON request, no file body)
      const res = await fetch("/api/upload-signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serieId, fileName: file.name }),
      });
      if (!res.ok) { console.error("[upload-large] signed url error", res.status); return null; }
      const { token, path, storagePath } = await res.json();

      // Step 2: Upload directly to Supabase Storage using the signed token (bypasses Vercel)
      const supabase = createClient();
      const { error } = await supabase.storage.from("cours-pdfs").uploadToSignedUrl(path, token, file, {
        upsert: true,
      });
      if (error) { console.error("[upload-large] storage upload error", error); return null; }
      return storagePath;
    } catch (e) { console.error("[upload-large]", e); return null; }
  }

  // ─── Import sujet ───────────────────────────────────────────────────────────
  async function handleImportSujet(file: File) {
    setImportingSujet(true);
    setSujetError(null);

    const formData = new FormData();
    formData.append("serieId", serieId);

    // Large files (>4MB): upload to Storage first via signed URL, send path to API
    if (file.size > 4 * 1024 * 1024) {
      const storagePath = await uploadLargeFile(file, serieId);
      if (!storagePath) { setSujetError("Erreur upload du fichier volumineux. Réessayez."); setImportingSujet(false); return; }
      formData.append("storagePath", storagePath);
    } else {
      formData.append("file", file);
    }

    try {
      const res = await fetch("/api/import-serie", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setSujetError(data.error || "Erreur import"); return; }

      setSujetDone(true);
      setSujetCount(data.created ?? data.questionsCreated ?? 0);
      if (data.sujetDocxUrl) {
        setSujetUrl(data.sujetDocxUrl);
        onSujetGenerated?.(data.sujetDocxUrl);
      }
      onQuestionsChanged();
    } catch (e: any) {
      setSujetError(e.message || "Erreur réseau");
    } finally {
      setImportingSujet(false);
    }
  }

  async function handleReimportSujet() {
    setSujetDone(false);
    setSujetError(null);
    setSujetCount(0);
    setCorrectionDone(false);
    setCorrectionError(null);
    setSujetUrl(null);
    setGridUrl(null);
    try {
      await removeAllQuestionsFromSerie(serieId);
      onQuestionsChanged();
    } catch (e: any) {
      setSujetError("Erreur suppression: " + e.message);
    }
    if (fileInputSujet.current) fileInputSujet.current.value = "";
  }

  // ─── Import correction ──────────────────────────────────────────────────────
  async function handleImportCorrection(file: File) {
    setImportingCorrection(true);
    setCorrectionError(null);

    const formData = new FormData();
    formData.append("serieId", serieId);

    if (file.size > 4 * 1024 * 1024) {
      const storagePath = await uploadLargeFile(file, serieId);
      if (!storagePath) { setCorrectionError("Erreur upload du fichier volumineux. Réessayez."); setImportingCorrection(false); return; }
      formData.append("storagePath", storagePath);
    } else {
      formData.append("file", file);
    }

    try {
      const res = await fetch("/api/import-serie", { method: "POST", body: formData });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) { setCorrectionError(`Erreur serveur (${res.status})`); return; }
      const data = await res.json();
      if (!res.ok) { setCorrectionError(data.error || "Erreur import"); return; }

      setCorrectionDone(true);
      onQuestionsChanged();
      generateGrid();
    } catch (e: any) {
      setCorrectionError(e.message || "Erreur réseau");
    } finally {
      setImportingCorrection(false);
    }
  }

  // ─── Generate grid ──────────────────────────────────────────────────────────
  async function generateGrid() {
    setGeneratingGrid(true);
    setGridError(null);
    try {
      const res = await fetch("/api/gen-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serieId,
          questionCount: GRID_QUESTION_COUNT,
          examTitle: serieName,
          ueCode: propUeCode || "",
          subjectName: propSubjectName || "",
          examDate,
          institution: "Diploma Santé",
          academicYear: "2026 - 2027",
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) setGridUrl(data.url + "?t=" + Date.now());
      else setGridError(data.error || "Erreur grille");
    } catch (e: any) { setGridError(e.message); }
    finally { setGeneratingGrid(false); }
  }

  // ─── Download helper ────────────────────────────────────────────────────────
  async function downloadDocx() {
    if (!sujetUrl) return;
    try {
      const res = await fetch(sujetUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sujet_${serieId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(sujetUrl, "_blank");
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Upload zones ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Sujet */}
        <div className="rounded-xl border border-white/10 bg-[#0e1e35] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white/80">Dépôt du sujet</h3>

          {importingSujet && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={16} className="animate-spin text-[#C9A84C]" />
              Import en cours...
            </div>
          )}

          {sujetError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
              {sujetError}
            </div>
          )}

          {sujetDone ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 size={16} />
                {sujetCount} questions importées
              </div>
              <button onClick={handleReimportSujet}
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition">
                <RefreshCw size={12} /> Réimporter
              </button>
            </div>
          ) : !importingSujet && (
            <>
              <input ref={fileInputSujet} type="file" accept=".docx" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportSujet(f); }} />
              <button onClick={() => fileInputSujet.current?.click()}
                onDrop={onDrop(handleImportSujet, setDragOverSujet)}
                onDragOver={onDragOver(setDragOverSujet)}
                onDragLeave={onDragLeave(setDragOverSujet)}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm transition ${dragOverSujet ? "border-[#C9A84C] bg-[#C9A84C]/20 text-[#C9A84C]" : "border-[#C9A84C]/40 bg-[#C9A84C]/5 text-[#C9A84C] hover:border-[#C9A84C]/70 hover:bg-[#C9A84C]/10"}`}>
                <Upload size={18} />
                {dragOverSujet ? "Déposer ici" : "Fichier sujet .docx"}
              </button>
            </>
          )}
        </div>

        {/* Correction */}
        <div className="rounded-xl border border-white/10 bg-[#0e1e35] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white/80">Dépôt de la correction</h3>

          {importingCorrection && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={16} className="animate-spin text-[#C9A84C]" />
              Import en cours...
            </div>
          )}

          {correctionError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
              {correctionError}
            </div>
          )}

          {correctionDone ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 size={16} />
                Correction importée
              </div>
              <button onClick={() => { setCorrectionDone(false); setCorrectionError(null); }}
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition">
                <RefreshCw size={12} /> Réimporter
              </button>
            </div>
          ) : !importingCorrection && (
            <>
              <input ref={fileInputCorrection} type="file" accept=".docx" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportCorrection(f); }} />
              <button onClick={() => fileInputCorrection.current?.click()}
                disabled={!sujetDone}
                onDrop={onDrop(handleImportCorrection, setDragOverCorrection)}
                onDragOver={onDragOver(setDragOverCorrection)}
                onDragLeave={onDragLeave(setDragOverCorrection)}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm transition disabled:opacity-30 disabled:cursor-not-allowed ${dragOverCorrection ? "border-[#C9A84C] bg-[#C9A84C]/20 text-[#C9A84C]" : "border-[#C9A84C]/40 bg-[#C9A84C]/5 text-[#C9A84C] hover:border-[#C9A84C]/70 hover:bg-[#C9A84C]/10"}`}>
                <Upload size={18} />
                {dragOverCorrection ? "Déposer ici" : "Fichier correction .docx"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Downloads ───────────────────────────────────────────────────────── */}
      {(sujetUrl || gridUrl || generatingGrid || gridError) && (
        <div className="rounded-xl border border-white/10 bg-[#0e1e35] p-5 space-y-3">
          <h3 className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Documents</h3>

          {generatingGrid && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={16} className="animate-spin text-[#C9A84C]" />
              Génération de la grille...
            </div>
          )}

          {gridError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
              {gridError}
            </div>
          )}

          <div className="flex gap-3">
            {sujetUrl && (
              <button onClick={downloadDocx}
                className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-4 py-2.5 text-sm font-medium text-black transition hover:bg-[#d4b55c]">
                <Download size={16} />
                Sujet Word
              </button>
            )}
            {gridUrl && (
              <a href={gridUrl} download target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15">
                <Download size={16} />
                Grille ({GRID_QUESTION_COUNT} QCM)
              </a>
            )}
          </div>

          {(sujetUrl || gridUrl) && (
            <button onClick={generateGrid} disabled={generatingGrid}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition disabled:opacity-40">
              <RefreshCw size={12} /> Regénérer la grille
            </button>
          )}
        </div>
      )}
    </div>
  );
}
