import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Service-role client for uploading to storage
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    // Validate auth
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Non authentifié." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const threadId = formData.get("thread_id") as string | null;
    const contentType = formData.get("content_type") as string | null;

    if (!file || !threadId || !contentType) {
      return NextResponse.json(
        { error: "file, thread_id et content_type sont requis." },
        { status: 400 }
      );
    }

    const validTypes = ["voice", "image", "video"];
    if (!validTypes.includes(contentType)) {
      return NextResponse.json(
        { error: "content_type doit être 'voice', 'image' ou 'video'." },
        { status: 400 }
      );
    }

    // Extract file extension
    const originalName = file.name || "file";
    const ext = originalName.split(".").pop() || "bin";

    // Generate storage path
    const storagePath = `${contentType}/${threadId}/${Date.now()}.${ext}`;

    const bytes = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";

    const serviceClient = getServiceClient();

    const { data, error } = await serviceClient.storage
      .from("qa-media")
      .upload(storagePath, bytes, { contentType: mimeType, upsert: true });

    if (error) {
      console.error("[qa/upload-media] Upload error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = serviceClient.storage
      .from("qa-media")
      .getPublicUrl(data.path);

    return NextResponse.json({ url: urlData.publicUrl, path: data.path });
  } catch (err: unknown) {
    console.error("[qa/upload-media]", err);
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
