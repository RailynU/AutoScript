import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CreatePatientSchema } from "@autoscript/shared";
import type { AppContext } from "../context.js";
import { toPatientContext, toPatientSummary } from "../serializers.js";

const QuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  // AutoScript lookup form: any combination, partial matches.
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  /** MM/DD/YYYY, YYYY-MM-DD, or a partial like "04/12" or "1985". */
  dob: z.string().trim().max(10).optional(),
  phone: z.string().trim().max(30).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

/** Partial DOB → yyyy-MM-dd fragment usable with a LIKE on the ISO date text. */
function dobFragment(dob: string): string {
  const us = dob.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (us) return `${us[3] ?? ""}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`.replace(/^-/, "");
  return dob;
}

export async function patientRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/patients", async (req) => {
    const { q, limit, firstName, lastName, dob, phone } = QuerySchema.parse(req.query);
    if (firstName || lastName || dob || phone) {
      const phoneDigits = phone?.replace(/\D/g, "") ?? "";
      let ids: string[] | null = null;
      if (dob) {
        const rows = await ctx.db.$queryRaw<{ id: string }[]>`SELECT id FROM "Patient" WHERE to_char("dateOfBirth", 'YYYY-MM-DD') LIKE ${"%" + dobFragment(dob) + "%"}`;
        ids = rows.map((r) => r.id);
      }
      const patients = await ctx.db.patient.findMany({
        where: {
          ...(firstName ? { firstName: { contains: firstName, mode: "insensitive" as const } } : {}),
          ...(lastName ? { lastName: { contains: lastName, mode: "insensitive" as const } } : {}),
          ...(phoneDigits ? { phone: { contains: phoneDigits.slice(-4) } } : {}),
          ...(ids ? { id: { in: ids } } : {}),
        },
        take: limit,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
      return { patients: patients.map(toPatientSummary) };
    }
    const digits = q?.replace(/\D/g, "") ?? "";
    const where = q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits.slice(-4) } }] : []),
            ...(q.includes(" ")
              ? [
                  {
                    AND: [
                      { firstName: { contains: q.split(" ")[0]!, mode: "insensitive" as const } },
                      { lastName: { contains: q.split(" ").slice(1).join(" "), mode: "insensitive" as const } },
                    ],
                  },
                ]
              : []),
          ],
        }
      : {};
    const patients = await ctx.db.patient.findMany({ where, take: limit, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
    return { patients: patients.map(toPatientSummary) };
  });

  app.get("/patients/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const patient = await ctx.db.patient.findUnique({
      where: { id },
      include: { allergies: true, conditions: true, medications: true },
    });
    if (!patient) return reply.code(404).send({ error: "Patient not found" });
    return { patient: toPatientContext(patient) };
  });

  app.post("/patients", async (req, reply) => {
    const body = CreatePatientSchema.parse(req.body);
    const patient = await ctx.db.patient.create({
      data: {
        externalId: `AS-${randomUUID().slice(0, 8).toUpperCase()}`,
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: new Date(`${body.dateOfBirth}T00:00:00Z`),
        sex: body.sex ?? null,
        phone: body.phone || null,
        weightKg: body.weightKg ?? null,
        allergiesVerified: body.allergiesVerified,
        allergies: { create: body.allergies.map((a) => ({ substance: a.substance, reaction: a.reaction ?? null, severity: a.severity })) },
        conditions: { create: body.conditions.map((c) => ({ name: c.name, icd10: c.icd10 ?? null, status: c.status })) },
        medications: { create: body.medications.map((m) => ({ name: m.name, genericName: m.genericName ?? null, dose: m.dose ?? null, frequency: m.frequency ?? null, active: m.active })) },
      },
      include: { allergies: true, conditions: true, medications: true },
    });
    return reply.code(201).send({ patient: toPatientContext(patient) });
  });
}
