import { describe, expect, it } from "vitest";
import type { ExtractedPrescription, PatientContext } from "@autoscript/shared";
import { classifyTherapyContext, decideDisposition, normalizeDrugName, runRules, computeDailyDose, matchAllergy, INTERACTIONS } from "../index";

function med(rawName: string, overrides: Partial<ExtractedPrescription["medications"][number]> = {}) {
  const normalized = normalizeDrugName(rawName).generic;
  return {
    rawName,
    normalizedName: normalized,
    normalizationSource: normalized ? ("LOCAL_MAP" as const) : ("UNRESOLVED" as const),
    strength: "400 mg",
    form: "tablet",
    route: "oral",
    sig: "Take 1 tablet by mouth every 8 hours as needed",
    frequency: "every 8 hours",
    quantity: "30",
    refills: "0",
    duration: null,
    indication: null,
    confidence: 0.95,
    ...overrides,
  };
}

function extraction(meds: ExtractedPrescription["medications"]): ExtractedPrescription {
  return {
    patientName: "Test Patient",
    patientDateOfBirth: null,
    prescriberName: "Dr. Demo",
    prescriberIdentifier: null,
    dateWritten: "2026-10-20",
    medications: meds,
    statedAllergies: [],
    notes: null,
    uncertainties: [],
    overallConfidence: 0.95,
    extractor: "test",
  };
}

function patient(overrides: Partial<PatientContext> = {}): PatientContext {
  return {
    id: "p1",
    firstName: "Test",
    lastName: "Patient",
    dateOfBirth: "1950-01-01",
    sex: "F",
    phone: "555-0100",
    weightKg: 70,
    allergiesVerified: true,
    allergies: [{ substance: "NKDA", severity: "UNKNOWN" }],
    conditions: [],
    medications: [],
    ...overrides,
  };
}

describe("drug normalization", () => {
  it("maps brand names and dosage noise to generics", () => {
    expect(normalizeDrugName("Coumadin 5mg tabs").generic).toBe("warfarin");
    expect(normalizeDrugName("Advil").generic).toBe("ibuprofen");
    expect(normalizeDrugName("Augmentin 875-125").generic).toBe("amoxicillin-clavulanate");
    expect(normalizeDrugName("Amoxicillin 500 mg capsule").generic).toBe("amoxicillin");
    expect(normalizeDrugName("Xyzzyomab").generic).toBeNull();
  });
});

describe("interaction rule", () => {
  it("flags warfarin on the patient record + ibuprofen on the prescription", () => {
    const result = runRules({
      extraction: extraction([med("Ibuprofen 600 mg")]),
      patient: patient({ medications: [{ name: "Warfarin", genericName: "warfarin", dose: "5 mg", frequency: "daily", active: true }] }),
    });
    const hit = result.findings.find((f) => f.type === "DRUG_INTERACTION");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("HIGH");
    expect(hit!.medications.sort()).toEqual(["ibuprofen", "warfarin"]);
    expect(hit!.referenceIds).toContain("fda-warfarin-label-interactions");
  });

  it("does not flag two inactive/record-only drugs against each other", () => {
    const result = runRules({
      extraction: extraction([med("Cetirizine 10 mg")]),
      patient: patient({
        medications: [
          { name: "Warfarin", genericName: "warfarin", active: true },
          { name: "Ibuprofen", genericName: "ibuprofen", active: true },
        ],
      }),
    });
    expect(result.findings.filter((f) => f.type === "DRUG_INTERACTION")).toHaveLength(0);
  });
});

