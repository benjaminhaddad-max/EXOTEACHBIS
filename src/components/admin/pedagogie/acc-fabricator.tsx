"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  Upload, Loader2, FileText, Download, Trash2,
  Wand2, CheckCircle, AlertCircle, ChevronDown, ChevronRight,
  Scissors, Eye, X, Calendar,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type UploadedChapter = {
  file: File;
  name: string;
  pageCount: number;
  pdfBytes: ArrayBuffer;
};

type PageAnalysis = {
  pageIndex: number;
  globalPageIndex: number;
  chapterIndex: number;
  chapterName: string;
  year: string | null;
  session: string | null;
  category: string | null;
  isTitle: boolean;
  isToc: boolean;
};

type YearGroup = {
  year: string;
  session: string | null;
  category: string | null;
  pages: { chapterIndex: number; pageIndex: number; chapterName: string }[];
};

type Step = "upload" | "analyzing" | "review" | "building" | "done";

function cleanWatermark(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const gray = (r + g + b) / 3;

    if (gray > 56) {
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
  }

  const headerH = Math.floor(h * 0.045);
  const headerW = Math.floor(w * 0.22);
  const yearW = Math.floor(w * 0.25);
  const yearH = Math.floor(h * 0.025);
  const footerStart = Math.floor(h * 0.96);

  for (let y = 0; y < headerH; y++) {
    for (let x = 0; x < headerW; x++) {
      const idx = (y * w + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = 255;
    }
  }
  for (let y = 0; y < yearH; y++) {
    for (let x = w - yearW; x < w; x++) {
      const idx = (y * w + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = 255;
    }
  }
  for (let y = footerStart; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function pageToJpegBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.5).split(",")[1];
}

export function AccFabricator({ dossierId, dossierName }: { dossierId: string; dossierName: string }) {
  const [step, setStep] = useState<Step>("upload");
  const [chapters, setChapters] = useState<UploadedChapter[]>([]);
  const [analyses, setAnalyses] = useState<PageAnalysis[]>([]);
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [outputPdfs, setOutputPdfs] = useState<{ year: string; blob: Blob; pageCount: number }[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [error, setError] = useState("");
  const [expandedYear, setExpandedYear] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const pdfs: UploadedChapter[] = [];
    for (const file of Array.from(files)) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) continue;
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer).slice(0);
        const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
        const rawName = file.name
          .replace(/\.pdf$/i, "")
          .replace(/^ACC\s*\(SUJET\)\s*-\s*N°\d+\s*-\s*(Chapitre\s+)?/i, "")
          .trim();
        pdfs.push({ file, name: rawName || file.name, pageCount: doc.numPages, pdfBytes: bytes.buffer as ArrayBuffer });
      } catch (err) {
        console.error("Erreur lecture PDF:", file.name, err);
      }
    }
    pdfs.sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
    setChapters((prev) => {
      const existing = new Set(prev.map((c) => c.file.name));
      const newOnes = pdfs.filter((p) => !existing.has(p.file.name));
      return [...prev, ...newOnes].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
    });
  }, []);

  const analyze = useCallback(async () => {
    if (chapters.length === 0) return;
    setError("");
    setStep("analyzing");

    try {
      const allPageData: { pageIndex: number; chapterIndex: number; chapterName: string; imageBase64: string }[] = [];
      let globalIdx = 0;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const totalPages = chapters.reduce((s, c) => s + c.pageCount, 0);
      setProgress({ current: 0, total: totalPages, label: "Rendu des pages..." });

      for (let ci = 0; ci < chapters.length; ci++) {
        const ch = chapters[ci];
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(ch.pdfBytes).slice(0) }).promise;

        for (let pi = 0; pi < doc.numPages; pi++) {
          const page = await doc.getPage(pi + 1);
          const vp = page.getViewport({ scale: 1.0 });
          canvas.width = vp.width;
          canvas.height = vp.height;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;

          const base64 = pageToJpegBase64(canvas);
          allPageData.push({
            pageIndex: pi,
            chapterIndex: ci,
            chapterName: ch.name,
            imageBase64: base64,
          });
          globalIdx++;
          setProgress({ current: globalIdx, total: totalPages, label: "Rendu des pages..." });
        }
      }

      setProgress({ current: 0, total: allPageData.length, label: "Analyse IA des années..." });

      const BATCH = 12;
      const allResults: PageAnalysis[] = [];

      for (let i = 0; i < allPageData.length; i += BATCH) {
        const batch = allPageData.slice(i, i + BATCH);
        const res = await fetch("/api/acc-fabricator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pages: batch.map((p) => ({
              pageIndex: p.pageIndex,
              chapterName: p.chapterName,
              imageBase64: p.imageBase64,
            })),
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
          throw new Error(err.error || "Erreur lors de l'analyse");
        }

        const json = await res.json();
        for (const r of json.pages) {
          const orig = batch.find((b) => b.pageIndex === r.pageIndex);
          if (!orig) continue;
          allResults.push({
            pageIndex: r.pageIndex,
            globalPageIndex: allPageData.indexOf(orig),
            chapterIndex: orig.chapterIndex,
            chapterName: orig.chapterName,
            year: r.year || null,
            session: r.session || null,
            category: r.category || null,
            isTitle: !!r.isTitle,
            isToc: !!r.isToc,
          });
        }

        setProgress({ current: Math.min(i + BATCH, allPageData.length), total: allPageData.length, label: "Analyse IA des années..." });
      }

      let currentYear: string | null = null;
      let currentSession: string | null = null;
      for (const a of allResults) {
        if (a.year) {
          currentYear = a.year;
          currentSession = a.session;
        } else {
          a.year = currentYear;
          a.session = currentSession;
        }
      }

      setAnalyses(allResults);

      const groups = new Map<string, YearGroup>();
      for (const a of allResults) {
        if (a.isTitle || a.isToc || !a.year) continue;
        const key = `${a.year}${a.session ? ` – ${a.session}` : ""}`;
        if (!groups.has(key)) {
          groups.set(key, { year: a.year, session: a.session, category: a.category, pages: [] });
        }
        groups.get(key)!.pages.push({
          chapterIndex: a.chapterIndex,
          pageIndex: a.pageIndex,
          chapterName: a.chapterName,
        });
      }

      const sorted = Array.from(groups.values()).sort((a, b) => {
        const ya = parseInt(a.year), yb = parseInt(b.year);
        if (ya !== yb) return yb - ya;
        return (a.session ?? "").localeCompare(b.session ?? "");
      });

      setYearGroups(sorted);
      setStep("review");
    } catch (e: any) {
      setError(e.message || "Erreur lors de l'analyse");
      setStep("upload");
    }
  }, [chapters]);

  const buildPdfs = useCallback(async () => {
    setStep("building");
    setProgress({ current: 0, total: yearGroups.length, label: "Création des PDFs..." });
    const results: { year: string; blob: Blob; pageCount: number }[] = [];

    try {
      const pdfjsCache = new Map<number, any>();
      async function getPdfjsDoc(chapterIndex: number) {
        if (!pdfjsCache.has(chapterIndex)) {
          const ch = chapters[chapterIndex];
          const copy = new Uint8Array(ch.pdfBytes).slice(0);
          const doc = await pdfjsLib.getDocument({ data: copy }).promise;
          pdfjsCache.set(chapterIndex, doc);
        }
        return pdfjsCache.get(chapterIndex)!;
      }

      for (let gi = 0; gi < yearGroups.length; gi++) {
        const group = yearGroups[gi];
        const label = `${group.year}${group.session ? ` – ${group.session}` : ""}`;
        setProgress({ current: gi, total: yearGroups.length, label: `Création: ${label}...` });

        const newDoc = await PDFDocument.create();

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;

        for (const pg of group.pages) {
          const pdfDoc = await getPdfjsDoc(pg.chapterIndex);
          const page = await pdfDoc.getPage(pg.pageIndex + 1);
          const scale = 2.0;
          const vp = page.getViewport({ scale });
          canvas.width = vp.width;
          canvas.height = vp.height;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;

          cleanWatermark(canvas);

          const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.85);
          const jpegBase64 = jpegDataUrl.split(",")[1];
          const jpegBytes = Uint8Array.from(atob(jpegBase64), (c) => c.charCodeAt(0));

          const jpgImage = await newDoc.embedJpg(jpegBytes);
          const newPage = newDoc.addPage([page.getViewport({ scale: 1.0 }).width, page.getViewport({ scale: 1.0 }).height]);
          newPage.drawImage(jpgImage, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
        }

        const pdfBytes = await newDoc.save();
        results.push({
          year: label,
          blob: new Blob([Buffer.from(pdfBytes)], { type: "application/pdf" }),
          pageCount: group.pages.length,
        });
      }

      setOutputPdfs(results);
      setStep("done");
    } catch (e: any) {
      setError(e.message || "Erreur lors de la construction");
      setStep("review");
    }
  }, [chapters, yearGroups]);

  const downloadPdf = (pdf: { year: string; blob: Blob }) => {
    const url = URL.createObjectURL(pdf.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dossierName} - ACC ${pdf.year}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    for (const pdf of outputPdfs) downloadPdf(pdf);
  };

  const removeChapter = (idx: number) => {
    setChapters((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalPages = chapters.reduce((s, c) => s + c.pageCount, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-white/8 bg-gradient-to-r from-orange-500/8 to-amber-500/8 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Scissors size={16} className="text-orange-400" />
          <h3 className="text-sm font-bold text-white">Fabricateur d&apos;ACC par année</h3>
        </div>
        <p className="text-[11px] text-white/50 leading-relaxed">
          Déposez vos ACC classées par chapitre. L&apos;IA analysera automatiquement les marqueurs
          d&apos;année pour reconstituer des épreuves complètes propres, sans filigrane,
          regroupées par année et session.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-300"><X size={12} /></button>
        </div>
      )}

      {/* Step: Upload */}
      {step === "upload" && (
        <>
          <div
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer group ${
              dragging
                ? "border-orange-400 bg-orange-500/10"
                : "border-white/15 hover:border-orange-400/40"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); } }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setDragging(false); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); }}
          >
            <Upload size={24} className={`mx-auto mb-3 transition-colors ${dragging ? "text-orange-400" : "text-white/20 group-hover:text-orange-400/60"}`} />
            <p className={`text-xs font-semibold transition-colors ${dragging ? "text-orange-300" : "text-white/40 group-hover:text-white/60"}`}>
              {dragging ? "Relâchez pour ajouter les fichiers" : "Glissez vos PDFs par chapitre ici"}
            </p>
            <p className="text-[10px] text-white/25 mt-1">ou cliquez pour sélectionner</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => { if (e.target.files && e.target.files.length > 0) { handleFiles(e.target.files); e.target.value = ""; } }}
            />
          </div>

          {chapters.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white/60">
                  {chapters.length} chapitre{chapters.length > 1 ? "s" : ""} — {totalPages} pages
                </span>
                <button onClick={() => setChapters([])} className="text-[10px] text-red-400 hover:text-red-300">
                  Tout supprimer
                </button>
              </div>
              {chapters.map((ch, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/8 bg-white/3">
                  <FileText size={13} className="text-orange-400 shrink-0" />
                  <span className="text-xs text-white/70 flex-1 truncate">{ch.name}</span>
                  <span className="text-[10px] text-white/30 shrink-0">{ch.pageCount} p.</span>
                  <button onClick={() => removeChapter(i)} className="text-white/20 hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              <button
                onClick={analyze}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-300 text-xs font-bold transition-colors"
              >
                <Wand2 size={14} />
                Analyser et découper par année
              </button>
            </div>
          )}
        </>
      )}

      {/* Step: Analyzing */}
      {(step === "analyzing" || step === "building") && (
        <div className="rounded-xl border border-white/8 bg-white/3 p-6 text-center">
          <Loader2 size={24} className="mx-auto text-orange-400 animate-spin mb-3" />
          <p className="text-xs font-semibold text-white/60 mb-1">{progress.label}</p>
          {progress.total > 0 && (
            <div className="w-48 mx-auto h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
          <p className="text-[10px] text-white/30 mt-2">
            {progress.current} / {progress.total}
          </p>
        </div>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/60">
              {yearGroups.length} épreuve{yearGroups.length > 1 ? "s" : ""} détectée{yearGroups.length > 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => { setStep("upload"); setAnalyses([]); setYearGroups([]); }}
                className="text-[10px] text-white/40 hover:text-white/60"
              >
                Recommencer
              </button>
            </div>
          </div>

          {yearGroups.map((g) => {
            const key = `${g.year}${g.session ? ` – ${g.session}` : ""}`;
            const isExpanded = expandedYear === key;
            return (
              <div key={key} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                <button
                  onClick={() => setExpandedYear(isExpanded ? null : key)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/3 transition-colors"
                >
                  {isExpanded ? <ChevronDown size={12} className="text-white/40" /> : <ChevronRight size={12} className="text-white/40" />}
                  <Calendar size={13} className="text-orange-400" />
                  <span className="text-xs font-bold text-white/80">{key}</span>
                  {g.category && <span className="text-[10px] text-white/30">— {g.category}</span>}
                  <span className="ml-auto text-[10px] text-white/30">{g.pages.length} pages</span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-2.5 border-t border-white/5">
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {g.pages.map((p, pi) => (
                        <span key={pi} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40">
                          {p.chapterName} p.{p.pageIndex + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={buildPdfs}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 text-xs font-bold transition-colors"
          >
            <Scissors size={14} />
            Générer les PDFs nettoyés par année
          </button>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-green-500/20 bg-green-500/8 p-3 flex items-center gap-2">
            <CheckCircle size={14} className="text-green-400" />
            <span className="text-xs font-semibold text-green-300">
              {outputPdfs.length} PDF{outputPdfs.length > 1 ? "s" : ""} reconstitué{outputPdfs.length > 1 ? "s" : ""} sans filigrane
            </span>
            <button
              onClick={downloadAll}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/20 text-green-300 text-[10px] font-bold hover:bg-green-500/30 transition-colors"
            >
              <Download size={11} /> Tout télécharger
            </button>
          </div>

          {outputPdfs.map((pdf) => (
            <div key={pdf.year} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/8 bg-white/3">
              <FileText size={13} className="text-green-400 shrink-0" />
              <span className="text-xs text-white/70 flex-1">{dossierName} – {pdf.year}</span>
              <span className="text-[10px] text-white/30">{pdf.pageCount} p.</span>
              <button
                onClick={() => downloadPdf(pdf)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 text-[10px] font-semibold transition-colors"
              >
                <Download size={11} /> Télécharger
              </button>
            </div>
          ))}

          <button
            onClick={() => { setStep("upload"); setChapters([]); setAnalyses([]); setYearGroups([]); setOutputPdfs([]); }}
            className="w-full text-center text-[10px] text-white/30 hover:text-white/50 py-2"
          >
            Recommencer avec d&apos;autres fichiers
          </button>
        </div>
      )}
    </div>
  );
}
