"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  FileText,
  Loader2,
  Download,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// Worker PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  coursId: string;
  pdfUrl: string;
  nbPages: number;
  currentPage: number;
  version: number;
  onPageChange?: (page: number) => void;
}

export function PdfViewer({ coursId, pdfUrl, nbPages, currentPage: initialPage, version, onPageChange }: PdfViewerProps) {
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(nbPages || 0);
  const [zoomFactor, setZoomFactor] = useState(1.0); // multiplier on top of fit-width
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Measure container width to auto-fit PDF
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // subtract padding (32px each side = 64px total)
        setContainerWidth(entry.contentRect.width - 48);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth - 48);
    return () => ro.disconnect();
  }, []);

  const supabase = createClient();

  const saveProgress = useCallback(
    async (newPage: number, total: number) => {
      const pct = total > 0 ? Math.round((newPage / total) * 100) : 0;
      await supabase.from("user_progress").upsert({
        cours_id: coursId,
        pct_complete: pct,
        current_page: newPage,
        last_seen_at: new Date().toISOString(),
      });
    },
    [coursId, supabase]
  );

  const goTo = (newPage: number) => {
    const clamped = Math.max(1, Math.min(newPage, totalPages));
    setPage(clamped);
    saveProgress(clamped, totalPages);
    onPageChange?.(clamped);
  };

  const zoom = (delta: number) => {
    setZoomFactor((z) => Math.min(3.0, Math.max(0.5, parseFloat((z + delta).toFixed(1)))));
  };

  const resetZoom = () => setZoomFactor(1.0);

  // Computed width passed to react-pdf Page
  const pageWidth = containerWidth > 0 ? containerWidth * zoomFactor : undefined;

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-16">
        <FileText className="h-12 w-12 text-gray-300" />
        <p className="mt-4 text-sm text-gray-400">PDF non disponible</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 bg-gray-50 shrink-0">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-gray-500">
            Page{" "}
            <input
              type="number"
              value={page}
              min={1}
              max={totalPages}
              onChange={(e) => goTo(parseInt(e.target.value) || 1)}
              className="w-10 rounded border border-gray-300 px-1 text-center text-xs"
            />{" "}
            / {totalPages}
          </span>
          <button
            onClick={() => goTo(page + 1)}
            disabled={page >= totalPages}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom + Download */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 mr-1">v{version}</span>
          <button
            onClick={() => zoom(-0.1)}
            disabled={zoomFactor <= 0.5}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={resetZoom}
            className="text-xs text-gray-500 w-12 text-center hover:bg-gray-200 rounded px-1 py-0.5 transition-colors"
            title="Réinitialiser le zoom"
          >
            {Math.round(zoomFactor * 100)}%
          </button>
          <button
            onClick={() => zoom(0.1)}
            disabled={zoomFactor >= 3.0}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <a
            href={pdfUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 flex items-center gap-1 rounded-lg bg-navy/10 px-2 py-1 text-xs font-medium text-navy hover:bg-navy/20 transition-colors"
            title="Télécharger le PDF"
          >
            <Download className="h-3 w-3" />
            PDF
          </a>
        </div>
      </div>

      {/* PDF Area — measures itself */}
      <div ref={containerRef} className="bg-gray-100 px-6 py-4 overflow-auto flex-1">
        <div className="flex flex-col items-center">
          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
              <FileText className="h-12 w-12" />
              <p className="text-sm">Impossible de charger le PDF</p>
            </div>
          ) : (
            <Document
              file={pdfUrl}
              onLoadSuccess={({ numPages }) => {
                setTotalPages(numPages);
                setLoading(false);
              }}
              onLoadError={() => {
                setError(true);
                setLoading(false);
              }}
              loading={
                <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Chargement du PDF...</span>
                </div>
              }
            >
              <Page
                pageNumber={page}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="shadow-lg mx-auto"
              />
            </Document>
          )}
        </div>
      </div>

      {/* Nav bottom */}
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 bg-gray-50 shrink-0">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            page <= 1 ? "text-gray-300 cursor-not-allowed" : "text-navy hover:bg-navy/10"
          )}
        >
          <ChevronLeft className="h-3 w-3" />
          Précédent
        </button>

        <div className="flex gap-1">
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                onClick={() => goTo(p)}
                className={cn(
                  "h-6 w-6 rounded text-xs transition-colors",
                  p === page ? "bg-navy text-white" : "text-gray-400 hover:bg-gray-200"
                )}
              >
                {p}
              </button>
            );
          })}
          {totalPages > 7 && <span className="text-xs text-gray-400 self-center">...</span>}
        </div>

        <button
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            page >= totalPages ? "text-gray-300 cursor-not-allowed" : "text-navy hover:bg-navy/10"
          )}
        >
          Suivant
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
