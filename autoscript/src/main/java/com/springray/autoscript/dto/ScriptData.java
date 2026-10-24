package com.springray.autoscript.dto;

/**
 * The set of prescription fields for a script.
 *
 * <p>Used both as the shape returned by autofill (extracted from an image) and as the
 * manual user entry submitted for review. Field constraints are enforced during
 * review; this record is a plain data carrier.
 */
public record ScriptData(
        String drugName,
        String directions,
        Integer quantity,
        Integer daySupply,
        Integer refillCount,
        String prescriberName,
        String prescriberNpi,
        String prescriberPhone
) {
}
