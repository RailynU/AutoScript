package com.springray.autoscript;

import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.model.Script;
import com.springray.autoscript.model.ScriptStatus;
import com.springray.autoscript.services.ScriptQueue;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScriptQueueTest {

    private final ScriptQueue queue = new ScriptQueue();

    private ScriptData sample() {
        return new ScriptData("A", "B", null, "Drug", "dir", 1, 1, 0, "Dr", "1", "2");
    }

    @Test
    void addEnqueuesAsQueued() {
        Script script = queue.add(sample());
        assertEquals(ScriptStatus.QUEUED, script.getStatus());
        assertTrue(queue.hasQueued());
        assertEquals(1, queue.findByStatus(ScriptStatus.QUEUED).size());
    }

    @Test
    void pullMovesToInReviewInFifoOrder() {
        Script first = queue.add(sample());
        queue.add(sample());

        Script pulled = queue.pull().orElseThrow();
        assertEquals(first.getId(), pulled.getId());
        assertEquals(ScriptStatus.IN_REVIEW, pulled.getStatus());
        assertEquals(1, queue.findByStatus(ScriptStatus.QUEUED).size());
    }

    @Test
    void pullByIdTargetsSpecificScript() {
        queue.add(sample());
        Script second = queue.add(sample());

        Script pulled = queue.pull(second.getId()).orElseThrow();
        assertEquals(second.getId(), pulled.getId());
        assertEquals(ScriptStatus.IN_REVIEW, pulled.getStatus());
    }

    @Test
    void popRemovesFromActiveQueueButRetainsScript() {
        Script script = queue.add(sample());
        queue.pull(script.getId());
        queue.pop(script.getId());
        assertTrue(queue.find(script.getId()).isPresent(), "completed script should remain queryable");
        assertFalse(queue.hasQueued());
    }

    @Test
    void removeFullyDeletesScript() {
        Script script = queue.add(sample());
        queue.remove(script.getId());
        assertTrue(queue.find(script.getId()).isEmpty());
    }

    @Test
    void completedTransitionRecordsResult() {
        Script script = queue.add(sample());
        queue.pull(script.getId());
        ReviewResult result = new ReviewResult(script.getId(), "COMPLETED", Instant.now(), List.of());
        script.markCompleted(result);
        assertEquals(ScriptStatus.COMPLETED, script.getStatus());
        assertEquals(result, script.getReviewResult());
    }
}
