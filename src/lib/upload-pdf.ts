export async function uploadPdf(
  file: File,
  folder: string
): Promise<{ url: string; path: string } | { error: string }> {
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name.replace(/\s+/g, "_")}`;
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
