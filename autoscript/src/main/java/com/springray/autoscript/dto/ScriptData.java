package com.springray.autoscript.dto;

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
