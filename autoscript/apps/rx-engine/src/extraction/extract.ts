import { z } from "zod";
import { normalizeDrugName } from "@autoscript/clinical-rules";
import { ExtractedPrescriptionSchema, type AnalyzeRequest, type ExtractedPrescription } from "@autoscript/shared";
import { extractJson, type ChatMessage, type LlmClient } from "../llm/client.js";
import { pdfToText } from "./pdf.js";

/** What we ask the model for. Normalization happens locally afterwards. */
const LlmMedicationSchema = z.object({
  rawName: z.string().min(1),
  genericNameGuess: z.string().nullable().default(null),
  strength: z.string().nullable().default(null),
  form: z.string().nullable().default(null),
  route: z.string().nullable().default(null),
  sig: z.string().nullable().default(null),
  frequency: z.string().nullable().default(null),
  quantity: z.string().nullable().default(null),
  refills: z.string().nullable().default(null),
  duration: z.string().nullable().default(null),
  indication: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const LlmExtractionSchema = z.object({
  patientName: z.string().nullable().default(null),
  patientDateOfBirth: z.string().nullable().default(null),
  prescriberName: z.string().nullable().default(null),
  prescriberIdentifier: z.string().nullable().default(null),
  dateWritten: z.string().nullable().default(null),
  medications: z.array(LlmMedicationSchema).default([]),
  statedAllergies: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
  uncertainties: z.array(z.string()).default([]),
  overallConfidence: z.number().min(0).max(1).default(0.5),
});
export type LlmExtraction = z.infer<typeof LlmExtractionSchema>;

export const EXTRACTION_SYSTEM_PROMPT = `You are a pharmacy intake assistant. You read a prescription (text, PDF text, or an image) and return ONLY a JSON object with this exact shape:
{
  "patientName": string|null,
  "patientDateOfBirth": string|null,          // as written, ISO if unambiguous
  "prescriberName": string|null,
  "prescriberIdentifier": string|null,        // NPI/DEA/license if present
  "dateWritten": string|null,
  "medications": [
    {
      "rawName": string,                       // the drug name exactly as written (brand or generic), without strength
      "genericNameGuess": string|null,         // lower-case generic name ONLY if you are certain; otherwise null
      "strength": string|null,                 // e.g. "600 mg", "5/325 mg"
      "form": string|null,                     // tablet, capsule, suspension...
      "route": string|null,
      "sig": string|null,                      // full directions as written
      "frequency": string|null,                // e.g. "every 8 hours", "twice daily", "TID"
      "quantity": string|null,
      "refills": string|null,
      "duration": string|null,
      "indication": string|null,
      "confidence": number                     // 0-1, how sure you are this line is read correctly
    }
  ],
  "statedAllergies": string[],                 // allergies written on the document itself
  "notes": string|null,
  "uncertainties": string[],                   // anything illegible, cut off, ambiguous or possibly misread
  "overallConfidence": number                  // 0-1
}
Rules:
- Transcribe what is on the document. Do not add medications, strengths, or directions that are not written.
- If a value is missing or unreadable, use null and describe the problem in "uncertainties".
- Never guess a generic name for a drug you do not recognize with certainty; leave genericNameGuess null.
- Output JSON only, no prose.`;

function sourceToMessages(source: AnalyzeRequest["source"], pdfText: string | null): ChatMessage[] {
  if (source.kind === "text") {
    return [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: `Prescription text:\n"""\n${source.text}\n"""` },
    ];
  }
  if (pdfText != null) {
    return [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: `Text extracted from the PDF "${source.fileName}":\n"""\n${pdfText}\n"""` },
    ];
  }
  return [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: `This image is a prescription document ("${source.fileName}"). Extract it.` },
        { type: "image_url", image_url: { url: `data:${source.mimeType};base64,${source.base64}` } },
      ],
    },
  ];
}

async function askForExtraction(llm: LlmClient, messages: ChatMessage[], model: string): Promise<{ data: LlmExtraction; model: string }> {
  const first = await llm.chatJson(messages, { model });
  const attempt = LlmExtractionSchema.safeParse(safeJson(first.content));
  if (attempt.success) return { data: attempt.data, model: first.model };

  // One repair round: show the validation errors and ask for corrected JSON.
  const issues = attempt.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
  const repair = await llm.chatJson(
    [
      ...messages,
      { role: "assistant", content: first.content },
      { role: "user", content: `Your JSON did not match the required schema:\n${issues}\nReturn the corrected JSON object only.` },
    ],
    { model },
  );
  const second = LlmExtractionSchema.safeParse(safeJson(repair.content));
  if (!second.success) {
    const tail = repair.content.trim().slice(0, 160).replace(/\s+/g, " ");
    throw new Error(`Extraction output failed schema validation twice: ${issues}. Last response started with: "${tail}"`);
  }
  return { data: second.data, model: repair.model };
}

/**
 * Returns null (which fails schema validation and triggers the repair round) when the model
 * did not return JSON. Returning {} here would be accepted by the all-defaults schema as an
 * empty extraction with confidence 0.5, hiding the failure.
 */
function safeJson(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}

const MIN_PDF_TEXT_CHARS = 25;

/** Extract a structured prescription from text, PDF or image, then normalize drug names locally. */
export async function extractPrescription(llm: LlmClient, source: AnalyzeRequest["source"]): Promise<ExtractedPrescription> {
  let pdfText: string | null = null;
  let model = llm.model;
  if (source.kind === "file" && source.mimeType === "application/pdf") {
    pdfText = await pdfToText(Buffer.from(source.base64, "base64"));
    if (pdfText.trim().length < MIN_PDF_TEXT_CHARS) {
      throw new Error("The PDF has no readable text layer (scanned image?). Export it as JPG/PNG and upload the image instead.");
    }
  } else if (source.kind === "file") {
    model = llm.visionModel;
  }

  const { data, model: usedModel } = await askForExtraction(llm, sourceToMessages(source, pdfText), model);
  return normalizeExtraction(data, usedModel);
}

/** Apply the local drug map to the model output. Exported for tests. */
export function normalizeExtraction(data: LlmExtraction, extractor: string): ExtractedPrescription {
  const medications = data.medications.map((m) => {
    const fromRaw = normalizeDrugName(m.rawName).generic;
    const fromGuess = !fromRaw && m.genericNameGuess ? normalizeDrugName(m.genericNameGuess).generic : null;
    const { genericNameGuess: _g, ...rest } = m;
    return {
      ...rest,
      normalizedName: fromRaw ?? fromGuess,
      normalizationSource: fromRaw ? ("LOCAL_MAP" as const) : fromGuess ? ("LLM" as const) : ("UNRESOLVED" as const),
    };
  });
  return ExtractedPrescriptionSchema.parse({ ...data, medications, extractor });
}
