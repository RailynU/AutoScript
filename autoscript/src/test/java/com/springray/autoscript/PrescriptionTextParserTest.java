package com.springray.autoscript;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import org.junit.jupiter.api.Test;

import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.model.PrescriptionTextParser;

class PrescriptionTextParserTest {

    private final PrescriptionTextParser parser = new PrescriptionTextParser();

    @Test
    void parsesAWellFormedPrescription() {
        String ocr = """
                Rx — Community Pharmacy
                Patient: Emily Carter
                DOB: 04/12/1985
                Drug: Lisinopril 10mg
                Sig: Take 1 tablet by mouth once daily
                Qty: 30   Days: 30   Refills: 2
                Prescriber: Dr. A. Nguyen
                NPI: 1234567893
                Phone: (555) 123-4567
                """;

        ScriptData d = parser.parse(ocr);

        assertEquals("Emily", d.patientFirstName());
        assertEquals("Carter", d.patientLastName());
        assertEquals(LocalDate.of(1985, 4, 12), d.patientDateOfBirth());
        assertEquals("Lisinopril 10mg", d.drugName());
        assertEquals("Take 1 tablet by mouth once daily", d.directions());
        assertEquals(30, d.quantity());
        assertEquals(30, d.daySupply());
        assertEquals(2, d.refillCount());
        assertEquals("Dr. A. Nguyen", d.prescriberName());
        assertEquals("1234567893", d.prescriberNpi());
        assertEquals("5551234567", d.prescriberPhone());
    }

    @Test
    void toleratesMixedCaseLabelsAndExtraWhitespace() {
        String ocr = """
                PATIENT :   John   Doe
                drug-   Metformin 500mg
                qty :  60
                """;

        ScriptData d = parser.parse(ocr);

        assertEquals("John", d.patientFirstName());
        assertEquals("Doe", d.patientLastName());
        assertEquals("Metformin 500mg", d.drugName());
        assertEquals(60, d.quantity());
    }

    @Test
    void leavesUnmatchedFieldsNull() {
        String ocr = """
                Drug: Amoxicillin 500mg
                Sig: Take 1 capsule three times daily
                """;

        ScriptData d = parser.parse(ocr);

        assertEquals("Amoxicillin 500mg", d.drugName());
        assertEquals("Take 1 capsule three times daily", d.directions());
        assertNull(d.patientFirstName());
        assertNull(d.patientLastName());
        assertNull(d.patientDateOfBirth());
        assertNull(d.quantity());
        assertNull(d.prescriberNpi());
    }

    @Test
    void stripsPhoneFormattingToDigits() {
        ScriptData d = parser.parse("Phone: (555) 987-6543");
        assertEquals("5559876543", d.prescriberPhone());
    }

    @Test
    void handlesSingleTokenPatientName() {
        ScriptData d = parser.parse("Patient: Madonna");
        assertEquals("Madonna", d.patientFirstName());
        assertNull(d.patientLastName());
    }

    @Test
    void parsesAlternativeDateFormats() {
        assertEquals(LocalDate.of(1990, 1, 5),
                parser.parse("DOB: 1/5/1990").patientDateOfBirth());
        assertEquals(LocalDate.of(1972, 9, 30),
                parser.parse("Date of Birth: 1972-09-30").patientDateOfBirth());
    }

    @Test
    void ignoresUnparseableDate() {
        assertNull(parser.parse("DOB: sometime in the 80s").patientDateOfBirth());
    }

    @Test
    void emptyAndNullInputProduceAllNullFields() {
        ScriptData empty = parser.parse("");
        assertNull(empty.drugName());
        assertNull(empty.patientFirstName());

        ScriptData nul = parser.parse(null);
        assertNull(nul.drugName());
        assertNull(nul.quantity());
    }

    @Test
    void extractsNumbersEvenWhenSurroundedByNoise() {
        // OCR sometimes merges fields on a line; the parser should still pull the count.
        ScriptData d = parser.parse("Refills: 3 (three) remaining");
        assertEquals(3, d.refillCount());
    }

    @Test
    void rxTitleHeaderIsNotMistakenForTheDrug() {
        // Regression: an "Rx — <pharmacy>" title line must not shadow the real Drug line.
        String ocr = """
                Rx — Downtown Pharmacy
                Drug: Atorvastatin 20mg
                """;
        ScriptData d = parser.parse(ocr);
        assertEquals("Atorvastatin 20mg", d.drugName());
    }
}
