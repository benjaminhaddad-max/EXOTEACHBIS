"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Header } from "@/components/header";
import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { EventModal, type EventFormData } from "@/components/calendar/event-modal";
import { EVENT_COLORS, EVENT_LABELS } from "@/components/calendar/event-badge";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent, EventType } from "@/types/database";

const EVENT_TYPES: EventType[] = ["cours", "examen", "reunion", "revision", "autre"];

export default function PlanningPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();

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
      .channel("events-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => { fetchEvents(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchEvents, supabase]);

  // Open modal on day click (create)
  const handleDayClick = (date: string) => {
    setSelectedEvent(null);
    setSelectedDate(date);
    setModalOpen(true);
  };

  // Open modal on event click (edit)
  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setSelectedDate(undefined);
    setModalOpen(true);
  };

  // Save (create or update)
  const handleSave = async (data: EventFormData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Non authentifié");

    const payload = {
      title: data.title.trim(),
      start_at: new Date(data.start_at).toISOString(),
      end_at: new Date(data.end_at).toISOString(),
      type: data.type,
      location: data.location.trim() || null,
      description: data.description.trim() || null,
      created_by: user.id,
    };

    if (selectedEvent) {
      // Update
      const { error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", selectedEvent.id);
      if (error) throw new Error(error.message);
    } else {
      // Create
      const { error } = await supabase.from("events").insert(payload);
      if (error) throw new Error(error.message);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) throw new Error(error.message);
  };

  return (
    <div>
      <Header
        title="Planning"
        breadcrumb={[{ label: "Admin" }, { label: "Planning" }]}
      />

      {/* Legend + New event button */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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

        <button
          onClick={() => { setSelectedEvent(null); setSelectedDate(undefined); setModalOpen(true); }}
          className="flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-light"
        >
          <Plus className="h-4 w-4" />
          Nouvel événement
        </button>
      </div>

      {/* Calendar */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy border-t-transparent" />
        </div>
      ) : (
        <CalendarGrid
          events={events}
          onDayClick={handleDayClick}
          onEventClick={handleEventClick}
        />
      )}

      {/* Modal */}
      {modalOpen && (
        <EventModal
          event={selectedEvent}
          defaultDate={selectedDate}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

