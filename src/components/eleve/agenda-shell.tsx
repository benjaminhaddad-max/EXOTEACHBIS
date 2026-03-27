"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Video,
  X,
  CalendarDays,
  Plus,
  Trash2,
  Check,
  BookOpen,
  RefreshCw,
  ListChecks,
  FileText,
  GraduationCap,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import type {
  CalendarEvent,
  StudentEvent,
  RevisionType,
} from "@/types/database";
import { REVISION_TYPE_META } from "@/types/database";
import {
  createStudentEvent,
  updateStudentEvent,
  deleteStudentEvent,
  toggleStudentEventCompleted,
} from "@/app/(eleve)/agenda/actions";

/* ─────────────────────────────── Types ─────────────────────────────── */

type MinMatiere = { id: string; name: string; color: string; dossier_id: string };
type MinCours = { id: string; name: string; matiere_id: string | null; dossier_id: string | null };

type ViewMode = "week" | "month";

type UnifiedEvent =
  | { kind: "admin"; data: CalendarEvent }
  | { kind: "student"; data: StudentEvent };

type Modal =
  | { type: "create"; prefill?: { date: Date; hour: number } }
  | { type: "edit"; event: StudentEvent }
  | { type: "view-admin"; event: CalendarEvent }
  | { type: "view-student"; event: StudentEvent }
  | null;

type Toast = { message: string; ok: boolean } | null;

/* ────────────────────────────── Constants ────────────────────────────── */

const HOUR_START = 7;
const HOUR_END = 22;
const HOUR_HEIGHT = 56;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START);

