---
design_intent: S
design_status: not-started
---

# 08: Evelien Lost een Agendaconflict Op

**Project:** Flowz
**Created:** 2026-07-23
**Method:** Whiteport Design Studio (WDS)

---

## Transaction (Q1)

**What this scenario covers:**
Bij het opstarten van de app krijgt Evelien een melding dat haar ingestelde beschikbare tijd conflicteert met een agenda-item, en past ze de beschikbare tijd voor die dag aan zodat Flowz automatisch herplant.

---

## Business Goal (Q2)

**Goal:** ⭐ Kerndoel — Evelien's rustige planningservaring (DE MOTOR)
**Objective:** Houdt beschikbare-tijd-data in lijn met de werkelijke agenda, zodat de motor betrouwbaar blijft (Consider-tier, score 3).

---

## User & Situation (Q3)

**Persona:** Evelien (Primair)
**Situatie:** Opent Flowz op een dag waarop een nieuw agenda-item (bijv. een extra afspraak) ervoor zorgt dat de eerder ingestelde beschikbare tijd niet meer klopt met haar werkelijke agenda.

---

## Driving Forces (Q4)

**Hope:** Dat Flowz dit soort mismatches zelf opmerkt en oplost, zonder dat zij achteraf tegen een verrassing aanloopt.

**Worry:** Dat de planning stiekem niet meer klopt met haar echte agenda, zonder dat ze dat doorheeft.

---

## Device & Starting Point (Q5 + Q6)

**Device:** Desktop (primair) — moet ook op Mobile bruikbaar zijn, met minder onderdelen tegelijk zichtbaar (verkorte weergave).
**Entry:** Opent de app; bij opstarten (automatische check) verschijnt direct een melding over het conflict — geen actieve zoekactie van Evelien nodig.

---

## Best Outcome (Q7)

**User Success:**
Kiest "beschikbare tijd aanpassen", bevestigt — Flowz herplant automatisch op de achtergrond én toont direct een samenvatting van wat is aangepast, mét een waarschuwing als een andere dag daardoor een knelpunt wordt (dezelfde signalering als scenario 07) — geen verrassing achteraf.

**Business Success:**
Voorkomt dat een knelpunt pas later (bij UJ-6, of wanneer ze toevallig scenario 07 opent) onverwacht opduikt.

---

## Shortest Path (Q8)

1. **Conflictmelding** — ziet de melding bij opstarten, kiest "beschikbare tijd aanpassen"
2. **Beschikbare tijd aanpassen** — ziet het voorgevulde veld (hergebruikt UJ-3-scherm, dag-specifieke afwijking), bevestigt → Flowz herplant automatisch op de achtergrond en toont direct een samenvatting van de wijzigingen, mét eventuele knelpunt-waarschuwing voor andere dagen (zelfde signalering als scenario's 03/07) ✓

*"Dit conflicteert niet" is een alternatieve on-page keuze in de conflictmelding-stap, geen eigen scenariopad.*

---

## Trigger Map Connections

**Persona:** Evelien (Primair)

**Driving Forces Addressed:**
- ✅ **Want:** "Vertrouwen dat de automatische tijdsverdeling realistisch is" — proactief voorkomt dit ook de fear "angst voor instorting van de planning"

**Business Goal:** Kerndoel — houdt motor-inputdata in lijn met de werkelijke agenda (Consider-tier)

---

## Scenario Steps

| Step | Folder | Purpose | Exit Action |
|------|--------|---------|-------------|
| 8.1 | `8.1-conflictmelding/` | Agendaconflict signaleren, keuze tussen "conflicteert niet" en "tijd aanpassen" | Kiest "beschikbare tijd aanpassen" — gaat naar 8.2 |
| 8.2 | `8.2-beschikbare-tijd-aanpassen/` | Voorgevulde beschikbare tijd bevestigen, automatische herplanning + samenvatting met knelpunt-waarschuwing | Bevestigt — scenario succes ✓ |

**First step** (8.1) includes full entry context (Q3 + Q4 + Q5 + Q6).
**On-step interactions** (that don't leave the step) are documented as storyboard items within each page spec.
