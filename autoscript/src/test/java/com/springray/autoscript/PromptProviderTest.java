package com.springray.autoscript;

import com.springray.autoscript.model.PromptProvider;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PromptProviderTest {

    @Test
    void defaultsToLowestNumberedPrompt() {
        PromptProvider provider = new PromptProvider(0);
        String prompt = provider.getSystemPrompt();
        assertFalse(prompt.isBlank(), "prompt should not be blank");
        assertTrue(prompt.contains("prescription extraction assistant"),
                "default prompt should be the content of prompt1.txt");
    }

    @Test
    void explicitSelectionLoadsThatPrompt() {
        PromptProvider provider = new PromptProvider(1);
        String prompt = provider.getSystemPrompt();
        assertTrue(prompt.contains("prescriberNpi"),
                "prompt 1 should contain the NPI extraction rule");
    }
}
