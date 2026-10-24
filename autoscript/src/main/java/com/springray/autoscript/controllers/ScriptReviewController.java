package com.springray.autoscript.controllers;

import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.services.ExtractionService;
import com.springray.autoscript.services.ScriptValidationService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/scripts")
public class ScriptReviewController {

    private final ExtractionService extractionService;
    private final ScriptValidationService scriptValidationService;

    public ScriptReviewController(ExtractionService extractionService,
                                  ScriptValidationService scriptValidationService) {
        this.extractionService = extractionService;
        this.scriptValidationService = scriptValidationService;
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
        ScriptData extracted = extractionService.extract(image);
        ReviewResult result = scriptValidationService.review(extracted, scriptData);
        return ResponseEntity.ok(result);
    }
}
