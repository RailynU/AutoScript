package com.springray.autoscript;

import com.springray.autoscript.controllers.ScriptReviewController;
import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.dto.ScriptSummary;
import com.springray.autoscript.exception.ExtractionFailedException;
import com.springray.autoscript.exception.InvalidScriptImageException;
import com.springray.autoscript.exception.ReviewFailedException;
import com.springray.autoscript.services.ExtractionService;
import com.springray.autoscript.services.ScriptReviewService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ScriptReviewController.class)
@TestPropertySource(properties = "autoscript.ai.enabled=true")
class ScriptReviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ExtractionService extractionService;

    @MockitoBean
    private ScriptReviewService scriptReviewService;

    private MockMultipartFile image() {
        return new MockMultipartFile("image", "script.png", "image/png", new byte[]{1, 2, 3});
    }

    private MockMultipartFile scriptDataPart() {
        return new MockMultipartFile("scriptData", "", "application/json", "{}".getBytes());
    }

    @Test
    void autofillReturnsExtractedData() throws Exception {
        ScriptData data = new ScriptData("John", "Doe", null, "Amoxicillin",
                "Take 1 daily", 30, 30, 2, "Dr. Smith", "1234567890", "5551234567");
        when(extractionService.extract(any())).thenReturn(data);

        mockMvc.perform(multipart("/api/scripts/autofill").file(image()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.drugName").value("Amoxicillin"))
                .andExpect(jsonPath("$.patientFirstName").value("John"));
    }

    @Test
    void autofillInvalidImageReturns422() throws Exception {
        when(extractionService.extract(any()))
                .thenThrow(new InvalidScriptImageException("UNSUPPORTED_FORMAT",
                        "The script image must be a JPEG, PNG, or PDF file."));

        mockMvc.perform(multipart("/api/scripts/autofill").file(image()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_FORMAT"));
    }

    @Test
    void autofillExtractionFailureReturns502() throws Exception {
        when(extractionService.extract(any()))
                .thenThrow(new ExtractionFailedException("Prescription extraction could not be completed.",
                        new RuntimeException("model down")));

        mockMvc.perform(multipart("/api/scripts/autofill").file(image()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("EXTRACTION_FAILED"));
    }

    @Test
    void reviewReturnsResult() throws Exception {
        ReviewResult result = new ReviewResult("1", "COMPLETED", Instant.now(), List.of());
        when(scriptReviewService.review(any(), any())).thenReturn(result);

        mockMvc.perform(multipart("/api/scripts/review").file(image()).file(scriptDataPart()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scriptId").value("1"))
                .andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void reviewFailureReturns502() throws Exception {
        when(scriptReviewService.review(any(), any()))
                .thenThrow(new ReviewFailedException("The script review could not be completed for script 1.",
                        new RuntimeException("boom")));

        mockMvc.perform(multipart("/api/scripts/review").file(image()).file(scriptDataPart()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("REVIEW_FAILED"));
    }

    @Test
    void reviewInvalidImageReturns422() throws Exception {
        when(scriptReviewService.review(any(), any()))
                .thenThrow(new InvalidScriptImageException("FILE_TOO_LARGE",
                        "The script image exceeds the 10 MB maximum."));

        mockMvc.perform(multipart("/api/scripts/review").file(image()).file(scriptDataPart()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("FILE_TOO_LARGE"));
    }

    @Test
    void queuedReturnsSummaries() throws Exception {
        ScriptSummary s = new ScriptSummary("1", "QUEUED", java.time.Instant.now(),
                null, null, null, null, null);
        when(scriptReviewService.queued()).thenReturn(List.of(s));

        mockMvc.perform(get("/api/scripts/queued"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("1"))
                .andExpect(jsonPath("$[0].status").value("QUEUED"));
    }

    @Test
    void completedReturnsSummariesWithFlagCount() throws Exception {
        ScriptSummary s = new ScriptSummary("2", "COMPLETED", java.time.Instant.now(),
                java.time.Instant.now(), java.time.Instant.now(), "Amoxicillin", 30, 1);
        when(scriptReviewService.completed()).thenReturn(List.of(s));

        mockMvc.perform(get("/api/scripts/completed"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].drugName").value("Amoxicillin"))
                .andExpect(jsonPath("$[0].flagCount").value(1));
    }

    @Test
    void reviewResultFoundReturnsResult() throws Exception {
        ReviewResult r = new ReviewResult("3", "COMPLETED", java.time.Instant.now(), List.of());
        when(scriptReviewService.reviewResult("3")).thenReturn(java.util.Optional.of(r));

        mockMvc.perform(get("/api/scripts/3/result"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scriptId").value("3"));
    }

    @Test
    void reviewResultMissingReturns404() throws Exception {
        when(scriptReviewService.reviewResult("99")).thenReturn(java.util.Optional.empty());

        mockMvc.perform(get("/api/scripts/99/result"))
                .andExpect(status().isNotFound());
    }
}
