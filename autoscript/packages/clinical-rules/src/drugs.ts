/**
 * Local drug normalization map. Coverage is intentionally limited and documented
 * in apps/rx-engine/references/COVERAGE.md. Anything not listed is reported as
 * UNRESOLVED and triggers an extraction-uncertainty finding.
 *
 * Alias conventions: every alias is written the way cleanDrugName() would emit it
 * (lower case, no parentheses, no dosage, no form words such as "tabs" or "er").
 * Regional brands are only listed when the generic is unambiguous (single-ingredient
 * product, or a fixed combination that has its own entry). Combination brands are
 * mapped to a combination generic, never to one of their ingredients.
 *
 * Class membership drives rules: NSAID, PENICILLIN, CEPHALOSPORIN, SULFONAMIDE,
 * OPIOID, BENZODIAZEPINE, SSRI, STATIN, ACE_INHIBITOR, BETA_BLOCKER,
 * ANTICOAGULANT_VKA and ANALGESIC_ACETAMINOPHEN make interaction, allergy,
 * duplicate-therapy or dose rules fire, so a drug is only placed in one of those
 * classes when the pharmacology matches (e.g. sulfonylureas and Z-drugs stay OTHER).
 */
export type DrugClass =
  | "ANTICOAGULANT_VKA"
  | "NSAID"
  | "SALICYLATE"
  | "PENICILLIN"
  | "CEPHALOSPORIN"
  | "SULFONAMIDE"
  | "MACROLIDE"
  | "FLUOROQUINOLONE"
  | "STATIN"
  | "ACE_INHIBITOR"
  | "BETA_BLOCKER"
  | "SSRI"
  | "OPIOID"
  | "BENZODIAZEPINE"
  | "ANALGESIC_ACETAMINOPHEN"
  | "BIGUANIDE"
  | "PPI"
  | "ANTIHISTAMINE"
  | "THYROID"
  | "LOOP_DIURETIC"
  | "OTHER";

export interface DrugEntry {
  generic: string;
  classes: DrugClass[];
  aliases: string[];
}

