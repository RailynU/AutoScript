package com.springray.autoscript.support;

import com.springray.autoscript.dto.ScriptData;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDate;

/**
 * Shared builders and multipart helpers for backend unit/web tests.
 *
 * <p>Centralizes the {@link ScriptData} variants (matching, mismatching, null-field) and the
 * multipart fixtures (valid jpeg/png/pdf, oversized, wrong type, empty) referenced by the
 * backend test tasks so individual test classes stay focused on behavior.
 */
public final class ScriptTestFixtures {

    public static final long TEN_MB = 10L * 1024 * 1024;

    private ScriptTestFixtures() {
    }

    /** A fully populated, internally consistent script. */
    public static ScriptData fullScript() {
        return new ScriptData(
                "John", "Doe", LocalDate.of(1990, 1, 1),
                "Amoxicillin", "Take 1 tablet daily",
                30, 30, 2,
                "Dr. Smith", "1234567890", "5551234567");
    }

    /**
     * The same script as {@link #fullScript()} but with cosmetic-only differences in the text and
     * digit fields (case, whitespace, phone formatting) that normalization should ignore.
     */
    public static ScriptData cosmeticallyDifferentScript() {
        return new ScriptData(
                "  john ", "DOE", LocalDate.of(1990, 1, 1),
                "amoxicillin", "take 1  tablet   daily",
                30, 30, 2,
                "dr.   smith", "123-456-7890", "(555) 123-4567");
    }

    /** All fields null — useful for isolating a single differing field in a test. */
    public static ScriptData emptyScript() {
        return new ScriptData(null, null, null, null, null, null, null, null, null, null, null);
    }

    public static MockMultipartFile validPng() {
        return new MockMultipartFile("image", "script.png", "image/png", new byte[]{1, 2, 3});
    }

    public static MockMultipartFile validJpeg() {
        return new MockMultipartFile("image", "script.jpg", "image/jpeg", new byte[]{1, 2, 3});
    }

    public static MockMultipartFile validPdf() {
        return new MockMultipartFile("image", "script.pdf", "application/pdf", new byte[]{1, 2, 3});
    }

    public static MockMultipartFile emptyUpload() {
        return new MockMultipartFile("image", "script.png", "image/png", new byte[0]);
    }

    public static MockMultipartFile wrongType() {
        return new MockMultipartFile("image", "script.gif", "image/gif", new byte[]{1, 2, 3});
    }

    public static MockMultipartFile noContentType() {
        return new MockMultipartFile("image", "script", null, new byte[]{1, 2, 3});
    }

    /** A PNG that reports a size just over the 10 MB ceiling without allocating 10 MB of heap. */
    public static MockMultipartFile oversized() {
        return new MockMultipartFile("image", "big.png", "image/png", new byte[]{1}) {
            @Override
            public long getSize() {
                return TEN_MB + 1;
            }
        };
    }

    public static MockMultipartFile jsonPart(String name, String json) {
        return new MockMultipartFile(name, "", "application/json", json.getBytes());
    }
}
