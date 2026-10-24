import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, FileText, FileUp, Image as ImageIcon, Loader2, Sparkles, UserPlus, UserRound, X } from "lucide-react";
import type { PatientSummary, PrescriptionListItem } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PatientFormFields } from "@/components/patients/PatientFormFields";
import { api } from "@/lib/api";
import { applyAutofill, EMPTY_ENTRY_FORM, entryFormComplete, entryFormError, toEnteredData, type EntryFormValues } from "@/lib/entryCheck";
import { ageFromDob } from "@/lib/format";
import { EMPTY_PATIENT_FORM, toCreatePatient, type PatientFormValues } from "@/lib/patientForm";
import { cn } from "@/lib/utils";
import { PatientPicker } from "./PatientPicker";

const ACCEPT = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 20 * 1024 * 1024;

type Step = "source" | "entry";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (rx: PrescriptionListItem) => void;
  /** Patient chosen before opening (e.g. "New Rx" on the Patients page). Read on mount; remount (key) to change it. */
  initialPatient?: PatientSummary | null;
}

/**
 * New prescription intake. Step 1 (as in the review queue): a file or pasted text plus the patient.
 * Step 2 (files only, AutoScript manual entry): the technician types the prescription next to the
 * image, optionally autofilled from it; the typed fields go to the engine as `enteredData` and are
 * verified against the script.
 */
