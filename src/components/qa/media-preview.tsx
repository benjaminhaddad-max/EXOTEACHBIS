"use client";

import { useState } from "react";
import { X, Play } from "lucide-react";

interface MediaPreviewProps {
  url: string;
  type: "image" | "video";
  accent?: "student" | "ai" | "prof";
}

export function MediaPreview({ url, type, accent = "student" }: MediaPreviewProps) {
  const [lightbox, setLightbox] = useState(false);

  const borderClass =
    accent === "prof" ? "border-white/20" : "border-gray-200";

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
