/**
 * Test: import-serie Figure caption parsing — REAL document integration test
 * Tests against actual mammoth HTML from Bioch sujet .docx
 *
 * Run: node tests/test-import-figures.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const fs = await import("fs");

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

// ─── Helper: replicates the EXACT parser logic from route.ts ─────────────────

function stripTags(html) {
  return html
    .replace(/<img[^>]*>/gi, " [image] ")
    .replace(/<sub>(.*?)<\/sub>/gi, "$_{$1}$")
    .replace(/<sup>(.*?)<\/sup>/gi, "$^{$1}$")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simplified parseQcmLabelFormat that mirrors the REAL code logic
 * (same variable names, same flow, same conditions)
 */
function parseQcmLabelFormat(html) {
  const elemRegex = /<(p|li|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|li|h[1-6])>/gi;
  const paragraphs = [];
  let m;
  while ((m = elemRegex.exec(html)) !== null) {
    paragraphs.push({ raw: m[2], text: stripTags(m[2]), tag: m[1].toLowerCase() });
  }

  const LABELS = ["A", "B", "C", "D", "E"];
  let currentQuestion = null;
  let questionTextLines = [];
  const questions = [];
  const sections = [];

  const flushQuestion = () => {
    if (!currentQuestion) return;
    if (currentQuestion.options.length > 0) questions.push(currentQuestion);
  };

  let liCount = 0;
  let legendLiCount = 0;
  let pendingImages = [];
  let pendingCaptions = [];
  let pendingIntroLines = [];
  let currentSectionIdx;
  let seenFirstQcm = false;

  for (const p of paragraphs) {
    const text = p.text;
    const raw = p.raw;
    const imgMatch = raw.match(/<img[^>]+src="(data:image\/[^"]+)"/i);

    // QCM detection
    const labeledMatch = text.match(
      /^\s*\ufeff?\s*(?:QCM|Question|Q)\.?\s*(?:N°\s*)?(\d+)\s*[-:.–—]?\s*(.*)/iu
    );
    if (labeledMatch) {
      flushQuestion();

      const hasPendingContent =
        pendingImages.length > 0 || pendingIntroLines.length > 0 || pendingCaptions.length > 0;
      if (hasPendingContent) {
        const hasExerciceMarker = pendingIntroLines.some((l) => /^Exercice\s+\d+/i.test(l));
        const hasFigures = pendingImages.length > 0 || pendingCaptions.length > 0;
        const hasSubstantialIntro =
          pendingIntroLines.filter(
            (l) => l.length > 30 && !/^(Les \d+ questions|Bien lire)/i.test(l)
          ).length > 0;

        if (hasExerciceMarker || hasFigures || hasSubstantialIntro) {
          const exoLine = pendingIntroLines.find((l) => /^Exercice\s+\d+/i.test(l));
          const sectionTitle = exoLine || "";
          const introLines = pendingIntroLines.filter((l) => l !== exoLine);
          const introText = [...introLines, ...pendingCaptions].join("\n").trim();
          sections.push({
            title: sectionTitle,
            intro_text: introText,
            images: [...pendingImages],
          });
          currentSectionIdx = sections.length - 1;
        } else {
          currentSectionIdx = undefined;
        }
        pendingImages = [];
        pendingCaptions = [];
        pendingIntroLines = [];
      }

      currentQuestion = {
        text: labeledMatch[2].trim(),
        options: [],
        images: [],
        sectionIndex: currentSectionIdx,
        qcmNum: labeledMatch[1],
      };
      questionTextLines = [];
      liCount = 0;
      if (imgMatch) currentQuestion.images.push(imgMatch[1]);
      seenFirstQcm = true;
      continue;
    }

    // Image paragraph
    if (imgMatch && text.replace(/\[image\]/g, "").trim().length < 5) {
      if (!pendingIntroLines.length && !pendingCaptions.length && !questions.length && !seenFirstQcm) {
        continue;
      }
      // NEW: if inside a question with < 5 options, assign to question
      if (currentQuestion && currentQuestion.options.length < 5) {
        currentQuestion.images.push(imgMatch[1]);
        continue;
      }
      // Otherwise buffer for section — deduplicate
      const fp = imgMatch[1].slice(0, 200) + imgMatch[1].slice(-200);
      if (!pendingImages.some((pi) => pi.slice(0, 200) + pi.slice(-200) === fp)) {
        pendingImages.push(imgMatch[1]);
      }
      continue;
    }

    // Figure caption (no currentQuestion)
    if (/^Figure\s+\d+/i.test(text.trim()) && !currentQuestion) {
      pendingCaptions.push(text.trim());
      legendLiCount = 0;
      continue;
    }

    // Continuation after Figure caption (no currentQuestion)
    if (!currentQuestion && pendingCaptions.length > 0 && text.trim().length > 2) {
      const trimmed = text.trim();
      if (/^[:;(]/.test(trimmed) || /^[A-Z]{2,}\s/.test(trimmed) || trimmed.length < 80) {
        let line = trimmed;
        if (/^:/.test(line)) {
          const subLabel = String.fromCharCode(65 + legendLiCount);
          line = `(${subLabel}) ${line}`;
          legendLiCount++;
        }
        pendingCaptions[pendingCaptions.length - 1] += "\n" + line;
        continue;
      }
    }

    if (!currentQuestion) {
      const trimmed = text.trim();
      if (/^Exercice\s+\d+/i.test(trimmed)) {
        pendingIntroLines = [trimmed];
        continue;
      }
      if (
        trimmed.length > 10 &&
        (pendingImages.length > 0 ||
          pendingCaptions.length > 0 ||
          (seenFirstQcm && pendingIntroLines.length >= 0))
      ) {
        if (
          !/^\d{4}|^(UNIVERSITÉ|INFORMATIONS|RECOMMANDATIONS|À LIRE|Vérifier|Les correcteurs|Aucun candidat|Veiller|Ne pas|Les calculatrices|Les questions sans|Une seule|Merci de|Durée|Le sujet contient|L'épreuve comporte|Concours|BIOLOGIE|CORRECTION)/i.test(
            trimmed
          )
        ) {
          pendingIntroLines.push(trimmed);
        }
      }
      continue;
    }

    // Options (li)
    if (p.tag === "li" && text.trim().length > 2 && currentQuestion.options.length < 5) {
      const optLabelMatch = text.match(/^\s*([A-E])\s*[.):\t]\s*(.+)/);
      if (optLabelMatch) {
        currentQuestion.options.push({
          label: optLabelMatch[1].toUpperCase(),
          text: optLabelMatch[2].trim(),
          is_correct: false,
        });
      } else {
        currentQuestion.options.push({
          label: LABELS[liCount] || String.fromCharCode(65 + liCount),
          text: text.trim(),
          is_correct: false,
        });
      }
      liCount++;
      continue;
    }

    // Extra <li> after 5 options
    if (p.tag === "li" && currentQuestion.options.length >= 5) {
      const liImgMatch = p.raw.match(/<img[^>]+src="(data:image\/[^"]+)"/i);
      if (liImgMatch) {
        const liFp = liImgMatch[1].slice(0, 200) + liImgMatch[1].slice(-200);
        if (!pendingImages.some((pi) => pi.slice(0, 200) + pi.slice(-200) === liFp)) {
          pendingImages.push(liImgMatch[1]);
        }
      } else if (/^Figure\s+\d+/i.test(text.trim())) {
        pendingCaptions.push(text.trim());
        legendLiCount = 0;
      } else if (pendingCaptions.length > 0 && text.trim().length > 2) {
        let line = text.trim();
        if (/^:/.test(line)) {
          const subLabel = String.fromCharCode(65 + legendLiCount);
          line = `(${subLabel}) ${line}`;
          legendLiCount++;
        }
        pendingCaptions[pendingCaptions.length - 1] += "\n" + line;
      } else if (text.trim().length > 10) {
        pendingIntroLines.push(text.trim());
      }
      continue;
    }

    // Labeled option in <p>
    const optMatch = text.match(/^\s*([A-E])\s*[.):\t]\s*(.*)/);
    if (optMatch && currentQuestion) {
      currentQuestion.options.push({
        label: optMatch[1].toUpperCase(),
        text: optMatch[2].trim(),
        is_correct: false,
      });
      liCount = 0;
      continue;
    }

    if (text.trim().length < 3) continue;

    // Non-li after 5 options
    if (
      currentQuestion &&
      currentQuestion.options.length >= 5 &&
      p.tag !== "li" &&
      !/^\s*[A-E]\s*[.):\t]/.test(text)
    ) {
      const trimmed = text.trim();
      if (/^Figure\s+\d+/i.test(trimmed)) {
        pendingCaptions.push(trimmed);
        legendLiCount = 0;
      } else if (pendingCaptions.length > 0 && trimmed.length > 2) {
        let line = trimmed;
        if (/^:/.test(line)) {
          const subLabel = String.fromCharCode(65 + legendLiCount);
          line = `(${subLabel}) ${line}`;
          legendLiCount++;
        }
        if (/^[:;(]/.test(trimmed) || /^[A-Z]{2,}\s/.test(trimmed) || trimmed.length < 80) {
          pendingCaptions[pendingCaptions.length - 1] += "\n" + line;
        } else if (trimmed.length > 10) {
          pendingIntroLines.push(trimmed);
        }
      } else if (trimmed.length > 10) {
        pendingIntroLines.push(trimmed);
      }
      continue;
    }

    liCount = 0;
    questionTextLines.push(text.trim());
  }

  flushQuestion();

  // Post-parse deduplication
  for (const q of questions) {
    if (q.images.length > 0 && q.sectionIndex != null && sections[q.sectionIndex]) {
      const secImgFps = new Set(
        sections[q.sectionIndex].images.map((img) => img.slice(0, 200) + img.slice(-200))
      );
      q.images = q.images.filter((img) => !secImgFps.has(img.slice(0, 200) + img.slice(-200)));
    }
  }

  return { questions, sections };
}

