import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
// mupdf is ESM-only, loaded dynamically
let _mupdf: typeof import("mupdf") | null = null;
async function getMupdf() {
  if (!_mupdf) _mupdf = await import("mupdf");
  return _mupdf;
}

export const maxDuration = 300;

type ParsedOption = { label: string; text: string; is_correct: boolean };
type ParsedQuestion = { text: string; options: ParsedOption[]; page?: number };

// ─── PDF page → PNG using MuPDF (WASM, no native deps) ──────────────────────

async function renderPdfPageToPng(pdfBytes: Buffer, pageNum: number): Promise<Buffer | null> {
  const m = await getMupdf();
  const doc = m.Document.openDocument(pdfBytes, "application/pdf");
  const page = doc.loadPage(pageNum - 1); // 0-indexed
  const pixmap = page.toPixmap([2, 0, 0, 2, 0, 0], m.ColorSpace.DeviceRGB, false, true);
  const pngBytes = pixmap.asPNG();
  return Buffer.from(pngBytes);
}

async function getPdfPageCount(pdfBytes: Buffer): Promise<number> {
  const m = await getMupdf();
  const doc = m.Document.openDocument(pdfBytes, "application/pdf");
  return doc.countPages();
}

// ─── Route POST ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée." }, { status: 500 });
    }

    const { serieId, sujetUrl, correctionUrl, coursId } = (await req.json()) as {
      serieId: string;
      sujetUrl: string;
      correctionUrl: string;
      coursId: string | null;
    };

    if (!serieId || !sujetUrl || !correctionUrl) {
      return NextResponse.json({ error: "serieId, sujetUrl et correctionUrl requis" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // ── Anti-duplicate check ─────────────────────────────────────────────────
    const { data: existingQ } = await supabase
      .from("series_questions")
      .select("question_id")
      .eq("series_id", serieId)
      .limit(1);

    if (existingQ && existingQ.length > 0) {
      return NextResponse.json({
        error: "Cette série contient déjà des questions. Supprimez-les d'abord pour réimporter.",
      }, { status: 409 });
    }

    // ── Download both PDFs ───────────────────────────────────────────────────
    const [sujetRes, correctionRes] = await Promise.all([
      fetch(sujetUrl),
      fetch(correctionUrl),
    ]);

    if (!sujetRes.ok || !correctionRes.ok) {
      return NextResponse.json({ error: `Impossible de télécharger les PDFs (sujet: ${sujetRes.status}, correction: ${correctionRes.status})` }, { status: 500 });
    }

    const [sujetBuf, correctionBuf] = await Promise.all([
      sujetRes.arrayBuffer(),
      correctionRes.arrayBuffer(),
    ]);

    const sujetBuffer = Buffer.from(sujetBuf);
    const sujetB64 = sujetBuffer.toString("base64");
    const correctionB64 = Buffer.from(correctionBuf).toString("base64");

    // ── Claude API — extract questions ───────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 32000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: sujetB64 },
            },
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: correctionB64 },
            },
            {
              type: "text",
              text: `Tu reçois deux PDFs d'un QCM médical :
1. Le SUJET (premier PDF) : contient les questions numérotées avec les propositions A, B, C, D, E.
2. La CORRECTION (deuxième PDF) : même contenu mais avec les bonnes réponses surlignées en vert ou marquées d'une manière distinctive.

COPIE EXACTEMENT le texte. Ne résume JAMAIS. Retire seulement le numéro de question et le "A."/"B." au début des options.

Pour chaque question, indique "page" = numéro de page du SUJET (1-indexed, entier ≥ 1).

Réponds UNIQUEMENT en JSON strict :
[{"text":"...","page":1,"options":[{"label":"A","text":"...","is_correct":true},{"label":"B","text":"...","is_correct":false},...]}]

- 5 options (A-E) par question sauf si moins dans le PDF.
- NE DUPLIQUE PAS. 1 question = 1 entrée.`,
            },
          ],
        },
      ],
    });

    const msg = await stream.finalMessage();
    const responseText = msg.content.find((c) => c.type === "text")?.text ?? "[]";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      return NextResponse.json({ error: "Aucune question extraite du PDF." }, { status: 422 });
    }

    let parsed: ParsedQuestion[];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "Réponse IA invalide." }, { status: 422 });
    }

    if (!parsed.length) {
      return NextResponse.json({ error: "Aucune question trouvée." }, { status: 422 });
    }

    // ── Render ALL PDF pages to PNG and upload ───────────────────────────────
    const totalPages = await getPdfPageCount(sujetBuffer);
    const pageUrls: Record<number, string> = {};
    const renderErrors: string[] = [];

    for (let p = 1; p <= totalPages; p++) {
      try {
        const pngBuf = await renderPdfPageToPng(sujetBuffer, p);
        if (!pngBuf) { renderErrors.push(`page ${p}: null`); continue; }

        const path = `questions/_pdf_pages/${serieId}/page_${p}.png`;
        const { error: uploadErr } = await supabase.storage
          .from("question-images")
          .upload(path, pngBuf, { contentType: "image/png", upsert: true });

        if (uploadErr) { renderErrors.push(`page ${p} upload: ${uploadErr.message}`); continue; }

        const { data: urlData } = supabase.storage.from("question-images").getPublicUrl(path);
        if (urlData?.publicUrl) pageUrls[p] = urlData.publicUrl;
      } catch (e: any) {
        renderErrors.push(`page ${p}: ${e.message}`);
      }
    }

    // ── Insert questions in DB ───────────────────────────────────────────────
    let created = 0;
    const questionsPerPage = totalPages > 0 ? Math.ceil(parsed.length / totalPages) : 1;

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      const pageNum = q.page ?? Math.min(Math.floor(i / questionsPerPage) + 1, totalPages || 1);
      const imageUrl = pageUrls[pageNum] ?? null;

      const { data: newQ, error: qErr } = await supabase
        .from("questions")
        .insert({
          text: q.text,
          type: "qcm_multiple",
          difficulty: 2,
          cours_id: coursId ?? null,
          matiere_id: null,
          image_url: imageUrl,
        })
        .select("id")
        .single();

      if (qErr || !newQ) continue;

      const optionsToInsert = q.options.map((opt, idx) => ({
        question_id: newQ.id,
        label: opt.label,
        text: opt.text,
        is_correct: opt.is_correct,
        order_index: idx,
      }));
      await supabase.from("options").insert(optionsToInsert);

      await supabase.from("series_questions").insert({
        series_id: serieId,
        question_id: newQ.id,
        order_index: i,
      });

      created++;
    }

    const imagesCount = Object.keys(pageUrls).length;
    let message = `${created} question${created > 1 ? "s" : ""} importée${created > 1 ? "s" : ""}`;
    if (imagesCount > 0) message += ` avec ${imagesCount} pages d'images`;
    if (renderErrors.length > 0) message += ` (${renderErrors.length} erreurs de rendu)`;
    message += ".";

    return NextResponse.json({
      success: true,
      message,
      count: created,
      pagesRendered: imagesCount,
      renderErrors: renderErrors.length > 0 ? renderErrors : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    console.error("[import-from-pdf]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
