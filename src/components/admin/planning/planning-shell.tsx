"use client";

import { useState, useTransition } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
  X, Check, AlertCircle, Loader2, Clock, MapPin, Video, Users,
} from "lucide-react";
import type { Groupe } from "@/types/database";
import { createEvent, updateEvent, deleteEvent } from "@/app/(admin)/admin/planning/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type CalEvent = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  type: string;
  groupe_id: string | null;
  zoom_link: string | null;
  location: string | null;
};

type ViewMode = "week" | "month";

type Modal =
  | { type: "create"; prefill?: { date: Date; hour: number } }
  | { type: "edit"; event: CalEvent }
  | { type: "view"; event: CalEvent }
  | null;

type Toast = { message: string; kind: "success" | "error" } | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_START = 7;
const HOUR_END = 22;
const HOUR_HEIGHT = 56; // px per hour
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START);

const EVENT_COLORS: Record<string, { bg: string; border: string }> = {
  cours:   { bg: "bg-blue-500/85",   border: "border-blue-400/60" },
  examen:  { bg: "bg-red-500/85",    border: "border-red-400/60" },
  reunion: { bg: "bg-purple-500/85", border: "border-purple-400/60" },
  autre:   { bg: "bg-gray-500/70",   border: "border-gray-400/60" },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  cours: "Cours", examen: "Examen", reunion: "Réunion", autre: "Autre",
};

const DAY_NAMES_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
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

function getMonthDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const cells: (Date | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isToday(d: Date) { return isSameDay(d, new Date()); }

function getEventsForDay(events: CalEvent[], day: Date): CalEvent[] {
  return events.filter((e) => isSameDay(new Date(e.start_at), day));
}

function fmt(date: Date, hour: number, minute = 0): string {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 16);
}

// ─── Main Shell ───────────────────────────────────────────────────────────────

