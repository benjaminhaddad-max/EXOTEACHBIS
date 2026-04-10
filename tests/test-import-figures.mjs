/**
 * Test: import-serie Figure caption parsing
 * Verifies that:
 * 1. Heading tags (h1-h6) are captured by elemRegex (fixes Figure 3 caption)
 * 2. Figure captions are correctly separated (Figure 2 vs Figure 3)
 * 3. Sub-descriptions (A), (B) are attached to the correct figure
 * 4. Image deduplication works
 * 5. Caption continuation works for <p> AND heading tags after 5 options
 *
 * Run: node tests/test-import-figures.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

// ─── Test 1: elemRegex captures headings ──────────────────────────────────────
console.log("\n[Test 1] elemRegex captures h1-h6 tags");
{
  const elemRegex = /<(p|li|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|li|h[1-6])>/gi;

  const html = `
    <p>Some paragraph</p>
    <h1>Figure 3 : Liaison de vWF</h1>
    <li>Option A</li>
    <h2>Another heading</h2>
  `;

  const results = [];
  let m;
  while ((m = elemRegex.exec(html)) !== null) {
    results.push({ tag: m[1].toLowerCase(), text: m[2].replace(/<[^>]+>/g, "").trim() });
  }

  assert(results.length === 4, `Extracted 4 elements (got ${results.length})`);
  assert(results[0].tag === "p", "First element is <p>");
  assert(results[1].tag === "h1", "Second element is <h1>");
  assert(results[1].text === "Figure 3 : Liaison de vWF", "h1 text is Figure 3 caption");
  assert(results[2].tag === "li", "Third element is <li>");
  assert(results[3].tag === "h2", "Fourth element is <h2>");
}

// ─── Test 2: Figure caption parsing with h1 ──────────────────────────────────
console.log("\n[Test 2] Figure captions parsed from mixed p/h1 tags");
{
  // Simulate the HTML mammoth produces for the biochimie document
  const html = `
    <ol><li>Option 1</li><li>Option 2</li><li>Option 3</li><li>Option 4</li><li>Aucune de ces propositions n'est exacte</li></ol>
    <p><img src="data:image/tiff;base64,AAAA" /></p>
    <p>Figure 2 : Dosage de la liaison du collagène à vWF incubé avec différentes granzymes</p>
    <p><img src="data:image/tiff;base64,BBBB" /></p>
    <h1>Figure 3 : Liaison de vWF au facteur VIII (FVIII)</h1>
    <ol><li><em>: dosage de la liaison de FVIII à vWF</em></li><li><em>: immunoprécipitation</em></li></ol>
    <p>FVIII HCh = chaine lourde de FVIII</p>
    <p>FVIII LCh = chaine légère de FVIII</p>
    <p><strong>QCM 17 : A propos des figures 2 et 3</strong></p>
  `;

  const elemRegex = /<(p|li|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|li|h[1-6])>/gi;
  const paragraphs = [];
  let m;
  while ((m = elemRegex.exec(html)) !== null) {
    const raw = m[2];
    const text = raw
      .replace(/<img[^>]*>/gi, " [image] ")
      .replace(/<[^>]+>/g, "")
      .replace(/&[^;]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const imgMatch = raw.match(/<img[^>]+src="(data:image\/[^"]+)"/i);
    paragraphs.push({ text, tag: m[1].toLowerCase(), imgUri: imgMatch?.[1] || null });
  }

  // Simulate parser state
  let currentQuestion = { options: [1, 2, 3, 4, 5] }; // QCM 16 with 5 options
  let pendingCaptions = [];
  let pendingImages = [];
  let pendingIntro = [];

  for (const p of paragraphs) {
    const text = p.text;
    const trimmed = text.trim();

    // QCM detection
    if (/^\s*(?:QCM|Question)\s*\d+/i.test(text)) {
      break; // Stop at QCM 17
    }

    // Image paragraph
    if (p.imgUri && text.replace(/\[image\]/g, "").trim().length < 5) {
      const fp = p.imgUri.slice(0, 200) + p.imgUri.slice(-200);
      if (!pendingImages.some((pi) => pi.slice(0, 200) + pi.slice(-200) === fp)) {
        pendingImages.push(p.imgUri);
      }
      continue;
    }

    // Options (skip first 5 li)
    if (p.tag === "li" && currentQuestion.options.length >= 5) {
      if (/^Figure\s+\d+/i.test(trimmed)) {
        pendingCaptions.push(trimmed);
      } else if (pendingCaptions.length > 0 && trimmed.length > 2) {
        pendingCaptions[pendingCaptions.length - 1] += "\n" + trimmed;
      }
      continue;
    }

    // Non-li after 5 options (p or heading)
    if (currentQuestion.options.length >= 5 && p.tag !== "li") {
      if (/^Figure\s+\d+/i.test(trimmed)) {
        pendingCaptions.push(trimmed);
      } else if (pendingCaptions.length > 0 && trimmed.length > 2) {
        if (/^[:;(]/.test(trimmed) || /^[A-Z]{2,}\s/.test(trimmed) || trimmed.length < 80) {
          pendingCaptions[pendingCaptions.length - 1] += "\n" + trimmed;
        } else if (trimmed.length > 10) {
          pendingIntro.push(trimmed);
        }
      } else if (trimmed.length > 10) {
        pendingIntro.push(trimmed);
      }
      continue;
    }
  }

  assert(pendingImages.length === 2, `2 images collected (got ${pendingImages.length})`);
  assert(pendingCaptions.length === 2, `2 separate captions (got ${pendingCaptions.length})`);
  assert(
    pendingCaptions[0].startsWith("Figure 2"),
    `Caption[0] starts with Figure 2: "${pendingCaptions[0]?.substring(0, 30)}"`
  );
  assert(
    pendingCaptions[1]?.startsWith("Figure 3"),
    `Caption[1] starts with Figure 3: "${pendingCaptions[1]?.substring(0, 30)}"`
  );
  assert(
    pendingCaptions[1]?.includes("dosage de la liaison de FVIII"),
    "Figure 3 caption includes (A) sub-description"
  );
  assert(
    pendingCaptions[1]?.includes("immunoprécipitation"),
    "Figure 3 caption includes (B) sub-description"
  );
  assert(
    !pendingCaptions[0]?.includes("immunoprécipitation"),
    "Figure 2 does NOT contain Figure 3's sub-descriptions"
  );
  assert(
    pendingCaptions[1]?.includes("FVIII HCh"),
    "FVIII definitions attached to Figure 3"
  );
}

// ─── Test 3: Image deduplication ──────────────────────────────────────────────
console.log("\n[Test 3] Image deduplication");
{
  const pendingImages = [];
  const images = [
    "data:image/tiff;base64,AABBCCDD1234567890",
    "data:image/tiff;base64,AABBCCDD1234567890", // duplicate
    "data:image/tiff;base64,DIFFERENT_IMAGE_DATA",
  ];

  for (const img of images) {
    const fp = img.slice(0, 200) + img.slice(-200);
    if (!pendingImages.some((pi) => pi.slice(0, 200) + pi.slice(-200) === fp)) {
      pendingImages.push(img);
    }
  }

  assert(pendingImages.length === 2, `Deduplicated to 2 images (got ${pendingImages.length})`);
  assert(pendingImages[0].includes("AABBCCDD"), "First image preserved");
  assert(pendingImages[1].includes("DIFFERENT"), "Second unique image preserved");
}

// ─── Test 4: Real document test (if available) ────────────────────────────────
console.log("\n[Test 4] Real document parsing (Bioch sujet .docx)");
{
  const fs = await import("fs");
  const docxPath = "/Users/benjaminhaddad-diplomasante/Downloads/Bioch sujet .docx";

  if (fs.existsSync(docxPath)) {
    const mammoth = require("mammoth");
    const buf = fs.readFileSync(docxPath);
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });

    const elemRegex = /<(p|li|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|li|h[1-6])>/gi;
    const paragraphs = [];
    let m;
    while ((m = elemRegex.exec(html)) !== null) {
      const raw = m[2];
      const text = raw
        .replace(/<img[^>]*>/gi, " [image] ")
        .replace(/<[^>]+>/g, "")
        .replace(/&[^;]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      paragraphs.push({ text, tag: m[1].toLowerCase() });
    }

    // Verify Figure 3 is captured as h1
    const fig3 = paragraphs.find(
      (p) => p.tag === "h1" && /Figure 3/i.test(p.text)
    );
    assert(!!fig3, "Figure 3 found as h1 tag in real document");
    assert(
      fig3?.text.includes("facteur VIII"),
      `Figure 3 text correct: "${fig3?.text.substring(0, 60)}"`
    );

    // Verify Figure 2 is captured as p
    const fig2 = paragraphs.find(
      (p) => p.tag === "p" && /^Figure 2/i.test(p.text)
    );
    assert(!!fig2, "Figure 2 found as p tag in real document");

    // Verify continuation <li> elements exist
    const fig3idx = paragraphs.indexOf(fig3);
    const nextLi = paragraphs[fig3idx + 1];
    assert(
      nextLi?.tag === "li" && nextLi.text.startsWith(":"),
      `Next element after Figure 3 is <li> starting with ':' (got tag=${nextLi?.tag} text="${nextLi?.text?.substring(0, 30)}")`
    );
  } else {
    console.log("  ⊘ Skipped (document not found at expected path)");
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed!");
}
