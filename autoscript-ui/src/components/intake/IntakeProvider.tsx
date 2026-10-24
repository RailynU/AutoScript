import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PatientSummary } from "@/lib/shared";
import { UploadDialog } from "@/components/dashboard/UploadDialog";
import { useQueue } from "@/hooks/useQueue";

interface IntakeContextValue {
  /** Opens the new-prescription dialog, optionally with the patient already selected. */
  openIntake: (patient?: PatientSummary | null) => void;
}

const IntakeContext = createContext<IntakeContextValue | null>(null);

/** Owns the single intake dialog so any page (dashboard, patients, prescriptions) can start an intake. */
export function IntakeProvider({ children }: { children: ReactNode }) {
  const { optimisticAdd } = useQueue();
  const [open, setOpen] = useState(false);
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  /** Bumped on every open so the dialog remounts with fresh state and the chosen patient. */
  const [session, setSession] = useState(0);

  const openIntake = useCallback((p?: PatientSummary | null) => {
    setPatient(p ?? null);
    setSession((n) => n + 1);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openIntake }), [openIntake]);

  return (
    <IntakeContext.Provider value={value}>
      {children}
      <UploadDialog key={session} open={open} onOpenChange={setOpen} onCreated={optimisticAdd} initialPatient={patient} />
    </IntakeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIntake(): IntakeContextValue {
  const ctx = useContext(IntakeContext);
  if (!ctx) throw new Error("useIntake must be used inside <IntakeProvider>");
  return ctx;
}
