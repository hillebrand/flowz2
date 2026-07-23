# Design Log

**Project:** Flowz
**Started:** 2026-07-16
**Method:** Whiteport Design Studio (WDS)

---

## Backlog

> Business-value items. Add links to detail files if needed.

- [x] Alignment & Signoff — pitch.md (geaccepteerd, signoff overgeslagen)
- [ ] Complete product brief — Phase 1
- [x] Define trigger map — Phase 2 — B-Trigger-Map/
- [x] Create user scenarios — Phase 3 — C-UX-Scenarios/

---

## Current

| Task | Started | Agent |
|------|---------|-------|
| — | — | — |

**Rules:** Mark what you start. Complete it when done (move to Log). One task at a time per agent.

---

## Design Loop Status

> Per-page design progress. Updated by agents at every design transition.

| Scenario | Step | Page | Status | Updated |
|----------|------|------|--------|---------|
| 01-evelien-werksessie | 1.1 | hoofdscherm | outlined | 2026-07-20 |
| 01-evelien-werksessie | 1.2 | sessie-tussenscherm | outlined | 2026-07-20 |
| 01-evelien-werksessie | 1.3 | sessie-actief | outlined | 2026-07-20 |
| 01-evelien-werksessie | 1.4 | sessie-afronden | outlined | 2026-07-20 |
| 02-evelien-taak-aanmaken | 2.1 | taak-formulier | outlined | 2026-07-23 |
| 03-eveliens-schuldvrije-herstel | 3.1 | reden-kiezen | outlined | 2026-07-23 |
| 03-eveliens-schuldvrije-herstel | 3.2 | tekort-oplossen | outlined | 2026-07-23 |
| 04-evelien-stelt-beschikbare-tijd-in | 4.1 | beschikbare-tijd-instellen | outlined | 2026-07-23 |
| 05-evelien-start-met-flowz | 5.1 | inlogscherm | outlined | 2026-07-23 |
| 06-evelien-beheert-het-takenoverzicht | 6.1 | takenoverzicht | outlined | 2026-07-23 |
| 06-evelien-beheert-het-takenoverzicht | 6.2 | taakdetail | outlined | 2026-07-23 |
| 06-evelien-beheert-het-takenoverzicht | 6.3 | bewerkformulier | outlined | 2026-07-23 |
| 07-evelien-bekijkt-de-weekplanning | 7.1 | weekoverzicht | outlined | 2026-07-23 |
| 08-evelien-lost-een-agendaconflict-op | 8.1 | conflictmelding | outlined | 2026-07-23 |
| 08-evelien-lost-een-agendaconflict-op | 8.2 | beschikbare-tijd-aanpassen | outlined | 2026-07-23 |

**Status values:** `discussed` → `wireframed` → `specified` → `explored` → `building` → `built` → `approved` | `removed`

**How to use:**
- **Append a row** when a page reaches a new status (do not overwrite — latest row per page is current status)
- **Read on startup** to see where the project stands and what to suggest next

---

## Log

### 2026-07-16 — Alignment & Signoff (Phase 0)
- Situatie: consultant richting klant
- Startpunt: oplossing (Flowz zelf, gebaseerd op bestaande BMM-brief)
- Alignment-document geaccepteerd; signoff-document overgeslagen
- Output: `A-Product-Brief/pitch.md`

### 2026-07-16 — Project initialized (Phase 0)
- Type: greenfield
- Complexity: complex (Web Application)
- Tech stack: skip (nog niet bepaald)
- Brief level: complete
- Strategic analysis: full (Trigger Map ingeschakeld)
- Working relationship: personal/hobby stakes, sterk collaboratief, Design Partner-rol, opties voorleggen
- Volledige WDS-route gekozen inclusief alle optionele stappen (Sketching, Storyboarding, Functional Components, Visual Design, Platform Requirements); Design System overgeslagen conform `design_system_mode: none` in config — heroverwegen bij Phase 7 als er patronen ontstaan

### 2026-07-20 — Phase 2: Trigger Mapping Complete

**Agent:** Saga (Trigger Mapping, Suggest-mode)
**Personas:** 2 (Evelien de Scholier — primair, Danielle de Perfectionist — secundair, zusje + vriendenkring gecombineerd)
**Business Goals:** 4 (kerndoel + 2 gelaagde objectives + 1 lange-termijn objective)

**Artifacts Created:**
- B-Trigger-Map/00-trigger-map.md
- B-Trigger-Map/01-Business-Goals.md
- B-Trigger-Map/02-Evelien-de-Scholier.md
- B-Trigger-Map/03-Danielle-de-Perfectionist.md
- B-Trigger-Map/05-Key-Insights.md
- B-Trigger-Map/feature-impact-analysis.md

