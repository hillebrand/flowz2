---
baseline_commit: 7fb4db4
---

# Story 4.7: Sessie-afronden — Fire-and-Forget Herplanning bij Verlaten

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want dat mijn planning automatisch klopt zodra ik terugga naar het hoofdscherm,
so that ik zelf niets hoef te herplannen na een sessie.

## Acceptance Criteria

1. **Given** Evelien staat op 1.4 met een (evt. aangepaste) resterende tijd, **when** ze op `wrap-back-button` klikt, **then** valideert de client de tijd-velden, vuurt een herplan-verzoek af (`POST /api/sessions/{sessionId}/replan`) zonder op de response te wachten (fire-and-forget), en navigeert direct naar 1.1-Home (FR8, UX-DR9).
2. **And** roept de server-side herplanning Epic 3's idempotente scheduling-engine aan, en — indien een huiswerk-kleur is ingesteld — Epic 2's Calendar-sync-service voor elke verschoven/nieuwe sessie.
3. **And** komt Evelien op een hoofdscherm met de al-bijgewerkte planning (geen aparte ververs-actie nodig).

## Belangrijk: dit is het eerste story sinds 4.1 met een echte architectuurbeslissing die niet al ergens vastligt — lees dit vóór je begint

**De epics/UX-spec beschrijven WAT dit endpoint moet doen ("roep de scheduling-engine aan"), maar niet HOE — en de bestaande scheduling-engine (`recalculateTaskPlanning`, Story 3.5) is hier niet zomaar geschikt voor.** `recalculateTaskPlanning(taskId)` herberekent altijd een sessie van exact `task.defaultSessionDuration` minuten — het kent geen concept van "hoeveel tijd is er nog nodig voor déze taak" en negeert dus volledig de `resterende tijd` die Evelien net op 1.4 heeft ingevuld/bevestigd. Zonder aanpassing zou `/replan` gewoon een nieuwe, even lange sessie inplannen, voor altijd, ongeacht wat Evelien invult — de kern van FR7/FR8 zou dan feitelijk niets doen.

