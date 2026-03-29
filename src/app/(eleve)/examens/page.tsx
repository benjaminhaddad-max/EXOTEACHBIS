import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { redirect } from "next/navigation";
import { buildFiliereCoefficientMap, resolveSerieCoefficient } from "@/lib/examens/filiere-coefficients";
import {
  ExamensEleveShell,
  type StudentExamView,
} from "@/components/eleve/examens-eleve-shell";

export const dynamic = "force-dynamic";

function getStatus(debut: string, fin: string): "upcoming" | "active" | "ended" {
  const now = Date.now();
  if (now < new Date(debut).getTime()) return "upcoming";
  if (now > new Date(fin).getTime()) return "ended";
  return "active";
}

function cleanSerieName(name: string) {
  const trimmed = name.trim();
  const parts = trimmed.split(" — ");
  if (parts.length > 1) return parts.slice(1).join(" — ").trim();
  return trimmed;
}

export default async function ExamensElevePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("groupe_id, filiere_id")
    .eq("id", user.id)
    .single();

  const studentGroupeId = profile?.groupe_id;
  const rankingFiliereId = profile?.filiere_id ?? null;

  const [examensRes, exGroupesRes] = await Promise.all([
    supabase
      .from("examens")
      .select(
        "*, examens_series(order_index, coefficient, debut_at, fin_at, series:series(id, name, timed, duration_minutes, type, matiere_id, visible))"
      )
      .eq("visible", true)
      .order("debut_at", { ascending: false }),
    supabase.from("examens_groupes").select("*"),
  ]);

  const examenGroupesMap: Record<string, string[]> = {};
  for (const row of exGroupesRes.data ?? []) {
    if (!examenGroupesMap[row.examen_id]) examenGroupesMap[row.examen_id] = [];
    examenGroupesMap[row.examen_id].push(row.groupe_id);
  }

  const examensRaw = (examensRes.data ?? []).map((examen: any) => ({
    ...examen,
    examen_series: (examen.examens_series ?? [])
      .filter((examSerie: any) => examSerie.series?.visible !== false)
      .sort((a: any, b: any) => a.order_index - b.order_index),
    series: (examen.examens_series ?? [])
      .filter((examSerie: any) => examSerie.series?.visible !== false)
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((examSerie: any) => ({
        ...examSerie.series,
        coefficient: examSerie.coefficient,
        serie_debut_at: examSerie.debut_at,
        serie_fin_at: examSerie.fin_at,
      }))
      .filter(Boolean),
    groupe_ids: examenGroupesMap[examen.id] ?? [],
  }));

  const examensVisible = examensRaw.filter((examen: any) => {
    const matchesGroup =
      examen.groupe_ids.length === 0 || (studentGroupeId && examen.groupe_ids.includes(studentGroupeId));

    return matchesGroup && (examen.series?.length ?? 0) > 0;
  });

  const matiereIds = Array.from(
    new Set(
      examensVisible.flatMap((examen: any) =>
        (examen.series ?? []).map((serie: any) => serie.matiere_id).filter(Boolean)
      )
    )
  );

  const endedVisibleExamens = examensVisible.filter((examen: any) => {
    const status = getStatus(examen.debut_at, examen.fin_at);
    return status === "ended" && Boolean(examen.results_visible);
  });

  const rankingSeriesIds = Array.from(
    new Set(
      endedVisibleExamens.flatMap((examen: any) =>
        (examen.series ?? []).map((serie: any) => serie.id).filter(Boolean)
      )
    )
  );

  const [matiereCoefficientsRes, matieresRes, attemptsRes, rankingAttemptsRes] = await Promise.all([
    matiereIds.length > 0
      ? supabase
          .from("matiere_coefficients")
          .select("matiere_id, filiere_id, coefficient")
          .in("matiere_id", matiereIds)
      : Promise.resolve({ data: [] as any[] }),
    matiereIds.length > 0
      ? supabase.from("matieres").select("id, name").in("id", matiereIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("serie_attempts")
      .select("series_id, score, nb_correct, nb_total")
      .eq("user_id", user.id)
      .not("ended_at", "is", null),
    rankingSeriesIds.length > 0
      ? supabase
          .from("serie_attempts")
          .select("user_id, series_id, score, nb_correct, nb_total, user:profiles(id, filiere_id)")
          .in("series_id", rankingSeriesIds)
          .not("ended_at", "is", null)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const coefficientMap = buildFiliereCoefficientMap(matiereCoefficientsRes.data ?? []);
  const matiereNameById = new Map((matieresRes.data ?? []).map((matiere: any) => [matiere.id, matiere.name]));

  const bestBySerie = new Map<string, { score: number; nb_correct: number; nb_total: number }>();
  for (const attempt of attemptsRes.data ?? []) {
    const previous = bestBySerie.get(attempt.series_id);
    if (!previous || (attempt.score ?? 0) > previous.score) {
      bestBySerie.set(attempt.series_id, {
        score: attempt.score ?? 0,
        nb_correct: attempt.nb_correct,
        nb_total: attempt.nb_total,
      });
    }
  }

  const bestRankingAttemptsByUserSerie = new Map<
    string,
    { userId: string; filiereId: string | null; seriesId: string; score: number; nb_correct: number; nb_total: number }
  >();
  for (const attempt of rankingAttemptsRes.data ?? []) {
    const key = `${attempt.user_id}:${attempt.series_id}`;
    const previous = bestRankingAttemptsByUserSerie.get(key);
    const rawUser = Array.isArray((attempt as any).user) ? (attempt as any).user[0] : (attempt as any).user;
    if (!previous || (attempt.score ?? 0) > previous.score) {
      bestRankingAttemptsByUserSerie.set(key, {
        userId: attempt.user_id,
        filiereId: rawUser?.filiere_id ?? null,
        seriesId: attempt.series_id,
        score: attempt.score ?? 0,
        nb_correct: attempt.nb_correct,
        nb_total: attempt.nb_total,
      });
    }
  }

  const bestRankingRowsBySeriesId = new Map<
    string,
    Array<{ userId: string; filiereId: string | null; nb_correct: number; nb_total: number }>
  >();
  for (const row of bestRankingAttemptsByUserSerie.values()) {
    if (!bestRankingRowsBySeriesId.has(row.seriesId)) bestRankingRowsBySeriesId.set(row.seriesId, []);
    bestRankingRowsBySeriesId.get(row.seriesId)!.push({
      userId: row.userId,
      filiereId: row.filiereId,
      nb_correct: row.nb_correct,
      nb_total: row.nb_total,
    });
  }

  const examens: StudentExamView[] = examensVisible.map((examen: any) => {
    const status = getStatus(examen.debut_at, examen.fin_at);
    const notationSur = examen.notation_sur ?? 20;

    let moyenne20: number | null = null;
    let nbSeriesDone = 0;

    if (status === "ended" && examen.results_visible) {
      let weightedSum = 0;
      let totalCoeff = 0;

      for (const serie of examen.series ?? []) {
        const best = bestBySerie.get(serie.id);
        if (!best || best.nb_total <= 0) continue;

        const score20 = (best.nb_correct / best.nb_total) * notationSur;
        const appliedCoeff = resolveSerieCoefficient({
          defaultCoefficient: serie.coefficient ?? 1,
          matiereId: serie.matiere_id ?? null,
          filiereId: rankingFiliereId,
          coefficientMap,
        });

        weightedSum += score20 * appliedCoeff;
        totalCoeff += appliedCoeff;
        nbSeriesDone += 1;
      }

      if (totalCoeff > 0) moyenne20 = weightedSum / totalCoeff;
    }

    let rankingSummary: StudentExamView["rankingSummary"] = null;
    if (status === "ended" && examen.results_visible) {
      const byUser = new Map<
        string,
        {
          userId: string;
          filiereId: string | null;
          serieScores: Record<string, { nb_correct: number; nb_total: number }>;
          moyenne20: number;
        }
      >();

      for (const examSerie of examen.examen_series ?? []) {
        const rows = bestRankingRowsBySeriesId.get(examSerie.series_id) ?? [];
        for (const row of rows) {
          if (!byUser.has(row.userId)) {
            byUser.set(row.userId, {
              userId: row.userId,
              filiereId: row.filiereId,
              serieScores: {},
              moyenne20: 0,
            });
          }

          byUser.get(row.userId)!.serieScores[examSerie.series_id] = {
            nb_correct: row.nb_correct,
            nb_total: row.nb_total,
          };
        }
      }

      const students = Array.from(byUser.values())
        .filter((student) => (rankingFiliereId ? student.filiereId === rankingFiliereId : true))
        .map((student) => {
          let weightedSum = 0;
          let totalCoeff = 0;

          for (const examSerie of examen.examen_series ?? []) {
            const sc = student.serieScores[examSerie.series_id];
            if (!sc || sc.nb_total <= 0) continue;

            const score20 = (sc.nb_correct / sc.nb_total) * notationSur;
            const appliedCoeff = resolveSerieCoefficient({
              defaultCoefficient: examSerie.coefficient ?? 1,
              matiereId: examSerie.series?.matiere_id ?? null,
              filiereId: rankingFiliereId,
              coefficientMap,
            });

            weightedSum += score20 * appliedCoeff;
            totalCoeff += appliedCoeff;
          }

          return {
            ...student,
            moyenne20: totalCoeff > 0 ? weightedSum / totalCoeff : 0,
          };
        })
        .sort((a, b) => b.moyenne20 - a.moyenne20);

      const myRank = students.findIndex((student) => student.userId === user.id) + 1;
      const classAverage =
        students.length > 0 ? students.reduce((sum, student) => sum + student.moyenne20, 0) / students.length : null;
      const topScore = students.length > 0 ? students[0].moyenne20 : null;

      rankingSummary = {
        rank: myRank > 0 ? myRank : null,
        participants: students.length,
        classAverage,
        topScore,
      };
    }

    return {
      id: examen.id,
      name: examen.name,
      description: examen.description ?? null,
      debut_at: examen.debut_at,
      fin_at: examen.fin_at,
      status,
      results_visible: Boolean(examen.results_visible),
      notation_sur: notationSur,
      moyenne20,
      nbSeriesDone,
      rankingSummary,
      series: (examen.series ?? []).map((serie: any) => {
        const best = bestBySerie.get(serie.id);
        const serieDebut = serie.serie_debut_at || examen.debut_at;
        const serieFin = serie.serie_fin_at || examen.fin_at;
        const serieStatus = getStatus(serieDebut, serieFin);

        return {
          id: serie.id,
          name: serie.matiere_id
            ? matiereNameById.get(serie.matiere_id) ?? cleanSerieName(serie.name)
            : cleanSerieName(serie.name),
          timed: Boolean(serie.timed),
          duration_minutes: serie.duration_minutes ?? null,
          serie_debut_at: serie.serie_debut_at ?? null,
          serie_fin_at: serie.serie_fin_at ?? null,
          status: serieStatus,
          hasOwnDates: Boolean(serie.serie_debut_at),
          score20: best && best.nb_total > 0 ? (best.nb_correct / best.nb_total) * notationSur : null,
          scorePercent: best ? Math.round(best.score) : null,
          hasAttempt: Boolean(best),
        };
      }),
    };
  });

  return (
    <div>
      <Header title="Examens blancs" />
      <ExamensEleveShell examens={examens} />
    </div>
  );
}
