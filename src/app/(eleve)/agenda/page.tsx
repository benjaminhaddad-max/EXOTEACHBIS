import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { Calendar, Clock, MapPin, Video, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EVENT_TYPE_STYLES: Record<string, string> = {
  cours: "bg-blue-100 text-blue-700 border-blue-200",
  examen: "bg-red-100 text-red-700 border-red-200",
  reunion: "bg-purple-100 text-purple-700 border-purple-200",
  autre: "bg-gray-100 text-gray-600 border-gray-200",
};
const EVENT_TYPE_LABELS: Record<string, string> = {
  cours: "Cours",
  examen: "Examen",
  reunion: "Réunion",
  autre: "Autre",
};
const EVENT_LEFT_COLORS: Record<string, string> = {
  cours: "bg-blue-500",
  examen: "bg-red-500",
  reunion: "bg-purple-500",
  autre: "bg-gray-400",
};

export default async function AgendaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("groupe_id")
    .eq("id", user!.id)
    .single();

  // Fetch upcoming events: global (no groupe) + user's groupe
  let query = supabase
    .from("events")
    .select("*")
    .gte("end_at", new Date().toISOString())
    .order("start_at");

  const { data: events } = profile?.groupe_id
    ? await supabase
        .from("events")
        .select("*")
        .gte("end_at", new Date().toISOString())
        .or(`groupe_id.is.null,groupe_id.eq.${profile.groupe_id}`)
        .order("start_at")
        .limit(50)
    : await query.is("groupe_id", null).limit(50);

  // Group by week
  const grouped = new Map<string, typeof events>();
  for (const event of (events ?? [])) {
    const date = new Date(event.start_at);
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(event);
  }

  const weeks = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));

  const formatWeek = (mondayStr: string) => {
    const monday = new Date(mondayStr);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return `${monday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${friday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  };

  return (
    <div>
      <Header title="Agenda" />

      {events?.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-navy/30" />
          <h3 className="mt-4 text-lg font-semibold text-navy">Aucun événement à venir</h3>
          <p className="mt-2 text-sm text-gray-500">Les événements à venir apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {weeks.map(([mondayStr, weekEvents]) => (
            <section key={mondayStr}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Semaine du {formatWeek(mondayStr)}
              </h2>
              <div className="space-y-2">
                {(weekEvents ?? []).map((event: any) => {
                  const start = new Date(event.start_at);
                  const end = new Date(event.end_at);
                  const isSameDay = start.toDateString() === end.toDateString();
                  return (
                    <div
                      key={event.id}
                      className="flex gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 hover:shadow-md transition-shadow"
                    >
                      {/* Date column */}
                      <div className="shrink-0 w-12 text-center">
                        <p className="text-xs text-gray-400 uppercase">
                          {start.toLocaleDateString("fr-FR", { weekday: "short" })}
                        </p>
                        <p className="text-xl font-bold text-navy">{start.getDate()}</p>
                        <p className="text-xs text-gray-400">
                          {start.toLocaleDateString("fr-FR", { month: "short" })}
                        </p>
                      </div>

                      {/* Left border color */}
                      <div className={cn("w-1 rounded-full shrink-0", EVENT_LEFT_COLORS[event.type] ?? "bg-gray-400")} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900">{event.title}</h3>
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium shrink-0", EVENT_TYPE_STYLES[event.type])}>
                            {EVENT_TYPE_LABELS[event.type]}
                          </span>
                        </div>

                        {event.description && (
                          <p className="text-xs text-gray-500 mt-1">{event.description}</p>
                        )}

                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            {" – "}
                            {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            {!isSameDay && ` (${end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })})`}
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </span>
                          )}
                          {event.zoom_link && (
                            <a
                              href={event.zoom_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-500 hover:underline"
                            >
                              <Video className="h-3 w-3" />
                              Rejoindre
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
