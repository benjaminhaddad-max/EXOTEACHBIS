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
const BIG_BOX = mm(4.5);   // match gen-grid compact
const BIG_GAP = mm(1);     // match gen-grid compact
const SMALL_BOX_W = mm(4.5);  // student ID oval width (match gen-grid)
const SMALL_BOX_H = mm(1.5); // student ID oval height
const SMALL_ROW_STEP = SMALL_BOX_H + mm(0.8); // row spacing in ID grid
const ID_GRID_W = DIGITS * (BIG_BOX + BIG_GAP) - BIG_GAP;
const ID_GRID_X = MX + CW - ID_GRID_W - mm(2);

// QCM Grid (flat capsule ovals: 4.5mm × 1.5mm)
const OVAL_W = mm(4.5);
const OVAL_H = mm(1.5);
const HGAP = mm(1.8);
const NUM_W = mm(6);
const LABEL_H = mm(2);
const FRAME_PAD_T = mm(0.3);
const FRAME_PAD_B = mm(0.2);
const FRAME_H = FRAME_PAD_T + OVAL_H + LABEL_H + OVAL_H + FRAME_PAD_B;
const FRAME_GAP = mm(0.6);
const BOX_GROUP_W = 5 * OVAL_W + 4 * HGAP;
const COL_W = NUM_W + BOX_GROUP_W + mm(1.5);
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
    idGridMethod: string; // "visual" | "coords" | "none"
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

/**
 * Measure dark pixel fill ratio in a rectangular region.
 * Insets by 18% on each side to avoid measuring border pixels.
 */
function measureFillRatio(
  pixels: Buffer,
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const padX = Math.max(1, Math.floor(w * 0.18));
  const padY = Math.max(1, Math.floor(h * 0.18));
  let dark = 0, total = 0;
  for (let dy = padY; dy < h - padY; dy++) {
    for (let dx = padX; dx < w - padX; dx++) {
      const py = Math.round(y) + dy;
      const px = Math.round(x) + dx;
      if (py >= 0 && py < imgH && px >= 0 && px < imgW) {
        total++;
        if (pixels[py * imgW + px] === 0) dark++;
      }
    }
  }
  return total > 0 ? dark / total : 0;
}

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
 * Find the header bar by looking for its CONTINUOUS border lines.
 *
 * The gen-grid header is a white rectangle with a 1pt black border. At 300 DPI,
 * the top and bottom borders are ~4px-thick horizontal lines of continuous dark
 * pixels spanning the full bar width (CW ≈ 550pt ≈ 2290px).
 *
 * Key robustness: we track the LONGEST CONTINUOUS dark run per row (not just
 * "any dark pixel"). This filters out scanner edge shadows, paper frame
 * artifacts, and isolated dark noise — which all produce dark pixels but in
 * discontinuous/short runs.
 *
 * We also skip rows that touch the image edges (likely scanner artifacts, not
 * the actual header rectangle).
 */
function findHeaderBar(
  pixels: Buffer,
  width: number,
  height: number,
): { top: number; bottom: number; left: number; right: number } {
  const searchRange = Math.min(height, Math.round(height * 0.18));
  // Skip outer 2% of width — scanner edge shadows live there. The real header
  // rectangle's border is at ~3.8-4% from each edge on an A4 scan.
  const INTERIOR_L = Math.round(width * 0.02);
  const INTERIOR_R = width - Math.round(width * 0.02);
  const MIN_RUN = Math.round((INTERIOR_R - INTERIOR_L) * 0.5);

  let barTop = -1;
  let barBottom = -1;
  let barLeft = width;
  let barRight = 0;

  for (let y = 0; y < searchRange; y++) {
    // Find the longest continuous run of dark pixels WITHIN the interior
    // (shadows at the very edges are ignored — they don't affect detection).
    let bestStart = -1, bestEnd = -1, bestLen = 0;
    let curStart = -1;
    for (let x = INTERIOR_L; x < INTERIOR_R; x++) {
      if (pixels[y * width + x] === 0) {
        if (curStart < 0) curStart = x;
      } else if (curStart >= 0) {
        const len = x - curStart;
        if (len > bestLen) { bestLen = len; bestStart = curStart; bestEnd = x - 1; }
        curStart = -1;
      }
    }
    if (curStart >= 0) {
      const len = INTERIOR_R - curStart;
      if (len > bestLen) { bestLen = len; bestStart = curStart; bestEnd = INTERIOR_R - 1; }
    }

    // Reject rows whose best interior run is too short (not a border line)
    if (bestLen < MIN_RUN) continue;

    if (barTop < 0) barTop = y;
    barBottom = y;
    if (bestStart < barLeft) barLeft = bestStart;
    if (bestEnd > barRight) barRight = bestEnd;
  }

  return {
    top: barTop >= 0 ? barTop : 0,
    bottom: barBottom >= 0 ? barBottom : 0,
    left: barLeft < width ? barLeft : 0,
    right: barRight > 0 ? barRight : width,
  };
}

