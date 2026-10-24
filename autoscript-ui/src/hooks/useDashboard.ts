
import { useCallback, useEffect, useState } from "react";
import type { DashboardStats, PrescriptionEvent, PrescriptionListItem } from "@/lib/shared";
import { api, ApiError } from "@/lib/api";
import { usePrescriptionEvents } from "./usePrescriptionEvents";

/** Queue order: newest first, regardless of the order the API or an event delivered the rows. */
function sortNewestFirst(list: readonly PrescriptionListItem[]): PrescriptionListItem[] {
  return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function upsert(list: PrescriptionListItem[], item: PrescriptionListItem): PrescriptionListItem[] {
  const next = list.some((p) => p.id === item.id) ? list.map((p) => (p.id === item.id ? item : p)) : [item, ...list];
  return sortNewestFirst(next);
}

export function useDashboard() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionListItem[] | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<PrescriptionEvent | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([api.prescriptions(), api.stats()]);
      setPrescriptions(sortNewestFirst(list));
      setStats(s);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load prescriptions");
    }
  }, []);

  const onEvent = useCallback(
    (event: PrescriptionEvent) => {
      setPrescriptions((prev) => upsert(prev ?? [], event.prescription));
      setLastEvent(event);
      if (event.type !== "progress") void api.stats().then(setStats).catch(() => undefined);
    },
    [],
  );

  const connection = usePrescriptionEvents(onEvent, () => void refresh());

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const optimisticAdd = useCallback((item: PrescriptionListItem) => {
    setPrescriptions((prev) => upsert(prev ?? [], item));
    void api.stats().then(setStats).catch(() => undefined);
  }, []);

  return { prescriptions, stats, error, connection, lastEvent, refresh, optimisticAdd };
}
