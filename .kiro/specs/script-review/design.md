# Design — AutoScript Prescription Review

## Overview

AutoScript is a single Spring Boot 4.1 service (Java 17) that exposes a REST API for
extracting prescription data from an uploaded image and verifying manually entered data
against it. Extraction is delegated to an OpenAI vision model (`gpt-4o-mini`) through
Spring AI's `ChatClient`. All runtime state lives in memory.

This design documents the system as built on the backend and specifies the frontend that
will consume it. Where the current implementation has notable limitations, they are called
out explicitly so the design doubles as an accurate map of the code.

## Architecture

```
                      ┌─────────────────────────────────────────────┐
  Browser / client    │                 Spring Boot                  │
  ────────────▶ HTTP  │                                              │
                      │  ScriptReviewController  (REST, /api/scripts) │
                      │        │              │                       │
                      │        ▼              ▼                       │
                      │  ExtractionService   ScriptReviewService      │
                      │        │              │     │                 │
                      │        ▼              │     ▼                 │
                      │  PrescriptionExtraction│   ScriptValidation    │
                      │        Model           │     Service           │
                      │        │              │     │                 │
                      │        ▼              ▼     ▼                 │
                      │  Spring AI ChatClient  ScriptQueue (in-memory) │
                      └────────┼──────────────────────────────────────┘
                               ▼
                         OpenAI gpt-4o-mini
```

### Layering

- **Controller** (`ScriptReviewController`): HTTP surface under `/api/scripts`, maps
  multipart requests to services and exceptions to `ErrorResponse` via `@ExceptionHandler`.
- **Services**: `ExtractionService` (validation + AI call), `ScriptValidationService`
  (field comparison / flags), `ScriptReviewService` (orchestration + lifecycle),
  `ScriptQueue` (in-memory store and queue).
- **Model**: `PrescriptionExtractionModel` (Spring AI wrapper), `PromptProvider` (prompt
  selection), `Script` (lifecycle entity), `ScriptStatus` (enum).
- **DTOs**: `ScriptData`, `ReviewResult`, `Flag`, `ScriptSummary`, `ErrorResponse` — all
  Java records, serialized as JSON.

## Components and Responsibilities

### ScriptReviewController
- `POST /autofill` (multipart `image`) → `ScriptData` (200).
- `POST /review` (multipart part `image` + JSON part `scriptData`) → `ReviewResult` (200).
- `GET /queued`, `GET /in-review`, `GET /completed` → `List<ScriptSummary>` (200).
- `GET /{id}/result` → `ReviewResult` (200) or 404.
- Exception handling:
  - `InvalidScriptImageException` → 422 + code from the exception.
  - `ExtractionFailedException` → 502 + `EXTRACTION_FAILED`.
  - `ReviewFailedException` → 502 + `REVIEW_FAILED`.

### ExtractionService
Validates the upload then calls the model:
- Rejects null/empty → `FILE_MISSING`; > 10 MB → `FILE_TOO_LARGE`; content type not in
  {`image/jpeg`, `image/png`, `application/pdf`} → `UNSUPPORTED_FORMAT`.
- Wraps any model exception in `ExtractionFailedException`.

### PrescriptionExtractionModel
Wraps Spring AI `ChatClient`. Builds a prompt with the system prompt from `PromptProvider`
and a user message carrying the image as `media(mimeType, resource)`, then requests a typed
`.entity(ScriptData.class)` response. MIME type comes from the upload's content type,
falling back to PNG.

### PromptProvider
Discovers `classpath:prompts/prompt<N>.txt`, indexes by numeric suffix in a `TreeMap`.
Selects `promptN.txt` when `autoscript.extraction.prompt` > 0, otherwise the lowest
numbered prompt. Throws on missing configured prompt or no prompts found.

### ScriptValidationService
Produces a `ReviewResult` by comparing each field of extracted vs. manual `ScriptData`:
- **Text** (`compareText`): trim, collapse whitespace, lowercase; blank treated as null.
  Fields: first/last name, drug name, directions, prescriber name.
