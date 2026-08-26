# Sprint Change Proposal — Samenvattende Huiswerk-Blokken per Dag

**Datum:** 2026-08-26
**Auteur:** Correct Course-workflow (met Hillebrand)
**Status:** Goedgekeurd

## 1. Issue Summary

De Calendar write-sync (Story 2.3, Epic 2) zet momenteel voor **elke geplande sessie
apart** een Calendar-event neer ("Huiswerk: {vak} — {titel}"). Bij meerdere taken op
dezelfde dag levert dat meerdere losse blokjes op in Eveliens agenda. Hillebrand wil
dat in plaats daarvan **één samenvattend "Huiswerk"-blok per aaneengesloten stuk vrije
tijd** verschijnt — eventueel meerdere blokken per dag als een bezet agenda-item
(bijvoorbeeld een avondeten-afspraak) de sessies van die dag onderbreekt.

## 2. Impact Analysis

### Epic Impact

- **Epic 2 (Beschikbare Tijd & Agenda-koppeling)** — blijft `in-progress`. Krijgt een
  nieuwe **Story 2.5**; Story 2.3 blijft grotendeels intact (kleur kiezen, her-consent,
  "bron van waarheid"-regel), alleen de schrijf-granulariteit uit AC #2 wordt vervangen.
- **Epic 3 (Taak Aanmaken)**, **Epic 4 (Werksessie Doorlopen)**, **Epic 6
  (Tijdgebrek-detectie t/m Agendaconflicten)** — geen wijziging aan hun eigen
  AC's/gedrag, maar hun **implementatie** roept straks een andere write-sync-functie
  aan (zie Technical Impact). Geen nieuwe stories nodig in deze epics — dit is een
  interne mechanismewijziging, geen zichtbare gedragswijziging voor die epics' eigen
  AC's.

### Artefactconflicten

- **PRD:** geen conflict. Geen enkele FR specificeert de Calendar-schrijf-granulariteit
  (FR28 zegt alleen "zet geplande/herplande sessies zelf als events" — compatibel met
  zowel per-sessie als per-dag-blok).
- **Architecture:** AD-7 beschreef expliciet "POST/PATCH/DELETE per sessie" — bijgewerkt
  met een verduidelijking die de nieuwe granulariteit vastlegt, de synchrone-binnen-
  request-regel zelf blijft ongewijzigd.
- **UX-specificaties:** geen conflict — UX-DR24 (write-sync) specificeert geen
  event-per-taak-eis.

### Technische Impact

Dit is de kern van de wijziging — raakt **7 bestaande aanroeppunten** verspreid over
Epic 3/4/6, plus het datamodel:

- `server/domain/tasks/create-task.ts`
- `server/domain/tasks/delete-task.ts`
- `server/domain/scheduling/apply-recommendation.ts`
- `server/domain/scheduling/session-placement.ts`
- `server/domain/scheduling/replan.ts`
- `server/domain/scheduling/energy.ts`
- `server/domain/scheduling/recalculate.ts`

Elk van deze roept vandaag zelf `createHomeworkEvent`/`updateHomeworkEvent`/
`deleteHomeworkEvent` per sessie aan. Na de wijziging roepen ze allemaal één nieuwe,
idempotente functie aan: `syncHomeworkBlocksForDate(userId, datum)` — voor de datum
(of datums, bij een verschoven sessie) die door hun mutatie geraakt is.

**Datamodel:** `sessions.googleEventId` (huidige bron van waarheid per sessie)
vervalt — migratie nodig. Nieuwe tabel `homeworkCalendarBlocks` (userId, datum,
starttijd, eindtijd, googleEventId) wordt de bron van waarheid per dag-blok.

**Overige raakvlakken:** `server/api/home/plan.get.ts`'s "sluit mijn eigen
huiswerk-event uit"-logica (nu op sessie-`googleEventId` gebaseerd) wordt op kleur
gebaseerd — consistent met hoe `conflict-detection.ts` dat al doet, en werkt daardoor
ook correct als een blok meerdere sessies dekt.

## 3. Recommended Approach

**Gekozen aanpak: Optie 1 — Direct Adjustment**, als nieuwe Story 2.5 (zelfde patroon
als Story 2.4). Geen rollback, geen PRD/MVP-heroverweging — dit is een interne
mechanismewijziging binnen bestaande scope.

- **Effort:** Gemiddeld/Hoog — 7 aanroeppunten aanpassen plus een nieuwe
  groeperingslogica (vrij/bezet-gebaseerd, hergebruikt Story 2.4's `isBlockingEvent`) en
  een schemamigratie.
- **Risico:** Gemiddeld — grotere blast radius dan Story 2.4 (7 aanroeppunten i.p.v. 5
  lezers), maar geïsoleerd tot de write-sync-laag; de scheduling-engine zelf
  (doelmoment, volgorde, herberekening) blijft volledig ongewijzigd. Idempotente
  herberekening per datum (AD-1-precedent) houdt het ontwerp voorspelbaar.

## 4. Detailed Change Proposals

### 4.1 Epics (`epics.md`)

- Nieuwe **Story 2.5: Samenvattende Huiswerk-Blokken per Dag** toegevoegd na Story 2.4,
  met volledige AC's (zie het document zelf) en een Implementation Notes-paragraaf die
  alle 7 aanroeppunten expliciet benoemt.
- Kruisverwijzing toegevoegd aan Story 2.3's AC #2 (blijft historisch leesbaar, met een
  duidelijke verwijzing naar wat vervangen is).
- Kleine tekstcorrectie in Story 2.4's laatste AC (verwees naar de nu-vervangen
  per-sessie-write-sync).

### 4.2 Architecture (`ARCHITECTURE-SPINE.md`, AD-7)

Verduidelijking toegevoegd: de schrijf-granulariteit is niet langer "per sessie" maar
"per datum, samenvattende blokken, gescheiden door bezette agenda-items". De
synchroon-binnen-request-regel en "Flowz is bron van waarheid voor eigen events"
blijven onverkort van kracht, nu per blok i.p.v. per sessie.

### 4.3 Implementation Artifacts

- `_bmad-output/implementation-artifacts/2-3-...md`: kruisverwijzing toegevoegd (zelfde
  tekst als in epics.md).
- `sprint-status.yaml`: nieuwe entry `2-5-samenvattende-huiswerk-blokken-per-dag:
backlog` onder Epic 2.

## 5. Implementation Handoff

**Scope-classificatie: Major** (raakt datamodel + 7 aanroeppunten over 3 epics heen),
maar productbeslissingen zijn al genomen door Hillebrand tijdens deze workflow — geen
verdere PM/Architect-escalatie nodig. Klaar voor de normale dev-cyclus.

- **Developer-agent:** implementeert Story 2.5 via `bmad-create-story` +
  `bmad-dev-story`. Succescriteria: alle 7 aanroeppunten roepen `syncHomeworkBlocksForDate`
  aan i.p.v. hun eigen create/update/delete-orkestratie; `sessions.googleEventId`
  vervalt via een echte Drizzle-migratie (generate + migrate, nooit push);
  `homeworkCalendarBlocks` is de nieuwe bron van waarheid; live geverifieerd tegen een
  echt account met een agenda-item (zoals een avondeten-afspraak) dat een dag daadwerkelijk
  in twee blokken splitst.

**MVP-impact:** geen. Blijft binnen de bestaande PRD-scope (FR28) en Story 2.3's
kernbeslissing (huiswerk zichtbaar in Calendar) — alleen de presentatie-granulariteit
verandert.
