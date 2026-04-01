#!/usr/bin/env python3
"""
ACC Fabricator - Reconstitue les ACC par année à partir de PDFs par chapitre.
Supprime le filigrane Médisup Sciences et regroupe par année/session.
Analyse chaque page individuellement à 150 DPI pour une détection fiable.
"""

import fitz  # PyMuPDF
from PIL import Image, ImageEnhance
import numpy as np
import anthropic
import io
import os
import re
import json
import base64
import sys

# ─── Config ──────────────────────────────────────────────────────────────
INPUT_DIR = "/Users/benjaminhaddad-diplomasante/Downloads/drive-download-20260330T151516Z-1-001"
OUTPUT_DIR = "/Users/benjaminhaddad-diplomasante/Downloads/ACC_Chimie_Final"
MATIERE_NAME = "UE1 - Chimie"

ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env.vercel")
API_KEY = ""
with open(ENV_FILE) as f:
    for line in f:
        if line.startswith("ANTHROPIC_API_KEY="):
            API_KEY = line.strip().split("=", 1)[1].strip('"').strip("'")
            break

if not API_KEY:
    print("ERROR: ANTHROPIC_API_KEY not found")
    sys.exit(1)

client = anthropic.Anthropic(api_key=API_KEY)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── Step 1: Load all chapter PDFs ───────────────────────────────────────
files = sorted([f for f in os.listdir(INPUT_DIR) if f.lower().endswith(".pdf")])
print(f"📂 {len(files)} PDFs trouvés")

chapters = []
for fname in files:
    path = os.path.join(INPUT_DIR, fname)
    chapter_name = re.sub(
        r"^ACC\s*\(SUJET\)\s*-\s*N°\d+\s*-\s*(Chapitre\s+)?", "", fname.replace(".pdf", "")
    ).strip()
    doc = fitz.open(path)
    chapters.append({"name": chapter_name, "path": path, "pages": doc.page_count})
    print(f"  • {chapter_name}: {doc.page_count} pages")
    doc.close()

total_pages = sum(c["pages"] for c in chapters)
print(f"  Total: {total_pages} pages\n")

# ─── Step 2: Analyze EACH PAGE INDIVIDUALLY at 150 DPI ──────────────────
print("🔍 Analyse IA page par page (150 DPI)...")

def analyze_single_page(doc, page_idx):
    """Analyze a single page at high resolution for year + question detection."""
    pix = doc[page_idx].get_pixmap(dpi=150)
    b64 = base64.b64encode(pix.tobytes("jpeg")).decode()

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        messages=[{"role": "user", "content": [
            {"type": "text", "text": """Regarde cette page d'annale de chimie.

1) ANNÉE: Cherche un BANDEAU HORIZONTAL gris/noir avec une année (ex: "2020", "2018", "2024 – Session 1"). 
   C'est une barre horizontale avec l'année en gros au centre.
   IGNORE COMPLÈTEMENT "2024-2025" en haut à droite (c'est l'année scolaire).
   Si pas de bandeau → year: null
   
2) SESSION: Si le bandeau mentionne "Session 1" ou "Session 2", indique-la. Sinon null.

3) QUESTION: Numéro de la première question visible ("Question N", "Question n°N"). Si aucune → first_q: null

4) SKIP: true seulement si c'est une page de titre pure ou un tableau périodique sans aucune question.

Réponds UNIQUEMENT en JSON strict:
{"year": "2020", "session": null, "first_q": 1, "skip": false}"""},
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}}
        ]}],
    )

    text = msg.content[0].text if msg.content else "{}"
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    return {"year": None, "session": None, "first_q": None, "skip": False}


all_results = []

for ci, ch in enumerate(chapters):
    doc = fitz.open(ch["path"])
    print(f"\n  📖 {ch['name']} ({doc.page_count} pages)")

    chapter_results = []
    for pi in range(doc.page_count):
        print(f"    Page {pi+1}/{doc.page_count}...", end=" ", flush=True)
        r = analyze_single_page(doc, pi)
        chapter_results.append(r)
        yr = r.get("year", "?")
        fq = r.get("first_q", "?")
        print(f"✓ year={yr} q={fq}")

    doc.close()

    # Propagate years WITHIN this chapter only
    current_year = None
    current_session = None
    for pi, r in enumerate(chapter_results):
        if r.get("year"):
            yr_str = str(r["year"])
            if re.match(r"^\d{4}$", yr_str) and 2005 <= int(yr_str) <= 2026:
                current_year = yr_str
                current_session = r.get("session")
        
        final_year = str(r["year"]) if r.get("year") and re.match(r"^\d{4}$", str(r["year"])) and 2005 <= int(str(r["year"])) <= 2026 else current_year

        all_results.append({
            "ci": ci, "pi": pi,
            "chapter": ch["name"],
            "year": final_year,
            "session": r.get("session") or current_session,
            "first_q": r.get("first_q"),
            "skip": r.get("skip", False),
        })

    years_in_ch = set(ar["year"] for ar in all_results if ar["ci"] == ci and ar["year"])
    print(f"    → Années: {sorted(years_in_ch)}")

