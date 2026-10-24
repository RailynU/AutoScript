package com.springray.autoscript.model;

import com.springray.autoscript.dto.ScriptData;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;

/**
 * Deterministic, offline extractor for local development and demos.
 *
 * <p>Active when {@code autoscript.ai.mode=stub}. It does NOT call OpenAI, so the Autofill
 * flow works end to end without an API key: the frontend sends the image, this returns a
 * fixed sample {@link ScriptData}, and the form populates. The returned values vary slightly
 * with the uploaded file's size so repeated uploads of different files don't look identical.
 */
@Component
@ConditionalOnProperty(name = "autoscript.ai.mode", havingValue = "stub")
public class StubPrescriptionExtractionModel implements PrescriptionExtractor {

    private static final String[] DRUGS = {
            "Lisinopril 10mg", "Metformin 500mg", "Atorvastatin 20mg",
            "Amoxicillin 500mg", "Omeprazole 20mg", "Sertraline 50mg"
    };
    private static final String[] DIRECTIONS = {
            "Take 1 tablet by mouth once daily",
            "Take 2 tablets by mouth twice daily with meals",
            "Take 1 capsule by mouth at bedtime",
            "Take 1 tablet three times daily for 10 days"
    };

    @Override
    public ScriptData extractPrescription(MultipartFile image) {
        // Pick deterministic values from the upload so different files produce
        // different (but stable) sample extractions.
        int seed = (int) Math.abs(image.getSize() + hash(image.getOriginalFilename()));
        String drug = DRUGS[seed % DRUGS.length];
        String directions = DIRECTIONS[seed % DIRECTIONS.length];
        int quantity = 30 + (seed % 3) * 30;        // 30, 60, or 90
        int daySupply = 30 + (seed % 3) * 30;
        int refills = seed % 4;                      // 0–3

        return new ScriptData(
                "Sample",
                "Patient",
                LocalDate.of(1985, 4, 12),
                drug,
                directions,
                quantity,
                daySupply,
                refills,
                "Dr. A. Nguyen",
                "1234567893",                        // 10-digit NPI (Luhn-valid)
                "5551234567"
        );
    }

    private static long hash(String s) {
        return s == null ? 0 : s.hashCode();
    }
}