const ADMIN_COLORS: Record<string, { block: string; dot: string; badge: string }> = {
  cours:   { block: "bg-blue-500/90 border-l-blue-600",   dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-700 border-blue-200" },
  examen:  { block: "bg-red-500/90 border-l-red-600",     dot: "bg-red-500",    badge: "bg-red-100 text-red-700 border-red-200" },
  reunion: { block: "bg-purple-500/90 border-l-purple-600", dot: "bg-purple-500", badge: "bg-purple-100 text-purple-700 border-purple-200" },
  autre:   { block: "bg-gray-500/80 border-l-gray-600",   dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-600 border-gray-200" },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  cours: "Cours", examen: "Examen", reunion: "Réunion", autre: "Autre",
};

const DAY_NAMES_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_NAMES_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const REVISION_ICON_MAP: Record<string, typeof BookOpen> = {
  BookOpen, RefreshCw, ListChecks, FileText, GraduationCap,
  FileStack: FileText,
};

/* ─────────────────────────────── Helpers ─────────────────────────────── */

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(ws: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
}

function getMonthDays(y: number, m: number): (Date | null)[] {
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const off = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const cells: (Date | null)[] = Array(off).fill(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(d: Date) { return isSameDay(d, new Date()); }

function eventsForDay(unified: UnifiedEvent[], day: Date): UnifiedEvent[] {
  return unified.filter((u) => {
    const s = u.kind === "admin" ? u.data.start_at : u.data.start_at;
    return isSameDay(new Date(s), day);
  });
}

function fmt(date: Date, hour: number, minute = 0): string {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 16);
}

function revisionColor(rt: RevisionType): string {
  return REVISION_TYPE_META[rt]?.color ?? "#6B7280";
}

function needsCours(rt: RevisionType): boolean {
  return rt === "apprentissage_fiche" || rt === "revision_fiche" || rt === "annales_chapitre";
}

/* ══════════════════════════════════════════════════════════════════════ */
/*                          MAIN SHELL                                  */
/* ══════════════════════════════════════════════════════════════════════ */

export function AgendaShell({
  adminEvents: initialAdminEvents,
  studentEvents: initialStudentEvents,
  matieres,
  cours,
}: {
  adminEvents: CalendarEvent[];
  studentEvents: StudentEvent[];
  matieres: MinMatiere[];
  cours: MinCours[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const [stuEvents, setStuEvents] = useState<StudentEvent[]>(initialStudentEvents);

  const showToast = useCallback((message: string, ok: boolean) => {
    setToast({ message, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshStudentEvents = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase
      .from("student_events")
      .select("*, matiere:matieres(id, name, color), cours:cours(id, name)")
      .order("start_at");
    if (data) setStuEvents(data as StudentEvent[]);
  }, []);

  const unified: UnifiedEvent[] = useMemo(() => {
    const a: UnifiedEvent[] = initialAdminEvents.map((e) => ({ kind: "admin" as const, data: e }));
    const s: UnifiedEvent[] = stuEvents.map((e) => ({ kind: "student" as const, data: e }));
    return [...a, ...s].sort((x, y) => {
      const xs = x.kind === "admin" ? x.data.start_at : x.data.start_at;
      const ys = y.kind === "admin" ? y.data.start_at : y.data.start_at;
      return xs.localeCompare(ys);
    });
  }, [initialAdminEvents, stuEvents]);

  const weekStart = getWeekStart(currentDate);
  const weekDays = getWeekDays(weekStart);
  const monthDays = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate);
    if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const navTitle = viewMode === "week"
    ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTH_NAMES[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
    : `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const todayUnified = useMemo(() => eventsForDay(unified, new Date()), [unified]);

  /* ── Handlers ── */
  const handleDelete = (id: string) => {
    if (!confirm("Supprimer cette session de révision ?")) return;
    startTransition(async () => {
      const res = await deleteStudentEvent(id);
      if ("error" in res && res.error) { showToast(res.error, false); return; }
      setStuEvents((p) => p.filter((e) => e.id !== id));
      setModal(null);
      showToast("Session supprimée", true);
    });
  };

  const handleToggleComplete = (id: string, cur: boolean) => {
    startTransition(async () => {
      const res = await toggleStudentEventCompleted(id, !cur);
      if ("error" in res && res.error) { showToast(res.error, false); return; }
      setStuEvents((p) => p.map((e) => (e.id === id ? { ...e, completed: !cur } : e)));
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Agenda de révision</h1>
          <div className="mt-1.5 h-0.5 w-10 rounded-full bg-gold" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={goToday} className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            Aujourd&apos;hui
          </button>
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"><ChevronLeft size={18} /></button>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"><ChevronRight size={18} /></button>
          <span className="text-sm font-semibold text-navy ml-1">{navTitle}</span>

          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs ml-3">
            <button onClick={() => setViewMode("week")} className={`px-3 py-1.5 font-medium transition-colors ${viewMode === "week" ? "bg-navy text-white" : "text-gray-500 hover:bg-gray-50"}`}>Semaine</button>
            <button onClick={() => setViewMode("month")} className={`px-3 py-1.5 font-medium transition-colors ${viewMode === "month" ? "bg-navy text-white" : "text-gray-500 hover:bg-gray-50"}`}>Mois</button>
          </div>

          <button
            onClick={() => setModal({ type: "create" })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-navy text-xs font-bold rounded-lg hover:bg-gold/80 transition-colors ml-2 shadow-sm"
          >
            <Plus size={14} /> Nouvelle session
          </button>
        </div>
      </div>

      {/* ── Today strip ── */}
      {todayUnified.length > 0 && viewMode === "week" && (
        <div className="mb-3 flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-gold/10 to-gold/5 rounded-xl border border-gold/20 overflow-x-auto">
          <CalendarDays size={16} className="text-gold shrink-0" />
          <span className="text-xs font-semibold text-navy shrink-0">Aujourd&apos;hui :</span>
          <div className="flex gap-2">
            {todayUnified.map((u) => {
              if (u.kind === "admin") {
                const c = ADMIN_COLORS[u.data.type] ?? ADMIN_COLORS.autre;
                return (
                  <button key={u.data.id} onClick={() => setModal({ type: "view-admin", event: u.data })}
                    className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.badge} hover:brightness-95 transition-all`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                    {new Date(u.data.start_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} {u.data.title}
                  </button>
                );
              }
              const col = revisionColor(u.data.revision_type);
              return (
                <button key={u.data.id} onClick={() => setModal({ type: "view-student", event: u.data })}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border hover:brightness-95 transition-all"
                  style={{ backgroundColor: col + "18", color: col, borderColor: col + "40" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col }} />
                  {new Date(u.data.start_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} {u.data.title}
                  {u.data.completed && <CheckCircle2 size={11} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Calendar ── */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {viewMode === "week" ? (
          <WeekView days={weekDays} unified={unified}
            onCellClick={(date, hour) => setModal({ type: "create", prefill: { date, hour } })}
            onAdminClick={(e) => setModal({ type: "view-admin", event: e })}
            onStudentClick={(e) => setModal({ type: "view-student", event: e })}
          />
        ) : (
          <MonthView cells={monthDays} unified={unified}
            onAdminClick={(e) => setModal({ type: "view-admin", event: e })}
            onStudentClick={(e) => setModal({ type: "view-student", event: e })}
            onDayClick={(d) => { setCurrentDate(d); setViewMode("week"); }}
          />
        )}
      </div>

      {/* ── Legend ── */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1">
        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mr-1">Légende :</span>
        {Object.entries(ADMIN_COLORS).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className={`w-2 h-2 rounded-full ${v.dot}`} />
            {EVENT_TYPE_LABELS[k]}
          </span>
        ))}
        <span className="w-px h-3 bg-gray-200 mx-1" />
        {Object.entries(REVISION_TYPE_META).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: v.color }} />
            {v.label}
          </span>
        ))}
      </div>

      {/* ── Modals ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {modal.type === "view-admin" && (
              <AdminEventDetail event={modal.event} onClose={() => setModal(null)} />
            )}
            {modal.type === "view-student" && (
              <StudentEventDetail
                event={modal.event}
                onClose={() => setModal(null)}
                onEdit={() => setModal({ type: "edit", event: modal.event })}
                onDelete={() => handleDelete(modal.event.id)}
                onToggleComplete={() => handleToggleComplete(modal.event.id, modal.event.completed)}
                isPending={isPending}
              />
            )}
            {(modal.type === "create" || modal.type === "edit") && (
              <RevisionForm
                event={modal.type === "edit" ? modal.event : undefined}
                prefill={modal.type === "create" ? modal.prefill : undefined}
                matieres={matieres}
                cours={cours}
                isPending={isPending}
                onSubmit={(data) => {
                  startTransition(async () => {
                    if (modal.type === "edit") {
                      const res = await updateStudentEvent(modal.event.id, data);
                      if ("error" in res && res.error) { showToast(res.error, false); return; }
                      showToast("Session modifiée", true);
                    } else {
                      const res = await createStudentEvent(data as any);
                      if ("error" in res && res.error) { showToast(res.error, false); return; }
                      showToast("Session créée", true);
                    }
                    setModal(null);
                    await refreshStudentEvents();
                  });
                }}
                onClose={() => setModal(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════ Week View ═══════════════════════════════ */

function WeekView({
  days, unified, onCellClick, onAdminClick, onStudentClick,
}: {
  days: Date[];
  unified: UnifiedEvent[];
  onCellClick: (date: Date, hour: number) => void;
  onAdminClick: (e: CalendarEvent) => void;
  onStudentClick: (e: StudentEvent) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="grid shrink-0 border-b border-gray-200" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
        <div className="border-r border-gray-100" />
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div key={day.toISOString()} className="py-2.5 text-center border-r border-gray-100 last:border-r-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{DAY_NAMES_SHORT[day.getDay()]}</p>
              <div className={`mx-auto mt-0.5 h-7 w-7 flex items-center justify-center rounded-full text-sm font-bold ${today ? "bg-navy text-white" : "text-gray-700"}`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="relative" style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", minHeight: HOURS.length * HOUR_HEIGHT }}>
          <div className="border-r border-gray-100">
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="flex items-start justify-end pr-2 pt-1 border-b border-gray-50">
                <span className="text-[10px] text-gray-300 font-medium">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayUnified = eventsForDay(unified, day);
            const currentDay = isToday(day);
            return (
              <div key={day.toISOString()} className={`relative border-r border-gray-100 last:border-r-0 ${currentDay ? "bg-blue-50/30" : ""}`} style={{ height: HOURS.length * HOUR_HEIGHT }}>
                {HOURS.map((h) => (
                  <div key={h} style={{ top: (h - HOUR_START) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    className="absolute inset-x-0 border-b border-gray-50 cursor-pointer hover:bg-gray-50/60 transition-colors group"
                    onClick={() => onCellClick(day, h)}>
                    <Plus size={10} className="absolute top-1 right-1 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}

                {currentDay && <NowIndicator />}

                {dayUnified.map((u) => {
                  const start = new Date(u.kind === "admin" ? u.data.start_at : u.data.start_at);
                  const end = new Date(u.kind === "admin" ? u.data.end_at : u.data.end_at);
                  const startMins = (start.getHours() - HOUR_START) * 60 + start.getMinutes();
                  const durationMins = Math.max((end.getTime() - start.getTime()) / 60000, 30);
                  const top = Math.max(startMins * (HOUR_HEIGHT / 60), 0);
                  const height = Math.max(durationMins * (HOUR_HEIGHT / 60), 22);

                  if (u.kind === "admin") {
                    const bc = ADMIN_COLORS[u.data.type]?.block ?? ADMIN_COLORS.autre.block;
                    return (
                      <div key={u.data.id}
                        className={`absolute left-0.5 right-0.5 rounded-lg px-2 py-1 cursor-pointer overflow-hidden border-l-[3px] ${bc} text-white shadow-sm hover:shadow-md hover:brightness-110 transition-all z-10`}
                        style={{ top, height }}
                        onClick={(e) => { e.stopPropagation(); onAdminClick(u.data); }}>
                        <p className="text-[11px] font-semibold leading-tight truncate">{u.data.title}</p>
                        {height > 34 && <p className="text-[10px] text-white/80 mt-0.5">{start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>}
                      </div>
                    );
                  }

                  const col = revisionColor(u.data.revision_type);
                  return (
                    <div key={u.data.id}
                      className={`absolute left-0.5 right-0.5 rounded-lg px-2 py-1 cursor-pointer overflow-hidden border-l-[3px] shadow-sm hover:shadow-md transition-all z-10 ${u.data.completed ? "opacity-60" : ""}`}
                      style={{ top, height, backgroundColor: col + "E6", borderLeftColor: col, color: "#fff" }}
                      onClick={(e) => { e.stopPropagation(); onStudentClick(u.data); }}>
                      <div className="flex items-center gap-1">
                        {u.data.completed && <CheckCircle2 size={10} />}
                        <p className="text-[11px] font-semibold leading-tight truncate">{u.data.title}</p>
                      </div>
                      {height > 34 && <p className="text-[10px] text-white/80 mt-0.5">{start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>}
                      {height > 52 && u.data.matiere && <p className="text-[9px] text-white/70 mt-0.5 truncate">{(u.data.matiere as any).name}</p>}
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

/* ──────────────────────── Now Indicator ──────────────────────── */

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

/* ═══════════════════════════ Month View ════════════════════════════ */

function MonthView({
  cells, unified, onAdminClick, onStudentClick, onDayClick,
}: {
  cells: (Date | null)[];
  unified: UnifiedEvent[];
  onAdminClick: (e: CalendarEvent) => void;
  onStudentClick: (e: StudentEvent) => void;
  onDayClick: (d: Date) => void;
}) {
  const wks = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 shrink-0 border-b border-gray-200">
        {wks.map((w) => (
          <div key={w} className="py-2.5 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100 last:border-r-0">{w}</div>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 h-full" style={{ gridTemplateRows: `repeat(${cells.length / 7}, 1fr)` }}>
          {cells.map((day, i) => {
            const dayU = day ? eventsForDay(unified, day) : [];
            const today = day ? isToday(day) : false;
            return (
              <div key={i} className={`border-r border-b border-gray-100 min-h-[100px] p-1.5 cursor-pointer transition-colors ${day ? "hover:bg-gray-50" : "bg-gray-50/50"}`}
                onClick={() => day && onDayClick(day)}>
                {day && (
                  <>
                    <div className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${today ? "bg-navy text-white" : "text-gray-500"}`}>{day.getDate()}</div>
                    <div className="space-y-0.5">
                      {dayU.slice(0, 3).map((u) => {
                        if (u.kind === "admin") {
                          const c = ADMIN_COLORS[u.data.type] ?? ADMIN_COLORS.autre;
                          return (
                            <div key={u.data.id} onClick={(e) => { e.stopPropagation(); onAdminClick(u.data); }}
                              className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md truncate cursor-pointer hover:brightness-95 bg-blue-50 text-blue-700`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                              <span className="truncate">{new Date(u.data.start_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} {u.data.title}</span>
                            </div>
                          );
                        }
                        const col = revisionColor(u.data.revision_type);
                        return (
                          <div key={u.data.id} onClick={(e) => { e.stopPropagation(); onStudentClick(u.data); }}
                            className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md truncate cursor-pointer hover:brightness-95"
                            style={{ backgroundColor: col + "18", color: col }}>
                            <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ backgroundColor: col }} />
                            <span className="truncate">{new Date(u.data.start_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} {u.data.title}</span>
                          </div>
                        );
                      })}
                      {dayU.length > 3 && <p className="text-[10px] text-gray-400 pl-1 font-medium">+{dayU.length - 3}</p>}
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

/* ═══════════════════════ Admin Event Detail ══════════════════════ */

function AdminEventDetail({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const c = ADMIN_COLORS[event.type] ?? ADMIN_COLORS.autre;
  return (
    <div>
      <div className={`h-1.5 ${c.dot}`} />
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium mb-2 ${c.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
              {EVENT_TYPE_LABELS[event.type] ?? "Autre"}
            </span>
            <h2 className="text-lg font-bold text-gray-900">{event.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <DetailRow icon={<Clock size={15} className="text-gray-400" />}>
            <p className="font-medium text-gray-900">{DAY_NAMES_FULL[start.getDay()]} {start.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p className="text-gray-500">{start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
          </DetailRow>
          {event.location && <DetailRow icon={<MapPin size={15} className="text-gray-400" />}><span>{event.location}</span></DetailRow>}
          {event.zoom_link && (
            <DetailRow icon={<Video size={15} className="text-blue-500" />}>
              <a href={event.zoom_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium hover:underline">Rejoindre la visio</a>
            </DetailRow>
          )}
        </div>
        {event.description && <div className="pt-3 border-t border-gray-100"><p className="text-sm text-gray-600 leading-relaxed">{event.description}</p></div>}
      </div>
    </div>
  );
}

/* ═══════════════════ Student Event Detail ══════════════════════ */

function StudentEventDetail({
  event, onClose, onEdit, onDelete, onToggleComplete, isPending,
}: {
  event: StudentEvent; onClose: () => void; onEdit: () => void; onDelete: () => void; onToggleComplete: () => void; isPending: boolean;
}) {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const meta = REVISION_TYPE_META[event.revision_type];
  const col = meta?.color ?? "#6B7280";
  const matName = (event.matiere as any)?.name;
  const coursName = (event.cours as any)?.name;

  return (
    <div>
      <div className="h-1.5 rounded-t-2xl" style={{ backgroundColor: col }} />
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border font-medium mb-2"
              style={{ backgroundColor: col + "18", color: col, borderColor: col + "40" }}>
              {meta?.label}
            </span>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {event.completed && <CheckCircle2 size={18} className="text-green-500" />}
              {event.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors" title="Modifier">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Supprimer"><Trash2 size={16} /></button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X size={18} /></button>
          </div>
        </div>

        <div className="space-y-3">
          <DetailRow icon={<Clock size={15} className="text-gray-400" />}>
            <p className="font-medium text-gray-900">{DAY_NAMES_FULL[start.getDay()]} {start.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p className="text-gray-500">{start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
          </DetailRow>
          {matName && (
            <DetailRow icon={<BookOpen size={15} className="text-gray-400" />}>
              <span className="font-medium text-gray-900">{matName}</span>
              {coursName && <span className="text-gray-500 text-xs ml-1">› {coursName}</span>}
            </DetailRow>
          )}
        </div>

        {event.notes && <div className="pt-3 border-t border-gray-100"><p className="text-sm text-gray-600 leading-relaxed">{event.notes}</p></div>}

        <button
          onClick={onToggleComplete}
          disabled={isPending}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${event.completed ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "text-white hover:brightness-110"}`}
          style={event.completed ? {} : { backgroundColor: col }}
        >
          {isPending ? <Loader2 size={15} className="animate-spin" /> : event.completed ? <Circle size={15} /> : <CheckCircle2 size={15} />}
          {event.completed ? "Marquer non terminée" : "Marquer terminée ✓"}
        </button>
      </div>
    </div>
  );
}

function DetailRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm text-gray-600">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

/* ════════════════════════ Revision Form ═══════════════════════ */

function RevisionForm({
  event, prefill, matieres, cours, isPending, onSubmit, onClose,
}: {
  event?: StudentEvent;
  prefill?: { date: Date; hour: number };
  matieres: MinMatiere[];
  cours: MinCours[];
  isPending: boolean;
  onSubmit: (data: any) => void;
  onClose: () => void;
}) {
  const [revType, setRevType] = useState<RevisionType>(event?.revision_type ?? "apprentissage_fiche");
  const [matiereId, setMatiereId] = useState<string>(event?.matiere_id ?? "");
  const [coursId, setCoursId] = useState<string>(event?.cours_id ?? "");
  const [startAt, setStartAt] = useState(
    prefill ? fmt(prefill.date, prefill.hour) : event ? new Date(event.start_at).toISOString().slice(0, 16) : "",
  );
  const [endAt, setEndAt] = useState(
    prefill ? fmt(prefill.date, prefill.hour + 1) : event ? new Date(event.end_at).toISOString().slice(0, 16) : "",
  );
  const [notes, setNotes] = useState(event?.notes ?? "");

  const filteredCours = useMemo(
    () => (matiereId ? cours.filter((c) => c.matiere_id === matiereId) : []),
    [matiereId, cours],
  );

  const showCours = needsCours(revType);

  const autoTitle = useMemo(() => {
    const meta = REVISION_TYPE_META[revType];
    const mat = matieres.find((m) => m.id === matiereId);
    const co = cours.find((c) => c.id === coursId);
    let t = meta.label;
    if (mat) t += ` — ${mat.name}`;
    if (co && showCours) t += ` › ${co.name}`;
    return t;
  }, [revType, matiereId, coursId, matieres, cours, showCours]);

  const handleSubmit = () => {
    const col = REVISION_TYPE_META[revType]?.color;
    onSubmit({
      title: autoTitle,
      revision_type: revType,
      matiere_id: matiereId || null,
      cours_id: (showCours && coursId) ? coursId : null,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      notes: notes.trim() || null,
      color: col || null,
    });
  };

  const field = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">{event ? "Modifier la session" : "Nouvelle session de révision"}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
      </div>

      {/* Type de révision */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-2 block">Type de session</label>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.entries(REVISION_TYPE_META) as [RevisionType, typeof REVISION_TYPE_META[RevisionType]][]).map(([key, meta]) => {
            const Icon = REVISION_ICON_MAP[meta.icon] ?? BookOpen;
            const active = revType === key;
            return (
              <button key={key} type="button" onClick={() => { setRevType(key); setCoursId(""); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-medium border transition-all ${active ? "border-2 shadow-sm" : "border-gray-200 hover:border-gray-300 text-gray-600"}`}
                style={active ? { borderColor: meta.color, backgroundColor: meta.color + "10", color: meta.color } : {}}>
                <Icon size={14} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Matière */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Matière</label>
        <select value={matiereId} onChange={(e) => { setMatiereId(e.target.value); setCoursId(""); }} className={field}>
          <option value="">— Choisir une matière —</option>
          {matieres.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Cours (chapitre) */}
      {showCours && matiereId && (
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Chapitre (cours)</label>
          <select value={coursId} onChange={(e) => setCoursId(e.target.value)} className={field}>
            <option value="">— Choisir un chapitre —</option>
            {filteredCours.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Auto-generated title preview */}
      <div className="px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Titre auto-généré</p>
        <p className="text-sm font-medium text-gray-700">{autoTitle}</p>
      </div>

      {/* Date/Heure */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Début</label>
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={field} />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Fin</label>
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={field} />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Notes (optionnel)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${field} resize-none`} placeholder="Objectifs, pages à revoir..." />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Annuler</button>
        <button
          onClick={handleSubmit}
          disabled={isPending || !startAt || !endAt}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-navy text-sm font-bold rounded-lg hover:bg-gold/80 disabled:opacity-50 transition-all shadow-sm"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {event ? "Enregistrer" : "Créer la session"}
        </button>
      </div>
    </div>
  );
}
