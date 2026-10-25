// ─────────────────────────────────────────────────────────────────────────────
// Central HTTP client. Every backend call goes through here so there is one place
// that owns the base URL and error handling.
//
// Override the base URL at build time with VITE_API_BASE. Defaults to the local
// AutoScript API (every route lives under /api).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CreatePatient,
  CreateReview,
  DashboardStats,
  EnteredScriptData,
  ExtractedPrescription,
  PatientContext,
  PatientSummary,
  PrescriptionDetail,
  PrescriptionListItem,
} from "@/lib/shared";

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8080/api";

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new ApiError(`Cannot reach the AutoScript API at ${API_BASE}. Is the API running on port 8080?`, 0);
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string; issues?: Array<{ path: string; message: string }> };
      if (body.error ?? body.message) message = (body.error ?? body.message)!;
      if (body.issues?.length) message += `: ${body.issues.map((i) => `${i.path} ${i.message}`).join(", ")}`;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function toQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v.trim() !== "") sp.set(k, v.trim());
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface ScenarioSummary {
  key: string;
  title: string;
  description: string;
  patientExternalId: string | null;
  expectedOutcome: string;
}

export interface PatientSearchParams {
  firstName?: string;
  lastName?: string;
  /** MM/DD/YYYY, ISO, or a fragment such as "04/12". */
  dob?: string;
  phone?: string;
}

export interface ExtractResult {
  /** Form-ready fields for the manual-entry step. */
  scriptData: EnteredScriptData;
  extraction: ExtractedPrescription;
}

export const api = {
  health: () => request<{ ok: boolean; engine: boolean }>("/health"),
  stats: () => request<DashboardStats>("/stats"),
  prescriptions: () => request<{ prescriptions: PrescriptionListItem[] }>("/prescriptions").then((r) => r.prescriptions),
  prescription: (id: string) => request<{ prescription: PrescriptionDetail }>(`/prescriptions/${id}`).then((r) => r.prescription),
  /** Free-text search (name or phone). */
  patients: (q: string) => request<{ patients: PatientSummary[] }>(`/patients?q=${encodeURIComponent(q)}`).then((r) => r.patients),
  /** Field search: any combination of first/last name, DOB and phone; partial matches. */
  searchPatients: (params: PatientSearchParams) =>
    request<{ patients: PatientSummary[] }>(`/patients${toQuery({ ...params, limit: "50" })}`).then((r) => r.patients),
  patient: (id: string) => request<{ patient: PatientContext }>(`/patients/${id}`).then((r) => r.patient),
  createPatient: (body: CreatePatient) => request<{ patient: PatientContext }>("/patients", json(body)).then((r) => r.patient),
  scenarios: () => request<{ scenarios: ScenarioSummary[] }>("/scenarios").then((r) => r.scenarios),
  createText: (text: string, patientId: string | null) =>
    request<{ prescription: PrescriptionListItem }>("/prescriptions/text", json({ text, patientId })).then((r) => r.prescription),
  /** Script file plus the technician's entry (`enteredData`), verified against the script by the engine. */
  upload: (file: File, patientId: string | null, enteredData: EnteredScriptData | null = null) => {
    const form = new FormData();
    if (patientId) form.append("patientId", patientId);
    if (enteredData) form.append("enteredData", JSON.stringify(enteredData));
    form.append("file", file);
    return request<{ prescription: PrescriptionListItem }>("/prescriptions/upload", { method: "POST", body: form }).then((r) => r.prescription);
  },
  /** Reads the script without screening it (Autofill from image). */
  extract: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ExtractResult>("/prescriptions/extract", { method: "POST", body: form });
  },
  simulate: (scenarioKey: string) =>
    request<{ prescription: PrescriptionListItem }>("/prescriptions/simulate", json({ scenarioKey })).then((r) => r.prescription),
  retry: (id: string) => request<{ prescription: PrescriptionListItem }>(`/prescriptions/${id}/retry`, { method: "POST" }).then((r) => r.prescription),
  review: (id: string, body: CreateReview) =>
    request<{ prescription: PrescriptionDetail }>(`/prescriptions/${id}/reviews`, json(body)).then((r) => r.prescription),
  fileUrl: (id: string) => `${API_BASE}/prescriptions/${id}/file`,
  eventsUrl: () => `${API_BASE}/events`,
};
