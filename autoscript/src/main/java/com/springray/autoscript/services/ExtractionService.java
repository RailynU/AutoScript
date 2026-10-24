package com.springray.autoscript.services;

import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.model.PrescriptionExtractionModel;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ExtractionService {

    private final PrescriptionExtractionModel extractionModel;

    public ExtractionService(PrescriptionExtractionModel extractionModel) {
        this.extractionModel = extractionModel;
    }

    public ScriptData extract(MultipartFile image) {
        return extractionModel.extractPrescription(image);
    }
}
