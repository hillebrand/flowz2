# Sprint Change Proposal — Alle Geabonneerde Agenda's Meenemen bij Calendar-lezen

**Datum:** 2026-08-26
**Auteur:** Correct Course-workflow (met Hillebrand)
**Status:** Goedgekeurd

## 1. Issue Summary

Flowz leest agenda-items uitsluitend uit Evelien's **primary** Google-agenda
(`server/domain/calendar-sync/day-events.ts`, hardcoded endpoint
`calendars/primary/events`). In Google Calendar is Evelien echter
geabonneerd op meerdere aparte agenda's naast haar persoonlijke:

- een agenda van Magister met haar lesrooster,
- zelfgemaakte agenda's met geblokkeerde tijd voor slapen en eten.

Deze agenda's worden nu niet meegenomen, terwijl de PRD/UX-specificaties
generiek spreken over "Google Calendar-items" — d.w.z. de volledige agenda
zoals Evelien die ook in Google Calendar zelf ziet, niet specifiek de
persoonlijke agenda. Dit is een technische lacune in de implementatie,
ontdekt door Hillebrand tijdens gebruik van de live app (geen falende
story/test — een gedragsobservatie).

**Impact:** het Magister-rooster en de slaap/eet-blokkades tellen nu ten
onrechte niet mee in de dagweergave, de tijdgebrek-detectie, de
"werkelijk beschikbare tijd"-berekening en de agendaconflict-detectie bij
opstarten — Flowz kan hierdoor sessies plannen op momenten die voor
Evelien in werkelijkheid al bezet zijn.

## 2. Impact Analysis

### Epic Impact

- **Epic 2 (Beschikbare Tijd & Agenda-koppeling)** — status `done` → teruggezet naar
  `in-progress`. Krijgt één nieuwe story (2.4) die de gedeelde
  Calendar-leesfunctie uitbreidt.
- **Epic 4 (Werksessie Doorlopen)** en **Epic 6 (Tijdgebrek-detectie t/m
  Agendaconflicten)** — geen wijziging aan hun eigen stories/AC's nodig.
  Beide consumeren de gedeelde `getTodayEvents`-functie en profiteren
  automatisch mee zodra Story 2.4 is opgeleverd.
- Geen andere epics geraakt, geen epics vervallen, geen herprioritering nodig.

### Artefactconflicten

- **PRD:** geen conflict. FR1, FR14, FR18 spreken generiek over "Google
  Calendar-items" — al compatibel met meerdere agenda's. Geen PRD-wijziging.
- **Architecture:** geen structurele wijziging. AD-4 (pull-only,
  request-gedreven lezen) blijft onverkort van kracht — er worden alleen
  méér agenda's per request bevraagd, niet anders bevraagd. Eén
  verduidelijkende aantekening toegevoegd aan AD-4 (zie §4).
- **UX-specificaties:** geen conflict. UX-DR4, UX-DR21, UX-DR22 beperken
  zich nergens tot de primary-agenda.
- **OAuth-scope:** geen wijziging nodig. De bestaande
  `calendar.readonly`-scope (Story 1.2) geeft al toegang tot alle voor de
  gebruiker zichtbare agenda's via `calendarList.list` — geen nieuwe
  consent-stap.
- **Overige artefacten** (CI/CD, IaC, monitoring): geen impact.

### Technische Impact

