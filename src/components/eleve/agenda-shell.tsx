"use client";

import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Video,
  X,
  CalendarDays,
} from "lucide-react";
import type { CalendarEvent, EventType } from "@/types/database";

type ViewMode = "week" | "month";

const HOUR_START = 7;
const HOUR_END = 22;
const HOUR_HEIGHT = 56;
const HOURS = Array.from(
  { length: HOUR_END - HOUR_START },
  (_, i) => i + HOUR_START,
);

const EVENT_COLORS: Record<EventType | string, { bg: string; text: string; dot: string; badge: string }> = {
  cours:   { bg: "bg-blue-50",  text: "text-blue-700",   dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-700 border-blue-200" },
  examen:  { bg: "bg-red-50",   text: "text-red-700",    dot: "bg-red-500",    badge: "bg-red-100 text-red-700 border-red-200" },
  reunion: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500", badge: "bg-purple-100 text-purple-700 border-purple-200" },
  autre:   { bg: "bg-gray-50",  text: "text-gray-600",   dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-600 border-gray-200" },
};

const EVENT_BLOCK_COLORS: Record<EventType | string, string> = {
  cours:   "bg-blue-500/90 border-l-blue-600",
  examen:  "bg-red-500/90 border-l-red-600",
  reunion: "bg-purple-500/90 border-l-purple-600",
  autre:   "bg-gray-500/80 border-l-gray-600",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  cours: "Cours",
  examen: "Examen",
  reunion: "Réunion",
  autre: "Autre",
};

const DAY_NAMES_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_NAMES_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

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
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date) {
  return isSameDay(d, new Date());
}

function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => isSameDay(new Date(e.start_at), day));
}

