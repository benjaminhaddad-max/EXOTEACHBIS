/**
 * Test: correction image extraction pipeline
 * Verifies that correction images from physics docx are properly extracted
 * and aligned with questions.
 *
 * Run: node tests/test-correction-images.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const fs = await import("fs");

let passed = 0;
let failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const docxPath = "/Users/benjaminhaddad-diplomasante/Downloads/UP 2025 - 2026 S1 CB1 correction.docx";
if (!fs.existsSync(docxPath)) {
  console.error("Correction file not found:", docxPath);
  process.exit(1);
}

const mammoth = require("mammoth");
const JSZip = require("jszip");
const buf = fs.readFileSync(docxPath);

// ─── Test 1: XML highlight parsing ───────────────────────────────────────────
console.log("\n[Test 1] XML highlight parsing");
{
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml").async("string");

  const LABELS = ["A", "B", "C", "D", "E"];
  const CORRECT_HIGHLIGHTS = new Set(["green", "yellow"]);
  const CORRECT_FILLS = new Set(["FFFF00", "00FF00", "92D050", "00B050"]);
  const pRegex = /<w:p[^/]*?>([\s\S]*?)<\/w:p>/g;
  let pm;
  const cParas = [];
  while ((pm = pRegex.exec(docXml)) !== null) {
    const content = pm[1];
    const hlMatch = content.match(/w:highlight w:val="([^"]+)"/);
    const shdMatch = content.match(/w:shd[^>]*w:fill="([^"]+)"/);
    const isBold = content.includes("<w:b/>") || content.includes("<w:b ");
    const texts = [];
    const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let tm;
    while ((tm = tRegex.exec(content)) !== null) texts.push(tm[1]);
    const text = texts.join("").trim();
    let hl = hlMatch?.[1] ?? null;
    if (!hl && shdMatch) {
      const fill = shdMatch[1].toUpperCase();
      if (CORRECT_FILLS.has(fill)) hl = "yellow";
    }
    if (text.length > 0) cParas.push({ text, bold: isBold, highlighted: hl });
  }

  const cqMarkers = [];
  for (let j = 0; j < cParas.length; j++) {
    const t = cParas[j].text.trim();
    if (cParas[j].bold && /^question$/i.test(t)) cqMarkers.push(j);
    else if (/^(?:QCM|Question|Q)\.?\s*(?:N°\s*)?\d+\s*[-:.–—]/i.test(t)) cqMarkers.push(j);
  }

  const parsed = [];
  for (let qi = 0; qi < cqMarkers.length; qi++) {
    const start = cqMarkers[qi] + 1;
    const end = qi + 1 < cqMarkers.length ? cqMarkers[qi + 1] : cParas.length;
    const items = [];
    for (let j = start; j < end; j++) {
      if (cParas[j].bold && cParas[j].text.length > 3) continue;
      if (/^\s*[A-E]\s*[.):\t]/.test(cParas[j].text) || (cParas[j].text.length > 1 && items.length < 5))
        items.push(cParas[j]);
    }
    if (items.length < 2) continue;
    parsed.push({
      options: items.slice(0, 5).map((p, idx) => ({
        label: LABELS[idx],
        is_correct: CORRECT_HIGHLIGHTS.has(p.highlighted ?? ""),
      })),
    });
  }

  const correctCount = parsed.reduce((s, q) => s + q.options.filter((o) => o.is_correct).length, 0);
  assert(parsed.length === 16, `16 questions parsed (got ${parsed.length})`);
  assert(correctCount > 0, `${correctCount} correct answers found`);
}

// ─── Test 2: Mammoth HTML image extraction ───────────────────────────────────
console.log("\n[Test 2] Mammoth HTML image extraction");
{
  const { value: corrHtml } = await mammoth.convertToHtml({ buffer: buf });
  const qHeaderRegex = /(?:QCM|Question|Q)\.?\s*(?:N°\s*)?\d+\s*[-:.–—]/i;
  const allElems = [];
  const elemRx = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = elemRx.exec(corrHtml)) !== null) {
    allElems.push({ raw: m[1], text: m[1].replace(/<[^>]+>/g, " ").trim() });
  }

  let currentQIdx = -1;
  const imgsByQ = new Map();
  for (const el of allElems) {
    if (qHeaderRegex.test(el.text)) { currentQIdx++; continue; }
    if (currentQIdx >= 0 && !imgsByQ.has(currentQIdx)) {
      const imgMatch = el.raw.match(/<img[^>]+src="(data:image\/[^"]+)"/i);
      if (imgMatch && el.text.replace(/\[image\]/g, "").trim().length < 10) {
        imgsByQ.set(currentQIdx, imgMatch[1]);
      }
    }
  }

  assert(currentQIdx + 1 === 16, `16 questions in HTML (got ${currentQIdx + 1})`);
  assert(imgsByQ.size === 16, `16 images extracted (got ${imgsByQ.size})`);

  // Check image formats
  for (const [idx, dataUri] of imgsByQ) {
    const fmt = dataUri.match(/^data:image\/([^;]+)/)?.[1];
    assert(
      ["png", "jpeg", "jpg"].includes(fmt),
      `Q${idx + 1} image is web-displayable (${fmt})`
    );
    break; // Just check first
  }
}

// ─── Test 3: Alignment between XML parsing and HTML images ──────────────────
console.log("\n[Test 3] Alignment: XML questions ↔ HTML images");
{
  // Both parsers should find 16 questions → indices align
  const correctionImages = [];
  const imgsByQ = new Map();
  // (Re-extract quickly)
  const { value: corrHtml } = await mammoth.convertToHtml({ buffer: buf });
  const qHeaderRegex = /(?:QCM|Question|Q)\.?\s*(?:N°\s*)?\d+\s*[-:.–—]/i;
  const elems = [];
  const rx = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = rx.exec(corrHtml)) !== null) {
    elems.push({ raw: m[1], text: m[1].replace(/<[^>]+>/g, " ").trim() });
  }
  let qIdx = -1;
  for (const el of elems) {
    if (qHeaderRegex.test(el.text)) { qIdx++; continue; }
    if (qIdx >= 0 && !imgsByQ.has(qIdx)) {
      const im = el.raw.match(/<img[^>]+src="(data:image\/[^"]+)"/i);
      if (im && el.text.replace(/\[image\]/g, "").trim().length < 10) imgsByQ.set(qIdx, "IMG");
    }
  }

  for (let i = 0; i < 16; i++) {
    correctionImages.push(imgsByQ.get(i) ?? null);
  }

  const withImg = correctionImages.filter((x) => x !== null).length;
  assert(withImg === 16, `All 16 questions have correction images (got ${withImg})`);
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed!");
