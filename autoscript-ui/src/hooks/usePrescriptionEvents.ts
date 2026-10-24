
import { useEffect, useRef, useState } from "react";
import type { PrescriptionEvent } from "@/lib/shared";
import { api } from "@/lib/api";

export type ConnectionState = "connecting" | "live" | "polling";

/**
 * Subscribes to the API's SSE stream. Falls back to the caller's poll function
 * when the stream is unavailable (and polls slowly even when live, as a safety net).
 */
export function usePrescriptionEvents(onEvent: (event: PrescriptionEvent) => void, poll: () => void, pollMs = 4000) {
  const [state, setState] = useState<ConnectionState>("connecting");
  const handler = useRef(onEvent);
  const poller = useRef(poll);
  useEffect(() => {
    handler.current = onEvent;
    poller.current = poll;
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let live = false;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource(api.eventsUrl());
      source.onopen = () => {
        live = true;
        setState("live");
        poller.current();
      };
      source.addEventListener("prescription", (e) => {
        try {
          handler.current(JSON.parse((e as MessageEvent).data) as PrescriptionEvent);
        } catch {
          poller.current();
        }
      });
      source.onerror = () => {
        live = false;
        setState("polling");
        source?.close();
        setTimeout(connect, 5000);
      };
    };
    connect();

    const interval = setInterval(() => {
      if (!live) poller.current();
    }, pollMs);
    const safetyNet = setInterval(() => poller.current(), 30_000);

    return () => {
      disposed = true;
      source?.close();
      clearInterval(interval);
      clearInterval(safetyNet);
    };
  }, [pollMs]);

  return state;
}
