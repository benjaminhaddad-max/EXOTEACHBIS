import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

type ParsedOption = { label: string; text: string; is_correct: boolean };
type ParsedQuestion = {
  text: string;
  options: ParsedOption[];
  page?: number;
  has_image?: boolean;
  image_y_start?: number;
  image_y_end?: number;
};

// ─── Extract images: raster images + cropped vector regions ─────────────────

async function extractImages(
  pdfBytes: Buffer,
  questions: ParsedQuestion[],
): Promise<Record<number, Buffer>> {
  const mupdf = await import("mupdf");
  const sharp = (await import("sharp")).default;

  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  const totalPages = doc.countPages();
  const result: Record<number, Buffer> = {}; // questionIndex -> PNG buffer

  // 1. Extract raster images (filter watermarks)
  const sizeCounts: Record<number, number> = {};
  for (let p = 0; p < totalPages; p++) {
    const page = doc.loadPage(p);
    page.toStructuredText("preserve-images").walk({
      onImageBlock(_bbox: any, _t: any, image: any) {
        const key = image.toPixmap().asPNG().length;
        sizeCounts[key] = (sizeCounts[key] || 0) + 1;
      },
    });
  }
  const watermarkSizes = new Set(
    Object.entries(sizeCounts).filter(([, c]) => (c as number) > 3).map(([s]) => Number(s))
  );

  // Map: page number -> list of raster images (non-watermark)
  const rasterImages: Record<number, { y: number; png: Buffer }[]> = {};
  for (let p = 0; p < totalPages; p++) {
    const page = doc.loadPage(p);
    page.toStructuredText("preserve-images").walk({
      onImageBlock(bbox: number[], _t: any, image: any) {
        const pixmap = image.toPixmap();
        const png = Buffer.from(pixmap.asPNG());
        if (watermarkSizes.has(png.length)) return;
        if (!rasterImages[p + 1]) rasterImages[p + 1] = [];
        rasterImages[p + 1].push({ y: bbox[1], png });
      },
    });
  }

  // 2. For each question, assign image
  const scale = 3;
  const rasterUsed: Record<number, number> = {}; // page -> next raster index

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    if (!q.has_image || !q.page) continue;

    const pageNum = q.page;

    // Try raster image first
    const rasters = rasterImages[pageNum] ?? [];
    const rIdx = rasterUsed[pageNum] ?? 0;
    if (rIdx < rasters.length) {
      result[qi] = rasters[rIdx].png;
      rasterUsed[pageNum] = rIdx + 1;
      continue;
    }

    // No raster available — crop the vector region from the rendered page
    if (q.image_y_start != null && q.image_y_end != null) {
      try {
        const page = doc.loadPage(pageNum - 1);
        const pix = page.toPixmap([scale, 0, 0, scale, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true);
        const fullPng = Buffer.from(pix.asPNG());

        const top = Math.max(0, Math.round(q.image_y_start * scale));
        const bottom = Math.min(pix.getHeight(), Math.round(q.image_y_end * scale));
        const height = bottom - top;

        if (height > 20) {
          const cropped = await sharp(fullPng)
            .extract({ left: 0, top, width: pix.getWidth(), height })
            .png()
            .toBuffer();
          result[qi] = cropped;
        }
      } catch (e) {
        console.error(`[extractImages] crop failed for Q${qi + 1}:`, e);
      }
    }
  }

  return result;
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

    // ── Anti-duplicate check
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

    // ── Download both PDFs
    const [sujetRes, correctionRes] = await Promise.all([fetch(sujetUrl), fetch(correctionUrl)]);
    if (!sujetRes.ok || !correctionRes.ok) {
      return NextResponse.json({ error: `Téléchargement PDFs échoué (sujet: ${sujetRes.status}, correction: ${correctionRes.status})` }, { status: 500 });
    }

    const [sujetBuf, correctionBuf] = await Promise.all([sujetRes.arrayBuffer(), correctionRes.arrayBuffer()]);
    const sujetBuffer = Buffer.from(sujetBuf);

    // ── Claude API — extract questions with image positions
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 32000,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: sujetBuffer.toString("base64") } },
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(correctionBuf).toString("base64") } },
            {
              type: "text",
              text: `Tu reçois deux PDFs d'un QCM médical :
1. SUJET (1er PDF) : questions numérotées avec propositions A-E.
2. CORRECTION (2ème PDF) : bonnes réponses surlignées en vert.

COPIE EXACTEMENT le texte. Ne résume JAMAIS.

Pour chaque question :
- "page": numéro de page du SUJET (1-indexed)
- "has_image": true si un schéma/structure/molécule/graphique/tableau accompagne la question
- "image_y_start": coordonnée Y (en points PDF, depuis le haut de la page) où l'image COMMENCE. Pages = ~842 points de haut.
- "image_y_end": coordonnée Y où l'image SE TERMINE.
Si pas d'image, mettre has_image: false et omettre image_y_start/image_y_end.

JSON strict :
[{"text":"...","page":1,"has_image":true,"image_y_start":150,"image_y_end":320,"options":[{"label":"A","text":"...","is_correct":true},...]}]

- 5 options (A-E). NE DUPLIQUE PAS. 1 question = 1 entrée.`,
            },
          ],
        },
      ],
    });

    const msg = await stream.finalMessage();
    const responseText = msg.content.find((c) => c.type === "text")?.text ?? "[]";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);

    if (!jsonMatch) return NextResponse.json({ error: "Aucune question extraite." }, { status: 422 });

    let parsed: ParsedQuestion[];
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch { return NextResponse.json({ error: "Réponse IA invalide." }, { status: 422 }); }

    if (!parsed.length) return NextResponse.json({ error: "Aucune question trouvée." }, { status: 422 });

    // ── Extract images (raster + vector crops)
    let imageBuffers: Record<number, Buffer> = {};
    try {
      imageBuffers = await extractImages(sujetBuffer, parsed);
    } catch (e: any) {
      console.error("[extractImages]", e);
    }

    // Upload images to Supabase
    const imageUrls: Record<number, string> = {};
    for (const [qiStr, buf] of Object.entries(imageBuffers)) {
      const qi = Number(qiStr);
      const path = `questions/_pdf_images/${serieId}/q${qi + 1}.png`;
      const { error: uploadErr } = await supabase.storage
        .from("question-images")
        .upload(path, buf, { contentType: "image/png", upsert: true });

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("question-images").getPublicUrl(path);
        if (urlData?.publicUrl) imageUrls[qi] = urlData.publicUrl;
      }
    }

    // ── Insert questions
    let created = 0;
    let imagesAssigned = 0;

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i] as any;
      const imageUrl = imageUrls[i] ?? null;
      if (imageUrl) imagesAssigned++;

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

      await supabase.from("options").insert(
        q.options.map((opt: ParsedOption, idx: number) => ({
          question_id: newQ.id, label: opt.label, text: opt.text,
          is_correct: opt.is_correct, order_index: idx,
        }))
      );

      await supabase.from("series_questions").insert({
        series_id: serieId, question_id: newQ.id, order_index: i,
      });

      created++;
    }

    return NextResponse.json({
      success: true,
      message: `${created} questions importées, ${imagesAssigned} images extraites.`,
      count: created,
      imagesAssigned,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    console.error("[import-from-pdf]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
