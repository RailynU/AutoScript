import type { AnalysisReport, Finding, TherapyContext } from "@autoscript/shared";
import { familyOf, originMatches, SYSTEM_ORIGIN, type RuleFamily } from "./families.js";
import type { Aggregate, CaseResult, DetectionResult, EvidenceSectionRef, ExtractionGroupStats, Ratio } from "./types.js";

/** A ratio that is null (printed "n/a") when there is nothing to divide by. */
export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

export function formatRatio(r: Ratio, digits = 3): string {
  return r.value == null ? `n/a (0 labelled)` : `${r.value.toFixed(digits)} (${r.numerator}/${r.denominator})`;
}

/** Deterministic rule findings of a report: rule hits only, never AI observations or the engine's own system limitation. */
export function ruleFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.deterministic && f.origin !== SYSTEM_ORIGIN);
}

/**
 * Family-level confusion counts for one case. A family counts once however many findings it produced.
 * Families in neither list are reported as unlabelled and take no part in the counts.
 */
export function matchFamilies(firedOrigins: string[], expected: RuleFamily[], absent: RuleFamily[]): DetectionResult {
  const fired = (family: RuleFamily): boolean => firedOrigins.some((o) => originMatches(o, family));
  const matched = expected.filter(fired);
  const missed = expected.filter((f) => !fired(f));
  const falseAlarms = absent.filter(fired);
  const trueNegatives = absent.filter((f) => !fired(f));
  const labelled = (origin: string): boolean => [...expected, ...absent].some((family) => originMatches(origin, family));
  const unlabeled = [...new Set(firedOrigins.filter((o) => !labelled(o)).map(familyOf))];
  return { tp: matched.length, fp: falseAlarms.length, fn: missed.length, tn: trueNegatives.length, matched, missed, falseAlarms, unlabeled };
}

/** Share of deterministic rule findings that carry at least one evidence excerpt. */
export function evidenceCoverage(findings: Finding[]): { deterministicFindings: number; withEvidence: number; coverage: number | null } {
  const rules = ruleFindings(findings);
  const withEvidence = rules.filter((f) => f.evidence.length > 0).length;
  return { deterministicFindings: rules.length, withEvidence, coverage: rules.length === 0 ? null : withEvidence / rules.length };
}

export function unsupportedObservations(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.type === "AI_OBSERVATION" && f.supportStatus === "UNVERIFIED");
}

export function supportedObservations(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.type === "AI_OBSERVATION" && f.supportStatus === "SUPPORTED");
}

function wordPattern(word: string): RegExp {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
}

/**
 * Literal wording check. Deterministic text is rule-authored and must be clean; AI text is reported
 * separately because the same word may legitimately describe the patient's existing therapy.
 */
export function forbiddenWording(report: AnalysisReport, words: string[]): { deterministicHits: string[]; aiHits: string[] } {
  const deterministicHits: string[] = [];
  const aiHits: string[] = [];
  if (words.length === 0) return { deterministicHits, aiHits };
  const patterns = words.map((w) => [w, wordPattern(w)] as const);
  const scan = (label: string, text: string | null | undefined, into: string[]): void => {
    if (!text) return;
    for (const [word, pattern] of patterns) if (pattern.test(text)) into.push(`${label}: "${word}"`);
  };
  for (const f of report.findings) {
    if (f.deterministic) scan(`${f.id} title/explanation`, `${f.title} ${f.explanation}`, deterministicHits);
    else scan(`${f.id} title/explanation`, `${f.title} ${f.explanation}`, aiHits);
    scan(`${f.id} aiContext`, f.aiContext, aiHits);
  }
  scan("ai.summary", report.ai?.summary, aiHits);
  scan("ai.reasoning", report.ai?.reasoning, aiHits);
  return { deterministicHits, aiHits };
}

function sectionKey(e: EvidenceSectionRef): string {
  return `${e.documentId}::${e.section}`;
}

/** Which required sections are attached to a finding of an expected family, and which banned sections appear anywhere. */
export function evidenceSections(
  findings: Finding[],
  expectedFamilies: RuleFamily[],
  required: EvidenceSectionRef[],
  banned: EvidenceSectionRef[],
): { expectedPresent: number; present: number; expectedAbsent: number; violations: string[] } {
  const onExpected = new Set(
    findings
      .filter((f) => expectedFamilies.some((family) => originMatches(f.origin, family)))
      .flatMap((f) => f.evidence.map((e) => `${e.documentId}::${e.section ?? ""}`)),
  );
  const anywhere = new Set(findings.flatMap((f) => f.evidence.map((e) => `${e.documentId}::${e.section ?? ""}`)));
  const present = required.filter((r) => onExpected.has(sectionKey(r))).length;
  const violations = [
    ...required.filter((r) => !onExpected.has(sectionKey(r))).map((r) => `missing ${sectionKey(r)}`),
    ...banned.filter((b) => anywhere.has(sectionKey(b))).map((b) => `attached ${sectionKey(b)}`),
  ];
  return { expectedPresent: required.length, present, expectedAbsent: banned.length, violations };
}

