import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 min max for processing multiple pages

// ─── Types ───────────────────────────────────────────────────────────────────

type ScannedAnswer = {
  questionNumber: number;
  selected: string[]; // e.g. ["A", "D"]
};

type PageResult = {
  pageIndex: number;
  studentId: string | null;
  studentName: string | null;
  userId: string | null;
  answers: ScannedAnswer[];
  score: number | null;
  nbCorrect: number;
  nbTotal: number;
  error: string | null;
};

// ─── PDF page extraction using macOS sips (serverless-compatible fallback) ───

async function extractPdfPages(buffer: Buffer): Promise<Buffer[]> {
  // Use pdf-lib to get page count, then sharp to convert
  const { PDFDocument } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.load(buffer);
  const pageCount = pdfDoc.getPageCount();

  const pages: Buffer[] = [];
  const sharp = (await import("sharp")).default;

  // Convert entire PDF to images page by page
  // pdf-lib can extract individual pages → render via sharp (limited)
  // Better approach: use the PDF buffer directly and split with external tool
  // For Vercel: send each page as a separate PDF to Claude Vision (it accepts PDFs!)
  for (let i = 0; i < pageCount; i++) {
    const singlePageDoc = await PDFDocument.create();
    const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
    singlePageDoc.addPage(copiedPage);
    const singlePageBytes = await singlePageDoc.save();
    pages.push(Buffer.from(singlePageBytes));
  }

  return pages;
}

// ─── Claude Vision: read one scanned answer sheet ───────────────────────────

async function readAnswerSheet(
  client: Anthropic,
  pageBuffer: Buffer,
  questionCount: number,
): Promise<{ studentId: string | null; studentName: string | null; answers: Record<string, string[]> }> {
  const b64 = pageBuffer.toString("base64");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: b64 },
          },
          {
            type: "text",
            text: `Grille QCM scannée. Extrais :
1. NUMÉRO ÉTUDIANT : bulles noircies en haut à droite (6 colonnes × lignes 0-9). Lis le chiffre noirci par colonne.
2. NOM/PRÉNOM : manuscrit en haut à gauche.
3. RÉPONSES : ${questionCount} questions (1-${questionCount}). Chaque question a 2 rangées de cases A-E. Si rangée du BAS (remord) est remplie, elle remplace celle du haut. Liste les lettres noircies par question.
Réponds UNIQUEMENT en JSON, pas d'explication.`,
          },
        ],
      },
      {
        role: "assistant",
        content: '{"studentId":"',
      },
    ],
  });

  // Response is continuation of the prefilled assistant message
  const rawText = '{"studentId":"' + (response.content[0].type === "text" ? response.content[0].text : "");
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude n'a pas retourné de JSON valide: " + rawText.substring(0, 100));
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    studentId: parsed.studentId || null,
    studentName: parsed.studentName || null,
    answers: parsed.answers || {},
  };
}

