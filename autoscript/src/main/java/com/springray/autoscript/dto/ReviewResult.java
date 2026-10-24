package com.springray.autoscript.dto;

import java.time.Instant;
import java.util.List;

/**
 * The structured result of a script review, returned to the frontend.
 *
 * Mirrors the Review_Result API contract: {@code scriptId}, {@code status},
 * {@code reviewedAt} (ISO-8601), and a {@code flags} array.
 *
 * @param scriptId   the identifier of the reviewed script
 * @param status     the final status (e.g. {@code COMPLETED})
 * @param reviewedAt when the review completed
 * @param flags      zero or more issues identified during review
 */
public record ReviewResult(
        String scriptId,
        String status,
        Instant reviewedAt,
        List<Flag> flags
) {
}
