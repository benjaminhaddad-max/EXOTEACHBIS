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
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
        <Play size={32} className="text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">Aucune vidéo disponible pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {motivationVideos.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-amber-700 mb-4">
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
          <h3 className="text-sm font-bold uppercase tracking-wide text-amber-700 mb-4">
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
          <video src={video.video_url} controls className="absolute inset-0 w-full h-full object-cover" />
        </div>
      ) : (
        <div className="flex items-center justify-center h-44 bg-gray-50">
          <Play size={32} className="text-gray-300" />
        </div>
      )}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-900">{video.title}</p>
        {video.description && (
          <p className="text-xs mt-1 text-gray-500">{video.description}</p>
        )}
      </div>
    </div>
  );
}