describe("allergy rule", () => {
  it("flags amoxicillin against a documented penicillin allergy", () => {
    const result = runRules({
      extraction: extraction([med("Amoxicillin 500 mg")]),
      patient: patient({ allergies: [{ substance: "Penicillin", reaction: "hives", severity: "MODERATE" }] }),
    });
    const hit = result.findings.find((f) => f.type === "ALLERGY_CONFLICT");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("HIGH");
    expect(hit!.reviewQuestions.length).toBeGreaterThan(0);
  });

  it("escalates to CRITICAL for a severe documented reaction", () => {
    const result = runRules({
      extraction: extraction([med("Amoxicillin 500 mg")]),
      patient: patient({ allergies: [{ substance: "Penicillin", reaction: "anaphylaxis", severity: "SEVERE" }] }),
    });
    expect(result.findings.find((f) => f.type === "ALLERGY_CONFLICT")!.severity).toBe("CRITICAL");
  });

  // Prescription date in these fixtures is 2026-10-20 (extraction()); the grading is downgrade-only relative to HIGH.
  const amoxicillinFor = (allergy: PatientContext["allergies"][number]) =>
    runRules({ extraction: extraction([med("Amoxicillin 500 mg")]), patient: patient({ allergies: [allergy] }) }).findings.find((f) => f.type === "ALLERGY_CONFLICT")!;

  it("grades a documented non-severe reaction recorded more than 5 years earlier as MODERATE and says why", () => {
    const hit = amoxicillinFor({ substance: "Penicillin", reaction: "Generalized hives within hours of a dose (2009)", severity: "MODERATE", recordedAt: "2009-08-20" });
    expect(hit.severity).toBe("MODERATE");
    expect(hit.explanation).toContain("17 years before this prescription");
    expect(hit.explanation).toContain("must be confirmed");
    expect(decideDisposition({ findings: [hit], extraction: extraction([med("Amoxicillin 500 mg")]), patientLinked: true, llmCompleted: true }).disposition).toBe("MANUAL_REVIEW_NEEDED");
  });

  it("keeps HIGH when the reaction is recent, undated, undescribed or of unknown severity", () => {
    expect(amoxicillinFor({ substance: "Penicillin", reaction: "hives", severity: "MILD", recordedAt: "2024-01-15" }).severity).toBe("HIGH");
    expect(amoxicillinFor({ substance: "Penicillin", reaction: "hives", severity: "MILD" }).severity).toBe("HIGH");
    expect(amoxicillinFor({ substance: "Penicillin", reaction: null, severity: "MILD", recordedAt: "2009-08-20" }).severity).toBe("HIGH");
    expect(amoxicillinFor({ substance: "Penicillin", reaction: "unknown", severity: "UNKNOWN", recordedAt: "2009-08-20" }).severity).toBe("HIGH");
    expect(amoxicillinFor({ substance: "Penicillin", reaction: "hives", severity: "MILD", recordedAt: "2021-10-21" }).severity).toBe("HIGH");
    expect(amoxicillinFor({ substance: "Penicillin", reaction: "hives", severity: "MILD", recordedAt: "2021-10-20" }).severity).toBe("MODERATE");
  });

  it("never downgrades a SEVERE reaction, however old", () => {
    expect(amoxicillinFor({ substance: "Penicillin", reaction: "anaphylaxis", severity: "SEVERE", recordedAt: "1999-01-01" }).severity).toBe("CRITICAL");
  });

  it("treats cephalosporins as cross-reactive (MODERATE) rather than direct", () => {
    expect(matchAllergy("penicillin", { generic: "cephalexin", classes: ["CEPHALOSPORIN"] })!.kind).toBe("CROSS_REACTIVE");
    expect(matchAllergy("NKDA", { generic: "amoxicillin", classes: ["PENICILLIN"] })).toBeNull();
  });
});

describe("context rules", () => {
  it("flags a prescription with no patient linked", () => {
    const result = runRules({ extraction: extraction([med("Cetirizine 10 mg")]), patient: null });
    expect(result.findings.some((f) => f.origin === "context.no-patient" && f.severity === "HIGH")).toBe(true);
    expect(result.limitations.some((l) => l.includes("No patient record"))).toBe(true);
  });

  it("flags an empty allergy history", () => {
    const result = runRules({ extraction: extraction([med("Cetirizine 10 mg")]), patient: patient({ allergies: [], allergiesVerified: false }) });
    expect(result.findings.some((f) => f.origin === "context.allergy-history")).toBe(true);
  });
});