/** Therapy contexts of the fired findings that belong to an expected family. */
export function observedTherapyContexts(findings: Finding[], expectedFamilies: RuleFamily[]): TherapyContext[] {
  return [
    ...new Set(
      ruleFindings(findings)
        .filter((f) => expectedFamilies.some((family) => originMatches(f.origin, family)))
        .map((f) => f.therapyContext ?? "UNKNOWN"),
    ),
  ];
}

export function missingLimitations(limitations: string[], expected: string[]): string[] {
  return expected.filter((needle) => !limitations.some((l) => l.toLowerCase().includes(needle.toLowerCase())));
}

function groupStats(results: CaseResult[], key: (r: CaseResult) => string): Record<string, ExtractionGroupStats> {
  const groups = new Map<string, CaseResult[]>();
  for (const r of results) if (r.extraction.score) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  const out: Record<string, ExtractionGroupStats> = {};
  for (const [k, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const scores = items.map((r) => r.extraction.score!);
    out[k] = {
      n: items.length,
      meanOverall: round(scores.reduce((s, x) => s + x.overall, 0) / items.length),
      medicationsMatched: scores.reduce((s, x) => s + x.medicationsMatched, 0),
      medicationsExpected: scores.reduce((s, x) => s + x.medicationsExpected, 0),
    };
  }
  return out;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function sum(items: number[]): number {
  return items.reduce((s, x) => s + x, 0);
}

/** Aggregate over all case results. Every rate names its numerator and denominator; nothing is computed without labels. */
export function aggregate(results: CaseResult[]): Aggregate {
  const ok = results.filter((r) => r.status === "ok");
  const detections = ok.map((r) => r.detection).filter((d): d is DetectionResult => d != null);
  const tp = sum(detections.map((d) => d.tp));
  const fp = sum(detections.map((d) => d.fp));
  const fn = sum(detections.map((d) => d.fn));
  const tn = sum(detections.map((d) => d.tn));
  const disposition = ok.filter((r) => r.dispositionMatch != null);
  const therapy = ok.filter((r) => r.therapyContext.match != null);
  const limitations = ok.filter((r) => r.limitations.match != null);
  const wordingCases = ok.filter((r) => r.wording.forbidden.length > 0);
  const manual = ok.filter((r) => r.manualReview != null);
  const scored = ok.filter((r) => r.extraction.score != null);
  const retrieval: Record<string, number> = {};
  for (const r of ok) if (r.retrievalMethod) retrieval[r.retrievalMethod] = (retrieval[r.retrievalMethod] ?? 0) + 1;
  return {
    cases: {
      total: results.length,
      ok: ok.length,
      error: results.length - ok.length,
      curated: results.filter((r) => r.set === "curated").length,
      generated: results.filter((r) => r.set === "generated").length,
    },
    detection: {
      tp,
      fp,
      fn,
      tn,
      labelledPositives: tp + fn,
      labelledNegatives: tn + fp,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      falseNegativeRate: ratio(fn, tp + fn),
      specificity: ratio(tn, tn + fp),
      unlabeledFired: sum(detections.map((d) => d.unlabeled.length)),
    },
    disposition: ratio(disposition.filter((r) => r.dispositionMatch).length, disposition.length),
    manualReview: ratio(manual.filter((r) => r.manualReview).length, manual.length),
    therapyContext: ratio(therapy.filter((r) => r.therapyContext.match).length, therapy.length),
    limitations: ratio(limitations.filter((r) => r.limitations.match).length, limitations.length),
    wording: {
      casesWithRule: wordingCases.length,
      deterministicViolations: sum(wordingCases.map((r) => r.wording.deterministicHits.length)),
      aiHits: sum(wordingCases.map((r) => r.wording.aiHits.length)),
    },
    evidenceSections: {
      expectedPresent: sum(ok.map((r) => r.evidenceSections.expectedPresent)),
      present: sum(ok.map((r) => r.evidenceSections.present)),
      expectedAbsent: sum(ok.map((r) => r.evidenceSections.expectedAbsent)),
      violations: sum(ok.map((r) => r.evidenceSections.violations.length)),
    },
    evidence: ratio(sum(ok.map((r) => r.evidence.withEvidence)), sum(ok.map((r) => r.evidence.deterministicFindings))),
    ai: {
      completed: ok.filter((r) => r.ai.completed === true).length,
      observations: sum(ok.map((r) => r.ai.observations)),
      supported: sum(ok.map((r) => r.ai.supported)),
      unsupported: sum(ok.map((r) => r.ai.unsupported)),
      rejectedCitations: sum(ok.map((r) => r.ai.rejectedCitations)),
    },
    extraction: {
      scored: scored.length,
      meanOverall: scored.length === 0 ? null : round(sum(scored.map((r) => r.extraction.score!.overall)) / scored.length),
      byGroup: groupStats(ok, (r) => `${r.style ?? "text"}/${r.difficulty ?? "n/a"}`),
      byScenario: groupStats(ok, (r) => r.scenario),
    },
    retrieval,
    meanDurationMs: ok.length === 0 ? null : Math.round(sum(ok.map((r) => r.durationMs)) / ok.length),
  };
}
