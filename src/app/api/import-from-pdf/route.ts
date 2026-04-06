import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

type ParsedOption = { label: string; text: string; is_correct: boolean };
type ParsedQuestion = { text: string; options: ParsedOption[]; page?: number };
type ExtractedImage = { page: number; y: number; png: Buffer };

// ─── Extract content images from PDF (skip watermarks) ──────────────────────

async function extractContentImages(pdfBytes: Buffer): Promise<{ images: ExtractedImage[]; totalPages: number }> {
  const m = await import("mupdf");
  const doc = m.Document.openDocument(pdfBytes, "application/pdf");
  const totalPages = doc.countPages();

  // First pass: count image sizes to identify watermarks (repeated on >3 pages)
  const sizeCounts: Record<number, number> = {};
  for (let p = 0; p < totalPages; p++) {
    const page = doc.loadPage(p);
    const stext = page.toStructuredText("preserve-images");
    stext.walk({
      onImageBlock(_bbox: any, _transform: any, image: any) {
        const key = image.toPixmap().asPNG().length;
        sizeCounts[key] = (sizeCounts[key] || 0) + 1;
      },
    });
  }
  const watermarkSizes = new Set(
    Object.entries(sizeCounts).filter(([, c]) => (c as number) > 3).map(([s]) => Number(s))
  );

  // Second pass: extract only content images
  const images: ExtractedImage[] = [];
  for (let p = 0; p < totalPages; p++) {
    const page = doc.loadPage(p);
    const stext = page.toStructuredText("preserve-images");
    stext.walk({
      onImageBlock(bbox: number[], _transform: any, image: any) {
        const pixmap = image.toPixmap();
        const png = Buffer.from(pixmap.asPNG());
        if (watermarkSizes.has(png.length)) return;
        images.push({ page: p + 1, y: bbox[1], png });
      },
    });
  }

  return { images, totalPages };
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

    // ── Extract content images from sujet PDF ────────────────────────────────
    let contentImages: ExtractedImage[] = [];
    let totalPages = 0;
    try {
      const result = await extractContentImages(sujetBuffer);
      contentImages = result.images;
      totalPages = result.totalPages;
    } catch (e: any) {
      console.error("[extractContentImages]", e);
    }

    // Upload extracted images to Supabase, grouped by page
    const pageImageUrls: Record<number, string[]> = {};
    for (let i = 0; i < contentImages.length; i++) {
      const img = contentImages[i];
      const path = `questions/_pdf_images/${serieId}/p${img.page}_img${i}.png`;
      const { error: uploadErr } = await supabase.storage
        .from("question-images")
        .upload(path, img.png, { contentType: "image/png", upsert: true });

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("question-images").getPublicUrl(path);
        if (urlData?.publicUrl) {
          if (!pageImageUrls[img.page]) pageImageUrls[img.page] = [];
          pageImageUrls[img.page].push(urlData.publicUrl);
        }
      }
    }

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
2. La CORRECTION (deuxième PDF) : même contenu mais avec les bonnes réponses surlignées en vert.

COPIE EXACTEMENT le texte. Ne résume JAMAIS. Retire seulement le numéro de question et "A."/"B." au début des options.

Pour chaque question, indique :
- "page" = numéro de page du SUJET (1-indexed, entier ≥ 1)
- "has_image" = true si la question a un schéma/structure/image/tableau associé

Réponds UNIQUEMENT en JSON strict :
[{"text":"...","page":1,"has_image":false,"options":[{"label":"A","text":"...","is_correct":true},...]}]

- 5 options (A-E) par question sauf si moins.
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

    // ── Insert questions in DB with images ───────────────────────────────────
    let created = 0;
    let imagesAssigned = 0;

    // Track which page images have been assigned (consume in order)
    const pageImageIdx: Record<number, number> = {};

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i] as any;
      const pageNum = q.page ?? 1;
      const hasImage = q.has_image === true;

      // Assign image: take the next unassigned image from this page
      let imageUrl: string | null = null;
      if (hasImage && pageImageUrls[pageNum]?.length) {
        const idx = pageImageIdx[pageNum] ?? 0;
        if (idx < pageImageUrls[pageNum].length) {
          imageUrl = pageImageUrls[pageNum][idx];
          pageImageIdx[pageNum] = idx + 1;
          imagesAssigned++;
        }
      }

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

      const optionsToInsert = q.options.map((opt: ParsedOption, idx: number) => ({
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
      message: `${created} questions importées, ${imagesAssigned} images extraites du PDF.`,
      count: created,
      imagesExtracted: contentImages.length,
      imagesAssigned,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    console.error("[import-from-pdf]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
