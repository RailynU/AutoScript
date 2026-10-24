package com.springray.autoscript.services;

import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.dto.ScriptSummary;
import com.springray.autoscript.exception.InvalidScriptImageException;
import com.springray.autoscript.exception.ReviewFailedException;
import com.springray.autoscript.model.Script;
import com.springray.autoscript.model.ScriptStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class ScriptReviewService {

    private final ScriptQueue scriptQueue;
    private final ExtractionService extractionService;
    private final ScriptValidationService scriptValidationService;

    public ScriptReviewService(ScriptQueue scriptQueue,
                               ExtractionService extractionService,
                               ScriptValidationService scriptValidationService) {
        this.scriptQueue = scriptQueue;
        this.extractionService = extractionService;
        this.scriptValidationService = scriptValidationService;
    }

    public ReviewResult review(MultipartFile image, ScriptData manualEntry) {
        Script script = scriptQueue.add(manualEntry);
        Script pulled = scriptQueue.pull(script.getId())
                .orElseThrow(() -> new ReviewFailedException(
                        "No queued script was available to review.", null));
        try {
            ScriptData extracted = extractionService.extract(image);
            ReviewResult result = scriptValidationService.review(extracted, manualEntry);
            ReviewResult persisted = new ReviewResult(
                    pulled.getId(), result.status(), result.reviewedAt(), result.flags());
            pulled.markCompleted(persisted);
            return persisted;
        } catch (InvalidScriptImageException e) {
            pulled.markReviewFailed();
            throw e;
        } catch (Exception e) {
            pulled.markReviewFailed();
            throw new ReviewFailedException(
                    "The script review could not be completed for script " + pulled.getId() + ".", e);
        } finally {
            scriptQueue.pop(pulled.getId());
        }
    }

    public List<ScriptSummary> queued() {
        return summaries(ScriptStatus.QUEUED, Comparator.comparing(Script::getSubmittedAt));
    }

    public List<ScriptSummary> inReview() {
        return summaries(ScriptStatus.IN_REVIEW, Comparator.comparing(Script::getReviewStartedAt));
    }

    public List<ScriptSummary> completed() {
        return scriptQueue.findByStatus(ScriptStatus.COMPLETED).stream()
                .sorted(Comparator.comparing(Script::getCompletedAt).reversed())
                .map(ScriptSummary::from)
                .toList();
    }

    public Optional<ReviewResult> reviewResult(String id) {
        return scriptQueue.find(id).map(Script::getReviewResult);
    }

    private List<ScriptSummary> summaries(ScriptStatus status, Comparator<Script> order) {
        return scriptQueue.findByStatus(status).stream()
                .sorted(order)
                .map(ScriptSummary::from)
                .toList();
    }
}
