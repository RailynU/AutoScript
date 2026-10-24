# Design — AutoScript Prescription Review

## Overview

AutoScript is split into two Node.js services that share one PostgreSQL database, plus a
React client:

- **API** (`autoscript/apps/api`, Fastify 5 + Prisma 6, port 8080): owns patients,
  prescriptions, uploads, reviews and statistics. Every public route is mounted under `/api`.
  It dispatches each prescription to the engine and receives progress and results through a
  callback.
- **RX Engine** (`autoscript/apps/rx-engine`, Fastify, port 4210): reads the script, runs the
  deterministic clinical rules, retrieves evidence from the curated reference collection and
  runs the evidence-grounded AI pass. It owns the RAG tables (plain SQL, pgvector + tsvector).
- **Shared packages**: `@autoscript/shared` (zod contracts for every payload crossing a
  process boundary) and `@autoscript/clinical-rules` (rule tables, rules, disposition policy).
- **Web client** (`autoscript-ui`, React 19 + Vite, port 5173): intake, results, review queue.

The engine screens and routes. It never approves a prescription and never calls one safe.

## Architecture

```
 autoscript-ui (Vite :5173)
        │  /api/* (dev proxy)
        ▼
 ┌──────────────────────────── API :8080 (/api) ────────────────────────────┐
 │ routes: patients · prescriptions · reviews · stats · events (SSE)          │
 │         internal/prescriptions/:id/engine-callback                         │
 │ services: intake · engineClient · reviewActions · staleSweeper · scriptData│
 │ Prisma ─────────────────────────────────────────────┐                      │
 └───────────────┬──────────────────────────────────────┼──────────────────────┘
       POST /analyze, /extract              ▲ callback  │
                 ▼                          │           ▼
 ┌──────────────────────── RX Engine :4210 ─┴──┐   PostgreSQL 16 + pgvector (:5433)
 │ extraction (LLM vision / PDF text layer)    │   Patient, Allergy, Condition,
 │ normalization (local drug map)              │   PatientMedication, Prescription,
 │ clinical-rules: runRules → findings         │   Review  (Prisma)
 │ RAG: Retriever VECTOR → LEXICAL → NONE  ────┼─▶ reference_documents,
 │ AI pass: cited explanations + observations  │   reference_chunks, case_examples
 │ decideDisposition                           │   (engine-owned SQL)
 └──────────────┬──────────────────────────────┘
                ▼
     OpenAI-compatible LLM (OpenRouter): chat, vision, embeddings
```

## Components and Responsibilities

### API (`apps/api`)

- **server.ts** — `buildServer({ env, db, engine, logger, sweeper })`: registers CORS,
  multipart (20 MB, one file), the error handler, `/health` and the route plugins under the
  `/api` prefix. Unexpected errors become `500 { error: "Internal server error" }`; 4xx
  errors keep their message; zod errors become `400 { error: "Validation failed", issues }`.
- **routes/prescriptions.ts** — list (filters + `limit`), detail, original file, text intake,
  upload (`file` + `patientId` + `enteredData`), extract (autofill), scenarios, simulate,
  retry.
- **routes/reviews.ts** — `POST /prescriptions/:id/reviews`; writes the `Review` row and the
  review status update in one transaction.
- **routes/patients.ts** — free-text and field lookup, detail with full context, create.
- **routes/stats.ts** — counts by screening status and by review status.
- **routes/events.ts** — `GET /events`, server-sent events fed by the in-process event bus.
- **routes/engineCallbacks.ts** — `POST /internal/prescriptions/:id/engine-callback`; applies
  `progress`, `result` and `failed` callbacks (validated with `EngineCallbackSchema`).
- **services/intake.ts** — `createPrescription` (stores the upload under `UPLOAD_DIR`, creates
  the row, publishes `created`) and `dispatchToEngine` (loads patient context and posts an
  `AnalyzeRequest`).
- **services/reviewActions.ts** — maps a review kind to the prescription update using
  `REVIEW_KIND_TRANSITIONS` and `REVIEW_COMPLETING_STATUSES`.
- **services/staleSweeper.ts** — marks `PROCESSING` rows with no update for
  `PROCESSING_TIMEOUT_MS` as `FAILED`; runs at startup and every `STALE_SWEEP_INTERVAL_MS`.
- **services/scriptData.ts** — `toScriptData(extraction)`: extraction → entry-form shape.
- **scripts/demo-reset.ts** — empties prescriptions, reviews and uploads; keeps patients.

### RX Engine (`apps/rx-engine`)

- **server.ts** — `GET /health`, `GET /references`, `POST /analyze` (202, runs the pipeline in
  the background), `POST /extract` (synchronous extraction for autofill).
- **pipeline.ts** — `runPipeline` with a hard deadline (`ANALYSIS_TIMEOUT_MS`): extract →
  normalize → load context → `runRules` → attach evidence → similar cases → AI pass →
  `decideDisposition`. After the first terminal callback nothing else is sent.
