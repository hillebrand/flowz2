---
baseline_commit: 4817da2e13171d112e50672229791747d9afd068
---

# Story 4.5: Sessie-actief — Wegnavigeer-bescherming

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want gewaarschuwd worden als ik per ongeluk wegnavigeer tijdens een actieve sessie,
so that mijn sessie niet stil verloren gaat, en de bestede tijd betrouwbaar geregistreerd wordt.

## Acceptance Criteria

1. **Given** een sessie is actief (niet gepauzeerd), **when** Evelien in-app probeert weg te navigeren (hamburgermenu, browser-terugknop), **then** verschijnt `active-leave-confirm-modal` ("Wil je de sessie stoppen?") met "Ja, stop" (logt de sessie, → 1.4) en "Nee, blijf hier".
2. **Given** een sessie is actief, **when** Evelien het browsertabblad sluit (`beforeunload`), **then** stuurt `navigator.sendBeacon()` een stop-signaal naar `/api/sessions/{sessionId}/stop`, zonder zichtbare bevestiging.
3. **Given** een sessie is actief, **when** de sessie langer loopt zonder dat een stop-signaal binnenkomt (crash, geen verbinding), **then** stuurt de client periodiek een heartbeat (`POST /api/sessions/{sessionId}/heartbeat`); de server gebruikt het laatste heartbeat-moment als fallback-eindpunt, nooit "tot nu" zonder recent bewijs van activiteit.

## Belangrijk: eerste échte server-aanroepen vanuit een sessie, een nieuwe datagap (`sessionId`), en een scope-nuance over het hamburgermenu

**`sessionId` ontbreekt nog volledig in de client-datastroom.** De AC's routes gebruiken `{sessionId}` — dat is de `Session`-rij se eigen `id` (`server/data/schema.ts`'s `sessions`-tabel), niet het taak-id. `TaskPrepResponse`/`SessionActiveTaak` (Story 4.3/4.4) dragen tot nu toe alleen taakdata; `GET /api/tasks/[id]` heeft de sessie (`getSessionForTask`) al wél opgehaald voor `plannedMinutes`, maar geeft `session.id` zelf niet door. **Déze story breidt `TaskPrepResponse` uit met `sessionId`** (Task 1) — weer een additieve, backwards-compatibele uitbreiding, zelfde patroon als Story 4.4's `subtasks`-toevoeging.

