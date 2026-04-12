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

// Header — bar is flush with page top in gen-grid
const BAR_H = mm(20);

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
  // Debug info (for diagnosing misreads in production)
  debug?: {
    alignMode: "header" | "bounds" | "raw";
    imageSize: { w: number; h: number };
    pageSize?: { w: number; h: number }; // actual PDF page size in points
    anchor: { imgX: number; imgY: number; imgRight: number; scale: number };
    detectedHeader?: { top: number; bottom: number; left: number; right: number };
    detectedBounds?: { top: number; bottom: number; left: number; right: number };
    studentDigits: string[]; // per-digit readout, "?" if unreadable
    studentDigitRatios: number[]; // darkness ratio of best bubble per digit
    nbAnswersFilled: number; // how many questions had any bubble detected
  };
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

/**
 * Find the bounding box of the actual page content, ignoring scanner margins.
 * Works by scanning from each edge inward and finding the first row/col whose
 * dark-pixel ratio exceeds a small threshold (filters out noise/speckles but
 * catches the header border, QCM frames, etc).
 *
 * Returns null if the page appears empty.
 */
function findContentBounds(
  pixels: Buffer,
  width: number,
  height: number,
): { top: number; bottom: number; left: number; right: number } | null {
  const ROW_THRESHOLD = 0.02; // 2% of row width dark = significant content
  const COL_THRESHOLD = 0.02;

  let top = -1, bottom = -1, left = -1, right = -1;

  // Scan from top down
  for (let y = 0; y < height; y++) {
    let dark = 0;
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] === 0) dark++;
    }
    if (dark / width > ROW_THRESHOLD) { top = y; break; }
  }

  // Scan from bottom up
  for (let y = height - 1; y >= 0; y--) {
    let dark = 0;
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] === 0) dark++;
    }
    if (dark / width > ROW_THRESHOLD) { bottom = y; break; }
  }

  if (top < 0 || bottom < 0 || bottom - top < height * 0.3) return null;

  // Scan from left, only within vertical content range
  const rangeH = bottom - top + 1;
  for (let x = 0; x < width; x++) {
    let dark = 0;
    for (let y = top; y <= bottom; y++) {
      if (pixels[y * width + x] === 0) dark++;
    }
    if (dark / rangeH > COL_THRESHOLD) { left = x; break; }
  }

  // Scan from right
  for (let x = width - 1; x >= 0; x--) {
    let dark = 0;
    for (let y = top; y <= bottom; y++) {
      if (pixels[y * width + x] === 0) dark++;
    }
    if (dark / rangeH > COL_THRESHOLD) { right = x; break; }
  }

  if (left < 0 || right < 0 || right - left < width * 0.3) return null;

  return { top, bottom, left, right };
}

// ─── Main OMR reader ─────────────────────────────────────────────────────────

