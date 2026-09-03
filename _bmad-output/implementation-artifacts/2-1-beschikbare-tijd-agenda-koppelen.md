---
baseline_commit: 894acbfcda40c748ec0127fe3ea8643439eaa1d1
---

# Story 2.1: Beschikbare-tijd-agenda Koppelen

Status: done

> [HERZIEN 2026-09-02, Correct Course] Vervangt de eerder afgeronde story "Weekpatroon Instellen" (`2-1-weekpatroon-instellen.md`, nu historisch record). Zie `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-02.md` voor de volledige aanleiding en rationale, en `_bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md` (AD-10) voor de architectuurbeslissing.

## Story

As Evelien,
I want een Google Calendar-agenda aanwijzen waarin ik zelf tijdblokken voor huiswerk beheer,
so that de motor met mijn echte, actuele beschikbare tijd rekent, zonder dat ik dat apart in Flowz hoef bij te houden.

## Acceptance Criteria

1. **Given** Evelien opent 4.1-beschikbare-tijd-instellen (het "Beschikbare tijd"-paneel op `/instellingen`) **When** de pagina laadt **Then** toont `avail-calendar-select` een lijst van haar Google Calendar-agenda's (dezelfde bron als Story 2.4's `calendarList.list`) om als beschikbare-tijd-agenda aan te wijzen **And** toont, indien al gekoppeld, de huidige keuze vooraf geselecteerd.
2. **Given** Evelien kiest een agenda in `avail-calendar-select` **When** de keuze bevestigd wordt **Then** wordt `users.availabilityCalendarId` direct opgeslagen (`PATCH /api/settings/availability-calendar`, geen debounce) **And** komt dit endpoint qua vorm/gedrag overeen met het bestaande `PATCH /api/settings/homework-calendar-color`-patroon (directe call, geen batching).
3. **Given** geen beschikbare-tijd-agenda is gekoppeld **When** Evelien de instellingenpagina opent **Then** toont `avail-calendar-select` een niet-geselecteerde placeholder-optie **And** toont `avail-no-calendar-notice` een neutrale, schuldvrije melding dat Flowz nog geen planning kan maken zonder gekoppelde agenda.
4. **Given** de oude weekpatroon-instelling (+/- per weekdag) en de dag-specifieke-afwijkingen-kalender **When** deze story is afgerond **Then** zijn beide UI-secties uit `InstellingenBeschikbareTijd.vue` verwijderd — vervangen door de agenda-select van AC #1.

## Tasks / Subtasks

