---
design_intent: S
design_status: not-started
---

# 02: Evelien Maakt een Taak Aan

**Project:** Flowz
**Created:** 2026-07-20
**Method:** Whiteport Design Studio (WDS)

---

## Transaction (Q1)

**What this scenario covers:**
Een nieuwe taak (met optioneel deeltaken) vastleggen, zodat de motor die automatisch en realistisch inplant.

---

## Business Goal (Q2)

**Goal:** ⭐ Kerndoel — Evelien's rustige planningservaring (voedt de motor)
**Objective:** Elke taak krijgt bij aanmaken meteen een realistisch doelmoment vóór de deadline.

---

## User & Situation (Q3)

**Persona:** Evelien (Primair)
**Situatie:** Krijgt op school een nieuwe opdracht met deadline en wil die meteen vastleggen zodra ze thuis is, voordat ze het vergeet.

---

## Driving Forces (Q4)

**Hope:** Dat de taak meteen een passende plek krijgt in haar planning, zonder dat zij hoeft uit te puzzelen wanneer.

**Worry:** Dat ze iets vergeet in te vullen en de taak daardoor verkeerd wordt ingeschat.

---

## Device & Starting Point (Q5 + Q6)

**Device:** Desktop (primair) — moet ook op Mobile bruikbaar zijn, met minder onderdelen tegelijk zichtbaar (verkorte weergave).
**Entry:** Tikt op de "+"-knop, vanaf welke pagina ze ook net op zat, zodra ze een nieuwe opdracht heeft gekregen.

---

## Best Outcome (Q7)

**User Success:**
Taak staat vastgelegd met titel, deadline, moeilijkheid, prioriteit en sessieduur; bevestiging verschijnt en de dagplanning is al bijgewerkt.

**Business Success:**
De motor ontvangt volledige taakgegevens (deadline, moeilijkheid, omvang) om een realistisch doelmoment met buffer te berekenen.

---

## Shortest Path (Q8)

1. **Taak-formulier** — vult taakgegevens in (titel, soort taak, deadline, moeilijkheid, prioriteit, sessieduur, optioneel deeltaken/omschrijving/benodigdheden), tikt "Opslaan", ziet bevestiging, dagplanning direct bijgewerkt, keert terug naar de pagina van waaruit ze het formulier opende ✓

*Eén stap — dit scenario heeft maar één eigen pagina (het formulier). De startpagina (hoofdscherm, takenoverzicht, etc.) is generiek en al eigendom van andere scenario's.*

---

## Trigger Map Connections

**Persona:** Evelien (Primair)

**Driving Forces Addressed:**
- ✅ **Want:** "Vertrouwen dat de automatische tijdsverdeling realistisch is"
- ❌ **Fear:** "Angst dat één tegenvaller de hele planning laat instorten" (indirect — een compleet ingevulde taak voorkomt latere tijdgebrek-verrassingen)

**Business Goal:** Kerndoel — voedt de motor (v1)

---

## Scenario Steps

| Step | Folder | Purpose | Exit Action |
|------|--------|---------|-------------|
| 2.1 | `2.1-taak-formulier/` | Taakgegevens invullen en opslaan | Tikt "Opslaan" — scenario succes ✓ |

**First step** (2.1) includes full entry context (Q3 + Q4 + Q5 + Q6).
**On-step interactions** (that don't leave the step) are documented as storyboard items within each page spec.

**First step** (2.1) includes full entry context (Q3 + Q4 + Q5 + Q6).
**On-step interactions** (that don't leave the step) are documented as storyboard items within each page spec.
