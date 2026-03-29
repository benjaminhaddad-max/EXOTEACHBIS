"use client";

import { useState, useTransition, useMemo } from "react";
import { Calendar, Phone, Video, MapPin, Loader2, Check, Clock, AlertCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { CoachingRdvRequest, CoachingCallSlot, CoachingCallBooking, CoachSlotType, Profile } from "@/types/database";
import { bookSlotAsStudent, cancelStudentBooking } from "@/app/(admin)/admin/coaching/actions";

interface CoachingRdvSectionProps {
  existingRequests: CoachingRdvRequest[];
  coaches: Profile[];
  availableSlots: CoachingCallSlot[];
  myBooking: (CoachingCallBooking & { slot?: CoachingCallSlot }) | null;
}

const SLOT_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  rdv_physique: { label: "Présentiel", icon: <MapPin size={14} />, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  rdv_visio: { label: "Visio", icon: <Video size={14} />, color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  rdv_tel: { label: "Téléphone", icon: <Phone size={14} />, color: "text-green-700", bg: "bg-green-50 border-green-200" },
  chat: { label: "Chat", icon: <Calendar size={14} />, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
};

function formatDay(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function CoachingRdvSection({ existingRequests, coaches, availableSlots, myBooking: initialBooking }: CoachingRdvSectionProps) {
  const [filterType, setFilterType] = useState<CoachSlotType | "">("");
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [confirmSlot, setConfirmSlot] = useState<CoachingCallSlot | null>(null);
  const [myBooking, setMyBooking] = useState(initialBooking);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);

  const showToast = (msg: string, kind: "success" | "error") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const coachMap = new Map(coaches.map(c => [c.id, c]));

  // Filter slots by type and week
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const filteredSlots = useMemo(() => {
    return availableSlots.filter(s => {
      const d = new Date(s.start_at);
      if (d < weekStart || d >= weekEnd) return false;
      if (filterType && s.slot_type !== filterType) return false;
      // Don't show chat slots to students (internal)
      if (s.slot_type === "chat") return false;
      return true;
    });
  }, [availableSlots, weekStart, weekEnd, filterType]);

  // Group by day
  const slotsByDay = useMemo(() => {
    const map = new Map<string, CoachingCallSlot[]>();
    for (const slot of filteredSlots) {
      const key = new Date(slot.start_at).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(slot);
    }
    return map;
  }, [filteredSlots]);

  // Week days
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const handleBook = (slot: CoachingCallSlot) => {
    startTransition(async () => {
      const res = await bookSlotAsStudent(slot.id);
      if ("error" in res && res.error) { showToast(res.error, "error"); return; }
      setMyBooking({ ...(res as any).booking, slot });
      setConfirmSlot(null);
      showToast("RDV réservé !", "success");
    });
  };

  const handleCancel = () => {
    if (!myBooking) return;
    startTransition(async () => {
      const res = await cancelStudentBooking(myBooking.id);
      if ("error" in res && res.error) { showToast(res.error, "error"); return; }
      setMyBooking(null);
      showToast("RDV annulé", "success");
    });
  };

  return (
    <div className="space-y-6">
      {/* Current booking */}
      {myBooking && myBooking.slot && (
        <div className="bg-white rounded-xl border border-green-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Check size={16} className="text-green-600" />
            <span className="text-sm font-semibold text-gray-900">Ton RDV réservé</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400" />
              <span className="text-gray-700">{formatDay(new Date(myBooking.slot.start_at))}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gray-400" />
              <span className="text-gray-700">{formatTime(myBooking.slot.start_at)} – {formatTime(myBooking.slot.end_at)}</span>
            </div>
            {myBooking.slot.slot_type && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${SLOT_TYPE_CONFIG[myBooking.slot.slot_type]?.bg ?? ""} ${SLOT_TYPE_CONFIG[myBooking.slot.slot_type]?.color ?? ""}`}>
                {SLOT_TYPE_CONFIG[myBooking.slot.slot_type]?.label}
              </span>
            )}
            {(() => { const c = coachMap.get(myBooking.coach_id); return c ? <span className="text-xs text-gray-500">avec {c.first_name} {c.last_name}</span> : null; })()}
          </div>
          {myBooking.slot.location && <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><MapPin size={12} />{myBooking.slot.location}</p>}
          <button onClick={handleCancel} disabled={isPending} className="mt-3 text-xs text-red-600 hover:text-red-700 font-medium">
            {isPending ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}Annuler ce RDV
          </button>
        </div>
      )}

      {/* Slot browser — only show if no active booking */}
      {!myBooking && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Réserver un créneau</h3>
            <p className="text-xs text-gray-500">Choisis un créneau disponible pour un rendez-vous avec ton coach.</p>
          </div>

          {/* Type filter */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterType("")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!filterType ? "bg-[#0e1e35] text-white border-[#0e1e35]" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}>
              Tous les types
            </button>
            {(["rdv_physique", "rdv_visio", "rdv_tel"] as CoachSlotType[]).map(type => {
              const cfg = SLOT_TYPE_CONFIG[type];
              return (
                <button key={type} onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${filterType === type ? "bg-[#0e1e35] text-white border-[#0e1e35]" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}>
                  {cfg.icon} {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={16} className="text-gray-500" /></button>
            <button onClick={() => setWeekStart(getWeekStart(new Date()))}
              className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50">Auj.</button>
            <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight size={16} className="text-gray-500" /></button>
            <span className="text-sm font-medium text-gray-700 ml-2">
              {weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – {weekEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </span>
          </div>

          {/* Slots grid by day */}
          <div className="space-y-3">
            {weekDays.map(day => {
              const key = day.toISOString().slice(0, 10);
              const daySlots = slotsByDay.get(key) ?? [];
              const isToday = key === new Date().toISOString().slice(0, 10);
              const isPast = day < new Date(new Date().toISOString().slice(0, 10));
              if (isPast && daySlots.length === 0) return null;

              return (
                <div key={key} className={`bg-white rounded-xl border p-4 ${isToday ? "border-blue-200" : "border-gray-200"} ${isPast ? "opacity-50" : ""}`}>
                  <p className={`text-xs font-semibold mb-2 capitalize ${isToday ? "text-blue-600" : "text-gray-700"}`}>
                    {formatDay(day)}
                    {isToday && <span className="ml-2 text-[10px] text-blue-500 font-normal">(aujourd&apos;hui)</span>}
                  </p>
                  {daySlots.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucun créneau disponible</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {daySlots.sort((a, b) => a.start_at.localeCompare(b.start_at)).map(slot => {
                        const cfg = SLOT_TYPE_CONFIG[slot.slot_type] ?? SLOT_TYPE_CONFIG.rdv_visio;
                        return (
                          <button key={slot.id} onClick={() => setConfirmSlot(slot)} disabled={isPast}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all hover:shadow-sm ${cfg.bg} ${cfg.color}`}>
                            {cfg.icon}
                            <span>{formatTime(slot.start_at)} – {formatTime(slot.end_at)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredSlots.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-400 bg-white rounded-xl border border-gray-200">
                Aucun créneau disponible cette semaine. Essaie la semaine prochaine →
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirm booking modal */}
      {confirmSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Confirmer le RDV</h3>
              <button onClick={() => setConfirmSlot(null)} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-gray-400" />
                <span className="text-gray-700">{formatDay(new Date(confirmSlot.start_at))}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-gray-400" />
                <span className="text-gray-700">{formatTime(confirmSlot.start_at)} – {formatTime(confirmSlot.end_at)}</span>
              </div>
              {confirmSlot.slot_type && (
                <div className="flex items-center gap-2 text-sm">
                  {SLOT_TYPE_CONFIG[confirmSlot.slot_type]?.icon}
                  <span className="text-gray-700">{SLOT_TYPE_CONFIG[confirmSlot.slot_type]?.label}</span>
                </div>
              )}
              {confirmSlot.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin size={14} className="text-gray-400" />
                  <span className="text-gray-700">{confirmSlot.location}</span>
                </div>
              )}
              {(() => { const c = coachMap.get(confirmSlot.coach_id); return c ? (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                    {(c.first_name?.[0] ?? "") + (c.last_name?.[0] ?? "")}
                  </div>
                  <span className="text-gray-700">{c.first_name} {c.last_name}</span>
                </div>
              ) : null; })()}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmSlot(null)} className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={() => handleBook(confirmSlot)} disabled={isPending}
                className="flex-1 px-4 py-2 rounded-lg bg-[#0e1e35] text-white text-sm font-semibold hover:bg-[#152a45] disabled:opacity-50 flex items-center justify-center gap-1.5">
                {isPending && <Loader2 size={14} className="animate-spin" />}
                Réserver
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
