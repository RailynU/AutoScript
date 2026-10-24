package com.springray.autoscript.model;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.springray.autoscript.dto.ScriptData;

import net.sourceforge.tess4j.ITesseract;
import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;

/**
 * Offline prescription extractor backed by Tesseract OCR.
 *
 * <p>Active when {@code autoscript.ai.mode=tesseract}. It reads the actual uploaded image
 * (or the first page of a PDF), runs Tesseract to get raw text, and delegates field parsing
 * to {@link PrescriptionTextParser}. No API key or network call is involved.
 *
 * <p>Requires the native Tesseract library and English training data on the host. The
 * {@code tessdata} directory is auto-detected from common install locations or can be set
 * with {@code autoscript.ocr.tessdata-path} / the {@code TESSDATA_PREFIX} env var.
 */
@Component
@ConditionalOnProperty(name = "autoscript.ai.mode", havingValue = "tesseract")
public class TesseractExtractionModel implements PrescriptionExtractor {

    private static final Logger log = LoggerFactory.getLogger(TesseractExtractionModel.class);

    /** Candidate tessdata locations tried in order when no explicit path is configured. */
    private static final String[] DEFAULT_TESSDATA_PATHS = {
            "/opt/homebrew/share/tessdata",   // Homebrew (Apple Silicon)
            "/usr/local/share/tessdata",       // Homebrew (Intel) / manual
            "/usr/share/tesseract-ocr/5/tessdata",
            "/usr/share/tessdata",
    };

    /** Candidate native-library dirs so JNA can locate libtesseract. */
    private static final String[] DEFAULT_NATIVE_LIB_PATHS = {
            "/opt/homebrew/lib",   // Homebrew (Apple Silicon)
            "/usr/local/lib",       // Homebrew (Intel) / manual
            "/usr/lib",
            "/usr/lib/x86_64-linux-gnu",
    };

    static {
        // JNA (used by tess4j) does not search Homebrew's /opt/homebrew/lib by default,
        // which causes "Unable to load library 'tesseract'". Prepend the first dir that
        // actually contains a libtesseract so the native load succeeds at runtime.
        ensureNativeLibraryPath();
    }

    private final PrescriptionTextParser parser = new PrescriptionTextParser();
    private final String tessdataPath;
    private final String language;

    public TesseractExtractionModel(
            @Value("${autoscript.ocr.tessdata-path:}") String configuredPath,
            @Value("${autoscript.ocr.language:eng}") String language) {
        this.tessdataPath = resolveTessdataPath(configuredPath);
        this.language = language;
        log.info("Tesseract extractor active (tessdata={}, lang={})", tessdataPath, language);
    }

    @Override
    public ScriptData extractPrescription(MultipartFile image) {
        BufferedImage rendered = toImage(image);
        String text = runOcr(rendered);
        log.debug("OCR text extracted ({} chars)", text.length());
        return parser.parse(text);
    }

    // ── OCR ──────────────────────────────────────────────────────────────────

    private String runOcr(BufferedImage image) {
        ITesseract tesseract = new Tesseract();
        if (tessdataPath != null) {
            tesseract.setDatapath(tessdataPath);
        }
        tesseract.setLanguage(language);
        // Page segmentation mode 3 = fully automatic (good default for whole documents).
        tesseract.setPageSegMode(3);
        try {
            return tesseract.doOCR(image);
        } catch (TesseractException e) {
            throw new IllegalStateException(
                    "Tesseract OCR failed. Ensure the native Tesseract library and "
                            + "'" + language + "' training data are installed "
                            + "(e.g. `brew install tesseract`).", e);
        }
    }

    // ── Image / PDF decoding ───────────────────────────────────────────────────

    private BufferedImage toImage(MultipartFile file) {
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new IllegalStateException("Could not read the uploaded file.", e);
        }

        if (isPdf(file)) {
            return renderFirstPdfPage(bytes);
        }
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(bytes));
            if (img == null) {
                throw new IllegalStateException(
                        "The uploaded file could not be decoded as an image.");
            }
            return img;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to decode the uploaded image.", e);
        }
    }

    private boolean isPdf(MultipartFile file) {
        String ct = file.getContentType();
        if (StringUtils.hasText(ct) && ct.toLowerCase().contains("pdf")) {
            return true;
        }
        String name = file.getOriginalFilename();
        return name != null && name.toLowerCase().endsWith(".pdf");
    }

    private BufferedImage renderFirstPdfPage(byte[] bytes) {
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            if (doc.getNumberOfPages() == 0) {
                throw new IllegalStateException("The uploaded PDF has no pages.");
            }
            // Render at 300 DPI — a good balance of OCR accuracy vs. speed.
            return new PDFRenderer(doc).renderImageWithDPI(0, 300);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to render the uploaded PDF for OCR.", e);
        }
    }

    // ── tessdata discovery ─────────────────────────────────────────────────────

    private static void ensureNativeLibraryPath() {
        String libDir = null;
        for (String candidate : DEFAULT_NATIVE_LIB_PATHS) {
            File dir = new File(candidate);
            if (!dir.isDirectory()) continue;
            File[] libs = dir.listFiles((d, n) ->
                    n.startsWith("libtesseract") && (n.endsWith(".dylib") || n.contains(".so")));
            if (libs != null && libs.length > 0) {
                libDir = candidate;
                break;
            }
        }
        if (libDir == null) return; // nothing found — let JNA use its own defaults

        String existing = System.getProperty("jna.library.path", "");
        if (!existing.contains(libDir)) {
            String merged = existing.isEmpty() ? libDir : libDir + File.pathSeparator + existing;
            System.setProperty("jna.library.path", merged);
            log.info("Added {} to jna.library.path for native Tesseract", libDir);
        }
    }

    private static String resolveTessdataPath(String configured) {
        if (StringUtils.hasText(configured)) {
            return configured;
        }
        String env = System.getenv("TESSDATA_PREFIX");
        if (StringUtils.hasText(env)) {
            return env;
        }
        for (String candidate : DEFAULT_TESSDATA_PATHS) {
            if (new java.io.File(candidate, "eng.traineddata").isFile()) {
                return candidate;
            }
        }
        // Fall back to Tesseract's own default search (returns null → let tess4j decide).
        log.warn("No tessdata directory auto-detected; relying on Tesseract defaults. "
                + "Set autoscript.ocr.tessdata-path if OCR fails.");
        return null;
    }
}