**Aanpak (bevestigd met Hillebrand, 2026-08-15 — zie Open Question #1 voor de volledige afweging):**

1. **`task.totalMinutes` wordt hergebruikt als "resterende benodigde tijd voor deze taak"** — geen nieuw veld nodig. Dit veld voedt vandaag al `calculateDoelmoment`'s bufferformule (FR24) en is precies "hoeveel tijd is er nog nodig", nu voor het eerst geschreven ná een sessie i.p.v. alleen bij taak-aanmaken/bewerken (Story 3.1/3.2). Vult Evelien de resterende-tijd-velden op 1.4 in → `task.totalMinutes` wordt die waarde (in minuten). Laat ze de velden leeg (AC #3 van Story 4.6: "oorspronkelijke schatting blijft gelden") → `task.totalMinutes` blijft ongewijzigd.
2. **Resterende tijd = 0 (expliciet 0u 0m ingevuld) betekent: taak klaar — maar taak, sessie en deeltaken blijven bestaan, niets wordt verwijderd.** Reden: de architectuur noemt "adaptieve tijdschattingen (leert van jou)" expliciet als bewust-buiten-MVP-scope, mét de eis dat de architectuur er later zonder herontwerp op moet kunnen bouwen (Deferred-sectie, architecture spine). Gepland-vs-besteed per sessie/subtaak is precies de data die zo'n toekomstige functie nodig heeft — die nu weggooien zou die belofte ondermijnen. In plaats daarvan: nieuw veld **`tasks.completedAt`** (nullable timestamp) markeert de taak als afgerond. Alleen het Calendar-event verdwijnt (geen toekomstige afspraak meer nodig, via `deleteHomeworkEvent`); de sessierij zelf blijft staan als historisch record (met `actualMinutes` gevuld, punt 4 hieronder) — geen aanroep naar `deleteTaskAndSession`.
3. **Resterende tijd > 0 (of ongewijzigd):** `task.totalMinutes` bijwerken (indien gewijzigd), dan `recalculateTaskPlanning(taskId)` aanroepen zoals-ie is — die herberekent doelmoment + sessie-plaatsing + Calendar-sync op basis van de (evt. bijgewerkte) `totalMinutes`, precies AC #2's eis.
4. **`sessions.actualMinutes` (nieuwe, nullable kolom) — nog niet toegevoegd.** De Consistency Conventions eisen al expliciet: *"ook de werkelijk bestede sessietijd wordt bij afronden afgerond op minuten opgeslagen"* — dat is tot nu toe nooit gebouwd (Story 4.4-4.6 hielden `spentSeconds` uitsluitend client-side, in `sessieOverzichtLog`). Déze story is de eerste met een server-aanroep ná sessie-afronden, dus déze story bouwt die kolom + de write ernaartoe (Task 1), ongeacht of de taak daarna klaar is of niet.
5. **Regressierisico op het hoofdscherm — expliciet oplossen, niet vergeten:** `getTasksWithSessionOnDate` (`server/data/tasks.ts`, gebruikt door `server/api/home/plan.get.ts` sinds Story 4.1) filtert nu nergens op afronding — een zojuist afgeronde taak se sessie heeft `startsAt` op vandaag staan, dus zonder aanpassing zou 1.1-Home 'm na een refresh gewoon weer tonen alsof-ie nog gepland is. Deze query moet `tasks.completedAt IS NULL` in de `where`-clause krijgen (Task 4 hieronder) — zonder deze wijziging faalt AC #3 ("hoofdscherm met de al-bijgewerkte planning") stilzwijgend.

**Waarom niet in de scheduling-engine zelf ingrijpen:** `recalculateTaskPlanning` blijft ongewijzigd (geen wijziging aan Story 3.5's al-gereviewde bestand) — de "wat betekent 0 resterende tijd"-beslissing hoort bij de aanroeper (de nieuwe `/replan`-route), niet bij de generieke herberekeningsfunctie, die voor toekomstige aanroepers (Epic 6) een kale "herbereken deze taak" primitief moet blijven. Om dezelfde reden wordt "klaar" ook niet in `getTaskById`/`getSessionForTask` zelf afgehandeld (bv. door completed taken uit die functies te filteren) — die blijven kale lezers; de filtering hoort bij de queries die specifiek "wat moet er vandaag getoond worden" beantwoorden.

## Tasks / Subtasks

- [x] Task 1: Migratie — `sessions.actualMinutes` + `tasks.completedAt` (AC: #2)
  - [x] `server/data/schema.ts`: `sessions`-tabel uitbreiden met `actualMinutes: integer('actual_minutes')` (nullable, geen default nodig — bestaande rijen hebben 'm simpelweg niet, zelfde precedent als `googleEventId`/`lastHeartbeatAt`).
  - [x] `server/data/schema.ts`: `tasks`-tabel uitbreiden met `completedAt: text('completed_at')` (nullable ISO-timestamp, zelfde vorm/precedent als `sessions.stoppedAt`) — `null` = nog openstaand, gezet = definitief klaar.
  - [x] `npx sst shell -- npx drizzle-kit generate` (nooit `push`, README/Stack-conventie) → controleer de gegenereerde SQL, dan `npx sst shell -- npx drizzle-kit migrate` tegen de dev-stage.
- [x] Task 2: `SessieOverzichtLog` uitbreiden met `sessionId` (AC: #1)
  - [x] `shared/types/tasks.d.ts`: `SessieOverzichtLog`-interface krijgt `sessionId: string` (zelfde "klein datagap vóór dev-story al opgelost"-precedent als Story 4.6's `taskId`-toevoeging).
  - [x] `app/pages/sessie/actief.vue`'s `stopSessie()`: `sessieOverzichtLog.value = {...}`-object vult 'm met `taak.value.sessionId` (al beschikbaar in scope — zelfde bron als de bestaande `/stop`-aanroep op regel 138).
- [x] Task 3: Data-laag schrijfpaden (AC: #2, #3)
  - [x] `server/data/tasks.ts`: nieuwe functie `updateSessionActual(sessionId: string, actualMinutes: number): Promise<void>` — één `UPDATE` op de sessierij (zelfde stijl als `markSessionStopped`), zet `actualMinutes` + `updatedAt`.
  - [x] `server/data/tasks.ts`: nieuwe functie `updateTaskTotalMinutes(taskId: string, totalMinutes: number): Promise<void>` — één `UPDATE` op de taakrij, zet `totalMinutes` + `updatedAt` (geverifieerd: er bestaat nog géén generieke `updateTask`-functie in dit bestand — niet er eentje van gaan bouwen voor deze ene kolom, dat is scope voor Story 5.3's bewerkformulier).
  - [x] `server/data/tasks.ts`: nieuwe functie `markTaskCompleted(taskId: string): Promise<void>` — één `UPDATE`, zet `completedAt` + `updatedAt` (zelfde stijl als `markSessionStopped`).
  - [x] `server/data/tasks.ts`: `getTasksWithSessionOnDate`'s `where`-clause uitbreiden met `isNull(tasks.completedAt)` — **regressie-fix, niet optioneel** (zie "Belangrijk" punt 5): zonder deze wijziging blijft een zojuist afgeronde taak op 1.1-Home staan.
- [x] Task 4: Domain-laag — replan-beslissing (AC: #2, #3)
  - [x] Nieuwe functie in `server/domain/scheduling/` (bv. `replan.ts`) — `replanAfterSession(taskId: string, sessionId: string, actualMinutes: number, remainingTotalMinutes: number | null): Promise<{ completed: true } | { completed: false, task: Task, session: Session }>`:
    - Schrijft eerst `actualMinutes` weg via `updateSessionActual` (Task 3) — dit gebeurt sowieso, ongeacht de resterende-tijd-uitkomst.
    - Als `remainingTotalMinutes === 0`: `googleEventId` staat op de sessie-rij zelf (niet op de taak) — als die niet-`null` is, verwijder het Calendar-event (`deleteHomeworkEvent(task.userId, session.googleEventId)`). Zet daarna `markTaskCompleted(taskId)`. **Geen** `deleteTaskAndSession`-aanroep — taak/sessie/deeltaken blijven bestaan als historisch record (zie "Belangrijk" punt 2). Retourneer `{ completed: true }`.
    - Anders: als `remainingTotalMinutes !== null`, werk `task.totalMinutes` bij via `updateTaskTotalMinutes` (Task 3). Roep daarna `recalculateTaskPlanning(taskId)` (ongewijzigd, Story 3.5) aan. Retourneer `{ completed: false, task, session }`.
- [x] Task 5: `POST /api/sessions/{sessionId}/replan`-route (AC: #1, #2)
  - [x] `server/api/sessions/[sessionId]/replan.post.ts` — zelfde envelope-/ownership-patroon als `stop.post.ts`/`heartbeat.post.ts` (401/400/404, lokale `envelope()`-helper, ownership via `getSessionById` → `getTaskById` → `task.userId === session.user.id`).
  - [x] Body: `{ actualMinutes: number, remainingHours: number | null, remainingMinutes: number | null }`. Server-side hervalidatie (nooit alleen op de client vertrouwen voor een mutatie-endpoint): `actualMinutes >= 0`; als `remainingHours`/`remainingMinutes` niet beide `null` zijn, dezelfde regels als de client (`remainingHours >= 0` geen bovengrens, `remainingMinutes` 0–59) → bij een ongeldige body `400 ValidationError`. Bereken `remainingTotalMinutes` (of `null` als beide velden `null` zijn = "ongewijzigd").
  - [x] Roep `replanAfterSession` (Task 4) aan, retourneer `{ ok: true, completed: boolean }`. **Dit endpoint zelf `await`-t alles synchroon, zoals elke andere route** — "fire-and-forget" is een **client-side** eigenschap (de client wacht niet op de response), geen server-side eigenschap: AD-7 eist juist dat Calendar-writes synchroon binnen hetzelfde request blijven, geen losse achtergrondtaak. Verwar dit niet met elkaar.
- [x] Task 6: `overzicht.vue`'s `terugNaarHome()` — daadwerkelijke aanroep (AC: #1)
  - [x] Bouw de payload uit `log.value` (`actualMinutes: Math.round(log.value.spentSeconds / 60)`) en de lokale resterende-tijd-refs (`isEmptyField` → `null`, anders `Number(...)`).
  - [x] `$fetch(`/api/sessions/${encodeURIComponent(log.value.sessionId)}/replan`, { method: 'POST', body: payload }).catch(fout => console.error('[sessie] Kon herplan-verzoek niet versturen:', fout))` — **niet ge-`await`-ed** (Story 4.5's precedent: fire-and-forget met `.catch`, nooit volledig stil falen).
  - [x] Ná het fire-and-forget-`$fetch` (niet erop wachtend): bestaande validatie (blur-regels nogmaals) blijft zoals in Story 4.6, dan `sessieOverzichtLog.value = null` + `navigateTo('/')` — ongewijzigd verder t.o.v. Story 4.6, alleen de fetch-regel wordt toegevoegd vóór de navigatie.
- [x] Task 7: Verificatie (AC: #1, #2, #3)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live tegen de dev-stage: een testtaak (`Verificatietaak 4.7a`, 20 min) met resterende tijd `0u 0m` → "Terug naar hoofdscherm" → geverifieerd via directe DB-query: taak/sessie blijven bestaan, `tasks.completedAt` gezet (`2026-08-15T18:23:01.014Z`), `sessions.actualMinutes` gevuld (`0`, sessie duurde enkele seconden), `google_event_id` was al `null` (geen huiswerk-kleur ingesteld op dit testaccount, self-guard-pad niet apart geraakt). Taak **verdwijnt van 1.1-Home** ("Je bent klaar voor vandaag!" i.p.v. de taak) — regressie-fix uit Task 3 bevestigd.
  - [x] Live: `Verificatietaak 4.7b` (`totalMinutes` 40, sessieduur 20) met resterende tijd `0u 15m` → DB bevestigt `tasks.totalMinutes` 40 → 15, `tasks.completedAt` blijft `null`, sessie herpland (nieuwe `starts_at`), `sessions.actualMinutes` gevuld.
  - [x] Live: `Verificatietaak 4.7c` (`totalMinutes` 20) — resterende-tijd-velden leeg gelaten → DB bevestigt `tasks.totalMinutes` ongewijzigd (20), sessie alsnog herpland (nieuwe `starts_at`, stapelt na 4.7b's sessie op dezelfde dag), `sessions.actualMinutes` gevuld.
  - [x] Geen secrets/placeholder-waarden in code/commits. Alle drie testtaken (incl. sessies) na verificatie via directe DB-cleanup verwijderd, 0 resterend bevestigd.

### Review Findings

- [x] [Review][Decision] `sessions.actualMinutes` wordt overschreven i.p.v. opgeteld bij een tweede sessie op dezelfde taak — **Besluit (Hillebrand, 2026-08-15):** optie 2, losse sessie-historie. Nieuwe tabel `session_logs` (één rij per échte werksessie, `taskId`/`actualMinutes`/`createdAt`), `sessions.actualMinutes` verwijderd (migratie 0011). `updateSessionActual` vervangen door `insertSessionLog` (`INSERT` i.p.v. `UPDATE`) — [server/data/schema.ts, server/data/tasks.ts, server/domain/scheduling/replan.ts]
- [x] [Review][Patch] `actualMinutes` mist `Number.isInteger`-validatie — opgelost, `replan.post.ts` gebruikt nu `Number.isInteger` i.p.v. `Number.isFinite` — [server/api/sessions/[sessionId]/replan.post.ts]
- [x] [Review][Patch] Geen guard tegen een `/replan`-aanroep op een taak die al `completedAt` heeft — opgelost, `replanAfterSession` retourneert vroeg `{ completed: true }` zonder nieuwe writes als `task.completedAt` al gezet is — [server/domain/scheduling/replan.ts]
- [x] [Review][Patch] Geen DB-transactie om de schrijf-sequentie — opgelost, nieuwe `logSessionAndCompleteTask`/`logSessionAndUpdateRemaining` in `server/data/tasks.ts` wikkelen de sessielog + taak-write in één transactie (zelfde precedent als `createTaskAndSession`/`deleteTaskAndSession`) — [server/data/tasks.ts, server/domain/scheduling/replan.ts]
- [x] [Review][Patch] Verweesde `googleEventId` blijft op de sessierij staan na het verwijderen van het Calendar-event — opgelost, nieuwe `clearSessionGoogleEventId` — [server/data/tasks.ts, server/domain/scheduling/replan.ts]
- [x] [Review][Defer] Geen rollback bij een falende `deleteHomeworkEvent`-aanroep [server/domain/scheduling/replan.ts] — deferred, matcht `recalculateTaskPlanning`'s eigen al-geaccepteerde "geen rollback"-precedent voor Calendar-call-storingen
- [x] [Review][Defer] Fire-and-forget dataverlies bij netwerkfout, geen retry/notificatie [app/pages/sessie/overzicht.vue] — deferred, expliciet UX-spec-gedrag, al vastgelegd als Open Question #2
- [x] [Review][Defer] `tasks.totalMinutes` krijgt een tweede, overlappende betekenis (creatie-tijd-schatting vs. post-sessie-resterende-tijd) [server/data/schema.ts] — deferred, inherent aan de bevestigde Open Question #1-beslissing, relevant voor Story 5.3
- [x] [Review][Defer] Geen geautomatiseerde tests voor het completion-/Calendar-verwijderpad [server/domain/scheduling/replan.ts, server/api/sessions/[sessionId]/replan.post.ts] — deferred, projectbreed al bekend gat

## Dev Notes

### Architectuurcompliance

- **AD-1** (scheduling-logica server-only): `replanAfterSession`/`recalculateTaskPlanning` blijven de enige plek die een doelmoment/sessie-plaatsing berekent — de client stuurt alleen ruwe input (resterende tijd, bestede tijd), nooit een berekende planning.
- **AD-7** (Calendar write-sync synchroon binnen het request-pad): de nieuwe `/replan`-route voert alles — DB-writes én de Calendar-aanroep (via `recalculateTaskPlanning` of `deleteHomeworkEvent`) — synchroon binnen zichzelf uit. De client wacht niet op de response (UX-spec's fire-and-forget), maar de **server** doet gewoon een normale, volledig ge-`await`-e request-afhandeling — geen losse achtergrondtaak, geen `waitUntil`-constructie.
- **NFR8/AD-1** (idempotentie): `recalculateTaskPlanning` was en blijft idempotent — deze story voegt er geen tussentijds opgeslagen planningsstaat aan toe, alleen een nieuwe `totalMinutes`-waarde als input, wat het al-bestaande idempotentie-contract niet doorbreekt.
- **Consistency Conventions**: "werkelijk bestede sessietijd wordt bij afronden afgerond op minuten opgeslagen" — déze story is de eerste die dit daadwerkelijk bouwt (`sessions.actualMinutes`), een al langer bestaande, tot nu toe onvervulde eis uit de architectuur.
- **Deferred-sectie** ("adaptieve tijdschattingen (leert van jou)" — bewust buiten MVP-scope, architectuur houdt er al rekening mee voor latere toevoeging zonder herontwerp): déze story bewaart daarom taak/sessie/deeltaken bij afronding i.p.v. te verwijderen — `actualMinutes` (déze story) en de bestaande `subtasks.minutes`/`plannedMinutes` blijven zo beschikbaar als toekomstige trainingsdata, zonder dat een latere story alsnog een historiseringsmigratie nodig heeft.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- **`server/domain/scheduling/recalculate.ts`** (Story 3.5) — `recalculateTaskPlanning(taskId)`: leest `task.totalMinutes` voor de doelmoment-berekening, maar herleidt de sessie-`plannedMinutes` altijd van `task.defaultSessionDuration` (nooit van `totalMinutes` zelf) — dit blijft zo, déze story wijzigt dit bestand niet.
- **`server/data/tasks.ts`** — `deleteTaskAndSession` blijft **ongebruikt** in déze story (bewuste keuze, zie "Belangrijk" punt 2 — niet per ongeluk alsnog gebruiken). `getTasksWithSessionOnDate` (gebruikt door `server/api/home/plan.get.ts`) krijgt een `isNull(tasks.completedAt)`-filter (Task 3) — lees deze functie vóór implementatie, de `where`-clause gebruikt al `and(...)`. `getSessionForTask`/`getSessionById`/`getTaskById` al bekend uit eerdere stories.
- **`server/domain/calendar-sync/homework-events.ts`** — `deleteHomeworkEvent(userId, googleEventId)` bestaat al (gebruikt door `recalculateTaskPlanning`'s eigen compenserende opruiming), hier hergebruikt voor de "taak klaar"-tak.
- **`server/api/sessions/[sessionId]/stop.post.ts`/`heartbeat.post.ts`** (Story 4.5) — exact het envelope-/ownership-patroon dat `replan.post.ts` moet volgen (lokale `envelope()`-helper bewust gedupliceerd, zelfde precedent).
- **`app/pages/sessie/overzicht.vue`** (Story 4.6) — `terugNaarHome()` bestaat al, navigeert al zonder API-aanroep; déze story voegt de `$fetch`-regel toe, de rest (validatie, state-leegmaken, navigatie) blijft ongewijzigd.
- **`shared/types/tasks.d.ts`** — `SessieOverzichtLog` (Story 4.6) mist `sessionId` — Task 2 vult dat aan.

### Previous Story Intelligence (Story 4.6, inclusief de code review)

- **Fire-and-forget-aanroepen krijgen altijd een `.catch(fout => console.error(...))`** — nooit volledig stil falen (Story 4.5's precedent, herbevestigd in 4.6's review).
- **`encodeURIComponent` op elke id die in een URL terechtkomt** — toepassen op zowel `sessionId` in de URL als (al gebeurd) `taakId` in de query-param.
- **Kleine datagaps vóór dev-story identificeren i.p.v. tijdens implementatie ontdekken** — Story 4.6 deed dit voor `taskId`; déze story doet hetzelfde voor `sessionId` (Task 2) — zelfde discipline.
- **3-agent adversarial review + structured triage blijft de standaardafronding** — patch/defer/dismiss, met live-herverificatie ná patches vóór Status → done.
- **Code review 2026-08-15 op Story 4.6 stelde drie tijdnotatie-/scope-vragen al vast** (zie Story 4.6's Open Questions, alle drie 🟢 resolved) — niet relevant voor déze story's eigen scope, maar `formatMinutes`/`"{h} uur {m} min"` is nu de vaste notatie in het hele project, ter info als déze story ooit tijd moet tonen.

### Git Intelligence

- Laatste 6 commits (Story 4.1-4.6): elk een klein, additief databehoefte-patroon (nieuw veld op een bestaand gedeeld type of een nieuwe migratie-kolom, nooit een bestaand veld hernoemd/verwijderd) — déze story's `actualMinutes`-kolom en `SessieOverzichtLog.sessionId`-toevoeging volgen exact hetzelfde patroon.
- Story 3.5 introduceerde `recalculateTaskPlanning` als kale, geen-API-route-functie — déze story is de eerste die 'm vanuit een echte HTTP-route aanroept (via de nieuwe `replanAfterSession`-tussenlaag, niet rechtstreeks), consistent met de "toekomstige aanroepers importeren deze functie rechtstreeks" die Story 3.5's eigen Dev Notes al aankondigden.
- Story 3.1 bouwde `deleteTaskAndSession` vooruitlopend op een user-facing verwijder-flow (Story 5.2, nog backlog) — déze story is de eerste die 'm daadwerkelijk buiten een interne rollback gebruikt.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 536-548 (Story 4.7's AC's, letterlijk overgenomen hierboven), regel 48-49 (FR7/FR8), regel 79-80 (NFR7/NFR8)
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.4-sessie-afronden/1.4-sessie-afronden.md] — API Endpoints-sectie (regels 339-350), Open Question #3/#4 (mislukte herplanning, nu nog steeds niet zichtbaar gemaakt — buiten scope, zie Open Questions hieronder)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md] — AD-1, AD-3, AD-7, Consistency Conventions ("werkelijk bestede sessietijd... afgerond op minuten opgeslagen")
- [Source: server/domain/scheduling/recalculate.ts] — Story 3.5, ongewijzigd hergebruikt
- [Source: server/data/tasks.ts] — `getTasksWithSessionOnDate` (regressie-fix), `getSessionForTask`/`getSessionById`/`getTaskById`, patroon voor nieuwe `updateSessionActual`/`updateTaskTotalMinutes`/`markTaskCompleted`
- [Source: server/api/home/plan.get.ts] — Story 4.1, enige aanroeper van `getTasksWithSessionOnDate` — geen wijziging nodig aan dit bestand zelf, alleen aan de data-laag-functie die het aanroept
- [Source: server/api/sessions/[sessionId]/stop.post.ts, heartbeat.post.ts] — Story 4.5, envelope-/ownership-patroon voor de nieuwe route
- [Source: app/pages/sessie/overzicht.vue, shared/types/tasks.d.ts] — Story 4.6, `terugNaarHome()`/`SessieOverzichtLog` worden hier uitgebreid, niet herbouwd

## Open Questions

1. 🟢 **Resolved (Hillebrand, 2026-08-15):** resterende tijd 0 → taak/sessie/deeltaken blijven bestaan (`tasks.completedAt` gezet, geen verwijdering), met het oog op een toekomstige adaptieve-tijdschatting-functie (architectuur's Deferred-sectie eist al "geen herontwerp nodig later" voor die functie) — gepland-vs-besteed-data blijft zo bewaard. Alleen het Calendar-event wordt opgeruimd. Zie "Belangrijk" punt 2 en Task 4.
2. 🔴 **Open:** UX-spec's eigen Open Question #4 (hoe/waar Evelien een uiteindelijk mislukte fire-and-forget-herplanning ooit te zien krijgt) — blijft open, niet in scope voor déze story (er is geen retry-/notificatiemechanisme gespecificeerd); server-side `console.error`-logging is het enige vangnet, zelfde niveau als Story 4.5's fire-and-forget-aanroepen.
3. 🟡 **In Discussion:** moet `remainingTotalMinutes` ooit hoger zijn dan de taak se `totalMinutes` vóór de sessie (bv. Evelien onderschatte de taak fors)? Geen enkele AC verbiedt dit (AC #3 van Story 4.6: "geen bovengrens op uren") — de voorgestelde aanpak accepteert dit stilzwijgend (totalMinutes wordt gewoon hoger, doelmoment-berekening past zich aan), geen aparte validatie/waarschuwing voorgesteld. Zeg het als hier wél een signaal bij moet.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-15 | Story aangemaakt via create-story, voortbouwend op Story 4.6 (done). Belangrijkste bevinding tijdens architectuuranalyse: `recalculateTaskPlanning` (Story 3.5) kent geen concept van "resterende tijd" en moet daarom via een nieuwe tussenlaag (`replanAfterSession`) aangestuurd worden i.p.v. rechtstreeks vanuit de nieuwe route. Twee kleine datagaps geïdentificeerd en in scope opgenomen: `sessions.actualMinutes` ontbreekt nog (nieuwe migratie, Task 1) en `SessieOverzichtLog` mist `sessionId` (Task 2). |
| 2026-08-15 | Open Question #1 (kern van deze story's serverlogica) besproken en opgelost met Hillebrand: bij resterende tijd 0 wordt de taak niet verwijderd maar gemarkeerd als afgerond (nieuw `tasks.completedAt`-veld) — reden: de architectuur eist dat een toekomstige adaptieve-tijdschatting-functie later zonder herontwerp toegevoegd kan worden, wat vereist dat gepland-vs-besteed-data (déze story's `sessions.actualMinutes`, bestaande `subtasks.minutes`) bewaard blijft i.p.v. verwijderd. Bijkomend regressierisico geïdentificeerd en in scope opgenomen: `getTasksWithSessionOnDate` (hoofdscherm-query, Story 4.1) moet `completedAt IS NULL` filteren, anders blijft een afgeronde taak op 1.1-Home staan (Task 3). "Belangrijk"-sectie, Task 1/3/4 en Open Question #1 bijgewerkt. |
| 2026-08-15 | Alle 7 taken afgerond: migratie (`sessions.actualMinutes`, `tasks.completedAt`) gegenereerd en toegepast op de dev-stage; `SessieOverzichtLog.sessionId` toegevoegd; nieuwe data-laagfuncties (`updateSessionActual`, `updateTaskTotalMinutes`, `markTaskCompleted`) + regressie-fix op `getTasksWithSessionOnDate`; nieuwe domain-laag `replanAfterSession` (`server/domain/scheduling/replan.ts`); nieuwe route `POST /api/sessions/{sessionId}/replan` met server-side hervalidatie; `overzicht.vue`'s `terugNaarHome()` roept de route nu daadwerkelijk fire-and-forget aan. Typecheck/build slagen. Gedeployed naar de dev-stage en live geverifieerd (Hillebrand ingelogd, browser-automatisering + directe DB-queries voor de drie scenario's: resterende tijd 0/gedeeltelijk/ongewijzigd) — alle drie bevestigd conform verwachting. Testtaken na verificatie opgeruimd. Status → review. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Geen fouten tegengekomen tijdens implementatie. `npx sst shell` had geen expliciete `--stage dev` nodig volgens de story-tekst, maar zonder die flag koos de shell een andere (lege) stage zonder secrets ("TursoAuthToken is not linked") — met `--stage dev` werkte de migratie meteen.
- Live-verificatie liep via directe DB-queries (Turso/libSQL) naast de browserklikflow, omdat er geen bestaande debug-/leesroute voor sessies/taken beschikbaar was — zelfde soort tijdelijke verificatie-aanpak als Story 4.6, maar dan zonder een nieuwe debug-route te hoeven toevoegen.

### Completion Notes List

- **AC #1/#2/#3 zijn end-to-end live geverifieerd** tegen de dev-stage, met drie echte testtaken die alle drie de paden van `replanAfterSession` raakten: volledig klaar (0 resterend), gedeeltelijk klaar (resterend < oorspronkelijke totalMinutes), en ongewijzigd (velden leeg).
- **Open Question #1's bevestigde aanpak werkt zoals bedoeld**: taak/sessie blijven na "klaar" gewoon in de DB staan (`completedAt` gezet), verdwijnen wel van 1.1-Home — de regressie-fix op `getTasksWithSessionOnDate` is expliciet bevestigd (taak stond weg uit de "Later vandaag"/dagplanning-respons).
- **`google_event_id` was in alle drie testgevallen al `null`** (geen huiswerk-kleur ingesteld op het gebruikte testaccount) — het `deleteHomeworkEvent`-pad in `replanAfterSession` is dus niet apart live geraakt, alleen via codelezing bevestigd (hergebruikt een bestaande, al-geteste functie uit Story 3.5, geen nieuwe logica).
- **Open Question #2 (mislukte fire-and-forget-herplanning zichtbaar maken) en #3 (resterende tijd hoger dan oorspronkelijke totalMinutes) blijven open voor Hillebrand** — geen van beide blokkeerde de implementatie.

### File List

**Nieuw:**
- `server/domain/scheduling/replan.ts`
- `server/api/sessions/[sessionId]/replan.post.ts`
- `server/data/migrations/0010_worried_zarek.sql`
- `server/data/migrations/0011_sour_deadpool.sql` (review-patch: `session_logs`-tabel, `sessions.actual_minutes` verwijderd)

**Gewijzigd:**
- `server/data/schema.ts` (`tasks.completedAt`; `sessionLogs`-tabel toegevoegd, `sessions.actualMinutes` weer verwijderd — review-patch)
- `server/data/tasks.ts` (`insertSessionLog`, `logSessionAndCompleteTask`, `logSessionAndUpdateRemaining`, `clearSessionGoogleEventId` toegevoegd; `getTasksWithSessionOnDate` filtert nu op `isNull(tasks.completedAt)`)
- `shared/types/tasks.d.ts` (`SessieOverzichtLog.sessionId`, nieuwe `ReplanSessionInput`/`ReplanSessionResponse`)
- `app/pages/sessie/actief.vue` (`stopSessie()` vult `sessionId` in `sessieOverzichtLog`)
- `app/pages/sessie/overzicht.vue` (`terugNaarHome()` roept `/replan` fire-and-forget aan)

**Live gedeployed:** stage `dev` op `flowz.fyi`. Beide migraties toegepast op de dev-database. Vier testtaken aangemaakt, doorlopen (incl. een taak met twee opeenvolgende sessies voor de review-patch-verificatie) en na verificatie via directe DB-cleanup verwijderd.

### Review Follow-ups (AI)

- [x] [Review-patch][Decision] `sessions.actualMinutes` → `session_logs`-tabel (zie Review Findings hierboven) — `server/data/schema.ts`, `server/data/tasks.ts`, `server/domain/scheduling/replan.ts`, nieuwe migratie `server/data/migrations/0011_sour_deadpool.sql`. Typecheck geslaagd, migratie toegepast op dev. **Live herverifieerd:** twee opeenvolgende sessies op dezelfde testtaak (`Verificatietaak 4.7d`) → beide `session_logs`-rijen bewaard (voorheen zou de tweede de eerste hebben overschreven), `completedAt` correct gezet op de tweede sessie.
- [x] [Review-patch][Patch] Alle 4 patches (integer-validatie, idempotency-guard, transactie, verweesde `googleEventId`) toegepast — zie Review Findings hierboven. Typecheck/build geslaagd, gedeployed naar dev, live herverifieerd via het twee-sessies-scenario hierboven (raakt zowel de transactie- als de idempotency-guard-patch).
