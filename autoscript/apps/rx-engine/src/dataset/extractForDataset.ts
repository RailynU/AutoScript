import { z } from "zod";
import { ExtractedPrescriptionSchema, type ExtractedPrescription } from "@autoscript/shared";
import { EXTRACTION_SYSTEM_PROMPT, LlmExtractionSchema, normalizeExtraction } from "../extraction/extract.js";
import { extractJson, type ChatMessage, type LlmClient } from "../llm/client.js";
import { DocumentProfileSchema, type DocumentProfile } from "./schema.js";

/** Same transcription contract as the app, plus a profile of the document itself. */
export const DATASET_SYSTEM_PROMPT = `${EXTRACTION_SYSTEM_PROMPT}

For this task, wrap your answer in an outer object:
{
  "document": {
    "type": "prescription" | "medical_certificate" | "lab_request" | "referral" | "other" | "not_a_document",
    "handwritten": "handwritten" | "printed" | "mixed",
    "language": string|null,                  // ISO 639-1 code of the main language, e.g. "en"
    "legibility": number,                     // 0-1, how readable the writing is regardless of content
    "qualityNotes": string[]                  // blur, crop, glare, redaction bars, low resolution...
  },
  "extraction": { ...the prescription object described above... }
}
If the document is not a prescription, still fill "extraction" with whatever fields are present and leave "medications" empty unless drugs are actually prescribed.`;

const DatasetLlmResponseSchema = z.object({
  document: DocumentProfileSchema,
  extraction: LlmExtractionSchema,
});

export interface DatasetExtraction {
  document: DocumentProfile;
  extraction: ExtractedPrescription;
  model: string;
  durationMs: number;
}

function messagesFor(fileName: string, base64: string): ChatMessage[] {
  return [
    { role: "system", content: DATASET_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: `This image ("${fileName}") comes from a prescription image collection. Profile the document and extract it.` },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
      ],
    },
  ];
}

function parse(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}

/** One vision call with a single repair round, mirroring extractPrescription(). */
export async function extractForDataset(llm: LlmClient, fileName: string, base64: string): Promise<DatasetExtraction> {
  const messages = messagesFor(fileName, base64);
  const model = llm.visionModel;
  const first = await llm.chatJson(messages, { model });
  let parsed = DatasetLlmResponseSchema.safeParse(parse(first.content));
  let used = first;
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    used = await llm.chatJson(
      [
        ...messages,
        { role: "assistant", content: first.content },
        { role: "user", content: `Your JSON did not match the required schema:\n${issues}\nReturn the corrected JSON object only.` },
      ],
      { model },
    );
    parsed = DatasetLlmResponseSchema.safeParse(parse(used.content));
    if (!parsed.success) throw new Error(`Dataset extraction failed schema validation twice: ${issues}`);
  }
  const extraction = ExtractedPrescriptionSchema.parse(normalizeExtraction(parsed.data.extraction, used.model));
  return { document: parsed.data.document, extraction, model: used.model, durationMs: first.durationMs + (used === first ? 0 : used.durationMs) };
}
