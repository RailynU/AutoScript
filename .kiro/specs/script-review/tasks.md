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

## Frontend — build the client over the existing API

- [ ] 8. Scaffold static frontend served by Spring Boot
  - Add `index.html`, app JS, and CSS under `src/main/resources/static` so the existing
    Boot server serves them with no extra toolchain.
  - Add a small API module wrapping the six endpoints and normalizing `ErrorResponse`.
  - _Requirements: 6_

- [ ] 9. Upload + autofill flow
  - File picker with client-side guard for type ∈ {jpeg, png, pdf} and ≤ 10 MB.
  - On select, call `/autofill` and bind returned `ScriptData` to an editable form;
    render null fields as empty inputs (never the literal "null").
  - _Requirements: 6.1, 6.5, 6.6_

- [ ] 10. Review submission + flag display
  - Build multipart with the original image and the edited `scriptData` JSON part (JSON
    content type), POST `/review`.
  - Render flags grouped by field; show an explicit clean state when there are none.
  - Handle errors: display `message`, distinguish 422 (fix input) from 502 (service).
  - _Requirements: 6.2, 6.3_

- [ ] 11. Dashboard and result view
  - Render three lists from `/queued`, `/in-review`, `/completed` using `ScriptSummary`.
  - Link completed rows to a result view backed by `/{id}/result`.
  - _Requirements: 6.4_

## Optional hardening (future — not current behavior)

- [ ] 12. Decide on persistence and auth
  - Evaluate replacing in-memory `ScriptQueue` with a datastore so state survives restart,
    and adding authentication/authorization and PHI-handling controls.
  - _Requirements: Known Constraints (requirements.md)_
