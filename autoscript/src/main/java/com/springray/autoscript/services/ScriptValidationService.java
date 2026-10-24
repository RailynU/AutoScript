package com.springray.autoscript.services;

import com.springray.autoscript.dto.Flag;
import com.springray.autoscript.dto.ReviewResult;
import com.springray.autoscript.dto.ScriptData;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class ScriptValidationService {

    private static final String STATUS_COMPLETED = "COMPLETED";

    public ReviewResult review(ScriptData extracted, ScriptData manualEntry) {
        List<Flag> flags = new ArrayList<>();
        return new ReviewResult(null, STATUS_COMPLETED, Instant.now(), List.copyOf(flags));
    }
}
