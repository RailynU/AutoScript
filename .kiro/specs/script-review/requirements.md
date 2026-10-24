# Requirements — AutoScript Prescription Review

## Introduction

AutoScript is a Spring Boot application that helps pharmacy staff verify that manually
entered prescription data matches the prescription image ("the script"). A user uploads a
prescription image, the system extracts the fields using an AI vision model (OpenAI
`gpt-4o-mini` via Spring AI), and the system compares the extracted values against the
values the user typed in. Mismatches are returned as flags so the user can correct entry
errors before dispensing.

This document captures the behavior of the system **as currently implemented** on the
backend, plus the requirements for the frontend that consumes the existing REST API.

Project layout (monorepo):

- `autoscript/` — Spring Boot 4.1 REST API (Java 17, Spring AI). **Implemented.**
- `autoscript-ui/` — React 19 + TypeScript single-page app built with Vite, proxying
  `/api/*` to the backend on `http://localhost:8080` during development. **Scaffolded
  but the review UI is not yet built** — `App.tsx` is still the default Vite template.

Scope note: the current backend keeps all state in memory (no database). Scripts and
review results do not survive a restart. This is reflected in the requirements as a known
constraint rather than a target to change.

## Glossary

- **Script**: a submitted prescription, tracked through a status lifecycle.
- **Extraction**: AI reading of the prescription image into structured `ScriptData`.
- **Manual entry**: the `ScriptData` the user typed in, to be verified.
- **Flag**: a single field-level mismatch between extracted and manual data.
- **Review**: the comparison that produces a `ReviewResult` (a list of flags).

## Requirements

### Requirement 1 — Autofill from prescription image

**User Story:** As a pharmacy technician, I want the system to read a prescription image
and pre-fill the entry form, so that I spend less time typing.

#### Acceptance Criteria

1. WHEN a user submits an image to `POST /api/scripts/autofill` as multipart form field
   `image` THEN the system SHALL return the extracted `ScriptData` with HTTP 200.
2. WHEN the uploaded file is missing or empty THEN the system SHALL respond HTTP 422 with
   error code `FILE_MISSING`.
3. WHEN the uploaded file exceeds 10 MB THEN the system SHALL respond HTTP 422 with error
   code `FILE_TOO_LARGE`.
4. WHEN the uploaded file is not `image/jpeg`, `image/png`, or `application/pdf` THEN the
   system SHALL respond HTTP 422 with error code `UNSUPPORTED_FORMAT`.
5. WHEN the AI extraction call fails for any reason THEN the system SHALL respond HTTP 502
   with error code `EXTRACTION_FAILED`.
6. WHEN a prescription field is absent or illegible in the image THEN the extraction
   SHALL leave that field null rather than guessing.

### Requirement 2 — Review manual entry against the image

**User Story:** As a pharmacy technician, I want the system to compare what I typed against
what is on the script, so that data-entry mistakes are caught before dispensing.

#### Acceptance Criteria

1. WHEN a user submits both `image` (multipart part) and `scriptData` (JSON part) to
   `POST /api/scripts/review` THEN the system SHALL extract the image, compare it to the
   manual entry, and return a `ReviewResult` with HTTP 200.
2. WHEN extracted and manual values for a field match THEN the system SHALL NOT emit a
   flag for that field.
3. WHEN extracted and manual values for a field differ THEN the system SHALL emit one
   `Flag` for that field containing the field name and a human-readable description naming
   both the entered value and the value on the script.
4. WHEN comparing text fields (names, drug name, directions) THEN the system SHALL ignore
   case and collapse surrounding/internal whitespace before comparing, and SHALL treat an
   empty/blank value as equivalent to null.
5. WHEN comparing NPI and phone fields THEN the system SHALL compare digits only, ignoring
   formatting characters.
6. WHEN comparing date of birth, quantity, day supply, and refill count THEN the system
   SHALL compare by value equality.
7. WHEN the image fails validation during review THEN the system SHALL mark the script
   `REVIEW_FAILED` and respond HTTP 422 with the corresponding image error code.
8. WHEN extraction or comparison fails for any other reason THEN the system SHALL mark the
   script `REVIEW_FAILED` and respond HTTP 502 with error code `REVIEW_FAILED`.
9. WHEN a review completes (success or failure) THEN the script SHALL no longer remain in
   the queued set.

### Requirement 3 — Script lifecycle and queue tracking

**User Story:** As a pharmacy supervisor, I want to see scripts grouped by where they are
in the review process, so that I can monitor workload and outcomes.

#### Acceptance Criteria

1. WHEN a review is requested THEN the system SHALL create a script with status `QUEUED`
   and a unique sequential id and a submission timestamp.
2. WHEN a script begins review THEN the system SHALL transition it to `IN_REVIEW` and
   record a review-start timestamp; a transition to `IN_REVIEW` SHALL be rejected unless
   the current status is `QUEUED`.
3. WHEN a review succeeds THEN the system SHALL transition the script to `COMPLETED`,
   attach the `ReviewResult`, and record a completion timestamp; a transition to
   `COMPLETED` SHALL be rejected unless the current status is `IN_REVIEW`.
4. WHEN a review fails THEN the system SHALL transition the script to `REVIEW_FAILED` and
   record a completion timestamp.
5. WHEN a user calls `GET /api/scripts/queued` THEN the system SHALL return `QUEUED`
   script summaries ordered by submission time (oldest first).
