import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { redirect } from "next/navigation";
import { Trophy, BarChart3, Medal, ArrowLeft, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { buildFiliereCoefficientMap, resolveSerieCoefficient } from "@/lib/examens/filiere-coefficients";

export const dynamic = "force-dynamic";

export default async function ExamenResultatsPage({ params }: { params: Promise<{ examenId: string }> }) {
  const { examenId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("filiere_id, filiere:filieres(id, name, code, color)")
    .eq("id", user.id)
    .single();
  const activeFiliere = Array.isArray(profile?.filiere) ? profile.filiere[0] : profile?.filiere;

  // Load examen
  const { data: examen } = await supabase
    .from("examens")
    .select("*, examens_series(series_id, order_index, coefficient, series:series(id, name, matiere_id))")
    .eq("id", examenId)
    .eq("visible", true)
    .single();

  if (!examen || !examen.results_visible) redirect("/examens");

  const examenSeries = (examen.examens_series ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index);
  const seriesIds = examenSeries.map((es: any) => es.series_id);
  const matiereIds = examenSeries.map((es: any) => es.series?.matiere_id).filter(Boolean);
  const notationSur = examen.notation_sur ?? 20;

  // Load ALL attempts for these series (all students)
  const { data: allAttempts } = seriesIds.length > 0
    ? await supabase
        .from("serie_attempts")
        .select("user_id, series_id, score, nb_correct, nb_total, user:profiles(id, first_name, last_name, filiere_id, filiere:filieres(id, name, code, color))")
        .in("series_id", seriesIds)
        .not("ended_at", "is", null)
    : { data: [] };

  const { data: matiereCoefficients } = matiereIds.length > 0
    ? await supabase
        .from("matiere_coefficients")
        .select("matiere_id, filiere_id, coefficient")
        .in("matiere_id", matiereIds)
    : { data: [] };

  const coefficientMap = buildFiliereCoefficientMap(matiereCoefficients ?? []);
  const rankingFiliereId = profile?.filiere_id ?? null;

  // Build per-student scores
  type StudentScore = {
    userId: string;
    name: string;
    isMe: boolean;
    filiereId: string | null;
    filiere?: { id: string; name: string; code: string; color: string } | null;
    serieScores: Record<string, { nb_correct: number; nb_total: number }>;
    moyenne20: number;
  };

  const byUser = new Map<string, StudentScore>();
  for (const a of (allAttempts ?? [])) {
    const u = a.user as any;
    if (!u || a.nb_total === 0) continue;
      if (!byUser.has(a.user_id)) {
        byUser.set(a.user_id, {
          userId: a.user_id,
          name: [u.first_name, u.last_name].filter(Boolean).join(" ") || "Anonyme",
          isMe: a.user_id === user.id,
          filiereId: u.filiere_id ?? null,
          filiere: u.filiere ?? null,
          serieScores: {},
          moyenne20: 0,
        });
    }
    const row = byUser.get(a.user_id)!;
    const prev = row.serieScores[a.series_id];
    if (!prev || (a.score ?? 0) > ((prev.nb_correct / prev.nb_total) * 100)) {
      row.serieScores[a.series_id] = { nb_correct: a.nb_correct, nb_total: a.nb_total };
    }
  }

  // Calculate weighted averages
    for (const row of byUser.values()) {
      let weightedSum = 0;
      let totalCoeff = 0;
      for (const es of examenSeries) {
        const sc = row.serieScores[es.series_id];
        if (sc && sc.nb_total > 0) {
          const s20 = (sc.nb_correct / sc.nb_total) * notationSur;
          const appliedCoeff = resolveSerieCoefficient({
            defaultCoefficient: es.coefficient ?? 1,
            matiereId: es.series?.matiere_id ?? null,
            filiereId: rankingFiliereId,
            coefficientMap,
          });
          weightedSum += s20 * appliedCoeff;
          totalCoeff += appliedCoeff;
        }
      }
      row.moyenne20 = totalCoeff > 0 ? weightedSum / totalCoeff : 0;
    }

  const students = Array.from(byUser.values())
    .filter((student) => (rankingFiliereId ? student.filiereId === rankingFiliereId : true))
    .sort((a, b) => b.moyenne20 - a.moyenne20);
  const myRank = students.findIndex((s) => s.isMe) + 1;
  const myScore = students.find((s) => s.isMe);
  const classMoyenne = students.length > 0
    ? students.reduce((a, s) => a + s.moyenne20, 0) / students.length
    : 0;

  return (
    <div>
      <Header title={examen.name} />

      <div className="mb-4">
        <Link href="/examens" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy transition-colors">
          <ArrowLeft className="h-4 w-4" /> Retour aux examens
        </Link>
      </div>

      {/* My score card */}
      {myScore && (
        <div className="bg-gradient-to-r from-navy to-navy/80 rounded-xl p-5 text-white mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Mon resultat</h3>
              <p className="text-white/60 text-sm mt-0.5">
                {myRank > 0 ? `${myRank}${myRank === 1 ? "er" : "e"} sur ${students.length} participants` : ""}
              </p>
              {activeFiliere && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                  Classement {activeFiliere.name}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className={cn(
                "text-3xl font-bold",
                myScore.moyenne20 >= notationSur * 0.7 ? "text-green-400" :
                myScore.moyenne20 >= notationSur * 0.5 ? "text-yellow-400" : "text-red-400"
              )}>
                {myScore.moyenne20.toFixed(1)}
                <span className="text-lg text-white/50">/{notationSur}</span>
              </div>
            </div>
          </div>
          {/* My per-serie breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {examenSeries.map((es: any) => {
              const sc = myScore.serieScores[es.series_id];
              const s20 = sc && sc.nb_total > 0 ? (sc.nb_correct / sc.nb_total) * notationSur : null;
              return (
                <div key={es.series_id} className="bg-white/10 rounded-lg px-3 py-2">
                  <p className="text-xs text-white/50 truncate">{es.series?.name ?? "?"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-sm font-semibold">{s20 !== null ? s20.toFixed(1) : "—"}</span>
                      <span className="text-[10px] text-white/40">/{notationSur}</span>
                    {(() => {
                      const appliedCoeff = resolveSerieCoefficient({
                        defaultCoefficient: es.coefficient ?? 1,
                        matiereId: es.series?.matiere_id ?? null,
                        filiereId: rankingFiliereId,
                        coefficientMap,
                      });
                      return appliedCoeff !== 1 ? <span className="text-[10px] text-amber-400">x{appliedCoeff}</span> : null;
                    })()}
                    </div>
                  </div>
                );
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <Trophy className="h-5 w-5 text-amber-500 mx-auto mb-1" />
          <p className="text-xs text-gray-500">Moyenne classe</p>
          <p className="text-lg font-bold text-gray-900">{classMoyenne.toFixed(1)}<span className="text-sm text-gray-400">/{notationSur}</span></p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <Users className="h-5 w-5 text-blue-500 mx-auto mb-1" />
          <p className="text-xs text-gray-500">Participants</p>
          <p className="text-lg font-bold text-gray-900">{students.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <Medal className="h-5 w-5 text-purple-500 mx-auto mb-1" />
          <p className="text-xs text-gray-500">Mon classement</p>
          <p className="text-lg font-bold text-gray-900">{myRank > 0 ? `${myRank}/${students.length}` : "—"}</p>
        </div>
      </div>

      {/* Ranking table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-navy" />
          <h3 className="text-sm font-semibold text-gray-900">
            Classement {activeFiliere?.name ? `— ${activeFiliere.name}` : ""}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 w-12">#</th>
                <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Eleve</th>
                {examenSeries.map((es: any) => (
                  <th key={es.series_id} className="py-2.5 px-2 text-center text-xs font-medium text-gray-500 hidden sm:table-cell">
                    <div className="truncate max-w-[80px]">{es.series?.name ?? "?"}</div>
                    {(() => {
                      const appliedCoeff = resolveSerieCoefficient({
                        defaultCoefficient: es.coefficient ?? 1,
                        matiereId: es.series?.matiere_id ?? null,
                        filiereId: rankingFiliereId,
                        coefficientMap,
                      });
                      return appliedCoeff !== 1 ? <div className="text-[10px] text-amber-600">x{appliedCoeff}</div> : null;
                    })()}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-700">Note</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => {
                const rank = i + 1;
                return (
                  <tr
                    key={s.userId}
                    className={cn(
                      "border-b border-gray-50",
                      s.isMe && "bg-navy/5 font-medium",
                      rank <= 3 && "bg-amber-50/30"
                    )}
                  >
                    <td className="py-2 px-3 text-xs text-gray-500">
                      {rank <= 3 ? (
                        <span className={cn(
                          "inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold",
                          rank === 1 && "bg-yellow-100 text-yellow-700",
                          rank === 2 && "bg-gray-200 text-gray-600",
                          rank === 3 && "bg-orange-100 text-orange-700"
                        )}>
                          {rank}
                        </span>
                      ) : rank}
                    </td>
                    <td className="py-2 px-3">
                      <span className={cn("text-sm", s.isMe ? "text-navy font-semibold" : "text-gray-700")}>
                        {s.isMe ? "Vous" : s.name}
                      </span>
                    </td>
                    {examenSeries.map((es: any) => {
                      const sc = s.serieScores[es.series_id];
                      const s20 = sc && sc.nb_total > 0 ? (sc.nb_correct / sc.nb_total) * notationSur : null;
                      return (
                        <td key={es.series_id} className="py-2 px-2 text-center hidden sm:table-cell">
                          {s20 !== null ? (
                            <span className={cn(
                              "text-xs font-medium",
                              s20 >= notationSur * 0.7 ? "text-green-600" :
                              s20 >= notationSur * 0.5 ? "text-orange-500" : "text-red-500"
                            )}>
                              {s20.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-center">
                      <span className={cn(
                        "text-sm font-bold",
                        s.moyenne20 >= notationSur * 0.7 ? "text-green-600" :
                        s.moyenne20 >= notationSur * 0.5 ? "text-orange-500" : "text-red-500"
                      )}>
                        {s.moyenne20.toFixed(1)}
                      </span>
                      <span className="text-xs text-gray-400">/{notationSur}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
