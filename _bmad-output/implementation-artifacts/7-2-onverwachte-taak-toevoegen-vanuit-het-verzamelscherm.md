---
baseline_commit: 47cee8d5d3ece5498a7c87bdfefccc7984069923
---

# Story 7.2: Onverwachte Taak Toevoegen vanuit het Verzamelscherm

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want een taak die ik pas op school kreeg en er meteen aan begon direct kunnen vastleggen,
so that ik niet eerst apart een volledig taak-formulier hoef in te vullen voordat ik de bestede tijd kan loggen.

## Acceptance Criteria

1. **Given** Evelien staat op het schoolsessies-verzamelscherm en de taak stond nog niet in Flowz, **when** ze in `school-session-task-select` kiest voor "Nieuwe taak toevoegen", **then** verschijnt een verkorte invoer: `school-session-new-task-title-input` (verplicht) en `school-session-new-task-deadline-input` (verplicht) — geen ander veld **and** wordt bij validatie dezelfde regel gehanteerd als op het volledige taak-formulier (titel niet-leeg, deadline niet in het verleden).
2. **Given** Evelien bevestigt de rij met een nieuw aangemaakte taak, **when** de server verwerkt (samen met Story 7.1's sessie-verwerking), **then** wordt een `Task`-rij aangemaakt (Epic 3's bestaande `createTask`/`validateTaskInput`-pad, ongewijzigd) met moeilijkheid, prioriteit **en vak/soort taak** op een standaardwaarde ("gemiddeld", resp. "Overig"/"opdracht" — zie Dev Notes) **and** berekent de scheduling-engine (Epic 3, ongewijzigd) op basis van de ingevulde deadline meteen een doelmoment, zoals bij elke andere taak **and** is de taak nadien via 6.3-bewerkformulier (Epic 5) verder aan te vullen, net als elke andere taak.

> **Amendement (Hillebrand, 2026-08-26, na live gebruik):** ook voor een nieuwe-taak-rij moet zowel de bestede áls de resterende tijd ingevoerd kunnen worden — dit keert Dev Notes' "resterende tijd niet expliciet aangepast (Story 7.1's `remainingTotalMinutes: null`-precedent)"-aanname om. Opgelost als onderdeel van Story 7.1's amendement (zelfde resterende-tijd-uren/minuten-velden, gedeeld tussen elke rijsoort in `schoolsessies.vue` — geen apart pad voor nieuwe-taak-rijen nodig, `remainingHours`/`remainingMinutes` lopen door dezelfde `entries`-mapping en hetzelfde `replanAfterSession`-vervolgpad als een bestaande-taak-rij).

## Tasks / Subtasks

