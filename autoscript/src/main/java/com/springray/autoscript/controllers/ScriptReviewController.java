package com.springray.autoscript.controllers;

import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.List;

/**
 * Single REST entry point for the script review workflow.
 *
 * <p>Exposes two operations:
 * <ul>
 *   <li>{@code POST /api/scripts/autofill} - takes a script image only and returns extracted fields.</li>
 *   <li>{@code POST /api/scripts/review} - takes manually-entered script data and returns a review result.</li>
 * </ul>
 *
 * <p>Both methods are currently stubs that return placeholder responses.
 */
@RestController
@RequestMapping("/api/scripts")
public class ScriptReviewController {

    /**
     * Extracts prescription fields from an uploaded script image (autofill).
     *
     * <p>Stub: currently returns an empty {@link ScriptData} without performing extraction.
     *
     * @param image the uploaded script image (JPEG/PNG/PDF)
     * @return the extracted script fields
     */
    @PostMapping(value = "/autofill", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ScriptData> autofill(@RequestParam("image") MultipartFile image) {
        // TODO: send the image to the extraction service and map the result to ScriptData.
        ScriptData extracted = new ScriptData(null, null, null, null, null, null, null, null);
        return ResponseEntity.ok(extracted);
    }

    /**
     * Runs the review checks against manually-entered script data.
     *
     * <p>Stub: currently returns a {@code COMPLETED} result with no flags.
     *
     * @param scriptData the manually-entered script field values to review
     * @return the structured review result
     */
    @PostMapping(value = "/review", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ReviewResult> review(@RequestBody ScriptData scriptData) {
        // TODO: evaluate scriptData against the review checks and populate flags.
        ReviewResult result = new ReviewResult(
                null,
                "COMPLETED",
                Instant.now(),
                List.of()
        );
        return ResponseEntity.ok(result);
    }
}
