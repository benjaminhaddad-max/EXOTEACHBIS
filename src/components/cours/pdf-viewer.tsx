"use client";

import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  FileText,
  Loader2,
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
}

export function PdfViewer({ coursId, pdfUrl, nbPages, currentPage: initialPage, version }: PdfViewerProps) {
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(nbPages || 0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
  };

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-16">
        <FileText className="h-12 w-12 text-gray-300" />
        <p className="mt-4 text-sm text-gray-400">PDF non disponible</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 bg-gray-50">
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

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 mr-1">v{version}</span>
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-gray-500 w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* PDF */}
      <div className="flex justify-center bg-gray-100 p-4 min-h-[500px] overflow-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
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
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-lg"
            />
          </Document>
        )}
      </div>

      {/* Nav bottom */}
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 bg-gray-50">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            page <= 1
              ? "text-gray-300 cursor-not-allowed"
              : "text-navy hover:bg-navy/10"
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
                  p === page
                    ? "bg-navy text-white"
                    : "text-gray-400 hover:bg-gray-200"
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
            page >= totalPages
              ? "text-gray-300 cursor-not-allowed"
              : "text-navy hover:bg-navy/10"
          )}
        >
          Suivant
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
