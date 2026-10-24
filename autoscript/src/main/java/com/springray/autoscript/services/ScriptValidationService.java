package com.springray.autoscript.services;

import com.springray.autoscript.dto.Flag;
import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class ScriptValidationService {

    private static final String STATUS_COMPLETED = "COMPLETED";

    public ReviewResult review(ScriptData extracted, ScriptData manualEntry) {
        List<Flag> flags = new ArrayList<>();

        checkPatientFirstName(extracted, manualEntry).ifPresent(flags::add);
        checkPatientLastName(extracted, manualEntry).ifPresent(flags::add);
        checkPatientDateOfBirth(extracted, manualEntry).ifPresent(flags::add);
        checkDrugName(extracted, manualEntry).ifPresent(flags::add);
        checkDirections(extracted, manualEntry).ifPresent(flags::add);
        checkQuantity(extracted, manualEntry).ifPresent(flags::add);
        checkDaySupply(extracted, manualEntry).ifPresent(flags::add);
        checkRefillCount(extracted, manualEntry).ifPresent(flags::add);
        checkPrescriberName(extracted, manualEntry).ifPresent(flags::add);
        checkPrescriberNpi(extracted, manualEntry).ifPresent(flags::add);
        checkPrescriberPhone(extracted, manualEntry).ifPresent(flags::add);

        return ReviewResult.of(null, STATUS_COMPLETED, Instant.now(), flags);
    }

    private Optional<Flag> checkPatientFirstName(ScriptData extracted, ScriptData manualEntry) {
        return compareText("patientFirstName", "patient first name",
                extracted.patientFirstName(), manualEntry.patientFirstName());
    }

    private Optional<Flag> checkPatientLastName(ScriptData extracted, ScriptData manualEntry) {
        return compareText("patientLastName", "patient last name",
                extracted.patientLastName(), manualEntry.patientLastName());
    }

    private Optional<Flag> checkPatientDateOfBirth(ScriptData extracted, ScriptData manualEntry) {
        return compareValue("patientDateOfBirth", "patient date of birth",
                extracted.patientDateOfBirth(), manualEntry.patientDateOfBirth());
    }

    private Optional<Flag> checkDrugName(ScriptData extracted, ScriptData manualEntry) {
        return compareText("drugName", "drug name",
                extracted.drugName(), manualEntry.drugName());
    }

    private Optional<Flag> checkDirections(ScriptData extracted, ScriptData manualEntry) {
        return compareText("directions", "directions",
                extracted.directions(), manualEntry.directions());
    }

    private Optional<Flag> checkQuantity(ScriptData extracted, ScriptData manualEntry) {
        return compareValue("quantity", "quantity",
                extracted.quantity(), manualEntry.quantity());
    }

    private Optional<Flag> checkDaySupply(ScriptData extracted, ScriptData manualEntry) {
        return compareValue("daySupply", "day supply",
                extracted.daySupply(), manualEntry.daySupply());
    }

    private Optional<Flag> checkRefillCount(ScriptData extracted, ScriptData manualEntry) {
        return compareValue("refillCount", "refill count",
                extracted.refillCount(), manualEntry.refillCount());
    }

    private Optional<Flag> checkPrescriberName(ScriptData extracted, ScriptData manualEntry) {
        return compareText("prescriberName", "prescriber name",
                extracted.prescriberName(), manualEntry.prescriberName());
    }

    private Optional<Flag> checkPrescriberNpi(ScriptData extracted, ScriptData manualEntry) {
        return compareDigits("prescriberNpi", "prescriber NPI",
                extracted.prescriberNpi(), manualEntry.prescriberNpi());
    }

    private Optional<Flag> checkPrescriberPhone(ScriptData extracted, ScriptData manualEntry) {
        return compareDigits("prescriberPhone", "prescriber phone number",
                extracted.prescriberPhone(), manualEntry.prescriberPhone());
    }

    private Optional<Flag> compareText(String field, String label, String extracted, String manual) {
        String normalizedExtracted = normalizeText(extracted);
        String normalizedManual = normalizeText(manual);
        if (Objects.equals(normalizedExtracted, normalizedManual)) {
            return Optional.empty();
        }
        return Optional.of(mismatch(field, label, extracted, manual));
    }

    private Optional<Flag> compareDigits(String field, String label, String extracted, String manual) {
        String normalizedExtracted = normalizeDigits(extracted);
        String normalizedManual = normalizeDigits(manual);
        if (Objects.equals(normalizedExtracted, normalizedManual)) {
            return Optional.empty();
        }
        return Optional.of(mismatch(field, label, extracted, manual));
    }

    private <T> Optional<Flag> compareValue(String field, String label, T extracted, T manual) {
        if (Objects.equals(extracted, manual)) {
            return Optional.empty();
        }
        return Optional.of(mismatch(field, label,
                extracted == null ? null : extracted.toString(),
                manual == null ? null : manual.toString()));
    }

    private Flag mismatch(String field, String label, String extracted, String manual) {
        String description = "The entered %s (%s) does not match the %s on the script (%s)."
                .formatted(label, displayValue(manual), label, displayValue(extracted));
        // Deterministic field comparison → severity decided by the rule, not the model.
        return Flag.rule(field, description);
    }

    private String normalizeText(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim().replaceAll("\\s+", " ").toLowerCase();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeDigits(String value) {
        if (value == null) {
            return null;
        }
        String digits = value.replaceAll("\\D", "");
        return digits.isEmpty() ? null : digits;
    }

    private String displayValue(String value) {
        return value == null || value.isBlank() ? "blank" : value;
    }
}
