package com.springray.autoscript.dto;

/**
 * An identified issue with a script field raised during review.
 *
 * @param field       the name of the script field that failed a check
 * @param description human-readable explanation of the violated rule and expected format/range
 */
public record Flag(
        String field,
        String description
) {
}
