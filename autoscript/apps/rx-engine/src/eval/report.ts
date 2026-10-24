import { formatRatio } from "./metrics.js";
import type { Aggregate, CaseResult, EvalReport, Ratio } from "./types.js";
import { validationFor } from "./validation.js";

export const EVAL_VERSION = "eval-2026.10.24";

const pct = (r: Ratio): string => (r.value == null ? "n/a" : `${(r.value * 100).toFixed(1)} % (${r.numerator}/${r.denominator})`);
const num = (x: number | null, digits = 3): string => (x == null ? "n/a" : x.toFixed(digits));
const yes = (b: boolean | null): string => (b == null ? "n/a" : b ? "yes" : "no");
const code = (s: string): string => `\`${s}\``;
const list = (items: string[]): string => (items.length === 0 ? "—" : items.map(code).join(", "));

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_none_\n";
  const line = (cells: string[]): string => `| ${cells.map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n") + "\n";
}

function countBy<T>(items: T[], key: (item: T) => string): Array<[string, number]> {
  const out = new Map<string, number>();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Best-effort reason for a miss, from what the report recorded; the case detail in report.json has the rest. */
export function diagnoseMiss(r: CaseResult): string {
  if (r.status === "error") return `pipeline error: ${r.error}`;
  const unresolved = r.extraction.medications.filter((m) => !m.normalizedName).map((m) => m.rawName);
  const parts: string[] = [];
  if (r.extraction.score) {
    const s = r.extraction.score;
    if (s.medicationsMatched < s.medicationsExpected) parts.push(`extraction matched ${s.medicationsMatched}/${s.medicationsExpected} medication lines`);
    if (s.strengthMatched < s.medicationsMatched) parts.push(`${s.medicationsMatched - s.strengthMatched} strength(s) misread`);
    if (s.frequencyMatched < s.medicationsMatched) parts.push(`${s.medicationsMatched - s.frequencyMatched} frequency/sig misread`);
  }
  if (unresolved.length > 0) parts.push(`not normalized: ${unresolved.join(", ")}`);
  if (parts.length === 0) parts.push(`rules did not fire on the extracted data; fired: ${r.firedOrigins.join(", ") || "nothing"}`);
  return parts.join("; ");
}

/** Where each curated label comes from (src/eval/validation.ts, datasets/eval/validation.md); generated cases have no entry. */
function labelSourcesSection(report: EvalReport): string {
  const rows = report.cases.flatMap((c) => {
    const v = validationFor(c.id);
    if (!v) return [];
    const sources = v.sources.map((s) => `${s.title}, ${s.section} (${s.url})`).join("; ");
    return [[c.id, v.status, `Label source: ${sources}`, v.note]];
  });
  return [`## Label sources (${rows.length} curated cases, checked against public sources)`, "", table(["case", "verdict", "label source", "note"], rows)].join("\n");
}

