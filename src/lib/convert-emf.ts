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
