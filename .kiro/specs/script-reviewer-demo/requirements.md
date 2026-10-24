# Requirements Document

## Introduction

AutoScript is a pharmacy script reviewer demo application. The React single-page application handles all views and user interaction, simulating a pharmacy management system; Spring Boot serves as a REST JSON API that processes requests and returns JSON responses. The system simulates both sides of a pharmacy workflow: the pharmacy side uploads prescription images to a queue, and the reviewer side fetches scripts from that queue, autofills or manually enters the prescription data, and verifies the entry against automated review checks. Scripts are tracked through three lifecycle stages: queued, in review, and completed. The Backend evaluates each script for common dispensing errors and returns structured review results displayed as flags in the browser.

## Glossary

- **Script**: A prescription record containing drug name, directions, quantity, day supply, refill count, and prescriber information, associated with an uploaded prescription image.
- **Script_Image**: A photo or scan of a physical prescription uploaded by the user.
- **Script_Queue**: The collection of scripts waiting to be reviewed, each associated with a Script_Image.
- **Script_Review**: The backend process that evaluates a script's field data for correctness and completeness.
- **Review_Result**: The structured JSON response from the Backend containing review status and any flags raised during review.
- **Flag**: An identified issue with a script field (e.g., incorrect drug, incorrect directions, invalid quantity).
- **Prescriber**: The licensed healthcare provider who authorized the script.
- **Frontend**: The React single-page application that renders all views and manages user interaction.
- **Backend**: The Spring Boot REST API that processes requests and returns JSON responses.
- **Dashboard**: The main view rendered by the React Frontend, displaying scripts grouped by their lifecycle stage.
- **Script_Review_View**: The React view rendered when a user fetches the next script, showing the script image alongside the data entry form.
- **Autofill**: The backend process that analyzes a Script_Image and extracts prescription field values to populate the data entry form.

## Requirements

### Requirement 1: Script Image Upload

**User Story:** As a pharmacist technician, I want to upload a prescription image from the dashboard, so that the script is added to the review queue.

#### Acceptance Criteria

1. THE Dashboard SHALL provide an upload control that accepts image files in JPEG, PNG, and PDF formats with a maximum file size of 10 MB.
2. WHEN a user selects a valid image file and submits the upload, THE Backend SHALL store the Script_Image and create a new Script record with status `QUEUED`, associating the Script_Image with that Script record.
3. WHEN the upload completes successfully, THE Frontend SHALL display the newly queued script in the Queued section of the Dashboard within 2 seconds without requiring a full page reload.
4. IF the uploaded file exceeds 10 MB, is not one of the accepted formats, or cannot be read as a valid image or PDF, THEN THE Backend SHALL return an error response identifying the reason the file was rejected and SHALL NOT add a Script record to the Script_Queue.
5. IF the image upload fails due to a server or storage error, THEN THE Backend SHALL return an error response indicating the upload could not be completed and SHALL NOT add a partial Script record to the Script_Queue.
6. WHEN a user uploads an image file that is byte-for-byte identical to an already-queued Script_Image, THE Backend SHALL treat it as a new script submission and add a separate Script record to the Script_Queue.

### Requirement 2: Fetch Next Script for Review

**User Story:** As a pharmacist technician, I want to fetch the next available script from the queue, so that I can begin reviewing it.

#### Acceptance Criteria

1. WHILE at least one script has `QUEUED` status, THE Dashboard SHALL enable the Fetch Next Script action.
2. WHEN a user activates the Fetch Next Script action, THE Backend SHALL atomically select the `QUEUED` script with the earliest submission timestamp (using script ID ascending as a tiebreaker), update its status to `IN_REVIEW`, and return the script data; THE Frontend SHALL navigate the user to the Script_Review_View for that script.
3. WHEN the Script_Review_View loads, THE Frontend SHALL display the associated Script_Image on the left side of the view and the data entry form on the right side of the view.
4. THE Script_Review_View data entry form SHALL contain the following fields: drug name (max 200 characters), directions (max 500 characters), quantity (integer, 1–9999), day supply (integer, 1–365), refill count (integer, 0–99), prescriber name (max 100 characters), prescriber NPI (exactly 10 digits, numeric only), and prescriber phone number (exactly 10 digits, numeric only).
5. THE Frontend SHALL provide two action buttons on the Script_Review_View: Autofill and Verify, where the Verify button is enabled only when all required form fields contain a non-empty value.
6. WHEN no scripts have `QUEUED` status, THE Dashboard SHALL disable the Fetch Next Script action and display a message indicating the queue is empty.
7. IF no `QUEUED` script is available at the moment the Fetch Next Script action is processed (e.g., claimed by a concurrent request), THEN THE Backend SHALL return a response indicating no scripts are available; THE Frontend SHALL return the user to the Dashboard and display a message indicating no scripts are currently available.
8. IF the Script_Image for the selected script cannot be loaded, THEN THE Frontend SHALL display an error message indicating the image is unavailable in place of the image and keep the data entry form accessible.