function limitationsSection(report: EvalReport): string {
  const a = report.aggregate;
  const generated = report.cases.filter((c) => c.set === "generated");
  const byScenario = countBy(generated, (c) => c.scenario);
  return [
    "## Limitations",
    "",
    "- **Labels are synthetic and author-defined.** Every expected finding, expected disposition, therapy context and forbidden word in this report was written by the authors of the system (`apps/rx-engine/src/eval/cases.ts`) or derived from the generator's injected errors (`apps/rx-engine/src/eval/generated.ts`). None of it is independently verified clinical ground truth, and no pharmacist reviewed the labels. The curated labels were checked against public labeling and guidelines (section \"Label sources\" above, `datasets/eval/validation.md`); that check covers the curated cases only, and its PARTIAL/DISPUTED verdicts are recorded there, not fixed here.",
    "- **Recall on injected errors is partly circular.** The generator (`apps/rx-engine/src/dataset/us/scenarios.ts`) builds its interaction pairs, allergy classes, dose limits and condition conflicts from the same curated tables the rules read (`packages/clinical-rules`). It cannot inject an error the rules do not know about, so a high recall here says the extraction and the rules agree on the system's own vocabulary; it says nothing about interactions outside the curated tables.",
    "- **Expected-absent families for generated cases come from the rules themselves.** They are the generator families that `runRules` does not raise on the exact ground truth, so a false alarm here measures what extraction added, not whether the rule tables are right.",
    `- **The held-out set shares its generator with the ingested examples.** The ${a.cases.generated} generated cases (seed ${report.seed}) come from the same distribution as the ${report.leakage.exampleRows} \`case_examples\` rows the model sees as retrieved examples (seed 20261024). The leakage check only shows that these exact cases were not ingested, not that the model has not seen near-identical ones.`,
    "- **True negatives are easy by construction.** A family that cannot fire for structural reasons (no patient record, no NSAID on the script) still counts as a true negative, so specificity is inflated; precision, recall and the false-negative rate are the numbers to read.",
    `- **The language model is not deterministic.** ${report.mode === "llm" ? `Extraction and the AI pass ran against ${report.model.chat} / ${report.model.vision} at temperature 0.1; a rerun can differ in extraction fields, AI observations and therefore in disposition for clean cases. Nothing in this run is cached.` : "This run used oracle extractions and disabled the AI pass (--no-llm), so it measures rules, retrieval and disposition only; extraction accuracy and AI behaviour are not measured here."}`,
    `- **Sample sizes are small.** ${a.cases.total} cases (${a.cases.curated} curated, ${a.cases.generated} generated), ${a.detection.labelledPositives} labelled positives and ${a.detection.labelledNegatives} labelled negatives. With these counts a single case moves recall by about ${a.detection.labelledPositives > 0 ? (100 / a.detection.labelledPositives).toFixed(1) : "n/a"} points. Generated cases per scenario: ${byScenario.map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`,
    "- **Wording check is literal.** The forbidden-word check matches whole words in finding text. Deterministic hits are violations of the rule wording contract; AI hits are listed for review because the same word may legitimately describe the patient's existing therapy.",
    "- **No clinical validity claim.** A finding counted as a true positive means the expected rule family fired, not that the clinical content of the finding is correct or complete.",
    "",
  ].join("\n");
}

