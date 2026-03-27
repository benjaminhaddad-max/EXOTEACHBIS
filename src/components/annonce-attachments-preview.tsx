import { FileText } from "lucide-react";
import { parseAnnonceAttachments } from "@/lib/annonce-attachments";

export function AnnonceAttachmentsPreview({
  attachments,
  variant = "light",
}: {
  attachments: unknown;
  variant?: "light" | "dark";
}) {
  const list = parseAnnonceAttachments(attachments);
  if (list.length === 0) return null;

  const images = list.filter((a) => a.type === "image");
  const pdfs = list.filter((a) => a.type === "pdf");
  const dark = variant === "dark";

  return (
    <div className={dark ? "mt-2 space-y-2" : "mt-3 space-y-2"}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <a
              key={`img-${i}`}
              href={img.url}
              target="_blank"
              rel="noopener noreferrer"
              className={
                dark
                  ? "block rounded-lg overflow-hidden border border-white/10 hover:border-white/25 transition-colors"
                  : "block rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-300 transition-colors shadow-sm"
              }
            >
              <img
                src={img.url}
                alt={img.name}
                className="h-20 w-auto max-w-[200px] object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {pdfs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pdfs.map((pdf, i) => (
            <a
              key={`pdf-${i}`}
              href={pdf.url}
              target="_blank"
              rel="noopener noreferrer"
              className={
                dark
                  ? "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  : "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
              }
              style={
                dark
                  ? {
                      backgroundColor: "rgba(239,68,68,0.08)",
                      color: "#F87171",
                      border: "1px solid rgba(239,68,68,0.15)",
                    }
                  : undefined
              }
            >
              <FileText size={dark ? 11 : 12} />
              {pdf.name.length > 36 ? pdf.name.slice(0, 33) + "…" : pdf.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
