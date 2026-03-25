"use client";

import { createClient } from "@/lib/supabase/client";

const BUCKET = "qa-media";

/**
 * Derives a file extension from a Blob's MIME type.
 * Falls back to a sensible default per content category.
 */
function getExtension(
  file: Blob,
  contentType: "voice" | "image" | "video"
): string {
  // Try to extract from the MIME type (e.g. "image/png" -> "png")
  const mimeExt = file.type?.split("/").pop()?.split(";")[0];
  if (mimeExt && mimeExt.length <= 5) return mimeExt;

  // Fallback per content type
  switch (contentType) {
    case "voice":
      return "webm";
    case "image":
      return "png";
    case "video":
      return "mp4";
  }
}

/**
 * Uploads a voice memo, image, or video to the `qa-media` Supabase bucket.
 *
 * @param file      - The Blob to upload
 * @param threadId  - Q&A thread ID (used as a folder)
 * @param contentType - Category of media
 * @returns The public URL and storage path, or an error string
 */
export async function uploadQaMedia(
  file: Blob,
  threadId: string,
  contentType: "voice" | "image" | "video"
): Promise<{ url: string; path: string } | { error: string }> {
  const supabase = createClient();

  const ext = getExtension(file, contentType);
  const path = `${contentType}/${threadId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || `${contentType}/${ext}`,
      upsert: false,
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return { url: publicUrl, path };
}