### Requirement 3: Autofill from Script Image

**User Story:** As a pharmacist technician, I want to autofill the data entry form from the script image, so that I can review extracted values rather than transcribing manually.

#### Acceptance Criteria

1. WHEN a user clicks the Autofill button on the Script_Review_View, THE Backend SHALL send the associated Script_Image to the extraction service and return extracted field values; THE Frontend SHALL populate all extractable form fields with the returned values.
2. WHEN the Autofill process returns extracted values, THE Frontend SHALL populate each form field that received an extracted value with that value, overwriting any previously entered content in those fields only; fields for which no value was extracted SHALL remain unchanged.
3. WHEN extracted field values are populated, THE Backend SHALL also execute the Script_Review checks against those extracted values and return any resulting Flags; THE Frontend SHALL display those Flags on the Script_Review_View alongside the corresponding form fields.
4. WHEN the Autofill process returns a value for a field that fails field-level format validation, THE Frontend SHALL display that field's validation error alongside the populated value so the user can correct it.
5. IF the Autofill process cannot extract a value for a field, THEN THE Backend SHALL omit that field from the response and THE Frontend SHALL leave that form field empty.
6. IF the Autofill request fails due to a server error, processing error, network error, or timeout, THEN THE Frontend SHALL display an error message and leave all form fields unchanged.
7. WHILE an Autofill request is in progress, THE Frontend SHALL disable the Autofill button and display a loading indicator until the request completes or fails.

### Requirement 4: Verify Script Entry

**User Story:** As a pharmacist technician, I want to verify the data I have entered against automated review checks, so that I can identify and correct any prescription errors before completing the review.

#### Acceptance Criteria

1. WHEN a user clicks the Verify button on the Script_Review_View, THE Frontend SHALL submit only the current form field values (not the Script_Image) to the Backend Script_Review process.
2. WHEN the Verify request is received, THE Backend SHALL evaluate the submitted field values against all Script_Review checks defined in Requirement 5 and return a Review_Result.
3. WHEN the Review_Result contains zero Flags, THE Backend SHALL update the script status to `COMPLETED` and persist the Review_Result; THE Frontend SHALL display a success message stating that no issues were found.
4. WHEN the Review_Result contains one or more Flags, THE Backend SHALL update the script status to `COMPLETED` and persist the Review_Result; THE Frontend SHALL display each Flag's field name and description on the Script_Review_View so the user can identify and correct the issues.
5. IF a required form field (drug name, directions, quantity, day supply, or prescriber NPI) is empty when the user clicks Verify, THEN THE Frontend SHALL display a validation message identifying each empty required field and SHALL NOT submit the request to the Backend Script_Review process.
6. WHEN a user enters a quantity value, THE Frontend SHALL accept only positive numeric values greater than zero and no greater than 9,999 with up to 2 decimal places.
7. WHEN a user enters a day supply value, THE Frontend SHALL accept only positive integer values greater than zero and no greater than 365.
8. WHEN a user enters a refill count value, THE Frontend SHALL accept only non-negative integer values no greater than 99.
9. WHEN a user enters a prescriber NPI value, THE Frontend SHALL accept only a 10-digit numeric value.
10. WHEN a user enters a prescriber phone number value, THE Frontend SHALL accept only a 10-digit numeric value.
11. IF the Backend Script_Review process returns an error during Verify, THEN THE Frontend SHALL display an error message indicating the verification could not be completed and THE Backend SHALL NOT update the script status.

### Requirement 5: Script Review Processing

**User Story:** As a pharmacist technician, I want the backend to automatically check submitted script data, so that potential dispensing errors are identified without manual checking.

#### Acceptance Criteria

