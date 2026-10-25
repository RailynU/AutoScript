import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PatientFormValues } from "@/lib/patientForm";

interface PatientFormFieldsProps {
  value: PatientFormValues;
  onChange: Dispatch<SetStateAction<PatientFormValues>>;
  /** Prefix for input ids so two forms can coexist on a page. */
  idPrefix?: string;
}

/** New-patient profile fields. Allergies, NKDA, medications and conditions feed the clinical checks. */
export function PatientFormFields({ value, onChange, idPrefix = "pt" }: PatientFormFieldsProps) {
  const id = (k: string) => `${idPrefix}-${k}`;
  const text = (k: keyof PatientFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => onChange((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={id("first")}>First name <span className="text-destructive">*</span></Label>
        <Input id={id("first")} value={value.firstName} onChange={text("firstName")} placeholder="e.g. Emily" autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("last")}>Last name <span className="text-destructive">*</span></Label>
        <Input id={id("last")} value={value.lastName} onChange={text("lastName")} placeholder="e.g. Carter" autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("dob")}>Date of birth <span className="text-destructive">*</span></Label>
        <Input id={id("dob")} value={value.dob} onChange={text("dob")} placeholder="MM/DD/YYYY" inputMode="numeric" autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("phone")}>Phone</Label>
        <Input id={id("phone")} value={value.phone} onChange={text("phone")} placeholder="(555) 000-0000" inputMode="tel" autoComplete="off" />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={id("allergies")}>Allergies</Label>
        <Input
          id={id("allergies")}
          value={value.nkda ? "" : value.allergies}
          disabled={value.nkda}
          onChange={text("allergies")}
          placeholder={value.nkda ? "No known drug allergies" : "e.g. Penicillin (hives), Sulfa"}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={value.nkda}
            onChange={(e) => onChange((p) => ({ ...p, nkda: e.target.checked }))}
          />
          No known drug allergies (NKDA), confirmed with the patient
        </label>
        {!value.nkda && !value.allergies.trim() && (
          <p className="text-xs text-amber-800">Leaving allergies empty records the history as unverified; the allergy check will say so.</p>
        )}
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={id("meds")}>Current medications</Label>
        <Input id={id("meds")} value={value.medications} onChange={text("medications")} placeholder="e.g. Warfarin 5 mg daily, Metformin 500 mg" />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={id("conditions")}>Conditions</Label>
        <Input id={id("conditions")} value={value.conditions} onChange={text("conditions")} placeholder="e.g. Atrial fibrillation, CKD stage 3" />
      </div>
    </div>
  );
}