export function AgendaShell({ events }: { events: CalendarEvent[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const weekStart = getWeekStart(currentDate);
  const weekDays = getWeekDays(weekStart);
  const monthDays = getMonthDays(
    currentDate.getFullYear(),
    currentDate.getMonth(),
  );

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate);
    if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const navTitle =
    viewMode === "week"
      ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTH_NAMES[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
      : `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const todayEvents = useMemo(
    () => getEventsForDay(events, new Date()),
    [events],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Agenda</h1>
          <div className="mt-1.5 h-0.5 w-10 rounded-full bg-gold" />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          <span className="text-sm font-semibold text-navy ml-1">
            {navTitle}
          </span>

          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs ml-3">
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 font-medium transition-colors ${viewMode === "week" ? "bg-navy text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              Semaine
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 font-medium transition-colors ${viewMode === "month" ? "bg-navy text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              Mois
            </button>
          </div>
        </div>
      </div>

      {/* ── Today summary strip ── */}
      {todayEvents.length > 0 && viewMode === "week" && (
        <div className="mb-4 flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-gold/10 to-gold/5 rounded-xl border border-gold/20">
          <CalendarDays size={16} className="text-gold shrink-0" />
          <span className="text-xs font-semibold text-navy">
            Aujourd&apos;hui :
          </span>
          <div className="flex gap-2 overflow-x-auto">
            {todayEvents.map((e) => {
              const c = EVENT_COLORS[e.type] ?? EVENT_COLORS.autre;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedEvent(e)}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.badge} hover:brightness-95 transition-all`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {new Date(e.start_at).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  {e.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Calendar body ── */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {viewMode === "week" ? (
          <WeekView
            days={weekDays}
            events={events}
            onEventClick={setSelectedEvent}
          />
        ) : (
          <MonthView
            cells={monthDays}
            events={events}
            onEventClick={setSelectedEvent}
            onDayClick={(d) => {
              setCurrentDate(d);
              setViewMode("week");
            }}
          />
        )}
      </div>

      {/* ── Event detail modal ── */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Week View ─────────────────────────── */

function WeekView({
  days,
  events,
  onEventClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Day header */}
      <div
        className="grid shrink-0 border-b border-gray-200"
        style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}
      >
        <div className="border-r border-gray-100" />
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className="py-2.5 text-center border-r border-gray-100 last:border-r-0"
            >
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                {DAY_NAMES_SHORT[day.getDay()]}
              </p>
              <div
                className={`mx-auto mt-0.5 h-7 w-7 flex items-center justify-center rounded-full text-sm font-bold transition-colors ${today ? "bg-navy text-white" : "text-gray-700"}`}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-auto">
        <div
          className="relative"
          style={{
            display: "grid",
            gridTemplateColumns: "56px repeat(7, 1fr)",
            minHeight: HOURS.length * HOUR_HEIGHT,
          }}
        >
          {/* Time labels */}
          <div className="border-r border-gray-100">
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="flex items-start justify-end pr-2 pt-1 border-b border-gray-50"
              >
                <span className="text-[10px] text-gray-300 font-medium">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayEvents = getEventsForDay(events, day);
            const currentDay = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={`relative border-r border-gray-100 last:border-r-0 ${currentDay ? "bg-blue-50/30" : ""}`}
                style={{ height: HOURS.length * HOUR_HEIGHT }}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{
                      top: (h - HOUR_START) * HOUR_HEIGHT,
                      height: HOUR_HEIGHT,
                    }}
                    className="absolute inset-x-0 border-b border-gray-50"
                  />
                ))}

                {/* Now indicator */}
                {currentDay && <NowIndicator />}

                {dayEvents.map((event) => {
                  const start = new Date(event.start_at);
                  const end = new Date(event.end_at);
                  const startMins =
                    (start.getHours() - HOUR_START) * 60 + start.getMinutes();
                  const durationMins = Math.max(
                    (end.getTime() - start.getTime()) / 60000,
                    30,
                  );
                  const top = Math.max(startMins * (HOUR_HEIGHT / 60), 0);
                  const height = Math.max(
                    durationMins * (HOUR_HEIGHT / 60),
                    22,
                  );
                  const blockColor =
                    EVENT_BLOCK_COLORS[event.type] ?? EVENT_BLOCK_COLORS.autre;

                  return (
                    <div
                      key={event.id}
                      className={`absolute left-0.5 right-0.5 rounded-lg px-2 py-1 cursor-pointer overflow-hidden border-l-[3px] ${blockColor} text-white shadow-sm hover:shadow-md hover:brightness-110 transition-all z-10`}
                      style={{ top, height }}
                      onClick={() => onEventClick(event)}
                    >
                      <p className="text-[11px] font-semibold leading-tight truncate">
                        {event.title}
                      </p>
                      {height > 34 && (
                        <p className="text-[10px] text-white/80 mt-0.5">
                          {start.toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {end.toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                      {height > 52 && event.location && (
                        <p className="text-[9px] text-white/60 mt-0.5 flex items-center gap-0.5">
                          <MapPin size={8} /> {event.location}
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

/* ─────────────────────── Now Indicator ─────────────────────── */

function NowIndicator() {
  const now = new Date();
  const mins = (now.getHours() - HOUR_START) * 60 + now.getMinutes();
  if (mins < 0 || mins > (HOUR_END - HOUR_START) * 60) return null;
  const top = mins * (HOUR_HEIGHT / 60);

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
        <div className="flex-1 h-[2px] bg-red-500" />
      </div>
    </div>
  );
}

/* ─────────────────────────── Month View ─────────────────────────── */

function MonthView({
  cells,
  events,
  onEventClick,
  onDayClick,
}: {
  cells: (Date | null)[];
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onDayClick: (d: Date) => void;
}) {
  const weeks = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="flex flex-col h-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 shrink-0 border-b border-gray-200">
        {weeks.map((w) => (
          <div
            key={w}
            className="py-2.5 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100 last:border-r-0"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div
          className="grid grid-cols-7 h-full"
          style={{ gridTemplateRows: `repeat(${cells.length / 7}, 1fr)` }}
        >
          {cells.map((day, i) => {
            const dayEvents = day ? getEventsForDay(events, day) : [];
            const today = day ? isToday(day) : false;

            return (
              <div
                key={i}
                className={`border-r border-b border-gray-100 min-h-[100px] p-1.5 cursor-pointer transition-colors ${day ? "hover:bg-gray-50" : "bg-gray-50/50"}`}
                onClick={() => day && onDayClick(day)}
              >
                {day && (
                  <>
                    <div
                      className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${today ? "bg-navy text-white" : "text-gray-500"}`}
                    >
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event) => {
                        const c = EVENT_COLORS[event.type] ?? EVENT_COLORS.autre;
                        return (
                          <div
                            key={event.id}
                            className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md truncate ${c.bg} ${c.text} cursor-pointer hover:brightness-95 transition-all`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEventClick(event);
                            }}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                            <span className="truncate">
                              {new Date(event.start_at).toLocaleTimeString(
                                "fr-FR",
                                { hour: "2-digit", minute: "2-digit" },
                              )}{" "}
                              {event.title}
                            </span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <p className="text-[10px] text-gray-400 pl-1 font-medium">
                          +{dayEvents.length - 3} autres
                        </p>
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

/* ─────────────────────── Event Detail Modal ─────────────────────── */

function EventDetailModal({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const c = EVENT_COLORS[event.type] ?? EVENT_COLORS.autre;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color strip */}
        <div className={`h-1.5 ${c.dot}`} />

        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <span
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium mb-2 ${c.badge}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {EVENT_TYPE_LABELS[event.type] ?? "Autre"}
              </span>
              <h2 className="text-lg font-bold text-gray-900">
                {event.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <Clock size={15} className="text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {DAY_NAMES_FULL[start.getDay()]}{" "}
                  {start.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <p className="text-gray-500">
                  {start.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  –{" "}
                  {end.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {event.location && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <MapPin size={15} className="text-gray-400" />
                </div>
                <span>{event.location}</span>
              </div>
            )}

            {event.zoom_link && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Video size={15} className="text-blue-500" />
                </div>
                <a
                  href={event.zoom_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 font-medium hover:underline"
                >
                  Rejoindre la visio
                </a>
              </div>
            )}
          </div>

          {event.description && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-600 leading-relaxed">
                {event.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
