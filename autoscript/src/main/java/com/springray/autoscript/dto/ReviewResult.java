package com.springray.autoscript.dto;

import java.time.Instant;
import java.util.List;

public record ReviewResult(
        String scriptId,
        String status,
        Instant reviewedAt,
        List<Flag> flags
) {
}
