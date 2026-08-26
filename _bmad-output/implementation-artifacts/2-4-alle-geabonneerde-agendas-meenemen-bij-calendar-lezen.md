---
baseline_commit: c5c7d1e
---

# Story 2.4: Alle Geabonneerde Agenda's Meenemen bij Calendar-lezen

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want dat Flowz mijn volledige Google Calendar leest (alle agenda's die ik zie in Google Calendar, niet alleen mijn persoonlijke agenda),
so that het Magister-rooster en mijn zelfgemaakte slaap/eet-agenda's meetellen in de dagweergave, tijdgebrek-detectie en agendaconflict-detectie.

## Acceptance Criteria

1. **Given** Evelien is ingelogd met `calendar.readonly`-scope (Story 1.2), **when** `server/domain/calendar-sync/day-events.ts` agenda-items ophaalt voor een dag, **then** wordt eerst `calendarList.list` aangeroepen om alle voor Evelien zichtbare/geabonneerde agenda's te bepalen (niet verborgen, wél geselecteerd voor weergave — zie Dev Notes voor de exacte filter), **and** worden voor elke gevonden agenda de events voor die dag opgehaald en samengevoegd tot één resultaat — alle 5 bestaande afnemers (home-plan, week-overview, shortfall, actual-availability, conflict-detection) blijven op hetzelfde `DayEvent`-vorm werken.
2. **Given** een individuele agenda-aanroep (calendarList zelf, of één specifieke agenda's events) mislukt, maar niet allemaal, **when** de resultaten worden samengevoegd, **then** blijft het resultaat best-effort: agenda's die wel lukten worden gewoon meegenomen, de mislukte agenda('s) worden overgeslagen, **and** toont het hoofdscherm (`server/api/home/plan.get.ts` → `app/pages/index.vue`) per mislukte agenda een niet-blokkerende melding (bestaande `Notification`-shape, AD-6) met de agendanaam ("Agenda '{naam}' kon niet worden opgehaald"), **and** blijven de overige 4 afnemers stil op de best-effort-data (zelfde precedent als bij een volledige Calendar-uitval nu al — geen eigen melding daar).
3. **Given** zowel `calendarList.list` faalt, of alle individuele agenda-aanroepen falen, **when** het totaalresultaat wordt bepaald, **then** is het resultaat `null` — zelfde fail-safe-contract als nu (elke bestaande consumer's `null`-afhandeling blijft ongewijzigd correct).
4. **Given** een huiswerk-kleur is ingesteld (FR28, Story 2.3), **when** agenda-items worden samengevoegd, **then** blijft de homework-kleur-uitsluiting in `conflict-detection.ts` ongewijzigd werken (huiswerk-events staan uitsluitend in de primary-agenda; `homework-events.ts`'s write-sync blijft volledig ongemoeid door deze story).

## Tasks / Subtasks

- [x] Task 1: `day-events.ts` — generaliseer de request-helper (AC: #1, #2, #3)
  - [x] Huidige `calendarGetMetVerversing(userId, accessToken, query)` (regel 38-47) is hardcoded op `CALENDAR_EVENTS_URL = '.../calendars/primary/events'`. Generaliseer 'm zodat hij een volledige URL accepteert (calendarList-endpoint én N verschillende `calendars/{id}/events`-endpoints) — zelfde probeer/ververs-bij-401-logica blijft ongewijzigd, alleen de URL wordt een parameter i.p.v. een module-constante.
  - [x] **Niet aanraken:** `homework-events.ts`'s eigen, losse kopie van dit patroon (`calendarRequestMetVerversing`) — die blijft bewust op `primary` hardcoded (write-sync is en blijft primary-only, AC #4). Dit project accepteert kleine duplicatie tussen de twee bestanden tot een derde consument ontstaat (zelfde precedent als `day-events.ts`'s eigen bovenschrift al citeert) — geen gedeelde util forceren voor déze story.
- [x] Task 2: `day-events.ts` — `calendarList.list` + best-effort samenvoegen (AC: #1, #2, #3)
  - [x] Nieuw endpoint: `GET https://www.googleapis.com/calendar/v3/users/me/calendarList`. Bepaal zelf, en **verifieer live** (geen testframework in dit project — zie Dev Notes "Testen"), welk veld correct filtert op "agenda's die Evelien ook echt in Google Calendar ziet": kandidaten zijn `selected` (bepaalt weergave in de UI) en `hidden` (default `false`). Filter minstens op `hidden !== true`; neem `selected !== false` mee als de live-test bevestigt dat dit de juiste set oplevert (Magister-agenda + de zelfgemaakte slaap/eet-agenda's moeten er allemaal in zitten, niets ongewenst extra).
  - [x] Voor elke overgebleven agenda (`id`, `summary`): events ophalen met dezelfde `timeMin`/`timeMax`/`singleEvents`/`orderBy`-query als nu (regel 57-62), via `GET .../calendars/{encodeURIComponent(id)}/events`.
  - [x] Voer de N events-aanroepen **parallel** uit (`Promise.all`, elk in zijn eigen try/catch of met een per-call ok/fail-resultaat — niet één aanroep laten falen de rest laten wegvallen).
  - [x] Nieuw returntype (vervangt `DayEvent[] | null`):
    ```ts
    export interface DayEventsResult {
      events: DayEvent[]
      failedCalendarNames: string[]
    }
    export async function getTodayEvents(userId: string, date: string): Promise<DayEventsResult | null>
    ```
  - [x] Samenvoegen: `events` = alle gelukte agenda's samen, gesorteerd op `startsAt` (behoud het bestaande "chronologisch"-gedrag dat `orderBy: startTime` nu per-agenda al gaf — met meerdere agenda's moet je zelf na het samenvoegen opnieuw sorteren). `failedCalendarNames` = `summary` (val terug op `id` als `summary` ontbreekt) van elke agenda waarvan de events-aanroep niet ok was.
  - [x] **Fail-safe-regels (AC #3):** `calendarList.list` zelf faalt (non-2xx/netwerkfout/parse-fout) → hele functie retourneert `null` (zelfde als nu). Calendarlijst leeg (0 agenda's) → geldig resultaat `{ events: [], failedCalendarNames: [] }`, geen `null`. Alle individuele agenda's falen (calendarList lukte, maar 0 van N events-calls slaagden) → `null`. Minstens 1 van N slaagt → best-effort resultaat met de rest in `failedCalendarNames`.
  - [x] Behoud de bestaande outer try/catch (regel 52-79's vorm) — elke onverwachte fout blijft `null`, nooit een geworpen exception (huidig contract, alle 5 consumers vertrouwen hierop).
- [x] Task 3: Vijf bestaande consumers aanpassen op het nieuwe returntype (AC: #1)
  - [x] `server/domain/calendar-sync/actual-availability.ts:72`: `const events = await getTodayEvents(...)` → wordt `const result = await getTodayEvents(...)`, `if (!result) throw ...` (regel 77-79 blijft inhoudelijk hetzelfde, nu op `result`), verderop `result.events` i.p.v. `events` (regel 81+).
  - [x] `server/domain/calendar-sync/conflict-detection.ts:42-47`: `const [events, dismissedIds] = ...` → `events` wordt `result`; `if (!events) return []` → `if (!result) return []`; `buildConflicts(date, taskSessions, result.events, ...)`.
  - [x] `server/domain/scheduling/week-overview.ts:26-27`: `const events = await getTodayEvents(...)`; `const calendarItems = events ? events.map(...) : null` → `const result = await getTodayEvents(...)`; `const calendarItems = result ? result.events.map(...) : null`.
  - [x] `server/domain/scheduling/shortfall.ts:120-121`: `const events = await getTodayEvents(...)`; `const agendaFactor = events ? clamp01(events.length / ...) : 0` → `result`/`result.events.length`.
  - [x] `server/api/home/plan.get.ts:34,70,72,78`: zie Task 4 — dit bestand verandert het meest, want het moet ook de nieuwe Notification tonen.
- [x] Task 4: Hoofdscherm — Notification bij gedeeltelijke mislukking (AC: #2)
  - [x] `shared/types/tasks.d.ts`'s `HomePlanResponse` (regel 74-100): nieuw veld toevoegen: `calendarWarnings: { type: 'info' | 'warning', message: string }[] | null`. **Geen import van `server/domain/notification.ts`** — geverifieerd: `shared/` importeert nergens een `server/domain`-type, dit project houdt die grens consequent aan; dupliceer hier alleen de twee velden die je nodig hebt, niet de volledige `Notification`/`NotificationAction`-vorm (geen `actions` nodig, deze melding heeft er nooit een). `null` = geen enkele agenda kon opgehaald worden (consistent met `calendarDayEvents: null`'s bestaande betekenis) of geen taak vandaag; `[]` = alles gelukt, geen waarschuwing.
  - [x] `server/api/home/plan.get.ts`: `getTodayEvents(userId, today)` levert nu `calendarDayEvents` (hernoem lokaal, was al zo genoemd) als `DayEventsResult | null`. Bouw `calendarWarnings` uit `result.failedCalendarNames` (één entry per naam: `{ type: 'info', message: \`Agenda '${naam}' kon niet worden opgehaald\` }`); `null` als `result` zelf `null` is. Pas regel 70-80 aan naar `result.events` i.p.v. het huidige `calendarDayEvents`-array (self-overlap-filter, client-projectie — beide blijven inhoudelijk ongewijzigd, alleen het pad `.events` erbij).
  - [x] `app/pages/index.vue`: nieuwe sectie/banner die `plan.value?.calendarWarnings` itereert en toont (zelfde stijl-precedent als `home-warning-banner`, regel 220-222) — los van `warningBannerText` (die blijft de sessionTimeCheck-banner, niet aanraken). Geen "actions"/knoppen nodig, puur informatief.
- [x] Task 5: Verificatie
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] **Live verificatie tegen een echt account** — gedeployed naar de dev-stage (`https://flowz.fyi`, stage `dev`). Hillebrand logde in met een account met meerdere agenda's en bevestigde: de dagweergave op het hoofdscherm toont nu events uit meerdere agenda's, niet alleen de persoonlijke/primary-agenda (AC #1 bevestigd, `calendarList`'s `selected`/`hidden`-filter werkt zoals bedoeld). **Niet apart live geforceerd:** het best-effort-partial-failure-pad (AC #2, `failedCalendarNames` → `calendarWarnings`-banner) — dat vereist een kunstmatig falende agenda-aanroep (bv. via een tijdelijke debug-route, zoals Story 2.3 deed); Hillebrand koos bewust voor de eenvoudigere "log zelf in en kijk"-verificatie i.p.v. die extra deploy/opruim-cyclus. Dat pad steunt daarom op typecheck + code-inspectie, niet op een live-geforceerde fout — expliciet vastgelegd als bekende beperking, geen aanname die als "geverifieerd" wordt gepresenteerd.
  - [x] Geen secrets/placeholder-waarden in code/commits; geen debug-route aangemaakt voor deze story (niet nodig gebleken, zie hierboven).

## Dev Notes

### Waarom het returntype verandert (niet gewoon `DayEvent[] | null` laten staan)

Best-effort bij een gedeeltelijke mislukking (AC #2) vereist dat de aanroeper weet **welke** agenda('s) faalden, om de naam in de Notification te tonen. Een simpele `DayEvent[] | null` kan dat onderscheid niet dragen — vandaar de nieuwe `DayEventsResult`-vorm. Dit is een bewuste contractwijziging, geen toevoeging: alle 5 bestaande call sites moeten mee, zie Task 3.

### `calendarList.list` — velden nog empirisch te bevestigen

Dit project heeft nog nooit `calendarList.list` aangeroepen. Google's documentatie (web-onderzoek, niet live geverifieerd in dít project): elk item heeft `id`, `summary`, `selected` (of het item in de UI geselecteerd/zichtbaar is — kan ontbreken), `hidden` (default `false`), `primary` (of dit de hoofdagenda is). Volg dit project se eigen precedent (Story 2.3's Dev Notes: "web-onderzoek, niet aangenomen") — bevestig live tegen een echt account met een niet-primary, niet-verborgen agenda (bv. een gedeelde/geabonneerde agenda) dat die daadwerkelijk in de respons zit vóórdat je de filter-logica als correct beschouwt.

### `calendarWarnings` leent de geest van AD-6, niet het `Notification`-type zelf

AD-6 bindt de `Notification`-shape letterlijk aan UJ-6/7/8 (tijd-/energiegebrek) en die shape leeft in `server/domain/notification.ts` — niet importeerbaar vanuit `shared/`. `calendarWarnings` is daarom een eigen, kleiner shape in `shared/types/tasks.d.ts` (zie Task 4) dat dezelfde AD-6-geest volgt: nooit de technische error-envelope (`server/domain/errors.ts`) voor iets dat niet blokkeert en neutraal/informatief moet blijven. Bewuste, kleine keuze — geen architectuurdiscussie nodig, wel hier vastgelegd zodat het niet als vergissing oogt.

### Wat ongewijzigd blijft

- `homework-events.ts` (write-sync, Story 2.3) — blijft volledig primary-only, raakt AC #4 niet.
- De self-overlap-filter in `plan.get.ts` (regel 70-73, sessie's eigen huiswerk-event uitsluiten) — inhoudelijk ongewijzigd, werkt nu op `result.events`.
- De homework-kleur-uitsluiting in `conflict-detection.ts` (regel 62-66) — werkt op `events: DayEvent[]`, dat blijft dezelfde vorm, alleen de bron (`result.events` i.p.v. het array zelf) verandert.
- `session-time-check.ts` — raakt `getTodayEvents` niet rechtstreeks, geen wijziging nodig.

### Testen

Nog steeds geen testframework (project-breed, ongewijzigd sinds Story 2.3). Live verificatie tegen een echt Google-account blijft de enige manier om `calendarList`-veldgedrag en het best-effort-samenvoegpad te bevestigen — zie Task 5.

### Architectuurcompliance

- **AD-4:** blijft ongewijzigd — nog steeds pull-only, per-request, geen caching/webhooks. Alleen méér agenda's per request, niet anders bevraagd. Verduidelijking al toegevoegd aan AD-4 in de architectuurspine (zie References).
- **AD-6:** hergebruik van de `Notification`-shape voor een niet-UJ-6/7/8-melding — zie Dev Notes hierboven, bewuste keuze, geen technische error-envelope.
- **Mutatie-ownership:** niet van toepassing — deze story is puur lezend, geen nieuwe route/mutatie.

## Previous Story Intelligence (Story 2.3)

- **`server/routes/auth/google.get.ts` niet aanraken** — deze story heeft geen nieuwe OAuth-scope nodig (bestaande `calendar.readonly` volstaat al voor `calendarList.list` + events op elke zichtbare agenda), dus dit bestand blijft volledig buiten scope.
- **Probeer-dan-ververs-bij-401-patroon (`calendarGetMetVerversing`)** — generaliseer 'm (Task 1), maar verander het 401-gedrag zelf niet: exact één ververs-poging, geen retry-loop.
- **Live verificatie is bij dit project altijd de echte afsluiter, niet optioneel** — Story 2.3 vond zo een externe blocker (Calendar API niet geactiveerd) en een foute aanname (404 vs. tombstone-200) die alleen live zichtbaar werden. Neem ook hier niets aan over `calendarList`'s exacte veldgedrag zonder het te bevestigen.
- **Tijdelijke debug-routes/scripts altijd verwijderen en de verwijdering zelf verifiëren** (een `404` op de oude route met een geldige sessie, niet aannemen dat "weg" ook echt weg is).

## Git Intelligence

Laatste relevante commits: `535955b` (Epic 6, `actual-availability.ts`/`conflict-detection.ts`/`day-events.ts` alle drie geraakt — precies de bestanden die deze story weer aanraakt), `ec4f07a` (Story 4.2, eerste lees-only Calendar-integratie — de comment in `day-events.ts:5-8` die expliciet "Eerste lees-only Calendar-integratie" zegt, is met deze story niet meer helemaal accuraat en mag bijgewerkt worden), `ff12fcc` (Story 2.3, write-sync-service — blijft ongemoeid).

## Project Structure Notes

- Gewijzigd: `server/domain/calendar-sync/day-events.ts` (kernwijziging), `server/domain/calendar-sync/actual-availability.ts`, `server/domain/calendar-sync/conflict-detection.ts`, `server/domain/scheduling/week-overview.ts`, `server/domain/scheduling/shortfall.ts`, `server/api/home/plan.get.ts`, `shared/types/tasks.d.ts`, `app/pages/index.vue`.
- Geen nieuwe bestanden/mappen nodig, geen schema-/migratiewijziging, geen nieuwe OAuth-scope.
- Geen conflicten met bestaande structuur.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.4] — user story + acceptatiecriteria (brontekst, deze story is 1-op-1 overgenomen)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-26.md] — volledige Correct Course-analyse en rationale achter deze story
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-4] — pull-only-regel + de nieuwe verduidelijking over meerdere agenda's
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-6] — Notification-shape-conventie
- [Source: server/domain/calendar-sync/day-events.ts] — huidige implementatie (primary-only), exacte regelverwijzingen hierboven
- [Source: server/domain/calendar-sync/actual-availability.ts, conflict-detection.ts, server/domain/scheduling/week-overview.ts, shortfall.ts, server/api/home/plan.get.ts] — alle 5 huidige consumers
- [Source: server/domain/notification.ts] — bestaand `Notification`/`NotificationAction`-type
- [Source: shared/types/tasks.d.ts#HomePlanResponse] — te wijzigen response-vorm
- [Source: app/pages/index.vue] — te wijzigen hoofdscherm-UI
- [Source: _bmad-output/implementation-artifacts/2-3-huiswerk-kleur-kiezen-calendar-write-sync-service.md] — vorige calendar-sync-story, live-verificatie-precedent, token-refresh-patroon
- Web-onderzoek (nog te bevestigen live, zie Dev Notes): [CalendarList: list — Google Calendar API](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list), [Events: list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)

## Open Questions

Geen blokkerende — de architecturale keuzes (nieuw `DayEventsResult`-returntype, best-effort-samenvoegen, `Notification`-hergebruik voor de partial-failure-melding, alleen Home toont de melding) zijn via de Correct Course-workflow met Hillebrand al vastgelegd (zie sprint-change-proposal-2026-08-26.md). Eén empirische vraag blijft open tot de live-verificatie in Task 5: of `selected !== false` de juiste filter is naast `hidden !== true`, of dat `hidden !== true` alleen al volstaat — bepaal dit tijdens implementatie, niet vooraf aangenomen.

## Review Findings

### Code review 2026-08-26 (gecombineerde review over Stories 2.4/2.5/7.1/7.2, `/code-review`)

- [x] [Review][Defer] **`getTodayEvents`'s `Promise.all` over alle geabonneerde agenda's laat een verlopen access-token tot N onafhankelijke, gelijktijdige `refreshCalendarAccessToken`-aanroepen leiden** (één per agenda) i.p.v. één gedeelde verversing. Geen correctheidsfout (Google's `refresh_token`-grant staat gelijktijdig hergebruik toe; het ergste geval is een paar overbodige round-trips plus een onschadelijke "laatste-schrijft-wint" op het opgeslagen access-token), puur vermijdbare inefficiëntie. **Reden voor doorschuiven:** het token-ververs-ontwerp zelf (probeer-dan-ververs-bij-401, geen proactieve verversing) bestond al vóór deze story (Task 5, server/domain/auth/calendar-token.ts) — deze story vergrootte alleen de bereik door de bestaande `Promise.all` over meerdere agenda's te introduceren. Geen incident hiervan waargenomen; een fix (ververs éénmaal vooraf, of een gedeelde in-flight-refresh-promise) is straightforward maar niet urgent. [server/domain/calendar-sync/day-events.ts:138-144]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **`selected`/`hidden`-filter empirisch bevestigd correct** — geen aparte aanname nodig gebleken; de live dagweergave op `flowz.fyi` toonde na deploy meteen events uit meerdere agenda's, zonder een expliciete losse test van de filterlogica zelf.
- **Deploy-infrastructuurincident, losstaand van de code-implementatie:** de eerste `sst deploy --stage dev`-poging liep tegen een verkeerde AWS-regio aan (`eu-central-1` i.p.v. `eu-west-1`, afkomstig uit het `[default]`-AWS-profiel se regio toen `AWS_PROFILE` was uitgezet zonder een expliciete regio te zetten) en bootstrapte daar een volledig parallelle, ongebruikte SST-state. De live site zelf (CDN, DNS, Lambda, originele state) is hierdoor niet geraakt — bevestigd via `LastModifiedTime` van de CloudFront-distributie (nog steeds 2026-07-28) en de `/sst/bootstrap`-SSM-parameter in `eu-west-1` (ongewijzigd). De per ongeluk aangemaakte resources (2 lege S3-buckets, een SST-state/asset-bucketpaar, een ongebruikte CloudFront-KeyValueStore, 2 overtollige maar ISSUED ACM-certificaten) zijn met Hillebrand samen opgeruimd. De tweede deploy-poging, met `AWS_REGION=eu-west-1` expliciet gezet, gebruikte correct de bestaande state (`Updated`/`Created` alleen voor de daadwerkelijk gewijzigde onderdelen: Lambda-functie, asset-files, cache-invalidatie) en slaagde.
- **Live-verificatie van AC #2's best-effort-partial-failure-pad is niet uitgevoerd** — zie Task 5, bewuste, expliciete keuze van Hillebrand om de eenvoudigere verificatieroute te nemen. Dit pad (het `failedCalendarNames`-verzamelen en de `calendarWarnings`-notification) is dus alleen getypecheckt/gebouwd/code-gereviewed, niet met een echt geforceerde Calendar-fout bevestigd.
- **Review-toevoeging, ontdekt tijdens dezelfde live-verificatie:** dagvullende, informatieve afspraken uit de nieuw-toegevoegde agenda's (bv. een Magister-agenda-item) die in Google Calendar zelf op "Vrij" staan (`transparency: 'transparent'`), blokkeerden ten onrechte de beschikbaarheid — tot dan toe werd alleen op "heeft een tijdstip" (`isTimedEvent`) gefilterd, nooit op vrij/bezet. Opgelost: `DayEvent.transparency` toegevoegd (uit Google's Events-API, ontbrekend = 'opaque'/bezet, Google's eigen default), en een nieuwe `isBlockingEvent`-predicate (`actual-availability.ts`, hergebruikt door `conflict-detection.ts` en lokaal gedupliceerd in `session-time-check.ts`, zelfde precedent als `isTimedEvent`) die zowel "heeft een tijdstip" als "niet expliciet 'transparent'" eist. `week-overview.ts`/`plan.get.ts`'s dagweergaven blijven bewust ongefilterd (alle events tonen, ook vrije — alleen het *blokkerende* gedrag verandert). Opnieuw getypecheckt, gebouwd en gedeployed; Hillebrand verifieert live.

### Completion Notes List

- Alle 4 AC's zijn geïmplementeerd; AC #1 is live end-to-end bevestigd tegen een echt account met meerdere agenda's. AC #2's happy path (agenda's die wél lukken komen door) is impliciet meegetest (alle agenda's van het testaccount lukten); het partial-failure-pad zelf (een agenda die expres faalt) is niet apart live getest — zie Debug Log.
- AC #3 (volledige mislukking → `null`) en AC #4 (homework-kleur-uitsluiting blijft werken, write-sync ongemoeid) zijn niet apart live getest, maar wel door code-inspectie geverifieerd: `homework-events.ts` is in deze story niet aangeraakt, en de `null`-fail-safe-paden in alle 5 consumers zijn ongewijzigd t.o.v. hun bestaande, al eerder geteste gedrag (alleen het toegangspad `.events`/`result` is aangepast).
- Geen nieuwe dependencies, geen schema-/migratiewijziging, geen nieuwe OAuth-scope — scope strak gehouden conform de story.
- Deploy-incident (zie Debug Log) was een omgevingsconfiguratiefout tijdens verificatie, geen gevolg van de code-wijzigingen zelf; volledig opgelost en opgeruimd vóór het afronden van deze story.

### File List

**Gewijzigd:**
- `server/domain/calendar-sync/day-events.ts` (kernwijziging: `calendarList.list` + best-effort multi-agenda-samenvoeging, generieke request-helper, nieuw `DayEventsResult`-returntype, `DayEvent.transparency`-veld)
- `server/domain/calendar-sync/actual-availability.ts` (aangepast op `DayEventsResult`; nieuwe `isBlockingEvent`-export)
- `server/domain/calendar-sync/conflict-detection.ts` (aangepast op `DayEventsResult`; gebruikt nu `isBlockingEvent` i.p.v. `isTimedEvent`)
- `server/domain/calendar-sync/session-time-check.ts` (lokale `isBlockingEvent`-kopie, zelfde vrij/bezet-regel)
- `server/domain/scheduling/week-overview.ts` (aangepast op `DayEventsResult`)
- `server/domain/scheduling/shortfall.ts` (aangepast op `DayEventsResult`)
- `server/api/home/plan.get.ts` (aangepast op `DayEventsResult`, nieuwe `calendarWarnings`-opbouw)
- `shared/types/tasks.d.ts` (`HomePlanResponse.calendarWarnings` toegevoegd)
- `app/pages/index.vue` (nieuwe `home-calendar-warnings`-sectie + stijl)

**Niet gewijzigd (bewust, zie Dev Notes):**
- `server/domain/calendar-sync/homework-events.ts` — blijft primary-only (write-sync, AC #4)
- `server/routes/auth/google.get.ts` — geen nieuwe OAuth-scope nodig

**Live gedeployed:** dev-stage op `flowz.fyi` (stage `dev`), AWS-account 787309524528, regio `eu-west-1`.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-26 | Story aangemaakt via create-story, direct aansluitend op de Correct Course-workflow (sprint-change-proposal-2026-08-26.md). |
| 2026-08-26 | Task 1-4 geïmplementeerd: `day-events.ts` uitgebreid met `calendarList.list` + best-effort multi-agenda-samenvoeging (nieuw `DayEventsResult`-returntype), alle 5 consumers aangepast, `calendarWarnings` toegevoegd aan `HomePlanResponse` en het hoofdscherm. `npm run typecheck`/`npx nuxt build` slagen. |
| 2026-08-26 | Live-verificatie (Task 5): deploy naar dev-stage liep eerst tegen een AWS-regioconfiguratiefout aan (verkeerde regio door een ontbrekende expliciete `AWS_REGION` na het uitzetten van `AWS_PROFILE`), waardoor een parallelle, ongebruikte SST-state in `eu-central-1`/`us-east-1` ontstond — losstaand van de code, de live site zelf bleef ongemoeid. Samen met Hillebrand opgeruimd; tweede deploy-poging (regio expliciet `eu-west-1`) slaagde en gebruikte correct de bestaande state. Hillebrand bevestigde live op `flowz.fyi` dat de dagweergave nu meerdere agenda's toont. Status → review. |
| 2026-08-26 | Review-toevoeging: Hillebrand meldde dat dagvullende, informatieve afspraken (op "Vrij" in Google Calendar) ten onrechte de beschikbaarheid blokkeerden. `DayEvent.transparency` + `isBlockingEvent` toegevoegd (`actual-availability.ts`, hergebruikt door `conflict-detection.ts`/`session-time-check.ts`); dagweergaven blijven ongefilterd (informatief). Typecheck/build slagen, opnieuw gedeployed naar `flowz.fyi`. |
