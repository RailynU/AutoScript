
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Radio, ChevronDown } from "lucide-react";
import type { PrescriptionListItem } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, type ScenarioSummary } from "@/lib/api";

/** Simulates an incoming e-prescription event using one of the synthetic scenarios. */
export function SimulateMenu({ onCreated }: { onCreated: (rx: PrescriptionListItem) => void }) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => setScenarios([]));
  }, []);

  const run = async (key: string) => {
    setBusy(key);
    try {
      const rx = await api.simulate(key);
      onCreated(rx);
      toast.info("Incoming prescription received", { description: rx.externalRef });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not simulate");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" />}>
        <Radio data-icon="inline-start" />
        Simulate incoming
        <ChevronDown data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-1.5">
        <p className="px-2 pt-1.5 pb-2 text-xs text-muted-foreground">Sends a synthetic prescription through the real pipeline, as if it arrived from an e-prescribing feed.</p>
        <ul className="space-y-0.5">
          {scenarios.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run(s.key)}
                className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
              >
                <span className="block text-sm font-medium">{busy === s.key ? "Sending…" : s.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{s.description}</span>
              </button>
            </li>
          ))}
          {scenarios.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Scenarios unavailable (API offline).</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
