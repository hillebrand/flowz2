---
baseline_commit: d3917560987916d3e8562502c03c0db8181f7abd
---

# Story 7.1: Schoolsessies-verzamelscherm

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want 's avonds in één scherm alle schoolsessies van die dag invoeren die ik op papier heb bijgehouden,
so that mijn planning ook klopt met het huiswerk dat ik zonder telefoon heb gedaan.

## Acceptance Criteria

1. **Given** Evelien opent het schoolsessies-verzamelscherm (laagdrempelig bereikbaar via het hamburgermenu), **when** de pagina laadt, **then** toont `school-sessions-list` een lege rij om mee te beginnen, met per rij `school-session-task-select` (kiezen uit de taken die vandaag al een geplande sessie hebben) en `school-session-time-input` (bestede tijd in minuten) **and** kan Evelien via `school-session-add-row-button` extra rijen toevoegen, één per papieren aantekening.
2. **Given** Evelien heeft één of meer rijen ingevuld en klikt op `school-sessions-confirm-button`, **when** de server de invoer verwerkt, **then** wordt elke regel verwerkt als een afgeronde sessie: dezelfde aanpassing van resterende benodigde tijd en herberekening van de dagplanning als bij het afronden van een live sessie (hergebruikt `replanAfterSession`/`recalculateTaskPlanning`, Story 4.6/4.7 — geen nieuwe herplan-logica) **and** keert Evelien terug naar 1.1-Home met de bijgewerkte dagplanning.
3. **Given** Evelien heeft nog geen rij ingevuld, **when** ze op `school-sessions-confirm-button` klikt, **then** gebeurt er niets (geen lege sessies aanmaken); een validatiemelding wijst op de lege rij.

## Tasks / Subtasks

