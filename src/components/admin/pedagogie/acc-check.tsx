"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  Upload, Loader2, FileText, Trash2, CheckCircle, AlertCircle,
  X, ArrowLeftRight, AlertTriangle, Check, XCircle,
  ChevronDown, ChevronRight, BookOpen,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type SerieSummary = {
  id: string; name: string; type: string; visible: boolean;
  timed: boolean; duration_minutes: number | null;
  score_definitif: boolean; cours_id: string | null;
  nb_questions: number; annee: string | null;
};

type UploadedPdf = {
  file: File;
  name: string;
  pageCount: number;
  pdfBytes: ArrayBuffer;
};

type PageResult = {
  side: "annales" | "chapitres";
  fileName: string;
  pageIndex: number;
  year: string | null;
  session: string | null;
  questions: number[];
  isSkip: boolean;
};

type YearData = {
  year: string;
  session: string | null;
  annalesCount: number;
  chapitresQuestions: Set<number>;
  chapitresPages: { fileName: string; pageIndex: number; questions: number[] }[];
};

type DiffResult = {
  key: string;
  year: string;
  session: string | null;
  annalesCount: number;
  chapitresCount: number;
  onlyInChapitres: boolean;
  onlyInAnnales: boolean;
  status: "ok" | "warning" | "error" | "missing";
};

type Step = "upload" | "scanning" | "results";

function pageToJpegBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.5).split(",")[1];
}

