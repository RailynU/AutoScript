---
id: autoscript-coverage-limitations
title: AutoScript demo - what the automated checks do and do not cover
source: AutoScript project documentation (apps/rx-engine/references/COVERAGE.md)
url: null
publisher: AutoScript hackathon team
year: 2026
kind: system-documentation
---
## Status of the system

AutoScript is a hackathon demonstration, not a validated clinical decision support product.

## What the deterministic rules cover

Deterministic rules cover: a curated interaction table of eight entries (warfarin with NSAIDs, sulfamethoxazole-trimethoprim, fluconazole and metronidazole; SSRI with NSAID; opioid with benzodiazepine; ACE inhibitor with NSAID; simvastatin with clarithromycin); allergy class conflicts for penicillins, cephalosporins, sulfonamides, NSAIDs, salicylates and opioids; a drug normalization map of roughly 140 generics with common brand aliases; duplicate-therapy detection for a few classes; daily-dose limits for acetaminophen and ibuprofen when strength and frequency can be parsed; five condition-drug conflicts (NSAID with CKD, ulcer history or heart failure; propranolol with asthma; metformin with advanced CKD); and a therapy-context classifier that labels each prescribed line as a short course, ongoing therapy or unknown from its duration, quantity, frequency and refills.

## What is not covered

Not covered: any drug outside the normalization map; renal or hepatic dose adjustment; pregnancy and lactation; pediatric weight-based dosing; QT prolongation; serotonin syndrome; controlled-substance regulatory checks; therapeutic duplication beyond the listed classes; and all interactions not in the table. A prescription that produces no findings has only been checked against the items listed above.

## Evidence collection

Evidence: the reference collection contains a small number of paraphrased summaries of FDA labeling, FDA safety communications, the 2023 AGS Beers Criteria, the 2022 AAAAI/ACAAI drug allergy practice parameter, CDC material on penicillin allergy, 21 CFR 1306.05 and Joint Commission/ISMP practice standards. Summaries are not verbatim quotations and should be verified against the primary source before being relied on.

## Role of the language model

The language model is used to extract structured data from documents and to write contextual explanations grounded in the retrieved references and the deterministic findings. It does not decide the disposition on its own. Its uncited statements are shown as unsupported observations, marked UNVERIFIED and displayed at LOW severity with the model's proposed severity kept visible. Its self-reported extraction confidence is used only as a threshold and is never shown as a number. Pharmacists make the final clinical decision.