- **Digits** (`compareDigits`): strip non-digits; blank treated as null. Fields: NPI,
  phone.
- **Value** (`compareValue`): `Objects.equals`. Fields: DOB, quantity, day supply, refill
  count.
- Each mismatch becomes a `Flag(field, description)` where the description names the
  entered value and the on-script value ("blank" when null/blank).
- Returns `ReviewResult(scriptId=null, status="COMPLETED", reviewedAt=now, flags)`; the
  caller re-stamps `scriptId`.

### ScriptReviewService (orchestration + lifecycle)
`review(image, manualEntry)`:
1. `scriptQueue.add(manualEntry)` → new `QUEUED` script.
2. `scriptQueue.pull(id)` → transitions to `IN_REVIEW` (throws `ReviewFailedException` if
   not pullable).
3. `extractionService.extract(image)` then `scriptValidationService.review(...)`.
4. Re-stamp result with the script id, `script.markCompleted(result)`, return it.
5. On `InvalidScriptImageException`: `markReviewFailed()` and rethrow (→ 422).
6. On any other exception: `markReviewFailed()` and throw `ReviewFailedException` (→ 502).
7. `finally`: `scriptQueue.pop(id)` removes it from the queued set.

Listing methods map `ScriptQueue.findByStatus(...)` to `ScriptSummary`, applying the
ordering in Requirement 3. `reviewResult(id)` returns the stored result or empty.

### ScriptQueue (in-memory store)
- `ConcurrentHashMap<String, Script>` for all scripts, keyed by id.
- `ConcurrentLinkedQueue<String>` of queued ids; `AtomicLong` id sequence.
- `add`, `pull()`/`pull(id)` (synchronized, transition to IN_REVIEW), `pop`, `remove`,
  `find`, `findByStatus`, `hasQueued`.

### Script (entity)
Holds id, timestamps, `volatile` status/data/result. `markInReview`, `markCompleted`,
`markReviewFailed` are `synchronized` and enforce the legal state transitions described in
Requirement 3.

## Data Models

```
ScriptData(patientFirstName, patientLastName, patientDateOfBirth:LocalDate,
           drugName, directions, quantity:Integer, daySupply:Integer,
           refillCount:Integer, prescriberName, prescriberNpi, prescriberPhone)

Flag(field, description)
ReviewResult(scriptId, status, reviewedAt:Instant, flags:List<Flag>)
ScriptSummary(id, status, submittedAt, reviewStartedAt, completedAt,
              drugName, quantity:Integer, flagCount:Integer)
ErrorResponse(code, message)
ScriptStatus = { QUEUED, IN_REVIEW, COMPLETED, REVIEW_FAILED }
```

## API Contract

| Method | Path                      | Request                               | Success            | Errors |
|--------|---------------------------|---------------------------------------|--------------------|--------|
| POST   | `/api/scripts/autofill`   | multipart `image`                     | 200 `ScriptData`   | 422, 502 |
| POST   | `/api/scripts/review`     | multipart part `image` + json `scriptData` | 200 `ReviewResult` | 422, 502 |
| GET    | `/api/scripts/queued`     | —                                     | 200 `ScriptSummary[]` | — |
| GET    | `/api/scripts/in-review`  | —                                     | 200 `ScriptSummary[]` | — |
| GET    | `/api/scripts/completed`  | —                                     | 200 `ScriptSummary[]` | — |
| GET    | `/api/scripts/{id}/result`| —                                     | 200 `ReviewResult` | 404 |

Error body: `{ "code": "...", "message": "..." }`.

## Frontend Design (`autoscript-ui` — scaffolded, UI not yet built)

The frontend is a separate React 19 + TypeScript single-page app built with Vite, living
in the sibling `autoscript-ui/` directory. It is a thin client over the existing REST API.

Current state:
- The Vite project is scaffolded with React, TypeScript, and ESLint.
- `vite.config.ts` runs the dev server on port 5173 and proxies `/api/*` to the Spring
  Boot backend on `http://localhost:8080`, so the browser calls `/api/...` without CORS
  setup during development.
