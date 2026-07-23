---
design_intent: S
design_status: not-started
---

# 04: Evelien Stelt Beschikbare Tijd In

**Project:** Flowz
**Created:** 2026-07-23
**Method:** Whiteport Design Studio (WDS)

---

## Transaction (Q1)

**What this scenario covers:**
Evelien legt vast hoeveel tijd ze structureel per weekdag beschikbaar heeft voor huiswerk, en wijkt daar voor specifieke dagen vanaf, zodat de motor daarmee realistisch kan plannen.

---

## Business Goal (Q2)

**Goal:** ⭐ Kerndoel — Evelien's rustige planningservaring (DE MOTOR)
**Objective:** Voedt de "Automatische tijdsverdeling" rechtstreeks als inputdata — geen zelfstandige drijfveer-score, maar een technische randvoorwaarde voor de motor.

---

## User & Situation (Q3)

**Persona:** Evelien (Primair)
**Situatie:** Aan het begin van een nieuwe periode, of wanneer haar wekelijkse rooster structureel verandert (bijv. een nieuwe sportclub), wil ze vastleggen hoeveel tijd ze per weekdag realistisch aan huiswerk kan besteden.

---

## Driving Forces (Q4)

**Hope:** Dat de motor voortaan rekent met haar echte beschikbare tijd, zodat de planning niet onrealistisch aanvoelt.

**Worry:** Dat ze een dag verkeerd inschat en de planning daardoor alsnog niet klopt.

---

## Device & Starting Point (Q5 + Q6)

**Device:** Desktop (primair) — moet ook op Mobile bruikbaar zijn, met minder onderdelen tegelijk zichtbaar (verkorte weergave).
**Entry:** Via het hamburgermenu, vanaf welk scherm dan ook, opent ze de instellingenpagina voor beschikbare tijd.

---

## Best Outcome (Q7)

**User Success:**
Weekpatroon (ma-zo) en eventuele dag-specifieke afwijkingen staan correct ingesteld; ze vertrouwt erop dat de motor daarmee rekent.

**Business Success:**
De motor beschikt over accurate beschikbare-tijd-data voor doelmoment/buffer-berekening én tijdgebrek-detectie (UJ-6).

---

## Shortest Path (Q8)

1. **Beschikbare tijd instellen** — past het weekpatroon aan met +/- knoppen en/of stelt via de kalender een dag-specifieke afwijking in; wijzigingen direct verwerkt ✓

*Eén stap — de PRD noemt geen aparte opslaan-actie voor dit scherm; de +/- knoppen passen vermoedelijk direct toe (aanname, te bevestigen bij Phase 4).*

---

## Trigger Map Connections

**Persona:** Evelien (Primair)

**Driving Forces Addressed:**
- ✅ **Want:** "Vertrouwen dat de automatische tijdsverdeling realistisch is"
- ❌ **Fear:** indirecte link naar "angst voor instorting van de planning" — verkeerde input ondermijnt de motor

**Business Goal:** Kerndoel — voedt de motor (technische randvoorwaarde)

---

## Scenario Steps

| Step | Folder | Purpose | Exit Action |
|------|--------|---------|-------------|
| 4.1 | `4.1-beschikbare-tijd-instellen/` | Weekpatroon en dag-specifieke afwijkingen instellen | Wijzigingen direct verwerkt — scenario succes ✓ |

**First step** (4.1) includes full entry context (Q3 + Q4 + Q5 + Q6).
**On-step interactions** (that don't leave the step) are documented as storyboard items within each page spec.
