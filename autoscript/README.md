# autoscript (backend)

Spring Boot REST API for the AutoScript pharmacy script reviewer.

## Prescription extraction (LLM)

The `/api/scripts/autofill` and `/api/scripts/review` endpoints extract prescription
fields from an uploaded image using an LLM via Spring AI (OpenAI, model `gpt-4o-mini`).

### Required configuration

Set your OpenAI API key as an environment variable before running:

```bash
export OPENAI_API_KEY=sk-...
```

The app starts without the key, but extraction calls fail until it is set.
Image formats (PNG, JPEG) are sent directly to the vision model. PDF uploads are not
yet converted to images for extraction — treat PDF support as a known limitation.

## Run

```bash
./mvnw spring-boot:run
```

The API listens on http://localhost:8080.