**Summary:** Trigger Map opgebouwd via documentatie-synthese (brief, addendum, PRD, architectuur-reconcile, pitch) gevolgd door Suggest-mode workshops. Evelien (primair, tijdsnood/schuldgevoel/overweldigd overzicht) en Danielle (secundair, perfectionisme — spreiden voelt als tekortschieten) elk uitgediept met 3 wensen + 3 angsten. Feature Impact Analysis wijst werksessie-flow, taak-formulier en automatische tijdsverdeling aan als topprioriteit (score 8/8); Google-login en Calendar-integratie scoren laag op drijfveer-impact maar blijven Must Have als harde technische randvoorwaarde. Kernbevinding: Danielle's kernbehoefte wordt grotendeels "gratis" bediend door dezelfde Evelien-gerichte features — geen aparte feature nodig. De twee architectuur-erkende maar UX-onopgeloste vragen ("geen schuldgevoel", "rustig hoofdscherm") landen nu als topprioriteit-drijfveren #1 en #3 van Evelien.

**Next:** Phase 3/4 — UX Scenario's & Design (Freya)

---

### 2026-07-20 — Phase 3: UX Scenarios (in progress)

**Agent:** Saga (UX Scenario Facilitator, Suggest-mode), skill `wds-3-scenarios`
**Voortgang:** Steps 1–4 (context, scope, strategic chains, scenario plan) volledig doorlopen en goedgekeurd. Step 5 (outline scenario) loopt.

**Scope-analyse:** Dynamic App, 14 pagina's/views, Small scale, Suggest mode. Volledige page inventory en 8 strategic context chains vastgelegd in de conversatie (nog niet als apart bestand opgeslagen — bij hervatten desgewenst opnieuw afleiden uit Trigger Map of vragen of dit als bestand moet).

**8 scenario's goedgekeurd (Priority 1 → 3):**
1. Evelien's Werksessie (UJ-1) — **compleet**: scenario-bestand + alle 4 pagina-stappen (1.1 hoofdscherm, 1.2 sessie-tussenscherm, 1.3 sessie-actief, 1.4 sessie-afronden) uitgewerkt
2. Evelien Maakt een Taak Aan (UJ-2) — scenario-bestand aangemaakt (Q1–Q8 goedgekeurd), pagina-stap 2.1 (taak-formulier) **nog niet** uitgewerkt
3. Evelien's Schuldvrije Herstel (UJ-6 + UJ-8) — nog niet gestart
4. Evelien Stelt Beschikbare Tijd In (UJ-3) — nog niet gestart
5. Evelien Start met Flowz (onboarding/login) — nog niet gestart
6. Evelien Beheert het Takenoverzicht (UJ-4) — nog niet gestart
7. Evelien Bekijkt de Weekplanning (UJ-5) — nog niet gestart
8. Evelien Lost een Agendaconflict Op (UJ-7) — nog niet gestart

**Output tot nu toe:**
- `C-UX-Scenarios/01-evelien-werksessie/` — compleet (scenario + 4 pagina-specs)
- `C-UX-Scenarios/02-evelien-taak-aanmaken/` — scenario-bestand compleet, pagina-stap 2.1 open

**Hervatten:** Laad skill `wds-3-scenarios`, ga naar `steps-c/step-05-outline-scenario.md`, werk pagina-stap 2.1 (taak-formulier) uit voor scenario 02, loop dan door scenario's 3–8. Daarna Step 06 (overview genereren), 07 (quality review), 08/09 (log + handover naar Phase 4).

---

### 2026-07-23 — Phase 3: UX Scenarios Complete

**Agent:** Saga (Scenario Outline)
**Scenarios:** 8 scenarios covering 15 pages
**Quality:** Excellent (6 scenarios Excellent, 2 Good — allen ruim boven de minimumdrempel; zie review hieronder)

