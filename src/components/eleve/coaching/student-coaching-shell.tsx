"use client";

import { useState } from "react";
import { Play, MessageCircle, Calendar } from "lucide-react";
import type { Profile, CoachingVideo, CoachingRdvRequest } from "@/types/database";
import type { QaThread } from "@/types/qa";
import { CoachingVideosSection } from "./coaching-videos-section";
import { CoachingChatSection } from "./coaching-chat-section";
import { CoachingRdvSection } from "./coaching-rdv-section";

type Tab = "videos" | "chat" | "rdv";

interface StudentCoachingShellProps {
  currentProfile: Profile;
  universityName: string;
  videos: CoachingVideo[];
  initialThread: QaThread | null;
  rdvRequests: CoachingRdvRequest[];
  coaches: Profile[];
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "videos", label: "Vidéos", icon: <Play size={14} /> },
  { id: "chat", label: "Chat", icon: <MessageCircle size={14} /> },
  { id: "rdv", label: "RDV", icon: <Calendar size={14} /> },
];

export function StudentCoachingShell({
  currentProfile,
  universityName,
  videos,
  initialThread,
  rdvRequests,
  coaches,
}: StudentCoachingShellProps) {
  const [tab, setTab] = useState<Tab>("videos");

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: tab === t.id ? "rgba(201,168,76,0.15)" : "transparent",
              color: tab === t.id ? "#E3C286" : "rgba(255,255,255,0.5)",
              border: tab === t.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "videos" && <CoachingVideosSection videos={videos} />}
      {tab === "chat" && (
        <CoachingChatSection
          userId={currentProfile.id}
          universityName={universityName}
          initialThread={initialThread}
        />
      )}
      {tab === "rdv" && (
        <CoachingRdvSection
          existingRequests={rdvRequests}
          coaches={coaches}
        />
      )}
    </div>
  );
}
