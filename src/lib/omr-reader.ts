/**
 * OMR (Optical Mark Recognition) reader for QCM grids.
 * Reads bubble-filled answer sheets by pixel-level analysis.
 * Uses sharp for image processing — no external dependencies needed.
 *
 * Grid layout matches gen-grid/route.ts exactly:
 * - A4 page, 72 questions in 4 columns × 18 rows
 * - 2 rows per question (answer + remord)
 * - Student ID: 6 digits, each with 10 bubble choices (0-9)
 */

import sharp from "sharp";

// ─── Thresholds ──────────────────────────────────────────────────────────────

const FILL_THRESHOLD = 0.13; // ≥13% dark pixels = bubble filled
const DOUBT_THRESHOLD = 0.07; // 7-13% = doubtful

// ─── Grid constants (from gen-grid/route.ts) ─────────────────────────────────

const mm = (v: number) => v * 2.835; // mm to PDF points

const PW = 595.28; // A4 width in points
const PH = 841.89; // A4 height in points
const MX = mm(8); // left/right margin
const CW = PW - 2 * MX; // content width

// Header
const BAR_H = mm(20);
const Y_START = PH - mm(6); // top of content area (PDF coords, Y from bottom)

// Student ID
const DIGITS = 6;
const BIG_BOX = mm(5);
const BIG_GAP = mm(1.5);
const SMALL_BOX = mm(3.5);
const SMALL_GAP = mm(0.5);
const ID_GRID_W = DIGITS * (BIG_BOX + BIG_GAP) - BIG_GAP;
const ID_GRID_X = MX + CW - ID_GRID_W - mm(2);

// QCM Grid
const BOX = mm(3.5);
const HGAP = mm(1.5);
const NUM_W = mm(7);
const LABEL_H = mm(3);
const FRAME_PAD_T = mm(0.5);
const FRAME_PAD_B = mm(0.3);
const FRAME_H = FRAME_PAD_T + BOX + LABEL_H + BOX + FRAME_PAD_B;
const FRAME_GAP = mm(1.5);
const BOX_GROUP_W = 5 * BOX + 4 * HGAP;
const COL_W = NUM_W + BOX_GROUP_W + mm(2);
const COL_GAP = (CW - 4 * COL_W) / 3;

const FH = mm(5);
const LETTERS = ["A", "B", "C", "D", "E"];

// ─── Types ───────────────────────────────────────────────────────────────────

export type OMRResult = {
  studentId: string | null;
  studentName: null; // OMR can't read handwriting, always null
  answers: Record<string, string[]>; // "1" → ["A", "D"], "2" → ["C"]
  confidence: "ok" | "doubt";
  doubtfulQuestions: number[]; // question numbers with doubtful readings
};

// ─── Image analysis helpers ──────────────────────────────────────────────────

function measureRegion(
  pixels: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  size: number,
): number {
  const pad = Math.max(1, Math.floor(size / 7));
  let dark = 0;
  let total = 0;
  for (let dy = pad; dy < size - pad; dy++) {
    for (let dx = pad; dx < size - pad; dx++) {
      const py = Math.round(y) + dy;
      const px = Math.round(x) + dx;
      if (py >= 0 && py < height && px >= 0 && px < width) {
        total++;
        if (pixels[py * width + px] === 0) dark++; // 0 = black (after threshold)
      }
    }
  }
  return total > 0 ? dark / total : 0;
}

/**
 * Find the header bar (dark horizontal band spanning most of the page width).
 * Returns { top, bottom } in image pixel coordinates (Y from top).
 */
