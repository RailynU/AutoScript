import { EventEmitter } from "node:events";
import type { PrescriptionEvent } from "@autoscript/shared";

/** In-process pub/sub used to fan prescription updates out to SSE clients. */
export class PrescriptionEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  publish(event: PrescriptionEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: PrescriptionEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
