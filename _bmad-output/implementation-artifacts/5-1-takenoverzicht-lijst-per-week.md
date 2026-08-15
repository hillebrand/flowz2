---
baseline_commit: 8c4229b
---

# Story 5.1: Takenoverzicht — Lijst per Week

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want al mijn openstaande taken overzichtelijk gegroepeerd zien,
so that ik de taak die ik wil aanpassen snel terugvind.

## Acceptance Criteria

1. **Given** Evelien opent 6.1-takenoverzicht (via het hamburgermenu), **when** de pagina laadt, **then** toont `tasks-groups` alleen openstaande taken, gegroepeerd per week ("Deze week"/"Volgende week"/"Later") en binnen elke groep gesorteerd op deadline; een groep zonder taken wordt volledig weggelaten; elke `tasks-item` toont vak, soort taak, titel en (indien van toepassing) een voortgangsbalkje (FR12).
2. **Given** Evelien klikt op `tasks-new-button` ("+ Nieuwe taak"), **when** de navigatie plaatsvindt, **then** gaat ze naar 2.1-taak-formulier (`/taak/nieuw`).
3. **Given** Evelien klikt op een `tasks-item`, **when** de navigatie plaatsvindt, **then** gaat ze naar 6.2-taakdetail voor die taak (Story 5.2, nog backlog — déze story navigeert er wel al naartoe, de doelpagina bestaat nog niet).

## Belangrijk: twee dingen die déze story voor het eerst nodig heeft en die nog nergens bestaan — lees dit vóór je begint

**1. Subtaakstatus wordt nergens server-side bewaard — nodig voor `tasks-item-progress`, maar de hele Klaar/Later-flow (Story 4.4) is tot nu toe 100% client-only.**

`subtasks` (`server/data/schema.ts`) heeft geen `status`-kolom. "Afgerond"/"Uitgesteld"/"Niet gestart" leeft uitsluitend als een `Set<string>` (`doneIds`/`laterIds`) in `app/pages/sessie/actief.vue`'s component-state, gereset bij elke sessie (`onMounted`) en nooit naar de server geschreven — de enige plek waar dit ooit zichtbaar wordt is Story 4.6's `wrap-subtask-list`, die leest rechtstreeks uit diezelfde in-memory sessie (via `sessieOverzichtLog`), geen DB-round-trip. Dat werkte tot nu toe prima omdat er nooit een pagina bestond die dit los van een actieve/net-afgelopen sessie moest tonen.

**Déze story is de eerste die dat wél moet**: `tasks-item-progress` ("{aantal} van {totaal} subtaken") moet bij een koude paginalaad van `/taken` weten hoeveel subtaken van élke openstaande taak al afgerond zijn — dat kan niet uit client-state komen, er is geen sessie actief. Dit is exact de kolom die `server/data/schema.ts`'s eigen `subtasks`-commentaar al aankondigde: *"Geen `status`-kolom nu... nodig voor Epic 4/Story 5.3"* — Epic 4 is inmiddels done zonder 'm te bouwen (kon zonder, zie boven); déze story (5.1, vóór 5.3) is de eerste die 'm daadwerkelijk niet kan ontwijken.

