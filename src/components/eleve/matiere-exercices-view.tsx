"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, PlusCircle, Trophy, BookMarked, Layers,
  ArrowRight, Clock, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";

type SerieType = "annales" | "qcm_supplementaires" | "concours_blanc" | "revision" | "entrainement";

export type SerieSummaryForStudent = {
  id: string;
  name: string;
  type: string;
  timed: boolean;
  duration_minutes: number | null;
  annee: string | null;
  nb_questions: number;
  last_score: number | null;
};

const TYPE_CONFIG: Record<SerieType, { label: string; icon: React.ReactNode; color: string; bgAccent: string }> = {
  annales:             { label: "Annales corrigées",   icon: <BookOpen size={18} />,   color: "#f59e0b", bgAccent: "rgba(245,158,11,0.15)" },
  qcm_supplementaires: { label: "QCM supplémentaires", icon: <PlusCircle size={18} />, color: "#14b8a6", bgAccent: "rgba(20,184,166,0.15)" },
  concours_blanc:      { label: "Concours blanc",      icon: <Trophy size={18} />,     color: "#ef4444", bgAccent: "rgba(239,68,68,0.15)" },
  revision:            { label: "Révision",            icon: <BookMarked size={18} />, color: "#8b5cf6", bgAccent: "rgba(139,92,246,0.15)" },
  entrainement:        { label: "Entraînement",        icon: <Layers size={18} />,     color: "#4FABDB", bgAccent: "rgba(79,171,219,0.15)" },
};

const TYPES: SerieType[] = ["annales", "qcm_supplementaires", "concours_blanc", "revision", "entrainement"];

export function MatiereExercicesView({
  matiereIds,
  coursIds,
}: {
  matiereIds: string[];
  coursIds: string[];
}) {
  const { user } = useUser();
  const userId = user?.id ?? "";
  const router = useRouter();
  const [series, setSeries] = useState<SerieSummaryForStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<SerieType | null>(null);

  useEffect(() => {
    if (!userId || (matiereIds.length === 0 && coursIds.length === 0)) {
      setSeries([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const supabase = createClient();

      const filters: string[] = [];
      if (matiereIds.length > 0) filters.push(`matiere_id.in.(${matiereIds.join(",")})`);
      if (coursIds.length > 0) filters.push(`cours_id.in.(${coursIds.join(",")})`);

      const { data: seriesData } = await supabase
        .from("series")
        .select("id, name, type, timed, duration_minutes, annee, visible, questions(id)")
        .eq("visible", true)
        .or(filters.join(","));

      if (cancelled) return;

      const seriesWithCount = (seriesData ?? [])
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          timed: s.timed,
          duration_minutes: s.duration_minutes,
          annee: s.annee,
          nb_questions: s.questions?.length ?? 0,
        }))
        .filter((s: any) => s.nb_questions > 0);

      const serieIds = seriesWithCount.map((s: any) => s.id);
      let scoreMap = new Map<string, number>();

      if (serieIds.length > 0 && userId) {
        const { data: attempts } = await supabase
          .from("serie_attempts")
          .select("serie_id, score")
          .eq("user_id", userId)
          .in("serie_id", serieIds)
          .order("created_at", { ascending: false });

        if (!cancelled && attempts) {
          for (const a of attempts) {
            if (!scoreMap.has(a.serie_id)) scoreMap.set(a.serie_id, a.score);
          }
        }
      }

      if (cancelled) return;

      setSeries(
        seriesWithCount.map((s: any) => ({
          ...s,
          last_score: scoreMap.get(s.id) ?? null,
        })),
      );
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [matiereIds, coursIds, userId]);

  const seriesByType = useMemo(() => {
    const map = new Map<SerieType, SerieSummaryForStudent[]>();
    for (const t of TYPES) {
      map.set(t, series.filter((s) => s.type === t));
    }
    return map;
  }, [series]);

  const typesWithContent = TYPES.filter((t) => (seriesByType.get(t) ?? []).length > 0);
  const effectiveType = activeType && typesWithContent.includes(activeType) ? activeType : typesWithContent[0] ?? null;
  const activeSeries = effectiveType ? (seriesByType.get(effectiveType) ?? []) : series;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[#C9A84C]" />
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D7E2EF] bg-white py-16 text-center">
        <Layers size={40} className="mb-3 text-[#D0D9E4]" />
        <p className="text-sm font-medium text-[#7D8C9E]">Aucun exercice disponible pour cette matière</p>
        <p className="mt-1 text-xs text-[#A2AEBC]">Les exercices seront ajoutés prochainement.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {typesWithContent.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {typesWithContent.map((type) => {
            const config = TYPE_CONFIG[type];
            const count = seriesByType.get(type)?.length ?? 0;
            const isActive = effectiveType === type;
            return (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
                style={{
                  backgroundColor: isActive ? config.bgAccent : "white",
                  color: isActive ? config.color : "#6B7280",
                  border: `1.5px solid ${isActive ? config.color + "40" : "#E5E7EB"}`,
                }}
              >
                <span style={{ color: isActive ? config.color : "#9CA3AF" }}>{config.icon}</span>
                {config.label}
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{
                    backgroundColor: isActive ? config.color + "20" : "#F3F4F6",
                    color: isActive ? config.color : "#9CA3AF",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {activeSeries.map((serie) => {
          const config = TYPE_CONFIG[(serie.type as SerieType)] ?? TYPE_CONFIG.entrainement;
          return (
            <button
              key={serie.id}
              onClick={() => router.push(`/serie/${serie.id}`)}
              className="group relative overflow-hidden rounded-2xl border bg-white p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(14,30,53,0.10)]"
              style={{ borderColor: "#E5E7EB" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-[15px] font-semibold text-[#0e1e35] leading-snug">{serie.name}</h4>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#8A98A9]">
                    {serie.nb_questions > 0 && (
                      <span className="font-medium" style={{ color: config.color }}>{serie.nb_questions} questions</span>
                    )}
                    {serie.timed && serie.duration_minutes && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {serie.duration_minutes} min
                      </span>
                    )}
                    {serie.annee && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: config.bgAccent, color: config.color }}>
                        {serie.annee}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  {serie.last_score != null ? (
                    <div className="flex flex-col items-center">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold"
                        style={{
                          backgroundColor: serie.last_score >= 70 ? "rgba(22,163,74,0.1)" : serie.last_score >= 50 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                          color: serie.last_score >= 70 ? "#16A34A" : serie.last_score >= 50 ? "#D97706" : "#DC2626",
                        }}
                      >
                        {Math.round(serie.last_score)}%
                      </div>
                      <span className="mt-1 text-[9px] text-[#A2AEBC]">dernier</span>
                    </div>
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200 group-hover:scale-110" style={{ backgroundColor: config.bgAccent }}>
                      <ArrowRight size={16} style={{ color: config.color }} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