- [x] Task 1: Server — verkorte taak-aanmaak vóór de bestaande sessie-verwerking (AC: #2)
  - [x] Breid `SchoolSessionEntry` (`shared/types/tasks.d.ts`) uit met een optioneel `newTask`-veld: `{ title: string, deadline: string } | undefined`. Een entry heeft **precies één** van `taskId` (bestaande taak) of `newTask` (nieuwe taak) — nooit beide, nooit geen van beide.
  - [x] In `server/api/school-sessions.post.ts`: vóór de bestaande `getTaskById`/`getSessionForTask`-stappen, als een entry `newTask` heeft, roep dan `createTask(userId, {...})` aan (uit `server/domain/tasks/create-task.ts`, **ongewijzigd, exact dezelfde functie als `POST /api/tasks`**) met:
    - `subject: 'Overig'`, `type: 'opdracht'` — vaste defaults (Hillebrand, 2026-08-23)
    - `difficulty: 'gemiddeld'`, `priority: 'gemiddeld'`
    - `defaultSessionDuration`: `entry.actualMinutes` geklemd tussen `MIN_SESSION_DURATION`/`MAX_SESSION_DURATION` — nu geëxporteerd uit `validate-task-input.ts` (kleine, gedragsneutrale refactor) i.p.v. lokaal gedupliceerd
    - `description: null`, `subtasks: []`, `totalMinutesOverride: null`, `needs: []`
    - Alleen `title`/`deadline` zelf gevalideerd (`isValidCalendarDate`/`todayInAmsterdam`, ook uit bestaande shared utils hergebruikt), niet de volledige `validateTaskInput()`
  - [x] Na een geslaagde `createTask`-aanroep: `task.id` verder gebruikt exact zoals een bestaande-taak-entry (`getSessionForTask` + `replanAfterSession(...)`) — één gedeeld pad in de lus, niet gedupliceerd.
  - [x] Faalt `createTask` (ongeldige titel/deadline, of een onverwachte fout) of de sessie-verwerking: zelfde per-regel-resultaat-patroon als Story 7.1 (`{ rowId, ok: false, message }`), de batch gaat door met de overige regels.

- [x] Task 2: Client — "Nieuwe taak toevoegen" in de task-select (AC: #1)
  - [x] `app/pages/schoolsessies.vue`: `school-session-task-select` krijgt een extra, altijd-aanwezige optie "+ Nieuwe taak toevoegen" (`NEW_TASK_OPTION`-sentinel, ná de bestaande taken-opties).
  - [x] Kiest Evelien die optie voor een rij: toont een extra rij (`school-new-task-fields`) met `school-session-new-task-title-input`, `school-session-new-task-deadline-input`, **naast** het bestaande `school-session-time-input` (bestede tijd blijft nodig).
  - [x] Client-side validatie voor zo'n rij: titel niet-leeg (max 100 tekens, losse `MAX_NEW_TASK_TITLE_LENGTH`-constante met verwijzing naar `validate-task-input.ts`'s `MAX_TITLE_LENGTH`), deadline niet in het verleden (`todayInAmsterdam()`, zelfde patroon als `TaakFormulier.vue`), en de bestaande minuten-validatie (`isEmptyField`) blijft gewoon gelden.
  - [x] `versturen()`: een rij met de "nieuwe taak"-optie geselecteerd bouwt een entry met `newTask: { title, deadline }` in plaats van `taskId`. Het bestaande per-rij-resultaat-/retry-mechanisme (rowId-correlatie, mislukte rijen blijven staan) werkt ongewijzigd door voor dit pad.

- [x] Task 3: Verificatie
  - [x] `npm run typecheck` slaagt
  - [x] `npx nuxt build` slaagt
  - [x] Live/handmatig geverifieerd tegen de dev-stage (zelfde aanpak als Story 7.1 — tijdelijke testgebruiker, geen testframework aanwezig): (a) een gemengde batch (één bestaande taak + één nieuwe taak) in dezelfde aanroep — beide slagen; de nieuwe taak heeft `subject: 'Overig'`, `type: 'opdracht'`, `difficulty`/`priority: 'gemiddeld'`, `defaultSessionDuration`/`totalMinutes` gelijk aan de ingevulde bestede tijd; (b) een ongeldige deadline (verleden) geeft een net per-regel-resultaat (`ok:false`, duidelijke boodschap), geen taak aangemaakt, de rest van de batch blijft onaangeroerd; (c) klemming geverifieerd: 2 minuten bestede tijd resulteert in `defaultSessionDuration`/`totalMinutes` = 5 (de ondergrens), niet 2; (d) een structureel ongeldige rij (lege titel) laat de hele aanroep terecht met een 400 falen vóór de per-regel-verwerking, consistent met Story 7.1's bestaande structurele validatie
  - [x] Geen secrets of placeholder-waarden in code/commits; alle tijdelijke diagnostische routes/testdata na gebruik verwijderd

## Dev Notes

### De open productbeslissing die deze story vastlegt

Noch de PRD (UJ-9) noch epics.md's oorspronkelijke AC-tekst voor deze story specificeerden wat er met `vak` (`subject`) en `soort taak` (`type`) moet gebeuren voor een taak die via dit verkorte pad wordt aangemaakt — beide zijn `NOT NULL`-kolommen zonder DB-default (in tegenstelling tot `difficulty`/`priority`, die al `default('gemiddeld')` hebben in `server/data/schema.ts`). Hillebrand heeft dit tijdens het aanmaken van deze story expliciet besloten: **`subject: 'Overig'`, `type: 'opdracht'`**, beide later aan te passen via UJ-4 (bewerkformulier), net als de al bestaande defaults voor moeilijkheid/prioriteit/sessieduur. Dit is geen aanname — behandel het als een vastgesteld gegeven, niet als iets om opnieuw ter discussie te stellen.

### `defaultSessionDuration`/`totalMinutes`: afgeleid van de bestede tijd, niet geraden

Er is geen input voor sessieduur in dit verkorte pad. Omdat `computeTotalMinutes()` (`server/domain/tasks/create-task.ts`) zonder deeltaken/override terugvalt op `defaultSessionDuration` (dus dat veld bepaalt ook meteen de "resterende benodigde tijd" van de taak), is de meest zinnige default de tijd die Evelien net daadwerkelijk aan de taak besteedde (`entry.actualMinutes`) — geklemd binnen `validateTaskInput`'s eigen grenzen (5-480 minuten, `MIN_SESSION_DURATION`/`MAX_SESSION_DURATION` in `validate-task-input.ts`) omdat die grenzen niet omzeild mogen worden. Gevolg: ná het aanmaken van de taak logt dezelfde aanroep meteen de bestede tijd (Task 1's tweede stap) — de taak krijgt daarna, als de resterende tijd niet expliciet is aangepast (en dat is 'ie hier niet, zie Story 7.1's `remainingTotalMinutes: null`-precedent), gewoon een vervolgsessie van dezelfde lengte gepland. Dat is **geen bug om hier op te lossen** — het is exact hetzelfde gedrag als elke andere taak zonder subtaken/override, en exact hetzelfde als Story 7.1's algemene "geen resterende-tijd-aanpassing op dit scherm"-keuze.

