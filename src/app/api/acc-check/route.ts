import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 300;

type PageInput = {
  side: "annales" | "chapitres";
  fileName: string;
  pageIndex: number;
  imageBase64: string;
};

type PageResult = {
  side: "annales" | "chapitres";
  fileName: string;
  pageIndex: number;
  year: string | null;
  session: string | null;
  questions: number[];
  isSkip: boolean;
};

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée." }, { status: 500 });
    }

    const body = await request.json();
    const { pages } = body as { pages: PageInput[] };

    if (!pages || pages.length === 0) {
      return NextResponse.json({ error: "Aucune page fournie." }, { status: 400 });
    }

    const BATCH = 8;
    const allResults: PageResult[] = [];

    for (let i = 0; i < pages.length; i += BATCH) {
      const batch = pages.slice(i, i + BATCH);

      const userContent: Anthropic.Messages.ContentBlockParam[] = [];
      userContent.push({
        type: "text",
        text: `Analyse ces ${batch.length} pages d'annales de concours médecine.

Pour CHAQUE page, identifie:
1. L'ANNÉE de l'épreuve: cherche un bandeau horizontal gris/noir avec l'année (ex: "2020", "2018", "2024 – Session 1"). IGNORE "2024-2025" en haut à droite (c'est l'année scolaire).
2. La SESSION si mentionnée ("Session 1", "Session 2").
3. TOUS les numéros de questions visibles sur la page. Cherche "Question N", "Question n°N", "Question N :", etc. Liste TOUS les numéros.
4. Si c'est une page à ignorer (titre pur, tableau périodique, page de données sans questions) → skip: true.

Réponds UNIQUEMENT en JSON strict:
[{"idx": 0, "year": "2020", "session": null, "questions": [1, 2], "skip": false}, ...]`,
      });

      for (let j = 0; j < batch.length; j++) {
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: batch[j].imageBase64 },
        });
        userContent.push({
          type: "text",
          text: `Image ${j}: ${batch[j].fileName} page ${batch[j].pageIndex + 1}`,
        });
      }

      const msg = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: userContent }],
      });

      const text = msg.content.find((c) => c.type === "text")?.text ?? "[]";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const item of parsed) {
            const idx = item.idx ?? item.page ?? 0;
            if (idx >= 0 && idx < batch.length) {
              const orig = batch[idx];
              allResults.push({
                side: orig.side,
                fileName: orig.fileName,
                pageIndex: orig.pageIndex,
                year: item.year || null,
                session: item.session || null,
                questions: Array.isArray(item.questions) ? item.questions.filter((q: unknown) => typeof q === "number") : [],
                isSkip: !!item.skip,
              });
            }
          }
        } catch {
          /* skip malformed batch */
        }
      }
    }

    return NextResponse.json({ pages: allResults });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    console.error("ACC Check error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