// ─── REAL DOCUMENT TEST ──────────────────────────────────────────────────────

const docxPath = "/Users/benjaminhaddad-diplomasante/Downloads/Bioch sujet .docx";
if (!fs.existsSync(docxPath)) {
  console.error("Document not found:", docxPath);
  process.exit(1);
}

const mammoth = require("mammoth");
const buf = fs.readFileSync(docxPath);
const { value: html } = await mammoth.convertToHtml({ buffer: buf });

const { questions, sections } = parseQcmLabelFormat(html);

// ─── Test 1: Basic parsing ──────────────────────────────────────────────────
console.log("\n[Test 1] Basic parsing results");
assert(questions.length === 27, `27 questions parsed (got ${questions.length})`);
assert(sections.length > 0, `Sections created (got ${sections.length})`);

// ─── Test 2: Figure 2 and Figure 3 are separate captions ─────────────────────
console.log("\n[Test 2] Figure 2 and Figure 3 captions");
{
  // Find the section before QCM 17 (contains Figures 2 & 3)
  const sec = sections.find((s) => s.intro_text.includes("Figure 2") && s.intro_text.includes("Figure 3"));
  assert(!!sec, "Section with both Figure 2 and Figure 3 found");

  if (sec) {
    // Check Figure 2 caption is separate from Figure 3
    const lines = sec.intro_text.split("\n");
    const fig2Line = lines.findIndex((l) => l.startsWith("Figure 2"));
    const fig3Line = lines.findIndex((l) => l.startsWith("Figure 3"));
    assert(fig2Line >= 0, `Figure 2 caption found at line ${fig2Line}`);
    assert(fig3Line >= 0, `Figure 3 caption found at line ${fig3Line}`);
    assert(fig3Line > fig2Line, `Figure 3 comes after Figure 2`);

    // Check (A) and (B) labels on Figure 3's sub-descriptions
    const fig3SubLines = lines.slice(fig3Line + 1);
    const hasA = fig3SubLines.some((l) => l.includes("(A)"));
    const hasB = fig3SubLines.some((l) => l.includes("(B)"));
    assert(hasA, `Figure 3 has (A) sub-description: "${fig3SubLines.find((l) => l.includes("(A)"))?.substring(0, 60)}"`);
    assert(hasB, `Figure 3 has (B) sub-description: "${fig3SubLines.find((l) => l.includes("(B)"))?.substring(0, 60)}"`);

    // Make sure (A) is NOT (F) or (G)
    const hasF = fig3SubLines.some((l) => l.includes("(F)"));
    const hasG = fig3SubLines.some((l) => l.includes("(G)"));
    assert(!hasF, "Figure 3 does NOT have (F) — legendLiCount was properly reset");
    assert(!hasG, "Figure 3 does NOT have (G) — legendLiCount was properly reset");

    // Check Figure 1's sub-descriptions also have (A)-(E) not wrong letters
    const secFig1 = sections.find((s) => s.intro_text.includes("Figure 1"));
    if (secFig1) {
      const f1Lines = secFig1.intro_text.split("\n");
      const f1Subs = f1Lines.filter((l) => /^\(.\)/.test(l));
      console.log(`  ℹ Figure 1 has ${f1Subs.length} sub-items: ${f1Subs.map((l) => l.substring(0, 5)).join(", ")}`);
      assert(f1Subs.length > 0 && f1Subs[0].startsWith("(A)"), "Figure 1 sub-items start at (A)");
    }

    assert(sec.images.length === 2, `Section has 2 images for Fig 2 & 3 (got ${sec.images.length})`);
  }
}

