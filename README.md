# AutoScript

AutoScript is a pharmacy prescription-review assistant. A technician uploads a prescription
("the script") and types in what they read from it; AutoScript extracts the script, checks the
entry against the image, runs deterministic clinical rules against the patient's profile, grounds
any AI observations in curated clinical references, and routes the result to a pharmacist.

AutoScript supports the pharmacist's judgement. It never declares a prescription safe and it never
approves dispensing. All patients, prescribers and prescriptions in this repository are synthetic.

## Architecture

```mermaid
flowchart LR
    UI["autoscript-ui<br/>React 19 + Vite<br/>:5173"] -->|"REST /api/*"| API["apps/api<br/>Fastify + Prisma<br/>:8080"]
    API -->|"POST /analyze, /extract"| ENG["apps/rx-engine<br/>extraction, rules, RAG, AI pass<br/>:4210"]
    ENG -->|"progress + report callback"| API
    API -->|"SSE /api/events"| UI
    API --> DB[("Postgres 16 + pgvector<br/>:5433")]
    ENG --> DB
    ENG -->|"OpenAI-compatible API"| LLM["LLM provider<br/>(OpenRouter, google/gemini-2.5-flash)"]
```

1. **Intake.** The UI uploads a PDF/JPG/PNG to the API, optionally with a linked patient and the
   technician's `enteredData`. Autofill (`/api/prescriptions/extract`) can pre-populate the entry
   form from the image.
2. **Dispatch.** The API stores the prescription as `PROCESSING` and hands it to the RX Engine.
3. **Screening.** The RX Engine extracts and normalizes the script, loads patient context, runs the
   clinical rules, retrieves reference evidence and labelled example cases, and runs an
   evidence-grounded AI pass. It reports progress stages and the final report back to the API.
4. **Review.** The prescription lands as `MANUAL_REVIEW_NEEDED` or `NO_FLAGS_DETECTED` (or `FAILED`
   with a reason). The pharmacist records a review action; the UI updates live.

## Repository layout

```
AutoScript/
├── autoscript/              # Backend pnpm workspace (Node 20+, TypeScript)
│   ├── apps/api/            # Fastify + Prisma REST API (:8080)
│   ├── apps/rx-engine/      # Extraction, clinical rules, RAG, AI analysis (:4210)
│   ├── packages/shared/     # zod contracts shared by API, engine and UI types
│   ├── packages/clinical-rules/  # Deterministic rule engine
│   ├── datasets/            # Synthetic prescription datasets and eval images
│   ├── docker-compose.yml   # pgvector/pgvector:pg16 on :5433
│   └── .kiro/agents/        # Kiro agent definitions
├── autoscript-ui/           # React 19 + Vite + TypeScript frontend (:5173)
├── .kiro/                   # Kiro specs and hooks
└── README.md
```

See [`autoscript/README.md`](autoscript/README.md) for backend details and the API reference, and
[`autoscript-ui/README.md`](autoscript-ui/README.md) for the frontend.

## Quick start

Prerequisites: Node.js 20+, pnpm (the workspace pins `pnpm@11.20.0`; `corepack enable` picks it up),
Docker, and an API key for an OpenAI-compatible LLM provider (OpenRouter recommended).

```bash
# Backend
cd autoscript
cp .env.example .env          # then set LLM_API_KEY
pnpm install
pnpm setup                    # db:up + db:migrate + db:seed + rag:ingest + fixtures
pnpm rag:ingest:examples      # load the labelled example cases into the RAG store
pnpm dev                      # API on :8080 and RX Engine on :4210

# Frontend (separate terminal)
cd autoscript-ui
npm install
npm run dev                   # http://localhost:5173
```

`pnpm setup` generates synthetic demo prescriptions (PDF and PNG) under
`autoscript/apps/rx-engine/demo-files/` that can be uploaded through the UI.

### Ports

| Service | Port | Notes |
|---|---|---|
| Frontend (Vite) | 5173 | Proxies `/api` to :8080 in development |
| API | 8080 | All routes under `/api`; `GET /health` and `GET /api/health` |
| RX Engine | 4210 | Internal; called by the API only |
| Postgres + pgvector | 5433 | Container `autoscript-db`; databases `autoscript` and `autoscript_test` |

### Environment variables