describe("dose rule", () => {
  it("reads 'twice daily' and 'three times daily' as more than once a day", () => {
    expect(computeDailyDose("500 mg", "Take 1 tablet twice daily", null)!.dosesPerDay).toBe(2);
    expect(computeDailyDose("500 mg", null, "three times daily")!.dosesPerDay).toBe(3);
    expect(computeDailyDose("500 mg", "Take 1 tablet once daily", null)!.dosesPerDay).toBe(1);
  });

  it("computes daily dose and flags acetaminophen above 4 g", () => {
    expect(computeDailyDose("1000 mg", "Take 1 tablet every 6 hours", null)!.mgPerDay).toBe(4000);
    const result = runRules({
      extraction: extraction([med("Acetaminophen 1000 mg", { strength: "1000 mg", sig: "Take 2 tablets every 6 hours", frequency: "every 6 hours" })]),
      patient: patient(),
    });
    expect(result.findings.some((f) => f.type === "DOSE_CONCERN")).toBe(true);
  });
});

describe("disposition policy", () => {
  const clean = extraction([med("Cetirizine 10 mg")]);
  it("never returns NO_FLAGS when a deterministic finding exists", () => {
    expect(decideDisposition({ findings: [{ severity: "LOW", deterministic: true, type: "MISSING_PRESCRIPTION_INFO" }], extraction: clean, patientLinked: true, llmCompleted: true }).disposition).toBe("MANUAL_REVIEW_NEEDED");
  });
  it("routes to manual review when the LLM pass did not complete", () => {
    expect(decideDisposition({ findings: [], extraction: clean, patientLinked: true, llmCompleted: false }).disposition).toBe("MANUAL_REVIEW_NEEDED");
  });
  it("routes to manual review when no patient is linked", () => {
    expect(decideDisposition({ findings: [], extraction: clean, patientLinked: false, llmCompleted: true }).disposition).toBe("MANUAL_REVIEW_NEEDED");
  });
  it("returns NO_FLAGS only when everything checks out, with non-safety wording", () => {
    const r = decideDisposition({ findings: [], extraction: clean, patientLinked: true, llmCompleted: true });
    expect(r.disposition).toBe("NO_FLAGS_DETECTED");
    expect(r.reason).toContain("within checked criteria");
    expect(r.reason.toLowerCase()).not.toMatch(/\bsafe\b(?! ty)/);
  });
  it("clean rule run on a clean scenario produces no findings", () => {
    const result = runRules({ extraction: clean, patient: patient() });
    expect(result.findings).toEqual([]);
  });
});

describe("therapy context classifier", () => {
  const dental = { sig: "Take 1 tablet by mouth every 8 hours with food as needed for dental pain", frequency: "every 8 hours", quantity: "#21 (twenty-one)", refills: "0", duration: null };

  it("classifies the post-extraction ibuprofen course (q8h PRN, #21, 0 refills) as a short course", () => {
    const r = classifyTherapyContext(dental);
    expect(r.context).toBe("ACUTE_SHORT_COURSE");
    expect(r.totalDays).toBe(7);
    expect(r.asNeeded).toBe(true);
    expect(r.basis).toContain("quantity 21 at 1 x 3 doses/day = 7 days of supply");
    expect(r.basis).toContain("0 refills");
  });

  it("classifies an explicit short duration as a short course even without a quantity", () => {
    expect(classifyTherapyContext({ sig: "1 capsule PO TID x 10 days", frequency: "TID", quantity: null, refills: null, duration: null }).context).toBe("ACUTE_SHORT_COURSE");
    expect(classifyTherapyContext({ sig: null, frequency: null, quantity: null, refills: "0", duration: "7 days" }).context).toBe("ACUTE_SHORT_COURSE");
  });

  it("classifies a 90-day refilled NSAID as chronic", () => {
    const r = classifyTherapyContext({ sig: "Take 1 tablet twice daily", frequency: "twice daily", quantity: "180", refills: "3", duration: null });
    expect(r.context).toBe("CHRONIC");
    expect(r.totalDays).toBe(360);
    expect(r.basis).toContain("90 days of supply");
    expect(r.basis).toContain("3 refills");
  });

  it("treats a stated 30-day supply, or refills with unknown length, as chronic", () => {
    expect(classifyTherapyContext({ sig: "1 daily", frequency: "daily", quantity: "30", refills: "0", duration: null }).context).toBe("CHRONIC");
    expect(classifyTherapyContext({ sig: null, frequency: null, quantity: null, refills: "2", duration: null }).context).toBe("CHRONIC");
    expect(classifyTherapyContext({ sig: "1 tablet daily", frequency: "daily", quantity: "10", refills: "2", duration: null }).context).toBe("CHRONIC");
  });

  it("returns UNKNOWN instead of guessing", () => {
    expect(classifyTherapyContext({ sig: "as directed", frequency: null, quantity: null, refills: null, duration: null })).toMatchObject({ context: "UNKNOWN", totalDays: null });
    expect(classifyTherapyContext({ sig: "5 mL PO BID", frequency: "BID", quantity: "100 mL", refills: "0", duration: null }).context).toBe("UNKNOWN");
    expect(classifyTherapyContext({ sig: "1 tablet daily", frequency: "daily", quantity: "20", refills: "0", duration: null })).toMatchObject({ context: "UNKNOWN", totalDays: 20 });
  });
});

