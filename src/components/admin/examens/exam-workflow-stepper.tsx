"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, CheckCircle2, Loader2, Download, RefreshCw } from "lucide-react";
import { removeAllQuestionsFromSerie } from "@/app/(admin)/admin/exercices/actions";
import { createClient } from "@/lib/supabase/client";
import JSZip from "jszip";
import UTIF from "utif2";

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

/**
 * Compress a DOCX file client-side by converting TIFF images to JPEG.
 * Uses utif2 to decode TIFF in the browser + OffscreenCanvas to encode JPEG.
 * 15MB → ~0.6MB typical compression.
 */
async function compressDocxClientSide(file: File): Promise<File> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const tiffFiles = Object.keys(zip.files).filter(f => /\.(tiff|tif)$/i.test(f));

  if (tiffFiles.length === 0) return file; // No TIFF, return as-is

  for (const mediaPath of tiffFiles) {
    try {
      const tiffBuf = await zip.file(mediaPath)!.async("arraybuffer");
      const ifds = UTIF.decode(tiffBuf);
      if (ifds.length === 0) continue;
      UTIF.decodeImage(tiffBuf, ifds[0]);
      const rgba = UTIF.toRGBA8(ifds[0]);
      const w = ifds[0].width;
      const h = ifds[0].height;

      // Draw on OffscreenCanvas and convert to JPEG
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d")!;
      const clampedArr = new Uint8ClampedArray(rgba.length);
      clampedArr.set(rgba);
      const imgData = new ImageData(clampedArr as any, w, h);
      ctx.putImageData(imgData, 0, 0);
      const jpegBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.75 });

      // Replace TIFF with JPEG in ZIP
      const jpegName = mediaPath.replace(/\.(tiff|tif)$/i, ".jpeg");
      zip.remove(mediaPath);
      zip.file(jpegName, await jpegBlob.arrayBuffer());

      // Update rels
      const relsFile = zip.file("word/_rels/document.xml.rels");
      if (relsFile) {
        let rels = await relsFile.async("string");
        rels = rels.replace(mediaPath.replace("word/", ""), jpegName.replace("word/", ""));
        zip.file("word/_rels/document.xml.rels", rels);
      }
    } catch (e) {
      console.warn("[compress] Skip", mediaPath, e);
    }
  }

  const compressedBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  console.log(`[compress] ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(compressedBlob.size / 1024 / 1024).toFixed(1)}MB (${tiffFiles.length} TIFF converted)`);
  return new File([compressedBlob], file.name, { type: file.type });
}

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
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
      if (error) { console.error("[upload-large] storage upload error", JSON.stringify(error)); return null; }
      return storagePath;
    } catch (e: any) { console.error("[upload-large] exception", e?.message || e); return null; }
  }

  // ─── Import sujet ───────────────────────────────────────────────────────────
  async function handleImportSujet(file: File) {
    setImportingSujet(true);
    setSujetError(null);

    const formData = new FormData();
    formData.append("serieId", serieId);

    // Large files (>4MB): compress TIFF→JPEG entirely client-side, then send compressed file
    if (file.size > 4 * 1024 * 1024) {
      try {
        const compressed = await compressDocxClientSide(file);
        formData.append("file", compressed);
      } catch (e: any) {
        setSujetError("Erreur compression: " + e.message); setImportingSujet(false); return;
      }
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
      try {
        const compressed = await compressDocxClientSide(file);
        formData.append("file", compressed);
      } catch (e: any) {
        setCorrectionError("Erreur compression: " + e.message); setImportingCorrection(false); return;
      }
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
