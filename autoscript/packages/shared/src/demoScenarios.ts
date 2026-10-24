/**
 * Synthetic demo scenarios. All names, DOBs, phones and prescribers are fictional.
 * The texts are fed to the real extraction + analysis pipeline; nothing here is
 * a pre-computed result.
 */
export interface DemoScenario {
  key: string;
  title: string;
  description: string;
  /** externalId of the seeded patient to link, or null for the "no context" scenario. */
  patientExternalId: string | null;
  /** What the pharmacist should expect to see (for the README / demo script, not used by the engine). */
  expectedOutcome: string;
  text: string;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    key: "warfarin-ibuprofen",
    title: "Warfarin + ibuprofen interaction",
    description: "Patient on chronic warfarin receives a new ibuprofen prescription after a dental procedure.",
    patientExternalId: "PT-1001",
    expectedOutcome: "MANUAL_REVIEW_NEEDED with a HIGH drug-interaction finding citing the warfarin and ibuprofen labels.",
    text: `RIVERBEND FAMILY DENTAL - PRESCRIPTION
Prescriber: Dr. Elena Marchetti, DDS   NPI 1999999901
Date: 2026-10-23

Patient: Margaret Holloway     DOB: 1952-03-14
Phone: (555) 010-1001

Rx: Ibuprofen 600 mg tablets
Sig: Take 1 tablet by mouth every 8 hours with food as needed for dental pain
Disp: #21 (twenty-one)      Refills: 0
Indication: post-extraction pain

Signature: E. Marchetti`,
  },
  {
    key: "amoxicillin-penicillin-allergy",
    title: "Amoxicillin with documented penicillin allergy",
    description: "Patient record lists a penicillin allergy (hives, 2009). New amoxicillin prescription for sinusitis.",
    patientExternalId: "PT-1002",
    expectedOutcome: "MANUAL_REVIEW_NEEDED with a HIGH allergy-conflict finding and review questions about the reaction history.",
    text: `NORTHGATE URGENT CARE
Prescriber: Dr. Samuel Okafor, MD   NPI 1999999902
Date written: 10/23/2026

Patient: Daniel Reyes   DOB 07/02/1988   Ph (555) 010-1002

Amoxicillin 500 mg capsules
1 capsule PO TID x 10 days
Qty: 30    Refills: 0
Dx: acute bacterial sinusitis

Allergies noted on chart: none listed by patient today

S. Okafor MD`,
  },
  {
    key: "insufficient-context",
    title: "Insufficient patient context",
    description: "A faxed prescription with no linked patient profile and an unlisted medication; the system must recognize what it cannot verify.",
    patientExternalId: null,
    expectedOutcome: "MANUAL_REVIEW_NEEDED driven by missing-patient-context and unrecognized-drug findings; no interaction or allergy check could run.",
    text: `FAX TRANSMISSION - page 1/1

Pt: J. Whitfield
DOB: not legible
Phone: --

1) Metoprolol succinate 50 mg ER tab - 1 PO daily #30
2) Zelmoravix 20 mg - 1 tab PO qAM #30

Prescriber signature illegible. Clinic stamp partially cut off.`,
  },
  {
    key: "no-flags",
    title: "No flags within checked criteria",
    description: "Complete, legible prescription for a patient with a verified NKDA record and no interacting medications.",
    patientExternalId: "PT-1003",
    expectedOutcome: "NO_FLAGS_DETECTED within checked criteria, provided the AI pass completes and raises no MODERATE+ observation.",
    text: `LAKESIDE INTERNAL MEDICINE
Prescriber: Dr. Priya Natarajan, MD   NPI 1999999903
Date: 2026-10-24

Patient: Aisha Thompson   DOB: 1991-11-05   Phone: (555) 010-1003

Rx: Cetirizine 10 mg tablets
Sig: Take 1 tablet by mouth once daily for seasonal allergies
Qty: 30   Refills: 2

P. Natarajan MD`,
  },
];

export function findScenario(key: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.key === key);
}