function findHeaderBar(
  pixels: Buffer,
  width: number,
  height: number,
): { top: number; bottom: number; left: number; right: number } {
  let barTop = -1;
  let barBottom = -1;
  let barLeft = width;
  let barRight = 0;

  for (let y = 0; y < Math.min(height, Math.round(height * 0.15)); y++) {
    let dark = 0;
    let firstDark = width;
    let lastDark = 0;
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] === 0) {
        dark++;
        if (x < firstDark) firstDark = x;
        if (x > lastDark) lastDark = x;
      }
    }
    const ratio = dark / width;

    if (ratio > 0.4) {
      if (barTop < 0) barTop = y;
      barBottom = y;
      if (firstDark < barLeft) barLeft = firstDark;
      if (lastDark > barRight) barRight = lastDark;
    }
  }

  return {
    top: barTop >= 0 ? barTop : 0,
    bottom: barBottom >= 0 ? barBottom : 0,
    left: barLeft < width ? barLeft : 0,
    right: barRight > 0 ? barRight : width,
  };
}

// ─── Main OMR reader ─────────────────────────────────────────────────────────

export async function readOMR(
  pageImage: Buffer,
  questionCount: number = 72,
): Promise<OMRResult> {
  // Convert to grayscale binary image
  const { data: pixels, info } = await sharp(pageImage)
    .grayscale()
    .threshold(140) // binarize: dark=0, light=255
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // ─── Auto-alignment: detect header bar position ────────────────────────
  const header = findHeaderBar(pixels, w, h);

  // Expected header in PDF coords: top of bar = Y_START, bottom = Y_START - BAR_H
  // In image coords (flipped Y): top ≈ (PH - Y_START) * scale, bottom ≈ (PH - Y_START + BAR_H) * scale
  const expectedBarTopImg = (PH - Y_START) / PH * h;
  const expectedBarBottomImg = (PH - Y_START + BAR_H) / PH * h;

  // Compute offset: difference between expected and actual
  const yOffset = header.top - expectedBarTopImg;
  const yScale = (header.bottom - header.top) / (expectedBarBottomImg - expectedBarTopImg);

  // Scale factors
  const scaleXContent = (header.bottom - header.top) > 0
    ? (header.right - header.left) / CW
    : w / PW;
  const offsetXLeft = header.left - MX * scaleXContent;
  const scaleYContent = (header.bottom - header.top) / BAR_H;
  const offsetYContent = header.top - (PH - Y_START) * scaleYContent;

  // Two X converters: left-aligned for QCM, right-aligned for student ID
  // This handles non-uniform X distortion from scanners
  function toImgXLeft(pdfX: number): number {
    return Math.round(pdfX * scaleXContent + offsetXLeft);
  }
  function toImgXRight(pdfX: number): number {
    // Compute from right edge of header bar
    const distFromRight = (MX + CW) - pdfX;
    return Math.round(header.right - distFromRight * scaleXContent);
  }
  function toImgY(pdfY: number): number {
    return Math.round((PH - pdfY) * scaleYContent + offsetYContent);
  }

  const boxPx = Math.round(BOX * scaleXContent);
  const smallBoxPx = Math.round(SMALL_BOX * scaleXContent);

  // ─── Read Student ID ───────────────────────────────────────────────────
  const sectionTop = Y_START - BAR_H - mm(6);
  let gy = sectionTop;
  gy -= mm(3); // title "Saisir votre N°"
  gy -= BIG_BOX * 1.5 + mm(2); // write-in boxes

  // Correction: shift grid X left by one column to compensate for
  // systematic scanner distortion on the right side of the page
  const adjustedIdGridX = ID_GRID_X - (BIG_BOX + BIG_GAP);

  const studentDigits: string[] = [];
  for (let col = 0; col < DIGITS; col++) {
    const bx = adjustedIdGridX + col * (BIG_BOX + BIG_GAP) + (BIG_BOX - SMALL_BOX) / 2;
    let bestRow = -1;
    let bestRatio = 0;

    for (let row = 0; row < 10; row++) {
      const ry = gy - row * (SMALL_BOX + SMALL_GAP);
      const ix = toImgXRight(bx); // RIGHT-aligned X for student ID
      const iy = toImgY(ry);
      const ratio = measureRegion(pixels, w, h, ix, iy, smallBoxPx);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestRow = row;
      }
    }

    studentDigits.push(bestRatio >= FILL_THRESHOLD ? String(bestRow) : "?");
  }

  const studentId = studentDigits.includes("?") ? null : studentDigits.join("");

  // ─── Read QCM Answers ──────────────────────────────────────────────────

  // Compute gridTop (QCM area start)
  const gridEndY = gy - 10 * (SMALL_BOX + SMALL_GAP);
  const yAfterPrenom = sectionTop - FH - mm(2) - FH;
  const sepY = Math.min(yAfterPrenom, gridEndY) - mm(3);
  const gridTop = sepY - mm(12);

  const answers: Record<string, string[]> = {};
  const doubtfulQuestions: number[] = [];

  for (let q = 0; q < questionCount; q++) {
    const col = Math.floor(q / 18);
    const row = q % 18;
    const cx = MX + col * (COL_W + COL_GAP);
    const frameTop = gridTop - row * (FRAME_H + FRAME_GAP);

    const r1y = frameTop - FRAME_PAD_T; // answer row top
    const r3y = r1y - BOX - LABEL_H; // remord row top
    const bx0 = cx + NUM_W;

    const answerRatios: number[] = [];
    const remordRatios: number[] = [];

    for (let li = 0; li < 5; li++) {
      const bx = bx0 + li * (BOX + HGAP);

      // Answer row (LEFT-aligned X for QCM area)
      const ax = toImgXLeft(bx);
      const ay = toImgY(r1y);
      answerRatios.push(measureRegion(pixels, w, h, ax, ay, boxPx));

      // Remord row
      const rx = toImgXLeft(bx);
      const ry = toImgY(r3y);
      remordRatios.push(measureRegion(pixels, w, h, rx, ry, boxPx));
    }

    // Remord logic: if any remord bubble is filled, use remord row
    const hasRemord = remordRatios.some(r => r >= FILL_THRESHOLD);
    const activeRatios = hasRemord ? remordRatios : answerRatios;

    const selected: string[] = [];
    let hasDoubt = false;

    for (let li = 0; li < 5; li++) {
      if (activeRatios[li] >= FILL_THRESHOLD) {
        selected.push(LETTERS[li]);
      } else if (activeRatios[li] >= DOUBT_THRESHOLD) {
        hasDoubt = true;
      }
    }

    if (hasDoubt) doubtfulQuestions.push(q + 1);
    answers[String(q + 1)] = selected;
  }

  return {
    studentId,
    studentName: null,
    answers,
    confidence: doubtfulQuestions.length > 0 ? "doubt" : "ok",
    doubtfulQuestions,
  };
}

