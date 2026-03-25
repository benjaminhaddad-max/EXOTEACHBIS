"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Pencil, Eye, EyeOff, Upload, X, Loader2, Check, AlertCircle } from "lucide-react";
import { updateCoursInDossier } from "@/app/(admin)/admin/pedagogie/actions";
import { uploadPdf } from "@/lib/upload-pdf";
import type { Cours } from "@/types/database";

interface AdminCoursHeaderProps {
  cours: Cours & { dossier?: { id: string; name: string } | null };
}

export function AdminCoursHeader({ cours }: AdminCoursHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cours.name);
  const [description, setDescription] = useState(cours.description ?? "");
  const [pdfUrl, setPdfUrl] = useState(cours.pdf_url ?? "");
  const [pdfPath, setPdfPath] = useState(cours.pdf_path ?? "");
  const [nbPages, setNbPages] = useState(cours.nb_pages ?? 0);
  const [visible, setVisible] = useState(cours.visible);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") return;
    setUploading(true);
    setUploadMsg("Upload en cours...");
    const folder = `cours/${cours.dossier?.id ?? cours.id}`;
    const result = await uploadPdf(file, folder);
    if ("error" in result) {
      setUploadMsg(`Erreur: ${result.error}`);
      setUploading(false);
      return;
    }
    setPdfUrl(result.url);
    setPdfPath(result.path);
    setUploadMsg(file.name);
    setUploading(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateCoursInDossier(cours.id, {
        name, description, pdf_url: pdfUrl, pdf_path: pdfPath, nb_pages: nbPages, visible,
      });
      if (result.error) {
        showToast(result.error, false);
      } else {
        showToast("Sauvegardé", true);
        setEditing(false);
        // Reload to reflect changes
        window.location.reload();
      }
    });
  };

  const backHref = cours.dossier ? `/admin/pedagogie?dossier=${cours.dossier.id}` : "/admin/pedagogie";

  return (
    <>
      <div className="border-b border-gray-200 bg-white px-5 py-3 shadow-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link href={backHref} className="flex items-center gap-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold focus:border-navy focus:outline-none"
                autoFocus
              />
            ) : (
              <h1 className="text-sm font-bold text-gray-900 truncate">{cours.name}</h1>
            )}
            {cours.dossier && (
              <p className="text-xs text-gray-400">Dossier : {cours.dossier.name}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                  Annuler
                </button>

                {/* PDF Upload inline */}
                <label className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition ${uploading ? "border-indigo-200 bg-indigo-50 text-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploadMsg || (pdfUrl ? "Changer le PDF" : "Upload PDF")}
                  <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={uploading} />
                </label>

                <button
                  onClick={() => setVisible((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${visible ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"}`}
                >
                  {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {visible ? "Visible" : "Masqué"}
                </button>

                <button
                  onClick={handleSave}
                  disabled={isPending || uploading}
                  className="flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {(isPending || uploading) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {uploading ? "Upload..." : "Sauvegarder"}
                </button>
              </>
            ) : (
              <>
                <Link
                  href={`/cours/${cours.id}`}
                  target="_blank"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Vue élève
                </Link>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </button>
              </>
            )}
          </div>
        </div>

        {/* Description field in edit mode */}
        {editing && (
          <div className="mx-auto mt-2 max-w-7xl">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description du cours..."
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 focus:border-navy focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </>
  );
}
