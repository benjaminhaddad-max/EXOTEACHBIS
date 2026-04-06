export async function uploadPdf(
  file: File,
  folder: string
): Promise<{ url: string; path: string } | { error: string }> {
  const safeName = file.name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // é → e, etc.
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");                   // only ASCII-safe chars
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("path", path);

  const res = await fetch("/api/upload-pdf", { method: "POST", body: fd });
  const json = await res.json();

  if (!res.ok || json.error) {
    return { error: json.error ?? "Erreur upload" };
  }
  return { url: json.url, path: json.path };
}
