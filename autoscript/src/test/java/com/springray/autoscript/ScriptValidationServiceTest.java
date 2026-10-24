package com.springray.autoscript;

import com.springray.autoscript.dto.Flag;
import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.services.ScriptValidationService;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScriptValidationServiceTest {

    private final ScriptValidationService service = new ScriptValidationService();

    private ScriptData data(String first, String last, LocalDate dob, String drug, String directions,
                            Integer qty, Integer daySupply, Integer refills,
                            String prescriber, String npi, String phone) {
        return new ScriptData(first, last, dob, drug, directions, qty, daySupply, refills,
                prescriber, npi, phone);
    }

    @Test
    void identicalDataProducesNoFlags() {
        ScriptData d = data("John", "Doe", LocalDate.of(1990, 1, 1), "Amoxicillin",
                "Take 1 tablet daily", 30, 30, 2, "Dr. Smith", "1234567890", "5551234567");
        ReviewResult result = service.review(d, d);
        assertTrue(result.flags().isEmpty(), "identical data should raise no flags");
        assertEquals("COMPLETED", result.status());
    }

    @Test
    void textComparisonIgnoresCaseAndWhitespace() {
        ScriptData extracted = data("John", "Doe", null, "Amoxicillin",
                "Take 1 tablet daily", null, null, null, null, null, null);
        ScriptData manual = data("  john ", "DOE", null, "amoxicillin",
                "take 1  tablet   daily", null, null, null, null, null, null);
        ReviewResult result = service.review(extracted, manual);
        assertTrue(result.flags().isEmpty(), "normalized text should match");
    }

    @Test
    void digitComparisonIgnoresFormatting() {
        ScriptData extracted = data(null, null, null, null, null, null, null, null,
                null, "1234567890", "5551234567");
        ScriptData manual = data(null, null, null, null, null, null, null, null,
                null, "1234567890", "(555) 123-4567");
        ReviewResult result = service.review(extracted, manual);
        assertTrue(result.flags().isEmpty(), "digit-only normalization should match");
    }

    @Test
    void mismatchedFieldsAreFlagged() {
        ScriptData extracted = data("John", "Doe", LocalDate.of(1990, 1, 1), "Amoxicillin",
                "Take 1 tablet daily", 30, 30, 2, "Dr. Smith", "1234567890", "5551234567");
        ScriptData manual = data("Jane", "Doe", LocalDate.of(1991, 1, 1), "Amoxicillin",
                "Take 2 tablets daily", 60, 30, 2, "Dr. Smith", "1234567890", "5551234567");
        ReviewResult result = service.review(extracted, manual);
        List<String> flaggedFields = result.flags().stream().map(Flag::field).toList();
        assertTrue(flaggedFields.contains("patientFirstName"));
        assertTrue(flaggedFields.contains("patientDateOfBirth"));
        assertTrue(flaggedFields.contains("directions"));
        assertTrue(flaggedFields.contains("quantity"));
        assertEquals(4, result.flags().size(), "only the four differing fields should flag");
    }

    @Test
    void nullVersusPresentIsFlagged() {
        ScriptData extracted = data(null, null, null, "Amoxicillin",
                null, null, null, null, null, null, null);
        ScriptData manual = data(null, null, null, "Ibuprofen",
                null, null, null, null, null, null, null);
        ReviewResult result = service.review(extracted, manual);
        assertEquals(1, result.flags().size());
        assertEquals("drugName", result.flags().get(0).field());
    }
}
