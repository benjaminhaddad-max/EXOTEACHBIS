"use client";

import { useState, useEffect } from "react";
import { X, Calendar, Clock, MapPin, AlignLeft, Tag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVENT_COLORS, EVENT_LABELS } from "./event-badge";
import type { CalendarEvent, EventType } from "@/types/database";

const EVENT_TYPES: EventType[] = ["cours", "examen", "reunion", "revision", "autre"];

export interface EventFormData {
  title: string;
  start_at: string;
  end_at: string;
  type: EventType;
  location: string;
  description: string;
}

interface EventModalProps {
  /** null = create mode, CalendarEvent = edit mode */
  event: CalendarEvent | null;
  /** Pre-filled date when clicking on a calendar cell */
  defaultDate?: string;
  onClose: () => void;
  onSave?: (data: EventFormData) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  readOnly?: boolean;
}

function toLocalDatetimeValue(iso: string): string {
  // Convert ISO string to datetime-local input value (YYYY-MM-DDTHH:mm)
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStartFor(date: string): string {
  return `${date}T08:00`;
}

function defaultEndFor(date: string): string {
  return `${date}T09:00`;
}

export function EventModal({
  event,
  defaultDate,
  onClose,
  onSave,
  onDelete,
  readOnly = false,
}: EventModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const baseDate = defaultDate ?? today;

  const [form, setForm] = useState<EventFormData>({
    title: event?.title ?? "",
    start_at: event ? toLocalDatetimeValue(event.start_at) : defaultStartFor(baseDate),
    end_at: event ? toLocalDatetimeValue(event.end_at) : defaultEndFor(baseDate),
    type: event?.type ?? "cours",
    location: event?.location ?? "",
    description: event?.description ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync form when event prop changes (e.g. opening a different event)
  useEffect(() => {
    setForm({
      title: event?.title ?? "",
      start_at: event ? toLocalDatetimeValue(event.start_at) : defaultStartFor(baseDate),
      end_at: event ? toLocalDatetimeValue(event.end_at) : defaultEndFor(baseDate),
      type: event?.type ?? "cours",
      location: event?.location ?? "",
      description: event?.description ?? "",
    });
    setError(null);
  }, [event, defaultDate, baseDate]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSave) return;
    if (!form.title.trim()) { setError("Le titre est requis."); return; }
    if (form.end_at <= form.start_at) { setError("La date de fin doit être après la date de début."); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !onDelete) return;
    if (!confirm("Supprimer cet événement ?")) return;
    setDeleting(true);
    try {
      await onDelete(event.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression.");
    } finally {
      setDeleting(false);
    }
  };

  const typeColors = EVENT_COLORS[form.type];

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl bg-navy px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {readOnly ? "Détail de l'événement" : event ? "Modifier l'événement" : "Nouvel événement"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="space-y-4 p-6">
          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Titre <span className="text-red-500">*</span>
            </label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              disabled={readOnly}
              placeholder="Nom de l'événement"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                <Calendar className="h-3.5 w-3.5" />
                Début
              </label>
              <input
                type="datetime-local"
                name="start_at"
                value={form.start_at}
                onChange={handleChange}
                disabled={readOnly}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                <Clock className="h-3.5 w-3.5" />
                Fin
              </label>
              <input
                type="datetime-local"
                name="end_at"
                value={form.end_at}
                onChange={handleChange}
                disabled={readOnly}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
              <Tag className="h-3.5 w-3.5" />
              Catégorie
            </label>
            {readOnly ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
                  typeColors.bg,
                  typeColors.text,
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", typeColors.dot)} />
                {EVENT_LABELS[form.type]}
              </span>
            ) : (
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_LABELS[t]}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Location */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
              <MapPin className="h-3.5 w-3.5" />
              Lieu
            </label>
            <input
              name="location"
              value={form.location}
              onChange={handleChange}
              disabled={readOnly}
              placeholder="Salle, lien Zoom…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
              <AlignLeft className="h-3.5 w-3.5" />
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              disabled={readOnly}
              rows={3}
              placeholder="Détails supplémentaires…"
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            {!readOnly && event && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Supprimer
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                {readOnly ? "Fermer" : "Annuler"}
              </button>
              {!readOnly && (
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Enregistrer
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
