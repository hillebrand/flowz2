---
design_intent: S
design_status: not-started
---

# 06: Evelien Beheert het Takenoverzicht

**Project:** Flowz
**Created:** 2026-07-23
**Method:** Whiteport Design Studio (WDS)

---

## Transaction (Q1)

**What this scenario covers:**
Evelien vindt een taak terug in het takenoverzicht en past de gegevens aan (bijv. omdat de deadline is verschoven of ze de moeilijkheid verkeerd had ingeschat).

---

## Business Goal (Q2)

**Goal:** ⭐ Kerndoel — Evelien's rustige planningservaring (DE MOTOR)
**Objective:** Houdt de taakgegevens die de motor gebruikt accuraat en actueel (Consider-tier, score 4 in Feature Impact Analysis).

---

## User & Situation (Q3)

**Persona:** Evelien (Primair)
**Situatie:** Hoort of herinnert zich dat een taak is veranderd (deadline verschoven, opdracht bleek lastiger) en wil dat corrigeren zodat de planning weer klopt.

---

## Driving Forces (Q4)

**Hope:** Dat de aanpassing meteen doorwerkt in de planning, zonder de taak opnieuw te hoeven aanmaken.

**Worry:** Dat ze de verkeerde taak tussen een lange lijst over het hoofd ziet of per ongeluk aanpast.

---

## Device & Starting Point (Q5 + Q6)

**Device:** Desktop (primair) — moet ook op Mobile bruikbaar zijn, met minder onderdelen tegelijk zichtbaar (verkorte weergave).
**Entry:** Via het hamburgermenu, vanaf welk scherm dan ook, opent ze het takenoverzicht.

---

## Best Outcome (Q7)

**User Success:**
De taak toont de gecorrigeerde gegevens; bevestiging verschijnt; planning is bijgewerkt.

**Business Success:**
De motor herberekent het doelmoment op basis van de gewijzigde taakgegevens.

---

## Shortest Path (Q8)

1. **Takenoverzicht** — ziet alle taken gegroepeerd/gesorteerd op deadline, tikt op de betreffende taak
2. **Taakdetail** — ziet titel/soort taak/voortgang, tikt "Bewerken"
3. **Bewerkformulier** — past gegevens aan (vooringevuld, hergebruikt het UJ-2-formulier), tikt "Opslaan", bevestiging, planning bijgewerkt, terug naar takenoverzicht ✓

*Verwijderen (met bevestiging) is een alternatieve on-page actie in de taakdetail-stap, geen eigen scenariopad.*

---

## Trigger Map Connections

**Persona:** Evelien (Primair)

**Driving Forces Addressed:**
- ✅ **Want:** indirecte link naar "vertrouwen dat de automatische tijdsverdeling realistisch is" — accurate taakgegevens voeden de motor

**Business Goal:** Kerndoel — houdt motor-inputdata actueel (Consider-tier)

---

## Scenario Steps

| Step | Folder | Purpose | Exit Action |
|------|--------|---------|-------------|
| 6.1 | `6.1-takenoverzicht/` | Alle taken bekijken, gegroepeerd/gesorteerd op deadline | Tikt op taak — gaat naar 6.2 |
| 6.2 | `6.2-taakdetail/` | Taakdetails bekijken, bewerken/verwijderen kiezen | Tikt "Bewerken" — gaat naar 6.3 |
| 6.3 | `6.3-bewerkformulier/` | Taakgegevens aanpassen (hergebruikt UJ-2-formulier) | Tikt "Opslaan" — scenario succes ✓ |

**First step** (6.1) includes full entry context (Q3 + Q4 + Q5 + Q6).
**On-step interactions** (that don't leave the step) are documented as storyboard items within each page spec.
