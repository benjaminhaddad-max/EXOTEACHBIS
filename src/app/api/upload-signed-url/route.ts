import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    // Auth check with user's session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { serieId, fileName } = await req.json();
    if (!serieId) return NextResponse.json({ error: "serieId requis" }, { status: 400 });

    const safeName = (fileName || "upload.docx").replace(/\s+/g, "_");
    const storagePath = `examens/${serieId}/${Date.now()}_${safeName}`;

    // Use service role client for Storage operations (has full permissions)
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await serviceClient.storage
      .from("cours-pdfs")
      .createSignedUploadUrl(storagePath);

    if (error) {
      console.error("[upload-signed-url]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      token: data.token,
      path: data.path,
      storagePath,
    });
  } catch (e: any) {
    console.error("[upload-signed-url]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
