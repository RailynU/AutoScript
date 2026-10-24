package com.springray.autoscript.services;

import java.util.Set;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.exception.ExtractionFailedException;
import com.springray.autoscript.exception.InvalidScriptImageException;
import com.springray.autoscript.model.PrescriptionExtractor;

@Service
@ConditionalOnProperty(name = "autoscript.ai.enabled", havingValue = "true")
public class ExtractionService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ExtractionService.class);

    private static final long MAX_FILE_SIZE_BYTES = 10L * 1024 * 1024;
    private static final Set<String> ACCEPTED_CONTENT_TYPES = Set.of(
            "image/jpeg", "image/png", "application/pdf");

    private final PrescriptionExtractor extractionModel;

    public ExtractionService(PrescriptionExtractor extractionModel) {
        this.extractionModel = extractionModel;
    }

    public ScriptData extract(MultipartFile image) {
        validate(image);
        try {
            return extractionModel.extractPrescription(image);
        } catch (Exception e) {
            // Log the real cause so failures are diagnosable, with secrets redacted.
            log.warn("Prescription extraction failed: {}", redactSecrets(rootCauseChain(e)));
            throw new ExtractionFailedException("Prescription extraction could not be completed.", e);
        }
    }

    /** Concise "Type: message <- Type: message" chain of causes. */
    private static String rootCauseChain(Throwable t) {
        StringBuilder sb = new StringBuilder();
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (sb.length() > 0) sb.append(" <- ");
            sb.append(c.getClass().getSimpleName()).append(": ").append(c.getMessage());
            if (c.getCause() == c) break;
        }
        return sb.toString();
    }

    /** Strip API keys / bearer tokens from text before it reaches logs. */
    static String redactSecrets(String s) {
        if (s == null) return null;
        return s.replaceAll("sk-[A-Za-z0-9_\\-]{8,}", "sk-***REDACTED***")
                .replaceAll("(?i)(bearer\\s+)[A-Za-z0-9._\\-]+", "$1***REDACTED***");
    }

    private void validate(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new InvalidScriptImageException("FILE_MISSING",
                    "No script image was provided.");
        }
        if (image.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new InvalidScriptImageException("FILE_TOO_LARGE",
                    "The script image exceeds the 10 MB maximum.");
        }
        String contentType = image.getContentType();
        if (!StringUtils.hasText(contentType) || !ACCEPTED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
            throw new InvalidScriptImageException("UNSUPPORTED_FORMAT",
                    "The script image must be a JPEG, PNG, or PDF file.");
        }
    }
}
