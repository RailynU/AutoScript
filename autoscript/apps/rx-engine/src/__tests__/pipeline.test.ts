import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnalyzeRequest, EngineCallback, PatientContext } from "@autoscript/shared";
import { createRagPool, type RagPool } from "../rag/db.js";
import { ingestReferences } from "../rag/ingest.js";
import { Retriever } from "../rag/retrieve.js";
import { runPipeline } from "../pipeline.js";
import type { ChatMessage } from "../llm/client.js";
import { FakeLlm } from "./fakeLlm.js";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://autoscript:autoscript@localhost:5433/autoscript_test";
let pool: RagPool;
const silentLog = { info: () => undefined, warn: () => undefined, error: () => undefined };

const holloway: PatientContext = {
  id: "p1", firstName: "Margaret", lastName: "Holloway", dateOfBirth: "1952-03-14", sex: "F", phone: "5550101001", weightKg: 68,
  allergiesVerified: true, allergies: [{ substance: "NKDA", severity: "UNKNOWN" }],
  conditions: [{ name: "Atrial fibrillation", status: "ACTIVE" }],
  medications: [{ name: "Warfarin", genericName: "warfarin", dose: "5 mg", frequency: "daily", active: true }],
};

const ibuprofenExtraction = {
  patientName: "Margaret Holloway", prescriberName: "Dr. Marchetti", dateWritten: "2026-10-23",
  medications: [{ rawName: "Ibuprofen", genericNameGuess: "ibuprofen", strength: "600 mg", form: "tablet", sig: "1 tablet every 8 hours as needed", frequency: "every 8 hours", quantity: "21", confidence: 0.95 }],
  overallConfidence: 0.95,
};

function request(source: AnalyzeRequest["source"], patient: PatientContext | null): AnalyzeRequest {
  return { prescriptionId: "rx-test", callbackUrl: "http://localhost:0/cb", source, patient };
}

async function run(llm: FakeLlm, req: AnalyzeRequest) {
  const callbacks: EngineCallback[] = [];
  const report = await runPipeline({ llm, retriever: new Retriever(pool, llm), send: async (cb) => void callbacks.push(cb), log: silentLog }, req);
  return { callbacks, report };
}

beforeAll(async () => {
  pool = createRagPool(TEST_DB);
  await ingestReferences(pool, new FakeLlm([]));
});
afterAll(async () => pool.end());

