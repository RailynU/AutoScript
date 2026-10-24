# Requirements — AutoScript Prescription Review

## Introduction

AutoScript helps pharmacy staff catch problems in a prescription ("the script") before it is
dispensed. A technician uploads the script, optionally types the prescription fields into the
pharmacy system's entry form, and links the patient record. The system reads the script with
an AI vision model, verifies the technician's entry against it, runs deterministic clinical
rules against the patient's allergies, conditions and current medications, retrieves
supporting passages from a curated reference collection, and asks a language model for an
evidence-grounded explanation. The result is a review report that routes the script to a
pharmacist (`MANUAL_REVIEW_NEEDED`) or reports that no flags were detected within the checked
criteria (`NO_FLAGS_DETECTED`). The system never approves a prescription and never calls one
"safe"; a pharmacist always completes the review.

Project layout (monorepo):

- `autoscript/` — Node.js pnpm workspace (TypeScript):
  - `apps/api` — Fastify + Prisma REST API on `:8080`, every route under `/api`.
  - `apps/rx-engine` — RX Engine on `:4210`: extraction, clinical rules, RAG, AI analysis.
  - `packages/shared` — zod contracts shared by the API, engine and UI types.
  - `packages/clinical-rules` — deterministic rule tables and the disposition policy.
  - `docker-compose.yml` — PostgreSQL 16 with pgvector on `:5433`.
- `autoscript-ui/` — React 19 + TypeScript SPA (Vite on `:5173`, `/api` proxied to `:8080`).

## Glossary

- **Script / Prescription**: a submitted prescription document (PDF, JPG, PNG, or pasted text).
- **Manual entry (`enteredData`)**: the fields the technician typed at intake, to be verified.
- **Extraction**: the structured reading of the script (`ExtractedPrescription`).
- **Finding**: one issue raised by a rule or by the AI pass, with type, severity and evidence.
- **Evidence**: a cited chunk of a curated reference document (`EvidenceRef`).
- **Disposition**: the engine's routing decision, `MANUAL_REVIEW_NEEDED` or `NO_FLAGS_DETECTED`.
- **Screening status**: `PROCESSING`, `MANUAL_REVIEW_NEEDED`, `NO_FLAGS_DETECTED`, `FAILED`.
- **Review status**: the pharmacist's disposition, independent of screening status.

## Requirements

### Requirement 1 — Script intake

**User Story:** As a pharmacy technician, I want to upload a script with the patient and my
typed entry, so that the system can screen it and verify what I entered.

#### Acceptance Criteria

1. WHEN a client posts multipart form data to `POST /api/prescriptions/upload` with a `file`
   part and optional `patientId` and `enteredData` (JSON) fields THEN the system SHALL store the
   file, create a prescription with status `PROCESSING` and stage `QUEUED`, dispatch it to the
   RX Engine, and respond HTTP 202 with the prescription list item.
2. IF no file part is present or the file is empty THEN the system SHALL respond HTTP 400.
3. IF the file type is not PDF, JPEG or PNG THEN the system SHALL respond HTTP 415.
4. IF `enteredData` is not valid JSON THEN the system SHALL respond HTTP 400; WHERE it is JSON
   THE system SHALL validate it against `EnteredScriptDataSchema` (drug name ≤ 200, directions
   ≤ 500, quantity 1–9999, day supply 1–365, refills 0–99, prescriber name ≤ 100).
5. THE system SHALL accept uploads up to 20 MB (one file per request).
6. WHEN a client posts `{ text, patientId? }` to `POST /api/prescriptions/text` THEN the system
   SHALL create and dispatch a `TEXT` prescription the same way.
7. WHEN a client posts `{ scenarioKey }` to `POST /api/prescriptions/simulate` THEN the system
   SHALL create a `SIMULATED` prescription from the named demo scenario, responding 404 for an
   unknown key and 409 when the scenario's seed patient is missing.
8. WHEN a client calls `GET /api/prescriptions/{id}/file` THEN the system SHALL stream the
   original upload with its MIME type.

### Requirement 2 — Autofill from the script

**User Story:** As a pharmacy technician, I want the entry form pre-filled from the script, so
that I type less.

#### Acceptance Criteria

1. WHEN a client posts a script to `POST /api/prescriptions/extract` (multipart `file`) THEN the
   system SHALL ask the RX Engine to read it without screening it and return
   `{ scriptData, extraction }`, where `scriptData` is shaped like the manual-entry form.
