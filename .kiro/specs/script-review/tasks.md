# Implementation Plan — AutoScript Prescription Review

This plan reflects a codebase where the backend REST API is already implemented and the
frontend does not exist yet. Backend tasks are framed as "document and harden with tests"
to lock in current behavior; frontend tasks build the missing client. Each task references
the requirements it satisfies.

## Backend — lock in current behavior with tests

- [ ] 1. Add test scaffolding and shared fixtures
  - Create a test support class with builders for `ScriptData` (matching, mismatching,
    null-field variants) and small multipart helpers (valid jpeg/png/pdf, oversized,
    wrong type, empty).
  - Confirm JUnit 5 + Mockito + Spring Boot test are available on the test classpath.
  - _Requirements: 1, 2_

- [ ] 2. Unit test `ScriptValidationService` field comparison
  - Cover text normalization (case, whitespace collapse, blank=null) for name/drug/
    directions/prescriber fields.
  - Cover digit-only comparison for NPI and phone (formatting ignored).
  - Cover value equality for DOB, quantity, day supply, refill count.
  - Assert a clean result has zero flags and each mismatch yields one `Flag` with both
    values in the description ("blank" for null).
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 3. Unit test `ExtractionService` validation branches
  - Missing/empty → `FILE_MISSING`; > 10 MB → `FILE_TOO_LARGE`; wrong type →
    `UNSUPPORTED_FORMAT`.
  - Happy path delegates to a mocked `PrescriptionExtractionModel` and returns its result.
  - Model exception is wrapped in `ExtractionFailedException`.
  - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [ ] 4. Unit test `Script` and `ScriptQueue` lifecycle
  - Legal transitions QUEUED→IN_REVIEW→COMPLETED and QUEUED/IN_REVIEW→REVIEW_FAILED;
    illegal transitions throw `IllegalStateException`.
  - `ScriptQueue.add/pull/pop/find/findByStatus` behavior, including `pull(id)` on a
    non-queued id returning empty.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 5. Unit test `ScriptReviewService` orchestration
  - Success: marks COMPLETED, re-stamps `scriptId` on the result, removes from queued set.
  - Invalid image: marks REVIEW_FAILED and rethrows `InvalidScriptImageException`.
  - Other failure: marks REVIEW_FAILED and throws `ReviewFailedException`.
  - Listing order: queued by submittedAt asc, in-review by reviewStartedAt asc, completed
    by completedAt desc; `reviewResult(id)` present/absent.
  - _Requirements: 2.1, 2.7, 2.8, 2.9, 3.5, 3.6, 3.7, 3.8_

- [ ] 6. `@WebMvcTest` for `ScriptReviewController`
  - `/autofill` and `/review` multipart binding and 200 responses (services mocked).
  - `/review` with `scriptData` JSON part binds to `ScriptData`.
  - Exception mappings: 422 with image code, 502 `EXTRACTION_FAILED`, 502 `REVIEW_FAILED`.
  - `/{id}/result` 200 vs 404; the three listing endpoints return summaries.
  - _Requirements: 1.1, 2.1, 3.5, 3.6, 3.7, 3.8, 5.1, 5.2, 5.3, 5.4_

- [ ] 7. Unit test `PromptProvider` selection
  - Add temporary `promptN.txt` fixtures; verify configured-index selection, fallback to
    lowest when 0/unset, error on missing configured index, error on no prompts.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

## Frontend — build the React client (`autoscript-ui`) over the existing API

The Vite + React 19 + TypeScript project is scaffolded and its dev server proxies `/api/*`
to the backend on `:8080`. `App.tsx` is still the default starter; the tasks below build
the actual UI.

- [ ] 8. Replace the starter app and add an API client
  - Remove the default Vite template content from `App.tsx`/`App.css` and set up routing
    for the Upload & Review view and the `/dashboard` view.
  - Add a typed API module wrapping the six endpoints and normalizing `ErrorResponse`
    (fields matching the backend DTOs: `ScriptData`, `ReviewResult`, `Flag`,
    `ScriptSummary`).
  - _Requirements: 6_

- [ ] 9. Upload + autofill flow
  - File picker with client-side guard for type ∈ {jpeg, png, pdf} and ≤ 10 MB.
  - On select, call `/autofill` and bind returned `ScriptData` to an editable form;
    render null fields as empty inputs (never the literal "null").
  - Disable the Autofill control and show a loading indicator while the request is in
    flight; apply the field guards from Requirement 6.8.
  - _Requirements: 6.1, 6.5, 6.6, 6.7, 6.8_

- [ ] 10. Review submission + flag display
  - Build multipart with the original image and the edited `scriptData` JSON part (JSON
    content type), POST `/review`.
  - Render flags grouped by field; show an explicit clean state when there are none.
  - Handle errors: display `message`, distinguish 422 (fix input) from 502 (service).
  - _Requirements: 6.2, 6.3_

- [ ] 11. Dashboard and result view
  - At the `/dashboard` route, render three sections from `/queued`, `/in-review`,
    `/completed` using `ScriptSummary`, formatting timestamps in local time and showing
    empty-state messages.
  - Link completed rows to a result view backed by `/{id}/result`.
  - _Requirements: 6.4, 6.9_

## Optional hardening (future — not current behavior)

- [ ] 12. Decide on persistence and auth
  - Evaluate replacing in-memory `ScriptQueue` with a datastore so state survives restart,
    and adding authentication/authorization and PHI-handling controls.
  - _Requirements: Known Constraints (requirements.md)_
