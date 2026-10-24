package com.springray.autoscript.dto;

import java.time.LocalDate;

public record ScriptData(
        String patientFirstName,
        String patientLastName,
        LocalDate patientDateOfBirth,
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
