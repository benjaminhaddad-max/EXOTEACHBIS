"use client";

import { useMemo, useState } from "react";
import { Play, FileText, Video } from "lucide-react";
import type { CoachingVideo } from "@/types/database";

type SubTab = "videos" | "documents";

interface CoachingVideosSectionProps {
  videos: CoachingVideo[];
}

export function CoachingVideosSection({ videos }: CoachingVideosSectionProps) {
  const [subTab, setSubTab] = useState<SubTab>("videos");

  const videoItems = useMemo(
    () => videos.filter((v) => v.vimeo_id || v.video_url).sort((a, b) => a.order_index - b.order_index),
    [videos],
  );

  const documentItems = useMemo(
    () => videos.filter((v) => !v.vimeo_id && !v.video_url).sort((a, b) => a.order_index - b.order_index),
    [videos],
  );

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 w-fit">
        <button
          onClick={() => setSubTab("videos")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            subTab === "videos"
              ? "bg-white text-gray-900 shadow-sm border border-gray-200"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Video size={13} />
          Vidéos
          {videoItems.length > 0 && (
            <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${subTab === "videos" ? "bg-[#12314d] text-white" : "bg-gray-200 text-gray-500"}`}>
              {videoItems.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab("documents")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            subTab === "documents"
              ? "bg-white text-gray-900 shadow-sm border border-gray-200"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <FileText size={13} />
          Documents
          {documentItems.length > 0 && (
            <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${subTab === "documents" ? "bg-[#12314d] text-white" : "bg-gray-200 text-gray-500"}`}>
              {documentItems.length}
            </span>
          )}
        </button>
      </div>

      {/* Videos */}
      {subTab === "videos" && (
        <>
          {videoItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 bg-white rounded-xl border border-gray-200">
              <Play size={28} className="text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">Aucune vidéo disponible pour le moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {videoItems.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Documents */}
      {subTab === "documents" && (
        <>
          {documentItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 bg-white rounded-xl border border-gray-200">
              <FileText size={28} className="text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">Aucun document disponible pour le moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documentItems.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </>
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

function DocumentCard({ doc }: { doc: CoachingVideo }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0f4f9] shrink-0">
        <FileText size={20} className="text-[#5d7085]" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{doc.title}</p>
        {doc.description && (
          <p className="text-xs mt-1 text-gray-500">{doc.description}</p>
        )}
      </div>
    </div>
  );
}
