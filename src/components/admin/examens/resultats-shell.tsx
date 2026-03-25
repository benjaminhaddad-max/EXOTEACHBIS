"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Download, Trophy, Users, BarChart3, Filter } from "lucide-react";
import Link from "next/link";

type Filiere = { id: string; name: string; code: string; color: string; order_index: number };
type ExamenSerie = {
  series_id: string;
  order_index: number;
  coefficient: number;
  series?: { id: string; name: string; matiere_id?: string; matiere?: { id: string; name: string } };
};
type Examen = {
  id: string;
  name: string;
  description: string | null;
  notation_sur: number;
  results_visible: boolean;
  examen_series: ExamenSerie[];
};
type Attempt = {
  id: string;
  user_id: string;
  series_id: string;
  score: number | null;
  nb_correct: number;
  nb_total: number;
  ended_at: string;
  user?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    filiere_id: string | null;
    filiere?: Filiere | null;
  };
};

type StudentRow = {
  userId: string;
  name: string;
  email: string;
  filiere: Filiere | null;
  serieScores: Record<string, { score: number; nb_correct: number; nb_total: number }>;
  weightedTotal: number;
  totalCoeff: number;
  moyenne20: number;
};

export function ResultatsShell({
  examen,
  attempts,
  filieres,
}: {
  examen: Examen;
  attempts: Attempt[];
  filieres: Filiere[];
}) {
  const [filterFiliere, setFilterFiliere] = useState<string>("all");
  const [tab, setTab] = useState<"global" | "series">("global");
  const [selectedSerie, setSelectedSerie] = useState<string | null>(null);

  const notationSur = examen.notation_sur || 20;

  const students = useMemo(() => {
    const byUser = new Map<string, StudentRow>();

    for (const a of attempts) {
      if (!a.user || a.score == null) continue;
      const key = a.user.id;
      if (!byUser.has(key)) {
        byUser.set(key, {
          userId: a.user.id,
          name: [a.user.first_name, a.user.last_name].filter(Boolean).join(" ") || a.user.email,
          email: a.user.email,
          filiere: (a.user.filiere ?? null) as Filiere | null,
          serieScores: {},
          weightedTotal: 0,
          totalCoeff: 0,
          moyenne20: 0,
        });
      }
      const row = byUser.get(key)!;
      const existing = row.serieScores[a.series_id];
      if (!existing || (a.score ?? 0) > existing.score) {
        row.serieScores[a.series_id] = {
          score: a.score ?? 0,
          nb_correct: a.nb_correct,
          nb_total: a.nb_total,
        };
      }
    }

    // Calculate weighted averages
    for (const row of byUser.values()) {
      let weightedSum = 0;
      let totalCoeff = 0;
      for (const es of examen.examen_series) {
        const s = row.serieScores[es.series_id];
        if (s) {
          const score20 = s.nb_total > 0 ? (s.nb_correct / s.nb_total) * notationSur : 0;
          weightedSum += score20 * es.coefficient;
          totalCoeff += es.coefficient;
        }
      }
      row.weightedTotal = weightedSum;
      row.totalCoeff = totalCoeff;
      row.moyenne20 = totalCoeff > 0 ? weightedSum / totalCoeff : 0;
    }

    return Array.from(byUser.values()).sort((a, b) => b.moyenne20 - a.moyenne20);
  }, [attempts, examen.examen_series, notationSur]);

  const filteredStudents = filterFiliere === "all"
    ? students
    : students.filter((s) => s.filiere?.id === filterFiliere);

  // Per-series stats
  const serieStats = useMemo(() => {
    const stats: Record<string, { count: number; sum: number; scores: number[] }> = {};
    for (const es of examen.examen_series) {
      stats[es.series_id] = { count: 0, sum: 0, scores: [] };
    }
    for (const s of students) {
      for (const [sid, sc] of Object.entries(s.serieScores)) {
        if (stats[sid]) {
          const s20 = sc.nb_total > 0 ? (sc.nb_correct / sc.nb_total) * notationSur : 0;
          stats[sid].count++;
          stats[sid].sum += s20;
          stats[sid].scores.push(s20);
        }
      }
    }
    return stats;
  }, [students, examen.examen_series, notationSur]);

  // Class average
  const classMoyenne = students.length > 0
    ? students.reduce((acc, s) => acc + s.moyenne20, 0) / students.length
    : 0;

  const exportCSV = () => {
    const headers = ["Rang", "Nom", "Email", "Filière",
      ...examen.examen_series.map((es) => `${es.series?.name ?? "?"} (coeff ${es.coefficient})`),
      `Moyenne /${notationSur}`
    ];
    const rows = filteredStudents.map((s, i) => [
      i + 1,
      s.name,
      s.email,
      s.filiere?.name ?? "—",
      ...examen.examen_series.map((es) => {
        const sc = s.serieScores[es.series_id];
        return sc ? (sc.nb_total > 0 ? ((sc.nb_correct / sc.nb_total) * notationSur).toFixed(1) : "0") : "—";
      }),
      s.moyenne20.toFixed(2),
    ]);

    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resultats-${examen.name.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
        <Link href="/admin/examens" className="text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-white">{examen.name}</h1>
          <p className="text-xs text-white/50 mt-0.5">Résultats détaillés</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C] text-[#0e1e35] text-sm font-semibold rounded-lg hover:bg-[#A8892E] transition-colors"
        >
          <Download size={14} /> Exporter CSV
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3 px-6 pt-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
            <Trophy size={12} /> Moyenne classe
          </div>
          <p className="text-2xl font-bold text-white">{classMoyenne.toFixed(1)}<span className="text-sm text-white/40">/{notationSur}</span></p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
            <Users size={12} /> Participants
          </div>
          <p className="text-2xl font-bold text-white">{students.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
            <BarChart3 size={12} /> Séries
          </div>
          <p className="text-2xl font-bold text-white">{examen.examen_series.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
            <Trophy size={12} /> Meilleure note
          </div>
          <p className="text-2xl font-bold text-white">
            {students.length > 0 ? students[0].moyenne20.toFixed(1) : "—"}<span className="text-sm text-white/40">/{notationSur}</span>
          </p>
        </div>
      </div>

      {/* Series averages */}
      <div className="px-6 pt-4">
        <div className="flex flex-wrap gap-2">
          {examen.examen_series.map((es) => {
            const st = serieStats[es.series_id];
            const avg = st && st.count > 0 ? st.sum / st.count : 0;
            return (
              <div key={es.series_id} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs">
                <p className="text-white/60 truncate max-w-[200px]">{es.series?.name ?? "?"}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white font-semibold">{avg.toFixed(1)}/{notationSur}</span>
                  <span className="text-[#C9A84C] text-[10px]">×{es.coefficient}</span>
                  <span className="text-white/30 text-[10px]">{st?.count ?? 0} copies</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 pt-4">
        <div className="flex items-center gap-1.5 text-xs text-white/50">
          <Filter size={12} /> Filière :
        </div>
        <select
          value={filterFiliere}
          onChange={(e) => setFilterFiliere(e.target.value)}
          className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none"
        >
          <option value="all">Toutes les filières</option>
          {filieres.map((f) => (
            <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
          ))}
        </select>
        <span className="text-xs text-white/30">
          {filteredStudents.length} élève{filteredStudents.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-auto px-6 pt-4 pb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 sticky top-0 bg-[#0e1e35]">
                <th className="text-left py-3 px-2 text-white/50 text-xs font-medium w-10">#</th>
                <th className="text-left py-3 px-2 text-white/50 text-xs font-medium min-w-[180px]">Élève</th>
                <th className="text-left py-3 px-2 text-white/50 text-xs font-medium w-20">Filière</th>
                {examen.examen_series.map((es) => (
                  <th key={es.series_id} className="py-3 px-2 text-center text-white/50 text-xs font-medium min-w-[80px]">
                    <div className="truncate max-w-[100px]">{es.series?.name ?? "?"}</div>
                    <div className="text-[10px] text-[#C9A84C]">×{es.coefficient}</div>
                  </th>
                ))}
                <th className="py-3 px-2 text-center text-white/50 text-xs font-semibold min-w-[80px]">
                  Moyenne /{notationSur}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s, i) => {
                const rank = i + 1;
                const isTop3 = rank <= 3;
                return (
                  <tr key={s.userId} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 px-2 text-xs text-white/40 font-mono">
                      {isTop3 ? (
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                          rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                          rank === 2 ? "bg-gray-400/20 text-gray-300" :
                          "bg-orange-500/20 text-orange-400"
                        }`}>{rank}</span>
                      ) : rank}
                    </td>
                    <td className="py-2 px-2">
                      <p className="text-xs text-white/80 font-medium">{s.name}</p>
                      <p className="text-[10px] text-white/30">{s.email}</p>
                    </td>
                    <td className="py-2 px-2">
                      {s.filiere ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: s.filiere.color + "20", color: s.filiere.color }}>
                          {s.filiere.code}
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/20">—</span>
                      )}
                    </td>
                    {examen.examen_series.map((es) => {
                      const sc = s.serieScores[es.series_id];
                      if (!sc) return <td key={es.series_id} className="py-2 px-2 text-center text-[10px] text-white/20">—</td>;
                      const score20 = sc.nb_total > 0 ? (sc.nb_correct / sc.nb_total) * notationSur : 0;
                      const pct = sc.nb_total > 0 ? (sc.nb_correct / sc.nb_total) * 100 : 0;
                      return (
                        <td key={es.series_id} className="py-2 px-2 text-center">
                          <span className={`text-xs font-medium ${
                            pct >= 70 ? "text-green-400" : pct >= 50 ? "text-orange-400" : "text-red-400"
                          }`}>
                            {score20.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-white/20 ml-0.5">/{notationSur}</span>
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-center">
                      <span className={`text-sm font-bold ${
                        s.moyenne20 >= notationSur * 0.7 ? "text-green-400" :
                        s.moyenne20 >= notationSur * 0.5 ? "text-orange-400" :
                        "text-red-400"
                      }`}>
                        {s.moyenne20.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={3 + examen.examen_series.length + 1} className="text-center py-12 text-white/30 text-xs">
                    Aucun résultat
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