**Artifacts Created:**
- `C-UX-Scenarios/00-ux-scenarios.md` — Scenario index + pagina-dekkingsmatrix (bijgewerkt van placeholder naar volledige inhoud)
- `01-evelien-werksessie/01-evelien-werksessie.md` — Evelien's Werksessie (UJ-1, al bestond, device-inconsistentie gecorrigeerd)
- `01-evelien-werksessie/1.1-hoofdscherm/1.1-hoofdscherm.md` — (al bestond, "op haar telefoon"-tekst gecorrigeerd naar device-neutraal)
- `01-evelien-werksessie/1.2-sessie-tussenscherm/1.2-sessie-tussenscherm.md` — (al bestond)
- `01-evelien-werksessie/1.3-sessie-actief/1.3-sessie-actief.md` — (al bestond)
- `01-evelien-werksessie/1.4-sessie-afronden/1.4-sessie-afronden.md` — (al bestond)
- `02-evelien-taak-aanmaken/02-evelien-taak-aanmaken.md` — Evelien Maakt een Taak Aan (UJ-2, Q1-Q8 al bestond, resume-status verwijderd)
- `02-evelien-taak-aanmaken/2.1-taak-formulier/2.1-taak-formulier.md` — Nieuw: taak-formulier met deeltaken-auto-som-gedrag
- `03-eveliens-schuldvrije-herstel/03-eveliens-schuldvrije-herstel.md` — Nieuw: Evelien's Schuldvrije Herstel (combineert UJ-6 + UJ-8)
- `03-eveliens-schuldvrije-herstel/3.1-reden-kiezen/3.1-reden-kiezen.md` — Nieuw
- `03-eveliens-schuldvrije-herstel/3.2-tekort-oplossen/3.2-tekort-oplossen.md` — Nieuw: bevat schuldvrije-toon design-note (AD-6)
- `04-evelien-stelt-beschikbare-tijd-in/04-evelien-stelt-beschikbare-tijd-in.md` — Nieuw: Evelien Stelt Beschikbare Tijd In (UJ-3)
- `04-evelien-stelt-beschikbare-tijd-in/4.1-beschikbare-tijd-instellen/4.1-beschikbare-tijd-instellen.md` — Nieuw
- `05-evelien-start-met-flowz/05-evelien-start-met-flowz.md` — Nieuw: Evelien Start met Flowz (onboarding/login, alleen eerste keer)
- `05-evelien-start-met-flowz/5.1-inlogscherm/5.1-inlogscherm.md` — Nieuw
- `06-evelien-beheert-het-takenoverzicht/06-evelien-beheert-het-takenoverzicht.md` — Nieuw: Evelien Beheert het Takenoverzicht (UJ-4)
- `06-evelien-beheert-het-takenoverzicht/6.1-takenoverzicht/6.1-takenoverzicht.md` — Nieuw
- `06-evelien-beheert-het-takenoverzicht/6.2-taakdetail/6.2-taakdetail.md` — Nieuw
- `06-evelien-beheert-het-takenoverzicht/6.3-bewerkformulier/6.3-bewerkformulier.md` — Nieuw: hergebruikt UJ-2-formulier
- `07-evelien-bekijkt-de-weekplanning/07-evelien-bekijkt-de-weekplanning.md` — Nieuw: Evelien Bekijkt de Weekplanning (UJ-5)
- `07-evelien-bekijkt-de-weekplanning/7.1-weekoverzicht/7.1-weekoverzicht.md` — Nieuw
- `08-evelien-lost-een-agendaconflict-op/08-evelien-lost-een-agendaconflict-op.md` — Nieuw: Evelien Lost een Agendaconflict Op (UJ-7)
- `08-evelien-lost-een-agendaconflict-op/8.1-conflictmelding/8.1-conflictmelding.md` — Nieuw
- `08-evelien-lost-een-agendaconflict-op/8.2-beschikbare-tijd-aanpassen/8.2-beschikbare-tijd-aanpassen.md` — Nieuw

**Summary:** Scenario's 2 t/m 8 zijn deze sessie uitgewerkt (Suggest-mode), inclusief drie inhoudelijke ontwerpbeslissingen van Hillebrand: (1) alle scenario's zijn met terugwerkende kracht omgezet naar Desktop als primair device (Mobile secundair, verkorte weergave) — was aanvankelijk Mobile-only voor scenario's 01/02; (2) scenario 07 (weekplanning) is uitgebreid van puur passief cijfers-aflezen naar proactieve knelpunt-signalering met oplossingssuggesties; (3) scenario 08 (agendaconflict) toont na de automatische achtergrond-herplanning nu een samenvatting mét knelpunt-waarschuwing, zodat een krappe week nooit een verrassing is — expliciet gekoppeld aan scenario 07's signalering. Scenario 03 combineert UJ-6 en UJ-8 bewust in één lineair pad door de "te weinig tijd"-route te kiezen als sunshine path (die UJ-6's escalatieketen hergebruikt); scenario 05 (login) volgt de "Bijzondere behandeling"-uitzondering uit de Feature Impact Analysis (lage drijfveer-score, wel Must Have als technische randvoorwaarde) en beperkt zich tot de allereerste keer inloggen. Alle 8 scenario's + 15 pagina's zijn 100% gedekt in de overview. Quality review (Step 07) vond en herstelde één consistentiefout (mobiel-specifieke entry-tekst in scenario 01, over het hoofd gezien bij de eerdere device-correctie).

**Next:** Phase 4 — UX Design

**Pauze:** Sessie gepauzeerd op verzoek van Hillebrand, direct na Step 09 (Handover). Design intent voor alle 8 scenario's vastgelegd als **Suggest (S)** in de scenario-frontmatter (`design_intent: S`, `design_status: not-started`) — agent stelt per pagina voor, Hillebrand bevestigt. **Hervatten:** laad skill `wds-4-ux-design` om Fase 4 (UX Design) te starten, beginnend bij scenario 01 (hoogste prioriteit).

---

## About This Folder

- **This file** — Single source of truth for project progress
- **agent-experiences/** — Compressed insights from design discussions (dated files)
- **wds-project-outline.yaml** — Project configuration from Phase 0 setup

**Do not modify `wds-project-outline.yaml`** — it is the source of truth for project configuration.
