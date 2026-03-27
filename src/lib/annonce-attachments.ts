export type AnnonceAttachment = {
  url: string;
  name: string;
  type: "image" | "pdf";
  size: number;
};

export function parseAnnonceAttachments(raw: unknown): AnnonceAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AnnonceAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.url !== "string" || !o.url.trim()) continue;
    const declared = o.type === "pdf" || o.type === "image" ? o.type : null;
    const type: "image" | "pdf" =
      declared ?? (/\.pdf(\?|#|$)/i.test(o.url) ? "pdf" : "image");
    out.push({
      url: o.url,
      name:
        typeof o.name === "string" && o.name.trim()
          ? o.name
          : type === "pdf"
            ? "Document.pdf"
            : "Image",
      type,
      size: typeof o.size === "number" && o.size >= 0 ? o.size : 0,
    });
  }
  return out;
}
