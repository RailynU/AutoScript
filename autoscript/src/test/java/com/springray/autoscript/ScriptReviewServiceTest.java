package com.springray.autoscript;

import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.dto.ScriptSummary;
import com.springray.autoscript.exception.InvalidScriptImageException;
import com.springray.autoscript.exception.ReviewFailedException;
import com.springray.autoscript.model.ScriptStatus;
import com.springray.autoscript.services.ExtractionService;
import com.springray.autoscript.services.ScriptQueue;
import com.springray.autoscript.services.ScriptReviewService;
import com.springray.autoscript.services.ScriptValidationService;
import com.springray.autoscript.support.ScriptTestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ScriptReviewServiceTest {

    private final ScriptQueue queue = new ScriptQueue();
    private final ExtractionService extractionService = mock(ExtractionService.class);
    private final ScriptValidationService validationService = mock(ScriptValidationService.class);
    private final ScriptReviewService service =
            new ScriptReviewService(queue, extractionService, validationService);

    private final MultipartFile image = ScriptTestFixtures.validPng();

    @Test
    void successMarksCompletedRestampsIdAndClearsQueue() {
        ScriptData manual = ScriptTestFixtures.fullScript();
        when(extractionService.extract(any())).thenReturn(ScriptTestFixtures.fullScript());
        // validation returns a result with a null scriptId, as the real service does
        when(validationService.review(any(), any()))
                .thenReturn(ReviewResult.of(null, "COMPLETED", Instant.now(), List.of()));

        ReviewResult result = service.review(image, manual);

        assertEquals("COMPLETED", result.status());
        assertEquals("1", result.scriptId(), "result should be re-stamped with the script id");
        assertTrue(queue.findByStatus(ScriptStatus.QUEUED).isEmpty(), "nothing should remain queued");
        assertEquals(1, queue.findByStatus(ScriptStatus.COMPLETED).size());
        // the persisted result is retrievable by id
        assertEquals(result, service.reviewResult("1").orElseThrow());
    }

    @Test
    void invalidImageMarksReviewFailedAndRethrows() {
        InvalidScriptImageException boom =
                new InvalidScriptImageException("UNSUPPORTED_FORMAT", "bad image");
        when(extractionService.extract(any())).thenThrow(boom);

        InvalidScriptImageException thrown = assertThrows(InvalidScriptImageException.class,
                () -> service.review(image, ScriptTestFixtures.fullScript()));

        assertSame(boom, thrown, "the original invalid-image exception should propagate unchanged");
        assertEquals(1, queue.findByStatus(ScriptStatus.REVIEW_FAILED).size());
        assertTrue(queue.findByStatus(ScriptStatus.QUEUED).isEmpty());
    }

    @Test
    void otherFailureMarksReviewFailedAndWraps() {
        when(extractionService.extract(any())).thenThrow(new RuntimeException("extraction blew up"));

        ReviewFailedException thrown = assertThrows(ReviewFailedException.class,
                () -> service.review(image, ScriptTestFixtures.fullScript()));

        assertTrue(thrown.getMessage().contains("could not be completed"));
        assertEquals(1, queue.findByStatus(ScriptStatus.REVIEW_FAILED).size());
        assertTrue(queue.findByStatus(ScriptStatus.QUEUED).isEmpty());
    }

    @Test
    void queuedListingOrderedBySubmissionAscending() {
        ScriptData d = ScriptTestFixtures.fullScript();
        queue.add(d);
        queue.add(d);
        queue.add(d);

        List<ScriptSummary> queued = service.queued();
        List<String> ids = queued.stream().map(ScriptSummary::id).toList();
        assertEquals(List.of("1", "2", "3"), ids, "queued oldest-first");
    }

    @Test
    void completedListingOrderedByCompletionDescending() {
        when(extractionService.extract(any())).thenReturn(ScriptTestFixtures.fullScript());
        when(validationService.review(any(), any()))
                .thenReturn(ReviewResult.of(null, "COMPLETED", Instant.now(), List.of()));

        service.review(image, ScriptTestFixtures.fullScript()); // id 1
        service.review(image, ScriptTestFixtures.fullScript()); // id 2

        List<String> ids = service.completed().stream().map(ScriptSummary::id).toList();
        assertEquals(List.of("2", "1"), ids, "completed most-recent-first");
    }

    @Test
    void reviewResultAbsentForUnknownId() {
        assertTrue(service.reviewResult("does-not-exist").isEmpty());
    }
}