describe("therapy context in rule explanations", () => {
  const warfarinLisinopril = patient({
    dateOfBirth: "1952-03-14",
    medications: [
      { name: "Warfarin", genericName: "warfarin", dose: "5 mg", frequency: "daily", active: true },
      { name: "Lisinopril", genericName: "lisinopril", dose: "10 mg", frequency: "daily", active: true },
    ],
  });
  const dentalIbuprofen = med("Ibuprofen 600 mg", { strength: "600 mg", sig: "Take 1 tablet by mouth every 8 hours with food as needed for dental pain", frequency: "every 8 hours", quantity: "#21", refills: "0", indication: "post-extraction pain" });

  it("keeps the table severities for a short course and says so without calling it chronic", () => {
    const result = runRules({ extraction: extraction([dentalIbuprofen]), patient: warfarinLisinopril });
    const interactions = result.findings.filter((f) => f.type === "DRUG_INTERACTION");
    expect(interactions.map((f) => f.origin).sort()).toEqual(["interaction.pairwise/ace-inhibitor-nsaid", "interaction.pairwise/warfarin-nsaid"]);
    for (const f of interactions) {
      expect(f.therapyContext).toBe("ACUTE_SHORT_COURSE");
      expect(f.therapyContextBasis).toContain("7 days of supply");
      expect(f.severitySource).toBe("RULE_TABLE");
      expect(f.explanation).toContain("short course");
      expect(f.explanation.toLowerCase()).not.toContain("chronic");
      expect(f.explanation).toContain("Patient age 74");
    }
    const warfarin = interactions.find((f) => f.origin.endsWith("warfarin-nsaid"))!;
    expect(warfarin.severity).toBe("HIGH");
    expect(warfarin.explanation).toContain("INR");
    // Beers 2023 Table 2 names short-term scheduled NSAID use with anticoagulants, so the document is cited on a short course too.
    expect(warfarin.referenceIds).toContain("beers-criteria-2023-nsaids");
    expect(warfarin.explanation).toContain("short-term scheduled NSAID use with anticoagulants");
    expect(warfarin.explanation).not.toContain("not cited for this short course");
    const ace = interactions.find((f) => f.origin.endsWith("ace-inhibitor-nsaid"))!;
    expect(ace.severity).toBe("MODERATE");
    expect(ace.explanation).toContain("renal");
    // ACE inhibitor + NSAID is not a Beers item; the lisinopril and ibuprofen labels are the sources.
    expect(ace.referenceIds).toEqual(["fda-lisinopril-label-nsaids", "fda-ibuprofen-label-anticoagulants"]);
    expect(ace.explanation).not.toContain("Beers");
    // The chronic-use clause is excluded for every short-course finding, whichever documents it cites.
    for (const f of interactions) expect(f.excludedSections).toEqual(["beers-criteria-2023-nsaids::Non-COX-selective NSAIDs: avoid chronic use"]);
  });

  it("a short course of an SSRI + NSAID still omits Beers (its short-term clause does not name SSRIs)", () => {
    const onSertraline = patient({ dateOfBirth: "1952-03-14", medications: [{ name: "Sertraline", genericName: "sertraline", dose: "50 mg", frequency: "daily", active: true }] });
    const result = runRules({ extraction: extraction([dentalIbuprofen]), patient: onSertraline });
    const ssri = result.findings.find((f) => f.origin.endsWith("ssri-nsaid"))!;
    expect(ssri.therapyContext).toBe("ACUTE_SHORT_COURSE");
    expect(ssri.referenceIds).not.toContain("beers-criteria-2023-nsaids");
    expect(ssri.explanation).toContain("not cited for this short course");
  });

  it("every interaction entry that cites Beers at any duration names the clause it relies on", () => {
    for (const entry of INTERACTIONS) {
      if (entry.referenceIds.includes("beers-criteria-2023-nsaids")) expect(entry.beersClause, entry.id).toEqual(expect.any(String));
    }
  });

  it("describes a refilled 90-day NSAID as ongoing therapy and cites Beers", () => {
    const chronicNaproxen = med("Naproxen 500 mg", { strength: "500 mg", sig: "Take 1 tablet twice daily", frequency: "twice daily", quantity: "180", refills: "3" });
    const result = runRules({ extraction: extraction([chronicNaproxen]), patient: warfarinLisinopril });
    const warfarin = result.findings.find((f) => f.origin.endsWith("warfarin-nsaid"))!;
    expect(warfarin.therapyContext).toBe("CHRONIC");
    expect(warfarin.severity).toBe("HIGH");
    expect(warfarin.explanation).toContain("ongoing (chronic) therapy");
    expect(warfarin.referenceIds).toContain("beers-criteria-2023-nsaids");
  });

  it("records UNKNOWN when the prescription gives no duration, quantity or refills", () => {
    const bare = med("Ibuprofen 400 mg", { quantity: null, refills: null, duration: null, sig: "as directed", frequency: null });
    const result = runRules({ extraction: extraction([bare]), patient: warfarinLisinopril });
    const warfarin = result.findings.find((f) => f.origin.endsWith("warfarin-nsaid"))!;
    expect(warfarin.therapyContext).toBe("UNKNOWN");
    expect(warfarin.explanation).toContain("could not be determined");
  });

  it("states the context on condition, duplicate and dose findings", () => {
    const ckd = patient({ conditions: [{ name: "Chronic kidney disease stage 3", status: "ACTIVE" }], medications: [{ name: "Naproxen", genericName: "naproxen", active: true }] });
    const result = runRules({
      extraction: extraction([med("Ibuprofen 800 mg", { strength: "800 mg", sig: "Take 2 tablets every 6 hours", frequency: "every 6 hours", quantity: "20", refills: "0" })]),
      patient: ckd,
    });
    const byType = (t: string) => result.findings.find((f) => f.type === t)!;
    for (const t of ["CONDITION_CONFLICT", "DUPLICATE_THERAPY", "DOSE_CONCERN"]) {
      expect(byType(t).therapyContext).toBe("ACUTE_SHORT_COURSE");
      expect(byType(t).explanation).toContain("short course");
    }
    expect(byType("DUPLICATE_THERAPY").referenceIds).toEqual([]);
    expect(byType("CONDITION_CONFLICT").explanation).toContain("disease-drug interaction entry");
  });

  it("findings that are not about a prescribed course default to UNKNOWN with RULE_TABLE severity", () => {
    const result = runRules({ extraction: extraction([med("Cetirizine 10 mg")]), patient: null });
    const noPatient = result.findings.find((f) => f.origin === "context.no-patient")!;
    expect(noPatient).toMatchObject({ therapyContext: "UNKNOWN", therapyContextBasis: null, severitySource: "RULE_TABLE", supportStatus: null, proposedSeverity: null });
  });
});

