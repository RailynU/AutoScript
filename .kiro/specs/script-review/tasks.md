# Implementation Plan — AutoScript Prescription Review

This plan tracks the Node.js implementation: the `autoscript/` pnpm workspace (API, RX Engine,
shared contracts, clinical rules) and the `autoscript-ui` client. Each task references the
requirements it satisfies.

Status: tasks 1–20 are complete. Test suites: `@autoscript/clinical-rules` 37 tests,
`@autoscript/rx-engine` 78 tests, `@autoscript/api` 25 tests (needs the `autoscript_test`
database on :5433). Run everything with `pnpm test` from `autoscript/`.

## Workspace and infrastructure

- [x] 1. Set up the pnpm workspace
  - `apps/api`, `apps/rx-engine`, `packages/shared`, `packages/clinical-rules`, shared
    `tsconfig.base.json`, root scripts (`dev`, `test`, `typecheck`, `setup`, `db:*`, `rag:*`).
  - `docker-compose.yml` with `pgvector/pgvector:pg16` on :5433; `docker/initdb` enables the
    `vector` extension and creates `autoscript_test`.
  - `.env.example` documents database, ports, LLM, embedding and timeout settings.
  - _Requirements: 5.1, 8.4_

- [x] 2. Define shared contracts in `packages/shared`
  - zod schemas for statuses and stages, patients, `EnteredScriptData`,
    `ExtractedPrescription`, findings and evidence, `AnalyzeRequest`, `EngineCallback`,
    `AnalysisReport`, review kinds and transition tables, demo scenarios.
  - _Requirements: 1.4, 3, 6.3, 9.1_

- [x] 3. Prisma schema, migrations and seed
  - Patient, Allergy, Condition, PatientMedication, Prescription, Review; review status
    migration; `enteredData` column.
  - Seed demo patients with allergies, conditions and medications (`pnpm db:seed`).
  - _Requirements: 9, 10_

## RX Engine

- [x] 4. Extraction
  - Vision model for JPG/PNG, PDF text layer (explicit failure without one), pasted text.
  - Local drug-name normalization; per-line confidence and `uncertainties`.
  - `POST /extract` for autofill.
  - _Requirements: 2.1, 2.4_

- [x] 5. Deterministic clinical rules
  - Interactions, allergy and cross-reactivity, daily dose maximum, condition
    contraindications, duplicate therapy, missing prescription fields, unresolved drugs,
    extraction confidence, patient context rules; therapy context classification.
  - `RULES_VERSION = "autoscript-rules-2026.10"`.
  - _Requirements: 4.1–4.10_

- [x] 6. Manual entry verification rule (`entry.verify`)
  - Field-by-field comparison of `enteredData` with the extraction, `DATA_ENTRY_MISMATCH`
    findings with per-field severities; no-op when entry is skipped.
  - _Requirements: 3.1–3.7_

- [x] 7. Reference collection and RAG
  - Curated references with frontmatter under `references/`, section-aware chunking,
    `pnpm rag:ingest`.
  - `Retriever.search`: pgvector cosine → strict/loose full-text → `NONE`; method and
    searched-document count in the report coverage.
  - Rule-attached evidence (`RULE`) and per-finding evidence pool with dedupe.
  - _Requirements: 5.1–5.5_

- [x] 8. Labelled example cases
  - `pnpm rag:ingest:examples`; up to three similar cases shown to the model for calibration,
    never citable.
  - _Requirements: 5.6_

- [x] 9. Evidence-grounded AI pass
  - Grounded prompt, citation validation (`rejectedCitations`), `aiContext` on rule findings,
    unsupported observations clamped to LOW / UNVERIFIED with `proposedSeverity` kept.
  - AI failure → `SYSTEM_LIMITATION` finding, deterministic findings kept.
  - _Requirements: 6.1–6.5_

- [x] 10. Disposition policy and pipeline
  - `decideDisposition`: `MANUAL_REVIEW_NEEDED` / `NO_FLAGS_DETECTED`, never "safe".
  - `runPipeline` with ordered progress stages, `ANALYSIS_TIMEOUT_MS` deadline and a single
    terminal callback.
  - _Requirements: 7.1–7.5, 8.1, 8.3, 8.4_

## API

- [x] 11. Server skeleton and error contract
  - Fastify with CORS, multipart (20 MB), `/api` prefix, `/health`, generic 500 handler,
    validation issues on 400.
  - _Requirements: 12.1–12.3_

- [x] 12. Intake routes
  - `POST /api/prescriptions/upload` (file + `patientId` + `enteredData`), `/text`,
    `/simulate`, `/scenarios`, `GET /api/prescriptions/{id}/file`, dispatch to the engine.
  - _Requirements: 1.1–1.8_

- [x] 13. Autofill route
  - `POST /api/prescriptions/extract` → `{ scriptData, extraction }`; `FILE_MISSING` /
    `UNSUPPORTED_FORMAT` on 422.
  - _Requirements: 2.1–2.3_

- [x] 14. Engine callback, events, retry and stale sweeper
  - `POST /api/internal/prescriptions/{id}/engine-callback`, SSE `GET /api/events`,
    `POST /api/prescriptions/{id}/retry`, sweeper using `PROCESSING_TIMEOUT_MS`.
  - _Requirements: 8.1, 8.2, 8.4–8.6_

- [x] 15. Pharmacist review actions
  - `POST /api/prescriptions/{id}/reviews` with the transition map, note requirement,
    409 while processing, `reviewedAt` on completing statuses, history newest first.
  - _Requirements: 9.1–9.6_

- [x] 16. Patients and stats
  - Patient lookup (q / firstName / lastName / dob / phone), detail, create with allergies,
    conditions and medications; `GET /api/stats` counts.
  - _Requirements: 10.1–10.3, 11.1, 11.2_

## Web client (`autoscript-ui`)

- [x] 17. API client and types for the Node API
  - Typed `http` client under `/api`, `patients.ts`, `prescriptions.ts`, `types.ts`;
    `usePrescriptions` polling hook; remove the old `/api/scripts` client.
  - _Requirements: 13_

- [x] 18. Intake modal
  - Script picker, patient lookup/creation (allergies or NKDA, conditions, medications),
    entry form, Autofill with spinner, submit to `/upload`.
  - _Requirements: 13.2, 13.3, 13.8_

- [x] 19. Prescription detail
  - Progress while processing, disposition and reason, findings with evidence and review
    questions, AI summary, entered-vs-script table, review actions and history, retry.
  - _Requirements: 13.4–13.6_

- [x] 20. Dashboard, Prescriptions, Patients, Reviews, Analytics, Settings
  - Status tiles, searchable list, review work queue, analytics totals, settings notes,
    notifications for prescriptions waiting on review.
  - _Requirements: 13.1, 13.7, 13.9_

## Tests

- [x] 21. Unit and integration tests
  - clinical-rules: per-rule tables, entry verification, disposition.
  - rx-engine: pipeline, extraction, reliability, examples, datasets, eval (fake LLM).
  - api: end-to-end route tests against `autoscript_test`.
  - _Requirements: 3, 4, 6, 7, 8, 9, 12_

## Future

- [ ] 22. Authentication, roles (technician vs pharmacist) and an audit log export.
- [ ] 23. Consume `GET /api/events` in the client instead of polling.
- [ ] 24. Broaden the rule tables and reference collection beyond the curated demo set.
- [ ] 25. UI tests for the intake and review flows.
