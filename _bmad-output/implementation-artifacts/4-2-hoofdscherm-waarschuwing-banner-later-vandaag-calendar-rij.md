---
baseline_commit: 704883902413ad4ce5fba21abf9060c4358c065d
---

# Story 4.2: Hoofdscherm — Waarschuwing-banner & Later-vandaag/Calendar-rij

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want zien of er voor mijn eerstvolgende sessie genoeg tijd is, en een overzicht van de rest van de dag,
so that ik niet voor verrassingen kom te staan en indien nodig direct een andere taak kan starten.

## Acceptance Criteria

1. **Given** Google Calendar toont voor de aankomende sessie geen of te weinig tijd, **when** 1.1-Home laadt, **then** verschijnt `home-warning-banner` in neutrale, schuldvrije toon ("Voor deze sessie is er vandaag geen/weinig tijd meer") — niet zichtbaar als er voldoende tijd is, **and** verschijnt de banner niet als de Calendar-API faalt (fail-safe, geen ongefundeerde waarschuwing).
2. **Given** 1.1-Home is geladen, **when** Evelien naar de secundaire rij kijkt, **then** toont `home-later-list` alle overige taken van vandaag (geen limiet, interne scroll bij overflow), en `home-calendar-dayview` een alleen-lezen Google Calendar-dagweergave, **and** start een klik op een item in `home-later-list` direct een sessie voor die taak (→ 1.2, zelfde als de primaire Start-knop), **and** is `home-off-track-link` ("Vandaag niet als gepland?") aanwezig als subtiele, secundaire link onder de taakkaart — het navigatiegedrag van deze link wordt pas getest in Epic 6, Story 6.3, waar de doelpagina (3.1-reden-kiezen) wordt gebouwd.

## Belangrijk: eerste échte lees-integratie met Google Calendar (naast de bestaande schrijf-only sync)