1. WHEN the Script_Review process is triggered, THE Backend SHALL evaluate the submitted field values against all of the following checks: drug name validity (matches a known formulary entry), directions completeness (directions field is non-empty and does not exceed 500 characters), quantity range validity (numeric value between 1 and 9,999), day supply consistency (calculated day supply derived from quantity and directions frequency matches the stated day supply within a tolerance of ±1 day), and prescriber NPI format (10-digit numeric string passing the Luhn check digit algorithm).
2. WHEN the Script_Review completes without error, THE Backend SHALL update the script status to `COMPLETED` and persist the Review_Result.
3. WHEN the Script_Review completes without error, THE Backend SHALL return a Review_Result containing the script identifier, the final status value `COMPLETED`, and a list of zero or more Flags.
4. IF a script field fails a review check, THEN THE Backend SHALL include a Flag in the Review_Result that specifies the field name and a description stating the violated rule and the expected format or range.
5. WHEN no issues are found during review, THE Backend SHALL return a Review_Result with an empty flags list and status `COMPLETED`.
6. IF the Script_Review process encounters an internal processing exception or system-level error before completion, THEN THE Backend SHALL set the script status to `REVIEW_FAILED`, persist that status, and return an error response indicating the review could not be completed without altering any previously persisted script data.

### Requirement 6: Dashboard — Script Queue View

**User Story:** As a pharmacist technician, I want to see all scripts currently waiting to be reviewed, so that I can monitor workload.

#### Acceptance Criteria

1. THE Frontend SHALL display the Dashboard at the `/dashboard` client-side route, rendering three sections each labeled with its name: Queued, In Review, and Completed.
2. THE Dashboard SHALL display each script in the Queued section sorted ascending by submission timestamp, showing the script identifier and submission timestamp formatted as date and time to the minute in the user's local timezone.
3. WHEN the list of scripts in any section changes, THE Frontend SHALL update that section within 5 seconds to reflect the current state.
4. IF a section contains no scripts, THEN THE Dashboard SHALL display a message indicating that section is empty.

### Requirement 7: Dashboard — Scripts in Review View

**User Story:** As a pharmacist technician, I want to see which scripts are currently being reviewed, so that I can track active processing.

#### Acceptance Criteria

1. THE Dashboard SHALL display each script in the In Review section sorted ascending by review start time, showing the script identifier and review start time formatted as HH:MM:SS in the user's local timezone.
2. WHEN a script transitions to `IN_REVIEW` status, THE Frontend SHALL move the script entry from the Queued section to the In Review section within 5 seconds.
3. WHEN no scripts are in review, THE Dashboard SHALL display a message indicating no scripts are currently being reviewed.

### Requirement 8: Dashboard — Completed Scripts View

**User Story:** As a pharmacist technician, I want to see completed scripts and their review results, so that I can act on any identified flags.

#### Acceptance Criteria

1. THE Dashboard SHALL display each completed script sorted descending by completion timestamp, showing the drug name, quantity, completion timestamp formatted as date and time to the minute in the user's local timezone, and the count of flags raised.
2. WHEN a script has zero flags, THE Dashboard SHALL display a "Passed" label on that script's entry in the Completed section.
3. WHEN a script has one or more Flags, THE Dashboard SHALL display a "Needs Attention" label on that script's entry in the Completed section.
4. WHEN a user selects a completed script entry on the Dashboard, THE Frontend SHALL display the full Review_Result for that script including each Flag's field name and description.
5. WHEN no scripts are completed, THE Dashboard SHALL display a message indicating no scripts have been reviewed yet.

### Requirement 9: Review Result API Contract

**User Story:** As a developer, I want a clearly defined API response format, so that the Frontend can reliably parse and display review results.

#### Acceptance Criteria

1. THE Backend SHALL return Review_Result JSON containing: a `scriptId` string field, a `status` string field with value `COMPLETED`, a `reviewedAt` ISO-8601 timestamp field, and a `flags` array field.
2. WHEN the `flags` array is non-empty, THE Backend SHALL populate each element with a `field` string identifying the script field and a `description` string describing the violated rule and expected format or range.
3. WHEN the Backend successfully completes a script review, THE Backend SHALL return HTTP 200 with the Review_Result JSON body.
4. IF the submitted script data fails backend validation, THEN THE Backend SHALL return HTTP 422 with an error body containing a machine-readable error code and a human-readable message.
5. THE Backend SHALL ensure that serializing any valid Script object to JSON and then deserializing that JSON back to a Script object produces an object where every field has a value equal to the corresponding field in the original Script object.
