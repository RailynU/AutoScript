import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE, api } from "@/lib/api";
import { PageHeader } from "./PageHeader";

type Health = { ok: boolean; engine: boolean } | null;

function StatusLine({ label, ok, okText, badText, pending }: { label: string; ok: boolean; okText: string; badText: string; pending: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t py-2.5 first:border-t-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {pending ? (
        <span className="text-sm text-muted-foreground">Checking…</span>
      ) : (
        <span className={ok ? "inline-flex items-center gap-1.5 text-sm text-emerald-800" : "inline-flex items-center gap-1.5 text-sm text-rose-800"}>
          {ok ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
          {ok ? okText : badText}
        </span>
      )}
    </div>
  );
}

/** System status: API reachability and RX Engine health. */
export function SettingsPage() {
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setHealth(await api.health());
      setError(null);
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : "API unreachable");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="Settings"
        description="System status for this AutoScript workstation."
        actions={<Button variant="outline" onClick={() => void check()} disabled={checking}><RefreshCw data-icon="inline-start" className={checking ? "animate-spin" : undefined} />Re-check</Button>}
      />
      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
          <CardDescription className="font-mono text-xs">{API_BASE}</CardDescription>
        </CardHeader>
        <CardContent>
          <StatusLine label="AutoScript API" pending={checking} ok={!!health?.ok} okText="Online" badText={error ?? "Offline"} />
          <StatusLine label="RX Engine" pending={checking} ok={!!health?.engine} okText="Online" badText={health ? "Offline. Start it with pnpm dev in autoscript/." : "Unknown (API unreachable)"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>AI extraction and analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Reading scripts (including Autofill from image) and the contextual AI analysis use the OpenRouter key in <code className="rounded bg-muted px-1 font-mono text-xs">autoscript/.env</code> (<code className="rounded bg-muted px-1 font-mono text-xs">LLM_API_KEY</code>). Without it, uploads fail with an explicit error instead of guessing.
          </p>
          <p>AutoScript routes prescriptions to a pharmacist; it never approves them. &ldquo;No flags detected within checked criteria&rdquo; only means the checks that ran found nothing.</p>
        </CardContent>
      </Card>
    </div>
  );
}