// ─── Test 3: NO duplicate images in any section ──────────────────────────────
console.log("\n[Test 3] No duplicate images in sections");
{
  let anyDuplicates = false;
  for (let si = 0; si < sections.length; si++) {
    const s = sections[si];
    const fps = s.images.map((img) => img.slice(0, 200) + img.slice(-200));
    const unique = new Set(fps);
    if (unique.size < fps.length) {
      console.error(`  ✗ Section ${si} has ${fps.length} images but only ${unique.size} unique!`);
      anyDuplicates = true;
    }
  }
  assert(!anyDuplicates, "All sections have unique images");
}

// ─── Test 4: NO image in both a section AND a question referencing it ────────
console.log("\n[Test 4] No image in both section and question");
{
  let anyOverlap = false;
  for (const q of questions) {
    if (q.images.length > 0 && q.sectionIndex != null && sections[q.sectionIndex]) {
      const secFps = new Set(
        sections[q.sectionIndex].images.map((img) => img.slice(0, 200) + img.slice(-200))
      );
      for (const qImg of q.images) {
        const qFp = qImg.slice(0, 200) + qImg.slice(-200);
        if (secFps.has(qFp)) {
          console.error(`  ✗ QCM ${q.qcmNum} has image also in section ${q.sectionIndex}`);
          anyOverlap = true;
        }
      }
    }
  }
  assert(!anyOverlap, "No image appears in both a section and its question");
}

