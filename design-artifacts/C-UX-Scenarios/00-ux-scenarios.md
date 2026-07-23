# UX Scenarios: Flowz

> Design experiences, not screens — every page serves a user with a goal and an emotion.

**Created:** 2026-07-16
**Phase:** 3 (Scenario Outline) + Phase 4 (UX Design)
**Agents:** Saga (Scenario Outline), Freya (Page Specifications)

---

## What Belongs Here

Scenarios organize the product into meaningful user journeys. Each scenario groups related pages. Each page gets a full specification that a developer can build from.

**Folder structure per scenario:**
```
C-UX-Scenarios/
├── 00-ux-scenarios.md          ← This file (scenario guide + page index)
├── 01-scenario-name/
│   ├── 1.1-page-name/
│   │   ├── 1.1-page-name.md   ← Page specification
│   │   └── Sketches/           ← Wireframes and concepts
│   ├── 1.2-page-name/
│   │   ├── 1.2-page-name.md
│   │   └── Sketches/
│   └── ...
├── 02-scenario-name/
│   └── ...
├── Components/                  ← Shared component specs
└── Features/
    └── Storyboards/             ← Multi-step interaction flows
```

**Learn more:**
- WDS Course Module 08: Outline Scenarios — Design Experiences Not Screens
- WDS Course Module 09: Conceptual Sketching
- WDS Course Module 10: Storyboarding
- WDS Course Module 11: Conceptual Specifications
- WDS Course Tutorial 08: From Trigger Map to Scenarios

---

## For Agents

### Scenario Outline (Saga)
**Workflow:** `skill:wds-3-scenarios`
**Agent trigger:** `SC` (Saga)

### Page Specifications (Freya)
**Workflow:** `skill:wds-4-ux-design`
**Agent trigger:** `UX` (Freya)
**Page template:** `./resources/wds-4-ux-design/templates/page-specification.template.md`
**Scenario template:** `./resources/wds-4-ux-design/templates/scenario-overview.template.md`
**Quality guide:** `./resources/agent-guides/freya/specification-quality.md`
**Object types:** `./resources/wds-4-ux-design/object-types/`

### Specification Audit (Freya)
**Workflow:** `skill:wds-4-ux-design`
**Agent trigger:** `SA` (Freya)

**Before writing any page specification:**
1. Read `B-Trigger-Map/` — know the personas and their driving forces
2. Read the page specification template — use it as your scaffold, not memory
3. Discuss the page purpose with the user before filling in details
4. Each page folder needs a `Sketches/` subfolder for wireframes

**Known open UX questions from the architecture reconcile** (see `../../_bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/reconcile-prd.md`): the "geen schuldgevoel" tone for UJ-6/7/8 escalation messages needs its own pattern distinct from the technical error envelope, and the "rustig hoofdscherm" needs an explicit information-density spec. Both are UX-owned gaps the architecture spine flagged but didn't resolve.

**Harm:** Producing page specs from memory of what the template "roughly" contains. Plausible-looking specs that use wrong structure break the pipeline — developers can't trust them, audits can't validate them, and the user must correct what should have been right.

**Help:** Reading the actual template into context, discussing page purpose with the user, then filling the template with specific content. Specs that follow the template work across projects, pass audits, and give developers confidence.

---

## Scenarios

**Fase 3 (Scenario Outline) afgerond:** 8 scenario's, 15 pagina's, allemaal voor **Evelien (Primair)**. Danielle (Secundair) heeft bewust geen eigen scenario's — de Trigger Map concludeert dat haar kernbehoefte (rust bij spreiding) al "gratis" bediend wordt door dezelfde Evelien-gerichte features.

