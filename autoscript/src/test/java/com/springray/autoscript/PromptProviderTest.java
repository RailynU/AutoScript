package com.springray.autoscript;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.Test;

import com.springray.autoscript.model.PromptProvider;

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

    @Test
    void negativeAndNullConfigFallBackToLowest() {
        assertFalse(new PromptProvider(-5).getSystemPrompt().isBlank(),
                "negative index should fall back to the lowest-numbered prompt");
        assertFalse(new PromptProvider(null).getSystemPrompt().isBlank(),
                "null index should fall back to the lowest-numbered prompt");
    }

    @Test
    void configuredIndexThatDoesNotExistFailsClearly() {
        PromptProvider provider = new PromptProvider(99);
        IllegalStateException ex = assertThrows(IllegalStateException.class, provider::getSystemPrompt);
        assertTrue(ex.getMessage().contains("99"),
                "error should name the missing configured prompt index");
    }
}
