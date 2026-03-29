"use client";

import { useState } from "react";
import { MessageCircle, FolderOpen } from "lucide-react";
import type { Profile, CoachingVideo, CoachingRdvRequest, CoachingCallSlot, CoachingCallBooking } from "@/types/database";
import type { QaThread } from "@/types/qa";
import { CoachingChatSection } from "./coaching-chat-section";
import { CoachingRdvSection } from "./coaching-rdv-section";
import { CoachingVideosSection } from "./coaching-videos-section";

type Tab = "chat" | "ressources";

interface StudentCoachingShellProps {
  currentProfile: Profile;
  universityName: string;
  videos: CoachingVideo[];
  initialThread: QaThread | null;
  rdvRequests: CoachingRdvRequest[];
  coaches: Profile[];
  availableSlots: CoachingCallSlot[];
  myBooking: (CoachingCallBooking & { slot?: CoachingCallSlot }) | null;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "chat", label: "Chat avec le coach", icon: <MessageCircle size={14} /> },
  { id: "ressources", label: "Ressources", icon: <FolderOpen size={14} /> },
];

export function StudentCoachingShell({
  currentProfile,
  universityName,
  videos,
  initialThread,
  rdvRequests,
  coaches,
  availableSlots,
  myBooking,
}: StudentCoachingShellProps) {
  const [tab, setTab] = useState<Tab>("chat");
  const [showRdvModal, setShowRdvModal] = useState(false);

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

      {/* Chat */}
      {tab === "chat" && (
        <CoachingChatSection
          currentProfile={currentProfile}
          universityName={universityName}
          initialThread={initialThread}
          coaches={coaches}
          onRequestRdv={() => setShowRdvModal(true)}
        />
      )}

      {/* Ressources */}
      {tab === "ressources" && (
        <CoachingVideosSection videos={videos} />
      )}

      {/* RDV Modal */}
      {showRdvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowRdvModal(false)}
          />
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-[#f8fbfe]">
              <h2 className="text-sm font-semibold text-[#12314d]">Prendre rendez-vous</h2>
              <button
                onClick={() => setShowRdvModal(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto p-5" style={{ maxHeight: "calc(85vh - 60px)" }}>
              <CoachingRdvSection
                existingRequests={rdvRequests}
                coaches={coaches}
                availableSlots={availableSlots}
                myBooking={myBooking}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