export const DRUGS: DrugEntry[] = [
  // --- Anticoagulants / antiplatelets -------------------------------------------------------
  { generic: "warfarin", classes: ["ANTICOAGULANT_VKA"], aliases: ["coumadin", "jantoven", "warf"] },
  // Non-VKA anticoagulants stay OTHER: the curated warfarin interactions do not apply to them.
  { generic: "apixaban", classes: ["OTHER"], aliases: ["eliquis"] },
  { generic: "rivaroxaban", classes: ["OTHER"], aliases: ["xarelto"] },
  { generic: "enoxaparin", classes: ["OTHER"], aliases: ["lovenox", "clexane"] },
  { generic: "clopidogrel", classes: ["OTHER"], aliases: ["plavix", "clopilet"] },

  // --- NSAIDs / salicylates / acetaminophen --------------------------------------------------
  { generic: "ibuprofen", classes: ["NSAID"], aliases: ["advil", "motrin", "nurofen", "ibu", "brufen"] },
  { generic: "naproxen", classes: ["NSAID"], aliases: ["aleve", "naprosyn", "anaprox", "naproxen sodium"] },
  { generic: "meloxicam", classes: ["NSAID"], aliases: ["mobic"] },
  { generic: "diclofenac", classes: ["NSAID"], aliases: ["voltaren", "cataflam", "voveran"] },
  { generic: "aceclofenac", classes: ["NSAID"], aliases: ["zerodol", "hifenac"] },
  { generic: "celecoxib", classes: ["NSAID"], aliases: ["celebrex"] },
  { generic: "ketorolac", classes: ["NSAID"], aliases: ["toradol", "ketorol"] },
  { generic: "indomethacin", classes: ["NSAID"], aliases: ["indocin"] },
  { generic: "mefenamic acid", classes: ["NSAID"], aliases: ["ponstel", "meftal", "meftal-p", "meftal p"] },
  { generic: "aspirin", classes: ["SALICYLATE", "NSAID"], aliases: ["asa", "acetylsalicylic acid", "bayer", "ecotrin"] },
  { generic: "acetaminophen", classes: ["ANALGESIC_ACETAMINOPHEN"], aliases: ["tylenol", "apap", "paracetamol", "panadol", "crocin", "calpol", "dolo"] },
  // Metamizole is a pyrazolone analgesic, not an NSAID for the purposes of the NSAID rules.
  { generic: "metamizole", classes: ["OTHER"], aliases: ["dipyrone", "novalgin", "analgin"] },

  // --- Penicillins ---------------------------------------------------------------------------
  { generic: "amoxicillin", classes: ["PENICILLIN"], aliases: ["amoxil", "moxatag", "amox", "mox", "novamox"] },
  { generic: "amoxicillin-clavulanate", classes: ["PENICILLIN"], aliases: ["augmentin", "amoxicillin/clavulanate", "amox-clav", "amoxicillin clavulanate", "co-amoxiclav", "advent", "clavam"] },
  { generic: "ampicillin", classes: ["PENICILLIN"], aliases: ["principen"] },
  { generic: "ampicillin-sulbactam", classes: ["PENICILLIN"], aliases: ["unasyn", "ampicillin/sulbactam"] },
  { generic: "penicillin v", classes: ["PENICILLIN"], aliases: ["penicillin vk", "pen vk", "penicillin v potassium", "veetids", "penicillin"] },
  { generic: "piperacillin-tazobactam", classes: ["PENICILLIN"], aliases: ["zosyn", "pip-tazo"] },
  { generic: "dicloxacillin", classes: ["PENICILLIN"], aliases: ["dynapen"] },
  { generic: "oxacillin", classes: ["PENICILLIN"], aliases: ["bactocill"] },

  // --- Cephalosporins ------------------------------------------------------------------------
  { generic: "cephalexin", classes: ["CEPHALOSPORIN"], aliases: ["keflex", "phexin", "sporidex"] },
  { generic: "cefazolin", classes: ["CEPHALOSPORIN"], aliases: ["ancef", "kefzol"] },
  { generic: "cefdinir", classes: ["CEPHALOSPORIN"], aliases: ["omnicef"] },
  { generic: "cefuroxime", classes: ["CEPHALOSPORIN"], aliases: ["ceftin", "zinacef"] },
  { generic: "cefixime", classes: ["CEPHALOSPORIN"], aliases: ["suprax", "taxim-o", "zifi"] },
  { generic: "cefpodoxime", classes: ["CEPHALOSPORIN"], aliases: ["vantin"] },
  { generic: "ceftriaxone", classes: ["CEPHALOSPORIN"], aliases: ["rocephin"] },

  // --- Sulfonamides (antimicrobial / sulfonamide-hypersensitivity labelled only) ---------------
  { generic: "sulfamethoxazole-trimethoprim", classes: ["SULFONAMIDE"], aliases: ["bactrim", "septra", "smx-tmp", "tmp-smx", "sulfamethoxazole/trimethoprim", "co-trimoxazole"] },
  { generic: "sulfasalazine", classes: ["SULFONAMIDE"], aliases: ["azulfidine"] },

  // --- Macrolides / fluoroquinolones / other anti-infectives ----------------------------------
  { generic: "azithromycin", classes: ["MACROLIDE"], aliases: ["zithromax", "z-pak", "zpak", "z pack", "azee", "azithral"] },
  { generic: "clarithromycin", classes: ["MACROLIDE"], aliases: ["biaxin"] },
  { generic: "erythromycin", classes: ["MACROLIDE"], aliases: ["ery-tab", "erythrocin"] },
  { generic: "ciprofloxacin", classes: ["FLUOROQUINOLONE"], aliases: ["cipro", "ciplox"] },
  { generic: "levofloxacin", classes: ["FLUOROQUINOLONE"], aliases: ["levaquin"] },
  { generic: "ofloxacin", classes: ["FLUOROQUINOLONE"], aliases: ["floxin", "zanocin", "oflox"] },
  { generic: "doxycycline", classes: ["OTHER"], aliases: ["vibramycin", "doryx", "doxy", "doxy-1"] },
  { generic: "metronidazole", classes: ["OTHER"], aliases: ["flagyl", "metrogyl"] },
  { generic: "fluconazole", classes: ["OTHER"], aliases: ["diflucan", "forcan"] },
  { generic: "isavuconazonium", classes: ["OTHER"], aliases: ["isavuconazole", "cresemba"] },
  // Conventional (deoxycholate) and liposomal amphotericin B are distinct products with different dosing.
  { generic: "amphotericin b", classes: ["OTHER"], aliases: ["amphotericin", "amphotericin b deoxycholate", "conventional amphotericin b", "fungizone"] },
  { generic: "amphotericin b liposomal", classes: ["OTHER"], aliases: ["liposomal amphotericin b", "liposomal amphotericin", "l-amb", "ambisome", "phosome"] },
  { generic: "remdesivir", classes: ["OTHER"], aliases: ["veklury"] },
  { generic: "hydroxychloroquine", classes: ["OTHER"], aliases: ["plaquenil", "hydroxy chloroquine", "hcq", "hcqs"] },

  // --- Statins -------------------------------------------------------------------------------
  { generic: "atorvastatin", classes: ["STATIN"], aliases: ["lipitor", "atorva"] },
  { generic: "simvastatin", classes: ["STATIN"], aliases: ["zocor"] },
  { generic: "rosuvastatin", classes: ["STATIN"], aliases: ["crestor"] },
  { generic: "pravastatin", classes: ["STATIN"], aliases: ["pravachol"] },

  // --- ACE inhibitors / ARBs / other cardiovascular ------------------------------------------
  { generic: "lisinopril", classes: ["ACE_INHIBITOR"], aliases: ["zestril", "prinivil"] },
  { generic: "enalapril", classes: ["ACE_INHIBITOR"], aliases: ["vasotec"] },
  { generic: "ramipril", classes: ["ACE_INHIBITOR"], aliases: ["altace"] },
  { generic: "benazepril", classes: ["ACE_INHIBITOR"], aliases: ["lotensin"] },
  { generic: "losartan", classes: ["OTHER"], aliases: ["cozaar", "losar"] },
  { generic: "telmisartan", classes: ["OTHER"], aliases: ["micardis", "telma"] },
  { generic: "amlodipine", classes: ["OTHER"], aliases: ["norvasc", "stamlo", "amlong"] },
  { generic: "nifedipine", classes: ["OTHER"], aliases: ["procardia", "adalat", "nicardia"] },
  { generic: "felodipine", classes: ["OTHER"], aliases: ["plendil"] },
  { generic: "hydrochlorothiazide", classes: ["OTHER"], aliases: ["hctz", "microzide"] },
  { generic: "digoxin", classes: ["OTHER"], aliases: ["lanoxin"] },
  { generic: "nitroglycerin", classes: ["OTHER"], aliases: ["glyceryl trinitrate", "gtn", "nitrostat", "nitricontin"] },
  { generic: "epinephrine", classes: ["OTHER"], aliases: ["adrenalin", "adrenaline", "epipen"] },

  // --- Beta blockers -------------------------------------------------------------------------
  { generic: "metoprolol", classes: ["BETA_BLOCKER"], aliases: ["lopressor", "toprol", "toprol xl", "metoprolol succinate", "metoprolol tartrate", "betaloc", "metocard", "metolar"] },
  { generic: "atenolol", classes: ["BETA_BLOCKER"], aliases: ["tenormin", "aten"] },
  { generic: "propranolol", classes: ["BETA_BLOCKER"], aliases: ["inderal"] },
  { generic: "carvedilol", classes: ["BETA_BLOCKER"], aliases: ["coreg"] },
  { generic: "bisoprolol", classes: ["BETA_BLOCKER"], aliases: ["zebeta", "concor"] },

  // --- SSRIs / other psychotropics -----------------------------------------------------------
  { generic: "sertraline", classes: ["SSRI"], aliases: ["zoloft"] },
  { generic: "fluoxetine", classes: ["SSRI"], aliases: ["prozac"] },
  { generic: "escitalopram", classes: ["SSRI"], aliases: ["lexapro", "nexito"] },
  { generic: "citalopram", classes: ["SSRI"], aliases: ["celexa"] },
  { generic: "paroxetine", classes: ["SSRI"], aliases: ["paxil"] },
  { generic: "methylphenidate", classes: ["OTHER"], aliases: ["ritalin", "concerta", "metadate"] },
  // Zolpidem is a non-benzodiazepine hypnotic; it is deliberately not in BENZODIAZEPINE.
  { generic: "zolpidem", classes: ["OTHER"], aliases: ["ambien", "stilnox"] },

  // --- Opioids -------------------------------------------------------------------------------
  { generic: "tramadol", classes: ["OPIOID"], aliases: ["ultram", "tramal", "tramazac"] },
  { generic: "tramadol-acetaminophen", classes: ["OPIOID", "ANALGESIC_ACETAMINOPHEN"], aliases: ["ultracet", "tramadol/apap", "tramadol-apap", "tramadol/acetaminophen", "tramadol acetaminophen", "tramadol/paracetamol", "tramadol paracetamol"] },
  { generic: "oxycodone", classes: ["OPIOID"], aliases: ["oxycontin", "roxicodone"] },
  { generic: "oxycodone-acetaminophen", classes: ["OPIOID", "ANALGESIC_ACETAMINOPHEN"], aliases: ["percocet", "oxycodone/apap", "oxycodone-apap", "endocet"] },
  { generic: "hydrocodone-acetaminophen", classes: ["OPIOID", "ANALGESIC_ACETAMINOPHEN"], aliases: ["norco", "vicodin", "lortab", "hydrocodone/apap", "hydrocodone-apap"] },
  { generic: "acetaminophen-codeine", classes: ["OPIOID", "ANALGESIC_ACETAMINOPHEN"], aliases: ["tylenol 3", "tylenol with codeine", "tylenol-codeine", "acetaminophen/codeine", "acetaminophen with codeine", "apap/codeine", "apap-codeine"] },
  { generic: "codeine", classes: ["OPIOID"], aliases: ["codeine phosphate", "codeine sulfate"] },
  { generic: "morphine", classes: ["OPIOID"], aliases: ["ms contin", "morphine sulfate", "kadian"] },
  { generic: "hydromorphone", classes: ["OPIOID"], aliases: ["dilaudid"] },
  { generic: "methadone", classes: ["OPIOID"], aliases: ["dolophine", "methadose"] },

  // --- Benzodiazepines -----------------------------------------------------------------------
  { generic: "alprazolam", classes: ["BENZODIAZEPINE"], aliases: ["xanax", "alprax"] },
  { generic: "lorazepam", classes: ["BENZODIAZEPINE"], aliases: ["ativan"] },
  { generic: "diazepam", classes: ["BENZODIAZEPINE"], aliases: ["valium"] },
  { generic: "clonazepam", classes: ["BENZODIAZEPINE"], aliases: ["klonopin", "rivotril"] },
  { generic: "temazepam", classes: ["BENZODIAZEPINE"], aliases: ["restoril"] },
  { generic: "clobazam", classes: ["BENZODIAZEPINE"], aliases: ["onfi", "frisium"] },
  { generic: "flunitrazepam", classes: ["BENZODIAZEPINE"], aliases: ["rohypnol", "hypnodorm"] },

  // --- Diabetes ------------------------------------------------------------------------------
  { generic: "metformin", classes: ["BIGUANIDE"], aliases: ["glucophage", "glumetza", "glycomet"] },
  // Sulfonylureas are not antimicrobial sulfonamides; the sulfa allergy rule must not fire.
  { generic: "glipizide", classes: ["OTHER"], aliases: ["glucotrol"] },
  { generic: "tolbutamide", classes: ["OTHER"], aliases: ["orinase"] },
  { generic: "insulin glargine", classes: ["OTHER"], aliases: ["lantus", "basaglar", "toujeo"] },
  { generic: "insulin nph", classes: ["OTHER"], aliases: ["insulin isophane", "isophane insulin", "nph insulin", "nph", "humulin n", "novolin n", "insulatard"] },
  { generic: "insulin regular", classes: ["OTHER"], aliases: ["regular insulin", "humulin r", "novolin r", "actrapid"] },
  { generic: "insulin aspart", classes: ["OTHER"], aliases: ["novolog", "novorapid", "fiasp"] },
  { generic: "insulin lispro", classes: ["OTHER"], aliases: ["humalog", "admelog", "lyumjev"] },

  // --- Acid suppression / GI -----------------------------------------------------------------
  { generic: "omeprazole", classes: ["PPI"], aliases: ["prilosec", "losec", "omez", "risek"] },
  { generic: "esomeprazole", classes: ["PPI"], aliases: ["nexium", "sompraz", "nexpro"] },
  { generic: "pantoprazole", classes: ["PPI"], aliases: ["protonix", "pan", "pantop", "pantocid", "pantodac"] },
  { generic: "pantoprazole-domperidone", classes: ["PPI"], aliases: ["pan d", "pan-d", "pantop d", "pantop-d", "pantocid d", "pantocid-d", "pantoprazole/domperidone", "pantoprazole domperidone"] },
  { generic: "lansoprazole", classes: ["PPI"], aliases: ["prevacid", "lanzol"] },
  { generic: "rabeprazole", classes: ["PPI"], aliases: ["aciphex", "razo"] },
  { generic: "ranitidine", classes: ["OTHER"], aliases: ["zantac", "rantac", "aciloc", "zinetac"] },
  { generic: "famotidine", classes: ["OTHER"], aliases: ["pepcid"] },
  { generic: "cimetidine", classes: ["OTHER"], aliases: ["tagamet"] },
  { generic: "ondansetron", classes: ["OTHER"], aliases: ["zofran", "zofer", "emeset", "ondem"] },
  { generic: "metoclopramide", classes: ["OTHER"], aliases: ["reglan", "perinorm", "maxolon"] },
  { generic: "domperidone", classes: ["OTHER"], aliases: ["motilium", "domstal"] },
  { generic: "oral rehydration salts", classes: ["OTHER"], aliases: ["ors", "electral"] },
  { generic: "bacillus clausii", classes: ["OTHER"], aliases: ["enterogermina"] },
  { generic: "glycerin", classes: ["OTHER"], aliases: ["glycerol"] },

  // --- Antihistamines / respiratory ----------------------------------------------------------
  { generic: "cetirizine", classes: ["ANTIHISTAMINE"], aliases: ["zyrtec", "cetzine", "cetrizine", "alerid"] },
  { generic: "levocetirizine", classes: ["ANTIHISTAMINE"], aliases: ["xyzal", "levocet"] },
  { generic: "loratadine", classes: ["ANTIHISTAMINE"], aliases: ["claritin"] },
  { generic: "fexofenadine", classes: ["ANTIHISTAMINE"], aliases: ["allegra"] },
  { generic: "diphenhydramine", classes: ["ANTIHISTAMINE"], aliases: ["benadryl"] },
  { generic: "pheniramine", classes: ["ANTIHISTAMINE"], aliases: ["avil"] },
  { generic: "albuterol", classes: ["OTHER"], aliases: ["proair", "ventolin", "proventil", "salbutamol", "asthalin"] },
  { generic: "montelukast", classes: ["OTHER"], aliases: ["singulair", "montair", "montek"] },
  { generic: "sodium chloride", classes: ["OTHER"], aliases: ["saline", "normal saline", "nasoclear"] },

  // --- Thyroid / diuretics -------------------------------------------------------------------
  { generic: "levothyroxine", classes: ["THYROID"], aliases: ["synthroid", "levoxyl", "unithroid", "thyrox", "eltroxin", "thyronorm"] },
  { generic: "furosemide", classes: ["LOOP_DIURETIC"], aliases: ["lasix", "frusemide"] },

  // --- Corticosteroids / immunology / oncology support ---------------------------------------
  { generic: "prednisone", classes: ["OTHER"], aliases: ["deltasone"] },
  { generic: "prednisolone", classes: ["OTHER"], aliases: ["orapred", "millipred", "prelone", "omnacortil", "wysolone"] },
  { generic: "methylprednisolone", classes: ["OTHER"], aliases: ["medrol", "solu-medrol"] },
  { generic: "dexamethasone", classes: ["OTHER"], aliases: ["decadron", "dexona", "dexamethasone sodium phosphate"] },
  { generic: "tocilizumab", classes: ["OTHER"], aliases: ["actemra"] },
  { generic: "denosumab", classes: ["OTHER"], aliases: ["xgeva", "prolia"] },
  { generic: "diethylstilbestrol", classes: ["OTHER"], aliases: ["stilbestrol"] },

  // --- Neurology / musculoskeletal -----------------------------------------------------------
  { generic: "gabapentin", classes: ["OTHER"], aliases: ["neurontin", "gabapin"] },
  { generic: "phenytoin", classes: ["OTHER"], aliases: ["dilantin", "eptoin", "phenytoin sodium"] },
  { generic: "carbidopa-levodopa-entacapone", classes: ["OTHER"], aliases: ["stalevo"] },

  // --- Supplements / topical / ophthalmic ----------------------------------------------------
  { generic: "ferrous sulfate", classes: ["OTHER"], aliases: ["feso4", "iron sulfate", "slow fe"] },
  { generic: "ascorbic acid", classes: ["OTHER"], aliases: ["vitamin c", "vit c"] },
  { generic: "chlorhexidine", classes: ["OTHER"], aliases: ["peridex", "hexigel"] },
  { generic: "dorzolamide", classes: ["OTHER"], aliases: ["trusopt", "dorzolamidum"] },
];

