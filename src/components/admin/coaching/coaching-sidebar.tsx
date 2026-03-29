"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Users,
  Calendar,
  ListChecks,
  UserPlus,
  MessageCircle,
  Play,
} from "lucide-react";
import type {
  Dossier,
  Groupe,
  Profile,
  CoachGroupeAssignment,
} from "@/types/database";

interface CoachingSidebarProps {
  dossiers: Dossier[];
  groupes: Groupe[];
  coaches: Profile[];
  coachAssignments: CoachGroupeAssignment[];
  selectedGroupeIds: Set<string>;
  onToggleGroupe: (id: string) => void;
  view: "planning" | "rdv" | "chat" | "rdv_requests" | "videos";
  onViewChange: (view: "planning" | "rdv" | "chat" | "rdv_requests" | "videos") => void;
  isCoach?: boolean;
  onAssignCoach: (coachId: string, groupeId: string) => void;
  onRemoveCoach: (coachId: string, groupeId: string) => void;
}

export default function CoachingSidebar({
  dossiers,
  groupes,
  coaches,
  coachAssignments,
  selectedGroupeIds,
  onToggleGroupe,
  view,
  onViewChange,
  onAssignCoach,
  onRemoveCoach,
  isCoach = false,
}: CoachingSidebarProps) {
  const [expandedOffers, setExpandedOffers] = useState<Set<string>>(new Set());
  const [expandedUnis, setExpandedUnis] = useState<Set<string>>(new Set());
  const [addingCoachFor, setAddingCoachFor] = useState<string | null>(null);

  const offers = dossiers.filter((d) => d.dossier_type === "offer");
  const universities = dossiers.filter((d) => d.dossier_type === "university");

  const toggleOffer = (id: string) => {
    setExpandedOffers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleUni = (id: string) => {
    setExpandedUnis((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getUnisForOffer = (offerId: string) =>
    universities.filter((u) => u.parent_id === offerId);

  const getGroupesForUni = (uniId: string) =>
    groupes.filter((g) => g.formation_dossier_id === uniId);

  const getAssignedCoaches = (groupeId: string) => {
    const assignmentIds = coachAssignments
      .filter((a) => a.groupe_id === groupeId)
      .map((a) => a.coach_id);
    return coaches.filter((c) => assignmentIds.includes(c.id));
  };

  const getAvailableCoaches = (groupeId: string) => {
    const assignedIds = coachAssignments
      .filter((a) => a.groupe_id === groupeId)
      .map((a) => a.coach_id);
    return coaches.filter((c) => !assignedIds.includes(c.id));
  };

  const coachLabel = (c: Profile) =>
    [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;

  return (
    <aside className="w-[280px] min-h-screen bg-[#0e1e35] text-white flex flex-col">
      <div className="p-3 border-b border-white/10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">
          Coaching
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {offers.map((offer) => (
          <div key={offer.id}>
            {/* Offer row */}
            <button
              onClick={() => toggleOffer(offer.id)}
              className="flex items-center gap-1.5 w-full text-left text-xs font-medium py-1 px-1 rounded hover:bg-white/5"
            >
              {expandedOffers.has(offer.id) ? (
                <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-white/40 shrink-0" />
              )}
              <span className="truncate">{offer.name}</span>
            </button>

            {expandedOffers.has(offer.id) && (
              <div className="ml-3 space-y-0.5">
                {getUnisForOffer(offer.id).map((uni) => (
                  <div key={uni.id}>
                    {/* University row */}
                    <button
                      onClick={() => toggleUni(uni.id)}
                      className="flex items-center gap-1.5 w-full text-left text-[11px] py-1 px-1 rounded hover:bg-white/5 text-white/80"
                    >
                      {expandedUnis.has(uni.id) ? (
                        <ChevronDown className="w-3 h-3 text-white/30 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-white/30 shrink-0" />
                      )}
                      <Users className="w-3 h-3 text-white/30 shrink-0" />
                      <span className="truncate">{uni.name}</span>
                    </button>

                    {expandedUnis.has(uni.id) && (
                      <div className="ml-4 space-y-0.5">
                        {getGroupesForUni(uni.id).map((groupe) => {
                          const assigned = getAssignedCoaches(groupe.id);
                          const available = getAvailableCoaches(groupe.id);

                          return (
                            <div key={groupe.id} className="py-0.5">
                              {/* Groupe row */}
                              <div className="flex items-center gap-1.5 px-1">
                                <input
                                  type="checkbox"
                                  checked={selectedGroupeIds.has(groupe.id)}
                                  onChange={() => onToggleGroupe(groupe.id)}
                                  className="w-3 h-3 rounded border-white/30 bg-transparent accent-blue-400 shrink-0"
                                />
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: groupe.color }}
                                />
                                <span className="text-[11px] truncate flex-1">
                                  {groupe.name}
                                </span>
                                <button
                                  onClick={() =>
                                    setAddingCoachFor(
                                      addingCoachFor === groupe.id
                                        ? null
                                        : groupe.id
                                    )
                                  }
                                  className="p-0.5 rounded hover:bg-white/10"
                                  title="Assigner un coach"
                                >
                                  <UserPlus className="w-3 h-3 text-white/40" />
                                </button>
                              </div>

                              {/* Assigned coach pills */}
                              {assigned.length > 0 && (
                                <div className="flex flex-wrap gap-1 ml-6 mt-0.5">
                                  {assigned.map((c) => (
                                    <span
                                      key={c.id}
                                      className="inline-flex items-center gap-1 text-[10px] bg-white/10 text-white/70 rounded-full px-1.5 py-0.5"
                                    >
                                      {coachLabel(c)}
                                      <button
                                        onClick={() =>
                                          onRemoveCoach(c.id, groupe.id)
                                        }
                                        className="hover:text-red-300 leading-none"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Add coach dropdown */}
                              {addingCoachFor === groupe.id &&
                                available.length > 0 && (
                                  <div className="ml-6 mt-1">
                                    <select
                                      className="w-full text-[11px] bg-white/10 text-white border border-white/20 rounded-lg px-1.5 py-1 outline-none"
                                      defaultValue=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          onAssignCoach(
                                            e.target.value,
                                            groupe.id
                                          );
                                          setAddingCoachFor(null);
                                        }
                                      }}
                                    >
                                      <option value="" disabled>
                                        Choisir un coach…
                                      </option>
                                      {available.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {coachLabel(c)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="p-3 border-t border-white/10 space-y-1">
        {[
          { key: "chat" as const, label: "Chat", icon: <MessageCircle className="w-3.5 h-3.5" /> },
          { key: "rdv_requests" as const, label: "Demandes RDV", icon: <ListChecks className="w-3.5 h-3.5" /> },
          ...(!isCoach ? [{ key: "videos" as const, label: "Vidéos", icon: <Play className="w-3.5 h-3.5" /> }] : []),
          { key: "planning" as const, label: "Planning", icon: <Calendar className="w-3.5 h-3.5" /> },
          { key: "rdv" as const, label: "RDV (ancien)", icon: <Calendar className="w-3.5 h-3.5" /> },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => onViewChange(tab.key)}
            className={`w-full flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg transition ${
              view === tab.key ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/5"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