export function PlanningShell({
  initialEvents,
  groupes,
}: {
  initialEvents: CalEvent[];
  groupes: Groupe[];
}) {
  const today = new Date();
  const [events, setEvents] = useState<CalEvent[]>(initialEvents);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState<Date>(today);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const weekStart = getWeekStart(currentDate);
  const weekDays = getWeekDays(weekStart);
  const monthDays = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const refreshEvents = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("events").select("*").order("start_at");
    if (data) setEvents(data as CalEvent[]);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Supprimer cet événement ?")) return;
    startTransition(async () => {
      const res = await deleteEvent(id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setEvents((prev) => prev.filter((e) => e.id !== id));
      showToast("Événement supprimé", "success");
      setModal(null);
    });
  };

  // Navigation
  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate);
    if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  // Title
  const navTitle = viewMode === "week"
    ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTH_NAMES[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
    : `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.kind === "success" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"}`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Header toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-1.5 text-xs font-medium border border-white/20 rounded-lg text-white/70 hover:bg-white/10 transition-colors">
            Aujourd'hui
          </button>
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-white/50 hover:bg-white/10 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg text-white/50 hover:bg-white/10 transition-colors">
            <ChevronRight size={16} />
          </button>
          <span className="text-sm font-semibold text-white ml-1">{navTitle}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-white/15 overflow-hidden text-xs">
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 font-medium transition-colors ${viewMode === "week" ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10"}`}
            >
              Semaine
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 font-medium transition-colors ${viewMode === "month" ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10"}`}
            >
              Mois
            </button>
          </div>

          <button
            onClick={() => setModal({ type: "create" })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C] text-[#0e1e35] text-xs font-semibold rounded-lg hover:bg-[#A8892E] transition-colors"
          >
            <Plus size={13} /> Nouvel événement
          </button>
        </div>
      </div>

      {/* Calendar body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === "week" ? (
          <WeekView
            days={weekDays}
            events={events}
            groupes={groupes}
            onCellClick={(date, hour) => setModal({ type: "create", prefill: { date, hour } })}
            onEventClick={(e) => setModal({ type: "view", event: e })}
          />
        ) : (
          <MonthView
            year={currentDate.getFullYear()}
            month={currentDate.getMonth()}
            cells={monthDays}
            events={events}
            onCellClick={(date) => setModal({ type: "create", prefill: { date, hour: 9 } })}
            onEventClick={(e) => setModal({ type: "view", event: e })}
          />
        )}
      </div>

      {/* Modals */}
      {modal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-[#0e1e35] border border-white/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {modal.type === "view" ? (
              <EventDetail
                event={modal.event}
                groupes={groupes}
                onEdit={() => setModal({ type: "edit", event: modal.event })}
                onDelete={() => handleDelete(modal.event.id)}
                onClose={() => setModal(null)}
              />
            ) : (
              <EventForm
                event={modal.type === "edit" ? modal.event : undefined}
                prefill={modal.type === "create" ? modal.prefill : undefined}
                groupes={groupes}
                onSubmit={(data) => {
                  startTransition(async () => {
                    const res = modal.type === "edit"
                      ? await updateEvent(modal.event.id, data)
                      : await createEvent(data);
                    if ("error" in res) { showToast(res.error!, "error"); return; }
                    setModal(null);
                    await refreshEvents();
                    showToast(modal.type === "create" ? "Événement créé" : "Événement modifié", "success");
                  });
                }}
                onClose={() => setModal(null)}
                isPending={isPending}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  days, events, groupes, onCellClick, onEventClick,
}: {
  days: Date[];
  events: CalEvent[];
  groupes: Groupe[];
  onCellClick: (date: Date, hour: number) => void;
  onEventClick: (event: CalEvent) => void;
}) {
  const today = new Date();

  return (
    <div className="flex flex-col h-full">
      {/* Day header row */}
      <div className="grid shrink-0 border-b border-white/10" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
        <div className="border-r border-white/10" /> {/* spacer */}
        {days.map((day) => {
          const todayMark = isToday(day);
          return (
            <div key={day.toISOString()} className="py-2 text-center border-r border-white/10 last:border-r-0">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">
                {DAY_NAMES_SHORT[day.getDay()]}
              </p>
              <div className={`mx-auto mt-0.5 h-7 w-7 flex items-center justify-center rounded-full text-sm font-bold ${todayMark ? "bg-[#C9A84C] text-[#0e1e35]" : "text-white"}`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative" style={{ display: "grid", gridTemplateColumns: "52px repeat(7, 1fr)", minHeight: HOURS.length * HOUR_HEIGHT }}>
          {/* Time labels column */}
          <div className="border-r border-white/10">
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="flex items-start justify-end pr-2 pt-1 border-b border-white/5">
                <span className="text-[10px] text-white/25">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayEvents = getEventsForDay(events, day);
            const isCurrentDay = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={`relative border-r border-white/10 last:border-r-0 ${isCurrentDay ? "bg-white/[0.02]" : ""}`}
                style={{ height: HOURS.length * HOUR_HEIGHT }}
              >
                {/* Hour cells (clickable) */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ top: (h - HOUR_START) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    className="absolute inset-x-0 border-b border-white/5 cursor-pointer hover:bg-white/[0.04] transition-colors group"
                    onClick={() => onCellClick(day, h)}
                  >
                    <Plus size={10} className="absolute top-1 right-1 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}

                {/* Events */}
                {dayEvents.map((event) => {
                  const start = new Date(event.start_at);
                  const end = new Date(event.end_at);
                  const startMins = (start.getHours() - HOUR_START) * 60 + start.getMinutes();
                  const durationMins = Math.max((end.getTime() - start.getTime()) / 60000, 30);
                  const top = Math.max(startMins * (HOUR_HEIGHT / 60), 0);
                  const height = Math.max(durationMins * (HOUR_HEIGHT / 60), 22);
                  const colors = EVENT_COLORS[event.type] ?? EVENT_COLORS.autre;

                  return (
                    <div
                      key={event.id}
                      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 cursor-pointer overflow-hidden border-l-2 ${colors.bg} ${colors.border} hover:brightness-110 transition-all z-10`}
                      style={{ top, height }}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    >
                      <p className="text-[11px] font-semibold text-white leading-tight truncate">{event.title}</p>
                      {height > 32 && (
                        <p className="text-[10px] text-white/70">
                          {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          {" – "}
                          {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  year, month, cells, events, onCellClick, onEventClick,
}: {
  year: number;
  month: number;
  cells: (Date | null)[];
  events: CalEvent[];
  onCellClick: (date: Date) => void;
  onEventClick: (event: CalEvent) => void;
}) {
  const weeks = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="flex flex-col h-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 shrink-0 border-b border-white/10">
        {weeks.map((w) => (
          <div key={w} className="py-2 text-center text-[10px] font-semibold text-white/40 uppercase tracking-wider border-r border-white/10 last:border-r-0">
            {w}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 h-full" style={{ gridTemplateRows: `repeat(${cells.length / 7}, 1fr)` }}>
          {cells.map((day, i) => {
            const dayEvents = day ? getEventsForDay(events, day) : [];
            const todayMark = day ? isToday(day) : false;

            return (
              <div
                key={i}
                className={`border-r border-b border-white/10 last-of-type:border-r-0 min-h-[100px] p-1 ${day ? "cursor-pointer hover:bg-white/[0.03] transition-colors" : "opacity-30"}`}
                onClick={() => day && onCellClick(day)}
              >
                {day && (
                  <>
                    <div className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${todayMark ? "bg-[#C9A84C] text-[#0e1e35]" : "text-white/60"}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event) => {
                        const colors = EVENT_COLORS[event.type] ?? EVENT_COLORS.autre;
                        return (
                          <div
                            key={event.id}
                            className={`text-[10px] font-medium px-1 py-0.5 rounded truncate text-white ${colors.bg} cursor-pointer hover:brightness-110`}
                            onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                          >
                            {new Date(event.start_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} {event.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <p className="text-[10px] text-white/40 pl-1">+{dayEvents.length - 3} autres</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Event Detail (pop-up on click) ──────────────────────────────────────────

function EventDetail({
  event, groupes, onEdit, onDelete, onClose,
}: {
  event: CalEvent;
  groupes: Groupe[];
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const groupe = groupes.find((g) => g.id === event.groupe_id);
  const colors = EVENT_COLORS[event.type] ?? EVENT_COLORS.autre;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${colors.bg}`} />
          <h2 className="text-base font-semibold text-white">{event.title}</h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-white/40 hover:bg-red-500/20 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm text-white/60">
        <div className="flex items-center gap-2">
          <Clock size={13} className="shrink-0" />
          <span>
            {start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}
            {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            {" – "}
            {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin size={13} className="shrink-0" />
            <span>{event.location}</span>
          </div>
        )}
        {event.zoom_link && (
          <div className="flex items-center gap-2">
            <Video size={13} className="shrink-0 text-blue-400" />
            <a href={event.zoom_link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline truncate">
              Rejoindre Zoom
            </a>
          </div>
        )}
        {groupe && (
          <div className="flex items-center gap-2">
            <Users size={13} className="shrink-0" />
            <span>{groupe.name}</span>
          </div>
        )}
        {event.description && (
          <p className="text-white/50 text-xs mt-2 pt-2 border-t border-white/10">{event.description}</p>
        )}
      </div>
    </div>
  );
}

// ─── Event Form ───────────────────────────────────────────────────────────────

function EventForm({
  event, prefill, groupes, onSubmit, onClose, isPending,
}: {
  event?: CalEvent;
  prefill?: { date: Date; hour: number };
  groupes: Groupe[];
  onSubmit: (data: any) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const defaultStart = prefill ? fmt(prefill.date, prefill.hour) : (event ? new Date(event.start_at).toISOString().slice(0, 16) : "");
  const defaultEnd = prefill ? fmt(prefill.date, prefill.hour + 1) : (event ? new Date(event.end_at).toISOString().slice(0, 16) : "");

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);
  const [type, setType] = useState(event?.type ?? "cours");
  const [groupeId, setGroupeId] = useState(event?.groupe_id ?? "");
  const [zoomLink, setZoomLink] = useState(event?.zoom_link ?? "");
  const [location, setLocation] = useState(event?.location ?? "");

  const field = "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">
          {event ? "Modifier l'événement" : "Nouvel événement"}
        </h2>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
      </div>

      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Titre *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre..." className={field} autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
            <option value="cours">Cours</option>
            <option value="examen">Examen</option>
            <option value="reunion">Réunion</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Groupe</label>
          <select value={groupeId} onChange={(e) => setGroupeId(e.target.value)} className={field}>
            <option value="">— Tous —</option>
            {groupes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Début *</label>
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={field} />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1.5 block">Fin *</label>
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Lieu</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Salle, adresse..." className={field} />
      </div>

      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Lien Zoom</label>
        <input value={zoomLink} onChange={(e) => setZoomLink(e.target.value)} placeholder="https://zoom.us/..." className={field} />
      </div>

      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${field} resize-none`} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">Annuler</button>
        <button
          onClick={() => onSubmit({
            title: title.trim(),
            description: description.trim() || undefined,
            start_at: new Date(startAt).toISOString(),
            end_at: new Date(endAt).toISOString(),
            type,
            groupe_id: groupeId || null,
            zoom_link: zoomLink.trim() || undefined,
            location: location.trim() || undefined,
          })}
          disabled={isPending || !title.trim() || !startAt || !endAt}
          className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0e1e35] text-sm font-semibold rounded-lg hover:bg-[#A8892E] disabled:opacity-50 transition-colors"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {event ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </div>
  );
}