2. IF the file is missing or empty THEN the system SHALL respond HTTP 422 with code
   `FILE_MISSING`.
3. IF the file is not JPEG, PNG or PDF THEN the system SHALL respond HTTP 422 with code
   `UNSUPPORTED_FORMAT`.
4. WHERE a field is absent or illegible on the script THE extraction SHALL leave it null and
   record the uncertainty rather than guessing.

### Requirement 3 — Manual entry verification

**User Story:** As a pharmacy technician, I want what I typed compared against the script, so
that data-entry errors are caught before dispensing.

#### Acceptance Criteria

1. WHEN a prescription has `enteredData` THEN the `entry.verify` rule SHALL compare it with the
   extraction and raise one `DATA_ENTRY_MISMATCH` finding per mismatched field; WHEN
   `enteredData` is null THEN the rule SHALL raise nothing.
2. WHEN comparing names THEN the rule SHALL ignore case, punctuation and titles/credentials
   (Dr, MD, DO, NP, PA, …) and flag only words the script does not contain.
3. WHEN comparing dates of birth THEN the rule SHALL normalize ISO and US formats before
   comparing.
4. WHEN comparing the drug THEN the rule SHALL compare normalized generic names (`CRITICAL`
   on mismatch) and, for the same drug, the written strengths (`HIGH` on mismatch).
5. THE rule SHALL flag patient name and date of birth as `HIGH`, quantity as `HIGH`, refills
   and day supply as `MODERATE`, prescriber name as `MODERATE`, and directions as `HIGH` when
   the numbers differ or `LOW` when only the wording differs.
6. WHEN comparing NPI and phone THEN the rule SHALL compare digits only.
7. WHERE an entered or extracted value is empty THE rule SHALL NOT compare that field.

### Requirement 4 — Deterministic clinical rules

**User Story:** As a pharmacist, I want reproducible checks against the patient record, so
that known risks are flagged the same way every time.

#### Acceptance Criteria

1. THE RX Engine SHALL run every rule in `ALL_RULES` on each prescription and report the rule
   ids in `coverage.rulesEvaluated`, with the rules version `autoscript-rules-2026.10`.
2. WHEN two prescribed or current medications form a pair in the interaction table THEN
   `interaction.pairwise` SHALL raise a `DRUG_INTERACTION` finding.
3. WHEN a prescribed drug matches a recorded allergy directly or through a cross-reactive class
   (e.g. penicillin → cephalosporin) THEN `allergy.cross-reactivity` SHALL raise an
   `ALLERGY_CONFLICT` finding.
4. WHEN a parsed daily dose exceeds the table maximum THEN `dose.daily-maximum` SHALL raise a
   `DOSE_CONCERN` finding; WHERE strength or frequency is missing THE check SHALL be skipped and
   listed as a limitation.
5. WHEN a prescribed drug conflicts with an active condition THEN `condition.contraindication`
   SHALL raise a `CONDITION_CONFLICT` finding.
6. WHEN the prescription duplicates a therapy the patient already takes THEN
   `therapy.duplicate` SHALL raise a `DUPLICATE_THERAPY` finding.
7. WHEN required prescription fields are missing, a drug cannot be normalized, or extraction
   confidence is low THEN `rx.missing-fields`, `rx.unresolved-drug` and
   `rx.extraction-confidence` SHALL raise `MISSING_PRESCRIPTION_INFO` or
   `EXTRACTION_UNCERTAINTY` findings.
8. WHEN no patient is linked, the allergy history is unverified, or demographics are missing
   THEN the `context.*` rules SHALL raise `MISSING_PATIENT_INFO` findings.
9. WHERE a rule's severity depends on whether therapy is a short course or chronic THE finding
   SHALL carry `therapyContext` and its `therapyContextBasis`.
10. THE report SHALL state that the checks cover only the curated tables and that the absence
    of a finding is not evidence of safety.

### Requirement 5 — Evidence retrieval (RAG)

**User Story:** As a pharmacist, I want each finding backed by a cited reference passage, so
that I can check the reasoning myself.

#### Acceptance Criteria

1. THE system SHALL ingest the curated references under `apps/rx-engine/references/` into
   Postgres as section-aware chunks (`pnpm rag:ingest`).
2. WHEN an embedding provider is configured THEN retrieval SHALL use pgvector cosine
   similarity (`VECTOR`).
