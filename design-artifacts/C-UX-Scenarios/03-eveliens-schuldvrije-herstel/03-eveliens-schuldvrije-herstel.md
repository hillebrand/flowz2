---
design_intent: S
design_status: not-started
---

# 03: Evelien's Schuldvrije Herstel

**Project:** Flowz
**Created:** 2026-07-23
**Method:** Whiteport Design Studio (WDS)

---

## Transaction (Q1)

**What this scenario covers:**
Evelien geeft aan dat de dag niet volgens plan gaat door tijdgebrek, en krijgt concrete, schuldvrije voorstellen die het tekort oplossen — zonder dat ze zelf hoeft te herplannen.

---

## Business Goal (Q2)

**Goal:** 🚀 Schuldvrij herstel & organische uitbreiding
**Objective:** Objective 1 — Schuldvrij herstel na een tegenvallende dag: een tegenvallende dag leidt tot een geaccepteerd nieuw plan, niet tot opgeven of schuldgevoel.

---

## User & Situation (Q3)

**Persona:** Evelien (Primair)
**Situatie:** Zit 's avonds met huiswerk en merkt dat de geplande tijd vandaag niet gaat lukken (bijv. een activiteit liep uit) — wil weten hoe ze hiermee omgaat zonder achterstand op te bouwen.

---

## Driving Forces (Q4)

**Hope:** Dat een tegenvaller wordt opgelost met een concreet, geloofwaardig nieuw plan, zonder dat zij zelf moet herplannen.

**Worry:** Dat de melding aanvoelt als verwijt, of dat ze alsnog zelf handmatig alles moet herschikken.

---

## Device & Starting Point (Q5 + Q6)

**Device:** Desktop (primair) — moet ook op Mobile bruikbaar zijn, met minder onderdelen tegelijk zichtbaar (verkorte weergave).
**Entry:** Klikt op het hoofdscherm op "Vandaag niet als gepland?" op een avond dat de geplande tijd niet gaat lukken, en kiest reden "te weinig tijd".

---

## Best Outcome (Q7)

**User Success:**
Ziet precies hoeveel tijd ze tekortkomt en accepteert voorstellen (herplannen/tijd verruimen/inkorten) tot het tekort is opgelost — zonder verwijtende toon.

**Business Success:**
De escalatieketen lost het tekort automatisch op; het aangepaste plan wordt geaccepteerd (Objective 1-metric).

---

## Shortest Path (Q8)

**Pad A — Te weinig tijd:**
1. **Reden kiezen** — kiest "te weinig tijd", geeft aan hoeveel tijd er vandaag daadwerkelijk beschikbaar is
2. **Tekort & oplossingen** — ziet het tekort in tijd, accepteert losse aanbevelingen (herplannen → tijd verruimen → inkorten op prioriteit) tot het tekort is opgelost ✓

**Pad B — Te weinig energie** *(toegevoegd 2026-08-17, was aanvankelijk bewust buiten scope)*:
1. **Reden kiezen** — kiest "te weinig energie" (geen verdere invoer nodig, in tegenstelling tot Pad A)
2. **Voorstel & resultaat** — ziet wat Flowz wil aanpassen (moeilijke taken verschoven, makkelijke naar voren gehaald, eventueel ingekort — of expliciet niets ingekort, met uitleg waarom), bevestigt, ziet daarna het resultaat ✓

*De hoofdscherm-knop zelf hoort bij scenario 01 (generieke startpagina); dit scenario begint bij de reden-keuze.*

---

## Trigger Map Connections

**Persona:** Evelien (Primair)

**Driving Forces Addressed:**
- ✅ **Want:** "Een planning die overeind blijft, ook als een dag tegenvalt" / "Vertrouwen dat de automatische tijdsverdeling realistisch is"
- ❌ **Fear:** "Angst dat één tegenvaller de hele planning laat instorten" / "Schuldgevoel over een gemiste sessie of tijd-/energietekort"

**Business Goal:** Schuldvrij herstel & organische uitbreiding — Objective 1

---

## Scenario Steps

| Step | Folder | Purpose | Exit Action |
|------|--------|---------|-------------|
| 3.1 | `3.1-reden-kiezen/` | Reden voor tegenvaller aangeven (te weinig tijd of te weinig energie) | Kiest "te weinig tijd" → 3.2, kiest "te weinig energie" → 3.3 |
| 3.2 | `3.2-tekort-oplossen/` | Tekort zien en escalerende voorstellen accepteren tot opgelost | Laatste voorstel geaccepteerd — scenario succes ✓ |
| 3.3 | `3.3-energie-voorstel/` | Voorstel tonen (welke taken verschoven/ingekort worden), Evelien bevestigt, daarna resultaat tonen | Bevestigt voorstel — scenario succes ✓ |

**First step** (3.1) includes full entry context (Q3 + Q4 + Q5 + Q6).
**Step 3.3** is één scherm met twee opeenvolgende states (voorstel → bevestigd/resultaat), analoog aan hoe 3.2 evolueert van "openstaand tekort" naar "opgelost"-state — geen aparte route voor het resultaat.
**On-step interactions** (that don't leave the step) are documented as storyboard items within each page spec.