**Eerste server-side bijhouden van "is deze sessie nog actief" — géén nieuwe `status`/`actualMinutes`-kolom, wél twee nieuwe timestamp-kolommen.** Story 3.1's Dev Notes voorspelden een latere "sessie-runner"-migratie voor Epic 4; déze story is dat moment, maar bewust minimaal: `sessions.lastHeartbeatAt` (nullable, bijgewerkt door de heartbeat) en `sessions.stoppedAt` (nullable, bijgewerkt door het stop-signaal). **Geen** subtaak-statussen of bestede-tijd-berekening hier — die blijven, zoals Story 4.4 al bouwde, puur client-side via `useState('sessie-overzicht-log', ...)`, gelezen door Story 4.6's 1.4-scherm zonder nieuwe fetch (zelfde "geen dubbele opslag"-precedent als de rest van dit project). Déze twee kolommen dienen uitsluitend als server-side fallback-bewijs-van-activiteit voor een toekomstige story (waarschijnlijk 4.7's replanning) om te bepalen wanneer een sessie écht als beëindigd geldt, ook als de client nooit een expliciet stop-signaal stuurde.

**Het hamburgermenu bestaat nog niet als navigatiedoel.** AC #1 noemt "hamburgermenu" als een van de in-app-wegnavigeer-triggers, maar `home-header-hamburger` is sinds Story 4.1's review-patch een puur decoratief, niet-klikbaar element (geen navigatiemenu bestaat ergens in de app — herhaaldelijk erkende, gedocumenteerde beperking sinds Story 3.1). De navigatiebeveiliging die déze story bouwt (Vue Router se `onBeforeRouteLeave`) vangt **elke** in-app-navigatiepoging af, ongeacht de bron — dus zodra een toekomstige story alsnog een werkend hamburgermenu bouwt, werkt déze bescherming daar automatisch al voor mee, zonder aanpassing. Voor déze story is de enige daadwerkelijk beschikbare in-app-trigger de browser-terugknop (Vue Router onderschept die al als een SPA-interne navigatie, geen volledige page-reload).

**`active-stop-button`'s eigen navigatie moet de nieuwe guard niet zelf ook triggeren.** `stopSessie()` (Story 4.4) roept al `navigateTo('/sessie/overzicht?...')` aan — dat is zelf ook een "in-app wegnavigeren"-gebeurtenis die de nieuwe `onBeforeRouteLeave`-guard anders zou opvangen en de modal zou tonen bovenop een al-bewuste stop-actie. Déze story voegt een `isIntentionalLeave`-vlag toe die de guard laat weten: deze navigatie is al bewust bevestigd, sla de modal over.

## Tasks / Subtasks

- [x] Task 1: Schema + data-laag — `sessions.lastHeartbeatAt`/`stoppedAt`, `sessionId` in de taak-prep-response (AC: #2, #3)
  - [x] `server/data/schema.ts`: `sessions`-tabel uitbreiden met `lastHeartbeatAt: text('last_heartbeat_at')` (nullable) en `stoppedAt: text('stopped_at')` (nullable) — zelfde stijl als `googleEventId` (Story 3.5): geen `NOT NULL`, dus geen DB-default nodig voor de `ALTER TABLE`.
  - [x] Migratie genereren via `npx sst shell -- drizzle-kit generate` (nooit `push`, zie `drizzle.config.ts`'s eigen comment) en toepassen via `npx sst shell -- drizzle-kit migrate` tegen de `dev`-stage.
  - [x] `server/data/tasks.ts`: `getSessionById(sessionId: string): Promise<Session | null>` (nieuw, zelfde stijl als `getTaskById`), `markSessionHeartbeat(sessionId: string): Promise<void>` (UPDATE `lastHeartbeatAt` naar nu), `markSessionStopped(sessionId: string): Promise<void>` (UPDATE `stoppedAt` naar nu).
  - [x] `TaskPrepResponse` (`shared/types/tasks.d.ts`) uitbreiden met `sessionId: string`. `server/api/tasks/[id].get.ts` geeft 'm door (`taskSession.id`, al beschikbaar — geen nieuwe query).
- [x] Task 2: `server/api/sessions/[sessionId]/stop.post.ts` + `heartbeat.post.ts` — nieuwe routes (AC: #2, #3)
  - [x] Beide: `requireUserSession` (401), `getSessionById(sessionId)` (404 bij `null`), ownership-check via `getTaskById(session.taskId)` + `task.userId !== user.id` → **ook 404** (zelfde "niet bestaand vs. niet-eigen krijgen dezelfde respons"-precedent als Story 4.3's taak-ownership-check).
  - [x] `stop.post.ts`: roept `markSessionStopped` aan, retourneert een leeg `200`-antwoord (geen betekenisvolle body nodig — `sendBeacon` leest de respons toch niet).
  - [x] `heartbeat.post.ts`: roept `markSessionHeartbeat` aan, retourneert een leeg `200`-antwoord.
  - [x] Beide binnen een try/catch (500 bij een databasefout), zelfde envelope-patroon als `[id].get.ts`/de `availability`-routes.
- [x] Task 3: `app/pages/sessie/actief.vue` — wegnavigeer-bescherming toevoegen (AC: #1, #2, #3)
  - [x] **`active-leave-confirm-modal`** (AC #1): nieuw, eenvoudig modal-element (geen design system, zelfde "geen bestaand modal-component"-precedent als Story 3.1/3.3's `taak-confirm-overlay`, hier niet hergebruikt want een ander doel/tekst — wél qua stijl consistent). Tekst "Wil je de sessie stoppen?", twee knoppen: "Ja, stop" (roept dezelfde sessie-log-opbouw + stop-aanroep + navigatie aan als `active-stop-button`, zie Task 3's laatste subtaak) en "Nee, blijf hier" (sluit de modal, blijft op de pagina).
  - [x] **`onBeforeRouteLeave`**-guard (Vue Router/Nuxt-composable, AC #1): actief zolang `!isPaused && !isIntentionalLeave`. Bij een afgevangen navigatiepoging: `return false` (annuleer de navigatie), toon de modal. Browser-terugknop (SPA-interne route-wissel, geen volledige reload) wordt hierdoor al gedekt — zie "Belangrijk" voor de hamburgermenu-scope-nuance.
  - [x] **`isIntentionalLeave`-vlag**: `ref(false)`, gezet op `true` vlak vóór elke bewuste `navigateTo`-aanroep binnen déze pagina (zowel `active-stop-button` als de modal se "Ja, stop") — voorkomt dat de guard zichzelf blokkeert.
  - [x] **`beforeunload`-listener** (AC #2): geregistreerd in `onMounted`, opgeruimd in `onUnmounted`. Actief zolang `!isPaused`. Stuurt `navigator.sendBeacon('/api/sessions/' + sessionId + '/stop', new Blob(['{}'], { type: 'application/json' }))` — `sendBeacon` stuurt cookies automatisch mee (same-origin), dus `requireUserSession` werkt zonder extra auth-plumbing. Geen zichtbare bevestiging (AC's letterlijke eis) — geen `alert`/modal/redirect, puur fire-and-forget.
  - [x] **Heartbeat-`setInterval`** (AC #3): apart interval (los van de bestaande timer-tick-interval, Story 4.4), elke `HEARTBEAT_INTERVAL_MS` (nieuwe constante, **30 seconden** — UX-spec se eigen Open Question #6 laat het exacte interval open, hier een beargumenteerde keuze, zie Open Questions) een `$fetch('/api/sessions/' + sessionId + '/heartbeat', { method: 'POST' })`-aanroep, alleen actief zolang `!isPaused`. Fire-and-forget (geen await-blokkade van de UI, een gemiste heartbeat is niet kritiek — de eerstvolgende probeert het gewoon opnieuw). Interval starten/stoppen laten meebewegen met `isPaused` (een gepauzeerde sessie stuurt geen heartbeats — logisch, er is dan toch geen actief bewijs van bezig-zijn).
  - [x] `stopSessie()` (Story 4.4, bestaand) aanpassen: zet `isIntentionalLeave.value = true` vóór `navigateTo`, en roept (fire-and-forget, niet ge-`await`) `$fetch('/api/sessions/' + sessionId + '/stop', { method: 'POST' })` aan vóór de navigatie — dit is de "normale" stop-weg (Stop-knop), naast de `beforeunload`-variant hierboven.
  - [x] `onUnmounted`: ruim ook de heartbeat-`setInterval` en de `beforeunload`-listener op (naast de al-bestaande timer-interval-opruiming uit Story 4.4).
- [x] Task 4: Verificatie (AC: #1, #2, #3)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Migratie live toegepast tegen de `dev`-stage database (`drizzle-kit migrate`), bevestigd via een korte data-laag-aanroep (of gewoon door de heartbeat/stop-endpoints daadwerkelijk te testen — als die zonder SQL-fout slagen, is de migratie toegepast).
  - [x] Live geverifieerd: tijdens een actieve (niet-gepauzeerde) sessie de browser-terugknop gebruiken → `active-leave-confirm-modal` verschijnt, pagina blijft op 1.3. "Nee, blijf hier" → modal sluit, sessie loopt door (timer niet gereset). "Ja, stop" → navigeert naar `/sessie/overzicht` (verwachte 404, zelfde precedent als Story 4.4).
  - [x] Live geverifieerd: tijdens een **gepauzeerde** sessie de browser-terugknop gebruiken → **geen** modal, navigatie gaat gewoon door (AC #1's "niet gepauzeerd"-voorwaarde).
  - [x] Live geverifieerd: `active-stop-button` zelf triggert **niet** de leave-confirm-modal (de `isIntentionalLeave`-vlag werkt).
  - [x] Live geverifieerd (via de Network-tab of `read_network_requests`): de heartbeat-aanroep vuurt periodiek tijdens een actieve sessie, en stopt zodra gepauzeerd wordt.
  - [x] Live geverifieerd: na een sessie-stop (Stop-knop of "Ja, stop") is `sessions.stoppedAt` gevuld voor de betreffende sessie (via een tijdelijke, nooit-gecommitte debug-route die de rij rechtstreeks uitleest — zelfde patroon als eerdere stories' live-DB-verificaties).
  - [x] `beforeunload`/`sendBeacon` zelf is met browser-automatiseringstools niet 1:1 te simuleren (een tabblad daadwerkelijk sluiten onderbreekt de sessie) — geverifieerd via codelezing (de listener-registratie, de `sendBeacon`-aanroep-vorm) i.p.v. een live end-to-end-test; expliciet gedocumenteerd als bekende verificatiebeperking (zelfde discipline als Story 4.1's `useState`-op-een-404-pagina-beperking).
  - [x] Geen secrets/placeholder-waarden in code/commits. Testtaken/testsessies na verificatie opgeruimd.

## Dev Notes

### Architectuurcompliance

- AD-7 (synchroon binnen het request-pad, geen achtergrondtaak/wachtrij) — de heartbeat/stop-aanroepen zijn zelf wél bewust fire-and-forget vanuit de client (niet ge-`await`), maar dat is een client-side UX-keuze (niet blokkeren op een logging-aanroep), geen schending van AD-7 — de server-kant van beide routes blijft een gewone synchrone request-afhandeling.
- Story 3.1's Dev Notes-voorspelling ("Epic 4's sessie-runner voegt een status/actualMinutes-achtige kolom toe via een eigen migratie") komt hier gedeeltelijk uit — bewust beperkt tot de twee timestamp-kolommen die déze story's AC's daadwerkelijk nodig hebben, geen vooruitbouwen op Story 4.6/4.7's nog niet geanalyseerde exacte databehoefte.
- Nieuw precedent: **`server/api/sessions/`** is een nieuwe route-map (naast `tasks`/`availability`/`settings`/`home`), volgt hetzelfde `[param]`-route-envelope-patroon en dezelfde ownership-check-conventie (404 bij niet-eigen) als Story 4.3's `server/api/tasks/[id].get.ts`.

### Project Structure Notes

`server/api/sessions/[sessionId]/stop.post.ts` en `heartbeat.post.ts` zijn de eerste routes onder `server/api/sessions/`. Geen domain-tussenlaag nodig (puur een timestamp-UPDATE, geen scheduling-/Calendar-logica).

### Testen

Geen testframework in dit project. `beforeunload`/`sendBeacon` is inherent lastig geautomatiseerd te testen (zie Task 4) — codelezing + het reeds-geverifieerde patroon van de `stop`-route zelf (via de gewone Stop-knop-aanroep) geven voldoende vertrouwen.

## Previous Story Intelligence (Story 4.4, inclusief de code review)

- **Ontbrekende `ORDER BY` was de grootste review-vondst** (drie reviewers onafhankelijk) — elke nieuwe query in déze story (`getSessionById` is een single-row-lookup, geen ordening nodig) is hiertegen gecontroleerd; niet van toepassing hier, maar de discipline blijft: expliciet nadenken over of ordening relevant is bij elke nieuwe query.
- **Fail-soft-degradatie kan een AC stilzwijgend schenden** (Story 4.4's race-conditie-fix) — relevant hier: de heartbeat/stop-fire-and-forget-aanroepen mogen falen zonder de UI te breken (AC #2/#3 vereisen geen zichtbare bevestiging), maar mogen ook geen ándere AC stilzwijgend ondermijnen. Er is hier geen equivalent risico (deze aanroepen hebben geen downstream weergave-effect zoals 4.4's subtaken-fallback had).
- **`sessieActiefTaak`/`sessieOverzichtLog`-useState-patroon blijft ongewijzigd** — déze story voegt er geen nieuwe useState-doorgifte aan toe, alleen server-round-trips naast de al-bestaande client-state.
- **Live-DB-verificatie via een tijdelijke debug-route** blijft het gevestigde patroon voor het bevestigen van een daadwerkelijke database-schrijving (hier: `stoppedAt` gevuld na een stop-signaal).

## Git Intelligence

Laatste commit: `4817da2` (Story 4.4 incl. code review — timer, pauzeren, subtaken-wachtrij, met een door alle drie reviewers gevonden ontbrekende `ORDER BY`-fix). Déze story is de eerste die daadwerkelijk buiten de client-only useState-doorgifte treedt: echte server-aanroepen vanuit een actieve sessie, en de eerste schema-migratie sinds Story 3.5's `googleEventId`.

## References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 496-514 (Story 4.5's User Story + AC, brontekst)
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.3-sessie-actief/1.3-sessie-actief.md] — regels 273-291 (`active-leave-confirm-modal`, `beforeunload`/`sendBeacon`), regels 340-349 (API Endpoints: `/api/sessions/{sessionId}/stop`, `/heartbeat`), regel 405 (Open Question #6, heartbeat-interval — onopgelost, hier ingevuld)
- [Source: server/data/schema.ts] — regels 138-157 (`sessions`-tabel, `googleEventId`'s nullable-kolom-precedent hergebruikt voor `lastHeartbeatAt`/`stoppedAt`)
- [Source: server/api/tasks/[id].get.ts] — Story 4.3/4.4, wordt hier uitgebreid met `sessionId` (niet herbouwd)
- [Source: app/pages/sessie/actief.vue] — Story 4.4, `stopSessie`/timer-interval-opruiming worden hier uitgebreid (niet herbouwd)
- [Source: drizzle.config.ts] — migratie-workflow (`generate` dan `migrate`, nooit `push`)

## Open Questions

1. **`HEARTBEAT_INTERVAL_MS = 30 000` (30 seconden)** — UX-spec se eigen Open Question #6 laat dit open. Zeg het als een ander interval (bv. elke minuut, zoals de vraag zelf als voorbeeld noemt) de voorkeur heeft.
2. **`lastHeartbeatAt`/`stoppedAt` worden hier alleen geschreven, nog niet gelezen/gebruikt** — de daadwerkelijke "gebruik het laatste heartbeat-moment als fallback-eindpunt"-logica (AC #3's tweede helft) heeft nog geen consument: geen enkele huidige story berekent hiermee een effectief sessie-einde. Dat hoort waarschijnlijk bij Story 4.7 (replanning) of een latere Epic-6-story. Zeg het als déze story ook al die berekening/consumptie moet bouwen i.p.v. alleen de kolommen te vullen.
3. **`active-leave-confirm-modal` hergebruikt geen bestaand modal-component** — dit project heeft al een `taak-confirm-overlay`-patroon (Story 3.1/3.3), maar met een ander specifiek doel/tekst; hier een nieuw, vergelijkbaar-gestileerd element gebouwd i.p.v. hergebruikt. Zeg het als hergebruik/refactor naar een gedeeld modal-component al in déze story gewenst is.
4. **Hamburgermenu-trigger is momenteel niet te testen** (bestaat nog niet als navigatiedoel) — de guard vangt 'm architecturaal al af zodra een menu bestaat, maar dat is voor déze story niet live te verifiëren. Zie "Belangrijk".

## Review Findings

**Reviewers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor (parallel adversarial review, 2026-08-02)

### Patched

1. **Fire-and-forget `stop`/`heartbeat`-aanroepen misten een `.catch`** (Blind Hunter + Edge Case Hunter) — een falende `$fetch` zou een onafgevangen promise-rejection geven. Patch: `.catch(fout => console.error(...))` toegevoegd aan beide aanroepen in `app/pages/sessie/actief.vue`.
2. **`sessionId` niet ge-`encodeURIComponent`'d in de `$fetch`/`sendBeacon`-URL's** (Edge Case Hunter) — UUID's bevatten in de praktijk geen URL-onveilige tekens, maar de rest van de codebase past dit patroon consequent toe (zie `taak.value.id` elders). Patch: `encodeURIComponent(taak.value.sessionId)` toegevoegd aan alle vier de aanroepen.
3. **Ongebruikte `Blob`-payload op `sendBeacon`** (Blind Hunter) — `stuurStopBeacon` bouwde een payload op die de server-route toch niet leest (de route identificeert de sessie via de URL, niet de body). Patch: verwijderd, `sendBeacon(url)` zonder tweede argument.
4. **`stuurStopBeacon` sloeg over bij een gepauzeerde sessie** (Acceptance Auditor) — AC #2 vereist dat een tabblad-sluiting altijd een stop-signaal stuurt, actief of gepauzeerd. De oorspronkelijke `isPaused`-guard (gekopieerd van `stuurHeartbeat`, waar hij wél hoort) zou een gepauzeerde-en-dan-gesloten sessie stil laten "hangen". Patch: de guard verwijderd uit `stuurStopBeacon`; `stuurHeartbeat` behoudt 'm terecht (een heartbeat tijdens pauze is zinloos, geen actief-bewijs).
5. **`bevestigVerlaten` had geen null-guard op `taak.value`** (Edge Case Hunter) — een (onwaarschijnlijke maar niet onmogelijke) race waarbij `taak` al `null` is wanneer de modal bevestigd wordt, zou `stopSessie` laten crashen op `taak.value.sessionId`. Patch: expliciete `if (!taak.value) { navigateTo('/'); return }` vóór de `stopSessie()`-aanroep.
6. **`markSessionHeartbeat` ontbrak een ordening-guard tegen een laat aankomende heartbeat ná stop** (Blind Hunter + Edge Case Hunter, onafhankelijk gevonden) — zonder guard kan een heartbeat die vlak vóór een stop-signaal al onderweg was, ná de `stoppedAt`-write aankomen en die sessie weer "actief" laten lijken (`lastHeartbeatAt > stoppedAt`). Patch: `WHERE ... AND isNull(sessions.stoppedAt)` toegevoegd aan de `UPDATE` in `server/data/tasks.ts`.

### Defer

7. **`active-leave-confirm-modal` heeft geen `role="dialog"`, geen focus-trap, geen Escape-handler** (Acceptance Auditor) — toegankelijkheidsgat, geen AC-schending (geen enkele AC noemt toetsenbord-/screenreader-navigatie voor dit element) en geen bestaand modal-component in de codebase om op aan te sluiten (zie Open Question #3). Toegevoegd aan `deferred-work.md`.

### Dismissed

- **Duplicatie tussen `stop.post.ts`/`heartbeat.post.ts`'s ownership-check + `envelope()`-helper** (Blind Hunter) — matcht het al geaccepteerde, bewust-gedupliceerde `envelope()`-patroon uit Story 2.1/2.2 (nu 3x aanwezig in de codebase, al vastgelegd in `deferred-work.md`'s bestaande entry). Geen nieuwe actie nodig.
- **"`meta/_journal.json`/`meta/0009_snapshot.json` ontbreken"** (Blind Hunter) — geverifieerd onjuist: beide bestanden bestonden en waren correct bijgewerkt door `drizzle-kit generate`, alleen nog niet ge-`git add`'d. Geen fix nodig.
- **Open Question #2 (heartbeat-consumptielogica nog niet gebouwd)** (Acceptance Auditor) — al expliciet zelf-gedisclosed in de story als bewuste scope-grens (hoort bij Story 4.7/Epic 6), geen stille AC-schending.

### Post-patch verificatie

`npm run typecheck` en `npx nuxt build` slagen na alle patches. Herdeployed naar `dev`. Live regressietest tegen `flowz.fyi` met een nieuwe testtaak bevestigt: browser-terugknop tijdens een actieve sessie toont de modal; "Nee, blijf hier" sluit 'm zonder navigatie; browser-terugknop tijdens een gepauzeerde sessie navigeert direct door zonder modal; de Stop-knop bypasst de guard en navigeert naar de verwachte 404 op `/sessie/overzicht`. Een tijdelijke debug-route (`server/api/_debug/cleanup.get.ts`, ná gebruik verwijderd + herdeployed + 404 bevestigd) las de database direct uit en bevestigde `stoppedAt` correct gevuld (`lastHeartbeatAt` bleef `null`, verwacht: de 30s-heartbeat-interval kreeg tijdens deze korte test geen kans om te vuren). Testtaak + Calendar-event opgeruimd.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-02 | Story aangemaakt via create-story, voortbouwend op Story 4.4 (done). Nieuwe datagap geïdentificeerd en in scope opgenomen: `sessionId` ontbrak nog volledig in de client-datastroom (nodig voor de nieuwe `/api/sessions/{sessionId}/...`-routes). Eerste schema-migratie sinds Story 3.5 (twee nullable timestamp-kolommen op `sessions`, bewust beperkt tot wat déze story's AC's nodig hebben). Scope-nuance gedocumenteerd over het (nog niet bestaande) hamburgermenu als AC #1-trigger. |
| 2026-08-02 | Taken 1-4 afgerond: `sessions.lastHeartbeatAt`/`stoppedAt` (nieuwe migratie 0009, toegepast tegen `dev`), `getSessionById`/`markSessionHeartbeat`/`markSessionStopped` (nieuw), `sessionId` toegevoegd aan `TaskPrepResponse`/`[id].get.ts`, twee nieuwe routes (`server/api/sessions/[sessionId]/stop.post.ts`/`heartbeat.post.ts`), `app/pages/sessie/actief.vue` uitgebreid met `active-leave-confirm-modal`, een `onBeforeRouteLeave`-guard, `beforeunload`/`sendBeacon`, en een 30s-heartbeat-interval. Typecheck/build slagen. Live end-to-end geverifieerd tegen de dev-stage: browser-terugknop tijdens een actieve sessie toont de modal (timer blijft doorlopen); "Nee, blijf hier" sluit de modal zonder reset; browser-terugknop tijdens een **gepauzeerde** sessie toont géén modal (navigeert gewoon door); de Stop-knop triggert zelf niet de modal (`isIntentionalLeave` werkt) en navigeert direct naar de verwachte 404 op `/sessie/overzicht`; een tijdelijke debug-route bevestigde zowel `lastHeartbeatAt` als `stoppedAt` daadwerkelijk gevuld in de database ná de sessie. `beforeunload`/`sendBeacon` zelf kon niet live end-to-end getest worden (een tabblad echt sluiten onderbreekt de test) — geverifieerd via codelezing, zoals vooraf gedocumenteerd als bekende beperking. Testtaak en beide debug-routes opgeruimd. Status → review. |
| 2026-08-02 | Code review afgerond (3-agent adversarial review): 6 bevindingen gepatcht (ontbrekende `.catch` op fire-and-forget-aanroepen, `encodeURIComponent` op `sessionId` in URL's, ongebruikte `Blob`-payload op `sendBeacon` verwijderd, `isPaused`-guard uit `stuurStopBeacon` verwijderd zodat een gepauzeerde-en-gesloten sessie ook een stop-signaal stuurt, null-guard in `bevestigVerlaten`, server-side `isNull(stoppedAt)`-ordening-guard op `markSessionHeartbeat`), 1 bevinding gedeferred (modal-toegankelijkheid, naar `deferred-work.md`), 3 bevindingen gedismissed (al-geaccepteerde `envelope()`-duplicatie, onterechte "ontbrekende migratie-meta"-claim, al-gedisclosede heartbeat-consumptie-scope). Post-patch: typecheck/build slagen, herdeployed naar `dev`, live regressietest bevestigt alle drie de kern-AC's blijven correct werken, database-lezing bevestigt `stoppedAt` correct gevuld. Debug-route + testtaak + Calendar-event opgeruimd. Status → done. |
| 2026-08-17 | **Open Question #4 (heartbeat-consumptielogica) alsnog opgepakt**, na een audit op verzoek van Hillebrand van alle Dev Notes op vergelijkbare niet-gelogde gaten (aanleiding: de `/instellingen/beschikbare-tijd`-menu-omissie). De genoemde trigger ("Story 4.7 of een latere Epic-6-story") was allang afgegaan — Epic 4 én Epic 6 zijn beide `done` — maar niemand had het opgepakt. Ontwerpkeuze (Hillebrand): stil automatisch afronden bij hervatten, geen bevestigingsprompt. Nieuw `server/domain/scheduling/session-heartbeat-fallback.ts` (`finalizeStaleSessionIfNeeded`): bij `GET /api/tasks/[id]` (het moment waarop Evelien een sessie voor een taak (her)start) wordt gecontroleerd of de huidige sessierij een `lastHeartbeatAt` draagt zonder `stoppedAt`, ouder dan 5 minuten (`STALE_THRESHOLD_MS`, ruim boven de 30s-heartbeat-interval om vals-positieven door achtergrondtab-throttling te vermijden) — zo ja, wordt de bestede tijd (`lastHeartbeatAt - startsAt`, geclampt op `[0, plannedMinutes]`) gelogd via `replanAfterSession(..., null)` (geen resterende-tijd-wijziging, taak blijft open) en wordt de sessierij gereset (`lastHeartbeatAt`/`stoppedAt` terug naar `null`) zodat een hernieuwde poging weer normaal kan heartbeaten. `typecheck`/`build` beide schoon, gedeployed, live geverifieerd met een gesimuleerde verweesde sessie (20 minuten oude heartbeat): correcte `session_logs`-rij (`actualMinutes: 20`) aangemaakt, sessierij correct gereset, taak bleef open. Negatieve controle bevestigd: een recente heartbeat triggert niets (geen nieuwe log-rij, velden ongewijzigd). Testdata opgeruimd. `deferred-work.md` bijgewerkt. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **AWS-sessie verlopen tijdens de migratiestap** — `npx sst shell -- drizzle-kit generate` faalde eerst op verlopen credentials, opgelost met `aws login` en `aws sts get-caller-identity`-bevestiging vóór het opnieuw proberen, zelfde patroon als eerdere stories in deze sessie.
- **Typefout tijdens implementatie**: `sessie/starten.vue`'s `taak`-computed (al eerder `Omit<PrepTaak, 'subtasks'>` na Story 4.4) moest ook `sessionId` uitsluiten — dezelfde reden als Story 4.4's fix: de `sessieStartTaak`-useState-fallback (vanuit 1.1) heeft nooit `sessionId` gedragen en zal dat ook nooit doen.
- **Live-verificatie bevestigde alle drie de AC's**: de modal verscheen correct bij een browser-terugnavigatie tijdens een actieve sessie (en niet tijdens een gepauzeerde), de Stop-knop triggerde de modal niet dankzij `isIntentionalLeave`, en een tijdelijke debug-route bevestigde zowel `lastHeartbeatAt` als `stoppedAt` daadwerkelijk in de database.
- `beforeunload`/`sendBeacon` (AC #2) kon niet live end-to-end getest worden — een tabblad daadwerkelijk sluiten zou de sessie zelf onderbreken. Geverifieerd via codelezing (listener-registratie, `sendBeacon`-aanroepvorm), zelfde erkende, vooraf gedocumenteerde beperking als Story 4.1's `useState`-op-een-404-pagina-introspectie.
- Testtaak + tijdelijke debug-route (`server/api/_debug/cleanup.get.ts`, gebruikt voor zowel opruiming als database-verificatie ná de code review) verwijderd + herdeployed + 404 bevestigd vóór afronding.

### Completion Notes List

- **AC #1/#3 zijn end-to-end live geverifieerd** (inclusief de database-bevestiging van `lastHeartbeatAt`/`stoppedAt`). **AC #2 is deels geverifieerd** (de route/aanroep-vorm via codelezing, niet het volledige `beforeunload`-scenario zelf).
- **Eerste story die daadwerkelijk buiten de client-only `useState`-doorgifte treedt** — echte server-round-trips (stop/heartbeat) vanuit een actieve sessie, en de eerste schema-migratie sinds Story 3.5.
- **Twee datagaps (`sessionId`, en het al-bekende `Omit`-patroon) al vóór dev-story ontdekt en opgelost** — niet pas tijdens implementatie of review, dankzij de fresh-context-validatiepas én het al-herkende patroon uit Story 4.4.
- **Vier Open Questions blijven open voor Hillebrand** (heartbeat-interval, of déze story ook al de heartbeat-consumptielogica moet bouwen, modal-component-hergebruik, hamburgermenu-trigger niet live testbaar) — geen van alle blokkeerde de implementatie.

### File List

**Nieuw:**
- `server/api/sessions/[sessionId]/stop.post.ts`
- `server/api/sessions/[sessionId]/heartbeat.post.ts`
- `server/data/migrations/0009_classy_enchantress.sql`

**Gewijzigd:**
- `server/data/schema.ts` (`sessions.lastHeartbeatAt`/`stoppedAt`)
- `server/data/tasks.ts` (`getSessionById`, `markSessionHeartbeat`, `markSessionStopped`)
- `shared/types/tasks.d.ts` (`TaskPrepResponse.sessionId`)
- `server/api/tasks/[id].get.ts` (`sessionId` toegevoegd aan de response)
- `app/pages/sessie/starten.vue` (`Omit`-type uitgebreid met `sessionId`)
- `app/pages/sessie/actief.vue` (leave-confirm-modal, `onBeforeRouteLeave`-guard, `beforeunload`/`sendBeacon`, heartbeat-interval)

**Live gedeployed + gemigreerd:** stage `dev` op `flowz.fyi`, migratie `0009_classy_enchantress.sql` toegepast via `drizzle-kit migrate`. Tijdelijke debug-routes zijn ná gebruik verwijderd en horen niet bij deze File List.

**Toegevoegd/gewijzigd bij het oppakken van Open Question #4 (2026-08-17):**
- `server/domain/scheduling/session-heartbeat-fallback.ts` (nieuw — `finalizeStaleSessionIfNeeded`)
- `server/data/tasks.ts` (gewijzigd — `resetSessionHeartbeatTracking` toegevoegd)
- `server/api/tasks/[id].get.ts` (gewijzigd — roept `finalizeStaleSessionIfNeeded` aan vóór het teruggeven van de sessie-prep-data)
