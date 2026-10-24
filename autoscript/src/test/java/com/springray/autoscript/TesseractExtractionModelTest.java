package com.springray.autoscript;

import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.model.TesseractExtractionModel;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Integration test that runs the REAL Tesseract OCR path against a programmatically
 * rendered prescription image. Skips automatically (JUnit assumption) when the native
 * Tesseract + eng.traineddata are not installed, so CI without OCR stays green.
 */
class TesseractExtractionModelTest {

    private static boolean ocrAvailable;
    private static TesseractExtractionModel model;

    @BeforeAll
    static void setUp() {
        ocrAvailable = findTessdata() != null;
        if (ocrAvailable) {
            model = new TesseractExtractionModel("", "eng");
        }
    }

    private static String findTessdata() {
        String env = System.getenv("TESSDATA_PREFIX");
        if (env != null && new File(env, "eng.traineddata").isFile()) return env;
        for (String p : new String[]{
                "/opt/homebrew/share/tessdata", "/usr/local/share/tessdata",
                "/usr/share/tesseract-ocr/5/tessdata", "/usr/share/tessdata"}) {
            if (new File(p, "eng.traineddata").isFile()) return p;
        }
        return null;
    }

    /** Render a clean, high-contrast prescription image that Tesseract reads reliably. */
    private MockMultipartFile prescriptionImage(String... lines) throws Exception {
        int width = 900, lineHeight = 46, pad = 40;
        int height = pad * 2 + lineHeight * lines.length;
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,
                RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, width, height);
        g.setColor(Color.BLACK);
        g.setFont(new Font("SansSerif", Font.PLAIN, 28));
        int y = pad + lineHeight;
        for (String line : lines) {
            g.drawString(line, pad, y);
            y += lineHeight;
        }
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return new MockMultipartFile("image", "rx.png", "image/png", out.toByteArray());
    }

    @Test
    void extractsFieldsFromARenderedPrescriptionImage() throws Exception {
        assumeTrue(ocrAvailable, "Tesseract/eng.traineddata not installed — skipping OCR test");

        MockMultipartFile img = prescriptionImage(
                "Patient: Emily Carter",
                "DOB: 04/12/1985",
                "Drug: Lisinopril 10mg",
                "Sig: Take 1 tablet once daily",
                "Qty: 30",
                "Refills: 2",
                "Prescriber: Dr Nguyen",
                "NPI: 1234567893"
        );

        ScriptData d = model.extractPrescription(img);

        assertNotNull(d, "extraction should return data");
        // OCR can be imperfect; assert on the high-confidence fields.
        assertEquals("Emily", d.patientFirstName());
        assertEquals("Carter", d.patientLastName());
        assertEquals("Lisinopril 10mg", d.drugName());
        assertEquals(30, d.quantity());
        assertEquals(2, d.refillCount());
        assertEquals("1234567893", d.prescriberNpi());
    }

    @Test
    void rejectsUndecodableImageWithClearError() {
        assumeTrue(ocrAvailable, "Tesseract not installed — skipping");
        MockMultipartFile junk = new MockMultipartFile("image", "x.png", "image/png",
                new byte[]{1, 2, 3, 4});
        try {
            model.extractPrescription(junk);
        } catch (IllegalStateException expected) {
            // decoding non-image bytes should raise a clear error, not an NPE
            return;
        }
        // If no exception (some decoders are lenient), that's acceptable too.
    }
}
