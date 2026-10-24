import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { CreateReviewSchema } from "@autoscript/shared";
import type { AppContext } from "../context.js";
import { toDetail, toListItem } from "../serializers.js";
import { prescriptionUpdateForReview } from "../services/reviewActions.js";

export async function reviewRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post("/prescriptions/:id/reviews", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const parsed = CreateReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      return reply.code(400).send({ error: issues.map((i) => i.message).join(" ") });
    }
    const body = parsed.data;
    const rx = await ctx.db.prescription.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!rx) return reply.code(404).send({ error: "Prescription not found" });
    if (rx.status === "PROCESSING") return reply.code(409).send({ error: "Prescription is still processing" });

    const updated = await ctx.db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.review.create({
        data: { prescriptionId: id, action: body.action, pharmacistName: body.pharmacistName, notes: body.notes?.trim() || null },
      });
      const data = prescriptionUpdateForReview(body.action, new Date());
      if (Object.keys(data).length > 0) await tx.prescription.update({ where: { id }, data });
      return tx.prescription.findUniqueOrThrow({
        where: { id },
        include: {
          patient: { include: { allergies: true, conditions: true, medications: true } },
          reviews: { orderBy: { createdAt: "desc" } },
        },
      });
    });
    ctx.bus.publish({ type: "reviewed", prescription: toListItem(updated) });
    return { prescription: toDetail(updated) };
  });
}