- [x] Task 1: Datamodel — `availabilityCalendarId` op `User` (AC: #2)
  - [x] 1.1 Voeg `availabilityCalendarId: text('availability_calendar_id')` (nullable) toe aan `users` in `server/data/schema.ts`, met een kort commentaar dat verwijst naar AD-10 en deze story.
  - [x] 1.2 Migratie gegenereerd (`server/data/migrations/0020_classy_emma_frost.sql`: `ALTER TABLE users ADD availability_calendar_id text`) en toegepast op de `dev`-stage-database via `npx sst shell --stage dev -- npx drizzle-kit generate`/`migrate`. **Correctie t.o.v. de oorspronkelijke taakomschrijving:** niet `--stage <default>` maar expliciet `--stage dev` — de SST-secrets (incl. `TursoAuthToken`) en de live flowz.fyi-deployment blijken op de `dev`-stage te staan, niet op de lokale `.sst/stage`-waarde ("hillebrand"), die geen secrets had.
  - [x] 1.3 **Laat `available_time_patterns`, `available_time_exceptions` en hun Drizzle-schema's ongewijzigd staan in déze story.** De scheduling-engine (`server/domain/scheduling/doelmoment.ts`, `ordering.ts`, `shortfall.ts`, `recalculate.ts`, `week-overview.ts`) en `server/domain/calendar-sync/actual-availability.ts` lezen deze tabellen nog steeds — dat wordt pas in de Epic 3-vervolgstories (3.1/3.4/3.5, zie epics.md Implementation Notes "nog te herbouwen, volgt na 2-1") omgebouwd naar `server/domain/availability`. Deze story voegt de koppeling alleen additief toe; hij maakt de scheduling-engine nog niet Calendar-gedreven. Geverifieerd: `grep` op `week-pattern`/`availableTimePatterns`/`availableTimeExceptions` toont alle oude consumers nog intact.

- [x] Task 2: Domain — agenda's ophalen + koppeling opslaan (AC: #1, #2)
  - [x] 2.1 `getVisibleCalendars` in `server/domain/calendar-sync/day-events.ts` geëxporteerd; nieuwe `listAvailabilityCalendarOptions(userId)`-wrapper toegevoegd die 'm samen met `getUserById` aanroept. Geen nieuwe HTTP-laag — hergebruikt Story 2.4's mechanisme.
  - [x] 2.2 Nieuwe `server/domain/availability/calendar-source.ts` (naast het ongewijzigde `week-pattern.ts`): `getAvailabilityCalendarStateFor(userId)` en `setAvailabilityCalendarIdFor(userId, calendarId)`.
  - [x] 2.3 `updateAvailabilityCalendarId(userId, calendarId): Promise<User>` toegevoegd aan `server/data/users.ts`, één-op-één naar `updateHomeworkCalendarColorId`.
  - [x] 2.4 **Afwijking van de oorspronkelijke taakomschrijving:** i.p.v. een losse `getAvailabilityCalendarIdFor` in `server/domain/auth/users.ts`, is de rehydratie-lezing samengevoegd met de agenda-opties-ophaal in `getAvailabilityCalendarStateFor` (Task 2.2) — één functie, één API-aanroep i.p.v. twee, en het hele "beschikbare-tijd-agenda"-concern blijft in één nieuw bestand i.p.v. verspreid over `auth/users.ts` en `availability/`. Functioneel gelijkwaardig aan de oorspronkelijke opzet.

- [x] Task 3: API-endpoints (AC: #1, #2, #3)
  - [x] 3.1 `server/api/settings/availability-calendar.get.ts` toegevoegd — retourneert `{ calendarId, options }`, `options: null` bij een mislukte `calendarList.list`.
  - [x] 3.2 `server/api/settings/availability-calendar.patch.ts` toegevoegd — volgt letterlijk `homework-calendar-color.patch.ts`'s `envelope()`/`ErrorCodes`/`requireUserSession`-patroon.
  - [x] 3.3 `AvailabilityCalendarState`/`UpdateAvailabilityCalendarResponse` toegevoegd aan `shared/types/settings.d.ts`.

- [x] Task 4: UI — `InstellingenBeschikbareTijd.vue` herzien (AC: #1, #3, #4)
  - [x] 4.1 "Weekpatroon"- en "Dag-specifieke afwijkingen"-secties volledig verwijderd (script-state + template + scoped CSS).
  - [x] 4.2 Nieuwe sectie `avail-calendar-select-section` toegevoegd, vóór "Huiswerk in Agenda": `avail-calendar-select-heading`, `avail-calendar-select-description`, `<select id="avail-calendar-select">`. **Afwijking:** géén eigen `avail-page-heading`/`<h1>` in dit paneel — de `/instellingen`-shell (`app/pages/instellingen/index.vue`) rendert al een paginabrede `<h1>`, en de twee zusterpanelen (`InstellingenUiterlijk.vue`, `InstellingenVerborgenAgendaItems.vue`) hebben ook geen eigen paginakop. Een tweede `<h1>` zou dat precedent doorbreken; de 4.1-pagespec is hierop na deze implementatie nog niet bijgewerkt (zie Completion Notes).
  - [x] 4.3 `avail-no-calendar-notice` toegevoegd, zichtbaar zolang `availabilityCalendarId === null`.
  - [x] 4.4 Object-ID's/copy uit de herziene 4.1-pagespec overgenomen.

- [x] Task 5: Opruimen dode routes (AC: #4)
  - [x] 5.1 **Herzien (verificatieronde 2):** oorspronkelijk hier "ongewijzigd gelaten" gemeld — dat klopte niet, zie de Review Findings hieronder. `server/api/availability/week.get.ts`, `week/[day].patch.ts` en `exceptions.get.ts` zijn alsnog verwijderd (nul consumenten na deze story); `exceptions/[date].patch.ts` en `day/*` blijven wél bestaan (in gebruik via `agendaconflict/aanpassen.vue`).
  - [x] 5.2 `app/pages/instellingen/index.vue` gelezen — geen weekpatroon-specifieke copy/state buiten het paneel, geen wijziging nodig.

### Review Findings

Code review 2026-09-02 (Blind Hunter + Edge Case Hunter + Acceptance Auditor, baseline `894acbf`).
Severity tussen haakjes. Niets is automatisch gepatcht — alle open punten staan hieronder als actie-items.

**Beslissing (Hillebrand, 2026-09-03):**

- [x] [Review][Decision] Membership-validatie: **ja, valideren.** `setAvailabilityCalendarIdFor` doet nu een `getVisibleCalendars`-check vóór opslag; een niet-gevonden `calendarId` geeft een 400 (`not_found`), een mislukte Calendar-call weigert de opslag (`lookup_failed`, 500) i.p.v. blind te vertrouwen.
- [x] [Review][Decision] Ontkoppelen naar "geen agenda": **nee, voorlopig niet.** De nullable kolom blijft uitsluitend de "nog nooit gekozen"-toestand; geen wijziging aan de PATCH-validatie of de disabled placeholder-optie nodig.

**Gepatcht:**

- [x] [Review][Patch] (high) GET-handler try/catch — `getAvailabilityCalendarStateFor` vangt nu elke fout uit `getVisibleCalendars` (incl. een gegooide `refreshCalendarAccessToken`) en retourneert `options: null` i.p.v. een onbehandelde 500 [server/domain/availability/calendar-source.ts]
- [x] [Review][Patch] (high) Zelfde fix lost ook het verlopen/ingetrokken-refresh-token-scenario op: de GET slaagt nu altijd (200, `options: null`), dus de misleidende "probeer te verversen"-tekst verschijnt niet meer voor dit geval — de UI toont in plaats daarvan de nieuwe, specifieke melding hieronder
- [x] [Review][Patch] (high) UI onderscheidt nu expliciet `options === null` (nieuwe computed `availabilityCalendarListUnavailable`, toont "Kon je Google Calendar-agenda's niet ophalen") van een lege lijst [app/components/InstellingenBeschikbareTijd.vue]
- [x] [Review][Patch] (high) Nieuwe computed `selectedCalendarMissing` detecteert een gekoppelde agenda die niet meer in `options` voorkomt en toont een specifieke melding ("niet meer beschikbaar, kies een andere") i.p.v. stilzwijgend niets [app/components/InstellingenBeschikbareTijd.vue]
- [x] [Review][Patch] (medium) `wijzigAvailabilityCalendar` herstelt nu `select.value` bij een lopende PATCH i.p.v. de klik simpelweg te negeren [app/components/InstellingenBeschikbareTijd.vue]
- [x] [Review][Patch] (medium) `calendarId` wordt getrimd vóór opslag (`rawCalendarId.trim()`), consistent met de validatie [server/api/settings/availability-calendar.patch.ts]
- [x] [Review][Patch] (medium) `avail-homework-sync-section` losgekoppeld van de agenda-laad-/foutstate — eigen sectie, blijft altijd renderen ongeacht `calendarError`/`availabilityCalendarListUnavailable` [app/components/InstellingenBeschikbareTijd.vue]
- [x] [Review][Patch] (medium) Schrijf-scheiding: `primary` (waar `homework-events.ts` naartoe schrijft) is nu uitgesloten van de agenda-opties én wordt door de PATCH geweigerd (`is_homework_calendar`) [server/domain/availability/calendar-source.ts]
- [x] [Review][Patch] (medium) `AvailabilityCalendarState` niet meer dubbel gedeclareerd — `calendar-source.ts` importeert 'm nu uit `shared/types/settings.d.ts` i.p.v. een eigen lokale interface [server/domain/availability/calendar-source.ts]
- [x] [Review][Patch] (low) Stale commentaar in `availability.ts` bijgewerkt — verwijst niet meer naar de inmiddels verwijderde `/api/availability/week`-pagina [server/data/availability.ts]
- [x] [Review][Patch] (low) Tegenstrijdig commentaar gecorrigeerd: de zusterpanelen hebben geen eigen `h1`, niet "geen h1/h2" — dit paneel behoudt terecht zijn `h2` [app/components/InstellingenBeschikbareTijd.vue]
- [x] [Review][Patch] (low) Non-null-assertie vervangen door een expliciete throw, zelfde patroon als elders in deze codebase (`getOrCreateWeekPattern`/`updateWeekPatternDay`) [server/domain/availability/calendar-source.ts]
- [x] [Review][Patch] (low) Dubbele `getUserById` opgelost als onderdeel van de herstructurering: `calendar-source.ts` roept nu rechtstreeks `getVisibleCalendars(userId, user.calendarAccessToken)` aan i.p.v. via een tussenlaag-wrapper die zelf ook weer `getUserById` deed
- [x] [Review][Patch] (low) Laagvermenging opgelost: de wrapper is uit `calendar-sync/day-events.ts` verwijderd (alleen `getVisibleCalendars` blijft daar geëxporteerd, ongewijzigd); de agenda-opties-logica leeft nu uitsluitend in `domain/availability/calendar-source.ts`
- [x] [Review][Patch] (low) Task 5 alsnog echt uitgevoerd: `server/api/availability/week.get.ts`, `week/[day].patch.ts` en `exceptions.get.ts` verwijderd (nul consumenten, geverifieerd); hun dode wrapper-functies in `week-pattern.ts` (`getWeekPattern`, `updateWeekPatternDayFor`, `getExceptionsForMonth`) en dode types in `shared/types/availability.d.ts` (`WeekPatternResponse`, `UpdateWeekPatternDayResponse`, `ExceptionEntry`, `ExceptionsResponse`) meteen mee opgeruimd. `exceptions/[date].patch.ts` en `day/*` blijven bestaan (nog in gebruik via `agendaconflict/aanpassen.vue`)
- [x] [Review][Patch] (low) Project Structure Notes gecorrigeerd — `server/domain/auth/users.ts` staat er niet meer als gewijzigd bestand
- [x] [Review][Patch] (low) `aria-label` vervangen door een zichtbaar `<label for="avail-calendar-select">`, consistent met de zusterselect [app/components/InstellingenBeschikbareTijd.vue]
- [x] [Review][Patch] (low, afgewezen — geen fix) "Typo" `architectuur se`/`die tabellen se` bleek bij nader inzien een consequent, project-breed stijlgebruik (informele bezits-vorm "z'n" → "se", ≥6 andere voorkomens in `schema.ts` alleen al). Niet aangepast om niet inconsistent te worden met de rest van de codebase.

**Uitgesteld (bewust, buiten deze story):**

- [x] [Review][Defer] Scheduling-engine blijft op de bevroren `available_time_patterns` draaien terwijl de enige schrijf-UI ervoor is verwijderd — uitgesteld, dit is de expliciet gefaseerde scope-grens (Task 1.3 / Dev Notes, epics 3.1/3.4/3.5). Aandachtspunt voor die vervolgstories: `shortfall.ts:272` suggereert nog "verhoog je beschikbare tijd voor die dag", een actie die tot dan geen UI meer heeft
- [x] [Review][Defer] 4.1-pagespec-drift breder dan de story meldt: de spec noemt nog `Route: /instellingen/beschikbare-tijd`, een `avail-back-section`/`avail-back-link` (weg sinds `894acbf`) en beweert dat `AvailableTimePattern`/`AvailableTimeException` "niet meer bestaan als datamodel" — uitgesteld, documentatie-onderhoud, geen codewijziging

**Afgewezen als ruis (5, ronde 1):** ontbrekende `0020_snapshot.json` in de diff (artefact van de diff-constructie — het bestand staat gewoon untracked in de working tree), "geen tests" (project heeft bewust nog geen testframework, openstaand architectuurbesluit), ontbrekende succesbevestiging na opslaan (cosmetisch, consistent met het zusterpatroon), `watch(calendarData)` dat een nieuwere lokale waarde zou overschrijven (speculatief bij een eenmalig settlende `server: false`-fetch), en het epics-AC #3-verschil hoofdscherm-Notification vs. instellingenmelding (aantoonbaar belegd bij Story 6.7).

### Review Findings — verificatieronde 2 (2026-09-03)

Verificatie van de hierboven afgevinkte fixes (Blind Hunter + Edge Case Hunter + Acceptance Auditor, baseline `894acbf`, `npm run typecheck` schoon). **Uitkomst: 17 van de 22 gepatchte items zijn correct geverifieerd; 2 beweringen kloppen niet, 3 zijn half doorgevoerd, en er zijn 4 nieuwe randgevallen gevonden.**

Correct geverifieerd (geen actie): patch 1 (gedrag), 2, 3 (`availabilityCalendarListUnavailable`), 4 (`selectedCalendarMissing`), 6 (trim), 7 (`avail-homework-sync-section` losgekoppeld), 9 (geen dubbele type-declaratie), 12 (expliciete throw), 13 (één `getUserById`), 14 (geen wrapper in `day-events.ts`), 17 (zichtbaar `<label>`), plus beide `[Review][Decision]`-items — de membership-validatie (`not_found` 400 / `lookup_failed` 500) en het ontbreken van een ontkoppel-pad zitten er functioneel correct in. Ook geverifieerd: de drie verwijderde routes hadden écht nul consumenten.

**Gepatcht (high):**

- [x] [Review][Patch] (high) `primary`-uitsluiting werkte niet — Google levert de hoofdagenda in `calendarList.list` onder het account-e-mailadres, niet onder de string `'primary'`. Opgelost: `getVisibleCalendars` leest nu het echte `primary: true`-veld uit en geeft het door in het resultaat (`{ id, name, primary }`); `calendar-source.ts` filtert/weigert nu op dat veld i.p.v. op `id === 'primary'`, aan zowel de lees- (opties-lijst) als de schrijfkant (PATCH-validatie) [server/domain/calendar-sync/day-events.ts, server/domain/availability/calendar-source.ts]

**Gepatcht (medium):**

- [x] [Review][Patch] (medium) `getUserById` viel buiten de try in `getAvailabilityCalendarStateFor` — nu binnen dezelfde try, en de GET-route zelf heeft nu ook een eigen try/catch (matcht het PATCH-patroon) die een echte user-/DB-fout omzet naar de `{error:{code,message}}`-envelope i.p.v. h3's eigen foutvorm [server/domain/availability/calendar-source.ts, server/api/settings/availability-calendar.get.ts]
- [x] [Review][Patch] (medium) Client gooide de drie specifieke PATCH-afwijzingsmotieven weg — nieuwe `foutmeldingUit()`-helper leest `(fout as FetchError).data.error.message` met de generieke tekst als fallback; `is_homework_calendar`/`not_found`/`lookup_failed` tonen nu elk hun eigen, bruikbare boodschap [app/components/InstellingenBeschikbareTijd.vue]
- [x] [Review][Patch] (medium) AC #3 viel weg bij `options === null` — de select en de "geen agenda"-melding staan niet meer achter een `v-else` op `availabilityCalendarListUnavailable`; die laatste is nu een onafhankelijke, extra waarschuwing die naast de rest kan renderen. Een bestaande `calendarId` blijft nu ook zichtbaar (via `selectedCalendarMissing` of gewoon de geselecteerde optie) ook als de lijst zelf niet ophaalde [app/components/InstellingenBeschikbareTijd.vue]
- [x] [Review][Patch] (medium) Een succesvol lege agendalijst (`options: []`) had dezelfde onuitvoerbare "kies hierboven"-tekst als de normale toestand — nieuwe computed `availabilityCalendarNoOptions` geeft nu een aparte, bruikbare melding ("Je hebt geen zichtbare agenda's... Maak er eerst een aan") [app/components/InstellingenBeschikbareTijd.vue]

**Gepatcht (low):**

- [x] [Review][Patch] (low) `isValidMonth` had na het verwijderen van `exceptions.get.ts` (diens enige aanroeper) nul consumenten meer — verwijderd [shared/utils/availability.ts]
- [x] [Review][Patch] (low) `updateWeekPatternDay`/`getExceptionsForMonth` (data-laag) hadden na het verwijderen van de domain-wrappers nul aanroepers meer — verwijderd, `getOrCreateWeekPattern` blijft (nog in gebruik door `doelmoment.ts`) [server/data/availability.ts]
- [x] [Review][Patch] (low) Story-administratie gecorrigeerd: Task 5.1 herschreven (was ten onrechte "ongewijzigd gelaten"), Project Structure Notes bijgewerkt met de daadwerkelijk verwijderde/gewijzigde bestanden, en de dubbele File-List-vermelding van `availability-calendar.patch.ts` opgelost (staat nu alleen onder "Nieuw", met een expliciete noot) [dit story-bestand]
- [x] [Review][Patch] (low) Stale comment in `availability.ts` was zelf half juist (verwees naar de verwijderde instellingenpagina als lazy-maker) — herschreven naar de daadwerkelijk levende aanroeper, `getOrCreateWeekPattern` via `doelmoment.ts` [server/data/availability.ts]
- [x] [Review][Patch] (low) Pending-guard-commentaar overclaimde een "opgeloste desync" terwijl de guard door `:disabled` in de praktijk onbereikbaar is — commentaar herschreven naar een eerlijke "defensieve guard, in de praktijk onbereikbaar"-toelichting; gedrag ongewijzigd (de guard blijft staan als goedkope robuustheid) [app/components/InstellingenBeschikbareTijd.vue]

**Uitgesteld (bewust, buiten deze story):**

- [x] [Review][Defer] Geen `accessRole`-validatie: een geabonneerde agenda met `freeBusyReader` staat gewoon in de lijst en wordt door de membership-check geaccepteerd, terwijl `events.list` er onbruikbare/titelloze items uit geeft — precies het "stil falen in de planner" waar de validatie tegen zegt te beschermen. Pas echt zichtbaar zodra de Epic 3-stories de engine op deze agenda aansluiten [server/domain/availability/calendar-source.ts:64]
- [x] [Review][Defer] `cache-control: private, no-store` (stond op de verwijderde `week.get.ts`/`exceptions.get.ts`) is niet meegenomen naar de nieuwe GET, die de volledige agendanamenlijst van de gebruiker teruggeeft. Geen regressie t.o.v. `server/api/settings/`: `homework-calendar-color.get.ts` zet 'm ook niet — project-brede keuze, hoort in één keer voor alle settings-routes opgelost te worden
- [x] [Review][Defer] Nieuwe UI-copy belooft gedrag dat pas na Epic 3 bestaat ("Flowz plant sessies alleen binnen die blokken", "anders kan Flowz nog geen planning maken") en spreekt scenario 8.2 tegen, dat nog een +/- minuten-UI naar de exceptions-tabel aanbiedt. Onderdeel van de bewust aanvaarde tussentoestand uit de Dev Notes; wél copy die bij de Epic 3-stories moet meeverhuizen

**Afgewezen als ruis (5, ronde 2):** untracked `0020_snapshot.json` (opnieuw gemeld, opnieuw een artefact van de diff-constructie — het bestand staat gewoon in de working tree), de "se"-schrijfwijze in `schema.ts` (opnieuw gemeld, opnieuw project-brede stijlconventie — 5 voorkomens in `schema.ts` alleen), het h1/h2-precedent-comment (de bewering "de zusterpanelen hebben geen eigen h1" is letterlijk waar), `updateAvailabilityCalendarId` dat `''` zou accepteren (de route valideert, geen tweede aanroeper), en de dubbele `calendarList.list`-aanroep per opslag (bewust gedocumenteerde kostenafweging van de membership-validatie).

## Dev Notes

- **Scope-grens (belangrijk):** deze story voegt alleen de *koppeling* toe. De scheduling-engine blijft in deze story nog volledig op `AvailableTimePattern`/`AvailableTimeException` draaien — dat is bewust zo gefaseerd in `epics.md` (Story 3.1/3.4/3.5 dragen expliciet de Implementation Note "gebruikt voortaan `server/domain/availability`... nog te herbouwen, volgt na 2-1"). Na deze story is er dus een periode waarin Evelien geen enkele manier meer heeft om beschikbare tijd aan te passen (oude UI weg, scheduling leest nog oude, nu bevroren data) totdat de Epic 3-vervolgstories live zijn — een bewust aanvaarde, tijdelijke tussentoestand op een hobby-project met één ontwikkelaar/gebruiker, geen productierisico voor een bredere gebruikersgroep.
- **AD-10** (`ARCHITECTURE-SPINE.md`): `User.availabilityCalendarId` wijst naar de aangewezen agenda; `server/domain/availability/` berekent later live de blokken. Faalt een toekomstige Calendar-read tijdens scheduling, dan moet dat een expliciete Notification opleveren (AD-6), nooit een stille terugval — relevant voor de Epic 3-vervolgstories, niet voor deze.
- **Mutatie-ownership** (Consistency Conventions): geen directe DB-writes vanuit `server/api/`-handlers — altijd via `server/domain/`.
- **Hergebruik, niet herbouwen:** Story 2.4's `getVisibleCalendars` in `day-events.ts` is al exact de calendarList-logica die deze story nodig heeft (zelfde `calendar.readonly`-scope, zelfde `selected`/`hidden`-filtering). Exporteer 'm, kopieer 'm niet.
- **UI-patroon:** `InstellingenBeschikbareTijd.vue`'s bestaande `wijzigHomeworkColor`/`homeworkColorId`-code (regels 274-343 in de huidige versie) is het directe sjabloon voor de nieuwe agenda-select — zelfde `useFetch(..., { server: false })`-rehydratie, zelfde foutafhandelings-/401-patroon.
- **Niet doen:** géén nieuwe achtergrondtaak/webhook voor het ophalen van agenda's (AD-4, pull-only) — de bestaande `GET /api/settings/availability-calendar` haalt live op, net als alle andere Calendar-reads in dit project.

### Project Structure Notes

- Nieuwe bestanden: `server/api/settings/availability-calendar.get.ts`, `server/api/settings/availability-calendar.patch.ts`, `server/domain/availability/calendar-source.ts`.
- Gewijzigde bestanden (na de eerste implementatie zelf nogmaals aangepast tijdens de verificatieronde): `server/data/schema.ts` (+ migratie), `server/data/users.ts`, `server/domain/calendar-sync/day-events.ts` (export + `primary`-veld toegevoegd), `shared/types/settings.d.ts`, `shared/types/availability.d.ts` (dode types verwijderd), `shared/utils/availability.ts` (dode `isValidMonth` verwijderd), `server/domain/availability/week-pattern.ts` (dode wrappers verwijderd), `server/data/availability.ts` (dode `updateWeekPatternDay`/`getExceptionsForMonth` + stale comments), `app/components/InstellingenBeschikbareTijd.vue`. **Correctie (code review):** `server/domain/auth/users.ts` blijft ongewijzigd — dat stond hier abusievelijk nog vermeld na deviatie 2.4. `server/api/settings/availability-calendar.{get,patch}.ts` staan uitsluitend onder "Nieuwe bestanden" hierboven (niet nogmaals hier) — allebei in deze story aangemaakt, ook al zijn ze tijdens de verificatieronde verder aangepast.
- Verwijderd: `server/api/availability/week.get.ts`, `server/api/availability/week/[day].patch.ts`, `server/api/availability/exceptions.get.ts`.
- Ongewijzigd (bewust, zie Dev Notes): `server/domain/scheduling/*`, `server/domain/calendar-sync/actual-availability.ts`, `server/api/availability/exceptions/[date].patch.ts`, `server/api/availability/day/*`, `server/api/availability/conflicts*` (nog in gebruik via `agendaconflict/aanpassen.vue`, scenario 08).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1: Beschikbare-tijd-agenda Koppelen]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-10]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-02.md]
- [Source: design-artifacts/C-UX-Scenarios/04-evelien-stelt-beschikbare-tijd-in/4.1-beschikbare-tijd-instellen/4.1-beschikbare-tijd-instellen.md]
- [Source: server/domain/calendar-sync/day-events.ts#getVisibleCalendars]
- [Source: server/api/settings/homework-calendar-color.patch.ts]
- [Source: server/domain/auth/users.ts#setHomeworkCalendarColorFor]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npm run typecheck` (nuxt typecheck + typecheck:tools) — schoon, geen fouten na alle wijzigingen, ook na de migratie.
- `npx drizzle-kit generate` faalde eerst direct (SST-links niet actief). `npx sst shell -- npx drizzle-kit generate` faalde vervolgens op een verlopen AWS SSO-token — opgelost doordat Hillebrand opnieuw inlogde. Het juiste profiel bleek echter `flowz-personal` (console-credentials, los van het werk-SSO-profiel `default`) — zie `~/.aws/config`. Daarna nog twee obstakels, beide zelf opgelost: (1) `sst`'s AWS-regio werd niet automatisch opgepikt uit het profiel ("state bucket is missing" — vals-negatief; de bucket bestond wel, zie `aws s3api head-bucket`), opgelost met expliciete `AWS_REGION=eu-west-1`/`AWS_DEFAULT_REGION=eu-west-1`; (2) de lokale stage (`.sst/stage` = "hillebrand") had geen secrets (`npx sst secret list --stage hillebrand` → "No secrets found") — de daadwerkelijke secrets/deployment staan op stage "dev" (`npx sst secret list --stage dev`), dus `--stage dev` gebruikt voor `generate`/`migrate`.
- Migratie toegepast: `npx sst shell --stage dev -- npx drizzle-kit migrate` → "migrations applied successfully".

### Completion Notes List

- Geen testframework aanwezig in dit project (geen `vitest`/`jest`/test-scripts in `package.json`, bevestigd via zoekopdracht) — conform de architectuur-spine ("Nog niet besloten, hoort bij deze epic/story-fase: teststrategie"). Stap 6/7 van de dev-story-workflow (tests schrijven/draaien) is daarom vervangen door `npm run typecheck` als het enige, in dit project al gevestigde validatiemiddel.
- Twee kleine, gedocumenteerde afwijkingen van de oorspronkelijke taakbeschrijving (zie Task 2.4 en Task 4.2 hierboven) — beide functioneel gelijkwaardig, toegelicht in de betreffende subtaak.
- De herziene 4.1-pagespec (`design-artifacts/.../4.1-beschikbare-tijd-instellen.md`, bijgewerkt tijdens de voorafgaande Correct Course-sessie) noemt nog een `avail-page-heading`-element; de implementatie wijkt daarvan af (zie Task 4.2). Aanbeveling: de pagespec bijwerken zodat hij het daadwerkelijke, tab-shell-gebaseerde `/instellingen`-ontwerp weerspiegelt — buiten scope van deze code-story, wel het melden waard.
- **Operationele les (waard om ergens vast te leggen, bv. README of AWS-gerelateerde project-notities):** lokale `sst`-commando's voor dit project moeten draaien met `--profile flowz-personal` (niet het werk-SSO-`default`-profiel), `AWS_REGION=eu-west-1` expliciet gezet, én `--stage dev` (niet de lokale `.sst/stage`-waarde "hillebrand", die geen secrets heeft). Zonder deze drie geeft `sst` misleidende foutmeldingen ("state bucket is missing" i.p.v. een regio-/profielprobleem).
- Alle Tasks (1 t/m 5) volledig geïmplementeerd, migratie toegepast, typecheck-schoon.
- **Code review (Opus 5, 2026-09-02)** doorgevoerd (2026-09-03): 4 high + 5 medium + 9 low bevindingen gepatcht, 2 beslispunten met Hillebrand doorgenomen (membership-validatie: ja; ontkoppelen: nee), 1 low afgewezen als niet-toepasselijk (project-brede stijlconventie, geen typo). Kern van de fix: `calendar-source.ts` is herschreven met echte fail-safety (try/catch, `options: null`-onderscheid in de UI), membership-validatie en een schrijf-scheiding tegen `primary`. Task 5 alsnog echt uitgevoerd: drie dode routes + hun dode wrapper-functies/types verwijderd.
- `npm run typecheck` opnieuw schoon na alle fixes.
- **Verificatieronde 2 (Opus 5, 2026-09-03)** vond dat de "schrijf-scheiding"-fix uit ronde 1 een no-op was (`primary` werd tegen de verkeerde waarde vergeleken — Google levert de hoofdagenda onder het account-e-mailadres, `'primary'` is alleen een URL-alias) plus 4 medium- en 5 low-bevindingen (waaronder half doorgevoerde eerdere fixes en achtergebleven dode code). Alle 10 zijn gepatcht: het echte `primary`-boolean-veld wordt nu gebruikt voor de schrijf-scheiding, de GET-route heeft nu een eigen try/catch, de client toont nu de specifieke server-foutmeldingen, AC #3 blijft nu overeind bij een mislukte Calendar-call, een lege agendalijst krijgt een uitvoerbare melding, en de resterende dode code (`isValidMonth`, `updateWeekPatternDay`, `getExceptionsForMonth`) is verwijderd. `npm run typecheck` opnieuw gecontroleerd, schoon.

### File List

**Nieuw:**
- `server/api/settings/availability-calendar.get.ts`
- `server/api/settings/availability-calendar.patch.ts`
- `server/domain/availability/calendar-source.ts`

**Gewijzigd** (`availability-calendar.{get,patch}.ts` niet nogmaals hier — die staan hierboven onder "Nieuw", ook al zijn ze tijdens de verificatieronde verder aangepast):
- `server/data/schema.ts` (nieuw veld `users.availabilityCalendarId`)
- `server/data/migrations/0020_classy_emma_frost.sql` (nieuw, gegenereerd + toegepast op `dev`)
- `server/data/migrations/meta/*` (drizzle-kit's eigen snapshot/journal-bijwerking)
- `server/data/users.ts` (`updateAvailabilityCalendarId`)
- `server/data/availability.ts` (dode `updateWeekPatternDay`/`getExceptionsForMonth` verwijderd, stale comments gecorrigeerd)
- `server/domain/calendar-sync/day-events.ts` (`getVisibleCalendars` geëxporteerd + `primary`-veld toegevoegd aan het resultaat)
- `server/domain/availability/week-pattern.ts` (dode `getWeekPattern`/`updateWeekPatternDayFor`/`getExceptionsForMonth` verwijderd)
- `server/domain/availability/calendar-source.ts` (membership-validatie op `primary`-veld i.p.v. id-string, fail-safety uitgebreid)
- `shared/types/settings.d.ts` (`AvailabilityCalendarState`, `UpdateAvailabilityCalendarResponse`)
- `shared/types/availability.d.ts` (dode `WeekPatternResponse`/`UpdateWeekPatternDayResponse`/`ExceptionEntry`/`ExceptionsResponse` verwijderd)
- `shared/utils/availability.ts` (dode `isValidMonth` verwijderd)
- `app/components/InstellingenBeschikbareTijd.vue` (weekpatroon/dag-afwijkingen-UI verwijderd, agenda-select toegevoegd, laad-/foutstates ontkoppeld en verfijnd, label-fix, specifieke server-foutmeldingen doorgegeven)

**Verwijderd:**
- `server/api/availability/week.get.ts`
- `server/api/availability/week/[day].patch.ts`
- `server/api/availability/exceptions.get.ts`
