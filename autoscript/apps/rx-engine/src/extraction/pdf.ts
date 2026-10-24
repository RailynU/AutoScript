import { extractText, getDocumentProxy } from "unpdf";

/** Text layer of a PDF, all pages joined. Empty string for image-only PDFs. */
export async function pdfToText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return typeof text === "string" ? text : (text as string[]).join("\n");
}
