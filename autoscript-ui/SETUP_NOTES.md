# autoscript-ui

React single-page application (frontend) for the AutoScript pharmacy script reviewer.

- Framework: React + TypeScript
- Build tool: Vite
- Talks to the backend REST API served by the sibling `autoscript/` Spring Boot project.

## Status

This folder is a placeholder. The Vite project has not been generated yet because
Node.js / npm were not installed when the monorepo was scaffolded.

## How to scaffold (run once Node is installed)

From the repository root (`AutoScript/`):

```bash
# 1. Install Node (e.g. via nvm, Homebrew, or nodejs.org) — Node 20 LTS or newer recommended
# 2. Generate the Vite + React + TypeScript app into this folder:
npm create vite@latest autoscript-ui -- --template react-ts
cd autoscript-ui
npm install
npm run dev     # starts the dev server on http://localhost:5173
```

## Dev proxy to the backend

The Spring Boot API runs on `http://localhost:8080`. During development, configure
the Vite dev server to proxy API calls so the browser can call `/api/*` without CORS
issues. Add this to `vite.config.ts` after scaffolding:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```
