import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * This endpoint is kept for backwards compatibility.
 * The original .docx is now stored during import (import-serie).
 * This just returns the URL to the stored file.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { serieId } = body;

    if (!serieId) {
      return NextResponse.json({ error: "serieId est requis" }, { status: 400 });
    }

    const supabase = await createClient();
    const storagePath = `examens/${serieId}/sujet.docx`;

    const { data: { publicUrl } } = supabase.storage
      .from("cours-pdfs")
      .getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: storagePath,
    });
  } catch (err: unknown) {
    console.error("generate-exam-pdf error:", err);
    return NextResponse.json(
      { error: "Erreur", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
