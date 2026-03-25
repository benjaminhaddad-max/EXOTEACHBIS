"use client";

import { useState } from "react";
import { X, Play, FileText, ExternalLink } from "lucide-react";

interface MediaPreviewProps {
  url: string;
  type: "image" | "video" | "document";
  accent?: "student" | "ai" | "prof";
}

export function MediaPreview({ url, type, accent = "student" }: MediaPreviewProps) {
  const [lightbox, setLightbox] = useState(false);

  const borderClass =
    accent === "prof" ? "border-white/20" : "border-gray-200";

  if (type === "document") {
    const fileName = decodeURIComponent(url.split("/").pop()?.replace(/^\d+\./, "") || "Document.pdf");
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${borderClass} bg-white hover:bg-gray-50 transition-colors max-w-[260px]`}
      >
        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 truncate">{fileName}</p>
          <p className="text-[11px] text-gray-400">PDF</p>
        </div>
        <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
      </a>
    );
  }

  if (type === "video") {
    return (
      <>
        <button
          onClick={() => setLightbox(true)}
          className={`relative block w-full max-w-[240px] rounded-lg overflow-hidden border ${borderClass}`}
        >
          <video
            src={url}
            className="w-full h-auto max-h-[180px] object-cover"
            muted
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-5 h-5 text-gray-800 ml-0.5" />
            </div>
          </div>
        </button>

        {lightbox && (
          <div
            className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightbox(false)}
          >
            <button
              onClick={() => setLightbox(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <video
              src={url}
              controls
              autoPlay
              className="max-w-full max-h-[85vh] rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setLightbox(true)}
        className={`block w-full max-w-[240px] rounded-lg overflow-hidden border ${borderClass}`}
      >
        <img
          src={url}
          alt="Media"
          className="w-full h-auto max-h-[240px] object-cover"
          loading="lazy"
        />
      </button>

      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={url}
            alt="Media"
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
