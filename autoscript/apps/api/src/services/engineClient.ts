import type { AnalyzeRequest, ExtractedPrescription } from "@autoscript/shared";

export interface EngineClient {
  /** Submit a job. Resolves when the engine has accepted (202) the request. */
  submit(request: AnalyzeRequest): Promise<void>;
  health(): Promise<boolean>;
  /** Read a script without screening it (AutoScript autofill). Optional so test fakes can omit it. */
  extract?(file: { fileName: string; mimeType: string; base64: string }): Promise<ExtractedPrescription>;
}

export class HttpEngineClient implements EngineClient {
  constructor(private readonly baseUrl: string) {}

  async submit(request: AnalyzeRequest): Promise<void> {
    const res = await fetch(`${this.baseUrl}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`RX Engine rejected job (${res.status}): ${body.slice(0, 300)}`);
    }
  }

  async extract(file: { fileName: string; mimeType: string; base64: string }): Promise<ExtractedPrescription> {
    const res = await fetch(`${this.baseUrl}/extract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(file),
      signal: AbortSignal.timeout(120_000),
    });
    const body = (await res.json().catch(() => ({}))) as { extraction?: ExtractedPrescription; error?: string };
    if (!res.ok || !body.extraction) {
      throw Object.assign(new Error(body.error ?? `RX Engine extract failed (${res.status})`), { statusCode: 502 });
    }
    return body.extraction;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3_000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
