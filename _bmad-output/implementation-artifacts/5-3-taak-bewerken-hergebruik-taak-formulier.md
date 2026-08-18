---
baseline_commit: 203f8d7
---

# Story 5.3: Taak Bewerken (Hergebruik Taak-formulier)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want een bestaande taak aanpassen via hetzelfde formulier als bij het aanmaken,
so that ik niet twee verschillende manieren hoef te leren, en de planning meteen herberekend wordt.

## Acceptance Criteria

1. **Given** Evelien komt op 6.3-bewerkformulier vanuit 6.2, **when** de pagina laadt, **then** toont ze exact Epic 3's taak-formulier-componenten, vooringevuld met de bestaande taakgegevens, met paginatitel "Taak bewerken" (i.p.v. "Nieuwe taak").
2. **Given** de taak heeft deeltaken met status "Afgerond", **when** het formulier laadt, **then** zijn die rijen read-only (naam + tijd niet bewerkbaar, geen verwijder-kruisje) met een `taak-subtask-reopen-link` die de status terugzet naar "Niet gestart"; deeltaken met status "Uitgesteld" of "Niet gestart" blijven volledig bewerkbaar.
3. **Given** Evelien wijzigt gegevens en klikt op "Opslaan", **when** de server de taak bijwerkt, **then** gebeurt dit via `PUT /api/tasks/{id}` (i.p.v. `POST`), herberekent de motor het doelmoment (Epic 3's engine) en werkt Epic 2's Calendar-sync eventuele bijbehorende events bij; verschijnt een flash-bevestiging en gaat Evelien terug naar 6.1-takenoverzicht (vast, niet "pagina van herkomst").
4. **Given** Evelien klikt op sluiten (✕) of "Annuleren" zonder wijzigingen, **when** het formulier nog ongewijzigd is, **then** gaat ze direct terug naar 6.2-taakdetail; zijn er al wijzigingen, dan verschijnt eerst een bevestigingsdialoog.

## Belangrijk: dit is de grootste story sinds 4.7 qua architectuurbeslissingen — lees dit vóór je begint

**1. `app/pages/taak/nieuw.vue` (1206 regels) moet hergebruikt worden, niet gedupliceerd.** De UX-spec is expliciet: *"Dit scherm is géén nieuwe specificatie, maar hergebruikt 2.1-Taak-Formulier volledig — zelfde secties, zelfde Object IDs, zelfde componenten, content, interacties, states, validatie."* Een kopie van 1206 regels naar een tweede bestand zou een blijvend synchronisatieprobleem creëren (elke toekomstige wijziging aan het formulier moet dan op twee plekken tegelijk). **Voorgestelde aanpak (Open Question #1, blokkerend):** extraheer de formulier-inhoud naar een gedeelde `app/components/TaakFormulier.vue` (props: `mode: 'nieuw' | 'bewerken'`, `taskId?: string`, `initialData?: TaskEditData`), gebruikt door zowel `app/pages/taak/nieuw.vue` (dunne wrapper) als de nieuwe `app/pages/taken/[id]/bewerken.vue` (dunne wrapper). Dit is de eerste grote component-extractie in dit project (`HamburgerMenu.vue`, Story 5.1, was de eerste maar veel kleiner) — een aanzienlijke refactor van een al-werkend, al-gereviewd bestand. Lees `taak/nieuw.vue` **volledig** vóór je begint; onderscheid binnen die refactor telkens wat `mode`-specifiek is (paginatitel, opslaan-endpoint/-methode, navigatie-doelen, dirty-check-baseline, deeltaak-read-only-gedrag) van wat identiek blijft (velden, validatie, Vak-wijziging-dialoog, Benodigdheden-tag-lijst).

**2. Geen bestaande fetch/route levert genoeg data voor het bewerkformulier.** Noch `taken/index.vue`'s `useState('taak-detail', ...)` (Story 5.2, alleen `OpenTaskItem`: geen moeilijkheid/prioriteit/sessieduur/omschrijving/benodigdheden/deeltaak-tijden), noch het bestaande `server/api/tasks/[id].get.ts` (Story 4.3, `TaskPrepResponse` — een heel andere consument, sessie-tussenscherm) bevatten wat déze pagina nodig heeft. **Nieuwe route `GET /api/tasks/{id}/edit`** (zelfde sibling-patroon als Story 5.2's `[id]/detail.get.ts`) — volledige taakgegevens incl. per deeltaak `{ id, name, minutes, status }` (voor Task 2's read-only/Heropenen-gedrag).

**3. `PUT /api/tasks/{id}` moet deeltaken *reconciliëren*, niet blind vervangen.** De client stuurt de complete gewenste deeltaken-lijst (bestaande rijen met hun `id`, nieuwe rijen zonder `id`). Server-side, **ongeacht wat de client stuurt**: een deeltaak met huidige status `'afgerond'` wordt nooit verwijderd of qua naam/tijd gewijzigd (defense-in-depth — "server is gezaghebbend, niet de client", Story 3.2's eigen les) — alleen een status-reset via een aparte, expliciete actie zou 'm weer bewerkbaar maken (zie punt 4). Voor de overige rijen: aanwezig-met-id → update, afwezig-was-aanwezig → verwijderen, geen-id → nieuw invoegen.

**4. "Heropenen" is een client-side formulier-wijziging, geen directe server-actie.** De UX-spec plaatst dit binnen de "Dirty-check vergelijkt met de vooringevulde staat"-context — dus `taak-subtask-reopen-link` zet lokaal een rij se status terug naar `'niet-gestart'` in het formulier (niet direct `updateSubtaskStatus`, Story 5.1's actie-routes zijn voor de live sessie-flow, niet hiervoor), en die wijziging wordt pas server-side doorgevoerd zodra Evelien op "Opslaan" klikt en de hele `PUT`-payload verstuurd wordt.

**5. Doelmoment-herberekening: `recalculateTaskPlanning(taskId)` (Story 3.5) wordt hier voor het eerst vanuit een échte tweede aanroeper gebruikt** (Story 3.5's eigen Dev Notes kondigden dit al aan: "toekomstige aanroepers importeren deze functie rechtstreeks"). Aanroepen **nadat** de taak-/deeltaak-wijzigingen in de DB gecommit zijn (de functie leest de actuele taakstaat).

**6. Validatielogica in `server/api/tasks.post.ts` is fors (~80 regels) en moet ook voor `PUT` gelden.** Dit is te groot om zonder gedeelde functie te dupliceren (anders dan de kleine `envelope()`-duplicatie elders in dit project). **Voorstel:** extraheer naar `server/domain/tasks/validate-task-input.ts`, hergebruikt door zowel `tasks.post.ts` als de nieuwe `PUT`-route.

## Tasks / Subtasks

- [x] Task 1: `TaakFormulier.vue` — formulier extraheren uit `taak/nieuw.vue` (AC: #1)
  - [x] Lees `app/pages/taak/nieuw.vue` volledig. Extraheer naar `app/components/TaakFormulier.vue`: alle velden, validatie, Vak-wijziging-dialoog, Benodigdheden-tag-lijst, deeltaken-rijen, "Totale benodigde tijd"-gedrag. Props: `mode: 'nieuw' | 'bewerken'`, `taskId?: string`, `initialData?: TaskEditData` (nieuw type, Task 2). Emits/callbacks voor opslaan-succes (navigatie is `mode`-afhankelijk, zie Task 3/5) en annuleren.
  - [x] `app/pages/taak/nieuw.vue` wordt een dunne wrapper: `<TaakFormulier mode="nieuw" />`. Live opnieuw verifiëren dat taak-aanmaken nog exact hetzelfde werkt als vóór de refactor (regressie-risico — dit bestand is al 6+ stories lang in productie).
- [x] Task 2: `GET /api/tasks/{id}/edit` (AC: #1, #2)
  - [x] Nieuw type `TaskEditData` in `shared/types/tasks.d.ts`: alle `CreateTaskInput`-velden + `id` + per deeltaak `{ id, name, minutes, status }` (i.p.v. `SubtaskInput`'s kale `{ name, minutes }`).
  - [x] `server/api/tasks/[id]/edit.get.ts` — zelfde envelope-/ownership-patroon als `[id]/detail.get.ts`. Nieuwe data-laagfunctie of hergebruik van bestaande (`getTaskById` + `getSubtasksForTask`, beide bestaan al) — geen nieuwe aggregatie nodig, dit is een kale, volledige lezing.
- [x] Task 3: Nieuwe pagina `app/pages/taken/[id]/bewerken.vue` (route `/taken/{id}/bewerken`) (AC: #1, #2, #4)
  - [x] `useUserSession`/`loggedIn`-guard. Fetch via `GET /api/tasks/{id}/edit` (Task 2) — geen golden-path-`useState`-doorgifte hier (zie "Belangrijk" punt 2, geen bestaande state bevat genoeg).
  - [x] `<TaakFormulier mode="bewerken" :task-id="id" :initial-data="data" />`.
  - [x] Sluiten (✕) / "Annuleren": dirty-check tegen de vooringevulde staat (niet lege staat, zie "Belangrijk" punt 1) → bevestigingsdialoog bij wijzigingen, anders direct → `navigateTo('/taken/{id}')` (6.2, vast doel).
- [x] Task 4: Deeltaken-read-only + Heropenen (AC: #2)
  - [x] In `TaakFormulier.vue`: een deeltaak-rij met `status === 'afgerond'` (alleen relevant in `mode="bewerken"`, `nieuw`-modus kent geen status) is read-only — naam/tijd-inputs `disabled`, geen verwijder-kruisje. Toont i.p.v. daarvan `taak-subtask-reopen-link` ("Heropenen") die de rij se lokale status terugzet naar `'niet-gestart'` (formulier-state, geen serveraanroep — zie "Belangrijk" punt 4) en de rij weer volledig bewerkbaar maakt.
  - [x] Rijen met status `'uitgesteld'`/`'niet-gestart'` blijven volledig bewerkbaar, geen visueel onderscheid nodig (UX-spec: alleen "Afgerond" is read-only).
- [x] Task 5: `PUT /api/tasks/{id}` + domain-laag (AC: #3)
  - [x] `server/domain/tasks/validate-task-input.ts` — extraheer de validatielogica uit `tasks.post.ts` (subject/title/type/deadline/difficulty/priority/defaultSessionDuration/description/subtasks/totalMinutesOverride/needs) naar een herbruikbare functie die een `ErrorEnvelope | { valid: true, input: CreateTaskInput }`-achtig resultaat teruggeeft (kies een vorm die zowel `tasks.post.ts` als de nieuwe route prettig kunnen consumeren). `tasks.post.ts` hergebruikt 'm (geen gedrag wijzigen, alleen verplaatsen — live opnieuw verifiëren dat taak-aanmaken nog werkt).
  - [x] `server/domain/tasks/update-task.ts` — nieuwe `updateTask(userId: string, taskId: string, input: CreateTaskInput & { subtasks: (SubtaskInput & { id?: string })[] }): Promise<Task | null>` (symmetrisch met `create-task.ts`/`delete-task.ts`). Ownership-check (`null` bij niet-eigen/niet-bestaand). Reconcilieert deeltaken zoals "Belangrijk" punt 3 beschrijft (nooit een `'afgerond'`-rij aanraken, ongeacht client-payload). Werkt de taak-rij bij (incl. herberekende `totalMinutes`, hergebruik `computeTotalMinutes`-logica uit `create-task.ts` — exporteer 'm indien nog niet exported). Roept ná het committen `recalculateTaskPlanning(taskId)` (Story 3.5, ongewijzigd) aan.
  - [x] `server/api/tasks/[id].put.ts` — envelope-/ownership-/validatiepatroon zelfde als `tasks.post.ts` (nu via `validate-task-input.ts`), roept `updateTask` aan.
- [x] Task 6: Opslaan-navigatie (AC: #3)
  - [x] `TaakFormulier.vue`'s opslaan-handler: in `mode="bewerken"` → `PUT /api/tasks/{id}` i.p.v. `POST /api/tasks`; bij succes `useState('flash-message', ...)` ("Taak bijgewerkt" of vergelijkbaar, Story 5.2's mechanisme hergebruikt) zetten, dan **altijd** `navigateTo('/taken')` (vast doel, niet "pagina van herkomst" — anders dan `mode="nieuw"`'s bestaande gedrag).
- [x] Task 7: Verificatie (AC: #1, #2, #3, #4)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live: taak-aanmaken (`/taak/nieuw`) werkt nog exact zoals vóór de refactor (regressietest op de extractie uit Task 1) — vak-wijziging-dialoog, benodigdheden-tags, deeltaken-som, alles.
  - [x] Live: een testtaak met 2 deeltaken (1 "Afgerond", 1 "Niet gestart") → `/taken/{id}/bewerken` toont de afgeronde rij read-only met "Heropenen", de andere gewoon bewerkbaar.
  - [x] Live: klik "Heropenen" → rij wordt bewerkbaar, geen serveraanroep (devtools-network-tab check) totdat op "Opslaan" geklikt wordt.
  - [x] Live: wijzig een veld (bv. titel), klik "Opslaan" → `PUT`-aanroep bevestigd (200), navigatie naar `/taken` met flash-bevestiging "Taak bijgewerkt", DB bevestigt de wijziging (titel + total_minutes bijgewerkt, subtaak-id's/status behouden).
  - [x] Live: sluiten zonder wijzigingen → direct terug naar `/taken/{id}`, geen dialoog. Sluiten mét wijzigingen → bevestigingsdialoog verschijnt ("Wil je stoppen? Je invoer gaat verloren.").
  - [x] Geen secrets/placeholder-waarden in code/commits. Testtaak na verificatie via directe DB-cleanup verwijderd (incl. gekoppelde sessions-rijen, foreign-key-constraint vereiste dat eerst).

## Dev Notes

### Architectuurcompliance

- **AD-1** (scheduling server-only): `recalculateTaskPlanning` blijft de enige plek die een doelmoment herberekent — `update-task.ts` roept 'm aan, berekent zelf niets.
- **AD-7** (Calendar write-sync synchroon): `recalculateTaskPlanning` regelt dit al zelf (Story 3.5, ongewijzigd) — geen aparte Calendar-aanroep nodig in `update-task.ts`.
- **Consistency Conventions** (mutatie-ownership): `PUT /api/tasks/{id}` roept een domain-functie aan (`update-task.ts`) — consistent met Story 5.2's code-review-uitkomst (`delete-task.ts` verplaatst om dezelfde reden). Bouw dit nu meteen goed, niet als latere review-patch.
- **NFR8/AD-1** (idempotentie): `recalculateTaskPlanning` was en blijft idempotent — geen wijziging nodig.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- **`app/pages/taak/nieuw.vue`** (Story 3.1-3.3, done, meermaals gereviewd, 1206 regels) — wordt opgesplitst in `TaakFormulier.vue` + een dunne wrapper. Grootste refactor-risico in déze story — lees volledig, test na de refactor of taak-aanmaken nog identiek werkt.
- **`server/api/tasks.post.ts`** — validatielogica wordt geëxtraheerd naar `validate-task-input.ts`, gedrag blijft ongewijzigd.
- **`server/domain/tasks/create-task.ts`** — `computeTotalMinutes` wordt hergebruikt door `update-task.ts` (exporteer 'm als nog niet exported).
- **`server/domain/scheduling/recalculate.ts`** (Story 3.5) — `recalculateTaskPlanning`, ongewijzigd, hier voor het eerst echt een tweede aanroeper.
- **`app/pages/taken/[id].vue`** (Story 5.2) — `bewerken()` navigeert al naar `/taken/{id}/bewerken` (Open Question #1 uit Story 5.2, toen al bevestigd) — déze story bouwt eindelijk de doelpagina, de 404 die Story 5.2 nog live bevestigde verdwijnt hiermee.
- **`server/data/tasks.ts`** — `getTaskById`/`getSubtasksForTask` bestaan al, hergebruikt voor Task 2.

### Previous Story Intelligence (Story 5.2, inclusief de code review)

- **Mutaties met een externe aanroep of meerstaps-orkestratie horen in `server/domain/`, niet rechtstreeks in de route** — Story 5.2's code review verplaatste `DELETE /api/tasks/{id}`'s logica naar `delete-task.ts` om deze reden; déze story's `PUT`-route volgt dat patroon vanaf het begin.
- **Cross-pagina flash-bevestiging (`useState('flash-message', ...)`) bestaat al** (Story 5.2) — hergebruiken voor Task 6, geen nieuw mechanisme nodig.
- **3-agent adversarial review + structured triage blijft de standaardafronding.**
- **Code review op Story 5.2 vond een sterker architectuurargument dan eerdere precedent-afwegingen** (domain-laag voor een écht domain-vormige operatie) — bij déze story's `PUT`-route (nog complexer: validatie + reconciliatie + herberekening) is dat argument nog sterker; bouw de domain-laag dus meteen, wacht niet op een review-patch.

### Git Intelligence

- Laatste 9 commits (Story 4.1-5.2): elke story met een "eerste échte tweede aanroeper"-moment (Story 4.7's `recalculateTaskPlanning`-hergebruik via een tussenlaag, Story 5.2's `deleteTaskAndSession`) werd expliciet als zodanig benoemd in de story se "Belangrijk"-sectie — déze story doet hetzelfde voor `recalculateTaskPlanning`'s tweede aanroeper.
- Story 5.1 introduceerde de eerste gedeelde component (`HamburgerMenu.vue`, klein). Déze story is de eerste grote component-extractie uit een bestaand, productie-bestand — geen eerder precedent voor déze schaal in dit project.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 598-623 (Story 5.3's AC's, letterlijk overgenomen hierboven)
- [Source: design-artifacts/C-UX-Scenarios/06-evelien-beheert-het-takenoverzicht/6.3-bewerkformulier/6.3-bewerkformulier.md] — volledige verschil-documentatie t.o.v. 2.1
- [Source: design-artifacts/C-UX-Scenarios/02-evelien-taak-aanmaken/2.1-taak-formulier/2.1-taak-formulier.md] — bron-specificatie (Object IDs, velden, validatie) — lees dit óók, niet alleen 6.3, voor de volledige veld-specificatie
- [Source: app/pages/taak/nieuw.vue] — Story 3.1-3.3, wordt hier opgesplitst, niet herbouwd
- [Source: server/api/tasks.post.ts] — validatielogica wordt hier geëxtraheerd
- [Source: server/domain/tasks/create-task.ts, delete-task.ts] — patroon voor de nieuwe `update-task.ts`
- [Source: server/domain/scheduling/recalculate.ts] — Story 3.5, ongewijzigd hergebruikt
- [Source: app/pages/taken/[id].vue, shared/types/tasks.d.ts] — Story 5.2, `flash-message`-mechanisme hergebruikt

## Open Questions

1. 🟢 **Resolved (Hillebrand, 2026-08-16):** formulier extraheren naar een gedeelde `TaakFormulier.vue`-component, gebruikt door zowel aanmaken als bewerken — zoals voorgesteld in "Belangrijk" punt 1.
2. 🟢 **Resolved (Hillebrand, 2026-08-16):** flash-bevestiging na bewerken toont "Taak bijgewerkt", consistent met Story 5.2's "Taak verwijderd".

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-16 | Story aangemaakt via create-story, voortbouwend op Story 5.2 (done). Grootste architectuurbeslissing tot nu toe: het bestaande 1206-regels taakformulier (`taak/nieuw.vue`) moet hergebruikt worden voor bewerken zonder duplicatie — voorgestelde aanpak is een nieuwe gedeelde `TaakFormulier.vue`-component (eerste grote component-extractie in dit project). Vijf andere stukken geïdentificeerd: (1) een nieuwe `GET /api/tasks/{id}/edit`-route, geen bestaande fetch/state volstaat; (2) server-side deeltaak-reconciliatie die `'afgerond'`-rijen altijd beschermt, ongeacht client-payload; (3) "Heropenen" als pure formulier-state, geen directe serveraanroep; (4) `recalculateTaskPlanning`'s eerste échte tweede aanroeper; (5) een gedeelde `validate-task-input.ts` omdat de bestaande validatielogica te groot is om te dupliceren. Twee Open Questions vastgelegd, waarvan #1 (extractie vs. duplicatie) blokkerend is. |
| 2026-08-16 | Beide Open Questions besproken en opgelost met Hillebrand: (1) extractie naar een gedeelde `TaakFormulier.vue`-component bevestigd; (2) flash-bevestigingstekst wordt "Taak bijgewerkt". Story is nu `ready-for-dev`, geen blokkerende punten meer. |
| 2026-08-16 | Implementatie afgerond (Tasks 1-7): `TaakFormulier.vue` geëxtraheerd uit `taak/nieuw.vue`; `GET /api/tasks/{id}/edit`; nieuwe pagina `taken/[id]/bewerken.vue`; deeltaken-read-only/Heropenen-gedrag; `PUT /api/tasks/{id}` + `validate-task-input.ts` + `update-task.ts` (reconciliatie + `recalculateTaskPlanning`-herbruik); opslaan-navigatie naar `/taken` met flash "Taak bijgewerkt". Onderweg drie bugs gevonden en gefixt: (1) `$fetch`'s PUT-methode-type-inferentie op de multi-method-route (zelfde patroon als Story 5.2's DELETE-fix, opgelost met een expliciete generic); (2) Nuxt registreerde `taken/[id]/bewerken.vue` als kind-route van het bestaande `taken/[id].vue` (geen `<NuxtPage />`-outlet, pagina zou nooit renderen) — opgelost door `taken/[id].vue` te verplaatsen naar `taken/[id]/index.vue`; (3) TypeScript-spread-eigenaardigheid rond `CreateTaskInput.description?: string \| null` — opgelost door het veld niet-optioneel te maken. Live geverifieerd (browser + directe Turso-queries): regressie op `/taak/nieuw`, read-only/Heropenen-gedrag, PUT-aanroep + DB-wijziging + flash-bevestiging, en beide sluit-paden (met/zonder dialoog). Testtaak + gekoppelde subtaken/sessions na verificatie verwijderd. Status → `review`. |
| 2026-08-16 | Code review (Blind Hunter adversarial-general; Edge Case Hunter en Acceptance Auditor herhaaldelijk gecrasht op infrastructuurfouten (API-verbindingsfouten/stream-watchdog-timeouts), na 2-3 pogingen elk vervangen door eigen handmatige verificatie tegen de spec). **Kritieke bevinding, zelf geverifieerd tegen de code (bevestigd als echte bug, niet false-positive):** AC #2's "Heropenen" persisteerde nooit — de client stuurde geen `status`-veld mee en de server sloeg elke `'afgerond'`-rij onvoorwaardelijk over, dus een heropende + bewerkte deeltaak bleef na "Opslaan" stilzwijgend ongewijzigd in de DB (de eigen live-verificatie hierboven had dit gemist: die testte "Heropenen → geen serveraanroep" en "wijzig titel → PUT bevestigd" als *losse* stappen, nooit "Heropen déze rij → wijzig 'm → sla op → herlaad"). Twee kleinere, gerelateerde bevindingen: `totalMinutes` kon desynchroniseren van de echte deeltaak-som via een gemanipuleerde payload (de bescherming zat op de deeltaak-rij, niet op de afgeleide total), en een TOCTOU-race in `updateTaskAndSubtasks` (de bestaande-deeltaken-lezing gebeurde vóór i.p.v. in de transactie). Vierde punt (`isManualTotalTime` startte altijd op `true` in bewerk-modus, waardoor élke opslag de taak stilzwijgend naar "handmatig vastgezette tijd" omzette) voorgelegd aan Hillebrand — gekozen: de bestaande auto/handmatig-staat behouden bij bewerken (afgeleid via een heuristiek, want de DB bewaart zelf geen apart auto/handmatig-veld). Alle vier gepatcht. |
| 2026-08-16 | Patches gedeployed en live opnieuw geverifieerd — eerste deploy-poging faalde stil op een verlopen AWS-sessie (de `\| tail` in het deploy-commando verborg de echte non-zero exitcode), herkend doordat de "Heropenen"-persistentietest na die deploy nog steeds faalde. Na opnieuw inloggen en een schone deploy (zonder pipe naar `tail`, exitcode expliciet gelogd): "Heropenen → naam/tijd wijzigen → Opslaan → DB" toont nu `status: 'niet-gestart'` met de nieuwe naam/tijd; een normale bewerking die de afgeronde rij niet aanraakt laat 'm volledig ongewijzigd (naam/tijd/status) terwijl `totalMinutes` correct blijft. Testtaak na verificatie verwijderd. Status → `done`. |
| 2026-08-18 | **De review-patch TOCTOU-fix (bestaande-deeltaken-lezing ín i.p.v. vóór de transactie) bleek zelf niet voldoende** — het projectbrede `getDb().transaction()`-audit (aanleiding: Story 3.5's empirisch weerlegde transactie-aanname) vond `updateTaskAndSubtasks` als één van twee resterende kwetsbare plekken: de multi-statement-`tx`-lezing serialiseert niet tegen deze Turso-verbinding, ongeacht wáár in de transactie de lezing staat. Opgepakt op verzoek van Hillebrand: `updateTaskAndSubtasks` én `updateSubtaskStatus` (Story 5.1's `/done`-`/later`-routes) gewrapt met een nieuwe `taskEditLocks`-tabel (migratie `0017_wild_black_cat.sql`) — een eigen tabel, niet `sessionPlacementLocks` hergebruikt, want dit is een andere resource (deeltaak-reconciliatie op taak-niveau, niet dag-capaciteit). Live geverifieerd met gelijktijdige `/done`- en bewerk-aanroepen op dezelfde taak; tijdens het testen leek één run een regressie ("Heropenen" niet gepersisteerd), bleek bij nader onderzoek het bestaande, opzettelijke Heropenen-gedrag te zijn (testpayload stuurde per ongeluk `status: 'niet-gestart'` mee) — na correctie van de test 6x consistent correct. Zie `deferred-work.md` en Story 3.5's Dev Notes voor het volledige verhaal achter dit lock-patroon. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `$fetch<CreateTaskResponse>(...)` generic nodig op de `PUT`-aanroep in `TaakFormulier.vue` — zonder expliciete generic resolveert Nitro's typed-route-inferentie op deze multi-method-route (`GET`/`PUT`) naar het verkeerde type (zelfde patroon als Story 5.2's DELETE-fix).
- `git mv "app/pages/taken/[id].vue" "app/pages/taken/[id]/index.vue"` — Nuxt registreerde de nieuwe `taken/[id]/bewerken.vue` anders als kind-route van `[id].vue` (bevestigd via het gebouwde route-manifest, `node_modules/.cache/nuxt/.nuxt/dist/server/server.mjs`); zonder `<NuxtPage />`-outlet in `[id].vue` zou de bewerk-pagina nooit renderen. Na de move: `taken-id` en `taken-id-bewerken` zijn correcte sibling-routes.
- `CreateTaskInput.description` van `string | null | undefined` (optioneel) naar verplicht `string | null` gemaakt in `shared/types/tasks.d.ts` — TS2345 bij object-spread in `tasks.post.ts`/`update-task.ts` (optioneel veld werd door spread "aanwezig-maar-mogelijk-undefined", incompatibel met het doeltype). Elke aanroeper zette het veld toch al altijd expliciet.

### Completion Notes List

- Alle 4 AC's live geverifieerd op flowz.fyi/dev-stage met een testtaak (2 deeltaken, 1 handmatig op `afgerond` gezet via directe DB-update om de sessie-flow-uitkomst te simuleren — die flow zelf is al in eerdere stories geverifieerd).
- Regressie op `/taak/nieuw` bevestigd: formulier, Vak/Titel/Soort/Deadline/Moeilijkheid/Prioriteit/Sessieduur/Deeltaken/Totale-tijd-berekening werken identiek aan vóór de extractie.
- `PUT /api/tasks/{id}` retourneerde 200; DB toont bijgewerkte titel/`total_minutes` en ongewijzigde subtaak-id's/status. **Correctie (code review):** deze observatie werd oorspronkelijk als "reconciliatie werkt" geïnterpreteerd, maar was in werkelijkheid het symptool van de "Heropenen persisteert niet"-bug — de oorspronkelijke verificatie testte nooit het scenario "heropen déze rij → wijzig 'm → sla op → herlaad" in één doorlopende flow. Na de patch is dat scenario alsnog end-to-end geverifieerd (zie review-patch-sectie hieronder).
- Sluiten-met-wijzigingen toont de verwachte bevestigingsdialoog ("Wil je stoppen? Je invoer gaat verloren."); sluiten-zonder-wijzigingen navigeert direct terug.
- Testtaak-cleanup vereiste eerst de gekoppelde `sessions`-rij te verwijderen (foreign-key-constraint) vóór `subtasks`/`tasks` verwijderd konden worden — geen productie-impact, alleen relevant voor de cleanup-volgorde.

**Code review-patches (2026-08-16):**
- "Heropenen" persisteert nu daadwerkelijk: `UpdateTaskInput`'s deeltaken dragen een optioneel `status`-veld; de client stuurt de lokaal gezette `'niet-gestart'` mee; de server (`updateTaskAndSubtasks`) staat alléén deze ene expliciete overgang (`'afgerond'` → `'niet-gestart'`, inclusief de bijbehorende naam/tijd-wijziging op datzelfde verzoek) toe, elke andere `'afgerond'`-rij blijft onvoorwaardelijk beschermd.
- `totalMinutes` gebruikt nu de *effectieve* deeltaak-minuten (`update-task.ts`): voor een beschermde `'afgerond'`-rij telt altijd de echte, opgeslagen `minutes`-waarde mee, nooit wat een gemanipuleerde payload voor dat `id` beweert.
- TOCTOU-fix: `updateTaskAndSubtasks`'s lezing van de bestaande deeltaken gebeurt nu ín de transactie, niet ervoor.
- `isManualTotalTime` in `mode="bewerken"` start nu op basis van een heuristiek (`totalMinutes` komt overeen met wat `computeTotalMinutes` zelf zou berekenen → "was auto") i.p.v. altijd op `true` — een taak die nog nooit handmatig was vastgezet, wordt dat niet meer stilzwijgend bij een ongerelateerde bewerking (Hillebrand's keuze: bestaande auto/handmatig-staat behouden).
- Live herbevestigd na deze patches (zie ook de tweede en derde Change Log-entry): "Heropen → wijzig naam/tijd → Opslaan" persisteert correct (`status: 'niet-gestart'`, nieuwe naam/tijd, `totalMinutes` herberekend); een losstaande bewerking die de afgeronde rij niet aanraakt laat 'm volledig ongewijzigd.
- Eerste deploy-poging voor deze patches faalde stil (verlopen AWS-sessie, gemaskeerd door een `| tail`-pipe in het deploy-commando) — pas ontdekt doordat de her-test na die deploy nog steeds de oude (kapotte) uitkomst gaf. Les: nooit een deploy-commando's exitcode via een pipe naar `tail`/`grep` laten lopen zonder 'm apart te loggen.

### File List

- `app/components/TaakFormulier.vue` (nieuw; review-patch: `status` meegestuurd in de opslaan-payload, `isManualTotalTime`-heuristiek)
- `app/pages/taak/nieuw.vue` (herschreven — dunne wrapper)
- `app/pages/taken/[id]/bewerken.vue` (nieuw)
- `app/pages/taken/[id].vue` → `app/pages/taken/[id]/index.vue` (verplaatst, ongewijzigde inhoud)
- `server/api/tasks/[id]/edit.get.ts` (nieuw)
- `server/api/tasks/[id].put.ts` (nieuw)
- `server/domain/tasks/validate-task-input.ts` (nieuw; review-patch: `status`-veld gevalideerd)
- `server/domain/tasks/update-task.ts` (nieuw; review-patch: effectieve-deeltaak-minuten voor `totalMinutes`)
- `server/domain/tasks/create-task.ts` (gewijzigd — `computeTotalMinutes` exported)
- `server/api/tasks.post.ts` (herschreven — hergebruikt `validate-task-input.ts`)
- `server/data/tasks.ts` (gewijzigd — nieuwe `updateTaskAndSubtasks`; review-patch: expliciete-Heropenen-uitzondering + TOCTOU-fix; 2026-08-18: `updateTaskAndSubtasks`/`updateSubtaskStatus` gewrapt met nieuwe `acquireTaskEditLock`/`releaseTaskEditLock`)
- `server/data/schema.ts` (2026-08-18: nieuwe `taskEditLocks`-tabel)
- `server/data/migrations/0017_wild_black_cat.sql` (2026-08-18, nieuw)
- `shared/types/tasks.d.ts` (gewijzigd — `TaskEditSubtask`, `TaskEditData`, `UpdateTaskInput` toegevoegd; `CreateTaskInput.description` niet-optioneel gemaakt; review-patch: `UpdateTaskInput.subtasks[].status` toegevoegd)
