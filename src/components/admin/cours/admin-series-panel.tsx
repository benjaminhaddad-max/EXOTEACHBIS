"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardList, Plus, Play, Pencil, Trash2, Clock, X, Loader2, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface SerieItem {
  id: string;
  name: string;
  type: string;
  timed: boolean;
  nb_questions: number;
}

interface AdminSeriesPanelProps {
  coursId: string;
  series: SerieItem[];
}

const typeLabel: Record<string, string> = {
  entrainement: "QCM d'entraînement",
  concours_blanc: "Concours blanc",
  revision: "Révision",
};

const typeColor: Record<string, string> = {
  entrainement: "bg-blue-100 text-blue-700",
  concours_blanc: "bg-orange-100 text-orange-700",
  revision: "bg-green-100 text-green-700",
};

export function AdminSeriesPanel({ coursId, series: initialSeries }: AdminSeriesPanelProps) {
  const [series, setSeries] = useState(initialSeries);
  const [showForm, setShowForm] = useState(false);
  const [serieName, setSerieName] = useState("");
  const [serieType, setSerieType] = useState("entrainement");
  const [serieTimed, setSerieTimed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = () => {
    if (!serieName.trim()) return;
    startTransition(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("series").insert({
        cours_id: coursId,
        name: serieName.trim(),
        type: serieType,
        timed: serieTimed,
        visible: true,
        score_definitif: false,
        duration_minutes: serieTimed ? 30 : null,
        order_index: series.length,
      }).select("id, name, type, timed").single();

      if (error) { showToast(error.message, false); return; }
      setSeries((prev) => [...prev, { ...data, nb_questions: 0 }]);
      setSerieName("");
      setShowForm(false);
      showToast("Série créée", true);
    });
  };

  const handleDelete = (serieId: string) => {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("series").delete().eq("id", serieId);
      if (error) { showToast(error.message, false); return; }
      setSeries((prev) => prev.filter((s) => s.id !== serieId));
      showToast("Série supprimée", true);
    });
  };

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-navy px-4 py-3">
          <ClipboardList className="h-4 w-4 text-gold" />
          <h3 className="text-sm font-semibold text-white">Séries d'exercices</h3>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="ml-auto flex items-center gap-1 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/30 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>

        {/* Formulaire création série */}
        {showForm && (
          <div className="border-b border-gray-100 bg-gray-50 p-4 space-y-3">
            <input
              value={serieName}
              onChange={(e) => setSerieName(e.target.value)}
              placeholder="Nom de la série..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-navy focus:outline-none"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="grid grid-cols-3 gap-2">
              {(["entrainement", "concours_blanc", "revision"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSerieType(t)}
                  className={`rounded-lg border-2 py-1.5 text-xs font-medium transition ${serieType === t ? "border-navy bg-navy/5 text-navy" : "border-gray-200 text-gray-500"}`}
                >
                  {typeLabel[t]}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={serieTimed} onChange={(e) => setSerieTimed(e.target.checked)} className="rounded" />
              Chronométré
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending || !serieName.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-navy py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Créer la série
              </button>
            </div>
          </div>
        )}

        {/* Liste des séries */}
        {series.length === 0 && !showForm ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">Aucune série pour l'instant</p>
            <button onClick={() => setShowForm(true)} className="mt-2 text-xs text-navy hover:underline">
              + Créer la première série
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {series.map((serie) => (
              <div key={serie.id} className="group flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{serie.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeColor[serie.type] ?? "bg-gray-100 text-gray-600"}`}>
                      {typeLabel[serie.type] ?? serie.type}
                    </span>
                    {serie.timed && (
                      <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                        <Clock className="h-3 w-3" />
                        Chronométré
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">{serie.nb_questions} question{serie.nb_questions !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <Link
                    href={`/admin/exercices?serie=${serie.id}`}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                    title="Gérer les questions"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={() => handleDelete(serie.id)}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Link
                  href={`/serie/${serie.id}`}
                  className="flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  <Play className="h-3 w-3" />
                  Tester
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </>
  );
}