- `App.tsx` is still the default Vite starter; none of the screens below exist yet.

Build/serve model: in development the Vite dev server (5173) proxies to Boot (8080). For a
single-artifact deployment, `npm run build` emits static assets to `autoscript-ui/dist`,
which can be served by Spring Boot or any static host; this wiring is not set up yet.

### Screens / flows
1. **Upload & Review**
   - File picker → client-side guard (type ∈ {jpeg, png, pdf}, ≤ 10 MB).
   - On select: `POST /autofill`; render an editable form bound to `ScriptData`; null →
     empty input.
   - Submit: build multipart with the original image + edited `scriptData` JSON part;
     `POST /review`; render flags grouped by field, or a clear "no mismatches" state.
   - Error handling: show `ErrorResponse.message`; style 422 as "fix input" and 502 as
     "service problem, retry".
2. **Dashboard**
   - Three lists from `/queued`, `/in-review`, `/completed`, each rendering
     `ScriptSummary` (id, status, timestamps, drug, quantity, flag count).
   - Completed rows link to a result view using `/{id}/result`.

### Screens / flows (target for `autoscript-ui`)
1. **Upload & Review**
   - File picker → client-side guard (type ∈ {jpeg, png, pdf}, ≤ 10 MB).
   - On select: `POST /autofill`; render an editable form bound to `ScriptData`; null →
     empty input. Disable Autofill and show a spinner while the request is in flight.
   - Submit: build multipart with the original image + edited `scriptData` JSON part;
     `POST /review`; render flags grouped by field, or a clear "no mismatches" state.
   - Error handling: show `ErrorResponse.message`; style 422 as "fix input" and 502 as
     "service problem, retry".
2. **Dashboard** (`/dashboard` route)
   - Three sections from `/queued`, `/in-review`, `/completed`, each rendering
     `ScriptSummary` (id, status, timestamps, drug, quantity, flag count) with an explicit
     empty-state message when a section has no scripts.
   - Completed rows link to a result view using `/{id}/result`.

### Client considerations
- Serialize `LocalDate` as `YYYY-MM-DD` and integers as numbers in the `scriptData` part.
- The `scriptData` part must be sent with JSON content type so the controller's
  `@RequestPart ScriptData` binds correctly.
- Because state is in-memory, the dashboard reflects only the current server run.

## Error Handling Strategy

- Validation failures are client-correctable (422, image codes).
- Upstream/model failures are transient/server-side (502, extraction/review codes).
- Lifecycle guard methods throw `IllegalStateException` on illegal transitions; these are
  internal invariants, not part of the external contract.

## Testing Strategy

- **Controller**: `@WebMvcTest` + `MockMvc`, mocking the two services. Verify status
  codes, multipart binding, and the exception-to-`ErrorResponse` mappings.
- **ExtractionService**: unit tests for each validation branch (missing, too large,
  unsupported type, happy path with a mocked `PrescriptionExtractionModel`), and wrapping
  of model exceptions into `ExtractionFailedException`.
- **ScriptValidationService**: table-driven tests over match/mismatch for text, digits,
  and value fields, including whitespace/case normalization and digit stripping, and
  blank-vs-null equivalence.
- **ScriptReviewService**: lifecycle tests — success path marks COMPLETED and pops;
  invalid image marks REVIEW_FAILED and rethrows; other failure wraps in
  `ReviewFailedException`; queued/in-review/completed ordering.
- **ScriptQueue / Script**: transition legality and status filtering.
- **PromptProvider**: selection by configured index, fallback to lowest, missing-prompt
  and no-prompt error cases.

## Known Limitations (reflected intentionally)

- No persistence, auth, or horizontal scaling; restart loses state.
- `/review` is synchronous; the queue is not drained by a background worker even though
  `pull()` and `hasQueued()` exist.
- No endpoint returns the full `Script`; only its `ReviewResult`.
- `Script.setData` is unused in the current flow.