### Hergebruik `createTask`, dupliceer 'm niet

`server/domain/tasks/create-task.ts`'s `createTask(userId, input: CreateTaskInput)` is de **enige** plek waar een taak+sessie+Calendar-sync atomair tot stand komt (Story 3.1, met de opruim-logica bij een mislukte Calendar-call). Deze story roept 'm rechtstreeks aan met de hierboven vastgelegde defaults — bouw geen tweede, verkorte taak-aanmaakfunctie. `validateTaskInput()` zelf is **niet** geschikt om hier (gedeeltelijk) te hergebruiken, want die eist juist de velden die dit pad niet heeft (`subject`/`type`/`difficulty`/`priority`/`defaultSessionDuration` als verplichte input) — hergebruik in plaats daarvan de kleinere bouwstenen die die functie ook gebruikt (`isValidCalendarDate` uit `shared/utils/availability.ts`, `todayInAmsterdam` uit `shared/utils/scheduling.ts`, en desnoods de `MAX_TITLE_LENGTH`/`MIN_SESSION_DURATION`/`MAX_SESSION_DURATION`-constanten als die geëxporteerd worden) voor alleen de titel-/deadline-validatie die dit pad wél nodig heeft.

### Story 7.1's per-regel-resultaat-mechanisme dekt dit pad al grotendeels

Story 7.1's code review leidde tot een per-regel-resultaat-response (`SchoolSessionResult[]`, gecorreleerd via een client-gegenereerde `rowId`, geen alles-of-niets-batch). Dat mechanisme hoeft voor déze story niet opnieuw ontworpen te worden — een `newTask`-entry die faalt (ongeldige titel/deadline, of een fout tijdens `createTask`) levert gewoon weer `{ rowId, ok: false, message }` op, en de client houdt 'm net zo op het scherm staan als een mislukte bestaande-taak-regel. Bouw geen aparte foutafhandeling voor dit pad.

### Bestanden die je aanraakt (huidige staat)

| Bestand | Huidige staat | Wat deze story doet |
| --- | --- | --- |
| `shared/types/tasks.d.ts` | `SchoolSessionEntry { rowId, taskId, actualMinutes }` (Story 7.1). | **UPDATE** — `newTask`-veld toevoegen, `taskId` optioneel maken (precies één van beide verplicht) |
| `server/api/school-sessions.post.ts` | Verwerkt per regel een bestaande taak (Story 7.1: `getTaskById` → `getSessionForTask` → `replanAfterSession`). | **UPDATE** — vóór die stappen, bij `newTask`: `createTask` aanroepen, dan hetzelfde vervolgpad hergebruiken |
| `app/pages/schoolsessies.vue` | Eén rij-layout: task-select + tijd-input (Story 7.1). | **UPDATE** — "Nieuwe taak toevoegen"-optie + conditionele titel-/deadline-velden per rij |
| `server/domain/tasks/create-task.ts` | `createTask`, volledig gebouwd (Story 3.1), gebruikt door `POST /api/tasks`. | **NIET AANRAKEN** — alleen importeren en aanroepen |
| `server/domain/tasks/validate-task-input.ts` | Volledige validatie voor het lange formulier, incl. `MIN_SESSION_DURATION`/`MAX_SESSION_DURATION`/`MAX_TITLE_LENGTH`-constanten (momenteel module-lokaal, niet geëxporteerd). | **MOGELIJK KLEINE UPDATE** — overweeg deze drie constanten te exporteren i.p.v. lokaal te herdefiniëren in `school-sessions.post.ts` (kleine, in-scope refactor; geen gedragswijziging) |

