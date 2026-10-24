package com.springray.autoscript;

import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.exception.ExtractionFailedException;
import com.springray.autoscript.exception.InvalidScriptImageException;
import com.springray.autoscript.model.PrescriptionExtractionModel;
import com.springray.autoscript.services.ExtractionService;
import com.springray.autoscript.support.ScriptTestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ExtractionServiceTest {

    private final PrescriptionExtractionModel model = mock(PrescriptionExtractionModel.class);
    private final ExtractionService service = new ExtractionService(model);

    @Test
    void missingFileIsRejected() {
        InvalidScriptImageException ex = assertThrows(InvalidScriptImageException.class,
                () -> service.extract(null));
        assertEquals("FILE_MISSING", ex.getErrorCode());
        verifyNoInteractions(model);
    }

    @Test
    void emptyFileIsRejected() {
        InvalidScriptImageException ex = assertThrows(InvalidScriptImageException.class,
                () -> service.extract(ScriptTestFixtures.emptyUpload()));
        assertEquals("FILE_MISSING", ex.getErrorCode());
        verifyNoInteractions(model);
    }

    @Test
    void oversizedFileIsRejected() {
        InvalidScriptImageException ex = assertThrows(InvalidScriptImageException.class,
                () -> service.extract(ScriptTestFixtures.oversized()));
        assertEquals("FILE_TOO_LARGE", ex.getErrorCode());
        verifyNoInteractions(model);
    }

    @Test
    void unsupportedContentTypeIsRejected() {
        InvalidScriptImageException ex = assertThrows(InvalidScriptImageException.class,
                () -> service.extract(ScriptTestFixtures.wrongType()));
        assertEquals("UNSUPPORTED_FORMAT", ex.getErrorCode());
        verifyNoInteractions(model);
    }

    @Test
    void missingContentTypeIsRejected() {
        InvalidScriptImageException ex = assertThrows(InvalidScriptImageException.class,
                () -> service.extract(ScriptTestFixtures.noContentType()));
        assertEquals("UNSUPPORTED_FORMAT", ex.getErrorCode());
        verifyNoInteractions(model);
    }

    @Test
    void validPngDelegatesToModelAndReturnsResult() {
        ScriptData extracted = ScriptTestFixtures.fullScript();
        when(model.extractPrescription(any())).thenReturn(extracted);

        MultipartFile image = ScriptTestFixtures.validPng();
        ScriptData result = service.extract(image);

        assertSame(extracted, result);
        verify(model).extractPrescription(image);
    }

    @Test
    void jpegAndPdfAreAlsoAccepted() {
        when(model.extractPrescription(any())).thenReturn(ScriptTestFixtures.fullScript());

        service.extract(ScriptTestFixtures.validJpeg());
        service.extract(ScriptTestFixtures.validPdf());

        verify(model, org.mockito.Mockito.times(2)).extractPrescription(any());
    }

    @Test
    void modelExceptionIsWrappedAsExtractionFailed() {
        RuntimeException modelFailure = new RuntimeException("model unavailable");
        when(model.extractPrescription(any())).thenThrow(modelFailure);

        ExtractionFailedException ex = assertThrows(ExtractionFailedException.class,
                () -> service.extract(ScriptTestFixtures.validPng()));
        assertSame(modelFailure, ex.getCause(), "original model failure should be preserved as the cause");
    }
}