describe("extraction confidence wording", () => {
  it("never shows the extractor's self-reported confidence as a percentage", () => {
    const low = { ...extraction([med("Cetirizine 10 mg")]), overallConfidence: 0.42 };
    const result = runRules({ extraction: low, patient: patient() });
    const hit = result.findings.find((f) => f.origin === "rx.extraction-confidence")!;
    expect(hit.severity).toBe("HIGH");
    expect(hit.explanation).toContain("the extractor reported low confidence in its own reading");
    expect(hit.explanation).toContain("verify every field against the original document");
    expect(hit.explanation).not.toMatch(/\d+\s*%/);
    expect(hit.explanation).not.toContain("0.42");
  });
});

describe("disposition with clamped AI observations", () => {
  const clean = extraction([med("Cetirizine 10 mg")]);
  it("still routes to manual review when an unsupported observation was proposed MODERATE but is shown as LOW", () => {
    const r = decideDisposition({ findings: [{ severity: "LOW", proposedSeverity: "MODERATE", deterministic: false, type: "AI_OBSERVATION" }], extraction: clean, patientLinked: true, llmCompleted: true });
    expect(r.disposition).toBe("MANUAL_REVIEW_NEEDED");
    expect(r.reason).toContain("MODERATE");
    expect(r.reason).toContain("shown as LOW");
  });
  it("does not route on a LOW observation that was proposed LOW", () => {
    const r = decideDisposition({ findings: [{ severity: "LOW", proposedSeverity: "LOW", deterministic: false, type: "AI_OBSERVATION" }], extraction: clean, patientLinked: true, llmCompleted: true });
    expect(r.disposition).toBe("NO_FLAGS_DETECTED");
  });
});