Backend variables live in `autoscript/.env` (template: `autoscript/.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://autoscript:autoscript@localhost:5433/autoscript` | Main database |
| `TEST_DATABASE_URL` | `...:5433/autoscript_test` | Database used by integration tests |
| `API_PORT` / `RX_ENGINE_PORT` | `8080` / `4210` | Service ports |
| `API_URL` / `RX_ENGINE_URL` | `http://localhost:8080` / `http://localhost:4210` | Service-to-service URLs (engine callbacks, dispatch) |
| `UPLOAD_DIR` | `./uploads` | Where uploaded scripts are stored |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | (empty) | **Required** for extraction and AI analysis; without it prescriptions fail with an explicit error |
| `LLM_MODEL` / `LLM_VISION_MODEL` | `google/gemini-2.5-flash` | Text/JSON model and image model (vision defaults to `LLM_MODEL`) |
| `LLM_TIMEOUT_MS` | `90000` | Per-call LLM timeout |
| `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | OpenRouter / (empty) / `openai/text-embedding-3-small` | Optional embeddings for vector retrieval (1536-dim) |
| `ANALYSIS_TIMEOUT_MS` | `150000` | Engine hard deadline per analysis |
| `PROCESSING_TIMEOUT_MS` | `180000` | API marks a stuck `PROCESSING` prescription as failed (keep above `ANALYSIS_TIMEOUT_MS`) |
| `STALE_SWEEP_INTERVAL_MS` | `60000` | Interval of the stale-prescription sweeper |

Frontend: `VITE_API_BASE` in `autoscript-ui/.env` (default `http://localhost:8080/api`).

## How review works

**Clinical rules** (`packages/clinical-rules`) are deterministic and always run:

- Drug-drug interactions (`interaction.pairwise`)
- Allergy and cross-reactivity (`allergy.cross-reactivity`)
- Daily dose limits (`dose.daily-maximum`)
- Condition contraindications (`condition.contraindication`)
- Duplicate therapy (`therapy.duplicate`)
- Missing or unresolved information (`rx.missing-fields`, `rx.unresolved-drug`,
  `rx.extraction-confidence`, plus patient-context checks)
- Data-entry verification (`entry.verify`): compares what the technician typed with what is on the
  script and raises `DATA_ENTRY_MISMATCH` findings for any disagreement

**Evidence retrieval (RAG).** 17 curated clinical references (FDA labels, Beers criteria, AAAAI,
21 CFR 1306.05, Joint Commission and others) and 223 labelled example cases are stored in
Postgres with pgvector. Retrieval uses vector search when embeddings are configured, falls back to
Postgres full-text search, and reports which method was used (`VECTOR`, `LEXICAL` or `NONE`).

**AI pass.** The LLM may add contextual observations, but each must cite retrieved evidence.
Uncited observations are clamped to `LOW` severity and marked `UNVERIFIED`.

**Outcome.** `NO_FLAGS_DETECTED` is only reached when every deterministic rule is silent, a patient
record is linked, extraction was confident, and the AI pass completed without a MODERATE-or-higher
observation. Anything else routes the prescription to `MANUAL_REVIEW_NEEDED`. The pharmacist then records a review action (note, reviewed, info
requested, prescriber contacted, intervention required/documented), which sets an independent
review status.

## Product invariants

- AutoScript never describes a prescription as "safe".
- When nothing is found the wording is exactly: **"No flags detected within checked criteria"**.
- A pharmacist review is a documented disposition, never a dispensing approval. The system has no
  dispensing approval state.
- Synthetic data only. Do not load real patient information.

## Testing

```bash
cd autoscript
pnpm db:up          # tests use the autoscript_test database created by docker/initdb
pnpm typecheck
pnpm test           # vitest across api, rx-engine and clinical-rules
pnpm eval           # evaluate the engine on labelled synthetic cases (report in datasets/eval/)
pnpm eval --no-llm  # rules, retrieval and disposition only, no LLM calls

cd ../autoscript-ui
npm run lint
npm run build       # type-check and production build
```

## Built with Kiro

AutoScript is developed with [Kiro](https://kiro.dev) using spec-driven development:

- **Specs** — `.kiro/specs/script-review/` holds the requirements (EARS format), design and task
  plan that drive implementation.
- **Hooks** — `.kiro/hooks/` automates routine work, such as keeping tests up to date on save and
  committing/pushing at the end of an agent turn.
- **Agents** — `autoscript/.kiro/agents/` defines the Architect (planning and review), Builder
  (features), Tester (verification and reporting) and Fixer (root-cause fixes) agents that
  collaborate on the codebase.
