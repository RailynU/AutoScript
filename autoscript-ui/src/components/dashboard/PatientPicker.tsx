
import { useEffect, useRef, useState } from "react";
import { Search, X, UserRound } from "lucide-react";
import type { PatientSummary } from "@/lib/shared";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { ageFromDob, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Search-as-you-type patient selector (name or phone). Optional: leaving it empty is a valid demo path. */
export function PatientPicker({ value, onChange }: { value: PatientSummary | null; onChange: (p: PatientSummary | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      api.patients(query).then((r) => { setResults(r); setActive(0); }).catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (value) {
    const age = ageFromDob(value.dateOfBirth);
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserRound className="size-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{value.firstName} {value.lastName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {value.dateOfBirth ? `DOB ${value.dateOfBirth}${age != null ? ` (${age})` : ""}` : "DOB unknown"}{value.phone ? ` · ${formatPhone(value.phone)}` : ""}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label="Clear patient">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          placeholder="Search by name or phone (optional)"
          className="pl-8"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (!open || results.length === 0) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); const p = results[active]; if (p) { onChange(p); setOpen(false); } }
            if (e.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls="patient-results"
          aria-autocomplete="list"
        />
      </div>
      {open && (
        <ul id="patient-results" role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md">
          {results.length === 0 && <li className="px-2 py-2 text-sm text-muted-foreground">No matching patients.</li>}
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => { onChange(p); setOpen(false); }}
                className={cn("flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm", i === active && "bg-muted")}
              >
                <span className="font-medium">{p.firstName} {p.lastName}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{p.dateOfBirth ?? "DOB unknown"}{p.phone ? ` · ${formatPhone(p.phone)}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
