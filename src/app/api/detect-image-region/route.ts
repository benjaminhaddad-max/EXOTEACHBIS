import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Uses mupdf structured text to find the graphic region on a PDF page.
 *
 * Strategy: Analyze text content to find boundaries:
 * 1. INTRO = first sentence lines at top (question header + intro text)
 * 2. GRAPHIC = everything between intro and question text (molecules, schemas, labels)
 * 3. QUESTION TEXT = the sentence right before options A-E
 * 4. OPTIONS = lines starting with A., B., C., D., E.
 *
 * Crops between end of INTRO and start of QUESTION TEXT.
 */
export async function POST(req: NextRequest) {
  try {
    const { pdfUrl, pageNum } = (await req.json()) as {
      pdfUrl: string;
      pageNum: number;
    };

    if (!pdfUrl || !pageNum) {
      return NextResponse.json({ error: "pdfUrl et pageNum requis" }, { status: 400 });
    }

    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      return NextResponse.json({ error: `PDF fetch failed: ${pdfRes.status}` }, { status: 502 });
    }
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());

    const mupdf = await import("mupdf");
    const doc = mupdf.Document.openDocument(pdfBuf, "application/pdf");
    const totalPages = doc.countPages();

    if (pageNum < 1 || pageNum > totalPages) {
      return NextResponse.json({ error: `Page ${pageNum} hors limites` }, { status: 400 });
    }

    const page = doc.loadPage(pageNum - 1);
    const pageBounds = page.getBounds();
    const pageHeight = pageBounds[3] - pageBounds[1];
    const pageWidth = pageBounds[2] - pageBounds[0];

    // Extract structured text with content
    const sText = page.toStructuredText("preserve-whitespace");

    const lines: { y0: number; y1: number; text: string }[] = [];
    const imageBlocks: { y0: number; y1: number }[] = [];
    let currentLineText = "";
    let currentLineBbox: number[] | null = null;

    sText.walk({
      beginLine(bbox: number[]) {
        currentLineBbox = bbox;
        currentLineText = "";
      },
      onChar(c: string) {
        currentLineText += c;
      },
      endLine() {
        const trimmed = currentLineText.trim();
        if (currentLineBbox && trimmed.length > 0) {
          lines.push({ y0: currentLineBbox[1], y1: currentLineBbox[3], text: trimmed });
        }
        currentLineBbox = null;
        currentLineText = "";
      },
      onImageBlock(bbox: number[]) {
        if (bbox) {
          imageBlocks.push({ y0: bbox[1], y1: bbox[3] });
        }
      },
    });

    console.log(`[detect-image-region] Page ${pageNum}: ${lines.length} lines, ${imageBlocks.length} image blocks`);
    for (const l of lines) {
      console.log(`  line y0=${l.y0.toFixed(1)} y1=${l.y1.toFixed(1)} "${l.text.substring(0, 50)}"`);
    }

    // ── Strategy 1: If mupdf found embedded image blocks, use their bounding box ──
    if (imageBlocks.length > 0) {
      const minY = Math.min(...imageBlocks.map(b => b.y0));
      const maxY = Math.max(...imageBlocks.map(b => b.y1));
      console.log(`[detect-image-region] Using image blocks: y0=${minY.toFixed(1)}, y1=${maxY.toFixed(1)}`);
      return cropAndReturn(page, mupdf, pageBounds, minY, maxY, pageWidth, pageHeight);
    }

    // ── Strategy 2: Text content analysis ──
    if (lines.length < 3) {
      return NextResponse.json({ found: false });
    }

    // Find options block (lines starting with A./B./C./D./E.)
    const optionPattern = /^[A-E][\.\)\s]/;
    const firstOptionIdx = lines.findIndex(l => optionPattern.test(l.text));

    if (firstOptionIdx <= 1) {
      // No options or not enough content before them
      return NextResponse.json({ found: false });
    }

    const SENTENCE_MIN_LENGTH = 18;

    // ── Find INTRO end ──
    // Always skip line 0 (question number like "11. Question")
    // Extend intro to include subsequent sentence-length lines
    let introEndY1 = lines[0].y1;
    for (let i = 1; i < firstOptionIdx; i++) {
      if (lines[i].text.length >= SENTENCE_MIN_LENGTH) {
        introEndY1 = lines[i].y1;
      } else {
        break; // First short line = start of graphic zone (labels like "+", "1", "NH₂")
      }
    }

    // ── Find QUESTION TEXT before options ──
    // Search backwards from first option to find the last sentence line
    let questionTextY0 = lines[firstOptionIdx].y0; // fallback: top of options
    for (let i = firstOptionIdx - 1; i >= 0; i--) {
      if (lines[i].text.length >= SENTENCE_MIN_LENGTH) {
        questionTextY0 = lines[i].y0;
        break;
      }
    }

    // Graphic region = from end of intro to start of question text
    const graphicHeight = questionTextY0 - introEndY1;
    console.log(`[detect-image-region] introEndY1=${introEndY1.toFixed(1)}, questionTextY0=${questionTextY0.toFixed(1)}, graphicHeight=${graphicHeight.toFixed(1)}`);

    if (graphicHeight < 30) {
      // Gap too small — no graphic region
      return NextResponse.json({ found: false });
    }

    return cropAndReturn(page, mupdf, pageBounds, introEndY1, questionTextY0, pageWidth, pageHeight);
  } catch (e: unknown) {
    console.error("[detect-image-region]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur serveur." }, { status: 500 });
  }
}

