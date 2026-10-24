package com.springray.autoscript.model;

import org.springframework.web.multipart.MultipartFile;

import com.springray.autoscript.dto.ScriptData;

/**
 * Extracts structured {@link ScriptData} from an uploaded prescription image.
 *
 * <p>Implementations are selected by configuration:
 * <ul>
 *   <li>{@link PrescriptionExtractionModel} — real OpenAI vision extraction, active when
 *       {@code autoscript.ai.mode=openai} (the default when AI is enabled).</li>
 *   <li>{@link TesseractExtractionModel} — offline OCR extraction that reads the uploaded
 *       image locally, active when {@code autoscript.ai.mode=tesseract}. No API key.</li>
 * </ul>
 */
public interface PrescriptionExtractor {

    ScriptData extractPrescription(MultipartFile image);
}