3. IF embeddings are unavailable or return nothing THEN retrieval SHALL fall back to Postgres
   full-text search (`LEXICAL`); IF no references are ingested THEN the method SHALL be `NONE`.
4. THE report SHALL record the retrieval method and the number of reference documents
   searched, and SHALL add a limitation describing a `LEXICAL` or `NONE` fallback.
5. WHERE a rule names reference ids THE engine SHALL attach those chunks as `RULE` evidence.
6. WHERE labelled example cases are ingested (`pnpm rag:ingest:examples`) THE engine MAY show
   up to three similar cases to the model for calibration; they SHALL never be cited as
   evidence.

### Requirement 6 — Evidence-grounded AI pass

**User Story:** As a pharmacist, I want a plain-language explanation that only uses the cited
evidence, so that I can trust what the model says.

#### Acceptance Criteria

1. WHEN the rules and retrieval complete THEN the engine SHALL ask the language model for a
   summary, reasoning, review questions and any additional observations, citing evidence ids.
2. WHEN the model cites an evidence id that was not provided THEN the citation SHALL be dropped
   and listed in `ai.rejectedCitations`.
3. IF an AI observation has no accepted citation THEN its severity SHALL be clamped to `LOW`,
   its `supportStatus` SHALL be `UNVERIFIED`, its `severitySource` SHALL be
   `AI_PROPOSED_UNSUPPORTED`, and the proposed severity SHALL be kept in `proposedSeverity`.
4. THE deterministic `explanation` of a rule finding SHALL never be authored by the model; the
   model's text goes in `aiContext`.
5. IF the AI pass fails THEN the engine SHALL keep the deterministic findings, add a
   `SYSTEM_LIMITATION` finding, and route the prescription to manual review.

### Requirement 7 — Disposition

**User Story:** As a pharmacy supervisor, I want a conservative routing decision, so that
nothing reaches the counter without a pharmacist when there is doubt.

#### Acceptance Criteria

1. IF any deterministic finding exists THEN the disposition SHALL be `MANUAL_REVIEW_NEEDED`.
2. IF no patient is linked, no medication was extracted, extraction confidence is below 0.7,
   or the AI pass did not complete THEN the disposition SHALL be `MANUAL_REVIEW_NEEDED`.
3. IF an AI observation was proposed at `MODERATE` or higher (before any clamping) THEN the
   disposition SHALL be `MANUAL_REVIEW_NEEDED`.
4. OTHERWISE the disposition SHALL be `NO_FLAGS_DETECTED` with a reason stating that this is
   not a statement of clinical safety.
5. THE system SHALL NOT use the words "safe" or "approved" for any disposition or status.

### Requirement 8 — Processing lifecycle

**User Story:** As a technician, I want to see where a script is in processing and recover
from failures, so that nothing gets stuck silently.

#### Acceptance Criteria

1. WHILE a prescription is `PROCESSING` THE engine SHALL report stages in order (`QUEUED`,
   `EXTRACTING`, `NORMALIZING`, `LOADING_CONTEXT`, `RUNNING_RULES`, `RETRIEVING_EVIDENCE`,
   `AI_ANALYSIS`, `FINALIZING`, `DONE`) with a message and percent through
   `POST /api/internal/prescriptions/{id}/engine-callback`.
2. WHEN the engine posts a `result` THEN the API SHALL store the report and set the screening
   status to the disposition; WHEN it posts `failed` THEN the API SHALL set `FAILED` with the
   reason.
3. IF the LLM is not configured THEN the prescription SHALL fail with an explicit error.
4. IF an analysis exceeds `ANALYSIS_TIMEOUT_MS` THEN the engine SHALL abort it and report a
   failure; IF a prescription stays `PROCESSING` with no update for `PROCESSING_TIMEOUT_MS`
   THEN the API's sweeper SHALL mark it `FAILED`.
5. WHEN a client posts `POST /api/prescriptions/{id}/retry` THEN the system SHALL re-queue and
   re-dispatch the prescription.
6. THE API SHALL publish created/updated events on the server-sent event stream
   `GET /api/events`.

### Requirement 9 — Pharmacist review

**User Story:** As a pharmacist, I want to record what I did about a screened script, so that
there is an audit trail and a work queue.

#### Acceptance Criteria

