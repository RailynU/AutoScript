import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Phone, Plus, Search, UserPlus, UserRound, X } from "lucide-react";
import type { PatientContext, PatientSummary } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PatientFormFields } from "@/components/patients/PatientFormFields";
import { PatientContextCard } from "@/components/prescription/PatientContextCard";
import { useIntake } from "@/components/intake/IntakeProvider";
import { api, type PatientSearchParams } from "@/lib/api";
import { ageFromDob, formatPhone } from "@/lib/format";
import { EMPTY_PATIENT_FORM, formatDob, normalizePhone, toCreatePatient, type PatientFormValues } from "@/lib/patientForm";
import { cn } from "@/lib/utils";
import { ErrorBanner, PageHeader } from "./PageHeader";

const SEARCH_FIELDS: Array<{ key: keyof PatientSearchParams; label: string; placeholder: string }> = [
  { key: "firstName", label: "First name", placeholder: "e.g. Emily" },
  { key: "lastName", label: "Last name", placeholder: "e.g. Carter" },
  { key: "dob", label: "Date of birth", placeholder: "MM/DD/YYYY or partial" },
  { key: "phone", label: "Phone", placeholder: "Full or last 4 digits" },
];

const TIPS = [
  { title: "Partial search works", text: "Type “Rey” in Last name or “04/12” in Date of birth to find partial matches." },
  { title: "Shared phone numbers", text: "A parent may use their number for a child. All matches are shown with a warning." },
  { title: "Multiple matches are normal", text: "Common names or shared birth dates return several results. Confirm with a second identifier." },
];

function sharedPhones(patients: readonly PatientSummary[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of patients) {
    const k = normalizePhone(p.phone);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
}

function PatientResult({ patient, shared, onNewRx }: { patient: PatientSummary; shared: boolean; onNewRx: () => void }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<PatientContext | null>(null);
  const [loading, setLoading] = useState(false);
  const age = ageFromDob(patient.dateOfBirth);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !profile) {
      setLoading(true);
      try {
        setProfile(await api.patient(patient.id));
      } catch (err) {
        toast.error("Could not load the patient record", { description: err instanceof Error ? err.message : String(err) });
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <li className={cn("rounded-xl border bg-card", shared && "border-amber-300")}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserRound className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{patient.firstName} {patient.lastName}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>DOB {formatDob(patient.dateOfBirth)}{age != null ? ` (${age} y)` : ""}</span>
            {patient.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" aria-hidden />{formatPhone(patient.phone)}</span>}
            {shared && <span className="rounded bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200">Shared number</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void toggle()} aria-expanded={open}>
            {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronDown className={cn("transition-transform", open && "rotate-180")} data-icon="inline-start" />}
            Profile
          </Button>
          <Button size="sm" onClick={onNewRx}><Plus data-icon="inline-start" />New Rx</Button>
        </div>
      </div>
      {open && profile && (
        <div className="border-t p-3">
          <PatientContextCard patient={profile} documentPatientName={null} className="ring-0" />
        </div>
      )}
    </li>
  );
}

/** Patient lookup by any combination of name, DOB and phone, plus new-patient creation (allergies, NKDA, medications, conditions). */
export function PatientsPage() {
  const { openIntake } = useIntake();
  const [params, setParams] = useState<PatientSearchParams>({});
  const [results, setResults] = useState<PatientSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PatientFormValues>(EMPTY_PATIENT_FORM);

  const hasInput = Object.values(params).some((v) => v && v.trim());
  const shared = sharedPhones(results ?? []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasInput) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await api.searchPatients(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const clear = () => {
    setParams({});
    setResults(null);
    setError(null);
  };

  const openCreate = () => {
    setForm((f) => ({ ...f, firstName: params.firstName ?? f.firstName, lastName: params.lastName ?? f.lastName, dob: params.dob ?? f.dob, phone: params.phone ?? f.phone }));
    setShowCreate(true);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = toCreatePatient(form);
    if (typeof body === "string") { toast.error(body); return; }
    setCreating(true);
    try {
      const created = await api.createPatient(body);
      toast.success(`${created.firstName} ${created.lastName} created`, {
        action: { label: "New Rx", onClick: () => openIntake(created) },
      });
      setShowCreate(false);
      setForm(EMPTY_PATIENT_FORM);
      setResults([created]);
    } catch (err) {
      toast.error("Could not create patient", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Patients"
        description="Search by any combination of name, date of birth or phone number."
        actions={!showCreate && <Button variant="outline" onClick={openCreate}><UserPlus data-icon="inline-start" />New patient</Button>}
      />

      <Card>
        <CardContent>
          <form onSubmit={search} aria-label="Patient search" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SEARCH_FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1.5">
                  <Label htmlFor={`search-${f.key}`}>{f.label}</Label>
                  <Input id={`search-${f.key}`} value={params[f.key] ?? ""} placeholder={f.placeholder} autoComplete="off" onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {hasInput && <Button type="button" variant="ghost" onClick={clear}><X data-icon="inline-start" />Clear</Button>}
              <Button type="submit" disabled={!hasInput || searching}>
                {searching ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}
                {searching ? "Searching…" : "Search patients"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && <ErrorBanner message={error} />}

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="size-4 text-primary" aria-hidden />New patient</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="space-y-4">
              <PatientFormFields value={form} onChange={setForm} idPrefix="new-pt" />
              <p className="text-xs text-muted-foreground">Allergies, current medications and conditions drive the clinical checks. Record NKDA only after confirming with the patient.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
                <Button type="submit" disabled={creating || !form.firstName.trim() || !form.lastName.trim() || !form.dob.trim()}>{creating ? "Saving…" : "Create patient"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {results === null ? (
        !showCreate && (
          <ul className="grid gap-3 sm:grid-cols-3">
            {TIPS.map((t) => (
              <li key={t.title} className="rounded-xl border bg-card p-3 text-sm">
                <p className="font-medium">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.text}</p>
              </li>
            ))}
          </ul>
        )
      ) : (
        <section aria-label="Search results" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
            <p className="text-muted-foreground" aria-live="polite">
              {results.length === 0 ? "No patients matched." : <><span className="font-medium tabular-nums text-foreground">{results.length}</span> match{results.length === 1 ? "" : "es"}</>}
            </p>
            {results.length > 1 && <p className="text-xs text-amber-800">Multiple matches: confirm with a second identifier.</p>}
          </div>
          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center" role="status">
              <p className="text-sm font-medium">No patients matched your search.</p>
              <p className="mt-1 text-sm text-muted-foreground">Try fewer fields, check the spelling, or create the patient.</p>
              {!showCreate && <Button className="mt-4" size="sm" onClick={openCreate}><UserPlus data-icon="inline-start" />Create new patient</Button>}
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map((p) => (
                <PatientResult key={p.id} patient={p} shared={shared.has(normalizePhone(p.phone))} onNewRx={() => openIntake(p)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
