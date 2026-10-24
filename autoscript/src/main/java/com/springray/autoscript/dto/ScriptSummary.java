package com.springray.autoscript.dto;

import com.springray.autoscript.model.Script;

import java.time.Instant;

public record ScriptSummary(
        String id,
        String status,
        Instant submittedAt,
        Instant reviewStartedAt,
        Instant completedAt,
        String drugName,
        Integer quantity,
        Integer flagCount
) {
    public static ScriptSummary from(Script script) {
        ScriptData data = script.getData();
        ReviewResult result = script.getReviewResult();
        return new ScriptSummary(
                script.getId(),
                script.getStatus().name(),
                script.getSubmittedAt(),
                script.getReviewStartedAt(),
                script.getCompletedAt(),
                data == null ? null : data.drugName(),
                data == null ? null : data.quantity(),
                result == null ? null : result.flags().size()
        );
    }
}
