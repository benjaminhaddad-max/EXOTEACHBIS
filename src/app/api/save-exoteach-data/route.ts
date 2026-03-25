import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\s+/g, " ").trim();
}

function indexToLabel(i: number) { return String.fromCharCode(65 + i); }

export async function POST(req: NextRequest) {
  try {
    const { series, coursId, serieType } = await req.json();
    if (!series?.length) return NextResponse.json({ error: "series vide" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const results: { id: string; status: string; titre?: string; newId?: string; error?: string }[] = [];

    for (const qcm of series) {
      try {
        const { data: newSerie, error: serieErr } = await supabase
          .from("series")
          .insert({
            name: qcm.titre || `ExoTeach #${qcm.id_qcm}`,
            cours_id: coursId || null,
            type: serieType || "entrainement",
            timed: false, visible: false, score_definitif: false,
          })
          .select("id").single();

        if (serieErr || !newSerie) throw new Error(serieErr?.message || "Erreur série");

        for (let qi = 0; qi < (qcm.questions || []).length; qi++) {
          const q = qcm.questions[qi];
          const { data: newQ } = await supabase.from("questions").insert({
            text: stripHtml(q.question),
            type: "qcm_multiple", difficulty: 2,
            cours_id: coursId || null,
            justification: stripHtml(q.explications) || null,
            image_url: q.url_image_q || null,
          }).select("id").single();

          if (!newQ) continue;

          await supabase.from("options").insert(
            (q.answers || []).map((ans: any, idx: number) => ({
              question_id: newQ.id, label: indexToLabel(idx),
              text: stripHtml(ans.text), is_correct: ans.isTrue === true,
              order_index: idx,
              justification: stripHtml(ans.explanation) || null,
              image_url: ans.url_image || null,
            }))
          );

          await supabase.from("series_questions").insert({
            series_id: newSerie.id, question_id: newQ.id, order_index: qi,
          });
        }

        results.push({ id: String(qcm.id_qcm), status: "ok", titre: qcm.titre, newId: newSerie.id });
      } catch (err: any) {
        results.push({ id: String(qcm.id_qcm), status: "error", error: err.message });
      }
    }

    return NextResponse.json(
      { success: true, imported: results.filter(r => r.status === "ok").length, results },
      { headers: CORS }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS });
  }
}