| ID | Scenario | Persona | Pagina's | Prioriteit | Status |
|----|----------|---------|----------|------------|--------|
| 01 | [Evelien's Werksessie](01-evelien-werksessie/01-evelien-werksessie.md) | Evelien (Primair) | 4 | ⭐ P1 | ✅ Uitgewerkt |
| 02 | [Evelien Maakt een Taak Aan](02-evelien-taak-aanmaken/02-evelien-taak-aanmaken.md) | Evelien (Primair) | 1 | ⭐ P1 | ✅ Uitgewerkt |
| 03 | [Evelien's Schuldvrije Herstel](03-eveliens-schuldvrije-herstel/03-eveliens-schuldvrije-herstel.md) | Evelien (Primair) | 2 | ⭐ P1 | ✅ Uitgewerkt |
| 04 | [Evelien Stelt Beschikbare Tijd In](04-evelien-stelt-beschikbare-tijd-in/04-evelien-stelt-beschikbare-tijd-in.md) | Evelien (Primair) | 1 | P2 | ✅ Uitgewerkt |
| 05 | [Evelien Start met Flowz](05-evelien-start-met-flowz/05-evelien-start-met-flowz.md) | Evelien (Primair) | 1 | P1* | ✅ Uitgewerkt |
| 06 | [Evelien Beheert het Takenoverzicht](06-evelien-beheert-het-takenoverzicht/06-evelien-beheert-het-takenoverzicht.md) | Evelien (Primair) | 3 | P2 | ✅ Uitgewerkt |
| 07 | [Evelien Bekijkt de Weekplanning](07-evelien-bekijkt-de-weekplanning/07-evelien-bekijkt-de-weekplanning.md) | Evelien (Primair) | 1 | P2 | ✅ Uitgewerkt |
| 08 | [Evelien Lost een Agendaconflict Op](08-evelien-lost-een-agendaconflict-op/08-evelien-lost-een-agendaconflict-op.md) | Evelien (Primair) | 2 | P2 | ✅ Uitgewerkt |

*\* P1 ondanks lage drijfveer-score: harde technische randvoorwaarde voor UJ-1/UJ-5/UJ-7 (zie Feature Impact Analysis, "Bijzondere behandeling").*

### [01: Evelien's Werksessie](01-evelien-werksessie/01-evelien-werksessie.md)
**Persona:** Evelien (Primair) — "Weten wat de eerstvolgende stap is, zonder daar zelf over na te hoeven denken"
**Pagina's:** 1.1-hoofdscherm, 1.2-sessie-tussenscherm, 1.3-sessie-actief, 1.4-sessie-afronden
**User Value:** Doorloopt de werksessie van start tot afronding zonder zelf te hoeven plannen of prioriteren.
**Business Value:** Het dagelijkse aanraakpunt — bewijst dat de motor (automatische tijdsverdeling) werkt.

---

### [02: Evelien Maakt een Taak Aan](02-evelien-taak-aanmaken/02-evelien-taak-aanmaken.md)
**Persona:** Evelien (Primair) — "Vertrouwen dat de automatische tijdsverdeling realistisch is"
**Pagina's:** 2.1-taak-formulier
**User Value:** Legt een nieuwe taak compleet vast zodra ze die krijgt, zonder zelf te hoeven inschatten wanneer die past.
**Business Value:** Voedt de motor met volledige taakgegevens (deadline, moeilijkheid, omvang) voor een realistisch doelmoment.

---

### [03: Evelien's Schuldvrije Herstel](03-eveliens-schuldvrije-herstel/03-eveliens-schuldvrije-herstel.md)
**Persona:** Evelien (Primair) — "Een planning die overeind blijft, ook als een dag tegenvalt"
**Pagina's:** 3.1-reden-kiezen, 3.2-tekort-oplossen
**User Value:** Een tegenvallende dag wordt schuldvrij en concreet opgelost, zonder zelf te hoeven herplannen.
**Business Value:** Objective 1 (Schuldvrij herstel) — combineert UJ-6's escalatieketen met UJ-8's gebruikersinitiatief in één scenario.

---

### [04: Evelien Stelt Beschikbare Tijd In](04-evelien-stelt-beschikbare-tijd-in/04-evelien-stelt-beschikbare-tijd-in.md)
**Persona:** Evelien (Primair) — "Vertrouwen dat de automatische tijdsverdeling realistisch is"
**Pagina's:** 4.1-beschikbare-tijd-instellen
**User Value:** Legt haar structurele weekpatroon en dag-specifieke uitzonderingen vast.
**Business Value:** Technische randvoorwaarde — de motor kan alleen realistisch plannen met correcte beschikbare-tijd-data.

---

### [05: Evelien Start met Flowz](05-evelien-start-met-flowz/05-evelien-start-met-flowz.md)
**Persona:** Evelien (Primair) — geen directe drijfveer, harde technische randvoorwaarde
**Pagina's:** 5.1-inlogscherm
**User Value:** Is in één stap ingelogd en klaar om Flowz te gebruiken, zonder gedoe.
**Business Value:** Legt de identiteits- en Calendar-toegangsbasis (AD-2) voor UJ-1, UJ-5 en UJ-7.

---

### [06: Evelien Beheert het Takenoverzicht](06-evelien-beheert-het-takenoverzicht/06-evelien-beheert-het-takenoverzicht.md)
**Persona:** Evelien (Primair) — indirecte link naar "vertrouwen dat de tijdsverdeling realistisch is"
**Pagina's:** 6.1-takenoverzicht, 6.2-taakdetail, 6.3-bewerkformulier
**User Value:** Vindt een taak terug en corrigeert de gegevens wanneer de situatie verandert.
**Business Value:** Houdt de taakgegevens die de motor gebruikt accuraat en actueel.

---

### [07: Evelien Bekijkt de Weekplanning](07-evelien-bekijkt-de-weekplanning/07-evelien-bekijkt-de-weekplanning.md)
**Persona:** Evelien (Primair) — "Een planning die overeind blijft, ook als een dag tegenvalt" (preventief)
**Pagina's:** 7.1-weekoverzicht
**User Value:** Ziet in één oogopslag hoe de week ervoor staat en krijgt bij een knelpunt direct een oplossingssuggestie.
**Business Value:** Objective 2 (Minder gemiste deadlines) — problemen worden vroeg zichtbaar én oplosbaar.

---

### [08: Evelien Lost een Agendaconflict Op](08-evelien-lost-een-agendaconflict-op/08-evelien-lost-een-agendaconflict-op.md)
**Persona:** Evelien (Primair) — "Vertrouwen dat de automatische tijdsverdeling realistisch is"
**Pagina's:** 8.1-conflictmelding, 8.2-beschikbare-tijd-aanpassen
**User Value:** Een agendaconflict wordt automatisch opgelost, met een samenvatting die eventuele nieuwe knelpunten meteen meldt (geen verrassing achteraf).
**Business Value:** Houdt beschikbare-tijd-data in lijn met de werkelijke agenda; voorkomt latere tijdgebrek-escalaties.

---

## Page Index

**Pagina Dekkingsmatrix** — 15/15 pagina's toegewezen aan een scenario. Wordt tijdens Fase 4 uitgebreid met links naar de daadwerkelijke pagina-specificaties.

| Pagina | Scenario | Doel in de Flow |
|--------|----------|------------------|
| 1.1-hoofdscherm | 01 | Ziet eerstvolgende taak, start sessie |
| 1.2-sessie-tussenscherm | 01 | Ziet benodigdheden, start timer |
| 1.3-sessie-actief | 01 | Doorloopt subtaken, pauzeert/rondt af |
| 1.4-sessie-afronden | 01 | Ziet overzicht gepland/besteed/resterend |
| 2.1-taak-formulier | 02 | Vult taakgegevens in, slaat op |
| 3.1-reden-kiezen | 03 | Kiest reden ("te weinig tijd"), vult beschikbare tijd in |
| 3.2-tekort-oplossen | 03 | Ziet tekort, accepteert escalerende aanbevelingen |
| 4.1-beschikbare-tijd-instellen | 04 | Stelt weekpatroon + dag-afwijkingen in |
| 5.1-inlogscherm | 05 | Logt in met Google (login + Calendar-toestemming) |
| 6.1-takenoverzicht | 06 | Bekijkt alle taken, kiest een taak |
| 6.2-taakdetail | 06 | Bekijkt details, kiest bewerken/verwijderen |
| 6.3-bewerkformulier | 06 | Past taakgegevens aan (hergebruikt UJ-2-formulier) |
| 7.1-weekoverzicht | 07 | Bekijkt week vooruit, ziet knelpunten + suggesties |
| 8.1-conflictmelding | 08 | Ziet agendaconflict, kiest oplossingsroute |
| 8.2-beschikbare-tijd-aanpassen | 08 | Bevestigt tijd, ziet herplan-samenvatting + knelpunt-waarschuwing |

---

_Created using Whiteport Design Studio (WDS) methodology_
