import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée." }, { status: 500 });
    }

    const { imageBase64, mediaType } = (await request.json()) as {
      imageBase64: string;
      mediaType: string;
    };

    if (!imageBase64) {
      return NextResponse.json({ error: "Aucune image fournie." }, { status: 400 });
    }

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: (mediaType || "image/png") as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `Analyse ce screenshot d'une page listant des cours (probablement un site éducatif type ExoTeach).

Extrais TOUS les noms de cours visibles dans l'image. Ignore les éléments de navigation, boutons, headers, etc. — ne garde que les noms de cours/chapitres.

Réponds UNIQUEMENT en JSON strict, un array de strings :
["Nom du cours 1", "Nom du cours 2", ...]

Si tu ne trouves aucun nom de cours, réponds : []`,
            },
          ],
        },
      ],
    });

    const text = msg.content.find((c) => c.type === "text")?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      return NextResponse.json({ courses: [] });
    }

    const courses: string[] = JSON.parse(jsonMatch[0]).filter(
      (c: unknown) => typeof c === "string" && c.trim().length > 0
    );

    return NextResponse.json({ courses });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    console.error("Extract cours from image error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