Vijf bestaande consumenten van `getTodayEvents` (`server/api/home/plan.get.ts`,
`server/domain/scheduling/week-overview.ts`,
`server/domain/scheduling/shortfall.ts`,
`server/domain/calendar-sync/actual-availability.ts`,
`server/domain/calendar-sync/conflict-detection.ts`) blijven ongewijzigd —
ze werken door op hetzelfde `DayEvent[] | null`-contract. Alleen
`day-events.ts` zelf verandert intern: `calendarList.list` +
events-ophaal-per-agenda + samenvoegen, met best-effort-gedrag bij een
gedeeltelijke mislukking (zie Story 2.4 AC's).

## 3. Recommended Approach

**Gekozen aanpak: Optie 1 — Direct Adjustment.** Eén nieuwe story (2.4)
toegevoegd aan het bestaande Epic 2, geen rollback en geen PRD/MVP-
heroverweging nodig.

- **Effort:** Laag/Gemiddeld — de wijziging is beperkt tot
  `day-events.ts` plus een kleine notificatie-toevoeging in
  `plan.get.ts`; geen nieuwe OAuth-scope, geen datamodelwijziging.
- **Risico:** Laag — alle 5 afnemers blijven op hetzelfde contract werken;
  best-effort-gedrag voorkomt dat één haperende agenda de hele app blokkeert.

Rollback (Optie 2) is niet aan de orde: er is geen eerder werk dat
teruggedraaid hoeft te worden, dit is een additieve uitbreiding. MVP-
heroverweging (Optie 3) is niet aan de orde: geen scope- of doelwijziging.

## 4. Detailed Change Proposals

### 4.1 Epics (`_bmad-output/planning-artifacts/epics.md`)

Nieuwe **Story 2.4: Alle Geabonneerde Agenda's Meenemen bij Calendar-lezen**
toegevoegd onder Epic 2, na Story 2.3. Volledige AC's zijn vastgelegd in
het document zelf. Kernpunten:

- `calendarList.list` bepaalt alle zichtbare/geabonneerde agenda's
  (`selected=true`, niet verborgen).
- Events per agenda worden samengevoegd tot hetzelfde `DayEvent[]`-contract
  als nu — geen wijziging aan de 5 bestaande afnemers.
- **Best-effort bij gedeeltelijke mislukking:** agenda's die wel lukken
  worden getoond; een mislukte agenda wordt overgeslagen, met een
  niet-blokkerende Notification (AD-6-shape) op het hoofdscherm
  ("Agenda '{naam}' kon niet worden opgehaald") — per mislukte agenda
  één melding. De overige 4 schermen blijven stil op de best-effort-data,
  zelfde precedent als bij een volledige Calendar-uitval nu al.
- Faalt `calendarList.list` zelf, of falen alle agenda's individueel, dan
  blijft het totaalresultaat `null` — ongewijzigd fail-safe-contract.
- Homework-kleur-uitsluiting (FR28) blijft ongewijzigd: huiswerk-events
  staan uitsluitend in de primary-agenda.

*Rationale: dit is de kern van de fix — de gedeelde leesfunctie wordt de
bron van waarheid voor alle 5 consumenten tegelijk.*

### 4.2 Architecture (`ARCHITECTURE-SPINE.md`, AD-4)

Toegevoegd:

> **Verduidelijking [TOEGEVOEGD 2026-08-26, Correct Course]:** "Calendar-data"
> omvat alle voor de gebruiker zichtbare/geabonneerde agenda's (via
> `calendarList.list`, zelfde `calendar.readonly`-scope), niet alleen de
> primary-agenda — zie Epic 2, Story 2.4. Geen wijziging aan de
> pull-only-regel zelf, alleen aan het aantal agenda's dat per request
> bevraagd wordt.

*Rationale: voorkomt dat een toekomstige lezer AD-4 opnieuw als
"primary-only" interpreteert.*

### 4.3 Sprint Status (`sprint-status.yaml`)

- `epic-2`: `done` → `in-progress` (heeft weer een niet-`done` story)
- Nieuw: `2-4-alle-geabonneerde-agendas-meenemen-bij-calendar-lezen: backlog`

## 5. Implementation Handoff

**Scope-classificatie: Moderate** — vereist een backlogtoevoeging
(nieuwe story in een al afgeronde epic) plus implementatie. Geen PM/
Architect-escalatie nodig; geen PRD-wijziging.

- **Product Owner-rol (Hillebrand):** heeft Story 2.4 en de
  scope/fail-safe-beslissingen tijdens deze workflow al goedgekeurd — geen
  verdere PO-actie nodig vóór dev-start.
- **Developer-agent:** implementeert Story 2.4 via `bmad-create-story` +
  `bmad-dev-story` (of `bmad-quick-dev`) op basis van de vastgelegde AC's in
  `epics.md`. Succescriteria: alle 5 bestaande afnemers blijven werken
  zonder codewijziging aan henzelf; nieuwe/gewijzigde tests dekken
  best-effort-gedrag (gedeeltelijke mislukking) en het volledige-mislukking-
  pad (`null`).

**MVP-impact:** geen. Dit blijft binnen de bestaande PRD-scope (FR1, FR14,
FR18) en versterkt alleen de betrouwbaarheid van al bestaande
functionaliteit.
