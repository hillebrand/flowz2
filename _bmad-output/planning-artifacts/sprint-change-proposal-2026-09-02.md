---
title: Sprint Change Proposal — Beschikbare tijd via Google Calendar-agenda
date: 2026-09-02
status: approved
scope: major
---

# Sprint Change Proposal: Beschikbare tijd via Google Calendar-agenda

## 1. Issue Summary

**Trigger:** geen losse story die dit blootlegde — dit is een productbeslissing van Hillebrand na live gebruik van Flowz, vergelijkbaar met eerdere Correct Course-precedenten (AD-7/AD-8/AD-9, en de Correct Course van 2026-08-26 voor Story 2.4/2.5).

**Kernprobleem:** de huidige beschikbare-tijd-instelling (weekpatroon + dag-specifieke afwijkingen, UJ-3/FR11, Story 2.1/2.2) is een **tweede, handmatig bij te houden bron van waarheid** naast Eveliens werkelijke rooster/afspraken in Google Calendar. Dat is dubbel werk en foutgevoelig — de bestaande UJ-7-conflictdetectie was al een lapmiddel hiervoor.

**Nieuwe aanpak:** Evelien beheert tijdblokken in een eigen, aparte Google Calendar-agenda (om haar rooster, persoonlijke afspraken, eten e.d. heen). Flowz wijst die agenda aan als bron en leest de blokken als beschikbare tijd — dat vervangt de Flowz-eigen instelling volledig. Flowz plant sessies alleen binnen die blokken. Bij tijdgebrek verwijst "tijd verruimen" voortaan naar het aanpassen van die blokken in Google Calendar, niet naar een Flowz-instelling.

**Aanvullend inzicht (tijdens deze sessie):** omdat Evelien de blokken op elk moment buiten Flowz om kan wijzigen, moet Flowz dit niet alleen tijdens de escalatieflow controleren, maar bij elke app-opening: bestaande geplande sessies kunnen buiten (gewijzigde) blokken komen te vallen en moeten dan automatisch herpland worden, vóór eventuele verdere escalatie.

## 2. Impact Analysis

### Epic Impact

