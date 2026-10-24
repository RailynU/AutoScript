package com.springray.autoscript.dto;

import java.time.Instant;
import java.util.List;

/**
 * Outcome of a script review.
 *
 * Invariants honored (from the RxGuardian spec):
 *  • The system never says "safe". When there are no flags, {@code summary} is
 *    exactly {@link #NO_FINDINGS_SUMMARY}.
 *  • The engine routes to review; it never approves. A non-empty flags list
 *    means a pharmacist must look at it — there is no "approved" status here.
 */
public record ReviewResult(
        String scriptId,
        String status,
        Instant reviewedAt,
        List<Flag> flags,
        String summary
) {
    /** Required no-finding wording — must not imply the script is "safe". */
    public static final String NO_FINDINGS_SUMMARY = "No flags detected within checked criteria";

    /** Build a result, deriving the summary from whether any flags were raised. */
    public static ReviewResult of(String scriptId, String status, Instant reviewedAt, List<Flag> flags) {
        String summary = (flags == null || flags.isEmpty())
                ? NO_FINDINGS_SUMMARY
                : flags.size() + " item(s) require pharmacist review";
        return new ReviewResult(scriptId, status, reviewedAt, List.copyOf(flags == null ? List.of() : flags), summary);
    }
}
