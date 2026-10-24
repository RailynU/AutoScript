# AutoScript

AutoScript is a pharmacy script reviewer demo application. Purpose is to simulate a system that
automatically handles script validation, reducing the probability of human error.

## Monorepo layout

This repository holds two sibling projects:

```
AutoScript/               # git repo root (remote: RailynU/AutoScript)
├── autoscript/           # Backend — Spring Boot REST API (Java 17, Maven)
├── autoscript-ui/        # Frontend — React + TypeScript SPA (Vite)
└── README.md            # This file
```

### Backend — `autoscript/`

Spring Boot REST JSON API that processes script uploads, queue management, autofill
extraction, and review checks.

```bash
cd autoscript
./mvnw spring-boot:run    # starts the API on http://localhost:8080
```

> Note: the run command is `./mvnw` (Maven wrapper).

### Frontend — `autoscript-ui/`

React SPA that renders the dashboard and script review views. See
`autoscript-ui/README.md` for scaffolding instructions (requires Node.js).

The frontend calls the backend under `/api/*`, proxied to `localhost:8080` in development.

## Development workflow

1. Start the backend: `cd autoscript && ./mvnw spring-boot:run`
2. Start the frontend: `cd autoscript-ui && npm run dev`
3. Open the URL printed by the Vite dev server.

