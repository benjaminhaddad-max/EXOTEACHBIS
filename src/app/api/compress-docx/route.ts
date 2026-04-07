import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import sharp from "sharp";

export const maxDuration = 60;

/**
 * Compress a DOCX file stored on Supabase Storage by converting TIFF→JPEG.
 * POST: { storagePath: string } → { compressedPath: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { storagePath } = await req.json();
    if (!storagePath) return NextResponse.json({ error: "storagePath requis" }, { status: 400 });

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Download original from Storage
    console.log(`[compress-docx] Downloading ${storagePath}...`);
    const { data: fileData, error: dlErr } = await serviceClient.storage.from("cours-pdfs").download(storagePath);
    if (dlErr || !fileData) return NextResponse.json({ error: "Fichier introuvable: " + dlErr?.message }, { status: 404 });

    const buffer = Buffer.from(await fileData.arrayBuffer());
    console.log(`[compress-docx] Original: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

    // Open ZIP and convert TIFF/BMP → JPEG
    const zip = await JSZip.loadAsync(buffer);
    const mediaFiles = Object.keys(zip.files).filter(f => /\.(tiff|tif|bmp)$/i.test(f));

    if (mediaFiles.length === 0) {
      // No TIFF images, return original path
      return NextResponse.json({ compressedPath: storagePath, converted: 0 });
    }

    let converted = 0;
    for (const mediaPath of mediaFiles) {
      const imgFile = zip.file(mediaPath);
      if (!imgFile) continue;
      try {
        const imgBuf = await imgFile.async("nodebuffer");
        const jpegBuf = await sharp(imgBuf).jpeg({ quality: 75 }).toBuffer();
        const jpegName = mediaPath.replace(/\.(tiff|tif|bmp)$/i, ".jpeg");
        zip.remove(mediaPath);
        zip.file(jpegName, jpegBuf);

        // Update rels to point to JPEG
        const relsFile = zip.file("word/_rels/document.xml.rels");
        if (relsFile) {
          let rels = await relsFile.async("string");
          rels = rels.replace(mediaPath.replace("word/", ""), jpegName.replace("word/", ""));
          zip.file("word/_rels/document.xml.rels", rels);
        }
        converted++;
      } catch (e: any) {
        console.warn(`[compress-docx] Skip ${mediaPath}: ${e.message}`);
      }
    }

    // Generate compressed ZIP
    const compressedBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    console.log(`[compress-docx] Compressed: ${(compressedBuf.length / 1024 / 1024).toFixed(1)} MB (${converted} images converted)`);

    // Upload compressed version
    const compressedPath = storagePath.replace(/\.docx$/i, "_compressed.docx");
    const { error: upErr } = await serviceClient.storage
      .from("cours-pdfs")
      .upload(compressedPath, compressedBuf, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    if (upErr) return NextResponse.json({ error: "Upload compressé échoué: " + upErr.message }, { status: 500 });

    return NextResponse.json({ compressedPath, converted, originalMB: (buffer.length / 1024 / 1024).toFixed(1), compressedMB: (compressedBuf.length / 1024 / 1024).toFixed(1) });
  } catch (e: any) {
    console.error("[compress-docx]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
