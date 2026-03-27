import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const PDF_TYPE = "application/pdf";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)" }, { status: 400 });
  }

  const isImage = IMAGE_TYPES.includes(file.type);
  const isPdf = file.type === PDF_TYPE;

  if (!isImage && !isPdf) {
    return NextResponse.json(
      { error: "Type de fichier non supporté. Images (JPEG, PNG, GIF, WebP) et PDF uniquement." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const ext = file.name.split(".").pop() || (isImage ? "png" : "pdf");
  const ts = Date.now();
  const bucket = isImage ? "question-images" : "cours-pdfs";
  const storagePath = `annonces/${user.id}/${ts}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return NextResponse.json({
    url: urlData.publicUrl,
    name: file.name,
    type: isImage ? "image" : "pdf",
    size: file.size,
  });
}
