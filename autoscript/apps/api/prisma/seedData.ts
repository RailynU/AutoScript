/** Synthetic patients. Every name, phone, DOB and history is fictional. */
export interface SeedPatient {
  externalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: "F" | "M" | "X";
  phone: string;
  weightKg: number | null;
  renalFunctionNote?: string;
  allergiesVerified: boolean;
  allergies: Array<{ substance: string; reaction?: string; severity?: "MILD" | "MODERATE" | "SEVERE" | "UNKNOWN"; recordedAt?: string }>;
  conditions: Array<{ name: string; icd10?: string; status?: "ACTIVE" | "RESOLVED" }>;
  medications: Array<{ name: string; genericName: string; dose?: string; frequency?: string; startedAt?: string; active?: boolean }>;
}

export const SEED_PATIENTS: SeedPatient[] = [
  {
    externalId: "PT-1001",
    firstName: "Margaret",
    lastName: "Holloway",
    dateOfBirth: "1952-03-14",
    sex: "F",
    phone: "5550101001",
    weightKg: 68,
    allergiesVerified: true,
    allergies: [{ substance: "NKDA", severity: "UNKNOWN", recordedAt: "2025-02-11" }],
    conditions: [
      { name: "Atrial fibrillation", icd10: "I48.91" },
      { name: "Hypertension", icd10: "I10" },
    ],
    medications: [
      { name: "Warfarin (Coumadin)", genericName: "warfarin", dose: "5 mg", frequency: "once daily in the evening", startedAt: "2022-06-01" },
      { name: "Lisinopril", genericName: "lisinopril", dose: "10 mg", frequency: "once daily", startedAt: "2019-04-15" },
    ],
  },
  {
    externalId: "PT-1002",
    firstName: "Daniel",
    lastName: "Reyes",
    dateOfBirth: "1988-07-02",
    sex: "M",
    phone: "5550101002",
    weightKg: 84,
    allergiesVerified: true,
    allergies: [{ substance: "Penicillin", reaction: "Generalized hives within hours of a dose (2009)", severity: "MODERATE", recordedAt: "2009-08-20" }],
    conditions: [{ name: "Mild intermittent asthma", icd10: "J45.20" }],
    medications: [{ name: "Albuterol HFA inhaler", genericName: "albuterol", dose: "90 mcg/actuation", frequency: "2 puffs every 4-6 hours as needed", startedAt: "2015-01-10" }],
  },
  {
    externalId: "PT-1003",
    firstName: "Aisha",
    lastName: "Thompson",
    dateOfBirth: "1991-11-05",
    sex: "F",
    phone: "5550101003",
    weightKg: 61,
    allergiesVerified: true,
    allergies: [{ substance: "NKDA", severity: "UNKNOWN", recordedAt: "2026-01-09" }],
    conditions: [{ name: "Seasonal allergic rhinitis", icd10: "J30.2" }],
    medications: [],
  },
  {
    externalId: "PT-1004",
    firstName: "Robert",
    lastName: "Chen",
    dateOfBirth: "1947-09-30",
    sex: "M",
    phone: "5550101004",
    weightKg: 79,
    renalFunctionNote: "eGFR 42 mL/min/1.73m2 (2026-08)",
    allergiesVerified: true,
    allergies: [{ substance: "Sulfa drugs", reaction: "Rash", severity: "MILD", recordedAt: "1998-05-02" }],
    conditions: [
      { name: "Chronic kidney disease stage 3b", icd10: "N18.32" },
      { name: "Type 2 diabetes mellitus", icd10: "E11.9" },
      { name: "Hypertension", icd10: "I10" },
    ],
    medications: [
      { name: "Metformin", genericName: "metformin", dose: "500 mg", frequency: "twice daily", startedAt: "2016-03-01" },
      { name: "Amlodipine", genericName: "amlodipine", dose: "5 mg", frequency: "once daily", startedAt: "2018-07-12" },
    ],
  },
  {
    externalId: "PT-1005",
    firstName: "Linda",
    lastName: "Alvarez",
    dateOfBirth: "1975-12-19",
    sex: "F",
    phone: "5550101005",
    weightKg: 72,
    allergiesVerified: false,
    allergies: [{ substance: "Codeine", reaction: "Nausea (patient report, unverified)", severity: "UNKNOWN" }],
    conditions: [{ name: "Major depressive disorder, in remission", icd10: "F33.42" }],
    medications: [{ name: "Sertraline", genericName: "sertraline", dose: "100 mg", frequency: "once daily", startedAt: "2023-02-20" }],
  },
  {
    externalId: "PT-1006",
    firstName: "George",
    lastName: "Okonkwo",
    dateOfBirth: "1960-04-08",
    sex: "M",
    phone: "5550101006",
    weightKg: 91,
    allergiesVerified: true,
    allergies: [{ substance: "NKDA", severity: "UNKNOWN", recordedAt: "2024-11-30" }],
    conditions: [
      { name: "Peptic ulcer disease, history of GI bleed (2021)", icd10: "K27.4" },
      { name: "Coronary artery disease", icd10: "I25.10" },
    ],
    medications: [
      { name: "Aspirin", genericName: "aspirin", dose: "81 mg", frequency: "once daily", startedAt: "2021-09-01" },
      { name: "Omeprazole", genericName: "omeprazole", dose: "20 mg", frequency: "once daily", startedAt: "2021-09-01" },
      { name: "Atorvastatin", genericName: "atorvastatin", dose: "40 mg", frequency: "once daily at bedtime", startedAt: "2021-09-01" },
    ],
  },
  {
    externalId: "PT-1007",
    firstName: "Emily",
    lastName: "Nakamura",
    dateOfBirth: null,
    sex: "F",
    phone: "5550101007",
    weightKg: null,
    allergiesVerified: false,
    allergies: [],
    conditions: [],
    medications: [],
  },
  {
    externalId: "PT-1008",
    firstName: "Thomas",
    lastName: "Brennan",
    dateOfBirth: "1958-01-27",
    sex: "M",
    phone: "5550101008",
    weightKg: 88,
    allergiesVerified: true,
    allergies: [{ substance: "NKDA", severity: "UNKNOWN", recordedAt: "2026-03-15" }],
    conditions: [
      { name: "Chronic low back pain", icd10: "M54.50" },
      { name: "Generalized anxiety disorder", icd10: "F41.1" },
    ],
    medications: [
      { name: "Alprazolam", genericName: "alprazolam", dose: "0.5 mg", frequency: "twice daily as needed", startedAt: "2024-05-10" },
      { name: "Gabapentin", genericName: "gabapentin", dose: "300 mg", frequency: "three times daily", startedAt: "2025-01-05" },
    ],
  },
];

