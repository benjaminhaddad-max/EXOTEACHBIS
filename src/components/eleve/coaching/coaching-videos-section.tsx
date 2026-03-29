"use client";

import { useMemo } from "react";
import { Play } from "lucide-react";
import type { CoachingVideo } from "@/types/database";

interface CoachingVideosSectionProps {
  videos: CoachingVideo[];
}

export function CoachingVideosSection({ videos }: CoachingVideosSectionProps) {
  const motivationVideos = useMemo(
    () => videos.filter((v) => v.category === "motivation").sort((a, b) => a.order_index - b.order_index),
    [videos],
  );
  const methodeVideos = useMemo(
    () => videos.filter((v) => v.category === "methode").sort((a, b) => a.order_index - b.order_index),
    [videos],
  );

  if (videos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
        Aucune vidéo disponible pour le moment.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {motivationVideos.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: "#E3C286" }}>
            Motivation & état d&apos;esprit en P1
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {motivationVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </div>
      )}

      {methodeVideos.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: "#E3C286" }}>
            Méthode de travail Diploma Santé
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {methodeVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VideoCard({ video }: { video: CoachingVideo }) {
  const embedUrl = video.vimeo_id
    ? `https://player.vimeo.com/video/${video.vimeo_id}?color=C9A84C&title=0&byline=0&portrait=0`
    : null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* Video player */}
      {embedUrl ? (
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          <iframe
            src={embedUrl}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : video.video_url ? (
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          <video
            src={video.video_url}
            controls
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ height: 180, backgroundColor: "rgba(255,255,255,0.03)" }}
        >
          <Play size={32} style={{ color: "rgba(255,255,255,0.15)" }} />
        </div>
      )}

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-semibold text-white">{video.title}</p>
        {video.description && (
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
            {video.description}
          </p>
        )}
      </div>
    </div>
  );
}
