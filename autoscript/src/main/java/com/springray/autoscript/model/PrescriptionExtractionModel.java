package com.springray.autoscript.model;

import java.io.IOException;
import java.io.UncheckedIOException;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.util.MimeType;
import org.springframework.util.MimeTypeUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.springray.autoscript.dto.ScriptData;

@Component
@ConditionalOnProperty(name = "autoscript.ai.mode", havingValue = "openai", matchIfMissing = true)
public class PrescriptionExtractionModel implements PrescriptionExtractor {

    private final ChatClient chatClient;
    private final PromptProvider promptProvider;

    public PrescriptionExtractionModel(ChatClient.Builder chatClientBuilder, PromptProvider promptProvider) {
        this.chatClient = chatClientBuilder.build();
        this.promptProvider = promptProvider;
    }

    @Override
    public ScriptData extractPrescription(MultipartFile image) {
        Resource imageResource = toResource(image);
        MimeType mimeType = resolveMimeType(image);

        return chatClient.prompt()
                .system(promptProvider.getSystemPrompt())
                .user(u -> u.text("Extract the prescription fields from this image.")
                        .media(mimeType, imageResource))
                .call()
                .entity(ScriptData.class);
    }

    private Resource toResource(MultipartFile image) {
        try {
            return new ByteArrayResource(image.getBytes()) {
                @Override
                public String getFilename() {
                    return image.getOriginalFilename();
                }
            };
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read uploaded script image", e);
        }
    }

    private MimeType resolveMimeType(MultipartFile image) {
        String contentType = image.getContentType();
        if (StringUtils.hasText(contentType)) {
            return MimeTypeUtils.parseMimeType(contentType);
        }
        return MimeTypeUtils.IMAGE_PNG;
    }
}