- **Epic 2 (Beschikbare Tijd & Agenda-koppeling):** kern verandert. Story 2.1 en 2.2 (Flowz-eigen weekpatroon/afwijkingen) vervallen, vervangen door een herziene Story 2.1 (agenda koppelen). Story 2.3 krijgt een kleine aanvulling (scheiding van agenda's). Story 2.4 is direct herbruikbaar. Story 2.5 krijgt een implementatienotitie (plaatsing nu begrensd door blokken).
- **Epic 3 (Taak Aanmaken met Automatische Tijdsverdeling):** de scheduling-engine (Story 3.1, 3.4) gebruikt voortaan live Calendar-afgeleide blokken i.p.v. het DB-datamodel als bron voor beschikbare tijd. Story 3.5 krijgt een nieuw triggermoment (app-open).
- **Epic 6 (Studiedruk Signaleren & Oplossen):** grootste impact. De "tijd verruimen"-stap in de escalatieketen (Story 6.1/6.2) wordt instructief i.p.v. direct toepasbaar, met een nieuwe hercontrole-actie. Story 6.5 hergebruikt hetzelfde patroon. Story 6.6 vervalt volledig (het exceptie-paneel dat het hergebruikte bestaat niet meer). Story 6.7 wordt volledig herschreven: van "conflict tussen ingestelde tijd en agenda" naar "controleer bij opstarten of de planning nog binnen de actuele blokken past, herplan zo nodig automatisch, escaleer pas als dat niet genoeg is".
- Geen nieuwe epics nodig; geen epics vervallen op epic-niveau; geen wijziging in epic-volgorde.

### Artifact Conflicts

- **PRD:** UJ-3 volledig herschreven, UJ-6 stap 2 herschreven, UJ-7 volledig herschreven, FR11 herschreven, FR18-20 inhoudelijk achterhaald (exacte herformulering/nummering bij de PM-fase), Datamodel-regel in Additional Requirements bijgewerkt (AvailableTimePattern/Exception vervalt, `availabilityCalendarId` toegevoegd). MVP blijft haalbaar — dit is een substitutie, geen scope-uitbreiding.
- **Architectuur:** nieuwe AD-10 (beschikbare tijd live afgeleid, geen eigen datamodel meer), AD-4 uitgebreid (pull-only geldt nu ook voor de scheduling-engine zelf), Consistency Conventions/naming bijgewerkt, Structural Seed krijgt een nieuwe `server/domain/availability/`-subfolder, ER-diagram verliest de AVAILABLE_TIME_PATTERN/EXCEPTION-relaties, Capability→Architecture map bijgewerkt voor UJ-3/UJ-6/UJ-7. Nieuw architectuurrisico: scheduling wordt afhankelijk van een live, foutbare Calendar-call — expliciete fallback (schuldvrije Notification bij falen, geen stille terugval) vastgelegd in AD-10.
- **UX:** 4.1-beschikbare-tijd-instellen wordt sterk vereenvoudigd (agenda-dropdown i.p.v. weekpatroon/kalender-UI); 8.1/8.2 (conflictmelding/-aanpassen) vervallen als losse schermen — opgaan in de herziene opstart-check; 3.2-tekort-oplossen en 7.1-weekoverzicht krijgen een nieuwe aanbeveling-kaart-variant (hercontrole i.p.v. direct accepteren) voor het "tijd verruimen"-type.
- **Overige artefacten:** geen CI/CD/teststrategie aanwezig, niet van toepassing. Wel een DB-migratie nodig (vervallen van `AvailableTimePattern`/`AvailableTimeException`-tabellen) — implementatiedetail, geen apart artefact.

## 3. Recommended Approach

**Gekozen pad: Optie 1 — Direct Aanpassen** (bestaande epics/stories wijzigen, binnen de huidige structuur).

- Optie 2 (Rollback) is niet zinvol: Story 2.4/2.5 zijn juist herbruikbare bouwstenen, geen belemmering.
- Optie 3 (MVP-scope herzien) is niet nodig: dit is een substitutie, geen scope-uitbreiding.
- Optie 1 hergebruikt bestaande infrastructuur maximaal (multi-agenda-lezen uit Story 2.4, blok-consolidatielogica uit Story 2.5, de escalatie-service uit Story 6.1) en blijft binnen de bestaande epic-structuur.

**Effort:** Medium-Hoog. **Risico:** Medium — voornamelijk de nieuwe live-Calendar-afhankelijkheid van de scheduling-engine (afgedekt door AD-10's expliciete fallback-eis).

## 4. Detailed Change Proposals

Zie de volledige before/after-voorstellen zoals doorlopen en goedgekeurd tijdens deze sessie, per artefact:

### PRD (`prd.md`)
- UJ-3 herschreven: "Evelien koppelt haar beschikbare-tijd-agenda" i.p.v. weekpatroon+kalender-instelling.
- UJ-6, stap 2 herschreven: instructieve suggestie + hercontrole i.p.v. directe Flowz-toepassing.
- UJ-7 volledig herschreven: "Flowz controleert bij opstarten of de planning nog binnen de beschikbare tijd past" — stille auto-herplanning, pas escaleren als dat niet genoeg is.
- FR11 herschreven naar de agenda-koppeling.
- FR18-FR20: inhoudelijk achterhaald door de nieuwe UJ-7; exacte herformulering/nummering bij de eerstvolgende `bmad-prd`-sessie.
- Datamodel-regel (Additional Requirements) bijgewerkt: `AvailableTimePattern`/`AvailableTimeException` vervallen, `User.availabilityCalendarId` toegevoegd.

### Architectuur (`ARCHITECTURE-SPINE.md`)
- Nieuwe **AD-10**: beschikbare tijd live afgeleid uit een aangewezen Google Calendar-agenda, geen eigen datamodel meer; expliciete fallback-eis bij een falende Calendar-read.
- **AD-4**: verduidelijking toegevoegd — pull-only geldt nu ook voor de scheduling-engine zelf.
- **Consistency Conventions (Naming):** `AvailableTimePattern`/`AvailableTimeException` verwijderd, toelichting `availabilityCalendarId` + `server/domain/availability/` toegevoegd.
- **Structural Seed:** nieuwe subfolder `server/domain/availability/`.
- **ER-diagram:** `AVAILABLE_TIME_PATTERN`/`AVAILABLE_TIME_EXCEPTION`-relaties verwijderd.
- **Capability → Architecture map:** rijen UJ-3, UJ-6, UJ-7 bijgewerkt met `server/domain/availability` en AD-10.

### Epics/Stories (`epics.md`)
- **Epic 2** koptekst en Implementation Notes bijgewerkt.
- **Story 2.1** vervangen: "Beschikbare-tijd-agenda Koppelen" (was "Weekpatroon Instellen").
- **Story 2.2** vervallen (was "Dag-specifieke Afwijkingen Instellen").
- **Story 2.3** nieuwe AC: schrijft nooit naar de beschikbare-tijd-agenda.
- **Story 2.5** Implementation Notes-toevoeging: plaatsing begrensd door blokken.
- **Story 3.1, 3.4** Implementation Notes-toevoeging: bron is voortaan `server/domain/availability`.
- **Story 3.5** nieuwe AC: app-open als nieuw herberekeningstriggermoment.
- **Story 6.1** stap 2 herschreven + nieuwe AC voor hercontrole-actie.
- **Story 6.2** nieuwe AC: recheck-knop-variant voor "tijd verruimen"-aanbevelingen.
- **Story 6.5** toevoeging: hergebruikt hetzelfde recheck-patroon.
- **Story 6.6** vervallen (was "Beschikbare Tijd Aanpassen na Conflict & Samenvatting").
- **Story 6.7** volledig herschreven: "Opstart-check — Planning versus Beschikbare-tijd-blokken".
- **FR Coverage Map:** regels voor FR11/FR18-20 te actualiseren in de PM-fase.

## 5. Implementation Handoff

**Classificatie: Major** — raakt datamodel, kern-scheduling-engine, een nieuwe architectuurbeslissing (AD-10), en UX-patronen verspreid over 3 epics.

**Handoff-volgorde:**
1. **Product Manager** (`bmad-prd`) — verwerkt de UJ-3/UJ-6/UJ-7-herschrijving, FR11 en de FR18-20-herformulering/nummering definitief in `prd.md`.
2. **Solution Architect** (`bmad-architecture`) — verwerkt AD-10, de AD-4-verduidelijking, Consistency Conventions, Structural Seed, ER-diagram en Capability-map definitief in `ARCHITECTURE-SPINE.md`; beslist expliciet over de Calendar-API-fallback-strategie.
3. **UX** (`bmad-ux`/WDS) — herziet 4.1-beschikbare-tijd-instellen, laat 8.1/8.2 vervallen, voegt de recheck-kaart-variant toe aan 3.2/7.1.
4. **Epics/Stories** (`bmad-create-epics-and-stories` of handmatige update) — verwerkt de bovenstaande story-wijzigingen definitief in `epics.md`, inclusief FR Coverage Map.
5. **Developer** (`bmad-dev-story`) — implementeert pas ná stap 1-4, te beginnen met Story 2.1 (herzien).

**Succescriteria:** Evelien kan een Google Calendar-agenda koppelen als beschikbare-tijd-bron; Flowz plant sessies uitsluitend binnen de blokken van die agenda; bij elke app-opening wordt de planning stil hersteld als blokken zijn gewijzigd, met escalatie alleen als dat niet genoeg is; geen enkele UI-tekst verwijst nog naar een Flowz-eigen weekpatroon/afwijkingen-instelling.

## Approval

Goedgekeurd door Hillebrand op 2026-09-02, incrementeel doorlopen (sectie voor sectie: PRD, architectuur, epics/stories).
