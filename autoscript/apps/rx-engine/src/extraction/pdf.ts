import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";

/** Text layer of a PDF, all pages joined. Empty string for image-only PDFs. */
export async function pdfToText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return typeof text === "string" ? text : (text as string[]).join("\n");
}

/**
 * Render the first page of a PDF to PNG, for scanned PDFs that have no text layer. Lets the
 * vision model read them as an image (providers often bill or gate whole-file inputs).
 */
export async function pdfFirstPageToPng(buffer: Buffer): Promise<Buffer> {
  const png = await renderPageAsImage(new Uint8Array(buffer), 1, {
    // @napi-rs/canvas implements the node-canvas API unpdf expects.
    canvas: () => import("@napi-rs/canvas") as never,
    scale: 2,
  });
  return Buffer.from(png);
}
