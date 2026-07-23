---
design_intent: S
design_status: not-started
---

# 05: Evelien Start met Flowz

**Project:** Flowz
**Created:** 2026-07-23
**Method:** Whiteport Design Studio (WDS)

---

## Transaction (Q1)

**What this scenario covers:**
Evelien logt voor het eerst in met haar Google-account en geeft in datzelfde consentscherm toegang tot haar Google Calendar, zodat Flowz haar planning en agenda kan tonen.

---

## Business Goal (Q2)

**Goal:** ⭐ Kerndoel — Evelien's rustige planningservaring (DE MOTOR)
**Objective:** Technische randvoorwaarde — geen zelfstandige drijfveer-score, maar harde afhankelijkheid voor UJ-1 (dagtijdlijn), UJ-5 (weekplanning) en UJ-7 (agendaconflict).

---

## User & Situation (Q3)

**Persona:** Evelien (Primair)
**Situatie:** Opent Flowz voor de allereerste keer en moet inloggen voordat ze de app kan gebruiken.

---

## Driving Forces (Q4)

**Hope:** Snel door de inlogstap heen zijn en meteen in de rustige hoofdscherm-ervaring komen.

**Worry:** Dat inloggen/Calendar-toestemming ingewikkeld aanvoelt of veel stappen kost voordat ze daadwerkelijk iets aan haar huiswerk heeft.

---

## Device & Starting Point (Q5 + Q6)

**Device:** Desktop (primair) — moet ook op Mobile bruikbaar zijn, met minder onderdelen tegelijk zichtbaar (verkorte weergave).
**Entry:** Opent Flowz voor het eerst, ziet een inlogscherm met een "Inloggen met Google"-knop.

---

## Best Outcome (Q7)

**User Success:**
Binnen één Google-consentstap is ze ingelogd én heeft Flowz Calendar-toegang; ze komt direct op het rustige hoofdscherm, zonder tussenscherm.

**Business Success:**
`User`-rij aangemaakt (1:1 Google-account, AD-2), Calendar access-/refresh-token opgeslagen — technische basis gelegd zonder dat het als apart "product" aanvoelt.

---

## Shortest Path (Q8)

1. **Inlogscherm** — tikt "Inloggen met Google", rondt Google's OAuth-consent af (login + Calendar-toestemming ineen), keert terug en komt direct op het hoofdscherm ✓

*Eén Flowz-eigen stap — het Google-consentscherm zelf is extern en niet door ons ontworpen. Scenario beperkt zich tot de eerste keer inloggen; het periodieke opnieuw-inloggen na 7 dagen (token-verval, AD-2) is bewust geen apart scenario.*

---

## Trigger Map Connections

**Persona:** Evelien (Primair)

**Driving Forces Addressed:**
- Geen directe top-3 driver — expliciet de "Bijzondere behandeling"-uitzondering uit de Feature Impact Analysis: lage drijfveer-score, maar Must Have als harde technische randvoorwaarde.

**Business Goal:** Kerndoel — technische randvoorwaarde voor de motor

---

## Scenario Steps

| Step | Folder | Purpose | Exit Action |
|------|--------|---------|-------------|
| 5.1 | `5.1-inlogscherm/` | Inloggen met Google + Calendar-toestemming geven | Terug van Google-consent — scenario succes ✓ |

**First step** (5.1) includes full entry context (Q3 + Q4 + Q5 + Q6).
**On-step interactions** (that don't leave the step) are documented as storyboard items within each page spec.