// ─── Route POST ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée." }, { status: 500 });
    }

    const formData = await req.formData();
    const serieId = formData.get("serieId") as string;
    const examenId = formData.get("examenId") as string;
    const file = formData.get("file") as File;

    if (!serieId || !examenId || !file) {
      return NextResponse.json({ error: "serieId, examenId et fichier PDF requis" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // ─── Get question count and correct answers for this serie ───────────────
    const { data: sqData } = await supabase
      .from("series_questions")
      .select("question_id, order_index")
      .eq("series_id", serieId)
      .order("order_index");

    if (!sqData || sqData.length === 0) {
      return NextResponse.json({ error: "Aucune question dans cette série" }, { status: 422 });
    }

    const questionIds = sqData.map(r => r.question_id);
    const questionCount = questionIds.length;

    // Get correct answers for scoring
    const { data: optionsData } = await supabase
      .from("options")
      .select("question_id, label, is_correct")
      .in("question_id", questionIds);

    const correctAnswers: Record<string, string[]> = {};
    for (const opt of (optionsData || [])) {
      if (opt.is_correct) {
        if (!correctAnswers[opt.question_id]) correctAnswers[opt.question_id] = [];
        correctAnswers[opt.question_id].push(opt.label);
      }
    }

    // Map order_index → question_id
    const orderToQuestionId: Record<number, string> = {};
    for (const sq of sqData) {
      orderToQuestionId[sq.order_index] = sq.question_id;
    }

    // ─── Get all student profiles for matching ───────────────────────────────
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, student_id, first_name, last_name")
      .eq("role", "eleve");

    const studentIdToUser: Record<string, { id: string; name: string }> = {};
    const allStudentIds: string[] = [];
    for (const p of (profiles || [])) {
      if (p.student_id) {
        studentIdToUser[p.student_id] = {
          id: p.id,
          name: `${p.last_name || ""} ${p.first_name || ""}`.trim(),
        };
        allStudentIds.push(p.student_id);
      }
    }

    // Fuzzy match: find closest student_id (max 1 digit difference)
    function fuzzyMatchStudentId(scannedId: string): string | null {
      if (!scannedId) return null;
      // Exact match first
      if (studentIdToUser[scannedId]) return scannedId;
      // Try matching with 1 digit tolerance (Levenshtein distance = 1)
      let bestMatch: string | null = null;
      let bestDist = Infinity;
      for (const dbId of allStudentIds) {
        if (dbId.length !== scannedId.length) continue;
        let diff = 0;
        for (let i = 0; i < dbId.length; i++) {
          if (dbId[i] !== scannedId[i]) diff++;
        }
        if (diff < bestDist && diff <= 1) {
          bestDist = diff;
          bestMatch = dbId;
        }
      }
      if (bestMatch) {
        console.log(`[scan-copies] Fuzzy match: scanned "${scannedId}" → DB "${bestMatch}" (${bestDist} digit diff)`);
      }
      return bestMatch;
    }

    // ─── Create scan session ─────────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    const pageBuffers = await extractPdfPages(pdfBuffer);

    // Try to create scan session (table may not exist yet if migration hasn't run)
    let sessionId: string | null = null;
    try {
      const { data: session } = await supabase
        .from("scan_sessions")
        .insert({
          examen_id: examenId,
          series_id: serieId,
          uploaded_by: user.id,
          filename: file.name,
          total_pages: pageBuffers.length,
          status: "processing",
        })
        .select("id")
        .single();
      sessionId = session?.id ?? null;
    } catch {
      console.warn("[scan-copies] scan_sessions table not available — proceeding without tracking");
    }

    // ─── Process each page with Claude Vision ────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const results: PageResult[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (let i = 0; i < pageBuffers.length; i++) {
      try {
        console.log(`[scan-copies] Processing page ${i + 1}/${pageBuffers.length}...`);

        const { studentId, studentName, answers } = await readAnswerSheet(
          client, pageBuffers[i], questionCount
        );

        // Match student (exact or fuzzy — 1 digit tolerance)
        let userId: string | null = null;
        let matchedId = studentId;
        if (studentId) {
          const resolved = fuzzyMatchStudentId(studentId);
          if (resolved && studentIdToUser[resolved]) {
            userId = studentIdToUser[resolved].id;
            matchedId = resolved;
            matchedCount++;
          } else {
            unmatchedCount++;
          }
        } else {
          unmatchedCount++;
        }

        // Calculate score
        let nbCorrect = 0;
        const scannedAnswers: ScannedAnswer[] = [];

        for (let qIdx = 0; qIdx < questionCount; qIdx++) {
          const qNum = String(qIdx + 1);
          const selected = answers[qNum] || [];
          const questionId = orderToQuestionId[qIdx];
          const correct = correctAnswers[questionId] || [];

          // QCM scoring: all correct labels selected AND no incorrect ones
          const isCorrect = correct.length > 0
            && correct.every(l => selected.includes(l))
            && selected.every(l => correct.includes(l));

          if (isCorrect) nbCorrect++;

          scannedAnswers.push({ questionNumber: qIdx + 1, selected });
        }

        const score = questionCount > 0 ? Math.round((nbCorrect / questionCount) * 10000) / 100 : 0;

        // ─── Save to DB if student matched ──────────────────────────────────
        if (userId) {
          // Create or update serie_attempt
          const { data: existingAttempt } = await supabase
            .from("serie_attempts")
            .select("id")
            .eq("user_id", userId)
            .eq("series_id", serieId)
            .maybeSingle();

          let attemptId: string;

          if (existingAttempt) {
            attemptId = existingAttempt.id;
            // Update existing attempt
            await supabase.from("serie_attempts").update({
              score, nb_correct: nbCorrect, nb_total: questionCount,
              ended_at: new Date().toISOString(),
            }).eq("id", attemptId);
            // Delete old answers
            await supabase.from("user_answers").delete().eq("attempt_id", attemptId);
          } else {
            const { data: newAttempt, error: attemptErr } = await supabase
              .from("serie_attempts")
              .insert({
                user_id: userId, series_id: serieId,
                started_at: new Date().toISOString(),
                ended_at: new Date().toISOString(),
                score, nb_correct: nbCorrect, nb_total: questionCount,
                timed: false,
              })
              .select("id")
              .single();
            if (attemptErr || !newAttempt) {
              console.error(`[scan-copies] Failed to create attempt for user ${userId}:`, attemptErr?.message);
              throw new Error(`Erreur création attempt: ${attemptErr?.message}`);
            }
            attemptId = newAttempt.id;
          }

          // Insert answers
          const answersToInsert = scannedAnswers
            .filter(a => a.selected.length > 0)
            .map(a => {
              const questionId = orderToQuestionId[a.questionNumber - 1];
              const correct = correctAnswers[questionId] || [];
              const isCorrect = correct.length > 0
                && correct.every(l => a.selected.includes(l))
                && a.selected.every(l => correct.includes(l));
              return {
                attempt_id: attemptId,
                question_id: questionId,
                selected_labels: a.selected,
                is_correct: isCorrect,
              };
            });

          if (answersToInsert.length > 0) {
            await supabase.from("user_answers").insert(answersToInsert);
          }

          // Update examen_serie_results
          const { data: existingSerieResult } = await supabase
            .from("examen_serie_results")
            .select("id")
            .eq("examen_id", examenId)
            .eq("series_id", serieId)
            .eq("user_id", userId)
            .maybeSingle();

          if (existingSerieResult) {
            await supabase.from("examen_serie_results").update({
              attempt_id: attemptId, score, score_20: score / 5,
              nb_correct: nbCorrect, nb_total: questionCount,
              completed_at: new Date().toISOString(),
            }).eq("id", existingSerieResult.id);
          } else {
            // Need examen_result first
            let { data: examResult } = await supabase
              .from("examen_results")
              .select("id")
              .eq("examen_id", examenId)
              .eq("user_id", userId)
              .maybeSingle();

            if (!examResult) {
              const { data: newExamResult } = await supabase
                .from("examen_results")
                .insert({
                  examen_id: examenId, user_id: userId,
                  score_raw: 0, score_20: 0,
                  nb_series_done: 0, nb_series_total: 0,
                  started_at: new Date().toISOString(),
                })
                .select("id")
                .single();
              examResult = newExamResult;
            }

            if (examResult) {
              await supabase.from("examen_serie_results").insert({
                examen_result_id: examResult.id,
                examen_id: examenId, series_id: serieId, user_id: userId,
                attempt_id: attemptId, score, score_20: score / 5,
                nb_correct: nbCorrect, nb_total: questionCount,
                completed_at: new Date().toISOString(),
              });
            }
          }
        }

        results.push({
          pageIndex: i,
          studentId,
          studentName,
          userId,
          answers: scannedAnswers,
          score,
          nbCorrect,
          nbTotal: questionCount,
          error: userId ? null : `Étudiant ${studentId || "inconnu"} non trouvé`,
        });

        // Update session progress (if table exists)
        if (sessionId) {
          await supabase.from("scan_sessions").update({
            processed_pages: i + 1,
            matched_students: matchedCount,
            unmatched_students: unmatchedCount,
          }).eq("id", sessionId);
        }

      } catch (e: any) {
        console.error(`[scan-copies] Page ${i + 1} error:`, e.message);
        results.push({
          pageIndex: i,
          studentId: null,
          studentName: null,
          userId: null,
          answers: [],
          score: null,
          nbCorrect: 0,
          nbTotal: questionCount,
          error: e.message,
        });
      }
    }

    // ─── Finalize session ────────────────────────────────────────────────────
    if (sessionId) {
      await supabase.from("scan_sessions").update({
        status: "done",
        processed_pages: pageBuffers.length,
        matched_students: matchedCount,
        unmatched_students: unmatchedCount,
        results: results.map(r => ({
          pageIndex: r.pageIndex,
          studentId: r.studentId,
          studentName: r.studentName,
          userId: r.userId,
          score: r.score,
          nbCorrect: r.nbCorrect,
          nbTotal: r.nbTotal,
          error: r.error,
        })),
      }).eq("id", sessionId);
    }

    console.log(`[scan-copies] Done: ${matchedCount} matched, ${unmatchedCount} unmatched, ${results.filter(r => r.error && r.userId).length} errors`);

    return NextResponse.json({
      success: true,
      sessionId,
      totalPages: pageBuffers.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      results: results.map(r => ({
        page: r.pageIndex + 1,
        studentId: r.studentId,
        studentName: r.studentName,
        matched: !!r.userId,
        score: r.score,
        nbCorrect: r.nbCorrect,
        nbTotal: r.nbTotal,
        error: r.error,
      })),
    });

  } catch (e: any) {
    console.error("[scan-copies] Fatal error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