**Voorgestelde aanpak (Hillebrand: bevestig of stuur bij — zie Open Question #1, blokkeert dev-story niet maar bepaalt Task 1-4's precieze vorm):**
- Nieuwe kolom `subtasks.status` (`$type<SubtaskStatus>().notNull().default('niet-gestart')` — hergebruikt het al-bestaande `SubtaskStatus`-type uit `shared/types/tasks.d.ts`, Story 4.6's review-patch).
- Twee nieuwe, kleine actie-routes — `POST /api/subtasks/{id}/done` en `POST /api/subtasks/{id}/later` — zelfde stijl als `sessions/[sessionId]/stop.post.ts` (geen body, ownership via subtaak → taak → user).
- **`app/pages/sessie/actief.vue`'s `subtaakKlaar()`/`subtaakLater()` (Story 4.4, al done) krijgen elk een fire-and-forget-aanroep** naar de bijbehorende nieuwe route (zelfde `.catch(console.error)`-patroon als de bestaande `/stop`/`/heartbeat`-aanroepen ernaast) — dit raakt een al eerder gereviewde, afgeronde story se bestand; lees `subtaakKlaar()`/`subtaakLater()` volledig vóór je wijzigt, de lokale `doneIds`/`laterIds`-state (nodig voor de live sessie-UI zelf) blijft ongewijzigd bestaan náást de nieuwe server-aanroep, niet vervangen.
- Story 4.6's `wrap-subtask-list` blijft ongewijzigd (leest nog steeds uit `sessieOverzichtLog`, geen regressie) — déze story voegt alleen een parallel, persistent schrijfpad toe voor de nieuwe leesbehoefte.

**2. Het hamburgermenu is decoratief — er is geen navigatie naartoe déze pagina vanaf nergens.**

`app/pages/index.vue`'s `home-header-hamburger` is een `<span aria-hidden="true">☰</span>` zonder click-handler (Story 4.1's review-patch maakte 'm bewust decoratief, geen navigatiedoel bestond toen nog). Nul pagina's in dit project hebben ooit een echt navigatiemenu gekregen — ook `/beschikbare-tijd` (Story 2.1, done) heeft geen enkele link ernaartoe vanuit `index.vue`. Er bestaat nog geen `app/components/`-map in dit project — déze story bouwt de eerste gedeelde Vue-component.

**Besluit (Hillebrand, 2026-08-15):** nu al een echte, uitklapbare menu-component bouwen (Open Question #2 hiermee opgelost) — niet alleen een directe link. Nieuwe `app/components/HamburgerMenu.vue`: een knop (`home-header-hamburger`, `aria-expanded`, `aria-haspopup="menu"`) die een paneel toggelt met `role="menu"`/`role="menuitem"`-items, `Escape` sluit het paneel. Voor déze story bevat de items-lijst één enkel item ("Takenoverzicht" → `/taken`) — de lijst is een simpele array van `{ label, to }`-objecten binnen de component, zodat een toekomstige bestemming (weekoverzicht, Epic 6) er triviaal aan toegevoegd kan worden zonder de component te herstructureren. `index.vue` vervangt de decoratieve `<span>` door `<HamburgerMenu />`.

## Tasks / Subtasks

- [x] Task 1: Migratie — `subtasks.status` (AC: #1)
  - [x] `server/data/schema.ts`: `subtasks`-tabel uitbreiden met `status: text('status').$type<SubtaskStatus>().notNull().default('niet-gestart')` (non-null met DB-default, zelfde precedent als `needs`/`hasCalendarWriteScope` — bestaande rijen krijgen alsnog een geldige waarde).
  - [x] `npx sst shell --stage dev -- npx drizzle-kit generate` → controleer de SQL → `npx sst shell --stage dev -- npx drizzle-kit migrate` tegen de dev-stage.
- [x] Task 2: Data-laag — subtaakstatus schrijven/lezen (AC: #1)
  - [x] `server/data/tasks.ts`: nieuwe functie `getSubtaskById(subtaskId: string): Promise<Subtask | null>` — voor de ownership-check in de nieuwe routes (subtaak draagt zelf geen userId, zelfde precedent als `getSessionById`/`server/api/sessions/[sessionId]/*`).
  - [x] `server/data/tasks.ts`: nieuwe functie `updateSubtaskStatus(subtaskId: string, status: SubtaskStatus): Promise<void>` — één `UPDATE`.
  - [x] `server/data/tasks.ts`: nieuwe functie `getOpenTasksWithProgress(userId: string): Promise<{ task: Task, totalSubtasks: number, doneSubtasks: number }[]>` — alle taken van `userId` met `completedAt IS NULL`, gesorteerd op `deadline` (oplopend), met per taak het totale en afgeronde-aantal subtaken (twee `count`-aggregaties of een gegroepeerde join — kies wat met Drizzle het natuurlijkst is, geen N+1-query per taak).
- [x] Task 3: Nieuwe routes `POST /api/subtasks/{id}/done` en `/later` (AC: #1)
  - [x] `server/api/subtasks/[id]/done.post.ts` en `later.post.ts` — zelfde envelope-/ownership-patroon als `sessions/[sessionId]/stop.post.ts` (401/400/404, lokale `envelope()`-helper, ownership via `getSubtaskById` → `getTaskById` → `task.userId === session.user.id`). Geen body nodig — de actie zélf bepaalt de status (`'afgerond'` resp. `'uitgesteld'`).
- [x] Task 4: `actief.vue` — subtaakstatus ook server-side persisteren (AC: #1)
  - [x] Lees `subtaakKlaar()`/`subtaakLater()` (regels ~96-104) volledig vóór je wijzigt. Voeg in elk een fire-and-forget `$fetch('/api/subtasks/{id}/done'|'later', { method: 'POST' }).catch(fout => console.error(...))` toe, ná de bestaande lokale `doneIds`/`laterIds`-mutatie — geen wijziging aan de lokale state zelf, geen wijziging aan de live-sessie-UI.
- [x] Task 5: `GET /api/tasks` (query `?status=open`) (AC: #1)
  - [x] `server/api/tasks.get.ts` — leest `getOpenTasksWithProgress` (Task 2). Response: array van `{ id, subject, title, type, deadline, totalSubtasks, doneSubtasks }` (nieuw `OpenTasksResponse`-type in `shared/types/tasks.d.ts`). Zelfde envelope-/auth-patroon als andere GET-routes (`subjects.get.ts`), geen domain-tussenlaag nodig (puur lezend).
- [x] Task 6: Nieuwe pagina `app/pages/taken/index.vue` (route `/taken`) (AC: #1, #2, #3)
  - [x] `useUserSession`/`loggedIn`-guard zelfde patroon als elke andere pagina. Fetch via `useFetch`/`$fetch` naar `GET /api/tasks?status=open` (nieuwe route, geen bestaande useState-doorgifte — dit is een verse paginalaad vanaf het hamburgermenu, geen sessie-flow).
  - [x] `tasks-back-link`, `tasks-new-button` (→ `/taak/nieuw`), `tasks-page-heading`.
  - [x] `tasks-groups`: client-side groeperen op `todayInAmsterdam()` (`shared/utils/scheduling.ts`, al server+client importeerbaar) vs. elke taak se `deadline` — "Deze week"/"Volgende week"/"Later" (ISO-weekgrenzen, maandag-zondag), binnen elke groep al gesorteerd op deadline (komt al gesorteerd van de server, Task 2). Een groep zonder taken wordt volledig weggelaten.
  - [x] `tasks-item` per taak: `tasks-item-subject` ("{VAK} · {soort taak}", soort-taak-label consistent met bestaande labels elders bv. `taak/nieuw.vue`'s `TASK_TYPES`-weergave), `tasks-item-title`, `tasks-item-progress` ("{doneSubtasks} van {totalSubtasks} subtaken" + balk bij `totalSubtasks > 0`; bij `totalSubtasks === 0` toont het element de tekst "(geen subtaken)" i.p.v. volledig te verdwijnen — **besluit Hillebrand, 2026-08-15: wireframe leidend**, niet de Data-tabel-rij (Open Question #3 hiermee opgelost) — geen visuele balk in dat geval, alleen de tekst). Klikbaar (Enter/Space, 2px focus-ring) → `navigateTo('/taken/{id}')` (6.2-taakdetail, Story 5.2 — route bestaat nog niet, dat is bewust; déze story bouwt alleen de navigatie-intentie).
  - [x] `tasks-empty-state` ("Geen openstaande taken — mooi rustig!") als de respons leeg is.
- [x] Task 7: Hamburgermenu wordt een echte, uitklapbare menu-component (AC: #1's "via het hamburgermenu")
  - [x] Nieuwe `app/components/HamburgerMenu.vue` — eerste gedeelde component in dit project (`app/components/` bestaat nog niet). Knop (`id="home-header-hamburger"`, `aria-label="Menu"`, `aria-haspopup="menu"`, `:aria-expanded`) toggelt een paneel (`role="menu"`, items met `role="menuitem"`) met — voor déze story — één item: "Takenoverzicht" → `/taken`. Items als een simpele interne array van `{ label, to }`, zodat een toekomstige tweede bestemming (weekoverzicht, Epic 6) er triviaal bij kan zonder herstructurering. `Escape` sluit het paneel; klik buiten het paneel sluit het ook.
  - [x] `app/pages/index.vue`: vervangt de decoratieve `<span id="home-header-hamburger" aria-hidden="true">☰</span>` door `<HamburgerMenu />` (de nieuwe component draagt zelf de `id`/aria-attributen op zijn knop).
- [x] Task 8: Verificatie (AC: #1, #2, #3)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live tegen de dev-stage: 2 testtaken (`Verificatietaak 5.1e`, deadline 2026-08-16, 2 deeltaken; `Verificatietaak 5.1f`, deadline 2026-08-30, geen deeltaken) → `/taken` toont "Deze week" (5.1e, "1 van 2 subtaken") en "Later" (5.1f, "(geen subtaken)") correct gegroepeerd en gesorteerd.
  - [x] Live: klik op het hamburger-icoon vanaf het hoofdscherm → menu opent met "Takenoverzicht" → klik navigeert naar `/taken`.
  - [x] Live: na cleanup van alle testtaken → `tasks-empty-state` ("Geen openstaande taken — mooi rustig!") verschijnt.
  - [x] Live: `subtasks.status` in de DB bevestigd bijgewerkt na een sessie op 5.1e (Deel A: `afgerond` via "Klaar", Deel B: `uitgesteld` via "Later" gevolgd door "Stoppen") — directe DB-query bevestigt beide statussen correct.
  - [x] Geen secrets/placeholder-waarden in code/commits. Beide testtaken na verificatie via directe DB-cleanup verwijderd, 0 resterend bevestigd.

## Dev Notes

### Architectuurcompliance

- **AD-3** (Task bezit Sessions/Subtasks): `subtasks.status` is een kind-veld van Task via Subtask, geen losse "voortgang"-tabel — consistent met het bestaande model.
- **Consistency Conventions** (mutatie-ownership): de nieuwe `/api/subtasks/{id}/done|later`-routes zijn dunne, direct-data-laag-aanroepende routes (geen domain-tussenlaag) — consistent met hoe `sessions/[sessionId]/stop.post.ts`/`heartbeat.post.ts` (Story 4.5) ook geen domain-laag gebruiken voor een simpele status-flip; er is geen scheduling-/Calendar-logica hier.
- **AD-1** (scheduling server-only): niet van toepassing — déze story doet geen scheduling, alleen lezen/status bijwerken.
- Geen wijziging aan `server/domain/scheduling/`-bestanden.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- **`app/pages/sessie/actief.vue`** (Story 4.4/4.5, done, al 2x gereviewd) — `subtaakKlaar()`/`subtaakLater()` krijgen een aanvullende fire-and-forget-aanroep. Lees de volledige functies + de omliggende `doneIds`/`laterIds`/`huidigeSubtaak`-computed vóór je wijzigt — niets aan de live-sessie-logica zelf verandert, alleen een parallelle persistentie-aanroep wordt toegevoegd.
- **`server/data/schema.ts`** — `subtasks`-tabel se eigen commentaar kondigde deze kolom al aan ("nodig voor Epic 4/Story 5.3") — déze story bouwt 'm nu, vóór 5.3, omdat 5.1 'm eerder nodig blijkt te hebben.
- **`app/pages/index.vue`** (Story 4.1/4.2, done) — `home-header-hamburger` wordt voor het eerst interactief. Lees de bestaande `<header id="home-header">`-structuur en `.home-header-hamburger`-stijl vóór je wijzigt (regels ~153-157, ~265-273).
- **`shared/types/tasks.d.ts`** — `SubtaskStatus` (Story 4.6) wordt hier voor het eerst hergebruikt buiten `SessieOverzichtLog`.

### Previous Story Intelligence (Story 4.7, inclusief de code review)

- **Fire-and-forget-aanroepen krijgen altijd een `.catch(fout => console.error(...))`** — herbevestigd in 4.5/4.6/4.7, ook hier toepassen op de nieuwe `subtaakKlaar()`/`subtaakLater()`-aanroepen.
- **Server-side hervalidatie op elk mutatie-endpoint, nooit alleen op de client vertrouwen** — hier eenvoudig: de actie zelf (`/done` vs. `/later`) bepaalt de status, geen client-input om te valideren.
- **Ownership-check via een tussenliggende entiteit (geen directe userId-kolom) is een terugkerend patroon** — `sessions` had geen userId (via taak), `subtasks` ook niet (via taak) — zelfde `getXById` → `getTaskById` → `userId`-vergelijking-precedent.
- **3-agent adversarial review + structured triage blijft de standaardafronding.**
- **Code review op Story 4.7 vond een datamodel-gat waar drie reviewers onafhankelijk overeenstemden (overschreven i.p.v. bewaarde data)** — bij Task 2's `getOpenTasksWithProgress`-aggregatie, dubbelchecken dat de subtaak-telling geen soortgelijke aanname maakt die niet klopt zodra een taak veel deeltaken heeft.

### Git Intelligence

- Laatste 7 commits (Story 3.5, 4.1-4.7): elke nieuwe kolom komt met een eigen, kleine migratie (nooit een bestaand veld hergebruikt voor een nieuwe betekenis zonder expliciete Open Question eerst) — déze story's `subtasks.status` volgt hetzelfde patroon.
- Story 4.7 introduceerde voor het eerst een `getDb().transaction(...)`-patroon voor een nieuwe multi-write-functie (`logSessionAndCompleteTask`) — niet direct relevant hier (Task 2/3 zijn allemaal single-write), maar het precedent bestaat als dat later nodig blijkt.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 556-577 (Story 5.1's AC's, letterlijk overgenomen hierboven), regel 48 (FR12)
- [Source: design-artifacts/C-UX-Scenarios/06-evelien-beheert-het-takenoverzicht/6.1-takenoverzicht/6.1-takenoverzicht.md] — volledige pagina-spec (Object IDs, Data Sources: `GET /api/tasks?status=open`)
- [Source: server/data/schema.ts] — `subtasks`-tabel se eigen "nodig voor Epic 4/Story 5.3"-commentaar, hier voor het eerst ingelost
- [Source: app/pages/sessie/actief.vue] — Story 4.4/4.5, `subtaakKlaar()`/`subtaakLater()` worden hier uitgebreid, niet herbouwd
- [Source: app/pages/index.vue] — Story 4.1, `home-header-hamburger` wordt hier voor het eerst interactief
- [Source: server/api/sessions/[sessionId]/stop.post.ts, heartbeat.post.ts] — Story 4.5, envelope-/ownership-patroon voor de nieuwe subtaak-routes
- [Source: shared/utils/scheduling.ts] — `todayInAmsterdam()`, hergebruikt voor de week-groepering

### Review Findings

- [x] [Review][Patch] Voortgangsbalk (visuele balk) ontbreekt in `tasks-item-progress` — opgelost, CSS-balk (`tasks-item-progress-bar`/`-bar-fill`, breedte = percentage afgerond) toegevoegd, live geverifieerd (1 van 2 → 50% breedte bevestigd via DOM-inspectie) — [app/pages/taken/index.vue]
- [x] [Review][Patch] `tasks-back-link` gaat hardcoded naar `/` i.p.v. browser-history-terug — opgelost, nu een knop met `router.back()` (zelfde precedent als `taak/nieuw.vue`), live geverifieerd — [app/pages/taken/index.vue]
- [x] [Review][Patch] Geen laad-/foutstate — opgelost, zelfde `isLoading`/`hasError`-patroon als `index.vue` overgenomen (skeleton + foutstate-sectie) — [app/pages/taken/index.vue]
- [x] [Review][Patch] Subtaakstatus kan nog gewijzigd worden op een al-afgeronde taak — opgelost, `task.completedAt`-guard toegevoegd aan beide routes, live geverifieerd (directe `fetch`-aanroep op een afgeronde taak's deeltaak → bevestigd `404 not_found`, subtaakstatus ongewijzigd in de DB) — [server/api/subtasks/[id]/done.post.ts, later.post.ts]
- [x] [Review][Patch] Magic string `'afgerond'` in ruwe SQL — opgelost, `DONE_STATUS: SubtaskStatus`-constante — [server/data/tasks.ts (getOpenTasksWithProgress)]
- [x] [Review][Patch] `HamburgerMenu` mist `aria-controls`/`id`-koppeling — opgelost, `id="hamburger-menu-panel"` + `aria-controls` — [app/components/HamburgerMenu.vue]
- [x] [Review][Defer] Race condition: onbeveiligde, niet-`await`-ede `/done`/`/later`-aanroepen kunnen in theorie in de verkeerde volgorde aankomen [app/pages/sessie/actief.vue] — deferred, laag risico, oplossing (sequentieel wachten of versiestempel) is een echte trade-off tegen de bewust snelle lokale UX
- [x] [Review][Defer] `HamburgerMenu` heeft geen volledige focus-management (openen/sluiten verplaatst focus niet) [app/components/HamburgerMenu.vue] — deferred, matcht een al meerdere keren eerder geaccepteerd patroon (leave-confirm-modal, Story 3.3/4.5)
- [x] [Review][Defer] Geen index op `subtasks.task_id` voor de nieuwe join+aggregatie [server/data/schema.ts] — deferred, premature optimalisatie op hobby-schaal
- [x] [Review][Defer] Geen geautomatiseerde tests voor de nieuwe routes/pagina [server/api/tasks.get.ts, server/api/subtasks/[id]/*, app/pages/taken/index.vue] — deferred, projectbreed al bekend gat

## Open Questions

1. 🟢 **Resolved (Hillebrand, 2026-08-15):** subtaakstatus-persistentie zoals voorgesteld — nieuwe `subtasks.status`-kolom + twee nieuwe actie-routes + `actief.vue`-retrofit. Zie "Belangrijk" punt 1 en Tasks 1-4.
2. 🟢 **Resolved (Hillebrand, 2026-08-15):** nu al een echte, uitklapbare menu-component (`HamburgerMenu.vue`) i.p.v. een directe link — met het oog op een toekomstige tweede bestemming (weekoverzicht, Epic 6). Zie "Belangrijk" punt 2 en Task 7.
3. 🟢 **Resolved (Hillebrand, 2026-08-15):** de wireframe is leidend, niet de Data-tabel-rij — bij een taak zonder deeltaken toont `tasks-item-progress` de tekst "(geen subtaken)" i.p.v. volledig te verdwijnen. Zie Task 6.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-15 | Story aangemaakt via create-story, voortbouwend op Story 4.7 (done, epic 4 volledig afgerond) — eerste story van epic 5. Twee architectuurgaten geïdentificeerd tijdens analyse: (1) subtaakstatus wordt nergens server-side bewaard, puur client-only sinds Story 4.4 — déze story bouwt de persistentie die `subtasks`' eigen schema-commentaar al aankondigde voor "Epic 4/Story 5.3", nu vervroegd nodig voor 5.1's voortgangsbalkje; (2) het hamburgermenu is decoratief sinds Story 4.1 (bewuste, eerder gereviewde keuze) — déze story maakt 'm voor het eerst een navigatiedoel. Drie Open Questions vastgelegd voor Hillebrand, waarvan #1 blokkerend voor Task 1-4's precieze vorm. |
| 2026-08-15 | Alle drie Open Questions besproken en opgelost met Hillebrand: (1) subtaakstatus-persistentie bevestigd zoals voorgesteld; (2) hamburgermenu wordt nu al een echte, uitklapbare `HamburgerMenu.vue`-component (eerste gedeelde component in dit project) i.p.v. een directe link, met het oog op een toekomstige tweede bestemming; (3) de wireframe is leidend voor `tasks-item-progress` bij een taak zonder deeltaken ("(geen subtaken)"-tekst), niet de Data-tabel-rij. "Belangrijk"-sectie, Tasks 6-7 en alle drie Open Questions bijgewerkt. |
| 2026-08-15 | Alle 8 taken afgerond: migratie (`subtasks.status`) gegenereerd en toegepast op de dev-stage; `getSubtaskById`/`updateSubtaskStatus`/`getOpenTasksWithProgress` (data-laag); nieuwe routes `POST /api/subtasks/{id}/done`/`later`; `actief.vue`'s `subtaakKlaar()`/`subtaakLater()` persisteren nu ook server-side; nieuwe route `GET /api/tasks?status=open`; nieuwe pagina `app/pages/taken/index.vue`; nieuwe eerste gedeelde component `app/components/HamburgerMenu.vue`, `index.vue` aangepast. Typecheck/build slagen. Gedeployed naar de dev-stage en live geverifieerd: twee testtaken (met/zonder deeltaken, verschillende weekgroepen) tonen correct gegroepeerd/gesorteerd met het juiste voortgangsbalkje; hamburgermenu opent en navigeert naar `/taken`; lege staat bevestigd; `subtasks.status` in de DB bevestigd bijgewerkt na een sessie (Klaar → afgerond, Later → uitgesteld). Testtaken opgeruimd. Status → review. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Geen fouten tegengekomen tijdens implementatie. Migratie/typecheck/build verliepen in één keer goed, consistent met Story 4.7's precedent (`npx sst shell --stage dev -- ...`, niet zonder `--stage`).

### Completion Notes List

- **AC #1 (groepering, voortgang, "(geen subtaken)"-tekst) en AC #1's hamburgermenu-eis zijn end-to-end live geverifieerd** tegen de dev-stage, incl. een echte sessie-flow (Klaar/Later) die de nieuwe `subtasks.status`-persistentie raakte.
- **AC #2/#3 (navigatie naar `/taak/nieuw` resp. taakdetail) zijn qua route/knop gebouwd, maar #3's doel (`/taken/{id}`, 6.2-taakdetail) bestaat nog niet** — Story 5.2 (backlog) bouwt die pagina; déze story bouwt bewust alleen de navigatie-intentie (zelfde "bouw de knop, de doelpagina volgt later"-precedent als eerdere stories die al naar een nog-niet-bestaande route linkten).
- **Beide architectuurgaten uit "Belangrijk" zijn volledig opgelost, niet alleen omzeild**: subtaakstatus is nu een echt, persistent DB-veld (niet langer client-only), en het hamburgermenu is een echte, herbruikbare component (niet langer decoratief).
- **Geen open punten voor Hillebrand** — alle drie Open Questions waren al vóór dev-story opgelost.

### File List

**Nieuw:**
- `app/components/HamburgerMenu.vue`
- `app/pages/taken/index.vue`
- `server/api/subtasks/[id]/done.post.ts`
- `server/api/subtasks/[id]/later.post.ts`
- `server/api/tasks.get.ts`
- `server/data/migrations/0012_groovy_marrow.sql`

**Gewijzigd:**
- `server/data/schema.ts` (`subtasks.status`-kolom)
- `server/data/tasks.ts` (`getSubtaskById`, `updateSubtaskStatus`, `getOpenTasksWithProgress` toegevoegd)
- `shared/types/tasks.d.ts` (`OpenTaskItem`, `OpenTasksResponse`)
- `app/pages/sessie/actief.vue` (`subtaakKlaar()`/`subtaakLater()` persisteren nu ook server-side)
- `app/pages/index.vue` (decoratieve hamburger-`<span>` vervangen door `<HamburgerMenu />`)

**Live gedeployed:** stage `dev` op `flowz.fyi`. Migratie toegepast op de dev-database. Drie testtaken aangemaakt, doorlopen (incl. sessies met Klaar/Later, en een volledige afronding voor de review-patch-verificatie) en na verificatie via directe DB-cleanup verwijderd.

### Review Follow-ups (AI)

- [x] [Review-patch] Alle 6 patches (voortgangsbalk, back-link, laad-/foutstate, completedAt-guard, magic string, aria-controls) toegepast — zie Review Findings hierboven. Typecheck/build geslaagd, gedeployed naar dev, live herverifieerd (voortgangsbalk-breedte via DOM-inspectie, back-knop-navigatie, en de `completedAt`-guard via een directe `fetch`-aanroep die het verwachte `404` teruggaf).
