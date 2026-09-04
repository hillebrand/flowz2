---
baseline_commit: c5c7d1e
---

# Story 2.5: Samenvattende Huiswerk-Blokken per Dag

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want dat Flowz niet voor elke taak apart een blokje in mijn agenda zet, maar één samenvattend "Huiswerk"-blok per aaneengesloten stuk vrije tijd op een dag,
so that mijn agenda overzichtelijk blijft in plaats van vol te staan met losse taakblokjes.

## Acceptance Criteria

1. **Given** een huiswerk-kleur is ingesteld (Story 2.3) en meerdere sessies staan op dezelfde datum gepland, zonder een bezet agenda-item ertussen, **when** de planning voor die datum verandert (taak aangemaakt/herpland/verwijderd/afgerond), **then** wordt niet langer per sessie een los Calendar-event geschreven, maar wordt `syncHomeworkBlocksForDate(userId, datum)` aangeroepen die de complete set Calendar-blokken voor die datum herberekent, **and** worden die sessies samengevoegd tot één Calendar-event getiteld "Huiswerk" (niet meer per vak/taak), van start eerste sessie tot einde laatste sessie, in de gekozen huiswerk-kleur.
2. **Given** twee of meer sessies op dezelfde datum met een bezet agenda-item ertussen (bv. een "Avondeten"-afspraak — zelfde vrij/bezet-logica als Story 2.4's `isBlockingEvent`), **when** blokken herberekend worden, **then** ontstaan er meerdere aparte Calendar-events, één per aaneengesloten stuk sessies, nooit één blok dat over een bezet agenda-item heen loopt.
3. **Given** de sessie-samenstelling voor een datum wijzigt (sessie verschoven naar/van die datum, taak verwijderd/afgerond, nieuwe taak toegevoegd), **when** `syncHomeworkBlocksForDate` opnieuw draait voor de betrokken datum/datums, **then** worden overbodige blokken (Calendar-event + rij) verwijderd, gewijzigde blokken bijgewerkt en nieuwe blokken aangemaakt — idempotent, nooit duplicaten, vanuit de actuele staat herberekend (AD-1), **and** is een nieuwe tabel `homeworkCalendarBlocks` (userId, datum, starttijd, eindtijd, googleEventId) de bron van waarheid per dag-blok — `sessions.googleEventId` vervalt.
4. **Given** geen huiswerk-kleur ingesteld of geen Calendar write-scope, **when** `syncHomeworkBlocksForDate` wordt aangeroepen, **then** gebeurt er niets (zelfde no-op-precedent als Story 2.3's AC #4).

## Tasks / Subtasks

- [x] Task 1: Schema — nieuwe tabellen, `sessions.googleEventId` vervalt (AC: #3)
  - [x] `server/data/schema.ts`: nieuwe tabel `homeworkCalendarBlocks` (`id`, `userId` FK, `date` text YYYY-MM-DD, `startsAt` text, `endsAt` text, `googleEventId` text not null, `createdAt`, `updatedAt`) — géén unique-index op (userId, date): één datum kan meerdere blok-rijen hebben (AC #2).
  - [x] Nieuwe tabel `homeworkBlockSyncLocks` (`id`, `userId` FK, `date` text, `createdAt`) met `uniqueIndex('homework_block_sync_locks_user_date_unique').on(userId, date)` — zelfde lock-patroon als `sessionPlacementLocks`/`availabilityWriteLocks`/`taskEditLocks` (project se bewezen TOCTOU-fix, zie die drie tabellen se commentaar in schema.ts). Eigen tabel, geen hergebruik van een bestaande lock (andere resource, zelfde "geen onnodige kruisblokkering"-redenering).
  - [x] `sessions.googleEventId`-kolom verwijderen.
  - [x] Migratie: `npx sst shell --stage dev -- npx drizzle-kit generate` gevolgd door `npx sst shell --stage dev -- npx drizzle-kit migrate`. **Nooit `push`.** — `0018_silent_beyonder.sql` gegenereerd (2 nieuwe tabellen + `ALTER TABLE sessions DROP COLUMN google_event_id`) en live toegepast op de dev-database.

- [x] Task 2: `server/domain/calendar-sync/homework-events.ts` — vereenvoudigen tot generieke event-CRUD (AC: #1)
  - [x] `HomeworkSession`-interface vervangen door een generieker `CalendarBlockEvent { title: string, startsAt: string, endsAt: string }` (geen `sessionId`/`subject` meer — een blok is niet meer aan één taak gekoppeld).
  - [x] `toEventResource` gebruikt voortaan `event.title` rechtstreeks als `summary` (geen "Huiswerk: {vak} — {titel}"-template meer — de titel "Huiswerk" wordt straks door de aanroeper (Task 3) meegegeven, niet hier hardcoded, zodat dit bestand een neutrale, herbruikbare Calendar-CRUD-laag blijft).
  - [x] `createHomeworkEvent`/`updateHomeworkEvent`/`deleteHomeworkEvent`'s signaturen passen mee (nemen `CalendarBlockEvent` i.p.v. `HomeworkSession`). Zelf-bewakend-op-kleur/write-scope-gedrag, 401-ververs-patroon, `status:'confirmed'`-tombstone-herstel (AC #3 uit Story 2.3, ongewijzigd) — **niets van deze mechaniek verandert**, alleen de invoervorm.
  - [x] **Niet aanraken:** de losse `calendarRequestMetVerversing`-kopie in dit bestand blijft zoals-ie is (project se geaccepteerde duplicatie-precedent).

- [x] Task 3: Nieuw `server/domain/calendar-sync/homework-blocks.ts` — de kernlogica (AC: #1, #2, #3, #4)
  - [x] Nieuwe data-laagfuncties toegevoegd in een nieuw `server/data/homework-blocks.ts` (niet in `tasks.ts` — zelfde precedent als `dismissed-conflicts.ts`, een eigen, op zichzelf staand datamodel-concept): `getHomeworkBlocksForDate`, `insertHomeworkBlock`, `updateHomeworkBlockTimes`, `deleteHomeworkBlock`, plus `acquireHomeworkBlockSyncLock`/`releaseHomeworkBlockSyncLock` (zelfde lock-implementatie als `acquireSessionPlacementLock`/`releaseSessionPlacementLock`, bewust gedupliceerd i.p.v. gedeeld).
  - [x] `export async function syncHomeworkBlocksForDate(userId: string, date: string): Promise<void>`:
    1. Lock verkrijgen op (userId, date) (`homeworkBlockSyncLocks`) — zelfde reden als de bestaande locks: twee gelijktijdige herberekeningen die dezelfde datum raken (bv. twee taken op dezelfde dag, kort na elkaar herpland) mogen elkaars blok-berekening niet overschrijven.
    2. Gebruiker ophalen; `homeworkCalendarColorId === null || !hasCalendarWriteScope` → **no-op, lock vrijgeven, return** (AC #4, zelfde zelf-bewakend-precedent als de oude `createHomeworkEvent`).
    3. Open sessies voor die datum ophalen — hergebruik **`getTasksWithSessionOnDate(userId, date)`** (bestaat al, `server/data/tasks.ts`, filtert al op `isNull(completedAt)`/`isNull(droppedAt)` — exact "sessies die nog een blok verdienen"). Leeg → alle bestaande blok-rijen/Calendar-events voor deze datum verwijderen (ga naar stap 6 met een lege computed-lijst) en stoppen.
    4. Bezette agenda-items voor die datum ophalen: `getTodayEvents(userId, date)` (`server/domain/calendar-sync/day-events.ts` — ondanks de naam werkt die voor elke datum, niet alleen "vandaag"). `null` (Calendar-leesfout) → **fail-safe: behandel als "geen bezette items bekend"**, dus alle sessies vormen dan tijdelijk één groot blok (degradeert naar het oude, pre-Story-2.5-gedrag i.p.v. de sync helemaal over te slaan — een leesfout mag de schrijfkant niet blokkeren). Filter de wél-opgehaalde events op `isBlockingEvent` (Story 2.5-vervolg op Story 2.4/de vrij-bezet-fix) **en** sluit events met de eigen huiswerk-kleur uit (`event.colorId !== String(user.homeworkCalendarColorId)`) — anders blokkeert een net ge-sync't eigen blok zichzelf bij de eerstvolgende herberekening.
    5. **Groeperen:** sorteer de sessies op `startsAt`. Loop door in volgorde; voor elk paar opeenvolgende sessies, bepaal het gat-interval `[eind vorige sessie, start huidige sessie]`. Overlapt dat gat met minstens één overgebleven bezet event (hergebruik `overlapInterval`/`toInstant` uit `server/domain/calendar-sync/actual-availability.ts`, al geëxporteerd) → sluit het huidige blok af en begin een nieuw blok bij de huidige sessie. Anders blijft de sessie in hetzelfde blok. Resultaat: een lijst `{ startsAt: eerste sessie se startsAt, endsAt: laatste sessie se (startsAt + plannedMinutes) }[]`, chronologisch.
    6. **Diffen tegen bestaande rijen:** haal de huidige `homeworkCalendarBlocks`-rijen voor (userId, date) op (gesorteerd op `startsAt`). Loop `i` van 0 tot `max(bestaand.length, berekend.length)`: beide aanwezig → tijden gewijzigd? `updateHomeworkEvent` (Task 2) + rij bijwerken; alleen berekend aanwezig → `createHomeworkEvent(userId, { title: 'Huiswerk', startsAt, endsAt })` + nieuwe rij; alleen bestaand aanwezig → `deleteHomeworkEvent` + rij verwijderen. **Altijd schrijven bij "beide aanwezig", geen wijzigingsdetectie-optimalisatie** — consistent met hoe dit project overal elders (bv. `recalculateTaskPlanning`) al werkt, geen nieuw patroon verzinnen.
    7. Lock vrijgeven (`try`/`finally`, ook bij een fout in stap 3-6).
  - [x] **Titel altijd exact `"Huiswerk"`** (AC #1) — geen vak/taaknaam meer, want een blok kan meerdere taken dekken.

- [x] Task 4: De 7 bestaande aanroeppunten ombouwen (AC: #1, #2, #3) — zie Dev Notes "Call-site-tabel" voor de exacte oude/nieuwe code per bestand. Samengevat: elk bestand roept voortaan `syncHomeworkBlocksForDate(userId, datum)` aan (voor de betrokken datum, of twee datums bij een verschoven sessie) i.p.v. zelf `createHomeworkEvent`/`updateHomeworkEvent`/`deleteHomeworkEvent` te orkestreren, en geeft geen `googleEventId` meer door aan `updateSessionPlacement`/`placeSessionWithStackingOffset`.
  - [x] `server/domain/tasks/create-task.ts` — géén rollback meer bij een sync-fout (bewuste gedragswijziging, zie Dev Notes), compenserende opruim-try/catch volledig vervallen.
  - [x] `server/domain/tasks/delete-task.ts` — volgorde gedraaid: eerst DB-delete, dan sync.
  - [x] `server/domain/scheduling/apply-recommendation.ts` (`applyInkorten`, `applyVervallen` — `applyHerplannen` raakt dit via `session-placement.ts`)
  - [x] `server/domain/scheduling/session-placement.ts` (`placeSessionOnDate`) — twee datums (oud + nieuw)
  - [x] `server/domain/scheduling/replan.ts` (`replanAfterSession`'s "resterende tijd 0"-tak)
  - [x] `server/domain/scheduling/energy.ts` (`applyEnergyProposal`'s `shortened`-lus)
  - [x] `server/domain/scheduling/recalculate.ts` (`recalculateTaskPlanning`) — twee datums (oude sessiedatum vóór de move + nieuwe `sessionDate`, alleen als verschillend)

- [x] Task 5: Opruimen van nu-dode code + `googleEventId`-parameter-doorgifte (AC: #3)
  - [x] `server/data/tasks.ts`: `updateSessionPlacement`'s `input`-type verloor `googleEventId`; `placeSessionWithStackingOffset`'s `googleEventId`-parameter vervallen (alle aanroepen aangepast); `clearSessionGoogleEventId` verwijderd, samen met zijn twee aanroepers.
  - [x] `server/api/home/plan.get.ts`: self-overlap-uitsluiting nu kleur-gebaseerd (`getUserById` toegevoegd aan de Promise.all, filter op `homeworkCalendarColorId`), consistent met `conflict-detection.ts`.

- [x] Task 6: Verificatie
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] **Live verificatie tegen een echt account**: bevestigd met meerdere taken op dezelfde dag zonder tussenliggend bezet item → één Calendar-event "Huiswerk" (14:10–17:00). Een testafspraak "Avondeten" tussen twee sessietijden geplaatst → na eerstvolgende herberekening ontstonden twee aparte "Huiswerk"-events (gesplitst rond het bezette item), bevestigd in zowel de Google Calendar-UI als rechtstreeks in `homework_calendar_blocks`. Alle open taken van de dag afgerond via het schoolsessies-scherm → `homework_calendar_blocks` voor die datum werd leeg (het/de blok(ken) volledig verwijderd) — bevestigt de krimp/verwijder-tak. De "verplaats naar andere dag"-tak (`recalculate.ts`) roept exact dezelfde, hierboven bewezen `syncHomeworkBlocksForDate` aan voor twee datums en is niet apart end-to-end doorlopen, maar deelt het volledig geteste mechanisme.
  - [x] Geen secrets/placeholder-waarden in code/commits; tijdelijk debug-script (`_debug_check.mjs`, projectroot) na elk gebruik verwijderd — laatste keer geverifieerd via `rm` na de afsluitende blokken-check.

## Dev Notes

### Waarom dit zoveel bestanden raakt — lees dit eerst

De huidige write-sync (Story 2.3) is per-sessie: elk van de 7 onderstaande bestanden
orkestreert zelf create/update/delete op één Calendar-event, gekoppeld aan
`sessions.googleEventId`. Deze story maakt daar één datum-brede, idempotente
herberekening van (`syncHomeworkBlocksForDate`) — vergelijkbaar met hoe
`recalculateTaskPlanning` al een hele taak herberekent i.p.v. losse velden bij te
werken. **Belangrijke geruststelling:** `recalculateTaskPlanning` zelf wordt maar op
één plek aangepast (`recalculate.ts`) — de vijf bestanden die het intern al aanroepen
(`reopen.post.ts`, `resolve-conflict.post.ts`, `update-task.ts`,
`session-heartbeat-fallback.ts`, en `replan.ts`'s eigen niet-0-tak) hoeven **niet**
aangeraakt te worden, ze profiteren automatisch mee.

### Call-site-tabel (oud → nieuw, exact per bestand)

**1. `server/domain/tasks/create-task.ts`** — ná `createTaskAndSession`:
- Oud: `createHomeworkEvent(userId, {sessionId, subject, title, startsAt, endsAt})` → bij succes `updateSessionPlacement(..., googleEventId)`; bij een fout ergens in dit blok: hele taak+sessie weer verwijderen (`deleteTaskAndSession`).
- Nieuw: gewoon `await syncHomeworkBlocksForDate(userId, session.startsAt.slice(0, 10))` ná de transactie, in een `try`. **Gedragswijziging, bewust:** géén rollback meer van de taak bij een sync-fout — een mislukte Calendar-sync is nu een gedeelde-datum-operatie (kan door een ándere taak op dezelfde dag komen), dus de nieuwe taak zelf terugdraaien zou onterecht zijn. Log de fout, laat de taak staan — zelfde "self-healing bij de eerstvolgende herberekening"-precedent dat `recalculate.ts` al kende. Dit vereenvoudigt dit bestand aanzienlijk (de hele compenserende-opruim-try/catch-blok vervalt).

**2. `server/domain/tasks/delete-task.ts`** — volgorde draait om:
- Oud: eerst `deleteHomeworkEvent`, dán `deleteTaskAndSession`.
- Nieuw: eerst `deleteTaskAndSession` (zodat de taak al weg is uit de DB), dán `syncHomeworkBlocksForDate(task.userId, session.startsAt.slice(0,10))` in een `try`/`catch` die alleen logt (zelfde "een falende Calendar-aanroep mag een bevestigde lokale verwijdering niet blokkeren"-precedent dat hier al stond).

**3. `server/domain/scheduling/apply-recommendation.ts`**:
- `applyInkorten`: ná `updateSessionPlacement` (zonder `googleEventId` meer in de input), `await syncHomeworkBlocksForDate(userId, existingSession.startsAt.slice(0,10))` i.p.v. de huidige `if (existingSession.googleEventId) updateHomeworkEvent(...)`.
- `applyVervallen`: ná `dropTask(taskId)`, `await syncHomeworkBlocksForDate(userId, existingSession.startsAt.slice(0,10))` (als `existingSession` bestond) i.p.v. `deleteHomeworkEvent`+`clearSessionGoogleEventId`.
- `applyHerplannen`: **geen wijziging hier** — gaat via `placeSessionOnDate` (zie #4).

**4. `server/domain/scheduling/session-placement.ts`** (`placeSessionOnDate`, gedeeld door `applyHerplannen` en `energy.ts`'s relocated/pulledForward):
- Bewaar `const oudeDatum = session.startsAt.slice(0, 10)` **vóór** `updateSessionPlacement`.
- Ná de plaatsing: `await syncHomeworkBlocksForDate(userId, targetDate)`; en als `oudeDatum !== targetDate`: ook `await syncHomeworkBlocksForDate(userId, oudeDatum)`.
- De hele huidige `if (session.googleEventId) updateHomeworkEvent(...) else createHomeworkEvent(...)`-tak vervalt.

**5. `server/domain/scheduling/replan.ts`** (`replanAfterSession`, alleen de `remainingTotalMinutes === 0`-tak):
- Oud: `if (session.googleEventId) { deleteHomeworkEvent(...); clearSessionGoogleEventId(...) }`, dan `logSessionAndCompleteTask`.
- Nieuw: `logSessionAndCompleteTask` eerst (taak is dan `completedAt`-gezet, telt niet meer mee in `getTasksWithSessionOnDate`), dán `await syncHomeworkBlocksForDate(task.userId, session.startsAt.slice(0,10))`.

**6. `server/domain/scheduling/energy.ts`** (`applyEnergyProposal`, alleen de `shortened`-lus — `relocated`/`pulledForward` gaan al via #4):
- Zelfde patroon als `applyInkorten` hierboven: ná `updateSessionPlacement`, `await syncHomeworkBlocksForDate(userId, session.startsAt.slice(0,10))` i.p.v. de huidige `if (session.googleEventId) updateHomeworkEvent(...)`.

**7. `server/domain/scheduling/recalculate.ts`** (`recalculateTaskPlanning`):
- Bewaar `const oudeDatum = existingSession.startsAt.slice(0, 10)` **vóór** `placeSessionWithStackingOffset`.
- Ná de plaatsing (`startsAt` is de nieuwe datum/tijd): `await syncHomeworkBlocksForDate(task.userId, startsAt.slice(0,10))`; en als die datum afwijkt van `oudeDatum`: ook `await syncHomeworkBlocksForDate(task.userId, oudeDatum)`.
- De hele huidige `if (existingSession.googleEventId) updateHomeworkEvent(...) else createHomeworkEvent(...)` self-healing-tak (incl. de compenserende opruim-try/catch bij een mislukte `updateSessionPlacement`) vervalt volledig — `syncHomeworkBlocksForDate` is zelf al idempotent/self-healing.

### Groeperingsalgoritme — een concreet voorbeeld

Sessies op 2026-09-01: Wiskunde 16:00-16:30, Engels 16:30-16:50, Geschiedenis
19:00-19:45. Bezet agenda-item: "Avondeten" 18:00-18:30.
- Gat Wiskunde→Engels (16:30-16:30, leeg) — geen overlap met Avondeten → zelfde blok.
- Gat Engels→Geschiedenis (16:50-19:00) — overlapt met Avondeten (18:00-18:30) →
  nieuw blok.
- Resultaat: blok 1 = 16:00-16:50 ("Huiswerk"), blok 2 = 19:00-19:45 ("Huiswerk").

### Wat expliciet buiten scope valt

- **Geen wijziging aan de scheduling-engine zelf** (doelmoment, volgorde, welke dag een
  sessie krijgt) — uitsluitend de Calendar-schrijflaag verandert.
- **Geen per-blok-titel-aanpassing** (bv. vakken opsommen) — AC #1 vraagt letterlijk
  een generieke titel "Huiswerk".
- **Geen wijziging aan de lees-kant** (Story 2.4's multi-agenda-lezen,
  `isBlockingEvent`/vrij-bezet) — deze story hergebruikt die alleen.
- **Geen conflict-detectie-wijziging** (`conflict-detection.ts`'s kleur-uitsluiting
  blijft ongewijzigd werken — die was al kleur-gebaseerd, niet event-id-gebaseerd).

### Testen

Nog steeds geen testframework — live verificatie tegen een echt account blijft de enige
manier om het groeperingsgedrag te bevestigen (zie Task 6). Overweeg, gegeven de
omvang van deze story, een tijdelijk testscript dat de groeperingsfunctie (stap 5 in
Task 3) in isolatie aanroept met verzonnen sessie-/event-tijden, vóór de volledige
live-Calendar-integratie getest wordt — scheelt een hoop live-round-trips tijdens het
debuggen. Ruim zo'n script na gebruik op, net als elke andere tijdelijke test-infra in
dit project.

### Architectuurcompliance

- **AD-1** (idempotente herberekening): `syncHomeworkBlocksForDate` gaat bij elke
  aanroep uit van de actuele DB-staat (`getTasksWithSessionOnDate`) en actuele
  Calendar-staat, nooit van een tussentijds opgeslagen aanname — exact deze regel.
- **AD-4/AD-7**: blijft synchroon binnen het request-pad, geen achtergrondtaak. Alleen
  de granulariteit verandert (zie de bijgewerkte AD-7-tekst in de architectuurspine).
- **Mutatie-ownership**: `syncHomeworkBlocksForDate` leeft in `server/domain/`, nooit
  rechtstreeks vanuit een `server/api/`-route aangeroepen (geen enkele route roept 'm
  trouwens rechtstreeks aan — alleen domain-functies doen dat).

## Previous Story Intelligence (Story 2.4, Correct Course-precedent)

- **Live-verificatie is bij calendar-sync-stories altijd de echte afsluiter** — Story
  2.3/2.4 vonden allebei pas tijdens live-tests foute aannames (Google's tombstone-200
  i.p.v. 404, `calendarList`-veldgedrag). Neem ook hier niets aan over hoe meerdere
  snel-op-elkaar-volgende Calendar-writes voor dezelfde datum zich gedragen zonder het
  te bevestigen.
- **Deploy-regio expliciet zetten** (`AWS_REGION=eu-west-1 AWS_DEFAULT_REGION=eu-west-1`
  vóór `npx sst deploy --stage dev`, ná `unset AWS_PROFILE` + credentials exporteren) —
  Story 2.4's sessie liep hier eerder tegen een verkeerde-regio-incident aan.

## Project Structure Notes

- Nieuw: `server/domain/calendar-sync/homework-blocks.ts`, mogelijk `server/data/homework-blocks.ts` (dev-agent se keuze, zie Task 3).
- Gewijzigd: `server/data/schema.ts` (2 nieuwe tabellen, `sessions.googleEventId` vervalt), `server/data/tasks.ts` (nieuwe blok-data-functies, `updateSessionPlacement`/`placeSessionWithStackingOffset` verliezen hun `googleEventId`-parameter, `clearSessionGoogleEventId` verwijderd), `server/domain/calendar-sync/homework-events.ts` (vereenvoudigd), en de 7 call-site-bestanden uit de tabel hierboven, plus `server/api/home/plan.get.ts` (self-exclusion op kleur i.p.v. event-id).
- Migratie: nieuwe Drizzle-migratie voor de schemawijzigingen.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.5] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-26-huiswerk-blokken.md] — volledige Correct Course-analyse en rationale
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-7] — bijgewerkte write-sync-regel
- [Source: server/domain/calendar-sync/homework-events.ts] — huidige per-sessie write-sync (Story 2.3), te vereenvoudigen
- [Source: server/domain/calendar-sync/actual-availability.ts] — `isBlockingEvent`/`overlapInterval`/`toInstant`, te hergebruiken voor het groeperingsalgoritme
- [Source: server/domain/calendar-sync/day-events.ts] — `getTodayEvents`, werkt voor elke datum
- [Source: server/data/tasks.ts] — `getTasksWithSessionOnDate`, `updateSessionPlacement`, `placeSessionWithStackingOffset`, `acquireSessionPlacementLock`-patroon (te spiegelen voor het nieuwe lock)
- [Source: server/domain/scheduling/recalculate.ts, session-placement.ts, replan.ts, energy.ts, apply-recommendation.ts, server/domain/tasks/create-task.ts, delete-task.ts] — alle 7 huidige call sites, exacte huidige code
- [Source: server/api/home/plan.get.ts] — self-exclusion-logica die op kleur moet overgaan
- [Source: _bmad-output/implementation-artifacts/2-3-huiswerk-kleur-kiezen-calendar-write-sync-service.md] — origineel write-sync-ontwerp, token-refresh-patroon, tombstone-herstel-precedent

## Open Questions

Geen blokkerende — alle architecturale keuzes (nieuwe `homeworkCalendarBlocks`-tabel i.p.v. sessie-gebonden event-id, generieke titel "Huiswerk", vrij/bezet-gebaseerde groepering zonder vast tijdstip, geen rollback meer bij een sync-fout in `create-task.ts`) zijn via de Correct Course-workflow met Hillebrand al vastgelegd (zie het sprint-change-proposal-document). Eén implementatiedetail is bewust aan de dev-agent gelaten: of de nieuwe blok-data-functies in `server/data/tasks.ts` of een nieuw `server/data/homework-blocks.ts` komen — beide zijn verdedigbaar.

## Review Findings

### Code review 2026-08-26 (gecombineerde review over Stories 2.4/2.5/7.1/7.2, `/code-review`)

- [x] [Review][Defer] **Migratie `0018_silent_beyonder.sql` liet `sessions.google_event_id` vallen zonder opruimstap voor bestaande niet-null-waarden — al live toegepast op de dev-database.** Elke sessie die vóór deze story een écht per-sessie Calendar-event had (Story 2.3-stijl, titel "Huiswerk: {vak} — {titel}") is nu permanent losgekoppeld: Flowz kan dat event niet meer vinden, bijwerken of verwijderen (de kolom is weg), en `syncHomeworkBlocksForDate` maakt gewoon nieuwe "Huiswerk"-dagblokken aan naast het verweesde event. **Besluit (Hillebrand, 2026-08-26):** zelf de Google-agenda nalopen op oude, per-vak-getitelde "Huiswerk: ..."-events uit de Story-2.3-periode en die handmatig verwijderen — de DB kan de ids niet meer teruggeven, dus dit kan niet geautomatiseerd. — deferred, actie ligt bij Hillebrand buiten de code. [server/data/migrations/0018_silent_beyonder.sql]
- [x] [Review][Patch] **Inconsistente foutafhandeling rond `syncHomeworkBlocksForDate` tussen de 7 aanroeppunten.** Fix toegepast: alle 3 resterende aanroepen (`apply-recommendation.ts`'s `applyInkorten`/`applyVervallen`, `session-placement.ts`'s beide aanroepen, `energy.ts`'s `shortened`-lus) nu in dezelfde `try`/`catch`+log-wrap als de andere 4. `create-task.ts`, `delete-task.ts`, `recalculate.ts` en `replan.ts` vangen de aanroep in een `try`/`catch` (loggen-en-doorgaan); `apply-recommendation.ts` (`applyInkorten`/`applyVervallen`), `session-placement.ts` en `energy.ts` roepen 'm ongewrapt aan. `acquireHomeworkBlockSyncLock` gooit expliciet een fout bij een 10s-lock-timeout, en elke Calendar-aanroep binnenin kan ook falen — bij die 3 aanroeppunten leidt dat tot een onverwachte 500 op een al-succesvol doorgevoerde wijziging (tekort-aanbeveling accepteren, energie-voorstel bevestigen, sessie verplaatsen). In `session-placement.ts` voorkomt een fout op de eerste `syncHomeworkBlocksForDate(targetDate)`-aanroep bovendien dat de tweede aanroep voor `oudeDatum` ooit draait, waardoor het oude-datum-blok stil blijft hangen. **Fix:** dezelfde `try { await syncHomeworkBlocksForDate(...) } catch (fout) { console.error(...) }`-wrap toevoegen aan alle 3 resterende aanroepen, consistent met de andere 4. [server/domain/scheduling/apply-recommendation.ts:94,107] [server/domain/scheduling/session-placement.ts:23,25] [server/domain/scheduling/energy.ts:335]
- [x] [Review][Patch] **Positionele (index-gebaseerde) matching in `syncHomeworkBlocksForDate`'s diff-lus koppelt `computedBlocks[i]` aan `existingBlocks[i]` puur op arrayindex.** Fix toegepast: nieuwe `matchBlocks()`-functie koppelt op dichtstbijzijnde starttijd (greedy, order-agnostisch) i.p.v. pure index. Wanneer het aantal/de volgorde van blokken voor een datum wijzigt tussen twee herberekeningen (bv. een ochtendblok verdwijnt terwijl een middagblok blijft bestaan), kan een blijvend blok aan de verkeerde index gekoppeld worden — het bestaande event/rij wordt dan naar de verkeerde tijd "bijgewerkt" i.p.v. met rust gelaten, en het echte overblijvende blok krijgt een overbodige delete+create. Convergeert uiteindelijk naar de juiste eindstaat, maar kost onnodige Calendar-writes en is een latent risico als een write halverwege faalt (zie volgende bevinding). Fix: matchen op dichtstbijzijnde starttijd i.p.v. pure index, of expliciet blok-ordinaal bijhouden. [server/domain/calendar-sync/homework-blocks.ts:97-114]
- [x] [Review][Patch] **Geen foutafhandeling binnen de `for`-lus van `syncHomeworkBlocksForDate`.** Fix toegepast: elk blok-paar wordt nu los in een `try`/`catch` verwerkt (loggen-en-doorgaan), zodat één mislukte Calendar-aanroep de rest van de reconciliatie niet meer blokkeert. Als één `createHomeworkEvent`/`updateHomeworkEvent`/`deleteHomeworkEvent`- of DB-aanroep halverwege faalt, stopt de hele lus (de `finally` geeft alleen de lock vrij) — resterende, nog niet verwerkte blokken voor die datum blijven uit sync tot een latere, ongerelateerde wijziging toevallig opnieuw een sync voor die datum triggert. Fix: per index vangen-en-doorgaan (loggen, volgende rij) i.p.v. de hele reconciliatie af te breken op de eerste fout. [server/domain/calendar-sync/homework-blocks.ts:98-114]
- [x] [Review][Patch] **Stale commentaar in `session-heartbeat-fallback.ts:46`** claimt dat `updateSessionPlacement` `googleEventId` zet — dat veld is door deze story uit `updateSessionPlacement`'s inputtype verwijderd. Puur documentatie, geen gedragsimpact. [server/domain/scheduling/session-heartbeat-fallback.ts:46]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Diagnose: eerste testtaak leverde geen zichtbaar "Huiswerk"-blok op. Tijdelijk `_debug_check.mjs` (projectroot, via `npx sst shell --stage dev -- node _debug_check.mjs`) toonde dat het ingelogde Google-account (`6cce9875-21a7-4430-9f5d-2eb5d5ec1a7e`) wél een huiswerkkleur had, maar `has_calendar_write_scope: 0` — een vooraf bestaande OAuth-staat-hiaat (write-scope-consent nooit afgerond voor dit account), geen bug in deze story. Opgelost door de gebruiker zelf de re-consent-flow op `/auth/google?scope=write` te laten afronden; daarna bevestigd `has_calendar_write_scope: 1`.
- Lambda-log-groepnaam bleek gewijzigd t.o.v. eerdere sessies (`...-rovadetn` → `...-zkwkudtr`); ontdekt via `aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/flowz-dev"`.

### Completion Notes List

- Kernmechanisme (per-sessie Calendar-writes → per-datum `syncHomeworkBlocksForDate`) volledig geïmplementeerd: schema (2 nieuwe tabellen, `sessions.googleEventId` vervallen), vereenvoudigde generieke event-CRUD, nieuwe groeperings-/diff-logica met lock, en alle 7 bestaande aanroeppunten omgebouwd. `recalculateTaskPlanning`'s vijf indirecte aanroepers hoefden niet aangepast te worden (bevestigd, zie Dev Notes).
- Live geverifieerd tegen het echte dev-account: consolidatie van meerdere sessies tot één blok, splitsing rond een bezet agenda-item ("Avondeten"), en volledige blok-verwijdering na afronden van alle openstaande taken op een datum. De "verplaats naar andere dag"-tak deelt hetzelfde, hierboven bewezen mechanisme.
- `npm run typecheck` en `npx nuxt build` slaagden zonder fouten op de eerste poging na afronding van alle 7 call sites + schema + opruiming — geen TypeScript-issues onderweg.
- Bewuste gedragswijziging (per Correct Course-afspraak): `create-task.ts` doet geen rollback meer van de taak bij een mislukte Calendar-sync — een gedeelde-datum-operatie terugdraaien zou onterecht zijn; self-healing bij de eerstvolgende herberekening, zelfde precedent als `recalculate.ts`.

### File List

- `server/data/schema.ts` (gewijzigd — nieuwe tabellen `homeworkCalendarBlocks`, `homeworkBlockSyncLocks`; `sessions.googleEventId` verwijderd)
- `server/data/migrations/0018_silent_beyonder.sql` (nieuw)
- `server/domain/calendar-sync/homework-events.ts` (gewijzigd — vereenvoudigd tot generieke `CalendarBlockEvent`-CRUD)
- `server/data/homework-blocks.ts` (nieuw)
- `server/domain/calendar-sync/homework-blocks.ts` (nieuw — `syncHomeworkBlocksForDate`, groeperingsalgoritme)
- `server/data/tasks.ts` (gewijzigd — `updateSessionPlacement`/`placeSessionWithStackingOffset` verliezen `googleEventId`; `clearSessionGoogleEventId` verwijderd)
- `server/domain/tasks/create-task.ts` (gewijzigd)
- `server/domain/tasks/delete-task.ts` (gewijzigd)
- `server/domain/scheduling/apply-recommendation.ts` (gewijzigd)
- `server/domain/scheduling/session-placement.ts` (gewijzigd)
- `server/domain/scheduling/replan.ts` (gewijzigd)
- `server/domain/scheduling/energy.ts` (gewijzigd)
- `server/domain/scheduling/recalculate.ts` (gewijzigd)
- `server/api/home/plan.get.ts` (gewijzigd — self-exclusion op kleur i.p.v. event-id)

## Change Log

- 2026-08-26: Implementatie voltooid — per-sessie Calendar-write-sync vervangen door per-datum samenvattende "Huiswerk"-blokken (`syncHomeworkBlocksForDate`), incl. splitsing rond bezette agenda-items. Alle 7 call sites omgebouwd, schema gemigreerd (`0018_silent_beyonder.sql`), live geverifieerd tegen het dev-account. Status → review.
- 2026-09-04 (verzoek Hillebrand): blok-titel is niet meer de vaste tekst "Huiswerk" — in de praktijk bevat een blok sinds deze story vrijwel altijd precies één taak (splitst al bij het eerste bezette agenda-item), dus de titel toont nu "{vak} — {titel}" van de taken in dat blok (`formatBlockTitle`, `server/domain/calendar-sync/homework-blocks.ts`); bij meerdere taken in hetzelfde blok worden ze kommagescheiden opgesomd. `groupSessionsIntoBlocks` draagt nu ook de taakgegevens per blok mee, niet meer alleen de tijdgrenzen. `typecheck`/`build` schoon, opnieuw gedeployed, live geverifieerd op de dev-stage: nieuw event kreeg de titel "TEST-titel-fix — Verwijderen na verificatie" i.p.v. "Huiswerk". Testtaak + Calendar-event opgeruimd.
