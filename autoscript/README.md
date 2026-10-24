# AutoScript backend

pnpm workspace containing the AutoScript REST API, the RX Engine and their shared packages.
TypeScript throughout, run with `tsx`; PostgreSQL 16 with pgvector via Docker Compose.

## Workspace

| Package | Path | Role |
|---|---|---|
| `@autoscript/api` | `apps/api` | Fastify REST API on :8080. Prisma models for patients (allergies, conditions, medications), prescriptions and reviews. Stores uploads, dispatches work to the RX Engine, receives its callbacks, streams changes over SSE, and sweeps prescriptions stuck in `PROCESSING`. |
| `@autoscript/rx-engine` | `apps/rx-engine` | Screening service on :4210. LLM extraction (text, PDF, images), drug normalization, clinical rules, RAG retrieval, evidence-grounded AI analysis, disposition. Also owns the dataset and evaluation tooling. |
| `@autoscript/shared` | `packages/shared` | zod schemas and types for every contract: patients, prescriptions, `enteredData`, findings, engine requests/callbacks, statuses, demo scenarios. |
| `@autoscript/clinical-rules` | `packages/clinical-rules` | Deterministic rule engine: interactions, allergy cross-reactivity, daily dose limits, condition contraindications, duplicate therapy, missing information, data-entry verification, and the disposition policy. |

## Setup

```bash
cp .env.example .env      # set LLM_API_KEY (and optionally EMBEDDING_API_KEY)
pnpm install
pnpm setup                # db:up, db:migrate, db:seed, rag:ingest, fixtures
pnpm rag:ingest:examples  # labelled example cases for retrieval
pnpm dev                  # API (:8080) + RX Engine (:4210) in watch mode
```