6. WHEN a user calls `GET /api/scripts/in-review` THEN the system SHALL return `IN_REVIEW`
   script summaries ordered by review-start time (oldest first).
7. WHEN a user calls `GET /api/scripts/completed` THEN the system SHALL return `COMPLETED`
   script summaries ordered by completion time (most recent first).
8. WHEN a user calls `GET /api/scripts/{id}/result` with a known id THEN the system SHALL
   return that script's `ReviewResult` with HTTP 200; WHEN the id is unknown THEN the
   system SHALL respond HTTP 404.
9. WHERE a script summary is returned THE system SHALL include id, status, the three
   timestamps, drug name, quantity, and the flag count when a result exists.

### Requirement 4 — Configurable extraction prompt

**User Story:** As an engineer, I want to swap the extraction prompt without a code change,
so that I can iterate on extraction quality.

#### Acceptance Criteria

1. WHERE prompt files named `prompt<N>.txt` exist under `classpath:prompts/` THE system
   SHALL discover them and index them by their numeric suffix.
2. WHEN `autoscript.extraction.prompt` is set to a positive N THEN the system SHALL use
   `promptN.txt`; IF that prompt does not exist THEN startup/use SHALL fail with a clear
   error.
3. WHEN `autoscript.extraction.prompt` is 0, unset, or non-positive THEN the system SHALL
   use the lowest-numbered available prompt.
4. IF no prompt files are found THEN the system SHALL fail with a clear error.

### Requirement 5 — API error contract

**User Story:** As a frontend developer, I want predictable error responses, so that I can
surface actionable messages to users.

#### Acceptance Criteria

1. WHEN any handled error occurs THEN the system SHALL return an `ErrorResponse` body with
   a stable `code` string and a human-readable `message`.
2. WHERE the error is an invalid image THE HTTP status SHALL be 422 and the code SHALL be
   one of `FILE_MISSING`, `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`.
3. WHERE the error is an extraction failure THE HTTP status SHALL be 502 and the code
   SHALL be `EXTRACTION_FAILED`.
4. WHERE the error is a review failure THE HTTP status SHALL be 502 and the code SHALL be
   `REVIEW_FAILED`.

### Requirement 6 — Review web client (React frontend, not yet implemented)

**User Story:** As a pharmacy technician, I want a web interface to upload a script, review
the pre-filled fields, submit for verification, and see flags, so that I can do my job
without calling the API directly.

Status: the `autoscript-ui` React/Vite project is scaffolded (dev proxy to the backend is
configured) but the acceptance criteria below are **not yet implemented**; `App.tsx` is
still the default Vite starter.

#### Acceptance Criteria

1. WHEN the user selects a prescription image THEN the client SHALL call `/autofill` and
   populate an editable form with the returned fields.
2. WHEN the user submits the form THEN the client SHALL send the image and the (possibly
   edited) `scriptData` to `/review` and display the returned flags, clearly indicating a
   clean result when there are none.
3. WHEN the API returns an error response THEN the client SHALL display the `message` and
   distinguish validation errors (422) from upstream failures (502).
4. WHEN the user opens the Dashboard at the `/dashboard` client-side route THEN the client
   SHALL render three labeled sections — Queued, In Review, and Completed — backed by
   `GET /queued`, `GET /in-review`, and `GET /completed`, and SHALL allow opening a
   completed script's result via `GET /{id}/result`.
5. WHERE a field value is null from extraction THE client SHALL render an empty, editable
   input rather than the literal "null".
6. THE client SHALL enforce the same upload constraints as the backend (type ∈ {JPEG, PNG,
   PDF} and 10 MB size) before submitting, as a usability aid, while still handling backend
   rejections.
7. WHILE an `/autofill` request is in progress THE client SHALL disable the Autofill action
   and show a loading indicator until it completes or fails.
8. WHERE the data entry form is rendered THE client SHOULD apply client-side field guards as
   a usability aid (these mirror typical pharmacy ranges and are not enforced by the current
   backend, which compares extracted vs. entered values rather than validating ranges):
   drug name ≤ 200 chars, directions ≤ 500 chars, quantity 1–9999, day supply 1–365,
   refill count 0–99, prescriber name ≤ 100 chars, NPI exactly 10 digits, phone exactly
   10 digits.
9. THE Dashboard SHALL format timestamps in the user's local timezone and SHALL show an
   explicit empty-state message for any section that contains no scripts.

## Known Constraints and Non-Goals (current implementation)

- State is in-memory only; there is no persistence, authentication, or multi-instance
  support. Restart clears all scripts and results.
- `ScriptData` is never updated after submission even though `Script.setData` exists; the
  manual entry submitted with `/review` is the stored data.
- The `/review` flow creates, pulls, completes, and pops a script synchronously in one
  request; there is no background worker despite the queue abstraction.
- There is no `GET /api/scripts/{id}` for the full script, only `/{id}/result`.
- No authentication/authorization is implemented; PHI handling and compliance (e.g.
  HIPAA) are out of scope for the current build and flagged as a future concern.
- The review the backend performs is a **field-by-field comparison** of AI-extracted
  values against the user's manual entry. It does NOT perform content-level dispensing
  checks (formulary drug-name lookup, Luhn validation of the NPI, day-supply derived from
  quantity and directions frequency). Those richer checks were explored in an earlier
  draft spec and are recorded here as possible future work, not current behavior.
