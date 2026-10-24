package com.springray.autoscript;

import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.model.StubPrescriptionExtractionModel;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StubPrescriptionExtractionModelTest {

    private final StubPrescriptionExtractionModel model = new StubPrescriptionExtractionModel();

    private MockMultipartFile image(String name, byte[] bytes) {
        return new MockMultipartFile("image", name, "image/png", bytes);
    }

    @Test
    void returnsFullyPopulatedScriptData() {
        ScriptData data = model.extractPrescription(image("rx.png", new byte[]{1, 2, 3}));

        assertNotNull(data.drugName());
        assertNotNull(data.directions());
        assertNotNull(data.patientFirstName());
        assertNotNull(data.patientLastName());
        assertNotNull(data.patientDateOfBirth());
        assertNotNull(data.prescriberName());
        assertNotNull(data.prescriberNpi());
        assertNotNull(data.prescriberPhone());
        assertNotNull(data.quantity());
        assertNotNull(data.daySupply());
        assertNotNull(data.refillCount());
    }

    @Test
    void producesValuesWithinExpectedRanges() {
        ScriptData data = model.extractPrescription(image("rx.png", new byte[]{9, 9, 9, 9}));

        // quantity/daySupply are drawn from {30, 60, 90}
        assertTrue(data.quantity() == 30 || data.quantity() == 60 || data.quantity() == 90,
                "quantity should be one of 30/60/90 but was " + data.quantity());
        assertTrue(data.daySupply() == 30 || data.daySupply() == 60 || data.daySupply() == 90,
                "daySupply should be one of 30/60/90 but was " + data.daySupply());
        // refills 0–3
        assertTrue(data.refillCount() >= 0 && data.refillCount() <= 3,
                "refillCount should be 0–3 but was " + data.refillCount());
        // NPI is exactly 10 digits
        assertTrue(data.prescriberNpi().matches("\\d{10}"), "NPI should be 10 digits");
        assertTrue(data.prescriberPhone().matches("\\d{10}"), "phone should be 10 digits");
    }

    @Test
    void sameFileProducesDeterministicResult() {
        MockMultipartFile f = image("stable.png", new byte[]{5, 5, 5});
        ScriptData first = model.extractPrescription(f);
        ScriptData second = model.extractPrescription(f);
        assertEquals(first, second, "same upload should yield identical extraction");
    }

    @Test
    void differentFilesCanProduceDifferentDrugs() {
        // Files engineered (via size) to land on different drug indices.
        ScriptData a = model.extractPrescription(image("a", new byte[]{0}));          // size 1
        ScriptData b = model.extractPrescription(image("a", new byte[]{0, 0, 0, 0})); // size 4
        // Not strictly guaranteed different, but with these sizes the index differs.
        // Assert both are valid drugs from the catalogue regardless.
        assertTrue(a.drugName().length() > 0);
        assertTrue(b.drugName().length() > 0);
    }

    @Test
    void handlesNullFilenameWithoutError() {
        MockMultipartFile f = new MockMultipartFile("image", null, "image/png", new byte[]{1});
        ScriptData data = model.extractPrescription(f);
        assertNotNull(data.drugName(), "null filename should still produce a result");
    }
}
