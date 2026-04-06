import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

type ParsedOption = { label: string; text: string; is_correct: boolean };
type ParsedQuestion = { text: string; options: ParsedOption[]; has_image?: boolean; image_page?: number | null };

// ─── Server-side PDF page rendering ──────────────────────────────────────────

async function renderPdfPageToJpeg(pdfBytes: Buffer, pageNum: number): Promise<Buffer | null> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");

    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;
    if (pageNum > doc.numPages) return null;

    const page = await doc.getPage(pageNum);
    const vp = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(vp.width, vp.height);
    const ctx = canvas.getContext("2d");

    // Fill white background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, vp.width, vp.height);

    await page.render({ canvasContext: ctx as any, viewport: vp, canvas: canvas as any }).promise;

    return canvas.toBuffer("image/jpeg");
  } catch (e) {
    console.error("[renderPdfPage]", e);
    return null;
  }
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

Ta tâche :
- Extrais TOUTES les questions du sujet avec leurs propositions (A à E).
- Pour chaque proposition, détermine si elle est correcte en regardant la correction (surlignée en vert = correcte).

RÈGLES ABSOLUES — NE PAS RÉSUMER :
- COPIE EXACTEMENT le texte tel qu'il apparaît dans le PDF. Ne résume JAMAIS. Ne reformule JAMAIS.
- Si la question dit "Concernant la molécule X ci-dessous, cochez la(les) proposition(s) exacte(s) :", tu dois écrire EXACTEMENT ce texte.
- NE PAS écrire "Question sur X" ou "À propos de X". Copie le texte VERBATIM.
- Retire seulement le numéro de la question au début (ex: "1." ou "Q1.") et le "A." / "B." au début des options.
- Formules chimiques et mathématiques : garde-les telles quelles (ex: CH₃⁺, sp², etc.)

IMAGES — TRÈS IMPORTANT :
- Si la question contient une image, un schéma, une structure moléculaire, un graphique, ou TOUT élément visuel non-texte, mets "has_image": true.
- Si le texte fait référence à un visuel ("ci-dessous", "ci-contre", "représentée", "suivante", "schéma", "figure"), c'est qu'il y a une image : "has_image": true.
- "image_page" = numéro de la page du SUJET (1-indexed) où se trouve l'image/schéma.
- En cas de doute, préfère mettre has_image: true.

Réponds UNIQUEMENT en JSON strict, un array :
[
  {
    "text": "Texte EXACT copié du PDF",
    "has_image": false,
    "image_page": null,
    "options": [
      {"label": "A", "text": "Texte EXACT de la proposition A", "is_correct": true},
      {"label": "B", "text": "Texte EXACT de la proposition B", "is_correct": false}
    ]
  }
]

- Chaque question DOIT avoir exactement 5 options (A à E), sauf si le QCM en a moins.
- NE DUPLIQUE PAS les questions. Chaque question numérotée dans le PDF = 1 seule entrée dans le JSON.
- Respecte l'ordre des questions tel qu'il apparaît dans le PDF.`,
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

    // ── Render PDF pages that contain images ─────────────────────────────────
    const pagesNeeded = [...new Set(
      parsed.filter(q => q.has_image && q.image_page).map(q => q.image_page!)
    )];

    const pageImages: Record<number, string> = {};
    for (const pageNum of pagesNeeded) {
      const jpegBuf = await renderPdfPageToJpeg(sujetBuffer, pageNum);
      if (!jpegBuf) continue;

      const path = `questions/_pdf_pages/${serieId}/page_${pageNum}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("question-images")
        .upload(path, jpegBuf, { contentType: "image/jpeg", upsert: true });

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("question-images").getPublicUrl(path);
        if (urlData?.publicUrl) pageImages[pageNum] = urlData.publicUrl;
      }
    }

    // ── Insert questions in DB ───────────────────────────────────────────────
    let created = 0;

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      const imageUrl = (q.has_image && q.image_page && pageImages[q.image_page]) || null;

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

    return NextResponse.json({
      success: true,
      message: `${created} question${created > 1 ? "s" : ""} importée${created > 1 ? "s" : ""} depuis les PDFs.`,
      count: created,
      imagesUploaded: Object.keys(pageImages).length,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    console.error("[import-from-pdf]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
