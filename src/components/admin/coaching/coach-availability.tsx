"use client";

import { useState, useTransition, useMemo } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Repeat,
} from "lucide-react";
import {
  createCoachCallSlot,
  deleteCoachCallSlot,
  saveCoachRecurringAvailability,
  generateSlotsFromRecurring,
} from "@/app/(admin)/admin/coaching/actions";
import type { CoachingCallSlot, CoachingCallBooking, CoachRecurringAvailability, CoachSlotType, Groupe } from "@/types/database";

type Props = {
  coachId: string;
  slots: CoachingCallSlot[];
  bookings: CoachingCallBooking[];
  groupes: Groupe[];
  recurringAvailability?: CoachRecurringAvailability[];
};

const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const SLOT_TYPE_CONFIG: Record<CoachSlotType, { label: string; color: string; bg: string }> = {
  rdv_physique: { label: "Présentiel", color: "text-blue-700", bg: "bg-blue-100" },
  rdv_visio: { label: "Visio", color: "text-purple-700", bg: "bg-purple-100" },
  rdv_tel: { label: "Téléphone", color: "text-green-700", bg: "bg-green-100" },
  chat: { label: "Chat", color: "text-amber-700", bg: "bg-amber-100" },
};

function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatWeekRange(start: Date) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sMonth = start.toLocaleDateString("fr-FR", { month: "short" });
  const eMonth = end.toLocaleDateString("fr-FR", { month: "short" });
  if (sMonth === eMonth) {
    return `${start.getDate()} – ${end.getDate()} ${sMonth}`;
  }
  return `${start.getDate()} ${sMonth} – ${end.getDate()} ${eMonth}`;
}

