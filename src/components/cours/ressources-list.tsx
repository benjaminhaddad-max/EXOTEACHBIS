"use client";

import { FileText, Video, Link as LinkIcon, ExternalLink, Download, PlayCircle } from "lucide-react";
import type { Ressource } from "@/types/database";

interface Props {
  ressources: Ressource[];
  coursName: string;
  coursDescription?: string | null;
  coursId: string;
  userId: string;
}

export function RessourcesList({ ressources, coursName, coursDescription }: Props) {
  if (ressources.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
        <FileText className="mx-auto mb-3 h-10 w-10 text-gray-200" />
        <p className="text-sm font-medium text-gray-400">Aucune ressource disponible</p>
        <p className="mt-1 text-xs text-gray-300">Les ressources seront ajoutées prochainement.</p>
      </div>
    );
  }

  // Grouper par type pour afficher dans un ordre cohérent
  const pdfs = ressources.filter((r) => r.type === "pdf");
  const videos = ressources.filter((r) => r.type === "video" || r.type === "vimeo");
  const liens = ressources.filter((r) => r.type === "lien");

  return (
    <div className="space-y-6">
      {/* En-tête du cours */}
      {coursDescription && (
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-600 leading-relaxed">{coursDescription}</p>
        </div>
      )}

      {/* PDFs */}
      {pdfs.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <FileText className="h-4 w-4" />
            Documents PDF
          </h3>
          <div className="space-y-3">
            {pdfs.map((r) => (
              <PdfCard key={r.id} ressource={r} />
            ))}
          </div>
        </section>
      )}

      {/* Vidéos */}
      {videos.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <Video className="h-4 w-4" />
            Vidéos
          </h3>
          <div className="space-y-4">
            {videos.map((r) => (
              r.type === "vimeo" ? (
                <VimeoCard key={r.id} ressource={r} />
              ) : (
                <VideoCard key={r.id} ressource={r} />
              )
            ))}
          </div>
        </section>
      )}

      {/* Liens */}
      {liens.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <LinkIcon className="h-4 w-4" />
            Liens utiles
          </h3>
          <div className="space-y-2">
            {liens.map((r) => (
              <LienCard key={r.id} ressource={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── PDF Card ──────────────────────────────────────────────────────────────────

function PdfCard({ ressource }: { ressource: Ressource }) {
  const url = ressource.pdf_url;
  return (
    <div className="group flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-red-100">
      {/* Icône */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-red-50">
        <FileText className="h-6 w-6 text-red-500" />
      </div>

      {/* Texte */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900 truncate">{ressource.titre}</p>
        {ressource.sous_titre && (
          <p className="mt-0.5 text-sm text-gray-400 truncate">{ressource.sous_titre}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        {url && (
          <>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Voir
            </a>
            <a
              href={url}
              download
              className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-600"
            >
              <Download className="h-3.5 w-3.5" />
              Télécharger
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ── Video Card ────────────────────────────────────────────────────────────────

function VideoCard({ ressource }: { ressource: Ressource }) {
  const url = ressource.video_url;
  if (!url) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="p-4 pb-0">
        <p className="font-semibold text-gray-900">{ressource.titre}</p>
        {ressource.sous_titre && (
          <p className="mt-0.5 text-sm text-gray-400">{ressource.sous_titre}</p>
        )}
      </div>
      <div className="mt-3 overflow-hidden rounded-none">
        <video
          controls
          className="w-full max-h-[400px] bg-black"
          src={url}
          preload="metadata"
        />
      </div>
    </div>
  );
}

// ── Vimeo Card ────────────────────────────────────────────────────────────────

function VimeoCard({ ressource }: { ressource: Ressource }) {
  const rawId = ressource.vimeo_id ?? "";
  // Accepte un ID direct "123456789" ou une URL "https://vimeo.com/123456789"
  const vimeoId = rawId.includes("vimeo.com/")
    ? rawId.split("vimeo.com/")[1]?.split("?")[0]
    : rawId;

  if (!vimeoId) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">Vimeo</span>
          <p className="font-semibold text-gray-900">{ressource.titre}</p>
        </div>
        {ressource.sous_titre && (
          <p className="mt-0.5 text-sm text-gray-400">{ressource.sous_titre}</p>
        )}
      </div>
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}?byline=0&portrait=0&title=0`}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// ── Lien Card ─────────────────────────────────────────────────────────────────

function LienCard({ ressource }: { ressource: Ressource }) {
  const url = ressource.lien_url;
  if (!url) return null;

  const domain = (() => {
    try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
  })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-green-100"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-50">
        <ExternalLink className="h-5 w-5 text-green-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900 truncate group-hover:text-green-700 transition-colors">
          {ressource.lien_label || ressource.titre}
        </p>
        <p className="mt-0.5 text-xs text-gray-400 truncate">{domain}</p>
      </div>
      <ExternalLink className="h-4 w-4 flex-shrink-0 text-gray-300 group-hover:text-green-500 transition-colors" />
    </a>
  );
}