export function renderMarkdown(report: EvalReport): string {
  const a = report.aggregate;
  const ok = report.cases.filter((c) => c.status === "ok");
  const errors = report.cases.filter((c) => c.status === "error");
  const detected = ok.filter((c) => (c.detection?.matched.length ?? 0) > 0);
  const missed = ok.filter((c) => (c.detection?.missed.length ?? 0) > 0);
  const falseAlarms = ok.filter((c) => (c.detection?.falseAlarms.length ?? 0) > 0);
  const unlabeled = ok.filter((c) => (c.detection?.unlabeled.length ?? 0) > 0);
  const unsupported = ok.filter((c) => c.ai.unsupported > 0);
  const manual = ok.filter((c) => c.manualReview);
  const dispositionMismatch = ok.filter((c) => c.dispositionMatch === false);
  const therapyMismatch = ok.filter((c) => c.therapyContext.match === false);
  const limitationMismatch = ok.filter((c) => c.limitations.match === false);
  const wording = ok.filter((c) => c.wording.forbidden.length > 0);
  const sectionViolations = ok.filter((c) => c.evidenceSections.violations.length > 0);

  const lines: string[] = [
    `# AutoScript evaluation report`,
    "",
    `Generated ${report.generatedAt} · mode **${report.mode}** (${report.mode === "llm" ? "real extraction and AI pass" : "oracle extraction, AI pass disabled"}) · engine ${code(report.engineVersion)} · rules ${code(report.rulesVersion)} · eval ${code(report.version)}`,
    "",
    `Model: chat ${code(report.model.chat)}, vision ${code(report.model.vision)}, embeddings ${report.model.embedding ? code(report.model.embedding) : "none"}. Observed analysis model(s): ${list(report.model.observedAnalysis)}; observed extractor(s): ${list(report.model.observedExtractors)}.`,
    "",
    `Held-out generator seed ${report.seed}, ${report.generatedCount} generated cases requested. Per-case detail in \`report.json\`.`,
    "",
    `## Leakage check`,
    "",
    `${report.leakage.checked ? (report.leakage.clean ? "**Clean.**" : "**COLLISIONS FOUND.**") : "**Not verified.**"} ${report.leakage.note}`,
    "",
    table(
      ["check", "result"],
      [
        ["case_examples rows read", String(report.leakage.exampleRows)],
        ["eval cases compared", String(report.leakage.evalCases)],
        ["id collisions", list(report.leakage.idCollisions)],
        ["rendered-image sha256 collisions", list(report.leakage.sha256Collisions)],
        ["ground-truth fingerprint collisions", list(report.leakage.groundTruthCollisions)],
      ],
    ),
    `## Totals`,
    "",
    table(
      ["metric", "value"],
      [
        ["cases", `${a.cases.total} (${a.cases.curated} curated, ${a.cases.generated} generated)`],
        ["completed / errored", `${a.cases.ok} / ${a.cases.error}`],
        ["labelled positives (expected families)", String(a.detection.labelledPositives)],
        ["labelled negatives (expected-absent families)", String(a.detection.labelledNegatives)],
        ["TP / FP / FN / TN", `${a.detection.tp} / ${a.detection.fp} / ${a.detection.fn} / ${a.detection.tn}`],
        ["precision TP/(TP+FP)", formatRatio(a.detection.precision)],
        ["recall TP/(TP+FN)", formatRatio(a.detection.recall)],
        ["false-negative rate FN/(TP+FN)", formatRatio(a.detection.falseNegativeRate)],
        ["specificity TN/(TN+FP) (inflated, see Limitations)", formatRatio(a.detection.specificity)],
        ["unlabelled families fired", String(a.detection.unlabeledFired)],
        ["disposition matches expected", pct(a.disposition)],
        ["cases routed to manual review", pct(a.manualReview)],
        ["therapy context matches expected", pct(a.therapyContext)],
        ["expected limitations present", pct(a.limitations)],
        ["forbidden wording: deterministic violations / AI hits", `${a.wording.deterministicViolations} / ${a.wording.aiHits} over ${a.wording.casesWithRule} case(s) with a wording rule`],
        ["evidence-section checks: required present / banned violations", `${a.evidenceSections.present}/${a.evidenceSections.expectedPresent} present, ${a.evidenceSections.violations} violation(s)`],
        ["evidence coverage (rule findings with ≥1 excerpt)", pct(a.evidence)],
        ["AI pass completed", `${a.ai.completed}/${a.cases.ok}`],
        ["AI observations: supported / unsupported (UNVERIFIED)", `${a.ai.supported} / ${a.ai.unsupported} of ${a.ai.observations}`],
        ["rejected (invented) citations", String(a.ai.rejectedCitations)],
        ["extraction score (mean overall, scored cases)", a.extraction.meanOverall == null ? "n/a" : `${num(a.extraction.meanOverall)} over ${a.extraction.scored}`],
        ["retrieval method", Object.entries(a.retrieval).map(([k, v]) => `${k} ${v}`).join(", ") || "n/a"],
        ["mean duration per case", a.meanDurationMs == null ? "n/a" : `${(a.meanDurationMs / 1000).toFixed(1)} s`],
      ],
    ),
    `## Correctly detected expected issues (${detected.length} cases)`,
    "",
    table(
      ["case", "scenario", "matched families", "fired origins"],
      detected.map((c) => [c.id, c.scenario, list(c.detection!.matched), list(c.firedOrigins)]),
    ),
    `## Missed expected issues (${missed.length} cases)`,
    "",
    table(
      ["case", "scenario", "missed families", "diagnosis"],
      missed.map((c) => [c.id, c.scenario, list(c.detection!.missed), diagnoseMiss(c)]),
    ),
    `## False alarms: expected-absent families that fired (${falseAlarms.length} cases)`,
    "",
    table(
      ["case", "scenario", "families", "fired origins"],
      falseAlarms.map((c) => [c.id, c.scenario, list(c.detection!.falseAlarms), list(c.firedOrigins)]),
    ),
    `## Unlabelled families that fired (${unlabeled.length} cases, not counted)`,
    "",
    table(
      ["case", "scenario", "families"],
      unlabeled.map((c) => [c.id, c.scenario, list(c.detection!.unlabeled)]),
    ),
    `## Unsupported alerts: AI observations without an accepted citation (${unsupported.length} cases, ${a.ai.unsupported} observations)`,
    "",
    table(
      ["case", "unsupported", "supported", "titles (shown at LOW, marked UNVERIFIED)"],
      unsupported.map((c) => [c.id, String(c.ai.unsupported), String(c.ai.supported), c.ai.unsupportedTitles.join("; ")]),
    ),
    `## Cases requiring manual verification (${manual.length} of ${ok.length} completed)`,
    "",
    table(
      ["case", "expected", "reason"],
      manual.map((c) => [c.id, c.expectedDisposition, c.dispositionReason ?? ""]),
    ),
    `## Disposition mismatches (${dispositionMismatch.length})`,
    "",
    table(
      ["case", "expected", "got", "reason"],
      dispositionMismatch.map((c) => [c.id, c.expectedDisposition, c.disposition ?? "", c.dispositionReason ?? ""]),
    ),
    `## Therapy context, limitations, wording and evidence sections`,
    "",
    table(
      ["case", "therapy expected", "observed", "match", "limitations missing", "deterministic wording hits", "AI wording hits", "section violations"],
      ok
        .filter((c) => c.therapyContext.expected || c.limitations.expected.length > 0 || c.wording.forbidden.length > 0 || c.evidenceSections.expectedPresent + c.evidenceSections.expectedAbsent > 0)
        .filter((c) => c.set === "curated" || c.therapyContext.match === false || c.limitations.match === false || c.evidenceSections.violations.length > 0)
        .map((c) => [
          c.id,
          c.therapyContext.expected ?? "—",
          list(c.therapyContext.observed),
          yes(c.therapyContext.match),
          list(c.limitations.missing),
          list(c.wording.deterministicHits),
          list(c.wording.aiHits),
          list(c.evidenceSections.violations),
        ]),
    ),
    `Therapy-context mismatches: ${therapyMismatch.length}; limitation mismatches: ${limitationMismatch.length}; cases with a wording rule: ${wording.length}; cases with evidence-section violations: ${sectionViolations.length}.`,
    "",
    labelSourcesSection(report),
    `## Extraction accuracy by style/difficulty (${a.extraction.scored} scored cases)`,
    "",
    table(
      ["group", "cases", "mean overall", "medication lines matched"],
      Object.entries(a.extraction.byGroup).map(([k, v]) => [k, String(v.n), num(v.meanOverall), `${v.medicationsMatched}/${v.medicationsExpected}`]),
    ),
    `### By scenario`,
    "",
    table(
      ["scenario", "cases", "mean overall", "medication lines matched"],
      Object.entries(a.extraction.byScenario).map(([k, v]) => [k, String(v.n), num(v.meanOverall), `${v.medicationsMatched}/${v.medicationsExpected}`]),
    ),
    `## Errors (${errors.length})`,
    "",
    table(
      ["case", "error"],
      errors.map((c) => [c.id, c.error ?? ""]),
    ),
    limitationsSection(report),
  ];
  return lines.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "<p class=\"muted\">none</p>";
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function summaryRows(a: Aggregate): string[][] {
  return [
    ["Cases", `${a.cases.total} (${a.cases.curated} curated, ${a.cases.generated} generated; ${a.cases.error} errored)`],
    ["TP / FP / FN / TN", `${a.detection.tp} / ${a.detection.fp} / ${a.detection.fn} / ${a.detection.tn}`],
    ["Precision", formatRatio(a.detection.precision)],
    ["Recall", formatRatio(a.detection.recall)],
    ["False-negative rate", formatRatio(a.detection.falseNegativeRate)],
    ["Disposition matches", pct(a.disposition)],
    ["Routed to manual review", pct(a.manualReview)],
    ["Therapy context matches", pct(a.therapyContext)],
    ["Evidence coverage", pct(a.evidence)],
    ["AI observations supported / unsupported", `${a.ai.supported} / ${a.ai.unsupported}`],
    ["Rejected citations", String(a.ai.rejectedCitations)],
    ["Forbidden wording (deterministic / AI)", `${a.wording.deterministicViolations} / ${a.wording.aiHits}`],
    ["Evidence-section violations", String(a.evidenceSections.violations)],
    ["Extraction mean overall", a.extraction.meanOverall == null ? "n/a" : `${num(a.extraction.meanOverall)} over ${a.extraction.scored}`],
  ];
}

/** Static one-screen summary; the Markdown report carries the detail. */
export function renderHtml(report: EvalReport): string {
  const a = report.aggregate;
  const missed = report.cases.filter((c) => (c.detection?.missed.length ?? 0) > 0);
  const falseAlarms = report.cases.filter((c) => (c.detection?.falseAlarms.length ?? 0) > 0);
  const errors = report.cases.filter((c) => c.status === "error");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AutoScript evaluation</title>
<style>
:root{--bg:#fbfbf9;--fg:#1b1b1f;--muted:#6b6b73;--line:#d9d9de;--accent:#2b4c7e;--warn:#9a3b2e}
@media (prefers-color-scheme:dark){:root{--bg:#15161a;--fg:#e8e8ec;--muted:#9a9aa3;--line:#33343b;--accent:#8fb0e8;--warn:#e0876f}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;max-width:1100px;margin-inline:auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;color:var(--accent)}
p.meta,p.muted{color:var(--muted);margin:4px 0}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.leak{padding:10px 12px;border:1px solid var(--line);border-radius:6px;margin-top:12px}.bad{color:var(--warn);font-weight:600}
code{font-size:13px}
</style></head><body>
<h1>AutoScript evaluation</h1>
<p class="meta">${esc(report.generatedAt)} · mode ${esc(report.mode)} · engine <code>${esc(report.engineVersion)}</code> · rules <code>${esc(report.rulesVersion)}</code> · model <code>${esc(report.model.chat)}</code> / <code>${esc(report.model.vision)}</code> · seed ${report.seed}</p>
<div class="leak">Leakage check: ${report.leakage.checked ? (report.leakage.clean ? "clean" : '<span class="bad">collisions found</span>') : '<span class="bad">not verified</span>'} — ${esc(report.leakage.note)}</div>
<h2>Summary</h2>
${htmlTable(["metric", "value"], summaryRows(a))}
<h2>Missed expected issues (${missed.length})</h2>
${htmlTable(["case", "scenario", "missed", "diagnosis"], missed.map((c) => [c.id, c.scenario, c.detection!.missed.join(", "), diagnoseMiss(c)]))}
<h2>False alarms (${falseAlarms.length})</h2>
${htmlTable(["case", "scenario", "families"], falseAlarms.map((c) => [c.id, c.scenario, c.detection!.falseAlarms.join(", ")]))}
<h2>Errors (${errors.length})</h2>
${htmlTable(["case", "error"], errors.map((c) => [c.id, c.error ?? ""]))}
<h2>Extraction by style/difficulty</h2>
${htmlTable(["group", "cases", "mean overall", "medication lines matched"], Object.entries(a.extraction.byGroup).map(([k, v]) => [k, String(v.n), num(v.meanOverall), `${v.medicationsMatched}/${v.medicationsExpected}`]))}
<h2>Limitations</h2>
<p>Labels are synthetic and author-defined, not verified clinical ground truth. The generator and the rule tables share the same curated knowledge, so recall on injected errors is partly circular. The held-out set shares its generator with the ingested examples (same distribution, different cases). The language model is not deterministic. Sample sizes: ${a.cases.total} cases, ${a.detection.labelledPositives} labelled positives. Full text in <code>report.md</code>.</p>
</body></html>
`;
}
