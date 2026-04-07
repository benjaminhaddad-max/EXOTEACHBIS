import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { serieId, fileName } = await req.json();
    if (!serieId) return NextResponse.json({ error: "serieId requis" }, { status: 400 });

    const safeName = (fileName || "upload.docx").replace(/\s+/g, "_");
    const storagePath = `examens/${serieId}/${Date.now()}_${safeName}`;

    // Create a signed upload URL (valid 10 minutes)
    const { data, error } = await supabase.storage
      .from("cours-pdfs")
      .createSignedUploadUrl(storagePath);

    if (error) {
      console.error("[upload-signed-url]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      storagePath,
    });
  } catch (e: any) {
    console.error("[upload-signed-url]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
