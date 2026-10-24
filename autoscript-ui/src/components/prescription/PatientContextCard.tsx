import type { Allergy, PatientContext } from "@/lib/shared";
import { ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ageFromDob, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Chip tone per recorded allergy severity. Adding a severity to the shared schema fails to compile here until it is mapped. */
const ALLERGY_SEVERITY_TONE: Record<Allergy["severity"], string> = {
  SEVERE: "bg-rose-50 text-rose-900 ring-rose-200",
  MODERATE: "bg-amber-50 text-amber-900 ring-amber-200",
  MILD: "bg-slate-100 text-slate-700 ring-slate-200",
  UNKNOWN: "bg-slate-100 text-slate-600 ring-slate-200",
};

interface PatientContextCardProps {
  patient: PatientContext | null;
  /** Patient name as read from the document, used to explain an unmatched record. */
  documentPatientName: string | null;
  className?: string;
}

/**
 * Always-visible patient record. In a narrow side column it stacks vertically; when it has
 * room (container ≥ 36rem) the identity block and the three lists spread across one row.
 */
export function PatientContextCard({ patient, documentPatientName, className }: PatientContextCardProps) {
  if (!patient) return <NoPatientCard documentPatientName={documentPatientName} className={className} />;

  const active = patient.medications.filter((m) => m.active);
  return (
    <Card size="sm" className={cn("@container", className)}>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <UserRound className="size-4 text-primary" aria-hidden />
          Patient record
        </CardTitle>
        <CardAction>
          <AllergyVerifiedFlag verified={patient.allergiesVerified} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 @md:grid-cols-2 @2xl:grid-cols-[1.1fr_1fr_1fr_1fr]">
        <Identity patient={patient} />

        <Section title="Allergies" count={patient.allergies.length}>
          {patient.allergies.length === 0 ? (
            <p className="text-amber-800">No allergy entries recorded.</p>
          ) : (
            <ul className="space-y-1.5">
              {patient.allergies.map((a) => (
                <li key={a.id ?? a.substance}>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-medium">{a.substance}</span>
                    {a.severity !== "UNKNOWN" && (
                      <span className={cn("rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset", ALLERGY_SEVERITY_TONE[a.severity])}>{a.severity.toLowerCase()}</span>
                    )}
                  </div>
                  {a.reaction && <p className="text-xs text-muted-foreground">{a.reaction}{a.recordedAt ? ` (recorded ${a.recordedAt})` : ""}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Active medications" count={active.length}>
          {active.length === 0 ? <p className="text-muted-foreground">None on record.</p> : (
            <ul className="space-y-1">
              {active.map((m) => (
                <li key={m.id ?? m.name}>
                  <span className="font-medium">{m.name}</span>
                  {(m.dose || m.frequency) && <span className="text-muted-foreground">{m.dose ? ` ${m.dose}` : ""}{m.frequency ? `, ${m.frequency}` : ""}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Conditions" count={patient.conditions.length}>
          {patient.conditions.length === 0 ? <p className="text-muted-foreground">None on record.</p> : (
            <ul className="space-y-1">
              {patient.conditions.map((c) => (
                <li key={c.id ?? c.name} className={cn(c.status === "RESOLVED" && "text-muted-foreground")}>
                  {c.name}
                  {c.icd10 && <span className="ml-1.5 text-xs text-muted-foreground">{c.icd10}</span>}
                  {c.status === "RESOLVED" && <span className="ml-1.5 text-xs">(resolved)</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </CardContent>
    </Card>
  );
}

function NoPatientCard({ documentPatientName, className }: { documentPatientName: string | null; className?: string }) {
  return (
    <Card size="sm" className={cn("bg-amber-50/60 ring-amber-300/70", className)} role="status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldAlert className="size-4 text-amber-700" aria-hidden />
          Patient record
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="font-semibold text-amber-900">No patient record linked</p>
        <p className="text-amber-950/80">
          {documentPatientName ? `The document names "${documentPatientName}", but it was not matched to a patient profile.` : "The document did not identify the patient clearly."}
        </p>
        <p className="text-amber-950/80">Allergy, condition and demographic checks did not run. Interaction and duplicate checks ran against the prescription only, not against current medications.</p>
      </CardContent>
    </Card>
  );
}

function AllergyVerifiedFlag({ verified }: { verified: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        verified ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200",
      )}
      title={verified ? "Allergy list verified with the patient" : "Allergy list has not been verified with the patient"}
    >
      {verified ? <ShieldCheck className="size-3" aria-hidden /> : <ShieldAlert className="size-3" aria-hidden />}
      {verified ? "Allergies verified" : "Allergies unverified"}
    </span>
  );
}

function Identity({ patient }: { patient: PatientContext }) {
  const age = ageFromDob(patient.dateOfBirth);
  const vitals = [
    patient.dateOfBirth ? `DOB ${patient.dateOfBirth}${age != null ? ` (${age} y)` : ""}` : "DOB not on record",
    patient.sex && patient.sex !== "UNKNOWN" ? patient.sex : null,
    patient.weightKg ? `${patient.weightKg} kg` : null,
  ].filter((v): v is string => v !== null);
  return (
    <div className="min-w-0">
      <p className="text-base font-semibold leading-tight">{patient.firstName} {patient.lastName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{vitals.join(" · ")}</p>
      {patient.phone && <p className="text-xs text-muted-foreground">{formatPhone(patient.phone)}</p>}
      {patient.renalFunctionNote && <p className="mt-1.5 rounded bg-muted/60 px-1.5 py-1 text-xs text-foreground/80">Renal: {patient.renalFunctionNote}</p>}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0 text-sm">
      <div className="mb-1.5 flex items-center justify-between border-b pb-1">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
      </div>
      {children}
    </section>
  );
}
