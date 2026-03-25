export async function uploadImage(
  file: File,
  folder: string
): Promise<{ url: string; path: string } | { error: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("path", path);

  const res = await fetch("/api/upload-image", { method: "POST", body: fd });
  const json = await res.json();

  if (!res.ok || json.error) {
    return { error: json.error ?? "Erreur upload image" };
  }
  return { url: json.url, path: json.path };
}