export function UploadDialog({ open, onOpenChange, onCreated, initialPatient = null }: UploadDialogProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("source");
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [patient, setPatient] = useState<PatientSummary | null>(initialPatient);
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("source");
    setFile(null);
    setText("");
    setPatient(null);
    setMode("file");
    setCreatingPatient(false);
  };

  const pick = useCallback((f: File | null) => {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) { toast.error("Unsupported file type", { description: "Upload a PDF, JPG or PNG." }); return; }
    if (f.size > MAX_BYTES) { toast.error("File too large", { description: "Maximum size is 20 MB." }); return; }
    setFile(f);
  }, []);

  const finish = (rx: PrescriptionListItem) => {
    onCreated(rx);
    toast.info("Prescription received. Analysis started.", {
      description: rx.externalRef,
      action: { label: "Open", onClick: () => navigate(`/prescriptions/${rx.id}`) },
    });
    onOpenChange(false);
    reset();
  };

  const submitSource = async () => {
    setBusy(true);
    try {
      finish(mode === "file" ? await api.upload(file!, patient?.id ?? null) : await api.createText(text.trim(), patient?.id ?? null));
    } catch (err) {
      toast.error("Could not submit prescription", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const sourceReady = mode === "file" ? !!file : text.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", step === "entry" ? "sm:max-w-5xl" : "sm:max-w-xl")}>
        <DialogHeader>
          <DialogTitle>New prescription</DialogTitle>
          <DialogDescription>
            {step === "source"
              ? "Upload a document or paste the text. The RX Engine extracts it, runs the clinical rules and prepares a report for your review."
              : "Type the prescription exactly as written. AutoScript compares your entry with what it reads on the script and flags every mismatch."}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} fileMode={mode === "file"} />

        {step === "source" ? (
          <>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "file" | "text")}>
              <TabsList className="w-full">
                <TabsTrigger value="file"><FileUp data-icon="inline-start" />Upload file</TabsTrigger>
                <TabsTrigger value="text"><FileText data-icon="inline-start" />Paste text</TabsTrigger>
              </TabsList>
              <TabsContent value="file" className="pt-2">
                <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                {file ? (
                  <FileChip file={file} onRemove={() => setFile(null)} />
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0] ?? null); }}
                    className={cn("flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-9 text-center transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring", dragging && "border-primary bg-accent/60")}
                  >
                    <FileUp className="size-6 text-muted-foreground" />
                    <span className="text-sm font-medium">Drop a prescription here or click to choose</span>
                    <span className="text-xs text-muted-foreground">PDF, JPG or PNG up to 20 MB.</span>
                  </button>
                )}
              </TabsContent>
              <TabsContent value="text" className="pt-2">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder={"Patient: Jane Doe  DOB 1960-01-01\nRx: Ibuprofen 600 mg tablets\nSig: 1 tablet by mouth every 8 hours as needed\nQty 21  Refills 0\nDr. Example, NPI 1999999999"}
                  className="font-mono text-[13px] leading-relaxed"
                />
              </TabsContent>
            </Tabs>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Patient</Label>
                {!patient && !creatingPatient && (
                  <Button type="button" variant="ghost" size="xs" onClick={() => setCreatingPatient(true)}><UserPlus data-icon="inline-start" />New patient</Button>
                )}
              </div>
              {creatingPatient ? (
                <NewPatientPanel onCancel={() => setCreatingPatient(false)} onCreated={(p) => { setPatient(p); setCreatingPatient(false); }} />
              ) : (
                <>
                  <PatientPicker value={patient} onChange={setPatient} />
                  {!patient && <p className="text-xs text-muted-foreground">Without a linked patient the engine cannot check allergies or current medications and will say so.</p>}
                </>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              {mode === "file" ? (
                <Button onClick={() => setStep("entry")} disabled={!sourceReady || creatingPatient}>Continue to entry<ArrowRight data-icon="inline-end" /></Button>
              ) : (
                <Button onClick={submitSource} disabled={!sourceReady || busy || creatingPatient}>{busy ? "Submitting…" : "Start analysis"}</Button>
              )}
            </div>
          </>
        ) : (
          <EntryStep
            file={file!}
            patient={patient}
            busy={busy}
            onBack={() => setStep("source")}
            onSubmit={async (entered) => {
              setBusy(true);
              try {
                finish(await api.upload(file!, patient?.id ?? null, entered));
              } catch (err) {
                toast.error("Could not submit prescription", { description: err instanceof Error ? err.message : String(err) });
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ step, fileMode }: { step: Step; fileMode: boolean }) {
  if (!fileMode && step === "source") return null;
  const steps: Array<{ key: Step; label: string }> = [
    { key: "source", label: "Document & patient" },
    { key: "entry", label: "Manual entry" },
  ];
  const current = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Intake steps">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span className={cn("grid size-5 place-items-center rounded-full border text-[11px] font-semibold", i <= current ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>{i + 1}</span>
          <span className={cn(i === current ? "font-medium text-foreground" : "text-muted-foreground")}>{s.label}</span>
          {i < steps.length - 1 && <span className="h-px w-6 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function FileChip({ file, onRemove }: { file: File; onRemove?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {file.type === "application/pdf" ? <FileText className="size-5 shrink-0 text-primary" /> : <ImageIcon className="size-5 shrink-0 text-primary" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · {file.type === "application/pdf" ? "PDF, text layer read directly" : "Image, read by the vision model"}</p>
        </div>
      </div>
      {onRemove && <button type="button" onClick={onRemove} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Remove file"><X className="size-4" /></button>}
    </div>
  );
}

function NewPatientPanel({ onCancel, onCreated }: { onCancel: () => void; onCreated: (p: PatientSummary) => void }) {
  const [form, setForm] = useState<PatientFormValues>(EMPTY_PATIENT_FORM);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const body = toCreatePatient(form);
    if (typeof body === "string") { toast.error(body); return; }
    setSaving(true);
    try {
      const created = await api.createPatient(body);
      toast.success(`${created.firstName} ${created.lastName} added`);
      onCreated(created);
    } catch (err) {
      toast.error("Could not create patient", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <PatientFormFields value={form} onChange={setForm} idPrefix="intake-pt" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Back to search</Button>
        <Button size="sm" onClick={save} disabled={saving || !form.firstName.trim() || !form.lastName.trim() || !form.dob.trim()}>
          <UserPlus data-icon="inline-start" />{saving ? "Saving…" : "Create & select"}
        </Button>
      </div>
    </div>
  );
}

function FilePreview({ file }: { file: File }) {
  // Created and revoked in the same effect so StrictMode's double run never leaves a revoked URL behind.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <section aria-label="Script preview" className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-xl border bg-card">
      <header className="border-b px-3 py-2">
        <p className="text-sm font-semibold">Original</p>
        <p className="truncate text-xs text-muted-foreground">{file.name}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-2">
        {url && (file.type === "application/pdf" ? (
          <iframe title="Prescription PDF preview" src={url} className="h-full min-h-[420px] w-full rounded-md bg-white" />
        ) : (
          <img src={url} alt={`Prescription ${file.name}`} className="w-full rounded-md border bg-white shadow-sm" />
        ))}
      </div>
    </section>
  );
}

interface EntryStepProps {
  file: File;
  patient: PatientSummary | null;
  busy: boolean;
  onBack: () => void;
  onSubmit: (entered: ReturnType<typeof toEnteredData> | null) => void;
}

function EntryStep({ file, patient, busy, onBack, onSubmit }: EntryStepProps) {
  const [form, setForm] = useState<EntryFormValues>(EMPTY_ENTRY_FORM);
  const [autofilling, setAutofilling] = useState(false);
  const [autofillNote, setAutofillNote] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const error = entryFormError(form);
  const complete = entryFormComplete(form);
  const set = (k: keyof EntryFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const autofill = async () => {
    setAutofilling(true);
    setAutofillNote(null);
    try {
      const { scriptData } = await api.extract(file);
      setForm((f) => applyAutofill(f, scriptData));
      setAutofillNote({ tone: "info", text: "Fields autofilled from the image. Verify each one against the prescription before submitting." });
    } catch (err) {
      setAutofillNote({ tone: "warn", text: `Autofill failed: ${err instanceof Error ? err.message : String(err)}. Enter the details manually.` });
    } finally {
      setAutofilling(false);
    }
  };

  const age = patient ? ageFromDob(patient.dateOfBirth) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FilePreview file={file} />
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2">
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", patient ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800")}><UserRound className="size-4" /></span>
            {patient ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{patient.firstName} {patient.lastName}</p>
                <p className="truncate text-xs text-muted-foreground">{patient.dateOfBirth ? `DOB ${patient.dateOfBirth}${age != null ? ` (${age})` : ""}` : "DOB unknown"} · name and DOB are checked against the script</p>
              </div>
            ) : (
              <p className="text-sm text-amber-900">No patient linked. Patient name and DOB will not be compared.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Medication details</p>
            <Button type="button" variant="outline" size="sm" onClick={autofill} disabled={autofilling}>
              {autofilling ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
              {autofilling ? "Reading image…" : "Autofill from image"}
            </Button>
          </div>
          {autofillNote && (
            <p role="status" className={cn("rounded-md px-2.5 py-1.5 text-xs", autofillNote.tone === "info" ? "bg-violet-50 text-violet-900 ring-1 ring-inset ring-violet-200" : "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200")}>
              {autofillNote.text}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="entry-drug">Drug name &amp; strength <span className="text-destructive">*</span></Label>
              <Input id="entry-drug" value={form.drugName} onChange={set("drugName")} maxLength={200} placeholder="e.g. Lisinopril 10 mg tablet" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="entry-sig">Directions <span className="text-destructive">*</span></Label>
              <Textarea id="entry-sig" rows={2} value={form.directions} onChange={set("directions")} maxLength={500} placeholder="e.g. Take 1 tablet by mouth once daily" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="entry-qty">Quantity <span className="text-destructive">*</span></Label>
              <Input id="entry-qty" type="number" min={1} max={9999} inputMode="numeric" value={form.quantity} onChange={set("quantity")} placeholder="e.g. 30" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="entry-days">Day supply</Label>
              <Input id="entry-days" type="number" min={1} max={365} inputMode="numeric" value={form.daySupply} onChange={set("daySupply")} placeholder="e.g. 30" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="entry-refills">Refills</Label>
              <Input id="entry-refills" type="number" min={0} max={99} inputMode="numeric" value={form.refills} onChange={set("refills")} placeholder="e.g. 2" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="entry-npi">Prescriber NPI</Label>
              <Input id="entry-npi" value={form.npi} onChange={set("npi")} inputMode="numeric" placeholder="10 digits" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="entry-prescriber">Prescriber name</Label>
              <Input id="entry-prescriber" value={form.prescriberName} onChange={set("prescriberName")} maxLength={100} placeholder="e.g. Dr. Alan Reyes" />
            </div>
          </div>
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button variant="ghost" onClick={onBack} disabled={busy}><ArrowLeft data-icon="inline-start" />Back</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onSubmit(null)} disabled={busy} title="Screen the script without comparing a typed entry">Skip entry check</Button>
          <Button onClick={() => onSubmit(toEnteredData(form, patient))} disabled={busy || !complete}>{busy ? "Submitting…" : "Verify & start analysis"}</Button>
        </div>
      </div>
    </div>
  );
}