/**
 * Convert a single PDF page (as PDF buffer) to a high-res PNG image.
 * Falls back to CloudConvert if local conversion isn't available.
 */
export async function pdfPageToImage(pdfBuffer: Buffer): Promise<Buffer> {
  // pdf-lib can't render to images. We need an external tool.
  // On macOS: use sips (available on all Macs)
  // On Vercel/Linux: use CloudConvert
  const { execSync } = await import("child_process");
  const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
  const tmpPdf = `/tmp/omr_page_${Date.now()}.pdf`;
  const tmpPng = `/tmp/omr_page_${Date.now()}.png`;

  try {
    writeFileSync(tmpPdf, pdfBuffer);

    // Try sips (macOS)
    try {
      execSync(`sips -s format png --resampleWidth 2480 "${tmpPdf}" --out "${tmpPng}" 2>/dev/null`);
      return readFileSync(tmpPng);
    } catch {
      // Not macOS, try CloudConvert
    }

    // Try pdftoppm (Linux with poppler)
    try {
      execSync(`pdftoppm -png -r 300 -singlefile "${tmpPdf}" "${tmpPng.replace('.png', '')}"`, { timeout: 10000 });
      return readFileSync(tmpPng);
    } catch {
      // Not available
    }

    // Fallback: use the convertDocxToPages approach (CloudConvert)
    const { convertDocxToPages } = await import("@/lib/convert-emf");
    const pages = await convertDocxToPages(pdfBuffer);
    if (pages.length > 0) return pages[0];

    throw new Error("No PDF-to-image converter available");
  } finally {
    try { unlinkSync(tmpPdf); } catch {}
    try { unlinkSync(tmpPng); } catch {}
  }
}