print(f"\n📊 {len(all_results)} pages analysées")

# ─── Step 3: Group by year/session ──────────────────────────────────────
groups = {}
for r in all_results:
    if r["skip"] or not r["year"]:
        continue
    key = f"{r['year']}"
    if r["session"]:
        key += f" – {r['session']}"
    if key not in groups:
        groups[key] = {"pages": []}
    groups[key]["pages"].append(r)

sorted_keys = sorted(groups.keys(), reverse=True)
print(f"\n📋 {len(sorted_keys)} épreuves détectées:")
for key in sorted_keys:
    g = groups[key]
    print(f"  • {key}: {len(g['pages'])} pages")

# ─── Step 4: Sort pages by question number within each group ────────────
for key in sorted_keys:
    pages = groups[key]["pages"]
    last_q = 0
    sub = 0
    for p in pages:
        fq = p.get("first_q")
        if fq is not None:
            last_q = fq
            sub = 0
        else:
            sub += 1
        p["sort_q"] = last_q
        p["sub"] = sub

    groups[key]["pages"] = sorted(pages, key=lambda p: (p["sort_q"], p["sub"], p["ci"], p["pi"]))

# ─── Step 5: Build clean PDFs ───────────────────────────────────────────
print(f"\n🔧 Construction des PDFs nettoyés...")

def clean_page_surgical(src_doc, page_idx):
    """Extract native bands, remove watermark, upscale 2x, boost text."""
    page = src_doc[page_idx]
    images = page.get_images(full=True)

    bands = []
    for img_info in images:
        xref = img_info[0]
        base = src_doc.extract_image(xref)
        pil = Image.open(io.BytesIO(base["image"])).convert("L")
        arr = np.array(pil).astype(np.float32)

        for wm_val in [63, 127, 190]:
            arr[(arr >= wm_val - 4) & (arr <= wm_val + 4)] = 255.0
        arr[(arr >= 196) & (arr <= 253)] = 255.0

        result = arr.copy()
        result[arr <= 55] = (arr[arr <= 55] / 55.0) * 120.0
        table = (arr > 55) & (arr <= 195)
        result[table] = np.clip(arr[table] * 0.7, 0, 200)

        bw, bh = pil.size
        cleaned = Image.fromarray(result.astype(np.uint8))
        cleaned = cleaned.resize((bw * 2, bh * 2), Image.LANCZOS)
        bands.append(cleaned)

    if not bands:
        return None

    w = bands[0].size[0]
    total_h = sum(b.size[1] for b in bands)
    full = Image.new("L", (w, total_h), 255)
    y = 0
    for b in bands:
        full.paste(b, (0, y))
        y += b.size[1]

    arr_full = np.array(full)
    h, w = arr_full.shape
    arr_full[:int(h * 0.052), :int(w * 0.22)] = 255
    arr_full[:int(h * 0.024), int(w * 0.72):] = 255
    arr_full[int(h * 0.965):, :] = 255

    img_out = Image.fromarray(arr_full)
    img_out = ImageEnhance.Sharpness(img_out).enhance(1.3)
    return img_out


open_docs = {}
def get_doc(ci):
    if ci not in open_docs:
        open_docs[ci] = fitz.open(chapters[ci]["path"])
    return open_docs[ci]


for key in sorted_keys:
    pages = groups[key]["pages"]
    out_path = os.path.join(OUTPUT_DIR, f"{MATIERE_NAME} - ACC {key}.pdf")
    print(f"  📄 {key} ({len(pages)} pages)...", end=" ", flush=True)

    new_doc = fitz.open()
    for p in pages:
        src_doc = get_doc(p["ci"])
        src_page = src_doc[p["pi"]]
        clean_img = clean_page_surgical(src_doc, p["pi"])
        if clean_img is None:
            continue
        buf = io.BytesIO()
        clean_img.save(buf, format="JPEG", quality=95)
        pw = src_page.rect.width
        ph = src_page.rect.height
        new_page = new_doc.new_page(width=pw, height=ph)
        new_page.insert_image(new_page.rect, stream=buf.getvalue())

    new_doc.save(out_path)
    new_doc.close()
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"✓ ({size_mb:.1f} MB)")

for doc in open_docs.values():
    doc.close()

print(f"\n✅ Terminé ! {len(sorted_keys)} PDFs dans: {OUTPUT_DIR}")