export async function readOMR(
  pageImage: Buffer,
  questionCount: number = 72,
  pageDimensions?: { widthPts: number; heightPts: number },
): Promise<OMRResult> {
  // Use actual PDF page dimensions if provided, else fallback to A4
  const actualPW = pageDimensions?.widthPts ?? PW;
  const actualPH = pageDimensions?.heightPts ?? PH;

  // Convert to grayscale binary image
  const { data: pixels, info } = await sharp(pageImage)
    .grayscale()
    .normalize() // stretch contrast for scan robustness
    .threshold(140) // binarize: dark=0, light=255
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // ─── Robust header-relative alignment ──────────────────────────────────
  // Key insight: all content positions on the paper are known OFFSETS (in PDF points)
  // from the header bar. By detecting the header bar in the image and anchoring
  // everything to it, we're immune to PDF page dimension oddities, scanner margins,
  // re-wrapped PDFs, etc. The only requirement is that the header bar is detectable.
  //
  // 3-tier strategy:
  //   1) Header bar detected (top + bottom borders found)
  //   2) Content bounds detected (top = header bar top, width = content width)
  //   3) Raw fallback (clean PDF render)
  const header = findHeaderBar(pixels, w, h);
  const headerOK = (header.bottom - header.top) > 10
    && (header.right - header.left) > w * 0.3;

  const bounds = !headerOK ? findContentBounds(pixels, w, h) : null;

  // Anchor point: top-left of the header bar in IMAGE coordinates
  // Scale: image pixels per PDF point
  let anchorImgX: number; // image X of PDF X = MX (header bar left)
  let anchorImgY: number; // image Y of PDF Y = PH (header bar top)
  let anchorImgRight: number; // image X of PDF X = MX + CW (header bar right)
  let scale: number; // image px per PDF pt (scanners preserve aspect ratio → single scale)
  let alignMode: "header" | "bounds" | "raw";

  if (headerOK) {
    anchorImgX = header.left;
    anchorImgRight = header.right;
    anchorImgY = header.top;
    // Prefer X-based scale (more reliable — border lines span full width)
    scale = (header.right - header.left) / CW;
    alignMode = "header";
  } else if (bounds) {
    anchorImgX = bounds.left;
    anchorImgRight = bounds.right;
    anchorImgY = bounds.top; // top of bar = first content row
    scale = (bounds.right - bounds.left) / CW;
    alignMode = "bounds";
  } else {
    // Raw: assume image is exact A4 render
    anchorImgX = MX * (w / actualPW);
    anchorImgRight = (MX + CW) * (w / actualPW);
    anchorImgY = 0;
    scale = w / actualPW;
    alignMode = "raw";
  }

  // Convert PDF coordinates to image coordinates using the header anchor
  // For X: distance from PDF X = MX, in PDF points, times scale
  // For Y: distance from PDF Y = PH (header top), going DOWN in image as pdfY DECREASES
  const toImgXLeft = (pdfX: number) =>
    Math.round(anchorImgX + (pdfX - MX) * scale);
  // Right-anchored version (compensates for slight left/right scanner distortion)
  const toImgXRight = (pdfX: number) =>
    Math.round(anchorImgRight - ((MX + CW) - pdfX) * scale);
  const toImgY = (pdfY: number) =>
    Math.round(anchorImgY + (PH - pdfY) * scale);

  const scaleXVal = scale;
  const boxPx = Math.round(BOX * scale);
  const smallBoxPx = Math.round(SMALL_BOX * scale);

  console.log(`[omr] alignMode=${alignMode} img=${w}x${h} boxPx=${boxPx}`);

  // ─── Read Student ID ───────────────────────────────────────────────────
  // Replicate gen-grid layout exactly for correct position calculations
  const sectionTop = PH - BAR_H - mm(6);
  let gy = sectionTop;
  gy -= mm(3); // title "Saisir votre N°"
  gy -= BIG_BOX * 1.5 + mm(2); // write-in boxes

  const studentDigits: string[] = [];
  const studentDigitRatios: number[] = [];
  for (let col = 0; col < DIGITS; col++) {
    const bx = ID_GRID_X + col * (BIG_BOX + BIG_GAP) + (BIG_BOX - SMALL_BOX) / 2;
    let bestRow = -1;
    let bestRatio = 0;

    for (let row = 0; row < 10; row++) {
      const ry = gy - row * (SMALL_BOX + SMALL_GAP);
      const ix = toImgXRight(bx);
      const iy = toImgY(ry);
      const ratio = measureRegion(pixels, w, h, ix, iy, smallBoxPx);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestRow = row;
      }
    }

    studentDigits.push(bestRatio >= FILL_THRESHOLD ? String(bestRow) : "?");
    studentDigitRatios.push(bestRatio);
  }

  const studentId = studentDigits.includes("?") ? null : studentDigits.join("");

  // ─── Read QCM Answers ──────────────────────────────────────────────────

  // Compute gridTop (QCM area start) — matching gen-grid exactly:
  // gen-grid: y = Math.min(leftEndY, gridEndY) - mm(2) [gap] - mm(1) [separator] - mm(3.5) [instruction]
  const gridEndY = gy - 10 * (SMALL_BOX + SMALL_GAP);
  const leftEndY = sectionTop - FH - mm(2) - mm(1.5);
  const gridTop = Math.min(leftEndY, gridEndY) - mm(2) - mm(1) - mm(3.5);

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

  const nbAnswersFilled = Object.values(answers).filter(a => a.length > 0).length;

  return {
    studentId,
    studentName: null,
    answers,
    confidence: doubtfulQuestions.length > 0 ? "doubt" : "ok",
    doubtfulQuestions,
    debug: {
      alignMode,
      imageSize: { w, h },
      pageSize: { w: actualPW, h: actualPH },
      anchor: {
        imgX: Math.round(anchorImgX),
        imgY: Math.round(anchorImgY),
        imgRight: Math.round(anchorImgRight),
        scale: Math.round(scale * 1000) / 1000,
      },
      detectedHeader: headerOK ? header : undefined,
      detectedBounds: bounds ?? undefined,
      studentDigits,
      studentDigitRatios: studentDigitRatios.map(r => Math.round(r * 1000) / 1000),
      nbAnswersFilled,
    },
  };
}

/**
 * Convert a single PDF page (as PDF buffer) to a high-res PNG image using mupdf.
 * Returns the image buffer AND the PDF page dimensions in points (needed by the
 * OMR reader to compute bubble positions correctly — not all PDFs are A4).
 */
export async function pdfPageToImage(
  pdfBuffer: Buffer,
): Promise<{ image: Buffer; pageWidthPts: number; pageHeightPts: number }> {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const pageCount = doc.countPages();
  if (pageCount < 1) throw new Error("PDF has no pages");

  const page = doc.loadPage(0);

  // Read page bounds in PDF points (may or may not be A4)
  const bounds: any = page.getBounds();
  // getBounds returns [x0, y0, x1, y1] (some bindings return Rect object)
  const x0 = Array.isArray(bounds) ? bounds[0] : bounds.x0;
  const y0 = Array.isArray(bounds) ? bounds[1] : bounds.y0;
  const x1 = Array.isArray(bounds) ? bounds[2] : bounds.x1;
  const y1 = Array.isArray(bounds) ? bounds[3] : bounds.y1;
  const pageWidthPts = Math.abs(x1 - x0);
  const pageHeightPts = Math.abs(y1 - y0);

  // Render at 300 DPI: mupdf default is 72 DPI, so scale = 300/72 ≈ 4.17
  const SCALE = 300 / 72;
  const pixmap = page.toPixmap(
    [SCALE, 0, 0, SCALE, 0, 0],
    mupdf.ColorSpace.DeviceRGB,
    false, // alpha
    true,  // showExtras
  );
  const pngBytes = pixmap.asPNG();
  return {
    image: Buffer.from(pngBytes),
    pageWidthPts: pageWidthPts || 595.28, // fallback to A4 if detection fails
    pageHeightPts: pageHeightPts || 841.89,
  };
}