const byAlias = new Map<string, DrugEntry>();
for (const entry of DRUGS) {
  byAlias.set(entry.generic, entry);
  for (const alias of entry.aliases) byAlias.set(alias, entry);
}

/** Minimum length for a lone token inside a longer string to count as a match. */
const MIN_TOKEN_MATCH_LENGTH = 5;

/** Lower-case, strip dosage noise ("Ibuprofen 600mg tabs" -> "ibuprofen"). */
export function cleanDrugName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|units?|%|iu)\b.*$/i, " ")
    .replace(/\b(tablets?|tabs?|capsules?|caps?|oral|susp(ension)?|solution|er|xl|sr|dr|odt)\b/g, " ")
    .replace(/[^a-z0-9/\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lookupCleaned(cleaned: string): DrugEntry | null {
  const direct = byAlias.get(cleaned);
  if (direct) return direct;
  // Try progressively shorter prefixes ("amoxicillin clavulanate potassium" -> "amoxicillin clavulanate").
  const words = cleaned.split(" ");
  for (let n = words.length - 1; n >= 1; n--) {
    const candidate = words.slice(0, n).join(" ");
    const hit = byAlias.get(candidate);
    if (hit) return hit;
  }
  // Then suffixes, which drop a leading form word ("inj liposomal amphotericin b" -> "liposomal amphotericin b").
  for (let start = 1; start < words.length; start++) {
    const hit = byAlias.get(words.slice(start).join(" "));
    if (hit) return hit;
  }
  // Last resort: a single known token inside the string (e.g. "brand-name ibuprofen caplets").
  for (const word of words) {
    const hit = byAlias.get(word);
    if (hit && word.length >= MIN_TOKEN_MATCH_LENGTH) return hit;
  }
  return null;
}

/** Text written in parentheses, e.g. the generic after a brand: "LCZ (Levocetirizine)". */
function parentheticals(raw: string): string[] {
  return Array.from(raw.matchAll(/\(([^()]*)\)/g), (m) => m[1] ?? "").filter((s) => s.trim().length > 0);
}

export function lookupDrug(raw: string): DrugEntry | null {
  const cleaned = cleanDrugName(raw);
  const fromMain = cleaned ? lookupCleaned(cleaned) : null;
  if (fromMain) return fromMain;
  // cleanDrugName drops parenthesised text; a prescriber often puts the generic there.
  for (const inner of parentheticals(raw)) {
    const innerCleaned = cleanDrugName(inner);
    const hit = innerCleaned ? lookupCleaned(innerCleaned) : null;
    if (hit) return hit;
  }
  return null;
}

export function normalizeDrugName(raw: string): { generic: string | null; classes: DrugClass[] } {
  const entry = lookupDrug(raw);
  return entry ? { generic: entry.generic, classes: entry.classes } : { generic: null, classes: [] };
}

export function classesOf(generic: string | null): DrugClass[] {
  if (!generic) return [];
  return byAlias.get(generic)?.classes ?? [];
}
