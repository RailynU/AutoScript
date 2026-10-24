package com.springray.autoscript.dto;

/**
 * A single issue raised during script review.
 *
 * severitySource mirrors the RxGuardian invariant that deterministic rules —
 * not the model — decide severity for rule findings. Field-comparison flags
 * from {@code ScriptValidationService} are always RULE_TABLE.
 */
public record Flag(
        String field,
        String description,
        String severitySource
) {
    public static final String SOURCE_RULE_TABLE = "RULE_TABLE";

    /** Convenience for deterministic rule flags (severity decided by the rule). */
    public static Flag rule(String field, String description) {
        return new Flag(field, description, SOURCE_RULE_TABLE);
    }
}
