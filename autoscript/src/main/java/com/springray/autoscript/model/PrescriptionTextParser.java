package com.springray.autoscript.model;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.springray.autoscript.dto.ScriptData;

/**
 * Parses raw OCR text from a prescription into structured {@link ScriptData}.
 *
 * <p>This is deliberately a pure, side-effect-free class so it can be unit tested without
 * invoking Tesseract. It is label-driven: it looks for common prescription field labels
 * ("Patient", "Drug", "Sig", "Qty", "NPI", …) and extracts the value that follows, tolerating
 * OCR noise such as extra whitespace, mixed case, and punctuation variance. Fields it cannot
 * confidently find are left {@code null} rather than guessed.
 */
public class PrescriptionTextParser {

    // All known labels, used as a "stop" boundary so a value capture ends when the next
    // labelled field begins on the same line (e.g. "Qty: 30  Days: 30  Refills: 2").
    // Order longest-first within alternations so e.g. "day supply" wins over "days".
    // Short/ambiguous aliases (e.g. bare "dr") are omitted — they match inside real words
    // like "Drug" and corrupt capture.
    private static final String ALL_LABELS =
            "patient name|patient|date\\s*of\\s*birth|d\\.o\\.b\\.?|dob|"
            + "drug name|medication|medicine|drug|"
            + "directions|instructions|sig|quantity|disp(?:ense)?|qty|"
            + "day\\s*supply|days\\s*supply|days|refills|refill|"
            + "prescriber|provider|physician|npi|telephone|phone|tel|ph";

    // Field labels → capture the value up to the next known label or end of line.
    // CASE_INSENSITIVE + MULTILINE so labels can be matched per line; a label may appear at
    // line start or mid-line (after whitespace). Separators ":" / "-" are optional.
    private static final Pattern PATIENT = field("patient(?:\\s*name)?");
    private static final Pattern DOB = field("(?:dob|date\\s*of\\s*birth|d\\.o\\.b\\.?)");
    // Note: "Rx" is intentionally NOT a drug alias — it is almost always a document
    // title ("Rx — Pharmacy Name"), which would shadow the real medication line.
    private static final Pattern DRUG = field("(?:drug|medication|medicine)(?:\\s*name)?");
    private static final Pattern SIG = field("(?:sig|directions|instructions)");
    private static final Pattern QTY = field("(?:qty|quantity|disp(?:ense)?)");
    private static final Pattern DAYS = field("(?:day\\s*supply|days\\s*supply|days)");
    private static final Pattern REFILLS = field("(?:refills?|rf)");
    private static final Pattern PRESCRIBER = field("(?:prescriber|provider|physician)");
    private static final Pattern NPI = field("npi");
    private static final Pattern PHONE = field("(?:phone|ph|tel|telephone)");

    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ofPattern("MM/dd/yyyy"),
            DateTimeFormatter.ofPattern("M/d/yyyy"),
            DateTimeFormatter.ofPattern("MM-dd-yyyy"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
    };

    public ScriptData parse(String ocrText) {
        String text = ocrText == null ? "" : ocrText;

        String patientFull = firstGroup(PATIENT, text);
        String[] name = splitName(patientFull);

        return new ScriptData(
                name[0],
                name[1],
                parseDate(firstGroup(DOB, text)),
                cleanOrNull(firstGroup(DRUG, text)),
                cleanOrNull(firstGroup(SIG, text)),
                parseInt(firstGroup(QTY, text)),
                parseInt(firstGroup(DAYS, text)),
                parseInt(firstGroup(REFILLS, text)),
                cleanOrNull(firstGroup(PRESCRIBER, text)),
                digitsOrNull(firstGroup(NPI, text), 10),
                digitsOrNull(firstGroup(PHONE, text), 10));
    }

    private static Pattern field(String label) {
        // A label starts at line-start or after whitespace and must end on a word boundary
        // (so "ph" won't match inside "Pharmacy" and "days" won't match inside "Fridays"),
        // followed by an optional ":"/"-" separator, then the value captured lazily up to
        // the next known label (also boundary-guarded) or end of line.
        return Pattern.compile(
                "(?:^|\\s)" + label + "\\b\\s*[:\\-]?\\s*(.+?)"
                        + "(?=\\s+(?:" + ALL_LABELS + ")\\b\\s*[:\\-]|$)",
                Pattern.CASE_INSENSITIVE | Pattern.MULTILINE);
    }

    private static String firstGroup(Pattern p, String text) {
        Matcher m = p.matcher(text);
        return m.find() ? m.group(1).trim() : null;
    }

    private static String cleanOrNull(String s) {
        if (s == null) return null;
        String cleaned = s.trim();
        return cleaned.isEmpty() ? null : cleaned;
    }

    /** Split a full name into [first, last]; last token is the surname, the rest the given name. */
    private static String[] splitName(String full) {
        if (full == null || full.isBlank()) return new String[]{null, null};
        String[] parts = full.trim().split("\\s+");
        if (parts.length == 1) return new String[]{parts[0], null};
        String last = parts[parts.length - 1];
        StringBuilder first = new StringBuilder();
        for (int i = 0; i < parts.length - 1; i++) {
            if (i > 0) first.append(' ');
            first.append(parts[i]);
        }
        return new String[]{first.toString(), last};
    }

    private static LocalDate parseDate(String raw) {
        if (raw == null) return null;
        // isolate the first date-like token from the line (strip trailing noise)
        Matcher m = Pattern.compile("(\\d{1,4}[/-]\\d{1,2}[/-]\\d{1,4})").matcher(raw);
        if (!m.find()) return null;
        String token = m.group(1);
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try {
                return LocalDate.parse(token, fmt);
            } catch (Exception ignored) {
                // try the next format
            }
        }
        return null;
    }

    private static Integer parseInt(String raw) {
        if (raw == null) return null;
        Matcher m = Pattern.compile("(\\d+)").matcher(raw);
        if (!m.find()) return null;
        try {
            return Integer.valueOf(m.group(1));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Strip non-digits; return null unless it yields the expected number of digits. */
    private static String digitsOrNull(String raw, int expectedLength) {
        if (raw == null) return null;
        String digits = raw.replaceAll("\\D", "");
        return digits.length() == expectedLength ? digits : (digits.isEmpty() ? null : digits);
    }
}