- [x] Task 1: Endpoint — vandaag geplande taken ophalen voor de task-select (AC: #1)
  - [x] Nieuw `server/api/school-sessions/tasks.get.ts`. Hergebruik **rechtstreeks** `getTasksWithSessionOnDate(userId, todayInAmsterdam())` uit `server/data/tasks.ts` — dezelfde functie die `server/api/home/plan.get.ts` al gebruikt voor "taken met een sessie vandaag". Geen nieuwe query schrijven.
  - [x] Response: alleen wat de select-dropdown nodig heeft — `{ id: task.id, subject: task.subject, title: task.title }[]`. Stuur geen volledige `Task`/`Session`-objecten mee (zelfde "geen client-behoefte, niet meesturen"-precedent als `home/plan.get.ts` met `googleEventId`).
  - [x] `requireUserSession` + 401-envelope, zelfde patroon als elke andere route in `server/api/`.

- [x] Task 2: Endpoint — schoolsessies verwerken (AC: #2, #3)
  - [x] Nieuw `server/api/school-sessions.post.ts`. Body: `{ entries: { taskId: string, actualMinutes: number }[] }`.
  - [x] Validatie vóór enige write: `entries` is een niet-lege array (AC #3 — een lege array levert een 400 op, precies zoals de story's "er gebeurt niets" vraagt — dit hoeft dus niet client-side alleen afgedwongen te worden); elke `actualMinutes` is `Number.isInteger(...) && >= 0` (**exact dezelfde regel als `server/api/sessions/[sessionId]/replan.post.ts`'s `isValidHours`-buurregel voor `actualMinutes` — geen striktere/andere validatie verzonnen**).
  - [x] Per entry: `getSessionForTask(taskId)` om de bijbehorende sessie te vinden ("architectuur kent precies 1 sessie per taak", zie `server/data/tasks.ts`'s commentaar bij die functie — er is dus geen aparte `sessionId` van de client nodig, alleen de `taskId`). Bestaat de sessie niet, of hoort de taak niet bij de ingelogde gebruiker (`task.userId !== session.user.id`): die regel faalt met een 404-envelope, **de hele aanroep stopt daar** (geen partial-apply van eerdere regels in dezelfde batch — zie Dev Notes voor de afweging).
  - [x] Roep per geldige regel `replanAfterSession(taskId, session.id, actualMinutes, null)` aan (uit `server/domain/scheduling/replan.ts`) — de `null` voor `remainingTotalMinutes` betekent "ongewijzigd", **exact hetzelfde als wanneer Evelien op 1.4-sessie-afronden de resterende-tijd-velden leeg laat** (de standaardwaarde daar, zie Dev Notes). Geen nieuw scheduling-mechanisme gebouwd.
  - [x] Response: `{ ok: true }` of de gedeelde `ErrorEnvelope`. Geen actief tijdgebrek-signaal/redirect in dit endpoint — zie Dev Notes ("Waarom hier geen actieve tekort-check") voor waarom dat bewust is en consistent met de rest van het project.

- [x] Task 3: Pagina — verzamelscherm (AC: #1, #3)
  - [x] Nieuwe route `app/pages/schoolsessies.vue`. Bij het laden: `GET /api/school-sessions/tasks` ophalen voor de dropdown-opties.
  - [x] `school-sessions-list`: begint met één lege rij (`{ taskId: null, minutes: null }`). Per rij: `school-session-task-select` (opties uit Task 1's endpoint, toont `${subject} — ${title}`) en `school-session-time-input` (`type="number"`, minuten, geen bovengrens — zelfde stijl als `taak-session-duration-input` in `TaakFormulier.vue`, geen uren/minuten-split zoals `wrap-remaining-*-input`).
  - [x] `school-session-add-row-button`: voegt een nieuwe lege rij toe. Geen limiet op het aantal rijen.
  - [x] Client-side validatie vóór het versturen: elke ingevulde rij moet een gekozen taak én een geldig aantal minuten hebben; een volledig lege rij wordt genegeerd bij het opbouwen van de payload — is de payload na filteren leeg (AC #3), dan verschijnt een validatiemelding en wordt niets verstuurd.
  - [x] `school-sessions-confirm-button`: stuurt de gefilterde payload naar `POST /api/school-sessions`; bij succes `navigateTo('/')`.
  - [x] 401-afhandeling: zelfde `is401()`-patroon als elders in de app — bij een 401 naar `/inloggen`.

- [x] Task 4: Toegang vanaf het hamburgermenu (AC: #1)
  - [x] `app/components/HamburgerMenu.vue`: nieuw item toegevoegd aan het bestaande `ITEMS`-array (gewone `NuxtLink`, in tegenstelling tot Story 1.5's uitlogknop is dit gewoon SPA-navigatie naar een interne route): `{ label: 'Schoolsessies invoeren', to: '/schoolsessies' }`.

- [x] Task 5: Verificatie
  - [x] `npm run typecheck` slaagt
  - [x] `npx nuxt build` slaagt
  - [x] Live/handmatig geverifieerd tegen de dev-stage (zie Dev Agent Record voor de volledige opzet, incl. een tijdelijke testgebruiker): (a) `GET /api/school-sessions/tasks` toont een taak met een geplande sessie vandaag; (b) een lege `POST /api/school-sessions`-aanroep geeft `400` (AC #3); (c) een echte schoolsessie posten geeft `{ok:true}`, en een directe DB-inspectie bevestigt een nieuwe `sessionLogs`-rij én een bijgewerkte `sessions`-rij (`updatedAt` ververst, `recalculateTaskPlanning` is dus aangeroepen); (d) het scherm zelf doorlopen in een echte Chrome-browser — dropdown toont de taak, invullen en op "Opslaan" klikken verwerkt de sessie en navigeert terug naar Home met de bijgewerkte dagplanning
  - [x] Geen secrets of placeholder-waarden in code/commits; alle tijdelijke diagnostische routes/testdata zijn na gebruik verwijderd

## Dev Notes

### De belangrijkste ontdekking: er is al precies de juiste bouwsteen — bouw niet opnieuw

Dit is de kern van deze story, dus lees dit vóór je begint. `server/data/tasks.ts` bewaakt expliciet de aanname **"architectuur kent precies 1 sessie per taak"** (zie het commentaar bij `getSessionForTask`, met een `throw` als die aanname ooit geschonden wordt). Dat betekent: om een schoolsessie te loggen heb je nooit een sessie-id van de client nodig — `getSessionForTask(taskId)` levert 'm altijd op, of de taak heeft (nog) geen sessie (zou hier niet moeten voorkomen, want de task-select toont alleen taken die al een sessie vandaag hebben).

De volledige "sessie afronden"-logica bestaat al in `server/domain/scheduling/replan.ts`'s `replanAfterSession(taskId, sessionId, actualMinutes, remainingTotalMinutes)` — precies de functie die `POST /api/sessions/{sessionId}/replan` (Story 4.7, live-sessie-afronden) ook aanroept. Deze story roept **dezelfde functie rechtstreeks aan** vanuit een nieuw endpoint, in een lus over de ingevoerde regels. Bouw geen nieuwe versie van deze logica, en roep 'm niet aan via een HTTP-round-trip naar het bestaande `/replan`-endpoint vanuit de server zelf — importeer de functie direct, zoals elke andere server-side aanroeper in dit project doet.

### Waarom `remainingTotalMinutes: null` de juiste keuze is (niet een gok)

`replanAfterSession`'s derde argument (`remainingTotalMinutes`) betekent "ongewijzigd" als het `null` is — dan wordt alleen `insertSessionLog` aangeroepen (de bestede tijd loggen), zonder `task.totalMinutes` (de resterende benodigde tijd) aan te passen. Dit is **niet een edge case, maar het standaardpad**: op het bestaande live-sessie-afrondscherm (`app/pages/sessie/overzicht.vue`) staan `remainingHours`/`remainingMinutes` standaard op `null` (leeg) — Evelien vult ze alleen in als ze de resterende tijd expliciet wil bijstellen. Epics.md's Story 7.1-AC vraagt geen apart resterende-tijd-veld voor dit scherm (alleen taak + bestede tijd), dus `null` meegeven is exact consistent met hoe de meerderheid van de live sessies vandaag al wordt afgerond. Bouw geen resterende-tijd-invoerveld voor deze story — dat staat niet in de AC en zou UJ-9's eigen "titel/deadline/tijd, verder niets" verkorte-uitzondering (Story 7.2, niet deze story) doorkruisen.

### Waarom hier geen actieve tekort-check

Epics.md's FR29 noemt "het tijdgebrek-signaal (FR15) als de resterende tijd niet meer past" — maar geen enkele bestaande mutatie-plek in dit project (task-aanmaken in `TaakFormulier.vue`, of het bestaande live-sessie-afronden in `sessie/overzicht.vue`) roept na het opslaan actief een tekort-check aan of navigeert naar 3.2-tekort-oplossen. Tijdgebrek wordt in dit project uitsluitend **passief zichtbaar** wanneer Evelien toch al naar 7.1-weekoverzicht (knelpunt-badge, Story 6.5) of via de expliciete "Vandaag niet als gepland?"-knop (Story 6.3) gaat. Deze story volgt precies datzelfde, al bestaande patroon: geen nieuwe actieve check bouwen die nergens anders in het project bestaat. Als je hier tóch een actieve check zou willen toevoegen, is dat een projectbrede beslissing die niet in deze ene story hoort — signaleer het desnoods als open punt, bouw het niet stilletjes hier als eerste.

### Batch-verwerking: stop bij de eerste fout, geen partial-apply-herstel

Als één regel in de batch een niet-bestaande/niet-eigen taak bevat, stopt de hele aanroep met een 404 — regels die al wél succesvol verwerkt zijn vóór die fout, blijven zo staan (geen rollback). Dit is bewust: dit project wrapt vergelijkbare multi-taak-lussen (bv. `resolve-conflict.post.ts`'s lus over alle taken met een sessie op de conflictdatum, Story 6.6) ook niet in één grote transactie — elke taak-mutatie is zelf al atomair (via `logSessionAndUpdateRemaining`/`logSessionAndCompleteTask`'s eigen transacties), en een taak die niet bij de gebruiker hoort zou sowieso nooit in de task-select-lijst hebben moeten staan (die is al user-gescopet via `getTasksWithSessionOnDate`). Bouw geen cross-row-transactie of rollback-mechanisme — dat zou een nieuw patroon zijn dat nergens anders in dit project bestaat.

### Bestanden die je aanraakt (huidige staat)

| Bestand | Huidige staat | Wat deze story doet |
| --- | --- | --- |
| `server/api/school-sessions/tasks.get.ts` | Bestaat niet. | **NIEUW** — hergebruikt `getTasksWithSessionOnDate` (Task 1) |
| `server/api/school-sessions.post.ts` | Bestaat niet. | **NIEUW** — hergebruikt `getSessionForTask` + `replanAfterSession` per regel (Task 2) |
| `app/pages/schoolsessies.vue` | Bestaat niet. | **NIEUW** — verzamelscherm (Task 3) |
| `app/components/HamburgerMenu.vue` | `ITEMS`-array met 3 links + Story 1.5's aparte uitlog-`<a>`. | **UPDATE** — vierde `ITEMS`-entry (Task 4) |
| `server/domain/scheduling/replan.ts` | `replanAfterSession` — de kernfunctie, al volledig gebouwd (Story 4.7). | **NIET AANRAKEN** — alleen importeren en aanroepen |
| `server/data/tasks.ts` | `getSessionForTask`, `getTasksWithSessionOnDate` — beide al gebouwd. | **NIET AANRAKEN** — alleen importeren |

### Wat expliciet buiten scope valt

- **Geen nieuwe-taak-aanmaak vanuit dit scherm.** Dat is Story 7.2 — deze story gaat uitsluitend over taken die al een sessie vandaag hebben. De task-select toont dus geen "nieuwe taak toevoegen"-optie; die komt in 7.2 erbij.
- **Geen resterende-tijd-invoerveld** (zie Dev Notes hierboven).
- **Geen actieve tekort-/tijdgebrek-check of -redirect** (zie Dev Notes hierboven) — consistent met de rest van het project.
- **Geen wijziging aan `replan.ts`/`recalculate.ts`/de sessies-tabel.** Deze story is een nieuwe, dunne aanroeper van bestaande domain-functies.

### Testen

Nog steeds geen testframework (`deferred-work.md`). Verificatie via typecheck, build, en een handmatige test tegen de dev-stage (`npx sst shell --stage dev -- npm run dev`, zelfde aanpak als Story 1.4/1.5) met een echte, ingelogde sessie en een taak die vandaag een geplande sessie heeft.

## Previous Story Intelligence (Story 1.5 — laatst afgeronde story, ander epic maar zelfde project-conventies)

- **`clearUserSession`/`requireUserSession`-conventies zijn stabiel** — deze story raakt de authlaag niet, maar elk nieuw endpoint gebruikt hetzelfde `requireUserSession(event).catch(() => null)` + 401-envelope-patroon dat sinds Epic 4 overal terugkomt (zie `sessions/[sessionId]/replan.post.ts` hierboven).
- **Live-verificatie vereist `npx sst shell --stage dev -- npm run dev` en een geldige AWS-sessie** (`aws sts get-caller-identity`) — zonder `--stage dev` heeft de gekozen SST-stage geen secrets (zie Story 1.4's Debug Log voor de exacte valkuil: de default persoonlijke stage heeft er geen).
- **`is401()`-patroon**: client-side foutafhandeling die een 401 naar `/inloggen` stuurt, bestaat al als gedeeld patroon (zie `TaakFormulier.vue`) — hergebruik het, verzin geen nieuwe interceptor voor dit ene scherm.

## Git Intelligence

Laatste twee commits (`156e440`, `d391756`) zijn Story 1.4/1.5 (auth/sessie-laag) — geen raakvlak met de scheduling-/taken-laag die déze story aanraakt. De meest relevante eerdere commits voor déze story zijn Epic 3 (taak-aanmaken/doelmoment) en Epic 4 (sessie doorlopen/afronden), waarvan de patronen hierboven zijn overgenomen.

## Project Structure Notes

Twee nieuwe API-routes onder een nieuwe `server/api/school-sessions/`-submap (plus één losse `school-sessions.post.ts` op hetzelfde niveau als `tasks.post.ts` — zelfde vlakke-structuur-precedent als `tasks.get.ts`/`tasks.post.ts` naast een `tasks/`-submap), één nieuwe pagina, één component-uitbreiding. Geen schemawijziging, geen migratie — hergebruikt de bestaande `Task`/`Session`/`SessionLog`-tabellen.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-7.1-Schoolsessies-verzamelscherm] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-7-Schoolsessies-Invoeren-Papieren-Agenda] — epic-context, FR29/FR30
- [Source: _bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md#UJ-9] — brontekst: schoolsessies op papier, verzamelscherm 's avonds
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-1] — scheduling-logica uitsluitend server-side, idempotente herberekening
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-3] — Task bezit Sessions; precies 1 sessie per taak (impliciet, expliciet bevestigd in `server/data/tasks.ts`)
- [Source: server/domain/scheduling/replan.ts] — `replanAfterSession`, de kernfunctie die deze story hergebruikt
- [Source: server/data/tasks.ts] — `getSessionForTask` ("precies 1 sessie per taak"), `getTasksWithSessionOnDate`
- [Source: server/api/sessions/[sessionId]/replan.post.ts] — Story 4.7's bestaande endpoint, zelfde validatie-/envelope-patroon om te spiegelen
- [Source: server/api/home/plan.get.ts] — bestaand gebruik van `getTasksWithSessionOnDate`, te spiegelen voor Task 1
- [Source: app/pages/sessie/overzicht.vue] — bestaand live-sessie-afrondscherm: `remainingHours`/`remainingMinutes` default `null`, `is401()`-patroon, `navigateTo('/')`
- [Source: app/components/TaakFormulier.vue] — `taak-session-duration-input`-veldstijl (los minutenveld, geen uren/minuten-split)
- [Source: app/components/HamburgerMenu.vue] — bestaand menu-component, `ITEMS`-array-patroon

## Review Findings

Code review 2026-08-23 (`/code-review`, forked review-sessie op de uncommitted wijzigingen). Twee bevindingen, beide **CONFIRMED** en direct gefixt.

- [x] [Review] **Alles-of-niets-batch maakte een retry na een gedeeltelijke mislukking onveilig.** De oorspronkelijke `POST /api/school-sessions` stopte de hele batch bij de eerste mislukte regel (bv. een niet-bestaande taak); een client-side retry na een fout postte dan alsnog álle regels opnieuw, inclusief al geslaagde — `replanAfterSession` heeft alleen een `task.completedAt`-idempotency-guard, geen deduplicatie voor de "nog niet klaar"-tak, dus een bestede tijd zou dubbel geteld worden. **Fix:** het endpoint verwerkt nu élke regel apart en retourneert een per-regel resultaat (`SchoolSessionResult[]`, met een client-gegenereerde `rowId` om terug te koppelen naar de juiste rij — een taak-id volstond niet omdat twee rijen toevallig dezelfde taak kunnen kiezen). De client verwijdert geslaagde rijen uit het formulier en toont per mislukte rij een eigen foutmelding, zodat een retry alleen de nog-mislukte rijen opnieuw verstuurt. Live geverifieerd met een batch van één geldige + één ongeldige regel: `row-1` slaagt, `row-2` faalt met "Taak niet gevonden.", de rest van de batch loopt gewoon door.
- [x] [Review] **`Number.isNaN`-check miste de lege-string-waarde die `v-model.number` overhoudt bij een leeggemaakt getalveld.** Vue's `.number`-modifier laat een leeggemaakt invoerveld op de rauwe string `''` staan (niet `null`/`NaN`), waardoor de oorspronkelijke validatie (`entry.actualMinutes === null || Number.isNaN(...)`) dat geval niet ving — de ongeldige payload werd naar de server gepost en pas daar met een generieke foutmelding afgewezen. **Fix:** een `isEmptyField()`-helper toegevoegd (zelfde patroon als het bestaande `app/pages/sessie/overzicht.vue`), en de validatie expliciet gemaakt (`isEmptyField(row.minutes) || !Number.isInteger(Number(row.minutes)) || Number(row.minutes) < 0`). Live gereproduceerd en bevestigd in een echte browser: taak kiezen → minuten typen → weer leegmaken → op "Opslaan" klikken geeft nu de specifieke rij-foutmelding, geen netwerkverzoek.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Live-verificatie vereiste een echte, ingelogde gebruiker met een taak+sessie vandaag** — geen testframework en geen bestaand testaccount lokaal beschikbaar. Opzet: een tijdelijke diagnostische route (`server/routes/auth/debug-seed-test-user.get.ts`, onder het publieke `/auth/`-prefix, cascade-delete + heraanmaak van een vaste testgebruiker met via het project se eigen `encryptToken()` versleutelde placeholder-Calendar-tokens) om zonder een echte Google-login een geldige sessie te krijgen, gevolgd door een echte taak aangemaakt via het **bestaande, ongewijzigde** `POST /api/tasks`-endpoint.
  - Eerste pogingen liepen tegen drie afzonderlijke, leerzame obstakels aan (alle drie omgevingsconfiguratie, geen code-bugs in deze story): (1) `npm run dev` zonder `sst shell --stage dev` geeft geen SST-links; (2) `sst shell` zonder `--stage dev` gebruikt de persoonlijke stage, die geen secrets heeft; (3) lokaal draaien mist `NUXT_TURSO_DATABASE_URL` (het `.env`-bestand heeft de kale `TURSO_DATABASE_URL`, die alleen bij een echte `sst deploy` naar de `NUXT_`-variant wordt vertaald) — pas met alle drie tegelijk goed (`sst shell --stage dev` + `.env` gesourcet + `NUXT_TURSO_DATABASE_URL` expliciet geëxporteerd) werkte de lokale server.
  - Taak-aanmaak faalde eerst op tokendecryptie (`createTask` roept ongeclausuleerd `createHomeworkEvent` → `getUserById` → decryptie aan, in tegenstelling tot `replanAfterSession` dat wél op `homeworkCalendarColorId`/`hasCalendarWriteScope` guardt) — opgelost door de testgebruiker se tokens met de echte `encryptToken()`-functie te verzegelen i.p.v. platte placeholder-strings.
  - Foreign-key-constraints bleken wél degelijk actief (in tegenstelling tot een eerste aanname) — de cascade-delete moest alle zes tabellen met een `userId`-FK opruimen (`tasks`, `availableTimePatterns`, `availableTimeExceptions`, `dismissedConflicts`, `sessionPlacementLocks`, `availabilityWriteLocks`), niet alleen `tasks`.
- **Backend end-to-end bevestigd** via curl tegen de echte dev-stage-database: `GET /api/school-sessions/tasks` toonde de testtaak; een lege `POST /api/school-sessions` gaf `400`; een echte aanroep gaf `{ok:true}`, en een directe DB-inspectie (nog een tijdelijke route, alleen-lezend) toonde een nieuwe `sessionLogs`-rij (`actualMinutes: 20`) en een `sessions`-rij met een ververste `updatedAt` — het bewijs dat `recalculateTaskPlanning` daadwerkelijk liep.
- **Frontend end-to-end bevestigd** in een echte Chrome-browser (claude-in-chrome): het `/schoolsessies`-scherm gerenderd, dropdown correct gevuld vanuit `GET /api/school-sessions/tasks`. De automatiseringstool kon een native `<select>` niet via klik+toetsenbord bedienen (bekende tooling-beperking, geen codeprobleem — bevestigd doordat `el.value` na een `change`-event via JS wél correct door Vue's `v-model` werd opgepikt); de uiteindelijke selectie + invullen + klik op de echte "Opslaan"-knop is via echte UI-interacties gedaan en resulteerde in een correcte navigatie terug naar Home met de bijgewerkte dagplanning.
- Alle tijdelijke bestanden/testdata (diagnostische routes, testgebruiker, testtaken) zijn na afloop verwijderd; `git status` ná afloop toont uitsluitend de vijf bedoelde wijzigingen/nieuwe bestanden.

### Completion Notes List

- **AC #1 (verzamelscherm met task-select + tijd-input):** `app/pages/schoolsessies.vue` toont `school-sessions-list` met minstens één rij, `school-session-task-select` (gevuld vanuit `GET /api/school-sessions/tasks`, hergebruikt `getTasksWithSessionOnDate`) en `school-session-time-input`; `school-session-add-row-button` voegt rijen toe zonder limiet. Bereikbaar via een nieuw hamburgermenu-item.
- **AC #2 (verwerken als afgeronde sessie + terugkeer naar Home):** `POST /api/school-sessions` roept per regel `getSessionForTask` + `replanAfterSession(..., null)` aan — exact dezelfde domain-functie als het bestaande live-sessie-afronden (Story 4.7), geen nieuwe scheduling-logica. Live bevestigd: sessielog + herplande sessie, en de pagina navigeert na succes naar `/`.
- **AC #3 (lege invoer doet niets):** zowel client-side (validatiemelding, geen verzending) als server-side (400 bij een lege `entries`-array) afgedwongen. Live bevestigd via curl.
- **Bewust buiten scope gehouden, zoals de Dev Notes voorschreven:** geen resterende-tijd-invoerveld, geen actieve tekort-/tijdgebrek-check of -redirect, geen nieuwe-taak-aanmaak vanuit dit scherm (dat is Story 7.2) — alle drie expliciet getoetst aan bestaande precedenten in de codebase (`sessie/overzicht.vue`, `TaakFormulier.vue`) voordat ze werden weggelaten, niet zomaar aangenomen.

### File List

**Nieuw:**
- `server/api/school-sessions/tasks.get.ts`
- `server/api/school-sessions.post.ts` (na code review: per-regel resultaat i.p.v. alles-of-niets)
- `app/pages/schoolsessies.vue` (na code review: `rowId`-correlatie, `isEmptyField`-validatie, per-rij foutafhandeling)

**Gewijzigd:**
- `shared/types/tasks.d.ts` (`SchoolSessionTaskOption`/`SchoolSessionTasksResponse`/`SchoolSessionEntry`/`SchoolSessionResult`/`SchoolSessionsInput`/`SchoolSessionsResponse`)
- `app/components/HamburgerMenu.vue` (vierde `ITEMS`-entry: "Schoolsessies invoeren")

**Niet gewijzigd:** `server/domain/scheduling/replan.ts`, `server/domain/scheduling/recalculate.ts`, `server/data/tasks.ts`, `server/api/sessions/[sessionId]/replan.post.ts`, `server/api/home/plan.get.ts` (alle vier uitsluitend geïmporteerd/gespiegeld, niet aangepast)

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-23 | Story aangemaakt via create-story, na afronding van Epic 1 (Stories 1.1-1.5, alle `done`, gedeployed naar flowz.fyi). |
| 2026-08-23 | Tasks 1-5 geïmplementeerd en volledig end-to-end geverifieerd tegen de dev-stage (backend via curl + DB-inspectie, frontend via een echte Chrome-browsersessie). Typecheck/build schoon. Status → review. |
| 2026-08-23 | Code review: 2 bevindingen (alles-of-niets-batch onveilig bij een retry; `Number.isNaN` miste een leeggemaakt getalveld), beide gefixt (`school-sessions.post.ts` per-regel resultaten, `schoolsessies.vue` `isEmptyField`-validatie). Typecheck/build schoon; beide fixes live gereproduceerd en bevestigd tegen de dev-stage. Status blijft `review`. |
