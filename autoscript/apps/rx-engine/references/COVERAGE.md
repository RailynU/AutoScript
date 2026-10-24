# Reference collection and coverage limitations

This folder is the entire evidence base available to the RX Engine. Each `*.md` file has YAML frontmatter (`id`, `title`, `source`, `url`, `publisher`, `year`, `kind`) and a body that is a **paraphrased summary** of the cited source, written for this demo. Summaries are not verbatim quotations. Verify against the primary source before relying on any statement clinically.

Body format: a one-line disclaimer before the first heading, then one `## Heading` per section of the source (label section, criterion, table). Ingestion cuts chunks so that no chunk spans two headings and stores the heading as the chunk's `section`; every citation in a report therefore names the document and the section it rests on, and the UI de-duplicates evidence per finding by document + section. Text before the first heading has no section and is attached last. A finding about a short course never attaches the Beers "Non-COX-selective NSAIDs: avoid chronic use" section, whichever documents the rule cites and however the chunk was retrieved; the second clause of the same criterion ("avoid short-term scheduled use with anticoagulants, antiplatelets or corticosteroids") is attached by the warfarin + NSAID entry at any duration, because Beers 2023 Table 2 says so (checked 2026-10-24, `apps/rx-engine/src/eval/validation.ts`).

## Documents

| id | source | used by |
|---|---|---|
| fda-warfarin-label-interactions | Coumadin PI 2017, sections 5.1 and 7 | warfarin interaction rules |
| fda-ibuprofen-label-anticoagulants | Motrin PI, boxed warning, interactions, dosing | warfarin+NSAID, NSAID allergy, ibuprofen dose limit |
| fda-amoxicillin-label-contraindications | Amoxicillin PI, sections 4 and 5.1 | penicillin allergy rule |
| aaaai-penicillin-allergy-evaluation | 2022 AAAAI/ACAAI drug allergy practice parameter; CDC fact sheet | penicillin allergy rule |
| cephalosporin-cross-reactivity | 2022 practice parameter; Zagursky & Pichichero 2018 | cephalosporin cross-reactivity |
| fda-acetaminophen-max-dose | FDA DSC 2011-01-13 | acetaminophen dose rule |
| fda-lisinopril-label-nsaids | Lisinopril PI 2026, section 7.3 | ACEi+NSAID |
| beers-criteria-2023-nsaids | AGS Beers Criteria 2023 (Tables 2, 3, 5, 8) | warfarin+NSAID (short-term clause for a short course, chronic-use clause for ongoing therapy), SSRI+NSAID (ongoing only), NSAID condition conflicts, duplicate therapy |
| fda-ssri-label-bleeding | Zoloft PI 2021, section 5 | SSRI+NSAID |
| fda-opioid-benzodiazepine-boxed-warning | FDA DSC 2016-08-31 | opioid+benzodiazepine |
| fda-simvastatin-label-cyp3a4 | FDA DSC 2011-06-08 | simvastatin+clarithromycin |
| fda-smx-tmp-label-contraindications | Bactrim PI 2021 | sulfa allergy rule |
| fda-propranolol-label-asthma | Inderal PI 2010 | propranolol+asthma |
| fda-metformin-label-renal | FDA DSC 2016-04-08 | metformin+advanced CKD |
| cfr-1306-05-prescription-requirements | 21 CFR 1306.05 | missing prescription fields |
| joint-commission-medication-reconciliation | TJC NPSG.03.06.01; ISMP guidance | missing patient / allergy history |
| autoscript-coverage-limitations | this project | unresolved drugs, extraction uncertainty |

## What is NOT covered

- Any drug not present in `packages/clinical-rules/src/drugs.ts` (141 generics with US brand aliases plus common Indian/UK brands whose generic is unambiguous; combination brands map to a combination generic, never to one ingredient). Unrecognized names produce an explicit `EXTRACTION_UNCERTAINTY` finding and are excluded from checks. Regional brands, abbreviations ("T. Dexa") and combination products that are not in the alias list stay unresolved by design: the map is extended only from authoritative knowledge, never by guessing. `pnpm dataset:build` re-normalizes cached medication names from this map, so extending it re-labels `datasets/prescriptions` without model calls.
- Interactions outside the eight curated entries in `interactions.ts`.
- Renal/hepatic dose adjustment, pregnancy/lactation, pediatrics, QT prolongation, serotonin syndrome, controlled-substance law, immunization and compounding checks.
- Anything that requires the full text of a label: the collection holds short summaries only.

## How the pieces fit

1. Deterministic rules decide whether a prescription needs manual review. They cite document ids from this folder.
2. Retrieval (pgvector cosine similarity when an embedding provider is configured, otherwise Postgres full-text search) pulls the most relevant chunks for each finding and for the medication list. The report states which method was used.
3. The LLM writes the contextual explanation using only the retrieved chunks. Citations to chunk ids that were not provided are dropped and counted in `ai.rejectedCitations`. AI observations that are not backed by a deterministic rule are labeled as such, and a MODERATE-or-higher AI observation still routes the prescription to manual review rather than being ignored.
4. "No flags detected within checked criteria" means exactly that: none of the items above fired. It is never presented as "safe".
