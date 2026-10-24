/**
 * Synthetic US prescribing vocabulary. Every name, clinic, address, phone, NPI and DEA number
 * here is invented; 555-01xx phones and the "Example" / "Demo" clinic names are reserved for fiction.
 */
export interface CatalogDrug {
  generic: string;
  /** How the drug may be written on the script (brand or generic, title case). */
  written: string[];
  strengths: string[];
  form: string;
  route: string;
  /** Directions; the frequency wording is one the dose parser recognizes. */
  sigs: string[];
  quantities: string[];
  indication: string;
  controlled?: boolean;
}

export const DRUG_CATALOG: CatalogDrug[] = [
  { generic: "warfarin", written: ["Warfarin", "Coumadin", "Jantoven"], strengths: ["2 mg", "5 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily as directed by anticoagulation clinic"], quantities: ["30", "90"], indication: "atrial fibrillation" },
  { generic: "ibuprofen", written: ["Ibuprofen", "Motrin"], strengths: ["400 mg", "600 mg", "800 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth every 8 hours as needed for pain", "Take 1 tablet by mouth three times daily with food"], quantities: ["30", "60"], indication: "pain" },
  { generic: "naproxen", written: ["Naproxen", "Naprosyn"], strengths: ["250 mg", "500 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth twice daily with food"], quantities: ["30", "60"], indication: "pain" },
  { generic: "meloxicam", written: ["Meloxicam", "Mobic"], strengths: ["7.5 mg", "15 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily"], quantities: ["30"], indication: "osteoarthritis" },
  { generic: "celecoxib", written: ["Celecoxib", "Celebrex"], strengths: ["100 mg", "200 mg"], form: "capsule", route: "by mouth", sigs: ["Take 1 capsule by mouth twice daily"], quantities: ["60"], indication: "osteoarthritis" },
  { generic: "amoxicillin", written: ["Amoxicillin", "Amoxil"], strengths: ["500 mg", "875 mg"], form: "capsule", route: "by mouth", sigs: ["Take 1 capsule by mouth three times daily for 10 days", "Take 1 capsule by mouth twice daily for 7 days"], quantities: ["20", "30"], indication: "sinusitis" },
  { generic: "amoxicillin-clavulanate", written: ["Amoxicillin-Clavulanate", "Augmentin"], strengths: ["875-125 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth twice daily for 10 days"], quantities: ["20"], indication: "otitis media" },
  { generic: "cephalexin", written: ["Cephalexin", "Keflex"], strengths: ["500 mg"], form: "capsule", route: "by mouth", sigs: ["Take 1 capsule by mouth four times daily for 7 days"], quantities: ["28"], indication: "skin infection" },
  { generic: "cefdinir", written: ["Cefdinir", "Omnicef"], strengths: ["300 mg"], form: "capsule", route: "by mouth", sigs: ["Take 1 capsule by mouth twice daily for 10 days"], quantities: ["20"], indication: "bronchitis" },
  { generic: "sulfamethoxazole-trimethoprim", written: ["Sulfamethoxazole-Trimethoprim DS", "Bactrim DS"], strengths: ["800-160 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth twice daily for 7 days"], quantities: ["14"], indication: "urinary tract infection" },
  { generic: "azithromycin", written: ["Azithromycin", "Zithromax"], strengths: ["250 mg"], form: "tablet", route: "by mouth", sigs: ["Take 2 tablets by mouth on day 1, then 1 tablet daily for 4 days"], quantities: ["6"], indication: "community-acquired pneumonia" },
  { generic: "clarithromycin", written: ["Clarithromycin", "Biaxin"], strengths: ["500 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth twice daily for 10 days"], quantities: ["20"], indication: "H. pylori regimen" },
  { generic: "fluconazole", written: ["Fluconazole", "Diflucan"], strengths: ["150 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily for 3 days"], quantities: ["3"], indication: "candidiasis" },
  { generic: "metronidazole", written: ["Metronidazole", "Flagyl"], strengths: ["500 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth three times daily for 7 days"], quantities: ["21"], indication: "bacterial vaginosis" },
  { generic: "doxycycline", written: ["Doxycycline Hyclate", "Vibramycin"], strengths: ["100 mg"], form: "capsule", route: "by mouth", sigs: ["Take 1 capsule by mouth twice daily for 10 days"], quantities: ["20"], indication: "acne" },
  { generic: "ciprofloxacin", written: ["Ciprofloxacin", "Cipro"], strengths: ["500 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth twice daily for 7 days"], quantities: ["14"], indication: "urinary tract infection" },
  { generic: "atorvastatin", written: ["Atorvastatin", "Lipitor"], strengths: ["10 mg", "20 mg", "40 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily at bedtime"], quantities: ["30", "90"], indication: "hyperlipidemia" },
  { generic: "simvastatin", written: ["Simvastatin", "Zocor"], strengths: ["20 mg", "40 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily at bedtime"], quantities: ["30", "90"], indication: "hyperlipidemia" },
  { generic: "lisinopril", written: ["Lisinopril", "Zestril"], strengths: ["10 mg", "20 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily"], quantities: ["30", "90"], indication: "hypertension" },
  { generic: "losartan", written: ["Losartan", "Cozaar"], strengths: ["50 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily"], quantities: ["30", "90"], indication: "hypertension" },
  { generic: "amlodipine", written: ["Amlodipine", "Norvasc"], strengths: ["5 mg", "10 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily"], quantities: ["30", "90"], indication: "hypertension" },
  { generic: "metoprolol", written: ["Metoprolol Tartrate", "Lopressor"], strengths: ["25 mg", "50 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth twice daily"], quantities: ["60"], indication: "hypertension" },
  { generic: "propranolol", written: ["Propranolol", "Inderal"], strengths: ["20 mg", "40 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth twice daily"], quantities: ["60"], indication: "migraine prophylaxis" },
  { generic: "sertraline", written: ["Sertraline", "Zoloft"], strengths: ["50 mg", "100 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily"], quantities: ["30", "90"], indication: "depression" },
  { generic: "escitalopram", written: ["Escitalopram", "Lexapro"], strengths: ["10 mg", "20 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily"], quantities: ["30"], indication: "anxiety" },
  { generic: "tramadol", written: ["Tramadol", "Ultram"], strengths: ["50 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth every 6 hours as needed for pain"], quantities: ["20"], indication: "pain", controlled: true },
  { generic: "oxycodone", written: ["Oxycodone HCl", "Roxicodone"], strengths: ["5 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth every 6 hours as needed for severe pain"], quantities: ["12", "20"], indication: "post-operative pain", controlled: true },
  { generic: "hydrocodone-acetaminophen", written: ["Hydrocodone-Acetaminophen", "Norco"], strengths: ["5-325 mg", "10-325 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth every 6 hours as needed for pain"], quantities: ["12", "20"], indication: "post-operative pain", controlled: true },
  { generic: "alprazolam", written: ["Alprazolam", "Xanax"], strengths: ["0.5 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth twice daily as needed for anxiety"], quantities: ["30"], indication: "anxiety", controlled: true },
  { generic: "lorazepam", written: ["Lorazepam", "Ativan"], strengths: ["0.5 mg", "1 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth at bedtime as needed"], quantities: ["30"], indication: "insomnia", controlled: true },
  { generic: "acetaminophen", written: ["Acetaminophen", "Tylenol"], strengths: ["325 mg", "500 mg"], form: "tablet", route: "by mouth", sigs: ["Take 2 tablets by mouth every 6 hours as needed for pain"], quantities: ["60"], indication: "pain" },
  { generic: "metformin", written: ["Metformin", "Glucophage"], strengths: ["500 mg", "1000 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth twice daily with meals"], quantities: ["60", "180"], indication: "type 2 diabetes" },
  { generic: "omeprazole", written: ["Omeprazole", "Prilosec"], strengths: ["20 mg", "40 mg"], form: "capsule", route: "by mouth", sigs: ["Take 1 capsule by mouth once daily before breakfast"], quantities: ["30", "90"], indication: "GERD" },
  { generic: "cetirizine", written: ["Cetirizine", "Zyrtec"], strengths: ["10 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily"], quantities: ["30"], indication: "allergic rhinitis" },
  { generic: "levothyroxine", written: ["Levothyroxine", "Synthroid"], strengths: ["50 mcg", "75 mcg", "100 mcg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily on an empty stomach"], quantities: ["30", "90"], indication: "hypothyroidism" },
  { generic: "gabapentin", written: ["Gabapentin", "Neurontin"], strengths: ["300 mg"], form: "capsule", route: "by mouth", sigs: ["Take 1 capsule by mouth three times daily"], quantities: ["90"], indication: "neuropathic pain" },
  { generic: "prednisone", written: ["Prednisone"], strengths: ["10 mg", "20 mg"], form: "tablet", route: "by mouth", sigs: ["Take 2 tablets by mouth once daily for 5 days"], quantities: ["10"], indication: "asthma exacerbation" },
  { generic: "montelukast", written: ["Montelukast", "Singulair"], strengths: ["10 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily at bedtime"], quantities: ["30"], indication: "asthma" },
  { generic: "furosemide", written: ["Furosemide", "Lasix"], strengths: ["20 mg", "40 mg"], form: "tablet", route: "by mouth", sigs: ["Take 1 tablet by mouth once daily in the morning"], quantities: ["30"], indication: "edema" },
];

