import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const path = formData.get("path") as string | null;

  if (!file || !path) {
    return NextResponse.json({ error: "Fichier ou chemin manquant" }, { status: 400 });
  }

  const supabase = await createClient();
  const bytes = await file.arrayBuffer();
  const contentType = file.type || "image/png";

  const { data, error } = await supabase.storage
    .from("question-images")
    .upload(path, bytes, { contentType, upsert: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("question-images").getPublicUrl(data.path);
  return NextResponse.json({ url: urlData.publicUrl, path: data.path });
}