function cropAndReturn(
  page: any,
  mupdf: any,
  pageBounds: number[],
  cropY0: number,
  cropY1: number,
  pageWidth: number,
  pageHeight: number,
) {
  const scale = 2;
  const PADDING = 5; // points

  const y0 = Math.max(pageBounds[1], cropY0 - PADDING);
  const y1 = Math.min(pageBounds[3], cropY1 + PADDING);

  // Render full page
  const matrix: [number, number, number, number, number, number] = [scale, 0, 0, scale, 0, 0];
  const fullPixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const fullWidth = fullPixmap.getWidth();
  const fullHeight = fullPixmap.getHeight();
  const fullPixels = fullPixmap.getPixels(); // Uint8ClampedArray, RGB (3 bytes per pixel)
  const numComponents = fullPixmap.getNumberOfComponents(); // 3 for RGB
  const stride = fullPixmap.getStride();

  // Compute pixel crop coordinates
  const pixY0 = Math.max(0, Math.round((y0 - pageBounds[1]) * scale));
  const pixY1 = Math.min(fullHeight, Math.round((y1 - pageBounds[1]) * scale));
  const cropHeight = pixY1 - pixY0;

  if (cropHeight <= 0) {
    return NextResponse.json({ found: false });
  }

  // Create cropped pixmap manually
  const cropRect: [number, number, number, number] = [0, 0, fullWidth, cropHeight];
  const croppedPixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, cropRect, false);
  croppedPixmap.clear(255); // white background
  const croppedPixels = croppedPixmap.getPixels();

  // Copy pixel rows from full pixmap to cropped pixmap
  const croppedStride = croppedPixmap.getStride();
  for (let row = 0; row < cropHeight; row++) {
    const srcOffset = (pixY0 + row) * stride;
    const dstOffset = row * croppedStride;
    const bytesToCopy = Math.min(stride, croppedStride);
    for (let b = 0; b < bytesToCopy; b++) {
      croppedPixels[dstOffset + b] = fullPixels[srcOffset + b];
    }
  }

  const croppedPng = Buffer.from(croppedPixmap.asPNG());

  console.log(`[detect-image-region] Cropped: ${fullWidth}x${cropHeight}px (y: ${pixY0}-${pixY1})`);

  return NextResponse.json({
    found: true,
    y_start: pixY0,
    y_end: pixY1,
    width: fullWidth,
    height: cropHeight,
    imageBase64: croppedPng.toString("base64"),
  });
}