// ─── Test 5: Image inside QCM 19 goes to question ───────────────────────────
console.log("\n[Test 5] Image inside QCM 19 (amino acids table)");
{
  const q19 = questions.find((q) => q.qcmNum === "19");
  assert(!!q19, "QCM 19 found");
  assert(
    q19?.images.length >= 1,
    `QCM 19 has >= 1 question-level image (got ${q19?.images.length})`
  );

  // The section for QCM 20 should NOT have QCM 19's image
  const q20 = questions.find((q) => q.qcmNum === "20");
  if (q20?.sectionIndex != null && sections[q20.sectionIndex]) {
    const sec20 = sections[q20.sectionIndex];
    const q19ImgFps = new Set(
      (q19?.images || []).map((img) => img.slice(0, 200) + img.slice(-200))
    );
    const overlap = sec20.images.some(
      (img) => q19ImgFps.has(img.slice(0, 200) + img.slice(-200))
    );
    assert(!overlap, "QCM 20's section does NOT contain QCM 19's image");
  }
}

// ─── Test 6: Total images across all sections + questions = mammoth total ────
console.log("\n[Test 6] Image accounting");
{
  let sectionImgCount = sections.reduce((sum, s) => sum + s.images.length, 0);
  let questionImgCount = questions.reduce((sum, q) => sum + q.images.length, 0);
  const totalImages = (html.match(/<img\s/gi) || []).length;
  // We skip 1 image (document header logo), so parsed = total - 1
  console.log(`  ℹ Total <img> in HTML: ${totalImages}`);
  console.log(`  ℹ Section images: ${sectionImgCount}`);
  console.log(`  ℹ Question images: ${questionImgCount}`);
  console.log(`  ℹ Parsed total: ${sectionImgCount + questionImgCount}`);
  // No parsed image count should exceed total
  assert(
    sectionImgCount + questionImgCount <= totalImages,
    `Parsed images (${sectionImgCount + questionImgCount}) <= total HTML images (${totalImages})`
  );
  // Each image should appear exactly once
  const allImgFps = [
    ...sections.flatMap((s) => s.images),
    ...questions.flatMap((q) => q.images),
  ].map((img) => img.slice(0, 200) + img.slice(-200));
  const uniqueImgs = new Set(allImgFps);
  assert(
    uniqueImgs.size === allImgFps.length,
    `All ${allImgFps.length} parsed images are unique (${uniqueImgs.size} unique fingerprints)`
  );
}

// ─── Test 7: Sections detail ─────────────────────────────────────────────────
console.log("\n[Test 7] Sections detail");
for (let si = 0; si < sections.length; si++) {
  const s = sections[si];
  const questionsInSection = questions.filter((q) => q.sectionIndex === si);
  console.log(
    `  Section ${si}: ${s.images.length} img, ${questionsInSection.length} questions (QCM ${questionsInSection.map((q) => q.qcmNum).join(",")}), captions: ${(s.intro_text.match(/Figure \d+/g) || []).join(", ") || "none"}`
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed!");
}
