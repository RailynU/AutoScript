import { createContext, useContext, type ReactNode } from "react";
import { useDashboard } from "./useDashboard";

type QueueState = ReturnType<typeof useDashboard>;

const QueueContext = createContext<QueueState | null>(null);

/**
 * One live queue (list + stats + SSE subscription) shared by every list page, so moving
 * between Dashboard, Prescriptions, Reviews and Analytics does not reopen the stream.
 */
export function QueueProvider({ children }: { children: ReactNode }) {
  const queue = useDashboard();
  return <QueueContext.Provider value={queue}>{children}</QueueContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useQueue(): QueueState {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error("useQueue must be used inside <QueueProvider>");
  return ctx;
}