Every app reads `../../.env` (this folder's `.env`). See `.env.example` and the root
[README](../README.md#environment-variables) for the full variable list.

## Scripts

Run from `autoscript/`.

| Script | What it does |
|---|---|
| `pnpm db:up` / `pnpm db:down` | Start (and wait for) / stop the `autoscript-db` pgvector container on :5433 |
| `pnpm db:migrate` | Apply Prisma migrations and generate the client |
| `pnpm db:seed` | Seed synthetic patients and demo data |
| `pnpm db:seed:patients` | Seed synthetic patients only |
| `pnpm rag:ingest` | Chunk and ingest the clinical references in `apps/rx-engine/references/` |
| `pnpm rag:ingest:examples` | Ingest the labelled example cases from `datasets/` |
| `pnpm fixtures` | Generate synthetic demo prescriptions (PDF + PNG) into `apps/rx-engine/demo-files/` |
| `pnpm setup` | `db:up` + `db:migrate` + `db:seed` + `rag:ingest` + `fixtures` |
| `pnpm dev` | Run API and RX Engine in parallel with file watching |
| `pnpm build` / `pnpm typecheck` | Build / type-check every package |
| `pnpm test` | Vitest across all packages (uses `TEST_DATABASE_URL`) |
| `pnpm demo:reset [--with-history]` | Delete prescriptions, reviews and their uploaded files; keep patients, references and example cases |
| `pnpm dataset:build` | Transcribe and label `datasets/prescriptions/` (vision model, cached) |
| `pnpm dataset:us` | Generate the synthetic US prescription image dataset in `datasets/us-synthetic/` |
| `pnpm eval [--no-llm] [--seed N --count N]` | Evaluate the engine on labelled cases; writes `datasets/eval/report.{json,md,html}` |

Per-app scripts (for example `pnpm --filter @autoscript/api db:migrate:dev` or `db:reset`) are
listed in each `package.json`.

## Database and RAG

- **Image:** `pgvector/pgvector:pg16`, host port **5433**, user/password/db `autoscript`.
  `docker/initdb/01-extensions.sql` enables `vector` and `uuid-ossp` and creates the
  `autoscript_test` database used by tests.
- **Application data** (Prisma, `apps/api/prisma/schema.prisma`): `Patient`, `Allergy`,
  `Condition`, `PatientMedication`, `Prescription`, `Review`.
- **Retrieval data** (managed by the RX Engine): `reference_documents`, `reference_chunks` and
  `case_examples`.
- **Corpus:** 17 curated clinical references (`apps/rx-engine/references/`, coverage notes in
  `COVERAGE.md`) and 223 labelled example cases built from the synthetic datasets.
- **Retrieval modes:** `VECTOR` when an embedding provider is configured (1536-dim vectors),
  otherwise `LEXICAL` (Postgres full-text search); `NONE` when nothing relevant is found. The mode is
  recorded in each report.

## Screening pipeline

The engine reports each stage to the API as it runs:

`QUEUED` -> `EXTRACTING` -> `NORMALIZING` -> `LOADING_CONTEXT` -> `RUNNING_RULES` ->
`RETRIEVING_EVIDENCE` -> `AI_ANALYSIS` -> `FINALIZING` -> `DONE` (or `FAILED` with a reason)

- Deterministic findings come from `@autoscript/clinical-rules`. `entry.verify` compares the
  technician's `enteredData` with the extracted script and emits `DATA_ENTRY_MISMATCH` findings.
- AI observations must cite retrieved evidence; uncited ones are shown as `LOW` and `UNVERIFIED`
  while the proposed severity is kept for routing.
- Disposition is `MANUAL_REVIEW_NEEDED` or `NO_FLAGS_DETECTED`. No path approves dispensing.
- `ANALYSIS_TIMEOUT_MS` bounds each analysis; the API's stale sweeper marks anything left in
  `PROCESSING` longer than `PROCESSING_TIMEOUT_MS` as `FAILED`.

## API reference

All routes are served by `apps/api` under the `/api` prefix (base `http://localhost:8080/api`).
`GET /health` is also available at the root.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | API status plus RX Engine health |
| GET | `/patients` | Search patients. `q` (free text) or field lookup with any of `firstName`, `lastName`, `dob` (MM/DD/YYYY, YYYY-MM-DD or partial), `phone`; `limit` (max 50) |
| GET | `/patients/:id` | Patient with allergies, conditions and medications |
| POST | `/patients` | Create a patient with allergies, conditions and medications |
| GET | `/prescriptions` | List prescriptions; filter by `status`, `reviewStatus`; `limit` (max 200) |
| GET | `/prescriptions/:id` | Prescription detail: extraction, findings, evidence, entry check, reviews |
| GET | `/prescriptions/:id/file` | The uploaded script file |
| POST | `/prescriptions/upload` | multipart: `file` (PDF/JPG/PNG), optional `patientId`, optional `enteredData` (JSON). Returns 202 and screens asynchronously |
| POST | `/prescriptions/text` | JSON: pasted prescription text, optional `patientId` |
| POST | `/prescriptions/extract` | multipart: `file`. Autofill: extracts the script and returns form-ready `scriptData` without screening |
| GET | `/scenarios` | Synthetic demo scenarios |
| POST | `/prescriptions/simulate` | Create a prescription from a demo scenario (`scenarioKey`) |
| POST | `/prescriptions/:id/retry` | Re-dispatch a failed or stuck prescription |
| POST | `/prescriptions/:id/reviews` | Record a pharmacist review action (`action`, `pharmacistName`, `notes`) |
| GET | `/stats` | Dashboard counts by screening and review status |
| GET | `/events` | Server-sent events (`event: prescription`; types `created`, `progress`, `completed`, `failed`, `reviewed`) |
| POST | `/internal/prescriptions/:id/engine-callback` | Progress and report callback from the RX Engine (internal) |

Review actions: `NOTE`, `REVIEWED_NO_INTERVENTION`, `MARK_REVIEWED`, `INFO_REQUESTED`,
`PRESCRIBER_CONTACTED`, `INTERVENTION_REQUIRED`, `INTERVENTION_DOCUMENTED`, `OTHER`. Each maps to a
review status (`PENDING_REVIEW`, `REVIEWED`, `INFO_REQUESTED`, `INTERVENTION_REQUIRED`,
`INTERVENTION_DOCUMENTED`); some actions require a note. None of them is a dispensing approval.

Validation errors return `400` with `{ error, issues[] }`.

### RX Engine (internal, :4210)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | LLM configuration, models, reference count, active jobs |
| GET | `/references` | Ingested reference documents with chunk counts and embedding status |
| POST | `/analyze` | Accept a prescription for screening (202); results are delivered to the callback URL |
| POST | `/extract` | Extraction only, used by autofill |

## Testing

```bash
pnpm db:up
pnpm typecheck
pnpm test
```

API and engine integration tests run against `autoscript_test` (`TEST_DATABASE_URL`). Tests that
would need a live LLM use stubbed clients.
