package com.springray.autoscript.model;

import com.springray.autoscript.dto.ScriptData;
import org.springframework.web.multipart.MultipartFile;

/**
 * Extracts structured {@link ScriptData} from an uploaded prescription image.
 *
 * <p>Implementations are selected by configuration:
 * <ul>
 *   <li>{@link PrescriptionExtractionModel} — real OpenAI vision extraction, active when
 *       {@code autoscript.ai.mode=openai} (the default when AI is enabled).</li>
 *   <li>{@link StubPrescriptionExtractionModel} — deterministic sample data for local
 *       development without an OpenAI key, active when {@code autoscript.ai.mode=stub}.</li>
 * </ul>
 */
public interface PrescriptionExtractor {

    ScriptData extractPrescription(MultipartFile image);
}
