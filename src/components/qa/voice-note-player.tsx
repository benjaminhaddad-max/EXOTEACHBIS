"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";

interface VoiceNotePlayerProps {
  url: string;
  duration?: number | null;
  accent?: "student" | "ai" | "prof";
}

export function VoiceNotePlayer({ url, duration, accent = "student" }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ?? 0);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    });

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && isFinite(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    });

    audio.addEventListener("ended", () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [url]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const barBg =
    accent === "prof"
      ? "bg-white/30"
      : accent === "ai"
      ? "bg-blue-200"
      : "bg-gray-200";

  const barFill =
    accent === "prof"
      ? "bg-white"
      : accent === "ai"
      ? "bg-blue-500"
      : "bg-gray-500";

  const btnBg =
    accent === "prof"
      ? "bg-white/20 hover:bg-white/30 text-white"
      : accent === "ai"
      ? "bg-blue-100 hover:bg-blue-200 text-blue-600"
      : "bg-gray-100 hover:bg-gray-200 text-gray-600";

  return (
    <div className="flex items-center gap-2 min-w-[180px] max-w-[260px]">
      <button
        onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${btnBg}`}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        {/* Waveform-like bars */}
        <div className="flex items-center gap-[2px] h-5">
          {Array.from({ length: 28 }).map((_, i) => {
            const h = 4 + Math.sin(i * 0.7) * 8 + Math.cos(i * 1.3) * 4;
            const filled = progress > (i / 28) * 100;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-colors ${filled ? barFill : barBg}`}
                style={{ height: `${Math.max(3, h)}px` }}
              />
            );
          })}
        </div>
        <p className={`text-[10px] mt-0.5 ${accent === "prof" ? "text-white/70" : "text-gray-400"}`}>
          {playing ? formatTime(currentTime) : formatTime(totalDuration)}
        </p>
      </div>
    </div>
  );
}