export function CoachAvailability({ coachId, slots, bookings, groupes, recurringAvailability = [] }: Props) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [activeSection, setActiveSection] = useState<"recurring" | "ponctual">("recurring");

  // Recurring state
  const [recurring, setRecurring] = useState(recurringAvailability);
  const [recDay, setRecDay] = useState(0);
  const [recStart, setRecStart] = useState("09:00");
  const [recEnd, setRecEnd] = useState("10:00");
  const [recType, setRecType] = useState<CoachSlotType>("rdv_visio");
  const [recToast, setRecToast] = useState<string | null>(null);

  // Form state
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("09:30");
  const [formLocation, setFormLocation] = useState("");
  const [formGroupeId, setFormGroupeId] = useState(groupes[0]?.id ?? "");
  const [formRepeatWeeks, setFormRepeatWeeks] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const bookedSlotIds = useMemo(
    () => new Set(bookings.filter((b) => b.status !== "cancelled").map((b) => b.slot_id)),
    [bookings]
  );

  // Filter slots for current week
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSlots = useMemo(
    () =>
      slots
        .filter((s) => {
          const d = new Date(s.start_at);
          return d >= weekStart && d < weekEnd;
        })
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [slots, weekStart, weekEnd]
  );

  // Group by day
  const slotsByDay = useMemo(() => {
    const map = new Map<string, CoachingCallSlot[]>();
    for (const slot of weekSlots) {
      const day = new Date(slot.start_at).toISOString().slice(0, 10);
      const arr = map.get(day) ?? [];
      arr.push(slot);
      map.set(day, arr);
    }
    return map;
  }, [weekSlots]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const handleCreate = () => {
    if (!formDate || !formGroupeId) return;
    setError(null);

    startTransition(async () => {
      const weeksToCreate = formRepeatWeeks > 0 ? formRepeatWeeks + 1 : 1;
      let lastError: string | null = null;

      for (let w = 0; w < weeksToCreate; w++) {
        const baseDate = new Date(formDate);
        baseDate.setDate(baseDate.getDate() + w * 7);
        const dateStr = baseDate.toISOString().slice(0, 10);

        const startAt = new Date(`${dateStr}T${formStartTime}:00`);
        const endAt = new Date(`${dateStr}T${formEndTime}:00`);

        const res = await createCoachCallSlot({
          coach_id: coachId,
          groupe_id: formGroupeId,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          location: formLocation || undefined,
        });

        if ("error" in res) {
          lastError = res.error ?? "Erreur";
        }
      }

      if (lastError) {
        setError(lastError);
      } else {
        setShowForm(false);
        setFormRepeatWeeks(0);
      }
    });
  };

  const handleDelete = (slotId: string) => {
    startTransition(async () => {
      const res = await deleteCoachCallSlot(slotId);
      if ("error" in res) {
        setError(res.error ?? "Erreur");
      }
    });
  };

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const thisWeek = () => setWeekStart(getWeekStart(new Date()));

  const handleAddRecurring = () => {
    const item = { day_of_week: recDay, start_time: recStart, end_time: recEnd, slot_type: recType };
    const next = [...recurring, { ...item, id: crypto.randomUUID(), coach_id: coachId, is_active: true, created_at: "", updated_at: "" } as CoachRecurringAvailability];
    setRecurring(next);
    startTransition(async () => {
      const res = await saveCoachRecurringAvailability({ coach_id: coachId, items: next.map(r => ({ day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time, slot_type: r.slot_type })) });
      if ("error" in res && res.error) { setRecToast("Erreur: " + res.error); setTimeout(() => setRecToast(null), 3000); }
      else { setRecToast("Disponibilités sauvegardées"); setTimeout(() => setRecToast(null), 2000); }
    });
  };

  const handleRemoveRecurring = (id: string) => {
    const next = recurring.filter(r => r.id !== id);
    setRecurring(next);
    startTransition(async () => {
      await saveCoachRecurringAvailability({ coach_id: coachId, items: next.map(r => ({ day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time, slot_type: r.slot_type })) });
    });
  };

  const handleGenerateSlots = () => {
    if (!groupes[0]) return;
    startTransition(async () => {
      const res = await generateSlotsFromRecurring({ coach_id: coachId, week_start: weekStart.toISOString(), groupe_id: groupes[0].id });
      if ("error" in res && res.error) { setRecToast("Erreur: " + res.error); }
      else { setRecToast(`${(res as any).count ?? 0} créneaux générés`); }
      setTimeout(() => setRecToast(null), 3000);
    });
  };

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 w-fit">
        <button onClick={() => setActiveSection("recurring")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeSection === "recurring" ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
          <Repeat className="inline w-3.5 h-3.5 mr-1" />Planning récurrent
        </button>
        <button onClick={() => setActiveSection("ponctual")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeSection === "ponctual" ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
          <CalendarDays className="inline w-3.5 h-3.5 mr-1" />Créneaux ponctuels
        </button>
      </div>

      {recToast && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">{recToast}</div>
      )}

      {/* ─── Recurring section ─── */}
      {activeSection === "recurring" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Définis tes disponibilités hebdomadaires. Elles se répéteront chaque semaine.</p>

          {/* Add form */}
          <div className="flex items-end gap-2 flex-wrap p-3 rounded-xl bg-gray-50 border border-gray-200">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">Jour</label>
              <select value={recDay} onChange={e => setRecDay(parseInt(e.target.value))} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
                {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">Début</label>
              <input type="time" value={recStart} onChange={e => setRecStart(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">Fin</label>
              <input type="time" value={recEnd} onChange={e => setRecEnd(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">Type</label>
              <select value={recType} onChange={e => setRecType(e.target.value as CoachSlotType)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
                {Object.entries(SLOT_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <button onClick={handleAddRecurring} disabled={isPending} className="flex items-center gap-1 rounded-lg bg-[#12314d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f2940] disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          </div>

          {/* Recurring list by day */}
          <div className="space-y-2">
            {DAY_LABELS.map((dayLabel, dayIdx) => {
              const dayItems = recurring.filter(r => r.day_of_week === dayIdx);
              if (dayItems.length === 0) return null;
              return (
                <div key={dayIdx} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-700 w-20 shrink-0">{dayLabel}</span>
                  {dayItems.map(item => {
                    const cfg = SLOT_TYPE_CONFIG[item.slot_type] ?? SLOT_TYPE_CONFIG.rdv_visio;
                    return (
                      <span key={item.id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.color}`}>
                        {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)} · {cfg.label}
                        <button onClick={() => handleRemoveRecurring(item.id)} className="hover:text-red-600 ml-0.5">×</button>
                      </span>
                    );
                  })}
                </div>
              );
            })}
            {recurring.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">Aucune disponibilité récurrente configurée</p>}
          </div>

          {/* Generate button */}
          {recurring.length > 0 && groupes.length > 0 && (
            <button onClick={handleGenerateSlots} disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
              Générer les créneaux de cette semaine ({formatWeekRange(weekStart)})
            </button>
          )}
        </div>
      )}

      {/* ─── Ponctual section (existing) ─── */}
      {activeSection === "ponctual" && (
      <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="rounded-lg border border-[#e5edf6] p-1.5 hover:bg-[#f8fbfe]">
            <ChevronLeft className="h-4 w-4 text-[#5d7085]" />
          </button>
          <button onClick={thisWeek} className="rounded-lg border border-[#e5edf6] px-2.5 py-1 text-xs font-medium text-[#5d7085] hover:bg-[#f8fbfe]">
            Auj.
          </button>
          <button onClick={nextWeek} className="rounded-lg border border-[#e5edf6] p-1.5 hover:bg-[#f8fbfe]">
            <ChevronRight className="h-4 w-4 text-[#5d7085]" />
          </button>
          <span className="ml-2 text-sm font-semibold text-[#12314d]">{formatWeekRange(weekStart)}</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#12314d] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0f2940]"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un créneau
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border border-[#e5edf6] bg-[#f8fbfe] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8a98a8]">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#dbe5f0] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8a98a8]">Début</label>
              <input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#dbe5f0] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8a98a8]">Fin</label>
              <input
                type="time"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#dbe5f0] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8a98a8]">Lieu / Lien</label>
              <input
                type="text"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="Zoom, salle..."
                className="mt-1 w-full rounded-lg border border-[#dbe5f0] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8a98a8]">Classe</label>
              <select
                value={formGroupeId}
                onChange={(e) => setFormGroupeId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#dbe5f0] px-3 py-2 text-sm"
              >
                {groupes.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8a98a8]">
                <Repeat className="inline h-3 w-3 mr-1" />Répéter
              </label>
              <select
                value={formRepeatWeeks}
                onChange={(e) => setFormRepeatWeeks(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[#dbe5f0] px-3 py-2 text-sm"
              >
                <option value={0}>Pas de répétition</option>
                <option value={1}>2 semaines</option>
                <option value={2}>3 semaines</option>
                <option value={3}>4 semaines</option>
                <option value={7}>8 semaines</option>
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={isPending || !formDate || !formGroupeId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#12314d] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f2940] disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Créer {formRepeatWeeks > 0 ? `(${formRepeatWeeks + 1} semaines)` : ""}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-[#dbe5f0] px-3 py-2 text-xs text-[#5d7085] hover:bg-white">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Week grid */}
      <div className="space-y-1">
        {weekDays.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const daySlots = slotsByDay.get(key) ?? [];
          const isToday = key === new Date().toISOString().slice(0, 10);
          const isPast = day < new Date(new Date().toISOString().slice(0, 10));

          return (
            <div key={key} className={`rounded-lg border px-3 py-2 ${isToday ? "border-[#4fabdb]/40 bg-[#f2f9fe]" : "border-[#e5edf6] bg-white"} ${isPast ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${isToday ? "text-[#4fabdb]" : "text-[#5d7085]"}`}>
                  {formatDate(day)}
                </span>
                {daySlots.length > 0 && (
                  <span className="rounded-full bg-[#eef6ff] px-2 py-0.5 text-[10px] font-bold text-[#2e6fa3]">
                    {daySlots.length} créneau{daySlots.length > 1 ? "x" : ""}
                  </span>
                )}
              </div>
              {daySlots.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {daySlots.map((slot) => {
                    const isBooked = bookedSlotIds.has(slot.id);
                    const groupe = groupes.find((g) => g.id === slot.groupe_id);
                    return (
                      <div key={slot.id} className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs ${isBooked ? "bg-emerald-50 text-emerald-800" : "bg-[#f8fbfe] text-[#12314d]"}`}>
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-[#8a98a8]" />
                          <span className="font-medium">{formatTime(slot.start_at)} – {formatTime(slot.end_at)}</span>
                          {groupe && <span className="text-[10px] text-[#8a98a8]">· {groupe.name}</span>}
                          {slot.location && (
                            <span className="flex items-center gap-0.5 text-[10px] text-[#8a98a8]">
                              <MapPin className="h-2.5 w-2.5" />{slot.location}
                            </span>
                          )}
                          {isBooked && <span className="rounded-full bg-emerald-200 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">Réservé</span>}
                        </div>
                        {!isBooked && !isPast && (
                          <button
                            onClick={() => handleDelete(slot.id)}
                            disabled={isPending}
                            className="rounded p-1 text-[#b0b8c4] hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
      )}
    </div>
  );
}