describe("drug map extensions", () => {
  it("maps newly added US generics and brand aliases", () => {
    expect(normalizeDrugName("Digoxin 0.125 mg").generic).toBe("digoxin");
    expect(normalizeDrugName("Lanoxin").generic).toBe("digoxin");
    expect(normalizeDrugName("Humulin N 100 units/mL").generic).toBe("insulin nph");
    expect(normalizeDrugName("Plendil 5 mg").generic).toBe("felodipine");
    expect(normalizeDrugName("Orapred ODT").generic).toBe("prednisolone");
    expect(normalizeDrugName("Zofran").generic).toBe("ondansetron");
    expect(normalizeDrugName("Nexium 40 mg DR caps").generic).toBe("esomeprazole");
  });

  it("maps regional brands to the generic", () => {
    expect(normalizeDrugName("ZOFER 4 mg").generic).toBe("ondansetron");
    expect(normalizeDrugName("Azithral 500").generic).toBe("azithromycin");
    expect(normalizeDrugName("Syp meftal-P")).toEqual({ generic: "mefenamic acid", classes: ["NSAID"] });
  });

  it("reads a generic written in parentheses after an unknown brand", () => {
    expect(normalizeDrugName("LCZ (Levocetirizine)").generic).toBe("levocetirizine");
    expect(normalizeDrugName("PHOSOME (Liposomal Amphotericin)").generic).toBe("amphotericin b liposomal");
    expect(normalizeDrugName("Inj Liposomal Amphotericin B").generic).toBe("amphotericin b liposomal");
    expect(normalizeDrugName("(Conventional) Amphotericin B").generic).toBe("amphotericin b");
    expect(normalizeDrugName("Zelmoravix (brand)").generic).toBeNull();
  });

  it("keeps combination brands on the combination generic and look-alike classes apart", () => {
    expect(normalizeDrugName("Pan D").generic).toBe("pantoprazole-domperidone");
    expect(normalizeDrugName("Pan 40").generic).toBe("pantoprazole");
    expect(normalizeDrugName("T. Ultracet").classes.sort()).toEqual(["ANALGESIC_ACETAMINOPHEN", "OPIOID"]);
    // Sulfonylureas are not sulfa antimicrobials and Z-drugs are not benzodiazepines.
    expect(normalizeDrugName("Tolbutamide").classes).toEqual(["OTHER"]);
    expect(normalizeDrugName("Zolpidem").classes).toEqual(["OTHER"]);
    expect(normalizeDrugName("Frisium").classes).toEqual(["BENZODIAZEPINE"]);
  });
});
