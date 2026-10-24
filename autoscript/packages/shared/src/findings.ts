import { z } from "zod";

export const Severity = z.enum(["CRITICAL", "HIGH", "MODERATE", "LOW", "INFO"]);
export type Severity = z.infer<typeof Severity>;

export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MODERATE: 3,
  LOW: 2,
  INFO: 1,
};

export const FindingType = z.enum([
  "DRUG_INTERACTION",
  "ALLERGY_CONFLICT",
  "MISSING_PATIENT_INFO",
  "MISSING_PRESCRIPTION_INFO",
  "DUPLICATE_THERAPY",
  "DOSE_CONCERN",
  "CONDITION_CONFLICT",
  "EXTRACTION_UNCERTAINTY",
  "AI_OBSERVATION",
  "SYSTEM_LIMITATION",
  "DATA_ENTRY_MISMATCH",
]);
export type FindingType = z.infer<typeof FindingType>;

/**
 * Whether the prescribed exposure is a short course or ongoing therapy.
 * Classified deterministically from duration, quantity, frequency, refills and PRN wording.
 */
export const TherapyContext = z.enum(["ACUTE_SHORT_COURSE", "CHRONIC", "UNKNOWN"]);
export type TherapyContext = z.infer<typeof TherapyContext>;

/**
 * Where a finding's severity comes from:
 * - RULE_TABLE: the curated deterministic rule table.
 * - AI_PROPOSED: proposed by the model and backed by at least one accepted citation.
 * - AI_PROPOSED_UNSUPPORTED: proposed by the model without any accepted citation; shown clamped to LOW.
 */
export const SeveritySource = z.enum(["RULE_TABLE", "AI_PROPOSED", "AI_PROPOSED_UNSUPPORTED"]);
export type SeveritySource = z.infer<typeof SeveritySource>;

/** For AI observations only: SUPPORTED when at least one accepted citation survived, else UNVERIFIED. */
export const SupportStatus = z.enum(["SUPPORTED", "UNVERIFIED"]);
export type SupportStatus = z.infer<typeof SupportStatus>;

/**
 * A citation into the curated reference collection.
 * Clinical fields: documentId, title, source, url, section, excerpt.
 * Retrieval diagnostics (not clinical content): retrieval, score.
 */
export const EvidenceRefSchema = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  title: z.string(),
  source: z.string(),
  url: z.string().nullable().default(null),
  /** Heading of the reference section the chunk was cut from; null for documents without headings. */
  section: z.string().nullable().default(null),
  excerpt: z.string(),
  /** Retrieval diagnostic. How the chunk was retrieved: vector similarity, lexical, or attached by a rule. */
  retrieval: z.enum(["VECTOR", "LEXICAL", "RULE"]),
  /** Retrieval diagnostic. Similarity or rank score; null for rule-attached chunks. */
  score: z.number().nullable().default(null),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

const FindingBaseSchema = z.object({
  id: z.string(),
  type: FindingType,
  severity: Severity,
  title: z.string(),
  /** Deterministic rule explanation (engine authored), never LLM authored. */
  explanation: z.string(),
  /** LLM-authored contextual note, grounded in the cited evidence. Null when the LLM did not run. */
  aiContext: z.string().nullable().default(null),
  /** Rule id that produced the finding, or "llm" for AI observations. */
  origin: z.string(),
  medications: z.array(z.string()).default([]),
  evidence: z.array(EvidenceRefSchema).default([]),
  reviewQuestions: z.array(z.string()).default([]),
  /** True when the finding is a deterministic rule hit (as opposed to an AI observation). */
  deterministic: z.boolean(),
  // Traceability fields. Declared optional (not `.default()`) so the inferred type stays assignable
  // from reports and literals written before they existed; parsing still fills every one of them
  // through `fillFindingDefaults` below, so a parsed finding always carries them.
  /** Short course vs ongoing therapy for the prescribed medication(s) this finding is about. Parse default: UNKNOWN. */
  therapyContext: TherapyContext.optional(),
  /** Human-readable basis for therapyContext (what was parsed from the prescription). Parse default: null. */
  therapyContextBasis: z.string().nullable().optional(),
  /** Parse default: RULE_TABLE for deterministic findings, AI_PROPOSED otherwise. */
  severitySource: SeveritySource.optional(),
  /** AI observations only; null for deterministic findings. Parse default: SUPPORTED when evidence is attached, else UNVERIFIED. */
  supportStatus: SupportStatus.nullable().optional(),
  /** The severity the model proposed, kept when the shown severity was clamped. Parse default: null. */
  proposedSeverity: Severity.nullable().optional(),
});

type FindingBase = z.infer<typeof FindingBaseSchema>;

/** A finding whose traceability fields are known to be present (the result of `fillFindingDefaults`). */
export type TracedFinding<T extends FindingBase = FindingBase> = T & {
  therapyContext: TherapyContext;
  therapyContextBasis: string | null;
  severitySource: SeveritySource;
  supportStatus: SupportStatus | null;
  proposedSeverity: Severity | null;
};

/** Applies the parse defaults for the traceability fields (findings written before they existed). */
export function fillFindingDefaults<T extends FindingBase>(f: T): TracedFinding<T> {
  const severitySource: SeveritySource = f.severitySource ?? (f.deterministic ? "RULE_TABLE" : "AI_PROPOSED");
  const supportStatus: SupportStatus | null = f.deterministic ? null : (f.supportStatus ?? (f.evidence.length > 0 ? "SUPPORTED" : "UNVERIFIED"));
  return {
    ...f,
    therapyContext: f.therapyContext ?? "UNKNOWN",
    therapyContextBasis: f.therapyContextBasis ?? null,
    severitySource,
    supportStatus,
    proposedSeverity: f.proposedSeverity ?? null,
  };
}

export const FindingSchema = FindingBaseSchema.transform((f): FindingBase => fillFindingDefaults(f));
export type Finding = z.infer<typeof FindingSchema>;

export const Disposition = z.enum(["MANUAL_REVIEW_NEEDED", "NO_FLAGS_DETECTED"]);
export type Disposition = z.infer<typeof Disposition>;
