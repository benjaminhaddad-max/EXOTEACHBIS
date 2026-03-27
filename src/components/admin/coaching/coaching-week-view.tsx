"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Clock, MapPin, User } from "lucide-react";
import type {
  CoachingCallSlot,
  CoachingCallBooking,
  Profile,
  Groupe,
} from "@/types/database";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const HOUR_START = 8;
const HOUR_END = 20;
const HOUR_HEIGHT = 52;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

const PALETTE = [
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af", darkBg: "#93c5fd", darkText: "#1e3a5f" },
  { bg: "#dcfce7", border: "#86efac", text: "#166534", darkBg: "#86efac", darkText: "#14532d" },
  { bg: "#fef9c3", border: "#fde047", text: "#854d0e", darkBg: "#fde047", darkText: "#713f12" },
  { bg: "#fce7f3", border: "#f9a8d4", text: "#9d174d", darkBg: "#f9a8d4", darkText: "#831843" },
  { bg: "#e0e7ff", border: "#a5b4fc", text: "#3730a3", darkBg: "#a5b4fc", darkText: "#312e81" },
  { bg: "#ffedd5", border: "#fdba74", text: "#9a3412", darkBg: "#fdba74", darkText: "#7c2d12" },
];

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatDayHeader(date: Date): string {
  const dayIdx = (date.getDay() + 6) % 7; // Mon=0
  return `${DAY_LABELS[dayIdx]} ${date.getDate()}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function toLocalIso(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
  slots: CoachingCallSlot[];
  bookings: CoachingCallBooking[];
  students: Profile[];
  coaches: Profile[];
  groupes: Groupe[];
  weekStart: Date;
  onWeekChange: (date: Date) => void;
  onCreateSlot: (data: { coach_id: string; groupe_id: string; start_at: string; end_at: string; location?: string }) => void;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CoachingWeekView({ slots, bookings, students, coaches, groupes, weekStart, onWeekChange, onCreateSlot }: Props) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [prefillDate, setPrefillDate] = useState("");
  const [prefillHour, setPrefillHour] = useState(9);

  /* form state */
  const [formCoachId, setFormCoachId] = useState(coaches[0]?.id ?? "");
  const [formGroupeId, setFormGroupeId] = useState(groupes[0]?.id ?? "");
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("09:30");
  const [formLocation, setFormLocation] = useState("");

  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const today = new Date();

  /* index bookings by slot_id */
  const bookingBySlot = useMemo(() => {
    const map = new Map<string, CoachingCallBooking>();
    for (const b of bookings) {
      if (b.status !== "cancelled") map.set(b.slot_id, b);
    }
    return map;
  }, [bookings]);

  /* coach color index */
  const coachColorMap = useMemo(() => {
    const map = new Map<string, number>();
    const uniqueCoaches = [...new Set(slots.map((s) => s.coach_id))];
    uniqueCoaches.forEach((id, i) => map.set(id, i % PALETTE.length));
    return map;
  }, [slots]);

  /* student name lookup */
  const studentMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const s of students) map.set(s.id, s);
    return map;
  }, [students]);

  /* coach name lookup */
  const coachMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const c of coaches) map.set(c.id, c);
    return map;
  }, [coaches]);

  /* filter week slots */
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSlots = useMemo(
    () => slots.filter((s) => {
      const d = new Date(s.start_at);
      return d >= weekStart && d < weekEnd;
    }),
    [slots, weekStart, weekEnd],
  );

  /* navigation */
  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    onWeekChange(d);
  };
  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    onWeekChange(d);
  };
  const goToday = () => onWeekChange(getWeekStart(new Date()));

  /* click on cell to open create modal */
  const handleCellClick = (dayDate: Date, hour: number) => {
    setPrefillDate(toLocalIso(dayDate));
    setPrefillHour(hour);
    setFormStart(`${pad2(hour)}:00`);
    setFormEnd(`${pad2(hour)}:30`);
    setFormCoachId(coaches[0]?.id ?? "");
    setFormGroupeId(groupes[0]?.id ?? "");
    setFormLocation("");
    setShowCreateModal(true);
  };

  const handleSubmit = () => {
    if (!formCoachId || !formGroupeId || !prefillDate) return;
    onCreateSlot({
      coach_id: formCoachId,
      groupe_id: formGroupeId,
      start_at: `${prefillDate}T${formStart}:00`,
      end_at: `${prefillDate}T${formEnd}:00`,
      location: formLocation || undefined,
    });
    setShowCreateModal(false);
  };

  /* current time indicator */
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const showNowLine = nowMinutes >= HOUR_START * 60 && nowMinutes < HOUR_END * 60;
  const nowTop = (nowMinutes - HOUR_START * 60) * (HOUR_HEIGHT / 60);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Week navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-1 rounded hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={goToday} className="px-3 py-1 text-xs font-medium rounded hover:bg-gray-100">Aujourd&apos;hui</button>
          <button onClick={nextWeek} className="p-1 rounded hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <span className="text-sm font-semibold text-gray-700">
          {weekStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </span>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div style={{ display: "grid", gridTemplateColumns: "52px repeat(7, 1fr)", minWidth: 700 }}>
          {/* Day headers row */}
          <div className="border-b border-r border-gray-200 h-10" />
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={i}
                className={`text-center text-xs font-semibold py-2 border-b border-r border-gray-200 ${isToday ? "bg-blue-50 text-blue-700" : "text-gray-600"}`}
              >
                {formatDayHeader(day)}
              </div>
            );
          })}

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              {/* Hour label */}
              <div className="border-r border-b border-gray-100 pr-2 text-right pt-0.5">
                <span className="text-[10px] text-gray-400">{hour}h</span>
              </div>
              {/* Day cells */}
              {days.map((day, dayIdx) => (
                <div
                  key={dayIdx}
                  className="relative border-r border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() => handleCellClick(day, hour)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Overlay: slots + now-line */}
        <div className="relative" style={{ marginTop: -(HOURS.length * HOUR_HEIGHT) - 40 /* header */ }}>
          <div style={{ display: "grid", gridTemplateColumns: "52px repeat(7, 1fr)", minWidth: 700 }}>
            {/* spacer for header row */}
            <div style={{ height: 40, gridColumn: "1 / -1" }} />

            {/* hour rows spacer (invisible) */}
            <div style={{ gridColumn: "1 / -1", height: HOURS.length * HOUR_HEIGHT, position: "relative" }}>
              {/* Now line */}
              {showNowLine && days.some((d) => isSameDay(d, today)) && (
                <div
                  className="absolute left-[52px] right-0 z-20 pointer-events-none"
                  style={{ top: nowTop }}
                >
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                    <div className="flex-1 h-[2px] bg-red-500" />
                  </div>
                </div>
              )}

              {/* Rendered slots */}
              {weekSlots.map((slot) => {
                const start = new Date(slot.start_at);
                const end = new Date(slot.end_at);
                const dayIdx = days.findIndex((d) => isSameDay(d, start));
                if (dayIdx === -1) return null;

                const startMinutes = start.getHours() * 60 + start.getMinutes();
                const endMinutes = end.getHours() * 60 + end.getMinutes();
                const durationMinutes = endMinutes - startMinutes;
                const top = (startMinutes - HOUR_START * 60) * (HOUR_HEIGHT / 60);
                const height = Math.max(24, durationMinutes * (HOUR_HEIGHT / 60));

                const booking = bookingBySlot.get(slot.id);
                const isBooked = !!booking;
                const colorIdx = coachColorMap.get(slot.coach_id) ?? 0;
                const palette = PALETTE[colorIdx];

                const coachProfile = coachMap.get(slot.coach_id);
                const coachName = coachProfile ? `${coachProfile.first_name ?? ""} ${coachProfile.last_name ?? ""}`.trim() : "Coach";
                const studentProfile = booking ? studentMap.get(booking.student_id) : null;
                const studentName = studentProfile ? `${studentProfile.first_name ?? ""} ${studentProfile.last_name ?? ""}`.trim() : "";

                /* position: column offset = 52px + dayIdx * (1fr) */
                const leftPct = ((dayIdx) / 7) * 100;
                const widthPct = 100 / 7;

                return (
                  <div
                    key={slot.id}
                    className="absolute rounded-md overflow-hidden px-1 py-0.5 text-[10px] leading-tight z-10 pointer-events-auto border"
                    style={{
                      top,
                      height,
                      left: `calc(52px + ${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 6px)`,
                      backgroundColor: isBooked ? palette.darkBg : palette.bg,
                      borderColor: palette.border,
                      color: isBooked ? palette.darkText : palette.text,
                    }}
                    title={`${coachName}${isBooked ? ` / ${studentName}` : ""}`}
                  >
                    {isBooked ? (
                      <>
                        <div className="font-semibold truncate flex items-center gap-0.5">
                          <User className="w-2.5 h-2.5 flex-shrink-0" />
                          {studentName}
                        </div>
                        <div className="truncate opacity-80">{coachName}</div>
                      </>
                    ) : (
                      <div className="font-medium truncate">{coachName}</div>
                    )}
                    {slot.location && (
                      <div className="truncate opacity-70 flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                        {slot.location}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Create Slot Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Nouveau cr&#233;neau
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Coach select */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Coach</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={formCoachId}
                  onChange={(e) => setFormCoachId(e.target.value)}
                >
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Groupe select */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Groupe</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={formGroupeId}
                  onChange={(e) => setFormGroupeId(e.target.value)}
                >
                  {groupes.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={prefillDate}
                  onChange={(e) => setPrefillDate(e.target.value)}
                />
              </div>

              {/* Time range */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> D&#233;but
                  </label>
                  <input
                    type="time"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fin</label>
                  <input
                    type="time"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Lieu (optionnel)
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="Zoom, Salle A..."
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Cr&#233;er
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