- **extraction/** — images go to the vision model; PDFs use the text layer (a PDF without one
  fails explicitly); pasted text goes to the text model. Output is `ExtractedPrescription`
  with per-line confidence, `uncertainties` and `overallConfidence`.
- **rag/** — `references.ts` parses frontmatter and cuts section-aware chunks; `ingest.ts`
  writes documents and chunks (embedding when a provider is configured); `retrieve.ts`
  `Retriever.search` tries vector similarity, then strict and loose full-text search;
  `examples.ts` / `ingestExamples.ts` handle labelled dataset cases.
- **analysis/aiAnalysis.ts** — builds the grounded prompt, validates citations against the
  provided evidence pool, clamps unsupported observations (`UNSUPPORTED_SEVERITY_CAP = LOW`).
- **eval/**, **dataset/** — offline evaluation and dataset builders (`pnpm eval`,
  `pnpm dataset:build`, `pnpm dataset:us`).

### Clinical rules (`packages/clinical-rules`)

| Rule id                     | Finding type                                     |
|-----------------------------|--------------------------------------------------|
| `interaction.pairwise`      | `DRUG_INTERACTION`                               |
| `allergy.cross-reactivity`  | `ALLERGY_CONFLICT`                               |
| `context.no-patient`        | `MISSING_PATIENT_INFO`                           |
| `context.allergy-history`   | `MISSING_PATIENT_INFO`                           |
| `context.demographics`      | `MISSING_PATIENT_INFO`                           |
| `rx.missing-fields`         | `MISSING_PRESCRIPTION_INFO`                      |
| `rx.unresolved-drug`        | `EXTRACTION_UNCERTAINTY`                         |
| `rx.extraction-confidence`  | `EXTRACTION_UNCERTAINTY`                         |
| `therapy.duplicate`         | `DUPLICATE_THERAPY`                              |
| `dose.daily-maximum`        | `DOSE_CONCERN`                                   |
| `condition.contraindication`| `CONDITION_CONFLICT`                             |
| `entry.verify`              | `DATA_ENTRY_MISMATCH`                            |

`runRules` sorts findings by severity and returns `rulesEvaluated` and `limitations`.
`RULES_VERSION = "autoscript-rules-2026.10"`; the engine version is
`rx-engine/0.1.0+autoscript-rules-2026.10`. Each rule names reference ids and a retrieval
query so its finding can be grounded.

#### Manual entry verification (`entry.verify`)

Compares `enteredData` with the extraction, choosing the extracted medication line whose
generic matches the typed drug (else the first line). Text is lower-cased with punctuation
stripped; person names drop titles/credentials and flag words missing from the script; dates
are normalized from ISO or US formats; NPI and phone compare digits only; quantity, refills
and day supply compare the first integer. Severities: drug `CRITICAL`; patient name, DOB,
strength, quantity `HIGH`; refills, day supply, prescriber `MODERATE`; directions `HIGH` when
the numbers differ, else `LOW`.

#### Disposition policy (`decideDisposition`)

```
any deterministic finding           → MANUAL_REVIEW_NEEDED
no patient linked                   → MANUAL_REVIEW_NEEDED
no medications extracted            → MANUAL_REVIEW_NEEDED
overallConfidence < 0.7             → MANUAL_REVIEW_NEEDED
AI pass did not complete            → MANUAL_REVIEW_NEEDED
AI observation proposed ≥ MODERATE  → MANUAL_REVIEW_NEEDED   (proposedSeverity, before clamp)
otherwise                           → NO_FLAGS_DETECTED      ("not a statement of clinical safety")
```

### Retrieval fallback

```
search(query)
  ├─ embeddings configured and query embedded → pgvector cosine (VECTOR) → rows? return
  ├─ full-text, strict terms (LEXICAL)         → ≥ limit? return
  ├─ full-text, loose terms (LEXICAL)          → merge, dedupe, return
  └─ nothing ingested                          → NONE (limitation: run `pnpm rag:ingest`)
```

## Data Models

Prisma (`apps/api/prisma/schema.prisma`):

```
Patient(id, externalId, firstName, lastName, dateOfBirth?, sex?, phone?, weightKg?,
        renalFunctionNote?, allergiesVerified, allergies[], conditions[], medications[])
Allergy(substance, reaction?, severity: MILD|MODERATE|SEVERE|UNKNOWN)
Condition(name, icd10?, status: ACTIVE|RESOLVED)
PatientMedication(name, genericName?, dose?, frequency?, active)
Prescription(id, externalRef, status, reviewStatus, sourceType, fileName?, filePath?,
             mimeType?, rawText?, patientId?, enteredData Json?, report Json?,
             progressStage, progressMessage?, progressPercent, failureReason?,
             createdAt, updatedAt, reviewedAt?)
Review(id, prescriptionId, action, pharmacistName, notes?, createdAt)
```

Enums: `PrescriptionStatus = PROCESSING | MANUAL_REVIEW_NEEDED | NO_FLAGS_DETECTED | REVIEWED
(legacy, read-only) | FAILED`; `ReviewStatus = PENDING_REVIEW | REVIEWED |
INTERVENTION_REQUIRED | INTERVENTION_DOCUMENTED | INFO_REQUESTED`; `SourceType = PDF | IMAGE |
TEXT | SIMULATED`.

Contracts (`packages/shared`): `EnteredScriptData`, `ExtractedPrescription`, `Finding`
(type, severity, title, explanation, aiContext, origin, evidence, reviewQuestions,
deterministic, therapyContext, severitySource, supportStatus, proposedSeverity),
`EvidenceRef` (chunkId, documentId, title, source, url, section, excerpt, retrieval
`VECTOR|LEXICAL|RULE`, score), `AnalysisReport` (disposition, dispositionReason, extraction,
findings, evidence, ai, coverage, engineVersion), `AnalyzeRequest`, `EngineCallback`.

## API Contract

| Method | Path                                         | Success | Errors |
|--------|----------------------------------------------|---------|--------|
| GET    | `/api/health`                                | 200 `{ ok, engine }` | — |
| GET    | `/api/patients?q=&firstName=&lastName=&dob=&phone=` | 200 | 400 |
| GET    | `/api/patients/{id}`                         | 200 context | 404 |
| POST   | `/api/patients`                              | 201 | 400 |
| GET    | `/api/prescriptions?status=&reviewStatus=&limit=` | 200 list | 400 |
| GET    | `/api/prescriptions/{id}`                    | 200 detail | 404 |
| GET    | `/api/prescriptions/{id}/file`               | 200 file | 404 |
| POST   | `/api/prescriptions/upload` (multipart)      | 202 | 400, 415 |
| POST   | `/api/prescriptions/text`                    | 202 | 400 |
| POST   | `/api/prescriptions/extract` (multipart)     | 200 `{ scriptData, extraction }` | 422, 501 |
| GET    | `/api/scenarios`                             | 200 | — |
| POST   | `/api/prescriptions/simulate`                | 202 | 404, 409 |
| POST   | `/api/prescriptions/{id}/retry`              | 202 | 404 |
| POST   | `/api/prescriptions/{id}/reviews`            | 200 detail | 400, 404, 409 |
| GET    | `/api/stats`                                 | 200 | — |
| GET    | `/api/events`                                | SSE | — |
| POST   | `/api/internal/prescriptions/{id}/engine-callback` | 200 | 400, 404 |

RX Engine: `GET /health`, `GET /references`, `POST /analyze` (202), `POST /extract`.

## Frontend Design (`autoscript-ui`)

Single-page app (`src/App.tsx`) with a sidebar: Dashboard, Prescriptions, Patients, Reviews,
Analytics, Settings. Data access lives in `src/api/` (typed `http` client, `patients.ts`,
`prescriptions.ts`, `types.ts` mirroring the shared contracts); `usePrescriptions` polls the
list and stats.

1. **Intake (UploadModal)** — script picker (JPEG/PNG/PDF), patient lookup or creation
   (allergies or NKDA, conditions, medications), entry form, Autofill via
   `/api/prescriptions/extract`, submit via `/api/prescriptions/upload`.
2. **Prescription detail** (`components/PrescriptionDetail.tsx`) — live stage/percent while
   processing; disposition and reason; findings by severity with cited evidence, AI context and
   review questions; AI summary; entered-vs-script table; review actions and history; retry
   for failures; original file preview.
3. **Dashboard** — status tiles (Manual Review Needed, No Flags Detected, Processing, Reviewed
   Today) and recent prescriptions.
4. **Prescriptions** — searchable list. **Patients** — field lookup and create.
5. **Reviews** — work queue of screened prescriptions awaiting pharmacist action.
6. **Analytics** — totals, findings raised, interventions required, failed screenings.
7. **Settings** — backend configuration notes (LLM key location, services).

## Error Handling Strategy

- Client-correctable input → 400 / 415 / 422 with a message (and `code` for autofill).
- Unknown ids → 404; review while processing → 409.
- Unexpected errors → generic 500 without internals.
- Engine failures are never hidden: they become `FAILED` with a `failureReason`, or, for the AI
  pass, a `SYSTEM_LIMITATION` finding plus manual review.

## Testing Strategy

- **clinical-rules** (vitest): table-driven tests per rule, entry verification fields,
  therapy context, and the disposition policy.
- **rx-engine** (vitest, fake LLM): pipeline stages and callbacks, extraction (including PDFs
  without a text layer), reliability (deadlines, single terminal callback), example retrieval,
  dataset builders and evaluation metrics/leakage checks.
- **api** (vitest against `autoscript_test` on :5433): health, patients, upload/text intake,
  engine callbacks, review transitions and stats, stale sweeper, error contract, demo reset.

## Known Limitations

- No authentication; single-pharmacy demo data.
- Curated rule tables and 17 reference documents; coverage is listed in `COVERAGE.md`.
- The UI refreshes by polling; the SSE stream is available but not yet consumed by the client.
