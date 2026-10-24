# AutoScript UI

React 19 + TypeScript single-page app, built with Vite, for technicians and pharmacists using
AutoScript. It talks to the Node API in [`../autoscript`](../autoscript/README.md).

## Development

Start the backend first (`cd ../autoscript && pnpm dev`), then:

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |

## Connecting to the API

All requests go through `src/api/client.ts`, which prefixes paths with `API_BASE`:

- `API_BASE` comes from `VITE_API_BASE` and defaults to `http://localhost:8080/api`. The API
  enables CORS, so the default works without the proxy.
- `vite.config.ts` also proxies `/api` to `http://localhost:8080`. To route calls through the
  proxy instead, set `VITE_API_BASE=/api` in `.env` (copy `.env.example`).

`VITE_API_BASE` is read at build time; restart the dev server or rebuild after changing it.

## Pages

- **Dashboard** — queue overview with counts by screening and review status, recent prescriptions
  and review signals.
- **Intake** — upload a script (PDF, JPG or PNG), look up or create the patient, then enter the
  prescription details manually or autofill them from the image before submitting for screening.
- **Prescription detail** — the script preview, live processing progress, findings with severity
  and cited evidence, the data-entry check (what was typed vs. what is on the script), and the
  pharmacist review form with history.
- **Prescriptions** — searchable list of all prescriptions.
- **Patients** — patient lookup and profiles with allergies, conditions and medications.
- **Reviews** — the pharmacist work queue (open items, most severe first) and completed reviews.
- **Analytics** — screening and review metrics.
- **Settings** — API connection and engine status.

## Wording rules

The UI follows the product invariants: it never calls a prescription "safe", shows
"No flags detected within checked criteria" when nothing was found, and presents a pharmacist review
as a documented disposition, never as a dispensing approval. All data shown is synthetic.
