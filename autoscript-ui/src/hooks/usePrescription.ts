
import { useCallback, useEffect, useState } from "react";
import type { PrescriptionDetail, PrescriptionEvent } from "@/lib/shared";
import { api, ApiError } from "@/lib/api";
import { usePrescriptionEvents } from "./usePrescriptionEvents";

export function usePrescription(id: string) {
  const [prescription, setPrescription] = useState<PrescriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPrescription(await api.prescription(id));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load prescription");
    }
  }, [id]);

  const onEvent = useCallback(
    (event: PrescriptionEvent) => {
      if (event.prescription.id !== id) return;
      // Progress events carry the list item; merge cheaply, refetch for full report on completion.
      setPrescription((prev) => (prev ? { ...prev, ...event.prescription } : prev));
      if (event.type !== "progress") void refresh();
    },
    [id, refresh],
  );

  const connection = usePrescriptionEvents(onEvent, () => void refresh(), 3000);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { prescription, error, connection, refresh, setPrescription };
}
