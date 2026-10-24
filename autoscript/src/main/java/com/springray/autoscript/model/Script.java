package com.springray.autoscript.model;

import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;

import java.time.Instant;

public class Script {

    private final String id;
    private final Instant submittedAt;

    private volatile ScriptStatus status;
    private volatile Instant reviewStartedAt;
    private volatile Instant completedAt;
    private volatile ScriptData data;
    private volatile ReviewResult reviewResult;

    public Script(String id, ScriptData data) {
        this.id = id;
        this.data = data;
        this.status = ScriptStatus.QUEUED;
        this.submittedAt = Instant.now();
    }

    public synchronized void markInReview() {
        if (status != ScriptStatus.QUEUED) {
            throw new IllegalStateException("Script " + id + " cannot start review from status " + status);
        }
        this.status = ScriptStatus.IN_REVIEW;
        this.reviewStartedAt = Instant.now();
    }

    public synchronized void markCompleted(ReviewResult result) {
        if (status != ScriptStatus.IN_REVIEW) {
            throw new IllegalStateException("Script " + id + " cannot complete from status " + status);
        }
        this.status = ScriptStatus.COMPLETED;
        this.reviewResult = result;
        this.completedAt = Instant.now();
    }

    public synchronized void markReviewFailed() {
        this.status = ScriptStatus.REVIEW_FAILED;
        this.completedAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public ScriptStatus getStatus() {
        return status;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getReviewStartedAt() {
        return reviewStartedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public ScriptData getData() {
        return data;
    }

    public void setData(ScriptData data) {
        this.data = data;
    }

    public ReviewResult getReviewResult() {
        return reviewResult;
    }
}