`server/domain/calendar-sync/homework-events.ts` (Story 2.3) is tot nu toe **uitsluitend schrijvend** (create/update/delete van Flowz's eigen huiswerk-events), en zelf-bewakend op `hasCalendarWriteScope` (kan `null`/`false` zijn). **Déze story is de eerste die daadwerkelijk Eveliens bestaande Calendar-afspraken uitleest** — een compleet ander vermogen. Goed nieuws: elke ingelogde gebruiker heeft altijd minimaal `calendar.readonly`-scope (`server/routes/auth/google.get.ts:16` — de standaard, niet-write-upgrade-login vraagt die al aan; write is een superset). Er is dus **geen self-guard nodig** zoals bij `createHomeworkEvent`/`updateHomeworkEvent` (die checken `hasCalendarWriteScope`) — een lees-aanroep via `events.list` is voor elke ingelogde user altijd mogelijk, alleen het netwerk/de API zelf kan falen.

**Bewust géén gedeelde helper geëxtraheerd** tussen het nieuwe lees-pad en het bestaande schrijf-pad in `homework-events.ts` — beide hebben hun eigen kleine "probeer, ververs-bij-401, probeer nogmaals"-retrylaag nodig, en dit project accepteert al bewust zulke kleine duplicatie tot een derde consument ontstaat (zie `deferred-work.md`'s reeds geaccepteerde 3x gedupliceerde `envelope()`-helper als precedent). Voeg dit niet zelf samen — dat is uitgesteld werk, geen onderdeel van déze story.

**Uitbreiding van het bestaande endpoint, geen nieuw endpoint:** `GET /api/home/plan` (Story 4.1) haalt via `getTasksWithSessionOnDate` al **alle** taken van vandaag op, niet alleen de eerste — `sorted.slice(1)` is letterlijk `home-later-list`'s databron, geen nieuwe query nodig. Voeg de Calendar-data en de afgeleide `sessionTimeCheck` toe aan hetzelfde endpoint/dezelfde response i.p.v. een tweede fetch te bouwen — past bij de UX-spec's eigen "één laadmoment" page-state-model (Laden/Default/Leeg/Fout, geen aparte laadstaat per sectie).

## Tasks / Subtasks

- [x] Task 1: `server/domain/calendar-sync/day-events.ts` — nieuwe module, alleen-lezend (AC: #1, #2)
  - [x] `getTodayEvents(userId: string, date: string): Promise<{ title: string, startsAt: string, endsAt: string }[] | null>` — `GET https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=...&timeMax=...&singleEvents=true&orderBy=startTime` (`timeMin`/`timeMax` = `amsterdamLocalToUtcIso(date, 0, 0)` t/m `amsterdamLocalToUtcIso(date, 23, 59)` — dezelfde functie als `shared/utils/scheduling.ts`, al gebruikt in Story 3.1/3.5).
  - [x] Zelfde "probeer, ververs-bij-401 via `refreshCalendarAccessToken`, probeer exact éénmaal opnieuw"-patroon als `homework-events.ts:64-77`'s `calendarRequestMetVerversing` — hier lokaal gedupliceerd (zie "Belangrijk" hierboven voor de reden), niet geïmporteerd.
  - [x] **Fail-safe (AC #1's expliciete eis + UX-spec's "Fout (Calendar)"-page-state):** elke fout (netwerkfout, non-2xx respons na de retry, JSON-parse-fout) resulteert in `return null` — géén exception die de hele route laat falen. `null` is een geldig, verwacht resultaat, geen bug.
  - [x] Response-mapping: Google's Events-resource → `{ title: event.summary ?? '(Geen titel)', startsAt: event.start.dateTime ?? event.start.date, endsAt: event.end.dateTime ?? event.end.date }`. **Hele-dag-afspraken** (`event.start.date` i.p.v. `event.start.dateTime`, geen tijdcomponent) tellen mee in de lijst voor `home-calendar-dayview`, maar worden **genegeerd** door Task 2's `sessionTimeCheck`-logica (een hele-dag-afspraak is typisch geen concreet tijdsblok — zie Task 2's `isTimedEvent`-filter).
- [x] Task 2: `server/domain/calendar-sync/session-time-check.ts` — nieuwe module, pure functie (AC: #1)
  - [x] `determineSessionTimeCheck(session: { startsAt: string, endsAt: string }, events: { startsAt: string, endsAt: string }[]): 'ok' | 'tight' | 'unavailable'`.
  - [x] Filter eerst `events` op `isTimedEvent` (bevat een `T` in `startsAt`, dus een echt `dateTime`, geen hele-dag-`date`) — hele-dag-afspraken blokkeren geen concreet tijdstip.
  - [x] **`unavailable`**: minstens één (gefilterd) event overlapt de sessievenster `[session.startsAt, session.endsAt)` (standaard interval-overlap-check: `event.startsAt < session.endsAt && event.endsAt > session.startsAt`).
  - [x] **`tight`**: geen overlap tijdens de sessie zelf, maar het eerstvolgende event ná `session.endsAt` op dezelfde dag begint binnen `TIGHT_BUFFER_MINUTES` (nieuwe constante, **15** — UX-spec se eigen Open Question #1 noemt letterlijk "bv. minder dan 15 minuten marge" als voorbeelddrempel, hier als beargumenteerde keuze overgenomen, net als Story 3.1's bufferformule-precedent voor een onderbepaalde PRD-eis).
  - [x] **`ok`**: geen overlap, en geen event binnen de buffer ná de sessie (of geen enkel event meer die dag).
  - [x] Zuivere functie, geen I/O — makkelijk te redeneren over zonder testframework (project-breed nog geen testframework, zie Story 3.4/3.5's Dev Notes-precedent).
- [x] Task 3: `server/api/home/plan.get.ts` — uitbreiden (AC: #1, #2)
  - [x] Nieuwe aanroep: `const events = await getTodayEvents(userId, today)` (parallel aan de al-bestaande `getTasksWithSessionOnDate`/`averageDailyAvailableMinutes`-aanroepen — met `Promise.all`, geen reden om ze sequentieel te laten lopen).
  - [x] `calendarDayEvents`: `events` rechtstreeks (incl. `null` bij een mislukte Calendar-aanroep — zie Task 1).
  - [x] `sessionTimeCheck`: `null` als er geen `nextTask` is (geen sessie om te checken) ÓF als `events === null` (AC #1's fail-safe: bij een Calendar-fout geen banner, dus geen zinvolle waarde). Anders `determineSessionTimeCheck({ startsAt: first.session.startsAt, endsAt: berekende endsAt }, events)` — `endsAt` berekenen zoals `recalculate.ts:70` al doet (`new Date(new Date(startsAt).getTime() + plannedMinutes * 60_000).toISOString()`), want `Session` heeft geen eigen `endsAt`-kolom.
  - [x] `laterTasks`: `sorted.slice(1).map(item => ({ id: item.task.id, subject: item.task.subject, title: item.task.title, plannedMinutes: item.session.plannedMinutes }))` — hergebruikt de al-berekende `sorted`-array uit Story 4.1, geen nieuwe query.
  - [x] Try/catch blijft ongewijzigd om de bestaande domain-aanroepen heen (Story 4.1's review-patch) — `getTodayEvents` gooit zelf nooit (zie Task 1's fail-safe), dus valt niet binnen déze catch se bereik, maar staat er toch binnen voor consistentie (als `Promise.all` faalt op een van de ándere aanroepen, moet de hele respons alsnog 500'en).
- [x] Task 4: `shared/types/tasks.d.ts` — `HomePlanResponse` uitbreiden (AC: #1, #2)
  - [x] ```ts
    export type SessionTimeCheck = 'ok' | 'tight' | 'unavailable'

    export interface HomePlanResponse {
      nextTask: { id: string, subject: string, title: string, plannedMinutes: number, needs: string[] } | null
      remainingMinutesToday: number
      laterTasks: { id: string, subject: string, title: string, plannedMinutes: number }[]
      calendarDayEvents: { title: string, startsAt: string, endsAt: string }[] | null
      sessionTimeCheck: SessionTimeCheck | null
    }
    ```
- [x] Task 5: `app/pages/index.vue` — nieuwe secties (AC: #1, #2)
  - [x] **`home-warning-banner`** (conditioneel: `plan.value.sessionTimeCheck === 'unavailable' || plan.value.sessionTimeCheck === 'tight'`, dus impliciet ook verborgen bij `null` — geen taak of Calendar-fout): tekst uit `sessionTimeCheck` ("Voor deze sessie is er vandaag geen tijd meer." bij `unavailable`, "Let op: voor deze sessie is er weinig tijd over." bij `tight`), neutrale toon (geen rood/uitroepteken — gedempte kleur, consistent met de rest van de pagina se rustige stijl).
  - [x] **`home-off-track-link`**: statische link naar `/herstel/reden-kiezen` (route uit `design-artifacts/.../3.1-reden-kiezen/3.1-reden-kiezen.md:21` — **deze pagina bestaat nog niet, Epic 6/Story 6.3 bouwt 'm**, geeft tot dan een 404, zelfde bewuste "gat door in volgorde bouwen"-precedent als Story 4.1's `/sessie/starten`-link). Alleen zichtbaar als `nextTask` niet `null` is (UX-spec: "zelfde voorwaarde als de taakkaart"), rechts uitgelijnd onder de taakkaart, `aria-label="Geef aan dat de dag niet volgens plan gaat"`.
  - [x] **`home-secondary-row`** (alleen gerenderd in de niet-ladende staat, ongeacht of er een `nextTask` is — deze rij is niet aan de taakkaart-Leeg-state gekoppeld): twee kolommen (`home-later-list` links, `home-calendar-dayview` rechts) — desktop naast elkaar (`display: flex`, `gap`), mobile onder elkaar gestapeld (`flex-direction: column` onder een `max-width: 768px`-media query, UX-spec Responsive Behavior).
  - [x] **`home-later-list`**: `plan.value.laterTasks` — leeg-bericht "Verder niets gepland vandaag" als leeg; anders per item `taaknaam + vak` (gedempte stijl), klikbaar (`role="button"`/native `<button>`, `aria-label="Start sessie voor {taaknaam}"`), `@click` roept dezelfde `startSessie(taak)`-functie aan die Story 4.1 al voor `home-task-start-button` bouwde (hergebruik, geen duplicatie — `startSessie` accepteert al elke `{id, subject, title, plannedMinutes, needs}`-vorm; `laterTasks`-items missen `needs`, dus vul `needs: []` aan bij de aanroep, zie Task 3's response-vorm die bewust geen `needs` op `laterTasks`-items meegeeft — die zijn nog niet de gekozen taak totdat erop geklikt wordt, en dat scheelt onnodige payload voor items die mogelijk nooit aangeklikt worden). Vaste maximumhoogte (bv. `max-height: 16rem`) + `overflow-y: auto` (interne scroll, UX-spec — geen precieze itemaantal-drempel gegeven, zie Open Questions).
  - [x] **`home-calendar-dayview`**: eenvoudige verticale tijdlijn, vast venster **07:00–22:00** (dekt schooldag + avond, geen exacte UX-spec-eis over het venster — beargumenteerde keuze, zie Open Questions), events als verticaal gepositioneerde blokken (`top`/`height` in % berekend uit `startsAt`/`endsAt` t.o.v. het venster), gedempte kleur, natuurlijke `title`-attribuut voor de hover-tooltip (native, toegankelijk, geen custom tooltip-component nodig — UX-spec eist alleen "tooltip met tijd + titel", niet een specifieke implementatie). States: Gevuld (events) / Leeg (`calendarDayEvents` = `[]`, geen eigen bericht nodig — lege tijdlijn is zelfsprekend) / Fout (`calendarDayEvents === null`, toont "Kan agenda niet laden" i.p.v. de tijdlijn).
- [x] Task 6: Verificatie (AC: #1, #2)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live geverifieerd tegen de dev-stage in de browser: `home-later-list` met meerdere taken van vandaag (klik op een item navigeert correct met de juiste taak-id), `home-calendar-dayview` toont echte Calendar-afspraken (gebruik een testafspraak in de echte Google Calendar, of een testtaak se sessievenster dat overlapt met een bestaande afspraak om `unavailable`/`tight` te triggeren), `home-off-track-link` aanwezig en navigeert naar `/herstel/reden-kiezen` (verwachte 404).
  - [x] Live geverifieerd: Calendar-foutpad — tijdelijke, nooit-gecommitte fout-forcering in `getTodayEvents` (zelfde discipline als Story 4.1's tijdelijke `throw`/vertraging), bevestigt dat `home-warning-banner` dan verborgen blijft (fail-safe, AC #1) en `home-calendar-dayview` "Kan agenda niet laden" toont, terwijl de taakkaart gewoon blijft werken (UX-spec's "Fout (Calendar)"-page-state).
  - [x] Geen secrets/placeholder-waarden in code/commits. Testafspraken/testtaken na verificatie opgeruimd.

## Dev Notes

### Architectuurcompliance

- AD-7 (Calendar-calls synchroon binnen het request-pad, geen achtergrondtaak/wachtrij) — `getTodayEvents` volgt hetzelfde patroon als `createHomeworkEvent`/`updateHomeworkEvent`.
- Mutatie-ownership-regel — niet van toepassing, deze story voegt alleen lees-functionaliteit toe.
- AC #1's fail-safe-eis is architecturaal significant: een falende externe API mag nooit een onterechte waarschuwing tonen — vergelijkbaar met scenario 08's "agendaconflict-detectie" (zie References), die dezelfde soort Calendar-tijdscheck op weekniveau doet.

### Project Structure Notes

`server/domain/calendar-sync/` bestond al (Story 2.3, alleen schrijvend) — déze story voegt er twee nieuwe, puur lezende bestanden aan toe (`day-events.ts`, `session-time-check.ts`), geen wijziging aan de bestaande `homework-events.ts`.

### Testen

Geen testframework in dit project (nog steeds, project-breed). `session-time-check.ts` is bewust een pure functie (geen I/O) zodat de logica zelf makkelijk te redeneren en handmatig te verifiëren is, ook zonder geautomatiseerde tests.

## Previous Story Intelligence (Story 4.1, inclusief de code review)

- **`server: false` op `useFetch` is verplicht** voor elke client-only fetch op deze pagina — zonder dit lost SSR de data al op tijdens het server-render en is een laadstaat niet waarneembaar. `plan`-fetch bestaat al met `server: false`; déze story hoeft 'm niet opnieuw te zetten (zelfde fetch, uitgebreide response).
- **`isLoading` moet zowel `'pending'` als `'idle'` dekken** (Story 4.1's review-patch) — al aanwezig in de huidige `index.vue`, niet opnieuw te introduceren.
- **Een niet-401-fout moet een eigen, zichtbare foutstatus krijgen** (Story 4.1's review-patch, `hasError`-computed + `home-error-state`) — dit dekt al een volledig mislukte `/api/home/plan`-aanroep; `calendarDayEvents === null` is een ándere, meer granulaire fout (alleen Calendar mislukt, de rest van de respons is nog geldig) en heeft dus zijn eigen, lokale foutweergave binnen `home-calendar-dayview` nodig — géén hergebruik van `home-error-state`.
- **`useState('sessie-start-taak', ...)` + `navigateTo('/sessie/starten?taak={id}')`** is de al-bestaande `startSessie`-functie in `index.vue` — déze story roept 'm opnieuw aan vanuit `home-later-list`, bouwt 'm niet opnieuw.
- **Live-verificatie via een tijdelijke, nooit-gecommitte fout-forcering** (Story 4.1: een `throw` in de route, gescreenshot, direct weer verwijderd + herdeployed) is het gevestigde patroon voor het testen van foutpaden die anders lastig te reproduceren zijn — hier hergebruikt voor het Calendar-foutpad.
- **DRY van `envelope()` blijft bewust uitgesteld** (Story 4.1's deferred-work-item) — déze story voegt geen nieuwe kopie toe (Task 3 wijzigt de bestaande route, introduceert geen nieuwe envelope-functie).

## Git Intelligence

Laatste commit: `7048839` (Story 4.1 incl. code review — eerste échte hoofdscherm-inhoud, `GET /api/home/plan` + `index.vue`). Déze story bouwt rechtstreeks door op dat endpoint/die pagina, geen nieuw bestand voor de route/pagina zelf.

## References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 423-441 (Story 4.2's User Story + AC, brontekst)
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.1-hoofdscherm/1.1-hoofdscherm.md] — volledige paginaspecificatie: regels 188-207 (Waarschuwing-banner), 284-357 (Off-track-link, Secondary-row, Later-lijst, Calendar-dayview), 360-367 (Page States incl. "Fout (Calendar)"), 458-467 (Open Questions #1, #5, #6 — alle drie relevant voor déze story, in Dev Notes beargumenteerd ingevuld)
- [Source: design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.1-reden-kiezen/3.1-reden-kiezen.md] — regel 21 (`Route: /herstel/reden-kiezen`), gebruikt voor `home-off-track-link`'s navigatiedoel; pagina zelf wordt pas in Story 6.3 gebouwd
- [Source: server/domain/calendar-sync/homework-events.ts] — bestaand schrijf-only Calendar-sync-patroon (retry-bij-401, `calendarRequestMetVerversing`), hergebruikt patroon (niet de code zelf) voor het nieuwe lees-pad
- [Source: server/routes/auth/google.get.ts] — regels 16-17 (readonly vs. write-scope), bevestigt dat elke ingelogde user minimaal leestoegang heeft
- [Source: server/domain/scheduling/recalculate.ts] — regel 70 (`endsAt`-berekening uit `startsAt` + `plannedMinutes`, want `Session` heeft geen eigen `endsAt`-kolom), hergebruikt in Task 3
- [Source: shared/utils/scheduling.ts] — `amsterdamLocalToUtcIso`, hergebruikt voor Task 1's `timeMin`/`timeMax`

## Open Questions

1. **`TIGHT_BUFFER_MINUTES = 15`** — UX-spec se eigen Open Question #1 laat de exacte drempel open, hier ingevuld met de spec's eigen voorbeeldwaarde. Zeg het als een andere drempel bedoeld was.
2. **`home-calendar-dayview`'s tijdvenster (07:00–22:00)** — UX-spec specificeert geen exact venster (wireframe toont slechts 15:00-19:00 als voorbeelduitsnede). Zeg het als een ander venster (bv. het hele etmaal, of dynamisch rond de sessietijd) bedoeld was.
3. **`home-later-list`'s maximumhoogte (16rem) vóór interne scroll** — UX-spec se eigen Open Question #6 laat dit open (geen exact itemaantal). Zeg het als een andere hoogte/itemdrempel bedoeld was.
4. **Tablet-breedte (768–1024px) gedrag van `home-secondary-row`** — UX-spec se eigen Open Question #5 bespreekt alleen mobile/desktop expliciet. Hier: dezelfde media-query-drempel als mobile (< 768px) hanteren, dus tablet valt onder het desktop-tweekoloms-gedrag. Zeg het als tablet een eigen tussenvorm moet krijgen.
5. **`home-off-track-link` navigeert naar `/herstel/reden-kiezen`, dat nog niet bestaat (Story 6.3)** — zelfde bewuste "gat door in volgorde bouwen" als Story 4.1's `/sessie/starten`-link. AC #2 bevestigt expliciet dat dit pas in Epic 6 getest wordt.
6. **Hele-dag-afspraken tellen mee in `home-calendar-dayview` maar niet in `sessionTimeCheck`** — geen expliciete UX-spec-uitspraak hierover; beargumenteerde keuze (een hele-dag-afspraak zonder tijdcomponent blokkeert geen concreet tijdstip). Zeg het als hele-dag-afspraken toch als "de hele dag bezet" moeten meetellen in de tijds-check.
7. **`aria-live` voor de dynamisch verschijnende Waarschuwing-banner** — UX-spec se eigen Open Question #4 laat dit open. Niet toegevoegd in déze story (banner verschijnt samen met de rest van de pagina-inhoud bij dezelfde laadstaat-overgang, niet als een losse, later binnenkomende aankondiging — het risico op een gemiste screenreader-aankondiging is daardoor beperkt, maar niet nul). Zeg het als dit alsnog toegevoegd moet worden.

## Change Log

- 2026-09-05 (verzoek Hillebrand): drie verbeteringen aan `home-calendar-dayview`. (1) **Contrast**: blok-achtergrond veranderd van `--color-accent-bg-subtle` (tint) naar de volle `--color-accent`, tegen een neutrale `--color-surface`-achtergrond i.p.v. `--color-surface-muted` — bij het paarse thema waren die twee tinten (`#f1ecfc` vs `#ede9fe`) vrijwel identiek, waardoor blokken nauwelijks van vrije tijd te onderscheiden waren. Live geverifieerd in zowel blauw als paars. (2) **Klikbaar**: elk blok is nu een `<a target="_blank">` naar Google Calendar's dagweergave (`https://calendar.google.com/calendar/r/day/{jaar}/{maand}/{dag}`) voor de getoonde dag — bewust de dagweergave, niet het specifieke event (het Google-event-id wordt server-side al bewust niet meegestuurd naar de client). Live geverifieerd: de link opent daadwerkelijk de juiste dag in Google Calendar. (3) **Laatste blok stak onder de dayview-box uit**: de vaste CSS `min-height: 0.75rem` concurreerde met de percentage-gebaseerde `top`/`height`-positionering — bij een blok dicht bij het einde van het venster (bv. tot 22:00) duwde die absolute minimumhoogte het blok voorbij de 100%-ondergrens. Vervangen door een percentage-clamp in JS (`heightPercent` nooit groter dan `100 - topPercent`) + `overflow: hidden` op de container als vangnet. `typecheck`/`build` schoon, opnieuw gedeployed.

| Datum | Wijziging |
| --- | --- |
| 2026-08-02 | Story aangemaakt via create-story, voortbouwend op Story 4.1 (done). Eerste story die Google Calendar daadwerkelijk uitleest (i.p.v. alleen beschrijft) — bevestigd dat geen self-guard op write-scope nodig is (readonly is standaard bij elke login). Vijf van de UX-spec's eigen zes relevante Open Questions beargumenteerd ingevuld i.p.v. de dev agent te laten gokken (zie Open Questions), consistent met Story 3.1/4.1's precedent voor onderbepaalde UX-vragen. Fresh-context-validatiepas vond geen fouten — alle technische aannames (schema, scopes, retry-patroon, `sorted`-array, `startSessie`-hergebruik, overlap-algoritme, UX-regelverwijzingen) klopten. |
| 2026-08-02 | Taken 1-6 afgerond: `day-events.ts`/`session-time-check.ts` (nieuw, lees-only Calendar), `plan.get.ts`/`tasks.d.ts` uitgebreid (laterTasks/calendarDayEvents/sessionTimeCheck), `index.vue` uitgebreid (warning-banner, off-track-link, secondary-row met later-list + calendar-dayview). Typecheck/build slagen. **Tijdens live-verificatie twee echte bugs gevonden en gefixt vóór afronding** (zie Debug Log): (1) ISO-tijdstip-stringvergelijking i.p.v. `Date.getTime()`-vergelijking in `determineSessionTimeCheck` — Google's `dateTime`-respons gebruikt een ander ISO-formaat (offset i.p.v. `Z`) dan onze eigen `toISOString()`-waarden, waardoor overlap-detectie onbetrouwbaar was; (2) de sessie's eigen huiswerk-Calendar-event werd niet uitgesloten van de tijds-check, waardoor elke gebruiker met write-scope altijd "unavailable" zou krijgen voor de eigen sessie — `DayEvent` kreeg een `id`-veld, `plan.get.ts` filtert nu op `googleEventId` vóór de check. Beide fixes live herbevestigd. Status → review. |
| 2026-08-02 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor — alle drie succesvol) afgerond en verwerkt: 6 patches toegepast (zie Review Findings), 4 items naar `deferred-work.md`, 12 dismissed. Typecheck/build opnieuw bevestigd (één Vue-compiler-crash tijdens het patchen zelf gevonden en meteen gefixt — een `v-else` zonder bijbehorende `v-if`-sibling na een eerdere template-herstructurering), herdeployed naar `dev`, de 22:00-marker/"Hele dag"-overlap-fix live bevestigd. Status → done. |

## Review Findings

_Code review uitgevoerd 2026-08-02 door drie parallelle adversariële reviewlagen (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — alle drie succesvol afgerond, geen failed_layers. Triage: 0 decision-needed, 6 patch, 4 defer, 12 dismiss (enige overlap tussen reviewers, bv. het "fantoomblokje buiten het venster"-issue dat zowel Blind Hunter als Edge Case Hunter apart noemden)._

### Patches toegepast

1. **⚠-emoji in `home-warning-banner` schond de UX-spec's expliciete "geen uitroepteken-stijl"-eis** (Acceptance Auditor) — de banner moet "neutraal/informerend" zijn, geen alarm-symboliek; het `⚠`-glyph is letterlijk een uitroepteken-in-driehoek. Verwijderd, alleen platte tekst blijft over. `app/pages/index.vue`.
2. **`SessionTimeCheck`-type twee keer onafhankelijk gedefinieerd** (Blind Hunter) — eens in `shared/types/tasks.d.ts`, eens in `session-time-check.ts`. De laatste importeert nu vanuit het gedeelde type i.p.v. te herdefiniëren. `server/domain/calendar-sync/session-time-check.ts`.
3. **Kalenderblokken buiten het 07:00-22:00-venster (of met een ongeldige/negatieve duur, bv. door een dag-overschrijdend event) renderden als een misleidend 2%-fantoomblokje aan de venstergrens** (Blind Hunter + Edge Case Hunter, twee onafhankelijke vondsten van dezelfde categorie) — `calendarBlocks` filtert nu events die volledig buiten het venster vallen of waarvan het berekende eindpunt niet ná het beginpunt ligt. `app/pages/index.vue`.
4. **De 22:00-uurmarkering overlapte de "Hele dag"-regel** (Blind Hunter) — `translateY(-50%)` op de laatste marker liet 'm half buiten de dayview-box vallen, precies waar de toen bottom-gepositioneerde "Hele dag"-regel ook zat. Gefixt door de eerste/laatste marker rand-uitgelijnd (niet gecentreerd) te renderen, én de "Hele dag"-regel te verplaatsen naar een normale regel bóven de tijdlijn i.p.v. absoluut gepositioneerd erin. Live herbevestigd (zie screenshot-verificatie).
5. **Google's interne Calendar-event-id lekte naar de client** (Acceptance Auditor) — nodig voor de server-side self-overlap-filter (zie de eerdere live-verificatiebug), maar nooit bedoeld voor de client. `plan.get.ts` stript nu `id` uit `calendarDayEvents` vóór het retourneren.
6. **`amsterdamMinutesSinceMidnight`/`formatTimeAmsterdam` zouden crashen op een onparseerbaar tijdstip** (Edge Case Hunter) — `Intl.DateTimeFormat` gooit een `RangeError` op een ongeldige `Date`, wat de hele `calendarBlocks`-computed (en dus de pagina) had kunnen laten crashen op één corrupte Calendar-respons. Beide functies geven nu een neutrale fallback (`null`/`'?'`) i.p.v. te gooien.

### Uitgesteld (`deferred-work.md`)

- Overlappende kalenderblokken krijgen geen lane/offset-lay-out (geaccepteerde vereenvoudiging, geen UX-spec-eis).
- Geen filtering van afgewezen/transparante Calendar-afspraken vóór de tijds-check.
- `home-calendar-dayview` heeft geen bredere ARIA-semantiek dan de native `title`-tooltip.
- `amsterdamMinutesSinceMidnight` heeft geen dag-grens-bewustzijn (events die de vorige avond beginnen).

### Dismissed

- `needs: []`-fabricage in `startSessieVanuitLijst` — al expliciet gedocumenteerd in Task 5; Story 4.3 heeft sowieso al een eigen fetch-terugvalpad nodig (zie Story 4.1's Open Question over `useState` bij page refresh), dus dit lost zichzelf op zodra die story gebouwd wordt.
- Retry alleen op 401, geen backoff bij 429/5xx — consistent met het bestaande `homework-events.ts`-patroon, geen regressie t.o.v. de rest van het project.
- Dubbel `id="home-later-list"` op twee elkaar uitsluitende elementen (`v-if`/`v-else`) — nooit tegelijk in de DOM, geen echte HTML-schending.
- Nul testdekking — staand projectbreed punt, geen testframework aanwezig.
- `TIGHT_BUFFER_MINUTES = 15` als "stille productbeslissing" — al expliciet als Open Question #1 in de story opgenomen, wacht op Hillebrand's bevestiging.
- `home-off-track-link` niet zichtbaar in de Leeg-state — Acceptance Auditor bevestigde dat dit letterlijk overeenkomt met de UX-spec's eigen tekst ("verdwijnt mee in de Leeg-state").
- Datum-gestempelde verhalende comments in productiecode — bestaande, projectbrede conventie sinds Story 1.1, geen story-specifiek probleem.
- Theoretische `dayEvent.id === ''`-zelffilter-samenloop — onbereikbaar gegeven het schema (`googleEventId` is `null`, nooit een lege string).
- `timeMax`-grens op 23:59 i.p.v. 23:59:59.999 — al vooraf als triviaal beoordeeld door de fresh-context-validatiepas.
- Google-event zonder `date`/`dateTime` — tegen de API-garantie in, onrealistisch pad.
- `isTimedEvent`-misclassificatie bij een misvormd `startsAt` — zelfde onrealistische-pad-redenering als hierboven.
- `sessionTimeCheck` berekend op `otherEvents` i.p.v. de letterlijke `events` uit Task 3's tekst — bewuste, gedocumenteerde afwijking (fixt de self-overlap-bug), geen defect.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Live-verificatiebug 1 (ISO-tijdstipvergelijking):** de eerste implementatie van `determineSessionTimeCheck` vergeleek `startsAt`/`endsAt` als ruwe strings (`<`/`>`). Live testen tegen een echte, net aangemaakte taak (waarvan het eigen huiswerk-Calendar-event exact het sessievenster overlapt) toonde géén waarschuwing-banner, terwijl er wél een overlap had moeten worden gedetecteerd. Root cause: Google's Events-API geeft `dateTime` terug met een echte UTC-offset (bv. `+02:00`), niet met `Z`/milliseconden zoals onze eigen `toISOString()`-waarden — lexicografische stringvergelijking van twee verschillend geformatteerde ISO-tijdstippen is onbetrouwbaar. Gefixt door overal via `new Date(iso).getTime()` te vergelijken i.p.v. de ruwe strings.
- **Live-verificatiebug 2 (self-overlap):** na fix 1 bleek een dieper probleem: de sessie's éígen huiswerk-Calendar-event (aangemaakt door de bestaande write-sync) overlapt per definitie zichzelf, dus zónder uitsluiting zou elke gebruiker met Calendar-write-scope altijd "unavailable" krijgen voor de eigen eerstvolgende sessie — een reëel gedragsfout, niet alleen een formatteerprobleem. Gefixt door `DayEvent` een `id`-veld te geven (Google's event-id) en `plan.get.ts` het event met `id === first.session.googleEventId` te laten uitfilteren vóór de tijds-check.
- Beide fixes zijn live herbevestigd tegen de dev-stage: na de fixes verscheen "Let op: voor deze sessie is er weinig tijd over." correct zodra een tweede taak (Testtaak B) direct aansluitend op de eerste sessie werd gepland (binnen de 15-minuten-buffer), en géén banner meer bij een enkele taak zonder overlappende afspraken.
- Tijdelijke, nooit-gecommitte hulpmiddelen tijdens verificatie (alle drie verwijderd + herdeployed vóór afronding): een geforceerde `throw` in `getTodayEvents` (Calendar-foutpad-test), en een debug-route `server/api/_debug/cleanup-story-4-2.get.ts` (opruimen van de drie testtaken + hun Calendar-events, want Epic 5 heeft nog geen taakverwijder-UI).
- Overlappende kalenderblokken in `home-calendar-dayview` (bv. drie taken vlak na elkaar) worden momenteel gewoon over elkaar heen getekend, zonder zij-aan-zij-lay-out — geaccepteerd als een redelijke vereenvoudiging (de UX-spec eist geen specifieke overlap-lay-out), zichtbaar geworden door de eigen testdata tijdens verificatie.

### Completion Notes List

- **AC #1/#2 zijn end-to-end geverifieerd**, inclusief het Calendar-foutpad (fail-safe: geen banner, "Kan agenda niet laden", taakkaart blijft werken) en de "tight"-waarschuwing (echt getriggerd door twee direct-opeenvolgende sessies).
- **Twee reële implementatiebugs gevonden én gefixt tijdens live-verificatie** (zie Debug Log) — precies het soort fout die alleen door tegen een echte Google Calendar-respons te testen aan het licht komt, niet door codeinspectie alleen.
- **Eerste lees-only Google Calendar-integratie in dit project**, naast de bestaande schrijf-only sync (Story 2.3) — geen self-guard nodig gebleken (readonly-scope is standaard).
- **Zeven Open Questions blijven open voor Hillebrand** (tight-buffer-drempel, dayview-tijdvenster, later-list-maxhoogte, tablet-gedrag, off-track-link-404-tot-Epic-6, hele-dag-afspraken-in-tijds-check, aria-live) — geen van alle blokkeerde de implementatie.

### File List

**Nieuw:**
- `server/domain/calendar-sync/day-events.ts`
- `server/domain/calendar-sync/session-time-check.ts`

**Gewijzigd:**
- `shared/types/tasks.d.ts` (`SessionTimeCheck`, `HomePlanResponse` uitgebreid)
- `server/api/home/plan.get.ts` (laterTasks/calendarDayEvents/sessionTimeCheck)
- `app/pages/index.vue` (warning-banner, off-track-link, secondary-row met later-list + calendar-dayview)

**Live gedeployed:** stage `dev` op `flowz.fyi`. Geen schema-migratie nodig. Tijdelijke debug-route en geforceerde fout-injectie zijn ná gebruik verwijderd en horen niet bij deze File List.