export function AccCheck({
  dossierName,
  existingSeries,
}: {
  dossierName: string;
  existingSeries: SerieSummary[];
}) {
  const [step, setStep] = useState<Step>("upload");
  const [chapitresPdfs, setChapitresPdfs] = useState<UploadedPdf[]>([]);
  const [diffs, setDiffs] = useState<DiffResult[]>([]);
  const [expandedYear, setExpandedYear] = useState<string | null>(null);
  const [yearDetails, setYearDetails] = useState<Map<string, YearData>>(new Map());
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [error, setError] = useState("");
  const chapitresRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const annalesSeries = existingSeries.filter((s) => s.annee);
  const annalesYears = new Map<string, { count: number; names: string[] }>();
  for (const s of annalesSeries) {
    const key = s.annee!;
    if (!annalesYears.has(key)) annalesYears.set(key, { count: 0, names: [] });
    const entry = annalesYears.get(key)!;
    entry.count += s.nb_questions;
    entry.names.push(s.name);
  }

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const pdfs: UploadedPdf[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) continue;
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer).slice(0);
        const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
        pdfs.push({
          file,
          name: file.name.replace(/\.pdf$/i, ""),
          pageCount: doc.numPages,
          pdfBytes: bytes.buffer as ArrayBuffer,
        });
      } catch (err) {
        console.error("Erreur lecture PDF:", file.name, err);
      }
    }
    pdfs.sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
    setChapitresPdfs((prev) => {
      const existing = new Set(prev.map((c) => c.file.name));
      const newOnes = pdfs.filter((p) => !existing.has(p.file.name));
      return [...prev, ...newOnes].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
    });
  }, []);

  const scan = useCallback(async () => {
    if (chapitresPdfs.length === 0) return;
    setError("");
    setStep("scanning");

    try {
      const allPageData: { side: "chapitres"; fileName: string; pageIndex: number; imageBase64: string }[] = [];
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      const totalPages = chapitresPdfs.reduce((s, c) => s + c.pageCount, 0);
      setProgress({ current: 0, total: totalPages, label: "Rendu des pages..." });
      let rendered = 0;

      for (const pdf of chapitresPdfs) {
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdf.pdfBytes).slice(0) }).promise;
        for (let pi = 0; pi < doc.numPages; pi++) {
          const page = await doc.getPage(pi + 1);
          const vp = page.getViewport({ scale: 1.0 });
          canvas.width = vp.width;
          canvas.height = vp.height;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp } as Parameters<typeof page.render>[0]).promise;
          allPageData.push({
            side: "chapitres",
            fileName: pdf.name,
            pageIndex: pi,
            imageBase64: pageToJpegBase64(canvas),
          });
          rendered++;
          setProgress({ current: rendered, total: totalPages, label: "Rendu des pages..." });
        }
      }

      setProgress({ current: 0, total: allPageData.length, label: "Analyse IA des questions..." });

      const BATCH = 8;
      const allResults: PageResult[] = [];

      for (let i = 0; i < allPageData.length; i += BATCH) {
        const batch = allPageData.slice(i, i + BATCH);
        const res = await fetch("/api/acc-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: batch }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
          throw new Error(err.error || "Erreur lors de l'analyse");
        }
        const json = await res.json();
        allResults.push(...(json.pages as PageResult[]));
        setProgress({ current: Math.min(i + BATCH, allPageData.length), total: allPageData.length, label: "Analyse IA des questions..." });
      }

      // Propagate years within each file
      const byFile = new Map<string, PageResult[]>();
      for (const r of allResults) {
        const key = r.fileName;
        if (!byFile.has(key)) byFile.set(key, []);
        byFile.get(key)!.push(r);
      }
      for (const pages of byFile.values()) {
        pages.sort((a, b) => a.pageIndex - b.pageIndex);
        let curYear: string | null = null;
        let curSession: string | null = null;
        for (const p of pages) {
          if (p.year) { curYear = p.year; curSession = p.session; }
          else { p.year = curYear; p.session = curSession; }
        }
      }

      // Build year data from chapitres
      const yearMap = new Map<string, YearData>();
      for (const r of allResults) {
        if (r.isSkip || !r.year) continue;
        const key = r.year;
        if (!yearMap.has(key)) {
          yearMap.set(key, {
            year: r.year,
            session: r.session,
            annalesCount: 0,
            chapitresQuestions: new Set(),
            chapitresPages: [],
          });
        }
        const yd = yearMap.get(key)!;
        for (const q of r.questions) yd.chapitresQuestions.add(q);
        yd.chapitresPages.push({ fileName: r.fileName, pageIndex: r.pageIndex, questions: r.questions });
      }

      // Merge with existing annales data
      for (const [annee, data] of annalesYears) {
        if (!yearMap.has(annee)) {
          yearMap.set(annee, {
            year: annee,
            session: null,
            annalesCount: data.count,
            chapitresQuestions: new Set(),
            chapitresPages: [],
          });
        } else {
          yearMap.get(annee)!.annalesCount = data.count;
        }
      }

      setYearDetails(yearMap);

      // Compute diffs
      const diffResults: DiffResult[] = [];
      for (const [key, yd] of Array.from(yearMap.entries()).sort((a, b) => b[0].localeCompare(a[0]))) {
        const chapCount = yd.chapitresQuestions.size;
        const annCount = yd.annalesCount;
        const onlyInChapitres = chapCount > 0 && annCount === 0;
        const onlyInAnnales = annCount > 0 && chapCount === 0;

        let status: DiffResult["status"] = "ok";
        if (onlyInChapitres) status = "error";
        else if (onlyInAnnales) status = "warning";
        else if (annCount > 0 && chapCount > 0) status = "ok";
        else status = "missing";

        diffResults.push({
          key,
          year: yd.year,
          session: yd.session,
          annalesCount: annCount,
          chapitresCount: chapCount,
          onlyInChapitres,
          onlyInAnnales,
          status,
        });
      }

      setDiffs(diffResults);
      setStep("results");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      setError(message);
      setStep("upload");
    }
  }, [chapitresPdfs, annalesYears]);

  const totalChapitresPages = chapitresPdfs.reduce((s, c) => s + c.pageCount, 0);
  const okCount = diffs.filter((d) => d.status === "ok").length;
  const warnCount = diffs.filter((d) => d.status === "warning").length;
  const errCount = diffs.filter((d) => d.status === "error").length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-300"><X size={12} /></button>
        </div>
      )}

      {/* Upload */}
      {step === "upload" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            {/* Left: Existing annales (read-only) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Annales dans la plateforme</span>
              </div>
              <div className="rounded-xl border border-green-500/15 bg-green-500/5 p-3 space-y-1.5">
                {annalesSeries.length === 0 ? (
                  <div className="text-center py-4">
                    <BookOpen size={16} className="mx-auto text-white/15 mb-1" />
                    <p className="text-[10px] text-white/30">Aucune annale avec une année assignée</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] text-green-400/60 font-semibold">{annalesSeries.length} série{annalesSeries.length > 1 ? "s" : ""} — {Array.from(annalesYears.keys()).length} année{annalesYears.size > 1 ? "s" : ""}</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {Array.from(annalesYears.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([annee, data]) => (
                        <div key={annee} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/3">
                          <span className="text-[10px] font-bold text-green-400/80 w-20">{annee}</span>
                          <span className="text-[9px] text-white/40 flex-1 truncate">{data.names.join(", ")}</span>
                          <span className="text-[9px] text-white/25">{data.count}Q</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right: Upload chapitres bruts */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Chapitres bruts (ACC source)</span>
              </div>
              <div
                className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors cursor-pointer ${
                  dragging ? "border-orange-400 bg-orange-500/10" : "border-white/15 hover:border-orange-400/40"
                }`}
                onClick={() => chapitresRef.current?.click()}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); } }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setDragging(false); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); }}
              >
                <Upload size={18} className={`mx-auto mb-2 ${dragging ? "text-orange-400" : "text-white/20"}`} />
                <p className="text-[10px] text-white/40">Glissez les PDFs par chapitre ici</p>
                <p className="text-[9px] text-white/25 mt-0.5">Atomes.pdf, Liaisons.pdf, ...</p>
                <input ref={chapitresRef} type="file" multiple accept=".pdf" className="hidden"
                  onChange={(e) => { if (e.target.files) { handleFiles(e.target.files); e.target.value = ""; } }} />
              </div>
              {chapitresPdfs.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">{chapitresPdfs.length} fichier{chapitresPdfs.length > 1 ? "s" : ""} — {totalChapitresPages} pages</span>
                    <button onClick={() => setChapitresPdfs([])} className="text-[9px] text-red-400/60 hover:text-red-400">Vider</button>
                  </div>
                  {chapitresPdfs.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/6 bg-white/3">
                      <FileText size={11} className="text-orange-400 shrink-0" />
                      <span className="text-[10px] text-white/60 flex-1 truncate">{p.name}</span>
                      <span className="text-[9px] text-white/25">{p.pageCount}p</span>
                      <button onClick={() => setChapitresPdfs((prev) => prev.filter((_, j) => j !== i))} className="text-white/15 hover:text-red-400"><Trash2 size={10} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {chapitresPdfs.length > 0 && (
            <button
              onClick={scan}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 text-xs font-bold transition-colors"
            >
              <ArrowLeftRight size={14} />
              Comparer ({totalChapitresPages} pages à scanner)
            </button>
          )}
        </>
      )}

      {/* Scanning */}
      {step === "scanning" && (
        <div className="rounded-xl border border-white/8 bg-white/3 p-6 text-center">
          <Loader2 size={24} className="mx-auto text-blue-400 animate-spin mb-3" />
          <p className="text-xs font-semibold text-white/60 mb-1">{progress.label}</p>
          {progress.total > 0 && (
            <div className="w-48 mx-auto h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
          )}
          <p className="text-[10px] text-white/30 mt-2">{progress.current} / {progress.total}</p>
        </div>
      )}

      {/* Results */}
      {step === "results" && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-green-500/20 bg-green-500/8 p-3 text-center">
              <p className="text-lg font-bold text-green-400">{okCount}</p>
              <p className="text-[10px] text-green-400/60">Années OK</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-center">
              <p className="text-lg font-bold text-amber-400">{warnCount}</p>
              <p className="text-[10px] text-amber-400/60">Seulement annales</p>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/8 p-3 text-center">
              <p className="text-lg font-bold text-red-400">{errCount}</p>
              <p className="text-[10px] text-red-400/60">Manquantes</p>
            </div>
          </div>

          {/* Year-by-year diff */}
          {diffs.map((d) => {
            const isExpanded = expandedYear === d.key;
            const yd = yearDetails.get(d.key);
            return (
              <div key={d.key} className={`rounded-xl border overflow-hidden ${
                d.status === "ok" ? "border-green-500/20 bg-green-500/5" :
                d.status === "warning" ? "border-amber-500/20 bg-amber-500/5" :
                "border-red-500/20 bg-red-500/5"
              }`}>
                <button onClick={() => setExpandedYear(isExpanded ? null : d.key)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/3 transition-colors">
                  {isExpanded ? <ChevronDown size={12} className="text-white/40" /> : <ChevronRight size={12} className="text-white/40" />}
                  {d.status === "ok" ? <Check size={13} className="text-green-400" /> :
                   d.status === "warning" ? <AlertTriangle size={13} className="text-amber-400" /> :
                   <XCircle size={13} className="text-red-400" />}
                  <span className="text-xs font-bold text-white/80">{d.key}</span>
                  <span className="ml-auto flex items-center gap-3 text-[10px]">
                    <span className={`${d.annalesCount > 0 ? "text-green-400/70" : "text-red-400/50"}`}>
                      {d.annalesCount}Q plateforme
                    </span>
                    <span className={`${d.chapitresCount > 0 ? "text-orange-400/70" : "text-white/20"}`}>
                      {d.chapitresCount}Q chapitres
                    </span>
                  </span>
                </button>
                {isExpanded && yd && (
                  <div className="px-3 pb-3 border-t border-white/5 space-y-2 pt-2">
                    {d.onlyInChapitres && (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
                        <p className="text-[10px] font-bold text-red-400">
                          Année {d.year} trouvée dans les chapitres mais ABSENTE de la plateforme !
                        </p>
                        <p className="text-[9px] text-red-300/60 mt-0.5">
                          Questions détectées : {Array.from(yd.chapitresQuestions).sort((a, b) => a - b).map((q) => `Q${q}`).join(", ")}
                        </p>
                      </div>
                    )}
                    {d.onlyInAnnales && (
                      <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2">
                        <p className="text-[10px] font-bold text-amber-400">
                          Année {d.year} présente dans la plateforme mais pas trouvée dans les chapitres uploadés.
                        </p>
                        <p className="text-[9px] text-amber-300/60 mt-0.5">
                          Peut-être normal si les chapitres ne couvrent pas cette année.
                        </p>
                      </div>
                    )}
                    {d.status === "ok" && (
                      <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
                        <p className="text-[10px] font-bold text-green-400">
                          Année présente des deux côtés. {d.annalesCount}Q dans la plateforme, {d.chapitresCount}Q dans les chapitres.
                        </p>
                      </div>
                    )}
                    {/* Chapitres detail */}
                    {yd.chapitresPages.length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold text-orange-400/60 uppercase tracking-wider mb-1">Pages dans les chapitres</p>
                        <div className="space-y-0.5 max-h-40 overflow-y-auto">
                          {yd.chapitresPages.map((p, i) => (
                            <div key={i} className="text-[9px] text-white/40 flex gap-1">
                              <span className="text-white/25 shrink-0 w-6">p.{p.pageIndex + 1}</span>
                              <span className="truncate flex-1">{p.fileName}</span>
                              {p.questions.length > 0 && (
                                <span className="text-orange-400/50 shrink-0">
                                  Q{p.questions.join(",")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {diffs.length === 0 && (
            <div className="rounded-xl border border-white/8 bg-white/3 p-6 text-center">
              <AlertCircle size={18} className="mx-auto text-white/20 mb-2" />
              <p className="text-xs text-white/40">Aucune année détectée dans les chapitres.</p>
            </div>
          )}

          <button
            onClick={() => { setStep("upload"); setDiffs([]); setYearDetails(new Map()); setExpandedYear(null); }}
            className="w-full text-center text-[10px] text-white/30 hover:text-white/50 py-2"
          >
            Recommencer
          </button>
        </div>
      )}
    </div>
  );
}
