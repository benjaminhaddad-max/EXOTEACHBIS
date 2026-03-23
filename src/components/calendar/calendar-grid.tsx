"use client";

import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EventBadge } from "./event-badge";
import type { CalendarEvent } from "@/types/database";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Returns the ISO date string (YYYY-MM-DD) for a Date object */
function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Builds the grid cells for the calendar:
 *  - Leading empty cells (days from previous month)
 *  - Days of current month
 *  - Trailing empty cells to complete the last row
 */
function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  // getDay(): 0=Sun … 6=Sat — convert to Mon-based index
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  // Leading empty
  for (let i = 0; i < startDow; i++) cells.push(null);
  // Days
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  // Trailing empty to complete the last row
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) cells.push(null);
  }
  return cells;
}

/** Groups events by ISO date key */
function groupByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const key = ev.start_at.slice(0, 10);
    if (!map[key]) map[key] = [];
    map[key].push(ev);
  }
  return map;
}

interface CalendarGridProps {
  events: CalendarEvent[];
  /** Called when the user clicks on a day cell (create new event) */
  onDayClick?: (date: string) => void;
  /** Called when the user clicks on an event badge (view/edit event) */
  onEventClick?: (event: CalendarEvent) => void;
  /** If true, day cells are not clickable (read-only student view) */
  readOnly?: boolean;
}

export function CalendarGrid({ events, onDayClick, onEventClick, readOnly = false }: CalendarGridProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const prevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 0) { setYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 11) { setYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }, []);

  const days = buildCalendarDays(year, month);
  const eventsByDate = groupByDate(events);
  const todayISO = toISODate(today);

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* ── Navigation bar ── */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-navy px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={nextMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <h2 className="text-base font-semibold text-white sm:text-lg">
          {MONTHS[month]} {year}
        </h2>

        <button
          onClick={goToToday}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          Aujourd&apos;hui
        </button>
      </div>

      {/* ── Weekday headers ── */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400"
          >
            {day}
          </div>
        ))}
      </div>

      {/* ── Day grid ── */}
      <div className="grid grid-cols-7 flex-1">
        {days.map((date, idx) => {
          if (!date) {
            return (
              <div
                key={`empty-${idx}`}
                className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50/50 last:border-r-0"
              />
            );
          }

          const dateISO = toISODate(date);
          const isToday = dateISO === todayISO;
          const dayEvents = eventsByDate[dateISO] ?? [];
          const isClickable = !readOnly && !!onDayClick;

          return (
            <div
              key={dateISO}
              onClick={() => isClickable && onDayClick(dateISO)}
              className={cn(
                "group min-h-[80px] border-b border-r border-gray-100 p-1 last:border-r-0 sm:p-1.5",
                // Hide right border on last column of each row
                (idx + 1) % 7 === 0 && "border-r-0",
                isClickable && "cursor-pointer transition-colors hover:bg-gold/5",
              )}
            >
              {/* Day number */}
              <div className="mb-1 flex items-start justify-between">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday
                      ? "bg-navy font-bold text-white"
                      : "text-gray-600 group-hover:text-gray-900",
                  )}
                >
                  {date.getDate()}
                </span>
                {isClickable && dayEvents.length === 0 && (
                  <span className="hidden text-[10px] text-gray-300 group-hover:block">+</span>
                )}
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <EventBadge
                    key={ev.id}
                    type={ev.type}
                    title={ev.title}
                    className={cn(
                      "w-full",
                      onEventClick && "cursor-pointer hover:opacity-80",
                    )}
                    onClick={
                      onEventClick
                        ? (e) => {
                            e.stopPropagation();
                            onEventClick(ev);
                          }
                        : undefined
                    }
                  />
                ))}
                {dayEvents.length > 3 && (
                  <span className="block px-1.5 text-[10px] font-medium text-gray-400">
                    +{dayEvents.length - 3} autre{dayEvents.length - 3 > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
