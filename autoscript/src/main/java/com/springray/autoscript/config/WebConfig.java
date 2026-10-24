package com.springray.autoscript.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                // allowedOriginPatterns supports wildcards — any localhost port
                // (Vite may pick 5173, 5174, … if one is taken) plus 127.0.0.1.
                .allowedOriginPatterns(
                    "http://localhost:*",
                    "http://127.0.0.1:*"
                )
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(false);
    }
}
