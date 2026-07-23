---
design_intent: S
design_status: not-started
---

# 01: Evelien's Werksessie

**Project:** Flowz
**Created:** 2026-07-20
**Method:** Whiteport Design Studio (WDS)

---

## Transaction (Q1)

**What this scenario covers:**
Weten wat de eerstvolgende taak is en die in een werksessie afronden, zonder zelf te hoeven plannen of uitzoeken waar te beginnen.

---

## Business Goal (Q2)

**Goal:** ⭐ Kerndoel — Evelien's rustige planningservaring (DE MOTOR)
**Objective:** Evelien opent Flowz op elk moment van de dag en weet, zonder te hoeven zoeken of scrollen, wat de eerstvolgende stap is.

---

## User & Situation (Q3)

**Persona:** Evelien (Primair)
**Situatie:** VWO 3-scholiere, doordeweekse avond na het eten. Ze moet nog huiswerk doen voor morgen en heeft niet de energie om eerst zelf uit te zoeken wat prioriteit heeft.

---

## Driving Forces (Q4)

**Hope:** Eindelijk weten wat ze nu moet doen, zonder dat zelf te hoeven uitzoeken.

**Worry:** Dat de sessie uitloopt en ze daardoor weer achterop raakt.

---

## Device & Starting Point (Q5 + Q6)

**Device:** Desktop (primair) — moet ook op Mobile bruikbaar zijn, met minder onderdelen tegelijk zichtbaar (verkorte weergave).
**Entry:** Opent de Flowz-app op een doordeweekse avond, direct na het eten, om aan huiswerk te beginnen.

---

## Best Outcome (Q7)

**User Success:**
Evelien rondt de werksessie af, ziet precies welke subtaken gedaan zijn en welke nog resteren, en de volgende taak staat al klaar op het hoofdscherm.

**Business Success:**
Kerndoel-metric gehaald — geen extra actie (scrollen, zoeken, nadenken) nodig vóórdat de eerstvolgende stap zichtbaar was.

---

## Shortest Path (Q8)

1. **Hoofdscherm** — ziet de eerstvolgende taak prominent, tikt op "Start sessie"
2. **Sessie-Tussenscherm** — ziet de benodigdheden voor de taak, tikt op "Start"
3. **Sessie-Actief** — timer loopt, werkt de subtaken één voor één af, tikt "Afronden"
4. **Sessie-Afronden** — ziet overzicht van gepland/besteed/resterend, keert terug naar het hoofdscherm met de volgende taak al klaar ✓

---

## Trigger Map Connections

**Persona:** Evelien (Primair)

**Driving Forces Addressed:**
- ✅ **Want:** "Weten wat de eerstvolgende stap is, zonder daar zelf over na te hoeven denken"
- ❌ **Fear:** "Overweldigd raken door een te volle of te gedetailleerde takenlijst"

**Business Goal:** Kerndoel — Evelien's rustige planningservaring (v1)

---

## Scenario Steps

| Step | Folder | Purpose | Exit Action |
|------|--------|---------|-------------|
| 1.1 | `1.1-hoofdscherm/` | Eerstvolgende taak zien en sessie starten | Tikt op "Start sessie" |
| 1.2 | `1.2-sessie-tussenscherm/` | Benodigdheden voor de taak zien | Tikt op "Start" |
| 1.3 | `1.3-sessie-actief/` | Sessie doorlopen, subtaken afwerken | Tikt op "Afronden" |
| 1.4 | `1.4-sessie-afronden/` | Overzicht van gepland/besteed/resterend | Terug naar hoofdscherm — scenario succes ✓ |

**First step** (1.1) includes full entry context (Q3 + Q4 + Q5 + Q6).
**On-step interactions** (that don't leave the step) are documented as storyboard items within each page spec.
