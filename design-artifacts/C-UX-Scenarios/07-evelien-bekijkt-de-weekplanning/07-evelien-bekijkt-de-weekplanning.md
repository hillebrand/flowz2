---
design_intent: S
design_status: not-started
---

# 07: Evelien Bekijkt de Weekplanning

**Project:** Flowz
**Created:** 2026-07-23
**Method:** Whiteport Design Studio (WDS)

---

## Transaction (Q1)

**What this scenario covers:**
Evelien bekijkt de week vooruit en ziet direct welke dag(en) een knelpunt zijn (te weinig beschikbare tijd), met een concrete suggestie om dat op te lossen — zonder zelf de cijfers te hoeven doorgronden.

---

## Business Goal (Q2)

**Goal:** 🚀 Schuldvrij herstel & organische uitbreiding
**Objective:** Objective 2 — Minder gemiste deadlines: vroegtijdig zicht op een drukke dag, mét oplossing, voorkomt verrassingen later in de week.

---

## User & Situation (Q3)

**Persona:** Evelien (Primair)
**Situatie:** Aan het begin van de week (bijv. zondagavond) wil ze een beknopt beeld krijgen van hoe druk de komende week wordt, zonder er zelf iets voor te hoeven uitrekenen.

---

## Driving Forces (Q4)

**Hope:** Dat Flowz haar direct wijst op een probleemdag mét een concrete oplossing, in plaats van dat zij zelf de cijfers moet interpreteren.

**Worry:** Een drukke dag over het hoofd zien omdat ze de cijfers zelf niet goed doorgrondt.

---

## Device & Starting Point (Q5 + Q6)

**Device:** Desktop (primair) — moet ook op Mobile bruikbaar zijn, met minder onderdelen tegelijk zichtbaar (verkorte weergave).
**Entry:** Via het hamburgermenu, vanaf welk scherm dan ook.

---

## Best Outcome (Q7)

**User Success:**
Ziet meteen welke dag(en) een knelpunt zijn (gemarkeerd) en krijgt per knelpunt een concrete suggestie — vergelijkbaar met de aanbevelingen uit scenario 03 — om dat te verhelpen.

**Business Success:**
Minder gemiste deadlines doordat problemen al vroeg in de week zichtbaar én meteen oplosbaar zijn, niet pas op de dag zelf via UJ-6.

---

## Shortest Path (Q8)

1. **Weekoverzicht** — bekijkt per dag beschikbare/benodigde tijd, ingeplande taken en Calendar-items; knelpunt-dagen worden gemarkeerd mét een oplossingssuggestie die ze direct kan accepteren ✓

*Eén stap — het signaleren van knelpunten en het accepteren van een suggestie gebeurt op dezelfde pagina (on-page interactie), zodat het pad lineair blijft. Hergebruikt visueel dezelfde aanbevelingslogica als scenario 03 (3.2-tekort-oplossen).*

---

## Trigger Map Connections

**Persona:** Evelien (Primair)

**Driving Forces Addressed:**
- ✅ **Want:** "Een planning die overeind blijft, ook als een dag tegenvalt" — preventieve geruststelling, vroeg in de week

**Business Goal:** Schuldvrij herstel & uitbreiding — Objective 2 (Consider-tier, score 3)

---

## Scenario Steps

| Step | Folder | Purpose | Exit Action |
|------|--------|---------|-------------|
| 7.1 | `7.1-weekoverzicht/` | Week vooruit bekijken, knelpunten zien en oplossen | Suggestie geaccepteerd of scherm verlaten — scenario succes ✓ |

**First step** (7.1) includes full entry context (Q3 + Q4 + Q5 + Q6).
**On-step interactions** (that don't leave the step) are documented as storyboard items within each page spec.