### Wat expliciet buiten scope valt

- **Geen deeltaken, geen benodigdheden, geen omschrijving** voor het verkorte pad — precies zoals epics.md's "geen ander veld" voorschrijft.
- **Geen wijziging aan `POST /api/tasks` of `TaakFormulier.vue`** — dit is een apart, verkort aanmaakpad specifiek voor het schoolsessies-scherm, geen wijziging aan het bestaande volledige formulier.
- **Geen retroactieve correctie van vak/soort taak** door de gebruiker vanuit dit scherm zelf — dat gebeurt via het bestaande UJ-4-bewerkformulier, niet hier.

### Testen

Nog steeds geen testframework (`deferred-work.md`). Verificatie via typecheck, build, en een handmatige test tegen de dev-stage — zelfde opzet als Story 7.1 (tijdelijke testgebruiker via een lokale, niet-gecommitte diagnostische route, direct na gebruik verwijderd).

## Previous Story Intelligence (Story 7.1)

- **`getSessionForTask`/`replanAfterSession` zijn de kernbouwstenen** — al volledig gebruikt en getest in Story 7.1 voor het bestaande-taak-pad. Deze story voegt er alleen `createTask` als voorschakel-stap aan toe voor het nieuwe-taak-pad; het vervolgpad (sessie loggen, herplannen) is identiek.
- **`rowId`-correlatie (niet taak-id) is al opgelost** — een client-gegenereerde waarde per rij, nodig omdat twee rijen toevallig dezelfde taak (of, voor deze story, geen bestaande taak) kunnen betreffen. Hergebruik dat mechanisme ongewijzigd.
- **`isEmptyField`-validatiepatroon** (Story 7.1's code-review-fix) geldt onverkort voor het tijd-veld, ook op een nieuwe-taak-rij.
- **Live-verificatie vereist `npx sst shell --stage dev -- npm run dev`**, `.env` gesourcet, én `NUXT_TURSO_DATABASE_URL` expliciet geëxporteerd (de kale `TURSO_DATABASE_URL` uit `.env` wordt alleen bij een echte `sst deploy` naar de `NUXT_`-variant vertaald) — zie Story 7.1's Debug Log voor de volledige valkuil-geschiedenis (SST-links, stage, env-var-naam) vóórdat je dit opnieuw uitvindt.
- **Foreign-key-constraints zijn actief** — een tijdelijke testgebruiker moet bij opruiming cascade-verwijderd worden over alle zes tabellen met een `userId`-FK (`tasks`, `availableTimePatterns`, `availableTimeExceptions`, `dismissedConflicts`, `sessionPlacementLocks`, `availabilityWriteLocks`), niet alleen `tasks`. Zie Story 7.1's Debug Log voor de kant-en-klare cascade-delete-opzet.
- **`createTask` roept ongeclausuleerd `createHomeworkEvent` aan** (in tegenstelling tot `replanAfterSession`, dat wél op `homeworkCalendarColorId`/`hasCalendarWriteScope` guardt) — een testgebruiker heeft daarom **echte, met `encryptToken()` versleutelde** placeholder-Calendar-tokens nodig, geen platte strings (anders faalt `getUserById`'s decryptie meteen bij de eerste `createTask`-aanroep).

## Git Intelligence

Laatste commit (`47cee8d`) is Story 7.1 zelf — deze story bouwt direct daarop voort (zelfde bestanden: `school-sessions.post.ts`, `schoolsessies.vue`, `shared/types/tasks.d.ts`).

## Project Structure Notes

Geen nieuwe bestanden, geen schemawijziging, geen migratie — uitsluitend uitbreidingen van Story 7.1's al bestaande bestanden, plus een optionele kleine refactor (constanten exporteren uit `validate-task-input.ts`).

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-7.2-Onverwachte-Taak-Toevoegen-vanuit-het-Verzamelscherm] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-7-Schoolsessies-Invoeren-Papieren-Agenda] — epic-context, FR30
- [Source: _bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md#UJ-9] — brontekst: verkorte taak-aanmaak als uitzondering, niet het hoofdpad
- [Source: _bmad-output/implementation-artifacts/7-1-schoolsessies-verzamelscherm.md] — vorige story: `getSessionForTask`/`replanAfterSession`-hergebruik, `rowId`-correlatie, per-regel-resultaten, `isEmptyField`-patroon, live-verificatie-valkuilen (SST-stage/env-vars, FK-cascade-delete, tokendecryptie)
- [Source: server/domain/tasks/create-task.ts] — `createTask`/`computeTotalMinutes`, te hergebruiken zonder wijziging
- [Source: server/domain/tasks/validate-task-input.ts] — volledige validatie (referentie voor titel-/deadline-regels + constanten), niet rechtstreeks aan te roepen voor dit verkorte pad
- [Source: server/data/schema.ts] — `tasks`-tabel: welke kolommen `NOT NULL` zijn zonder DB-default (`subject`, `type`, `defaultSessionDuration`) versus mét (`difficulty`, `priority`)
- [Source: app/components/TaakFormulier.vue] — bestaand voorbeeld van client-side titel-/deadline-validatie, te spiegelen voor Task 2

## Review Findings

Code review 2026-08-24 (`/code-review`, forked review-sessie op de uncommitted wijzigingen). Eén bevinding, **CONFIRMED** maar bewust **uitgesteld**, geen fix.

- [x] [Review] **Dubbele DOM-id's over meerdere rijen.** `school-session-new-task-title-input`/`school-session-new-task-deadline-input` krijgen een vaste, niet-unieke id, dus twee rijen met "Nieuwe taak toevoegen" geselecteerd renderen ongeldige HTML (dubbele id's); een toekomstige `getElementById`/`<label for>`/id-gebaseerde e2e-selector zou dan altijd de eerste rij raken. **Bewust niet gefixt:** dit is een uitbreiding van een al bestaand, herhaaldelijk toegepast patroon in deze codebase — `school-session-task-select`/`school-session-time-input` (Story 7.1, dezelfde pagina) en `week-day-suggestion-accept-button` (Story 6.5) doen precies hetzelfde: een vaste id herhaald per `v-for`-rij, gebruikt als selector-conventie voor UX-specs/tests, niet als strikt unieke DOM-id. Een losse fix voor alleen déze twee nieuwe velden zou inconsistent zijn met de rest van dezelfde pagina en het project; als dit patroon projectbreed aangepakt wordt, hoort dat in een eigen, aparte pas over alle vergelijkbare elementen tegelijk (zelfde redenering als eerdere, soortgelijke a11y-punten in `deferred-work.md`, bv. de `aria-live`-op-verdwijnend-element-bevinding bij Story 6.5). Vandaag geen enkele echte `getElementById`/`<label for>`-aanroeper in de app zelf op deze ids (alleen mijn eigen wegwerp-testscripts deden dat) — dus geen actief risico, wel een latent punt.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Kleine, gedragsneutrale refactor vooraf:** `MAX_TITLE_LENGTH`/`MIN_SESSION_DURATION`/`MAX_SESSION_DURATION` in `validate-task-input.ts` geëxporteerd (waren module-lokaal) zodat `school-sessions.post.ts` ze rechtstreeks kan hergebruiken i.p.v. dupliceren — geen gedragswijziging aan de bestaande validatie, typecheck bevestigt dit (geen andere aanroeper geraakt).
- **AWS-sessie was verlopen bij de eerste live-verificatiepoging** — na hernieuwde login (Hillebrand) verder gegaan, zelfde patroon als Story 1.4/7.1.
- **Live-verificatie tegen de dev-stage** (`npx sst shell --stage dev`, `.env` + `NUXT_TURSO_DATABASE_URL` expliciet gezet, tijdelijke testgebruiker via een niet-gecommitte diagnostische route — identieke opzet als Story 7.1's Debug Log, geen nieuwe valkuilen dit keer):
  - Structurele validatie (lege titel) laat de **hele** aanroep met 400 falen vóór de per-regel-verwerking — bewust zo (zelfde precedent als Story 7.1's `isValidEntry`), en client-side al afgedwongen, dus in de praktijk onbereikbaar via de UI.
  - Een schone gemengde batch (1 bestaande taak + 1 nieuwe taak) verwerkte beide correct in één aanroep: `results: [{ok:true}, {ok:true}]`.
  - De nieuwe taak had exact de vastgelegde defaults: `subject:'Overig'`, `type:'opdracht'`, `difficulty`/`priority:'gemiddeld'`, en `defaultSessionDuration`/`totalMinutes` gelijk aan de ingevulde bestede tijd (8 → 8).
  - Klemming expliciet getest: 2 minuten bestede tijd → `defaultSessionDuration`/`totalMinutes` = 5 (`MIN_SESSION_DURATION`), niet 2 — bevestigt dat de klem-logica (niet alleen de happy path) daadwerkelijk werkt.
  - Een verleden-deadline gaf het verwachte per-regel-resultaat (`ok:false`, "Deadline mag niet in het verleden liggen."), geen taak aangemaakt.
- Alle tijdelijke bestanden/testdata zijn na afloop verwijderd; `git status` toont uitsluitend de vier bedoelde wijzigingen.

### Completion Notes List

- **AC #1 (verkorte invoer, alleen titel+deadline):** `school-session-task-select` heeft een "+ Nieuwe taak toevoegen"-optie; kiest Evelien die, dan verschijnen `school-session-new-task-title-input`/`school-session-new-task-deadline-input` — verder geen ander veld. Validatie spiegelt `TaakFormulier.vue`'s bestaande titel-/deadline-regels (zelfde `todayInAmsterdam()`-vergelijking).
- **AC #2 (Task-rij via bestaande `createTask`, defaults, later aanpasbaar):** `server/api/school-sessions.post.ts` roept `createTask()` (Epic 3, ongewijzigd) aan met de vastgelegde defaults, en hergebruikt daarna exact hetzelfde vervolgpad als een bestaande taak (`getSessionForTask` + `replanAfterSession`). Live bevestigd inclusief de klem-logica voor `defaultSessionDuration`.
- **Kleine refactor, geen scope-uitbreiding:** drie constanten geëxporteerd uit `validate-task-input.ts` i.p.v. gedupliceerd, precies zoals de story's Dev Notes als optie noemden.
- **Bewust niet aangeraakt:** `POST /api/tasks`, `TaakFormulier.vue`, `validateTaskInput()` zelf (alleen kleinere bouwstenen eruit hergebruikt) — het volledige taak-formulier-pad is volledig ongewijzigd.

### File List

**Gewijzigd:**
- `shared/types/tasks.d.ts` (`SchoolSessionNewTask`, `SchoolSessionEntry.taskId` optioneel + `newTask`-veld)
- `server/api/school-sessions.post.ts` (verkorte taak-aanmaak vóór het bestaande sessie-verwerkingspad, per-regel resultaten ongewijzigd hergebruikt)
- `server/domain/tasks/validate-task-input.ts` (drie constanten geëxporteerd, geen gedragswijziging)
- `app/pages/schoolsessies.vue` ("Nieuwe taak toevoegen"-optie, titel-/deadline-velden, rij-specifieke validatie)

**Niet gewijzigd:** `server/domain/tasks/create-task.ts`, `server/api/tasks.post.ts`, `app/components/TaakFormulier.vue` (alle drie uitsluitend gespiegeld/geïmporteerd, niet aangepast)

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-23 | Story aangemaakt via create-story, na afronding van Story 7.1 (schoolsessies-verzamelscherm, `done`/`review`, gecommit als `47cee8d`). Open productbeslissing (vak/soort-taak-default voor het verkorte pad) voorgelegd aan en beantwoord door Hillebrand: `subject: 'Overig'`, `type: 'opdracht'`. |
| 2026-08-24 | Tasks 1-3 geïmplementeerd en volledig live geverifieerd tegen de dev-stage (gemengde batch, klemming, verleden-deadline, structurele validatie). Typecheck/build schoon. Status → review. |
| 2026-08-24 | Code review: 1 bevinding (dubbele DOM-id's over meerdere rijen), bewust uitgesteld — consistent met een al bestaand, herhaaldelijk toegepast patroon in dit project (Story 7.1/6.5). Toegevoegd aan `deferred-work.md`. Status blijft `review`. |
| 2026-08-26 | **Amendement na live gebruik (Hillebrand):** resterende-tijd-invoer geldt nu ook voor nieuwe-taak-rijen (zie het Amendement bij de Acceptance Criteria) — meegenomen als onderdeel van Story 7.1's amendement, zelfde gedeelde code-pad. Status blijft `review`. |