1. WHEN a client posts `{ action, pharmacistName, notes? }` to
   `POST /api/prescriptions/{id}/reviews` THEN the system SHALL record the review and move the
   review status per the transition map (`MARK_REVIEWED`/`REVIEWED_NO_INTERVENTION` →
   `REVIEWED`, `PRESCRIBER_CONTACTED`/`INFO_REQUESTED` → `INFO_REQUESTED`,
   `INTERVENTION_REQUIRED` → `INTERVENTION_REQUIRED`, `INTERVENTION_DOCUMENTED` →
   `INTERVENTION_DOCUMENTED`, `NOTE`/`OTHER` → unchanged).
2. IF the action is `NOTE` or `OTHER` and no note is given THEN the system SHALL respond 400.
3. IF the prescription is still `PROCESSING` THEN the system SHALL respond 409.
4. WHEN the new review status is `REVIEWED` or `INTERVENTION_DOCUMENTED` THEN the system SHALL
   set `reviewedAt`.
5. THE detail response SHALL include the full review history, newest first.
6. NO review status SHALL mean "approved for dispensing".

### Requirement 10 — Patients

**User Story:** As a technician, I want to find or create the patient record, so that the
clinical checks have context.

#### Acceptance Criteria

1. WHEN a client calls `GET /api/patients` with `q` or any of `firstName`, `lastName`, `dob`,
   `phone` THEN the system SHALL return matching patients (partial, case-insensitive; DOB in ISO
   or US fragments; phone by last four digits).
2. WHEN a client calls `GET /api/patients/{id}` THEN the system SHALL return the full context:
   allergies (with severity and reaction), conditions, current medications and
   `allergiesVerified`.
3. WHEN a client posts to `POST /api/patients` THEN the system SHALL validate the body against
   `CreatePatientSchema` and create the patient with allergies, conditions and medications.

### Requirement 11 — Dashboard statistics

#### Acceptance Criteria

1. WHEN a client calls `GET /api/stats` THEN the system SHALL return counts by screening status
   (processing, manual review needed, no flags detected, failed) and by review status, plus the
   total.
2. THE counts SHALL equal direct row counts.

### Requirement 12 — API error contract

#### Acceptance Criteria

1. WHEN a handler throws an unexpected error THEN the API SHALL respond 500 with
   `{ "error": "Internal server error" }` and SHALL NOT leak messages, paths or stacks.
2. WHERE an error carries a 4xx status THE API SHALL keep its message.
3. WHEN request validation fails THEN the API SHALL respond 400 with
   `{ "error": "Validation failed", "issues": [{ path, message }] }`.

### Requirement 13 — Web client (`autoscript-ui`)

**User Story:** As pharmacy staff, I want one interface for intake, screening results and
review, so that I do not call the API directly.

#### Acceptance Criteria

1. THE client SHALL provide Dashboard, Prescriptions, Patients, Reviews, Analytics and Settings
   pages from a sidebar.
2. WHEN the user opens intake THEN the client SHALL let them pick a script (JPEG, PNG or PDF),
   look up or create the patient, and fill the entry form; WHEN they choose Autofill THEN the
   client SHALL call `/api/prescriptions/extract` and fill the form, rendering null fields as
   empty inputs; WHILE autofill runs THE Autofill action SHALL be disabled with a spinner.
3. WHEN the user submits intake THEN the client SHALL post the script, `patientId` and
   `enteredData` to `/api/prescriptions/upload`.
4. WHILE a prescription is `PROCESSING` THE detail view SHALL show the current stage and
   percent, refreshing until it settles.
5. WHEN screening completes THEN the detail view SHALL show the disposition and reason, the
   findings with severity, cited evidence and review questions, the AI summary, and an
   entered-vs-script comparison table.
6. THE detail view SHALL offer the pharmacist review actions and show the review history.
7. THE Reviews page SHALL list prescriptions awaiting pharmacist action; the Analytics page
   SHALL summarize totals, findings, interventions and failures; the Settings page SHALL show
   the backend configuration notes.
8. WHEN creating a patient THEN the client SHALL capture allergies (or NKDA), conditions and
   current medications.
9. THE client SHALL show notifications for prescriptions waiting on review.

## Known Constraints and Non-Goals

- No authentication or authorization; PHI handling and compliance (e.g. HIPAA) are out of
  scope for this build.
- Interaction, allergy, dose and condition tables are a curated demo set (see
  `apps/rx-engine/references/COVERAGE.md`), not a complete drug knowledge base.
- The system screens and routes; it never approves, dispenses, or declares a prescription safe.
- Extraction and AI analysis need an OpenAI-compatible LLM key (`LLM_API_KEY`).
