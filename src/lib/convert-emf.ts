/**
 * Convert EMF/WMF images to PNG using CloudConvert API.
 * Gives perfect 1:1 rendering quality for molecular structures.
 *
 * Requires CLOUDCONVERT_API_KEY environment variable.
 */
import CloudConvert from "cloudconvert";

let client: CloudConvert | null = null;

function getClient(): CloudConvert | null {
  if (client) return client;
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) {
    console.warn("[convert-emf] CLOUDCONVERT_API_KEY not set — EMF images will not be converted");
    return null;
  }
  client = new CloudConvert(apiKey);
  return client;
}

/**
 * Convert an EMF or WMF buffer to PNG using CloudConvert.
 * Returns the PNG buffer, or null if conversion fails or API key is missing.
 */
export async function convertMetafileToPng(
  buffer: Buffer,
  format: "emf" | "wmf",
): Promise<Buffer | null> {
  const cc = getClient();
  if (!cc) return null;

  try {
    // Create a job: upload → convert → export
    let job = await cc.jobs.create({
      tasks: {
        "upload": {
          operation: "import/upload",
        },
        "convert": {
          operation: "convert",
          input: ["upload"],
          output_format: "png",
          input_format: format,
        },
        "export": {
          operation: "export/url",
          input: ["convert"],
        },
      },
    });

    // Upload the file
    const uploadTask = job.tasks.find((t: any) => t.name === "upload");
    if (!uploadTask) throw new Error("No upload task found");

    await cc.tasks.upload(uploadTask, buffer, `image.${format}`);

    // Wait for completion
    job = await cc.jobs.wait(job.id);

    // Log all task statuses for debugging
    for (const task of job.tasks) {
      console.log(`[convert-emf] Task "${task.name}": status=${task.status}, engine=${(task as any).engine || "n/a"}`);
      if (task.status === "error") {
        console.error(`[convert-emf] Task "${task.name}" error:`, (task as any).message || JSON.stringify(task));
      }
    }

    // Download the result
    const exportTask = job.tasks.find(
      (t: any) => t.name === "export" && t.status === "finished",
    );
    if (!exportTask?.result?.files?.[0]?.url) {
      const convertTask = job.tasks.find((t: any) => t.name === "convert");
      console.error("[convert-emf] No export URL. Convert task:", JSON.stringify(convertTask, null, 2));
      throw new Error("No export URL in result");
    }

    const fileUrl = exportTask.result.files[0].url;
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    console.log(`[convert-emf] Converted ${format} → PNG (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);
    return Buffer.from(arrayBuffer);
  } catch (e: any) {
    console.error("[convert-emf] Conversion failed:", e.message);
    return null;
  }
}

/**
 * Convert a base64 EMF/WMF data URI to a PNG data URI using CloudConvert.
 * Returns the original URI if not an EMF/WMF, or null if conversion fails.
 */
export async function convertDataUriToPng(dataUri: string): Promise<string | null> {
  const emfMatch = dataUri.match(/^data:image\/(x-emf|emf);base64,(.+)$/i);
  const wmfMatch = dataUri.match(/^data:image\/(x-wmf|wmf);base64,(.+)$/i);

  if (!emfMatch && !wmfMatch) return dataUri; // Not an EMF/WMF

  const format = emfMatch ? "emf" : "wmf";
  const base64 = (emfMatch || wmfMatch)![2];
  const buffer = Buffer.from(base64, "base64");

  const pngBuffer = await convertMetafileToPng(buffer, format as "emf" | "wmf");
  if (!pngBuffer) return null;

  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

/**
 * Convert an entire DOCX file to PNG page images via CloudConvert.
 * Uses LibreOffice engine for perfect 1:1 rendering (identical to Word).
 * Returns an array of PNG Buffers, one per page.
 */
export async function convertDocxToPages(docxBuffer: Buffer): Promise<Buffer[]> {
  const cc = getClient();
  if (!cc) {
    console.warn("[convert-docx] No CloudConvert API key — skipping DOCX→PNG conversion");
    return [];
  }

  try {
    console.log(`[convert-docx] Converting DOCX (${Math.round(docxBuffer.length / 1024)}KB) to PNG pages...`);

    let job = await cc.jobs.create({
      tasks: {
        "upload": {
          operation: "import/upload",
        },
        "convert": {
          operation: "convert",
          input: ["upload"],
          output_format: "png",
          input_format: "docx",
          engine: "libreoffice",
        },
        "export": {
          operation: "export/url",
          input: ["convert"],
        },
      },
    });

    const uploadTask = job.tasks.find((t: any) => t.name === "upload");
    if (!uploadTask) throw new Error("No upload task found");

    await cc.tasks.upload(uploadTask, docxBuffer, "document.docx");

    job = await cc.jobs.wait(job.id);

    // Check for errors
    for (const task of job.tasks) {
      if (task.status === "error") {
        console.error(`[convert-docx] Task "${task.name}" error:`, (task as any).message);
        throw new Error(`CloudConvert task "${task.name}" failed`);
      }
    }

    const exportTask = job.tasks.find(
      (t: any) => t.name === "export" && t.status === "finished",
    );
    if (!exportTask?.result?.files?.length) {
      throw new Error("No pages in export result");
    }

    // Download all page PNGs (they come in order: document-1.png, document-2.png, ...)
    const files = exportTask.result.files.sort((a: any, b: any) =>
      (a.filename || "").localeCompare(b.filename || "", undefined, { numeric: true }),
    );

    const pages: Buffer[] = [];
    for (const file of files) {
      const resp = await fetch(file.url as string);
      if (!resp.ok) throw new Error(`Download failed for ${file.filename}: ${resp.status}`);
      const ab = await resp.arrayBuffer();
      pages.push(Buffer.from(ab));
    }

    console.log(`[convert-docx] Got ${pages.length} pages (${pages.map(p => Math.round(p.length / 1024) + "KB").join(", ")})`);
    return pages;
  } catch (e: any) {
    console.error("[convert-docx] Conversion failed:", e.message);
    return [];
  }
}

/**
 * Convert a DOCX to PDF via CloudConvert/LibreOffice.
 * Returns the PDF buffer for use with mupdf to render+crop individual images.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer | null> {
  const cc = getClient();
  if (!cc) return null;

  try {
    console.log(`[convert-docx-pdf] Converting DOCX (${Math.round(docxBuffer.length / 1024)}KB) to PDF...`);

    let job = await cc.jobs.create({
      tasks: {
        "upload": { operation: "import/upload" },
        "convert": {
          operation: "convert",
          input: ["upload"],
          output_format: "pdf",
          input_format: "docx",
          engine: "libreoffice",
        },
        "export": { operation: "export/url", input: ["convert"] },
      },
    });

    const uploadTask = job.tasks.find((t: any) => t.name === "upload");
    if (!uploadTask) throw new Error("No upload task found");
    await cc.tasks.upload(uploadTask, docxBuffer, "document.docx");

    job = await cc.jobs.wait(job.id);

    const exportTask = job.tasks.find((t: any) => t.name === "export" && t.status === "finished");
    if (!exportTask?.result?.files?.[0]?.url) throw new Error("No export URL");

    const resp = await fetch(exportTask.result.files[0].url as string);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const pdfBuf = Buffer.from(await resp.arrayBuffer());
    console.log(`[convert-docx-pdf] PDF: ${Math.round(pdfBuf.length / 1024)}KB`);
    return pdfBuf;
  } catch (e: any) {
    console.error("[convert-docx-pdf] Failed:", e.message);
    return null;
  }
}

/**
 * Crop the graphic region from a specific PDF page using mupdf text analysis.
 * Finds the area between intro text and options (A-E), crops just the drawings.
 * Returns a PNG buffer of the cropped region, or null if no graphic found.
 */
export async function cropGraphicFromPdfPage(pdfBuffer: Buffer, pageNum: number): Promise<Buffer | null> {
  try {
    const mupdf = await import("mupdf");
    const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
    if (pageNum < 1 || pageNum > doc.countPages()) return null;

    const page = doc.loadPage(pageNum - 1);
    const pageBounds = page.getBounds();
    const pageHeight = pageBounds[3] - pageBounds[1];
    const pageWidth = pageBounds[2] - pageBounds[0];

    // Extract text lines
    const sText = page.toStructuredText("preserve-whitespace");
    const lines: { y0: number; y1: number; text: string }[] = [];
    let currentLineText = "";
    let currentLineBbox: number[] | null = null;

    sText.walk({
      beginLine(bbox: number[]) { currentLineBbox = bbox; currentLineText = ""; },
      onChar(c: string) { currentLineText += c; },
      endLine() {
        const trimmed = currentLineText.trim();
        if (currentLineBbox && trimmed.length > 0) {
          lines.push({ y0: currentLineBbox[1], y1: currentLineBbox[3], text: trimmed });
        }
        currentLineBbox = null; currentLineText = "";
      },
    });

    if (lines.length < 3) return null;

    // Find options block (A., B., C., D., E.)
    const optionPattern = /^[A-E][\.\)\s]/;
    const firstOptionIdx = lines.findIndex(l => optionPattern.test(l.text));
    if (firstOptionIdx <= 1) return null;

    const SENTENCE_MIN = 18;

    // Intro end: skip question number, extend through sentence lines
    let introEndY1 = lines[0].y1;
    for (let i = 1; i < firstOptionIdx; i++) {
      if (lines[i].text.length >= SENTENCE_MIN) introEndY1 = lines[i].y1;
      else break;
    }

    // Question text: last sentence before options
    let questionTextY0 = lines[firstOptionIdx].y0;
    for (let i = firstOptionIdx - 1; i >= 0; i--) {
      if (lines[i].text.length >= SENTENCE_MIN) { questionTextY0 = lines[i].y0; break; }
    }

    const graphicHeight = questionTextY0 - introEndY1;
    if (graphicHeight < 30) return null;

    // Render and crop
    const scale = 2;
    const PADDING = 5;
    const y0 = Math.max(pageBounds[1], introEndY1 - PADDING);
    const y1 = Math.min(pageBounds[3], questionTextY0 + PADDING);
    const matrix: [number, number, number, number, number, number] = [scale, 0, 0, scale, 0, 0];
    const fullPixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    const fullWidth = fullPixmap.getWidth();
    const fullHeight = fullPixmap.getHeight();
    const fullPixels = fullPixmap.getPixels();
    const stride = fullPixmap.getStride();

    const pixY0 = Math.max(0, Math.round((y0 - pageBounds[1]) * scale));
    const pixY1 = Math.min(fullHeight, Math.round((y1 - pageBounds[1]) * scale));
    const cropHeight = pixY1 - pixY0;
    if (cropHeight <= 0) return null;

    const cropRect: [number, number, number, number] = [0, 0, fullWidth, cropHeight];
    const croppedPixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, cropRect, false);
    croppedPixmap.clear(255);
    const croppedPixels = croppedPixmap.getPixels();
    const croppedStride = croppedPixmap.getStride();

    for (let row = 0; row < cropHeight; row++) {
      const srcOff = (pixY0 + row) * stride;
      const dstOff = row * croppedStride;
      const bytes = Math.min(stride, croppedStride);
      for (let b = 0; b < bytes; b++) croppedPixels[dstOff + b] = fullPixels[srcOff + b];
    }

    const pngBuf = Buffer.from(croppedPixmap.asPNG());
    console.log(`[cropGraphic] Page ${pageNum}: cropped ${fullWidth}x${cropHeight}px (${Math.round(pngBuf.length / 1024)}KB)`);
    return pngBuf;
  } catch (e: any) {
    console.error(`[cropGraphic] Page ${pageNum} failed:`, e.message);
    return null;
  }
}