/**
 * Find the bounding box of the actual page content, ignoring scanner margins
 * and edge shadows. Uses a tolerance band around each edge to skip the first
 * few pixels where scanner artifacts live.
 *
 * Returns null if the page appears empty.
 */
function findContentBounds(
  pixels: Buffer,
  width: number,
  height: number,
): { top: number; bottom: number; left: number; right: number } | null {
  const ROW_THRESHOLD = 0.05; // 5% of row width dark — content, not speckle
  const COL_THRESHOLD = 0.05;
  const EDGE_SKIP_Y = Math.round(height * 0.01); // skip top/bottom 1% (scanner bars)
  const EDGE_SKIP_X = Math.round(width * 0.01);

  let top = -1, bottom = -1, left = -1, right = -1;

  for (let y = EDGE_SKIP_Y; y < height - EDGE_SKIP_Y; y++) {
    let dark = 0;
    for (let x = EDGE_SKIP_X; x < width - EDGE_SKIP_X; x++) {
      if (pixels[y * width + x] === 0) dark++;
    }
    if (dark / (width - 2 * EDGE_SKIP_X) > ROW_THRESHOLD) { top = y; break; }
  }

  for (let y = height - 1 - EDGE_SKIP_Y; y >= EDGE_SKIP_Y; y--) {
    let dark = 0;
    for (let x = EDGE_SKIP_X; x < width - EDGE_SKIP_X; x++) {
      if (pixels[y * width + x] === 0) dark++;
    }
    if (dark / (width - 2 * EDGE_SKIP_X) > ROW_THRESHOLD) { bottom = y; break; }
  }

  if (top < 0 || bottom < 0 || bottom - top < height * 0.3) return null;

  const rangeH = bottom - top + 1;
  for (let x = EDGE_SKIP_X; x < width - EDGE_SKIP_X; x++) {
    let dark = 0;
    for (let y = top; y <= bottom; y++) {
      if (pixels[y * width + x] === 0) dark++;
    }
    if (dark / rangeH > COL_THRESHOLD) { left = x; break; }
  }

  for (let x = width - 1 - EDGE_SKIP_X; x >= EDGE_SKIP_X; x--) {
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

  // Two-pass binarization:
  // 1. High threshold (190) for structure detection — captures thin gray box borders
  // 2. Low threshold (140) for bubble reading — only captures dark filled marks
  const [structResult, bubbleResult] = await Promise.all([
    sharp(pageImage)
      .grayscale()
      .threshold(190)
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(pageImage)
      .grayscale()
      .normalize()
      .threshold(140)
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);

  const structPixels = structResult.data; // for grid border detection
  const pixels = bubbleResult.data; // for bubble fill reading + header detection
  const w = bubbleResult.info.width;
  const h = bubbleResult.info.height;

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
    // mupdf always renders at 300 DPI, so the true scale is always:
    //   scale = image_width / pdf_page_width_pts = 300/72
    // This is MORE reliable than deriving scale from detected bar width,
    // which can be corrupted by edge shadows merging into the border.
    const inferredScale = w / actualPW;
    const expectedBarWidth = CW * inferredScale;
    const detectedBarWidth = header.right - header.left;

    if (Math.abs(detectedBarWidth - expectedBarWidth) < expectedBarWidth * 0.02) {
      // Detection matches expected width (within 2%): trust it
      anchorImgX = header.left;
      anchorImgRight = header.right;
    } else {
      // Detection deviates (shadow/artifact contamination): use expected
      // width centered on the detected bar midpoint
      const midX = (header.left + header.right) / 2;
      anchorImgX = Math.round(midX - expectedBarWidth / 2);
      anchorImgRight = Math.round(midX + expectedBarWidth / 2);
    }
    anchorImgY = header.top;
    scale = inferredScale;
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
  const ovalWPx = Math.round(OVAL_W * scale);
  const ovalHPx = Math.round(OVAL_H * scale);
  const idOvalWPx = Math.round(SMALL_BOX_W * scale);
  const idOvalHPx = Math.round(SMALL_BOX_H * scale);

  console.log(`[omr] alignMode=${alignMode} img=${w}x${h} ovalPx=${ovalWPx}x${ovalHPx}`);

  // ─── Read Student ID — VISUAL DETECTION ─────────────────────────────────
  // Instead of computing grid positions from PDF coordinates (fragile when
  // scanner shifts content), we detect the 6×10 digit grid VISUALLY:
  //   1. Horizontal projection in the right half → find evenly-spaced row borders
  //   2. Vertical projection within those rows → find column borders
  //   3. Read each cell by fill ratio
  //
  // This is robust to scanner distortion and PDF dimension mismatches.

  // Search area: right ~45% of page, between header bottom and QCM grid top
  const mmPx = w / 210; // approximate mm → px (A4 = 210mm wide)
  const idSearchLeft = Math.round(w * 0.50);
  const idSearchRight = Math.min(w - 5, Math.round(anchorImgRight) + 20);

  // Compute QCM grid top in image pixels (for search boundary)
  const sectionTop = PH - BAR_H - mm(6);
  let gy = sectionTop;
  gy -= mm(3);
  gy -= BIG_BOX * 1.5 + mm(2);
  const gridEndY = gy - 10 * SMALL_ROW_STEP;
  const leftEndY = sectionTop - FH - mm(2) - mm(1.5);
  const gridTopPdf = Math.min(leftEndY, gridEndY) - mm(2) - mm(1) - mm(3.5);
  const qcmGridTopImg = toImgY(gridTopPdf);

  const idSearchTop = Math.round(anchorImgY) + Math.round(10 * scale); // just below header top
  const idSearchBottom = Math.min(qcmGridTopImg - 5, h - 5);

  const studentDigits: string[] = [];
  const studentDigitRatios: number[] = [];
  let idGridMethod = "none";

  if (idSearchBottom - idSearchTop > 80 && idSearchRight - idSearchLeft > 80) {
    // STEP 1: Find digit grid rows via horizontal projection
    // Use STRUCT image (high threshold) to capture thin box borders
    const hLen = idSearchBottom - idSearchTop;
    const hProj = new Float64Array(hLen);
    for (let y = idSearchTop; y < idSearchBottom; y++) {
      let dark = 0;
      for (let x = idSearchLeft; x < idSearchRight; x++) {
        if (structPixels[y * w + x] === 0) dark++;
      }
      hProj[y - idSearchTop] = dark / (idSearchRight - idSearchLeft);
    }

    // Detect horizontal border lines as peaks
    type LP = { pos: number };
    const hLines: LP[] = [];
    {
      let i = 0;
      while (i < hLen) {
        if (hProj[i] > 0.03) {
          let sumP = 0, sumW = 0, j = i;
          while (j < hLen && hProj[j] > 0.015) {
            sumP += j * hProj[j]; sumW += hProj[j]; j++;
          }
          hLines.push({ pos: idSearchTop + Math.round(sumP / sumW) });
          i = j;
        } else { i++; }
      }
    }

    // Find longest run of evenly-spaced lines (expected: 4mm step)
    const expectedRowStep = 2.3 * mmPx; // 1.5mm oval + 0.8mm gap = 2.3mm
    const rowTol = expectedRowStep * 0.40;
    let bestRowSeq: number[] = [];
    for (let s = 0; s < hLines.length; s++) {
      const seq: number[] = [hLines[s].pos];
      for (let n = s + 1; n < hLines.length; n++) {
        const gap = hLines[n].pos - seq[seq.length - 1];
        if (gap < expectedRowStep - rowTol) continue;
        if (gap > expectedRowStep + rowTol) break;
        seq.push(hLines[n].pos);
      }
      if (seq.length > bestRowSeq.length) bestRowSeq = seq;
    }

    if (bestRowSeq.length >= 8) {
      const rowLines = bestRowSeq.slice(0, 11);

      // STEP 2: Find columns via vertical projection within grid rows
      // Use STRUCT image (high threshold) for thin border detection
      const gridRowTop = rowLines[0];
      const gridRowBottom = rowLines[rowLines.length - 1];
      const vLen = idSearchRight - idSearchLeft;
      const vProj = new Float64Array(vLen);
      for (let x = idSearchLeft; x < idSearchRight; x++) {
        let dark = 0, total = 0;
        for (let y = gridRowTop; y <= gridRowBottom; y++) {
          total++; if (structPixels[y * w + x] === 0) dark++;
        }
        vProj[x - idSearchLeft] = total > 0 ? dark / total : 0;
      }

      // Detect vertical border lines
      const vLines: LP[] = [];
      {
        let vi = 0;
        while (vi < vLen) {
          if (vProj[vi] > 0.06) {
            let sumP = 0, sumW = 0, vj = vi;
            while (vj < vLen && vProj[vj] > 0.03) {
              sumP += vj * vProj[vj]; sumW += vProj[vj]; vj++;
            }
            vLines.push({ pos: idSearchLeft + Math.round(sumP / sumW) });
            vi = vj;
          } else { vi++; }
        }
      }

      // Pair vertical lines into column borders (box width ≈ 3.5mm)
      const expectedBoxW = 4.5 * mmPx; // match gen-grid ID oval width
      type CP = { left: number; right: number; center: number };
      const colPairs: CP[] = [];
      const usedV = new Set<number>();
      for (let a = 0; a < vLines.length; a++) {
        if (usedV.has(a)) continue;
        for (let b = a + 1; b < vLines.length; b++) {
          if (usedV.has(b)) continue;
          const gap = vLines[b].pos - vLines[a].pos;
          if (gap > expectedBoxW * 0.50 && gap < expectedBoxW * 1.60) {
            colPairs.push({ left: vLines[a].pos, right: vLines[b].pos, center: Math.round((vLines[a].pos + vLines[b].pos) / 2) });
            usedV.add(a); usedV.add(b); break;
          }
        }
      }
      colPairs.sort((a, b) => a.center - b.center);

      // Find group of ~6 columns with expected spacing (6.5mm)
      const expectedColStep = 5.5 * mmPx; // bigBox(4.5mm) + bigGap(1mm) = 5.5mm
      const colTol = expectedColStep * 0.40;
      let bestCols: CP[] = [];
      for (let s = 0; s < colPairs.length; s++) {
        const group: CP[] = [colPairs[s]];
        for (let n = s + 1; n < colPairs.length && group.length < 6; n++) {
          const gap = colPairs[n].center - group[group.length - 1].center;
          if (gap >= expectedColStep - colTol && gap <= expectedColStep + colTol) group.push(colPairs[n]);
        }
        if (group.length > bestCols.length) bestCols = group;
      }

      // Fallback 1: if not enough column pairs, try grouping all vertical lines
      if (bestCols.length < 4 && vLines.length >= 7) {
        let bestVSeq: number[] = [];
        for (let s = 0; s < vLines.length; s++) {
          const seq: number[] = [vLines[s].pos];
          for (let n = s + 1; n < vLines.length; n++) {
            const gap = vLines[n].pos - seq[seq.length - 1];
            if (gap > 2 * mmPx && gap < 8 * mmPx) seq.push(vLines[n].pos);
            else if (gap >= 8 * mmPx) break;
          }
          if (seq.length > bestVSeq.length) bestVSeq = seq;
        }
        if (bestVSeq.length >= 7) {
          bestCols = [];
          for (let pi = 0; pi + 1 < bestVSeq.length && bestCols.length < 6; pi += 2) {
            const gap = bestVSeq[pi + 1] - bestVSeq[pi];
            if (gap > expectedBoxW * 0.3 && gap < expectedBoxW * 2.0)
              bestCols.push({ left: bestVSeq[pi], right: bestVSeq[pi + 1], center: Math.round((bestVSeq[pi] + bestVSeq[pi + 1]) / 2) });
          }
        }
      }

      // Fallback 2: per-row horizontal scan to find cell positions
      // Average dark pixel density across all rows for each X position
      // This catches borders even if vertical projection missed them
      if (bestCols.length < 4) {
        const rowAvgProj = new Float64Array(vLen);
        const numRows = Math.min(10, rowLines.length - 1);
        for (let r = 0; r < numRows; r++) {
          const rTop = rowLines[r];
          const rBot = rowLines[r + 1];
          const rH = rBot - rTop;
          for (let x = idSearchLeft; x < idSearchRight; x++) {
            let dark = 0;
            for (let y = rTop; y < rBot; y++) {
              if (structPixels[y * w + x] === 0) dark++;
            }
            rowAvgProj[x - idSearchLeft] += (dark / rH) / numRows;
          }
        }

        // Find peaks in the averaged projection
        const avgVLines: LP[] = [];
        let avi = 0;
        while (avi < vLen) {
          if (rowAvgProj[avi] > 0.04) {
            let sumP = 0, sumW = 0, avj = avi;
            while (avj < vLen && rowAvgProj[avj] > 0.02) {
              sumP += avj * rowAvgProj[avj]; sumW += rowAvgProj[avj]; avj++;
            }
            avgVLines.push({ pos: idSearchLeft + Math.round(sumP / sumW) });
            avi = avj;
          } else { avi++; }
        }

        // Try pairing again
        const avgColPairs: CP[] = [];
        const usedAv = new Set<number>();
        for (let a = 0; a < avgVLines.length; a++) {
          if (usedAv.has(a)) continue;
          for (let b = a + 1; b < avgVLines.length; b++) {
            if (usedAv.has(b)) continue;
            const gap = avgVLines[b].pos - avgVLines[a].pos;
            if (gap > expectedBoxW * 0.50 && gap < expectedBoxW * 1.60) {
              avgColPairs.push({ left: avgVLines[a].pos, right: avgVLines[b].pos, center: Math.round((avgVLines[a].pos + avgVLines[b].pos) / 2) });
              usedAv.add(a); usedAv.add(b); break;
            }
          }
        }
        avgColPairs.sort((a, b) => a.center - b.center);

        // Find best group with expected spacing
        for (let s = 0; s < avgColPairs.length; s++) {
          const group: CP[] = [avgColPairs[s]];
          for (let n = s + 1; n < avgColPairs.length && group.length < 6; n++) {
            const gap = avgColPairs[n].center - group[group.length - 1].center;
            if (gap >= expectedColStep - colTol && gap <= expectedColStep + colTol) group.push(avgColPairs[n]);
          }
          if (group.length > bestCols.length) bestCols = group;
        }
      }

      // Extrapolate if fewer than 6 columns found
      if (bestCols.length >= 2 && bestCols.length < 6) {
        const avgStep = (bestCols[bestCols.length - 1].center - bestCols[0].center) / (bestCols.length - 1);
        const avgW = Math.round(bestCols.reduce((s, c) => s + (c.right - c.left), 0) / bestCols.length);
        const halfW = Math.round(avgW / 2);
        while (bestCols.length < 6) {
          const last = bestCols[bestCols.length - 1].center;
          const nc = Math.round(last + avgStep);
          if (nc + halfW > w - 5) break;
          bestCols.push({ left: nc - halfW, right: nc + halfW, center: nc });
        }
        while (bestCols.length < 6) {
          const first = bestCols[0].center;
          const nc = Math.round(first - avgStep);
          if (nc - halfW < 5) break;
          bestCols.unshift({ left: nc - halfW, right: nc + halfW, center: nc });
        }
      }

      // STEP 3: Read digits
      if (bestCols.length >= 4) {
        idGridMethod = "visual";
        const cols = bestCols.slice(0, 6);
        console.log(`[omr-id] Visual: ${rowLines.length} rows, ${cols.length} cols`);
        console.log(`[omr-id]   rows Y: ${rowLines.join(", ")}`);
        console.log(`[omr-id]   cols X: ${cols.map(c => `${c.left}-${c.right}`).join(", ")}`);

        for (const col of cols) {
          let bestRow = -1, bestRatio = 0;
          const bw = Math.max(col.right - col.left, Math.round(2 * mmPx));
          for (let r = 0; r < Math.min(10, rowLines.length - 1); r++) {
            const cellH = rowLines[r + 1] - rowLines[r];
            const ratio = measureFillRatio(pixels, w, h, col.left, rowLines[r], bw, cellH);
            if (ratio > bestRatio) { bestRatio = ratio; bestRow = r; }
          }
          studentDigits.push(bestRatio >= FILL_THRESHOLD ? String(bestRow) : "?");
          studentDigitRatios.push(Math.round(bestRatio * 1000) / 1000);
        }
        // Pad to 6 if needed
        while (studentDigits.length < 6) { studentDigits.push("?"); studentDigitRatios.push(0); }
      }
    }
  }

  // Fallback: coordinate-based approach if visual detection failed
  if (studentDigits.length === 0) {
    idGridMethod = "coords";
    const sTop = PH - BAR_H - mm(6);
    let gy2 = sTop - mm(3) - BIG_BOX * 1.5 - mm(2);
    for (let col = 0; col < DIGITS; col++) {
      const bx = ID_GRID_X + col * (BIG_BOX + BIG_GAP);
      let bestRow = -1, bestRatio = 0;
      for (let row = 0; row < 10; row++) {
        const ry = gy2 - row * SMALL_ROW_STEP;
        const ix = toImgXRight(bx);
        const iy = toImgY(ry);
        const ratio = measureFillRatio(pixels, w, h, ix, iy, idOvalWPx, idOvalHPx);
        if (ratio > bestRatio) { bestRatio = ratio; bestRow = row; }
      }
      studentDigits.push(bestRatio >= FILL_THRESHOLD ? String(bestRow) : "?");
      studentDigitRatios.push(Math.round(bestRatio * 1000) / 1000);
    }
  }

  const studentId = studentDigits.includes("?") ? null : studentDigits.join("");
  console.log(`[omr-id] ${idGridMethod}: ${studentDigits.map((d, i) => `${d}(${studentDigitRatios[i]})`).join(" ")} → ${studentId || "null"}`);

  // ─── Read QCM Answers ──────────────────────────────────────────────────

  // Compute gridTop (QCM area start) — matching gen-grid exactly:
  // gen-grid: y = Math.min(leftEndY, gridEndY) - mm(2) [gap] - mm(1) [separator] - mm(3.5) [instruction]
  // (reuse gridTopPdf computed above for student ID search bounds)
  const gridTop = gridTopPdf;

  const answers: Record<string, string[]> = {};
  const doubtfulQuestions: number[] = [];

  // Compute Q_PER_COL dynamically (same logic as gen-grid)
  const qPerCol = Math.max(1, Math.floor(questionCount / 4) + (questionCount % 4 > 0 ? 1 : 0));

  for (let q = 0; q < questionCount; q++) {
    const col = Math.floor(q / qPerCol);
    const row = q % qPerCol;
    const cx = MX + col * (COL_W + COL_GAP);
    const frameTop = gridTop - row * (FRAME_H + FRAME_GAP);

    const r1y = frameTop - FRAME_PAD_T; // answer row top
    const r3y = r1y - OVAL_H - LABEL_H; // remord row top (oval height, not box)
    const bx0 = cx + NUM_W;

    const answerRatios: number[] = [];
    const remordRatios: number[] = [];

    for (let li = 0; li < 5; li++) {
      const bx = bx0 + li * (OVAL_W + HGAP);

      // Answer row — use rectangular measure for ovals
      const ax = toImgXLeft(bx);
      const ay = toImgY(r1y);
      answerRatios.push(measureFillRatio(pixels, w, h, ax, ay, ovalWPx, ovalHPx));

      // Remord row
      const rx = toImgXLeft(bx);
      const ry = toImgY(r3y);
      remordRatios.push(measureFillRatio(pixels, w, h, rx, ry, ovalWPx, ovalHPx));
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
      idGridMethod,
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
