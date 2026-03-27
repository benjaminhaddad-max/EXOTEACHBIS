"use client";

import {
  CoachingCallBooking,
  CoachingCallBookingStatus,
  CoachingCallSlot,
  Groupe,
  Profile,
} from "@/types/database";
import { CalendarDays, Clock, MapPin, User, UserPlus } from "lucide-react";

interface CoachingRdvViewProps {
  bookings: CoachingCallBooking[];
  slots: CoachingCallSlot[];
  students: Profile[];
  coaches: Profile[];
  groupes: Groupe[];
  onStatusChange: (bookingId: string, status: CoachingCallBookingStatus) => void;
  onAssignCoach: (bookingId: string, coachId: string) => void;
}

const STATUS_CONFIG: Record<
  CoachingCallBookingStatus,
  { label: string; bg: string; text: string }
> = {
  booked: { label: "Réservé", bg: "bg-blue-100", text: "text-blue-700" },
  completed: { label: "Effectué", bg: "bg-emerald-100", text: "text-emerald-700" },
  cancelled: { label: "Annulé", bg: "bg-gray-100", text: "text-gray-600" },
  no_show: { label: "Absent", bg: "bg-red-100", text: "text-red-700" },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getDisplayName(profile: Profile | undefined): string {
  if (!profile) return "—";
  if (profile.first_name || profile.last_name) {
    return [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  }
  return profile.email;
}

export default function CoachingRdvView({
  bookings,
  slots,
  students,
  coaches,
  groupes,
  onStatusChange,
  onAssignCoach,
}: CoachingRdvViewProps) {
  const slotMap = new Map(slots.map((s) => [s.id, s]));
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const coachMap = new Map(coaches.map((c) => [c.id, c]));
  const groupeMap = new Map(groupes.map((g) => [g.id, g]));

  // Sort bookings by slot start_at descending
  const sorted = [...bookings].sort((a, b) => {
    const sa = slotMap.get(a.slot_id)?.start_at ?? "";
    const sb = slotMap.get(b.slot_id)?.start_at ?? "";
    return sb.localeCompare(sa);
  });

  // Group by day
  const grouped = new Map<string, CoachingCallBooking[]>();
  for (const bk of sorted) {
    const slot = slotMap.get(bk.slot_id);
    const day = slot ? slot.start_at.slice(0, 10) : "unknown";
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(bk);
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <CalendarDays className="mb-2 h-8 w-8" />
        <p className="text-sm">Aucun rendez-vous</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([day, dayBookings]) => (
        <div key={day}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {formatDayLabel(day)}
          </h3>
          <div className="space-y-2">
            {dayBookings.map((bk) => {
              const slot = slotMap.get(bk.slot_id);
              const student = studentMap.get(bk.student_id);
              const coach = coachMap.get(bk.coach_id);
              const groupe = groupeMap.get(bk.groupe_id);
              const cfg = STATUS_CONFIG[bk.status];

              return (
                <div
                  key={bk.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
                >
                  {/* Time */}
                  <div className="flex items-center gap-1 text-sm font-medium text-gray-800">
                    <Clock className="h-3.5 w-3.5 text-gray-400" />
                    {slot
                      ? `${formatTime(slot.start_at)} – ${formatTime(slot.end_at)}`
                      : "—"}
                  </div>

                  {/* Student */}
                  <div className="flex items-center gap-1 text-sm text-gray-700">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    <span>{getDisplayName(student)}</span>
                  </div>

                  {/* Coach */}
                  <div className="flex items-center gap-1 text-sm text-gray-700">
                    <UserPlus className="h-3.5 w-3.5 text-gray-400" />
                    <span>{coach ? getDisplayName(coach) : "Non assigné"}</span>
                  </div>

                  {/* Groupe */}
                  {groupe && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {groupe.name}
                    </span>
                  )}

                  {/* Location */}
                  {slot?.location && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" />
                      {slot.location}
                    </div>
                  )}

                  {/* Status badge */}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
                  >
                    {cfg.label}
                  </span>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Status buttons */}
                  <div className="flex items-center gap-1">
                    {(Object.keys(STATUS_CONFIG) as CoachingCallBookingStatus[]).map(
                      (st) => (
                        <button
                          key={st}
                          onClick={() => onStatusChange(bk.id, st)}
                          disabled={bk.status === st}
                          className={`rounded-md px-2 py-0.5 text-xs transition ${
                            bk.status === st
                              ? "cursor-default opacity-40"
                              : "hover:opacity-80"
                          } ${STATUS_CONFIG[st].bg} ${STATUS_CONFIG[st].text}`}
                        >
                          {STATUS_CONFIG[st].label}
                        </button>
                      )
                    )}
                  </div>

                  {/* Coach assign select */}
                  <select
                    value={bk.coach_id ?? ""}
                    onChange={(e) => onAssignCoach(bk.id, e.target.value)}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                  >
                    <option value="">Assigner un coach</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {getDisplayName(c)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
