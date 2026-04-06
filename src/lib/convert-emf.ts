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
          // High quality settings
          pixel_density: 300,
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

    // Download the result
    const exportTask = job.tasks.find(
      (t: any) => t.name === "export" && t.status === "finished",
    );
    if (!exportTask?.result?.files?.[0]?.url) {
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
