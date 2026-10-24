import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

/** Server-sent events stream of prescription changes. */
export async function eventRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/events", (req, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
      "x-accel-buffering": "no",
    });
    reply.raw.write(`: connected\n\n`);
    const unsubscribe = ctx.bus.subscribe((event) => {
      reply.raw.write(`event: prescription\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(`: ping\n\n`), 15_000);
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