/**
 * Historical prescriptions seeded as already-reviewed. Their reports are built
 * by running the deterministic rules package at seed time and are labeled as
 * such (no LLM narrative). The extraction block is hand-structured seed data.
 */
export interface SeedPrescription {
  externalRef: string;
  patientExternalId: string | null;
  daysAgo: number;
  reviewed: boolean;
  reviewedToday?: boolean;
  text: string;
  medications: Array<{ rawName: string; strength: string; sig: string; frequency: string; quantity: string; form?: string }>;
  prescriberName: string;
  reviewNotes?: string;
}

export const SEED_PRESCRIPTIONS: SeedPrescription[] = [
  {
    externalRef: "RX-SEED-0001",
    patientExternalId: "PT-1006",
    daysAgo: 3,
    reviewed: true,
    prescriberName: "Dr. Hana Lindqvist",
    text: "Naproxen 500 mg tablets. Take 1 tablet by mouth twice daily with food for 7 days. Qty 14. Dx: gout flare. Dr. Hana Lindqvist, 2026-10-21",
    medications: [{ rawName: "Naproxen 500 mg", strength: "500 mg", sig: "Take 1 tablet by mouth twice daily with food for 7 days", frequency: "twice daily", quantity: "14", form: "tablet" }],
    reviewNotes: "Called prescriber: switched to colchicine given GI bleed history and daily aspirin. Patient informed.",
  },
  {
    externalRef: "RX-SEED-0002",
    patientExternalId: "PT-1004",
    daysAgo: 2,
    reviewed: true,
    prescriberName: "Dr. Omar Haddad",
    text: "Sulfamethoxazole-trimethoprim DS 800/160 mg. 1 tab PO BID x 7 days. #14. UTI. Dr. Omar Haddad 2026-10-22",
    medications: [{ rawName: "Sulfamethoxazole-trimethoprim DS 800/160 mg", strength: "800/160 mg", sig: "1 tablet by mouth twice daily for 7 days", frequency: "twice daily", quantity: "14", form: "tablet" }],
    reviewNotes: "Sulfa allergy is a mild rash from 1998. Discussed with prescriber; changed to nitrofurantoin is not ideal at eGFR 42, prescriber chose cephalexin. Documented.",
  },
  {
    externalRef: "RX-SEED-0003",
    patientExternalId: "PT-1005",
    daysAgo: 1,
    reviewed: false,
    prescriberName: "Dr. Omar Haddad",
    text: "Ibuprofen 800 mg tablets. 1 PO q8h prn pain. #30. Dr. Omar Haddad 2026-10-23",
    medications: [{ rawName: "Ibuprofen 800 mg", strength: "800 mg", sig: "1 tablet by mouth every 8 hours as needed for pain", frequency: "every 8 hours", quantity: "30", form: "tablet" }],
  },
  {
    externalRef: "RX-SEED-0004",
    patientExternalId: "PT-1008",
    daysAgo: 1,
    reviewed: true,
    reviewedToday: true,
    prescriberName: "Dr. Hana Lindqvist",
    text: "Oxycodone-acetaminophen 5/325 mg. 1 tab PO q6h prn severe pain x 5 days. #20. Dr. Hana Lindqvist 2026-10-23",
    medications: [{ rawName: "Oxycodone-acetaminophen 5/325 mg", strength: "5/325 mg", sig: "1 tablet by mouth every 6 hours as needed for severe pain, 5 days", frequency: "every 6 hours", quantity: "20", form: "tablet" }],
    reviewNotes: "Opioid + benzodiazepine on profile. Prescriber confirmed short course, patient counseled on sedation risk, naloxone offered and dispensed.",
  },
  {
    externalRef: "RX-SEED-0005",
    patientExternalId: "PT-1003",
    daysAgo: 4,
    reviewed: true,
    prescriberName: "Dr. Priya Natarajan",
    text: "Loratadine 10 mg tablets. 1 PO daily. #30 RF 3. Dr. Priya Natarajan 2026-10-20",
    medications: [{ rawName: "Loratadine 10 mg", strength: "10 mg", sig: "Take 1 tablet by mouth once daily", frequency: "once daily", quantity: "30", form: "tablet" }],
    reviewNotes: "Reviewed; no concerns within checked criteria. Dispensed.",
  },
];
