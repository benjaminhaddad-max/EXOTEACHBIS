import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Uses mupdf to analyze PDF page structure and detect graphical regions.
 * Extracts text block positions via StructuredText walker, then finds
 * the largest vertical gap between text blocks — that's where drawings are.
 * Returns a pre-cropped PNG of just the graphic region.
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

    // Download PDF
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
    const pageBounds = page.getBounds(); // [x0, y0, x1, y1]
    const pageHeight = pageBounds[3] - pageBounds[1];
    const pageWidth = pageBounds[2] - pageBounds[0];

    // Extract structured text using the walker API
    const sText = page.toStructuredText("preserve-whitespace");

    // Collect all text line bounding boxes and image/vector blocks
    const textLines: { y0: number; y1: number }[] = [];
    const graphicBlocks: { y0: number; y1: number }[] = [];

    sText.walk({
      beginLine(bbox) {
        if (bbox) {
          textLines.push({ y0: bbox[1], y1: bbox[3] });
        }
      },
      onImageBlock(bbox) {
        if (bbox) {
          graphicBlocks.push({ y0: bbox[1], y1: bbox[3] });
        }
      },
    });

    console.log(`[detect-image-region] Page ${pageNum}: ${textLines.length} text lines, ${graphicBlocks.length} image blocks`);

    // If mupdf found explicit image blocks, use those directly
    if (graphicBlocks.length > 0) {
      const minY = Math.min(...graphicBlocks.map(b => b.y0));
      const maxY = Math.max(...graphicBlocks.map(b => b.y1));

      return cropAndReturn(page, mupdf, pageBounds, minY, maxY, pageWidth, pageHeight);
    }

    // Otherwise, find the largest gap between text regions (drawings = gap in text)
    if (textLines.length === 0) {
      return NextResponse.json({ found: false });
    }

    // Sort text lines by Y position
    textLines.sort((a, b) => a.y0 - b.y0);

    // Group nearby text lines into text regions (within 8pt of each other)
    const TEXT_GROUP_GAP = 8;
    const textRegions: { y0: number; y1: number }[] = [];
    let cur = { y0: textLines[0].y0, y1: textLines[0].y1 };

    for (let i = 1; i < textLines.length; i++) {
      const line = textLines[i];
      if (line.y0 - cur.y1 <= TEXT_GROUP_GAP) {
        cur.y1 = Math.max(cur.y1, line.y1);
      } else {
        textRegions.push({ ...cur });
        cur = { y0: line.y0, y1: line.y1 };
      }
    }
    textRegions.push({ ...cur });

    console.log(`[detect-image-region] Page ${pageNum}: ${textRegions.length} text regions`);
    for (const r of textRegions) {
      console.log(`  region: y0=${r.y0.toFixed(1)}, y1=${r.y1.toFixed(1)}, height=${(r.y1 - r.y0).toFixed(1)}`);
    }

    // Find largest gap between text regions
    let bestGap = { start: 0, end: 0, size: 0 };
    for (let i = 0; i < textRegions.length - 1; i++) {
      const gapStart = textRegions[i].y1;
      const gapEnd = textRegions[i + 1].y0;
      const gapSize = gapEnd - gapStart;
      if (gapSize > bestGap.size) {
        bestGap = { start: gapStart, end: gapEnd, size: gapSize };
      }
    }

    console.log(`[detect-image-region] Best gap: start=${bestGap.start.toFixed(1)}, end=${bestGap.end.toFixed(1)}, size=${bestGap.size.toFixed(1)}`);

    // Minimum gap to be considered a graphical region (50pt ≈ 1.8cm)
    if (bestGap.size < 50) {
      return NextResponse.json({ found: false });
    }

    return cropAndReturn(page, mupdf, pageBounds, bestGap.start, bestGap.end, pageWidth, pageHeight);
  } catch (e: unknown) {
    console.error("[detect-image-region]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur serveur." }, { status: 500 });
  }
}

async function cropAndReturn(
  page: any,
  mupdf: any,
  pageBounds: [number, number, number, number],
  cropY0: number,
  cropY1: number,
  pageWidth: number,
  pageHeight: number,
) {
  const scale = 2;
  const PADDING = 8; // points of padding

  // Clamp coordinates
  const y0 = Math.max(pageBounds[1], cropY0 - PADDING);
  const y1 = Math.min(pageBounds[3], cropY1 + PADDING);

  // Render full page at 2x
  const matrix: [number, number, number, number, number, number] = [scale, 0, 0, scale, 0, 0];
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);

  // Convert to pixel coordinates
  const pixY0 = Math.max(0, Math.round((y0 - pageBounds[1]) * scale));
  const pixY1 = Math.min(Math.round(pageHeight * scale), Math.round((y1 - pageBounds[1]) * scale));
  const pixWidth = Math.round(pageWidth * scale);

  if (pixY1 <= pixY0) {
    return NextResponse.json({ found: false });
  }

  // Crop the pixmap
  const croppedPixmap = pixmap.clone([0, pixY0, pixWidth, pixY1]);
  const croppedPng = Buffer.from(croppedPixmap.asPNG());

  return NextResponse.json({
    found: true,
    y_start: pixY0,
    y_end: pixY1,
    width: pixWidth,
    height: pixY1 - pixY0,
    imageBase64: croppedPng.toString("base64"),
  });
}
