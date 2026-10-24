package com.springray.autoscript.model;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class PromptProvider {

    private static final String PROMPT_LOCATION_PATTERN = "classpath:prompts/prompt*.txt";
    private static final Pattern PROMPT_NAME_PATTERN = Pattern.compile("prompt(\\d+)\\.txt$");

    private final Integer configuredPrompt;
    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();

    public PromptProvider(@Value("${autoscript.extraction.prompt:0}") Integer configuredPrompt) {
        this.configuredPrompt = configuredPrompt;
    }

    public String getSystemPrompt() {
        TreeMap<Integer, Resource> prompts = loadPrompts();
        if (prompts.isEmpty()) {
            throw new IllegalStateException("No prompt files found under prompts/ (expected prompt<N>.txt)");
        }

        Resource selected = (configuredPrompt != null && configuredPrompt > 0)
                ? Optional.ofNullable(prompts.get(configuredPrompt)).orElseThrow(() ->
                        new IllegalStateException("Configured prompt " + configuredPrompt + " not found"))
                : prompts.firstEntry().getValue();

        return read(selected);
    }

    private TreeMap<Integer, Resource> loadPrompts() {
        TreeMap<Integer, Resource> prompts = new TreeMap<>();
        try {
            for (Resource resource : resolver.getResources(PROMPT_LOCATION_PATTERN)) {
                String filename = resource.getFilename();
                if (filename == null) {
                    continue;
                }
                Matcher matcher = PROMPT_NAME_PATTERN.matcher(filename);
                if (matcher.find()) {
                    prompts.put(Integer.parseInt(matcher.group(1)), resource);
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load prompt files", e);
        }
        return prompts;
    }

    private String read(Resource resource) {
        try {
            return StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read prompt file: " + resource.getFilename(), e);
        }
    }
}
