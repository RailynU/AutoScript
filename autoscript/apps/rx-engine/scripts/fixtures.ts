import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DEMO_SCENARIOS } from "@autoscript/shared";

/**
 * Generates synthetic prescription documents (PDF with text layer + PNG image)
 * for each demo scenario so the upload path can be demonstrated end to end.
 * Output: apps/rx-engine/demo-files/<scenario>.pdf|png
 */
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../demo-files");

async function makePdf(title: string, text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 36, y: 700, width: 540, height: 56, color: rgb(0.93, 0.96, 1) });
  page.drawText("SYNTHETIC DEMO PRESCRIPTION - NOT A REAL PATIENT", { x: 48, y: 734, size: 11, font: bold, color: rgb(0.1, 0.3, 0.6) });
  page.drawText(title, { x: 48, y: 714, size: 14, font: bold });
  let y = 670;
  for (const line of text.split("\n")) {
    page.drawText(line, { x: 48, y, size: 12, font, maxWidth: 520 });
    y -= 20;
  }
  return doc.save();
}

async function makePng(title: string, text: string): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    const lines = text.split("\n");
    const canvas = createCanvas(1240, 220 + lines.length * 38);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e8eef8";
    ctx.fillRect(40, 40, canvas.width - 80, 110);
    ctx.fillStyle = "#1d4ed8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("SYNTHETIC DEMO PRESCRIPTION - NOT A REAL PATIENT", 60, 82);
    ctx.fillStyle = "#111827";
    ctx.font = "bold 30px sans-serif";
    ctx.fillText(title, 60, 128);
    ctx.font = "26px sans-serif";
    lines.forEach((line, i) => ctx.fillText(line, 60, 210 + i * 38));
    return canvas.toBuffer("image/png");
  } catch (err) {
    console.warn(`PNG generation skipped (${err instanceof Error ? err.message : err})`);
    return null;
  }
}

await mkdir(outDir, { recursive: true });
for (const s of DEMO_SCENARIOS) {
  await writeFile(path.join(outDir, `${s.key}.pdf`), await makePdf(s.title, s.text));
  const png = await makePng(s.title, s.text);
  if (png) await writeFile(path.join(outDir, `${s.key}.png`), png);
  console.log(`wrote demo-files/${s.key}.pdf${png ? " + .png" : ""}`);
}