describe("retrieval", () => {
  it("ingests the curated collection and finds the warfarin label lexically", async () => {
    const r = new Retriever(pool, new FakeLlm([]));
    expect(await r.documentCount()).toBeGreaterThanOrEqual(15);
    const { results, method } = await r.search("warfarin ibuprofen interaction bleeding risk");
    expect(method).toBe("LEXICAL");
    expect(results.map((e) => e.documentId)).toContain("fda-warfarin-label-interactions");
    expect(results[0]!.chunkId).toMatch(/#\d+$/);
  });
});

describe("pipeline", () => {
  it("fails explicitly when no LLM is configured", async () => {
    const { callbacks, report } = await run(new FakeLlm([], false), request({ kind: "text", text: "Ibuprofen 600 mg" }, holloway));
    expect(report).toBeNull();
    const failed = callbacks.find((c) => c.type === "failed");
    expect(failed && failed.type === "failed" && failed.error).toMatch(/LLM provider is not configured/);
  });

  it("warfarin + ibuprofen: deterministic HIGH finding, rule evidence, grounded AI context, rejected bogus citation", async () => {
    const llm = new FakeLlm([
      ibuprofenExtraction,
      // analysis response: cites one real chunk and one invented chunk, plus an uncited observation
      (() => ({
        summary: "Ibuprofen for a warfarin patient.",
        reasoning: "See [__CHUNK__].",
        findings: [{ findingId: "__FILL__", aiContext: "Mrs. Holloway, 74, is anticoagulated; the label flags NSAIDs.", citations: ["__CHUNK__", "made-up-source#9"] }],
        additionalObservations: [{ title: "Age over 65 raises bleeding risk", severity: "MODERATE", explanation: "Patient is 74.", citations: [], reviewQuestions: ["Confirm last INR"], medications: ["warfarin"] }],
        reviewQuestions: ["Was the prescriber aware of warfarin?"],
      }))(),
    ]);
    // The finding id is generated at runtime; patch the scripted response after rules run by intercepting chatJson.
    const original = llm.chatJson.bind(llm);
    llm.chatJson = async (messages) => {
      const user = String(messages[1]?.content ?? "");
      const idMatch = user.match(/id=(interaction\.pairwise\/warfarin-nsaid-[a-z0-9]+)/);
      const chunkMatch = user.match(/\[(fda-warfarin-label-interactions#\d+)\]/);
      const res = await original(messages);
      if (!idMatch || !chunkMatch) return res;
      return { ...res, content: res.content.replaceAll("__FILL__", idMatch[1]!).replaceAll("__CHUNK__", chunkMatch[1]!) };
    };

    const { callbacks, report } = await run(llm, request({ kind: "text", text: "Ibuprofen 600 mg q8h #21" }, holloway));
    expect(report).not.toBeNull();
    expect(report!.disposition).toBe("MANUAL_REVIEW_NEEDED");

    const stages = callbacks.filter((c) => c.type === "progress").map((c) => (c.type === "progress" ? c.progress.stage : ""));
    expect(stages).toEqual(["EXTRACTING", "NORMALIZING", "LOADING_CONTEXT", "RUNNING_RULES", "RETRIEVING_EVIDENCE", "AI_ANALYSIS", "FINALIZING"]);
    expect(callbacks.at(-1)!.type).toBe("result");

    const interaction = report!.findings.find((f) => f.type === "DRUG_INTERACTION")!;
    expect(interaction.severity).toBe("HIGH");
    expect(interaction.deterministic).toBe(true);
    expect(interaction.evidence.some((e) => e.documentId === "fda-warfarin-label-interactions" && e.retrieval === "RULE")).toBe(true);
    expect(interaction.evidence.some((e) => e.documentId === "fda-ibuprofen-label-anticoagulants")).toBe(true);
    expect(interaction.aiContext).toContain("Holloway");
    expect(interaction.evidence.every((e) => e.chunkId !== "made-up-source#9")).toBe(true);
    expect(report!.ai!.rejectedCitations).toEqual(["made-up-source#9"]);

    const observation = report!.findings.find((f) => f.type === "AI_OBSERVATION")!;
    expect(observation.deterministic).toBe(false);
    expect(observation.evidence).toEqual([]);
    expect(observation.explanation).toContain("unsupported model observation");
    // Unsupported: shown at LOW, proposal kept, marked UNVERIFIED; the disposition still routes on the proposal.
    expect(observation).toMatchObject({ severity: "LOW", proposedSeverity: "MODERATE", supportStatus: "UNVERIFIED", severitySource: "AI_PROPOSED_UNSUPPORTED" });
    expect(observation.explanation).toContain("the model proposed MODERATE");
    expect(report!.coverage.retrievalMethod).toBe("LEXICAL");
    expect(report!.coverage.llmUsed).toBe(true);
    expect(report!.extraction.extractor).toBe("fake/test-model");

    // Therapy context: q8h PRN, #21, 0 refills is a 7-day short course; the rule says so and never calls it chronic.
    expect(interaction.therapyContext).toBe("ACUTE_SHORT_COURSE");
    expect(interaction.therapyContextBasis).toContain("7 days of supply");
    expect(interaction.severitySource).toBe("RULE_TABLE");
    expect(interaction.supportStatus).toBeNull();
    expect(interaction.explanation).toContain("short course");
    expect(interaction.explanation.toLowerCase()).not.toContain("chronic");
    // Beers is attached for its short-term clause (anticoagulant + NSAID), never for its chronic-use clause on a short course.
    const beersSections = interaction.evidence.filter((e) => e.documentId === "beers-criteria-2023-nsaids").map((e) => e.section);
    expect(beersSections).toContain("Non-COX-selective NSAIDs: avoid short-term scheduled use with anticoagulants, antiplatelets or corticosteroids");
    expect(beersSections).not.toContain("Non-COX-selective NSAIDs: avoid chronic use");

    // Evidence traceability: every chunk carries its section, rule evidence stays RULE, and no finding repeats a document section.
    expect(interaction.evidence.length).toBeGreaterThan(0);
    for (const e of interaction.evidence) expect(e.section, e.chunkId).toEqual(expect.any(String));
    expect(interaction.evidence.filter((e) => e.retrieval === "RULE").length).toBeGreaterThan(0);
    for (const f of report!.findings) {
      const keys = f.evidence.map((e) => `${e.documentId}::${e.section}`);
      expect(new Set(keys).size, f.id).toBe(keys.length);
    }

    // The prompt carried the therapy context, the basis, the age and the evidence sections.
    const prompt = String(llm.calls[1]?.[1]?.content ?? "");
    expect(prompt).toContain("THERAPY CONTEXT: ACUTE_SHORT_COURSE");
    expect(prompt).toContain("7 days of supply");
    expect(prompt).toContain("age: 74 years as of the prescription date");
    expect(prompt).toContain("section: Section 7 Drug interactions");
    expect(String(llm.calls[1]?.[0]?.content ?? "")).toContain("Never describe an ACUTE_SHORT_COURSE medication as chronic");
  });

  it("supported AI observation keeps its proposed severity as AI_PROPOSED; a cited section is attached once", async () => {
    const llm = new FakeLlm([
      ibuprofenExtraction,
      {
        summary: "s",
        reasoning: "r",
        findings: [],
        additionalObservations: [
          { title: "Age 74 is a listed bleeding risk factor", severity: "MODERATE", riskBasis: "ESTABLISHED_RISK", explanation: "The warfarin label lists age 65 or older.", citations: ["__HEM__", "__HEM__"], reviewQuestions: [], medications: ["Ibuprofen"] },
          { title: "Renal function not on record", severity: "CRITICAL", riskBasis: "MISSING_INFORMATION", explanation: "No eGFR on record.", citations: ["__HEM__"], reviewQuestions: [], medications: ["Ibuprofen"] },
        ],
        reviewQuestions: [],
      },
    ]);
    const original = llm.chatJson.bind(llm);
    llm.chatJson = async (messages) => {
      const user = String(messages[1]?.content ?? "");
      const res = await original(messages);
      const hem = user.match(/\[(fda-warfarin-label-interactions#\d+)\][^\n]*section: Section 5\.1 Hemorrhage/);
      return hem ? { ...res, content: res.content.replaceAll("__HEM__", hem[1]!) } : res;
    };
    const { report } = await run(llm, request({ kind: "text", text: "Ibuprofen 600 mg q8h #21" }, holloway));
    const observation = report!.findings.find((f) => f.type === "AI_OBSERVATION")!;
    expect(observation).toMatchObject({ severity: "MODERATE", proposedSeverity: "MODERATE", supportStatus: "SUPPORTED", severitySource: "AI_PROPOSED", therapyContext: "ACUTE_SHORT_COURSE" });
    expect(observation.explanation).toContain("established risk");
    expect(observation.explanation).not.toContain("unsupported");
    expect(observation.evidence).toHaveLength(1);
    expect(observation.evidence[0]).toMatchObject({ documentId: "fda-warfarin-label-interactions", section: "Section 5.1 Hemorrhage" });
    expect(report!.ai!.rejectedCitations).toEqual([]);

    // A cited observation about missing information cannot be shown above MODERATE; the proposal stays visible and still drives routing.
    const gap = report!.findings.find((f) => f.id === "ai-observation-2")!;
    expect(gap).toMatchObject({ severity: "MODERATE", proposedSeverity: "CRITICAL", supportStatus: "SUPPORTED", severitySource: "AI_PROPOSED" });
    expect(gap.explanation).toContain("missing information, not a confirmed risk factor");
    expect(gap.explanation).toContain("Severity is shown as MODERATE (the model proposed CRITICAL)");
  });

  it("ACE inhibitor + NSAID short course: the lisinopril label section 7.3 is rule evidence; the Beers chronic-use section is never attached", async () => {
    const llm = new FakeLlm([ibuprofenExtraction, { summary: "s", reasoning: "r", findings: [], additionalObservations: [], reviewQuestions: [] }]);
    const onLisinopril: PatientContext = { ...holloway, id: "p4", medications: [{ name: "Lisinopril", genericName: "lisinopril", dose: "10 mg", frequency: "daily", active: true }] };
    const { report } = await run(llm, request({ kind: "text", text: "Ibuprofen 600 mg q8h #21" }, onLisinopril));
    const ace = report!.findings.find((f) => f.origin === "interaction.pairwise/ace-inhibitor-nsaid")!;
    expect(ace).toMatchObject({ severity: "MODERATE", therapyContext: "ACUTE_SHORT_COURSE", severitySource: "RULE_TABLE" });
    const rule = ace.evidence.filter((e) => e.retrieval === "RULE");
    expect(rule.map((e) => `${e.documentId}::${e.section}`)).toContain("fda-lisinopril-label-nsaids::Section 7.3 Non-steroidal anti-inflammatory agents");
    expect(rule.some((e) => e.documentId === "beers-criteria-2023-nsaids")).toBe(false);
    expect(ace.evidence.map((e) => e.section)).not.toContain("Non-COX-selective NSAIDs: avoid chronic use");
    expect(ace.evidence.every((e) => e.section != null)).toBe(true);
    expect(ace.explanation).toContain("short course");
    expect(ace.explanation.toLowerCase()).not.toContain("chronic");
  });

  it("a model citation of the excluded Beers chronic-use section is not attached to a short-course finding, and a similarity hit on it is dropped too", async () => {
    const onLisinopril: PatientContext = { ...holloway, id: "p5", medications: [{ name: "Lisinopril", genericName: "lisinopril", dose: "10 mg", frequency: "daily", active: true }] };
    const beersChunks = await new Retriever(pool, new FakeLlm([])).byDocumentIds(["beers-criteria-2023-nsaids"]);
    const chronic = beersChunks.find((e) => e.section === "Non-COX-selective NSAIDs: avoid chronic use")!;
    expect(chronic).toBeDefined();
    // Finding ids are generated per run, so the scripted AI answer reads the ACE finding id from the prompt it receives.
    const llm = new FakeLlm([
      ibuprofenExtraction,
      (messages: ChatMessage[]) => {
        const prompt = messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
        const aceId = prompt.match(/id=(interaction\.pairwise\/ace-inhibitor-nsaid-[a-z0-9]+)/)?.[1];
        return { summary: "s", reasoning: "r", findings: [{ findingId: aceId, aiContext: "Short course.", citations: [chronic.chunkId] }], additionalObservations: [], reviewQuestions: [] };
      },
    ]);
    const { report } = await run(llm, request({ kind: "text", text: "Ibuprofen 600 mg q8h #21" }, onLisinopril));
    const ace = report!.findings.find((f) => f.origin === "interaction.pairwise/ace-inhibitor-nsaid")!;
    expect(ace.aiContext).toBe("Short course.");
    expect(ace.evidence.map((e) => e.chunkId)).not.toContain(chronic.chunkId);
    expect(ace.evidence.map((e) => e.section)).not.toContain("Non-COX-selective NSAIDs: avoid chronic use");
    // The chunk stays citable for the report as a whole (it is in the pool), so it is not a rejected citation.
    expect(report!.ai?.rejectedCitations ?? []).not.toContain(chronic.chunkId);
  });

  it("an AI observation on a short-course NSAID cannot be supported by the Beers chronic-use section alone", async () => {
    const chronic = (await new Retriever(pool, new FakeLlm([])).byDocumentIds(["beers-criteria-2023-nsaids"])).find((e) => e.section === "Non-COX-selective NSAIDs: avoid chronic use")!;
    const llm = new FakeLlm([
      ibuprofenExtraction,
      // The model names the line freely ("Motrin (ibuprofen) 600 mg"), not with the exact extracted rawName; the context must still resolve.
      { summary: "s", reasoning: "r", findings: [], additionalObservations: [{ title: "Renal function unknown", severity: "MODERATE", riskBasis: "MISSING_INFORMATION", explanation: "No creatinine on file.", citations: [chronic.chunkId], reviewQuestions: [], medications: ["Motrin (ibuprofen) 600 mg"] }], reviewQuestions: [] },
    ]);
    const { report } = await run(llm, request({ kind: "text", text: "Ibuprofen 600 mg q8h #21" }, holloway));
    const obs = report!.findings.find((f) => f.id === "ai-observation-1")!;
    expect(obs.therapyContext).toBe("ACUTE_SHORT_COURSE");
    expect(obs.evidence).toEqual([]);
    expect(obs).toMatchObject({ supportStatus: "UNVERIFIED", severity: "LOW", proposedSeverity: "MODERATE" });
  });

  it("an unsupported AI observation proposed MODERATE still forces manual review on an otherwise clean prescription", async () => {
    const llm = new FakeLlm([
      { patientName: "Aisha Thompson", prescriberName: "Dr. Natarajan", dateWritten: "2026-10-24", medications: [{ rawName: "Cetirizine", strength: "10 mg", sig: "1 tablet daily", frequency: "once daily", quantity: "30", confidence: 0.97 }], overallConfidence: 0.97 },
      { summary: "s", reasoning: "r", findings: [], additionalObservations: [{ title: "Sedation", severity: "MODERATE", explanation: "Possible sedation.", citations: [], reviewQuestions: [], medications: ["cetirizine"] }], reviewQuestions: [] },
    ]);
    const thompson: PatientContext = { ...holloway, id: "p3", firstName: "Aisha", lastName: "Thompson", dateOfBirth: "1991-11-05", medications: [], conditions: [] };
    const { report } = await run(llm, request({ kind: "text", text: "Cetirizine 10 mg daily" }, thompson));
    expect(report!.findings[0]).toMatchObject({ type: "AI_OBSERVATION", severity: "LOW", proposedSeverity: "MODERATE", supportStatus: "UNVERIFIED", therapyContext: "CHRONIC" });
    expect(report!.disposition).toBe("MANUAL_REVIEW_NEEDED");
    expect(report!.dispositionReason).toContain("MODERATE (shown as LOW");
  });

  it("no patient linked: manual review with missing-context finding even when the prescription is clean", async () => {
    const llm = new FakeLlm([
      { patientName: "J. Whitfield", medications: [{ rawName: "Metoprolol succinate", strength: "50 mg", sig: "1 PO daily", frequency: "daily", quantity: "30", confidence: 0.9 }, { rawName: "Zelmoravix", strength: "20 mg", sig: "1 tab PO qAM", frequency: "every morning", quantity: "30", confidence: 0.7 }], uncertainties: ["prescriber signature illegible"], overallConfidence: 0.6 },
      { summary: "s", reasoning: "r", findings: [], additionalObservations: [], reviewQuestions: [] },
    ]);
    const { report } = await run(llm, request({ kind: "text", text: "fax" }, null));
    expect(report!.disposition).toBe("MANUAL_REVIEW_NEEDED");
    const origins = report!.findings.map((f) => f.origin);
    expect(origins).toContain("context.no-patient");
    expect(origins).toContain("rx.unresolved-drug");
    expect(origins).toContain("rx.extraction-confidence");
    expect(report!.findings.some((f) => f.type === "DRUG_INTERACTION")).toBe(false);
    expect(report!.coverage.limitations.some((l) => l.includes("No patient record"))).toBe(true);
  });

  it("clean prescription + verified record + completed AI pass: NO_FLAGS_DETECTED within checked criteria", async () => {
    const llm = new FakeLlm([
      { patientName: "Aisha Thompson", prescriberName: "Dr. Natarajan", dateWritten: "2026-10-24", medications: [{ rawName: "Cetirizine", strength: "10 mg", sig: "1 tablet daily", frequency: "once daily", quantity: "30", confidence: 0.97 }], overallConfidence: 0.97 },
      { summary: "Routine antihistamine.", reasoning: "No evidence of concern.", findings: [], additionalObservations: [], reviewQuestions: ["Confirm no other sedating medications"] },
    ]);
    const thompson: PatientContext = { ...holloway, id: "p3", firstName: "Aisha", lastName: "Thompson", dateOfBirth: "1991-11-05", medications: [], conditions: [] };
    const { report } = await run(llm, request({ kind: "text", text: "Cetirizine 10 mg daily" }, thompson));
    expect(report!.disposition).toBe("NO_FLAGS_DETECTED");
    expect(report!.dispositionReason).toContain("within checked criteria");
    expect(report!.findings).toEqual([]);
  });

  it("AI step failure is recorded as a SYSTEM_LIMITATION and forces manual review", async () => {
    const llm = new FakeLlm([
      { medications: [{ rawName: "Cetirizine", strength: "10 mg", sig: "1 daily", frequency: "daily", quantity: "30", confidence: 0.97 }], prescriberName: "Dr. X", dateWritten: "2026-10-24", overallConfidence: 0.97 },
      new Error("provider 502"),
    ]);
    const { report, callbacks } = await run(llm, request({ kind: "text", text: "Cetirizine" }, { ...holloway, medications: [] }));
    expect(callbacks.at(-1)!.type).toBe("result");
    expect(report!.disposition).toBe("MANUAL_REVIEW_NEEDED");
    expect(report!.findings.some((f) => f.type === "SYSTEM_LIMITATION" && f.explanation.includes("provider 502"))).toBe(true);
    expect(report!.ai).toBeNull();
    expect(report!.coverage.llmUsed).toBe(false);
  });
});

describe("chunkDocument", () => {
  it("records the heading in force as the section, never spans two headings, and leaves the preamble without a section", async () => {
    const { chunkDocument } = await import("../rag/references.js");
    const body = ["Preamble line.", "## First", "Para one.", "Para two.", "## Second", "Para three."].join("\n\n");
    expect(chunkDocument(body)).toEqual([
      { section: null, content: "Preamble line." },
      { section: "First", content: "Para one.\nPara two." },
      { section: "Second", content: "Para three." },
    ]);
    // A long section is split, both halves keeping the section.
    const long = ["## Only", "a".repeat(600), "b".repeat(600)].join("\n\n");
    expect(chunkDocument(long).map((c) => c.section)).toEqual(["Only", "Only"]);
  });

  it("the reference sections the rules name exist under those exact headings in the ingested collection", async () => {
    const { BEERS_CHRONIC_USE_SECTION, BEERS_SHORT_TERM_COMBINATION_SECTION, LISINOPRIL_REFERENCE_ID } = await import("@autoscript/clinical-rules");
    const expected: Array<[string, string]> = [
      ["beers-criteria-2023-nsaids", BEERS_CHRONIC_USE_SECTION],
      ["beers-criteria-2023-nsaids", BEERS_SHORT_TERM_COMBINATION_SECTION],
      [LISINOPRIL_REFERENCE_ID, "Section 7.3 Non-steroidal anti-inflammatory agents"],
    ];
    for (const [documentId, section] of expected) {
      const res = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM reference_chunks WHERE document_id = $1 AND section = $2`, [documentId, section]);
      expect(Number(res.rows[0]!.n), `${documentId}::${section}`).toBe(1);
    }
    const sections = await pool.query<{ with_section: string; total: string }>(`SELECT count(section)::text AS with_section, count(*)::text AS total FROM reference_chunks`);
    expect(Number(sections.rows[0]!.with_section)).toBeGreaterThan(0);
    expect(Number(sections.rows[0]!.total) - Number(sections.rows[0]!.with_section)).toBe(await new Retriever(pool, new FakeLlm([])).documentCount() - 1);
  });
});

describe("interleaveByDocument", () => {
  it("gives every document a slot before any document repeats", async () => {
    const { interleaveByDocument } = await import("../pipeline.js");
    const mk = (doc: string, n: number) => ({ chunkId: `${doc}#${n}`, documentId: doc, title: "", source: "", url: null, section: null, excerpt: "", retrieval: "RULE" as const, score: null });
    const out = interleaveByDocument([mk("a", 1), mk("a", 2), mk("a", 3), mk("b", 1), mk("c", 1), mk("c", 2)]);
    expect(out.map((e) => e.chunkId)).toEqual(["a#1", "b#1", "c#1", "a#2", "c#2", "a#3"]);
  });

  it("preambles of every cited document come after all substantive sections, so a short document's disclaimer never takes an evidence slot", async () => {
    const { interleaveByDocument, preambleLast } = await import("../pipeline.js");
    const mk = (doc: string, n: number, section: string | null) => ({ chunkId: `${doc}#${n}`, documentId: doc, title: "", source: "", url: null, section, excerpt: "", retrieval: "RULE" as const, score: null });
    // A 2-section document with a preamble (like the lisinopril label) beside a 4-section one (like the ibuprofen label).
    const chunks = [mk("lis", 1, null), mk("lis", 2, "7.3"), mk("lis", 3, "Relevance"), mk("ibu", 1, null), mk("ibu", 2, "Boxed"), mk("ibu", 3, "Interactions"), mk("ibu", 4, "Dosing"), mk("ibu", 5, "Relevance")];
    const ordered = preambleLast(interleaveByDocument(chunks));
    expect(ordered.slice(0, 6).every((e) => e.section != null)).toBe(true);
    expect(ordered.slice(-2).map((e) => e.chunkId).sort()).toEqual(["ibu#1", "lis#1"]);
    // The previous order (preambleLast before interleaving) put a preamble inside the first six.
    expect(interleaveByDocument(preambleLast(chunks)).slice(0, 6).some((e) => e.section == null)).toBe(true);
  });
});