export const drugByGeneric = (generic: string): CatalogDrug => {
  const d = DRUG_CATALOG.find((x) => x.generic === generic);
  if (!d) throw new Error(`Catalog has no entry for ${generic}`);
  return d;
};

/** Drugs that trigger none of the curated interaction, allergy, dose or condition rules on their own. */
export const SAFE_GENERICS = ["atorvastatin", "amlodipine", "losartan", "metformin", "omeprazole", "cetirizine", "levothyroxine", "gabapentin", "montelukast", "doxycycline", "azithromycin", "metoprolol", "furosemide", "prednisone"];

export const FIRST_NAMES = ["Avery", "Jordan", "Riley", "Morgan", "Casey", "Taylor", "Harper", "Quinn", "Elena", "Marcus", "Priya", "Daniel", "Sofia", "Ethan", "Naomi", "Victor", "Lena", "Omar", "Grace", "Isaac", "Maya", "Felix", "Nora", "Jonah", "Ruth", "Caleb", "Iris", "Miles", "Clara", "Hugo"];
export const LAST_NAMES = ["Whitfield", "Okafor", "Delgado", "Lindqvist", "Patel", "Brennan", "Nakamura", "Castellano", "Haddad", "Fitzgerald", "Morales", "Sorensen", "Abernathy", "Kowalski", "Reyes", "Thornton", "Vasquez", "Chen", "Dubois", "Mahoney", "Ortega", "Pierce", "Ramsey", "Sato", "Underwood"];
export const PRESCRIBERS = [
  { name: "Dr. Helen Marchetti, MD", clinic: "Riverbend Family Medicine", street: "1420 Harbor View Drive, Suite 210", cityState: "Springfield, IL 62704" },
  { name: "Dr. Samuel Okonkwo, DO", clinic: "Northgate Internal Medicine", street: "88 Prairie Center Road", cityState: "Columbus, OH 43215" },
  { name: "Dr. Anita Raghavan, MD", clinic: "Lakeside Urgent Care", street: "305 Mill Street", cityState: "Madison, WI 53703" },
  { name: "Dr. Thomas Bergstrom, MD", clinic: "Cedar Valley Orthopedics", street: "2200 Summit Avenue, Floor 3", cityState: "Boise, ID 83702" },
  { name: "Dr. Lucia Ferreira, MD", clinic: "Eastline Pediatrics & Family Care", street: "17 Cannery Row", cityState: "Portland, ME 04101" },
  { name: "Dr. Kevin Adeyemi, PA-C", clinic: "Maple Grove Community Health", street: "960 Orchard Lane", cityState: "Lincoln, NE 68508" },
];
export const STREETS = ["Willow Court", "Birch Lane", "Elm Street", "Lakeshore Drive", "Granite Way", "Cedar Ridge Road", "Juniper Avenue", "Foxglove Terrace"];
export const CITIES = ["Springfield, IL 62704", "Columbus, OH 43215", "Madison, WI 53703", "Boise, ID 83702", "Portland, ME 04101", "Lincoln, NE 68508", "Tucson, AZ 85701", "Raleigh, NC 27601"];
