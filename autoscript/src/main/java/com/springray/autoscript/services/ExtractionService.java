package com.springray.autoscript.services;

import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.exception.ExtractionFailedException;
import com.springray.autoscript.exception.InvalidScriptImageException;
import com.springray.autoscript.model.PrescriptionExtractionModel;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.util.Set;

@Service
public class ExtractionService {

    private static final long MAX_FILE_SIZE_BYTES = 10L * 1024 * 1024;
    private static final Set<String> ACCEPTED_CONTENT_TYPES = Set.of(
            "image/jpeg", "image/png", "application/pdf");

    private final PrescriptionExtractionModel extractionModel;

    public ExtractionService(PrescriptionExtractionModel extractionModel) {
        this.extractionModel = extractionModel;
    }

    public ScriptData extract(MultipartFile image) {
        validate(image);
        try {
            return extractionModel.extractPrescription(image);
        } catch (Exception e) {
            throw new ExtractionFailedException("Prescription extraction could not be completed.", e);
        }
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
