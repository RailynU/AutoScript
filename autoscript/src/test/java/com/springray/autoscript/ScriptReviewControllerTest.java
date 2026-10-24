package com.springray.autoscript;

import com.springray.autoscript.controllers.ScriptReviewController;
import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.exception.ExtractionFailedException;
import com.springray.autoscript.exception.InvalidScriptImageException;
import com.springray.autoscript.services.ExtractionService;
import com.springray.autoscript.services.ScriptValidationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ScriptReviewController.class)
class ScriptReviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ExtractionService extractionService;

    @MockitoBean
    private ScriptValidationService scriptValidationService;

    private MockMultipartFile image() {
        return new MockMultipartFile("image", "script.png", "image/png", new byte[]{1, 2, 3});
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
}
