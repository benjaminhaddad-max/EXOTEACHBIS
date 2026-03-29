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
  { id: "chat", label: "Chat avec un coach", icon: <MessageCircle size={14} /> },
  { id: "rdv", label: "Prendre RDV", icon: <Calendar size={14} /> },
];

export function StudentCoachingShell({
  currentProfile,
  universityName,
  videos,
  initialThread,
  rdvRequests,
  coaches,
}: StudentCoachingShellProps) {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="max-w-4xl mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-gray-100 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
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
          currentProfile={currentProfile}
          universityName={universityName}
          initialThread={initialThread}
          coaches={coaches}
          onRequestRdv={() => setTab("rdv")}
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
