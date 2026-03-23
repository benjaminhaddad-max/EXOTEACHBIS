"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/header";
import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { EventModal } from "@/components/calendar/event-modal";
import { EVENT_COLORS, EVENT_LABELS } from "@/components/calendar/event-badge";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent, EventType } from "@/types/database";

const EVENT_TYPES: EventType[] = ["cours", "examen", "reunion", "revision", "autre"];

export default function AgendaPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state (read-only)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const supabase = createClient();

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("start_at", { ascending: true });
    if (!error && data) setEvents(data as CalendarEvent[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchEvents();

    // Real-time subscription
    const channel = supabase
      .channel("events-eleve")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => { fetchEvents(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchEvents, supabase]);

  return (
    <div>
      <Header
        title="Agenda"
        breadcrumb={[{ label: "Agenda" }]}
      />

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {EVENT_TYPES.map((t) => {
          const c = EVENT_COLORS[t];
          return (
            <span
              key={t}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
              {EVENT_LABELS[t]}
            </span>
          );
        })}
      </div>

      {/* Calendar (read-only: no day click, event click opens detail modal) */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy border-t-transparent" />
        </div>
      ) : (
        <CalendarGrid
          events={events}
          onEventClick={(ev) => setSelectedEvent(ev)}
          readOnly
        />
      )}

      {/* Read-only detail modal */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          readOnly
        />
      )}
    </div>
  );
}

