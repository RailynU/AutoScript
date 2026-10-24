package com.springray.autoscript.controllers;

import com.springray.autoscript.dto.ErrorResponse;
import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.dto.ScriptSummary;
import com.springray.autoscript.exception.ExtractionFailedException;
import com.springray.autoscript.exception.InvalidScriptImageException;
import com.springray.autoscript.exception.ReviewFailedException;
import com.springray.autoscript.services.ExtractionService;
import com.springray.autoscript.services.ScriptReviewService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/scripts")
public class ScriptReviewController {

    private final ExtractionService extractionService;
    private final ScriptReviewService scriptReviewService;

    public ScriptReviewController(ExtractionService extractionService,
                                  ScriptReviewService scriptReviewService) {
        this.extractionService = extractionService;
        this.scriptReviewService = scriptReviewService;
    }

    @PostMapping(value = "/autofill", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ScriptData> autofill(@RequestParam("image") MultipartFile image) {
        ScriptData extracted = extractionService.extract(image);
        return ResponseEntity.ok(extracted);
    }

    @PostMapping(value = "/review", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReviewResult> review(
            @RequestPart("image") MultipartFile image,
            @RequestPart("scriptData") ScriptData scriptData) {
        ReviewResult result = scriptReviewService.review(image, scriptData);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/queued")
    public ResponseEntity<List<ScriptSummary>> queued() {
        return ResponseEntity.ok(scriptReviewService.queued());
    }

    @GetMapping("/in-review")
    public ResponseEntity<List<ScriptSummary>> inReview() {
        return ResponseEntity.ok(scriptReviewService.inReview());
    }

    @GetMapping("/completed")
    public ResponseEntity<List<ScriptSummary>> completed() {
        return ResponseEntity.ok(scriptReviewService.completed());
    }

    @GetMapping("/{id}/result")
    public ResponseEntity<ReviewResult> reviewResult(@PathVariable String id) {
        return scriptReviewService.reviewResult(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @ExceptionHandler(InvalidScriptImageException.class)
    public ResponseEntity<ErrorResponse> handleInvalidImage(InvalidScriptImageException e) {
        return ResponseEntity.unprocessableEntity()
                .body(new ErrorResponse(e.getErrorCode(), e.getMessage()));
    }

    @ExceptionHandler(ExtractionFailedException.class)
    public ResponseEntity<ErrorResponse> handleExtractionFailure(ExtractionFailedException e) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(new ErrorResponse("EXTRACTION_FAILED", e.getMessage()));
    }

    @ExceptionHandler(ReviewFailedException.class)
    public ResponseEntity<ErrorResponse> handleReviewFailure(ReviewFailedException e) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(new ErrorResponse("REVIEW_FAILED", e.getMessage()));
    }
}
