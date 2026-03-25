"use client";

import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { FileText } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfThumbnailProps {
  pdfUrl: string;
}

export function PdfThumbnail({ pdfUrl }: PdfThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.floor(w));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full overflow-hidden bg-gray-100">
      {error ? (
        <div className="flex aspect-[210/297] items-center justify-center bg-gray-50">
          <FileText className="h-8 w-8 text-gray-300" />
        </div>
      ) : width === 0 ? (
        <div className="aspect-[210/297] animate-pulse bg-gray-200" />
      ) : (
        <div className="relative">
          {!loaded && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100 animate-pulse">
              <FileText className="h-6 w-6 text-gray-300" />
            </div>
          )}
          <Document
            file={pdfUrl}
            onLoadError={() => setError(true)}
            loading={null}
            error={null}
          >
            <Page
              pageNumber={1}
              width={width}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onRenderSuccess={() => setLoaded(true)}
              loading={null}
            />
          </Document>
        </div>
      )}
    </div>
  );
}
