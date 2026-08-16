---
baseline_commit: 4dc3a7e
---

# Story 5.2: Taakdetail — Bekijken & Verwijderen

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want de details van een taak bekijken en 'm eventueel verwijderen,
so that ik snel kan besluiten of ik 'm wil aanpassen of laten vervallen.

## Acceptance Criteria

1. **Given** Evelien komt op 6.2-taakdetail vanuit 6.1, **when** de pagina laadt, **then** toont ze vak, titel, deadline en (indien van toepassing) de subtaken-voortgang — geen nieuwe fetch, data reist mee vanuit 6.1.
2. **Given** Evelien klikt op `detail-delete-button`, **when** `detail-delete-confirm-modal` verschijnt en ze "Verwijderen" bevestigt, **then** wordt de taak verwijderd (`DELETE /api/tasks/{id}`), inclusief eventuele bijbehorende Calendar-events, en gaat ze terug naar 6.1 met een flash-bevestiging (FR13).
3. **Given** Evelien klikt op `detail-edit-button`, **when** de navigatie plaatsvindt, **then** gaat ze naar 6.3-bewerkformulier voor deze taak (Story 5.3, nog backlog — déze story navigeert er wel al naartoe, de doelpagina bestaat nog niet).

## Belangrijk: drie dingen die déze story voor het eerst nodig heeft — lees dit vóór je begint

**1. "Geen nieuwe fetch, data reist mee vanuit 6.1" (AC #1) — maar er is ook een terugvalpad nodig.**
`taken/index.vue`'s `openTaak(id)` (Story 5.1, done) doet vandaag alleen `navigateTo(/taken/{id})`, zonder data mee te geven. Déze story breidt 'm uit met een `useState('taak-detail', ...)`-set vóór de navigatie (zelfde patroon als `sessie-actief-taak`/`sessie-overzicht-log`) — `taken/index.vue`'s `OpenTaskItem` (Story 5.1) bevat toevallig al precies de velden die 6.2 nodig heeft (`id`, `subject`, `title`, `type`, `deadline`, `totalSubtasks`, `doneSubtasks`), dus geen nieuw responstype nodig voor het golden path. **Voor het terugvalpad** (refresh, deep link) is een nieuwe route nodig: `GET /api/tasks/{id}/detail` — een apart pad van het al-bestaande `server/api/tasks/[id].get.ts` (dat bedient een andere consument, `TaskPrepResponse` voor 1.2-sessie-tussenscherm, met een andere vorm — zelfde "eigen endpoint, eigen levenscyclus, niet hergebruikt als alias"-precedent als Story 4.3's Dev Notes al vastlegden voor `HomePlanResponse` vs. `TaskPrepResponse`).

**2. `deleteTaskAndSession` wordt voor het eerst buiten een interne rollback gebruikt.** Bestaat sinds Story 3.1, tot nu toe alleen gebruikt in `createTaskAndSession`'s eigen compenserende opruiming. Déze story is de eerste user-facing verwijder-actie (`DELETE /api/tasks/{id}`). **Let op het verschil met Story 4.7's `tasks.completedAt`-aanpak:** die ging over een taak die *vanzelf* klaar is (resterende tijd 0) — daar blijft alles bewaard voor toekomstige adaptieve tijdschatting. Déze story gaat over een **expliciete, destructieve gebruikersactie** ("Verwijderen", met "Dit kan niet ongedaan worden gemaakt"-waarschuwing) — hier is `deleteTaskAndSession` (écht verwijderen) wél de juiste keuze, geen `completedAt`. Vóór het verwijderen: haal de sessie op (`getSessionForTask`) en verwijder een eventueel Calendar-event (`deleteHomeworkEvent`, alleen als `session.googleEventId` gezet is) — zelfde volgorde-precedent als `replanAfterSession`'s "taak klaar"-tak (Story 4.7): eerst het externe Calendar-event, dan pas de DB-rijen.

**3. Cross-pagina flash-bevestiging bestaat nog nergens in dit project.** `taak/nieuw.vue`'s "Taak opgeslagen!"-bevestiging (Story 3.1) toont zichzelf vóór een vertraagde navigatie, op dezelfde pagina — dat werkt hier niet, want AC #2 eist de bevestiging op de **volgende** pagina (6.1) ná de navigatie. **Voorgestelde aanpak:** nieuwe `useState('flash-message', () => null as string | null)` — `taken/[id].vue` zet 'm vlak vóór `navigateTo('/taken')`, `taken/index.vue` toont 'm bij `onMounted` (als-ie gezet is) en maakt 'm meteen weer leeg (eenmalig, geen bewaring bij een volgende paginalaad).

## Tasks / Subtasks

- [x] Task 1: `taken/index.vue` — data meegeven bij klik op een taak (AC: #1)
  - [x] Lees `openTaak(id)` (Story 5.1) volledig vóór je wijzigt. Nieuwe `useState<OpenTaskItem | null>('taak-detail', () => null)`, gezet met de geklikte `task` vlak vóór `navigateTo(`/taken/${id}`)`.
- [x] Task 2: Nieuwe route `GET /api/tasks/{id}/detail` (terugvalpad) (AC: #1)
  - [x] `server/api/tasks/[id]/detail.get.ts` — zelfde envelope-/ownership-patroon als `tasks/[id].get.ts` (401/404, ownership via `getTaskById` → `task.userId`). Nieuwe data-laagfunctie `server/data/tasks.ts`: `getTaskWithProgress(taskId: string): Promise<{ task: Task, totalSubtasks: number, doneSubtasks: number } | null>` (hergebruik de aggregatie-aanpak van `getOpenTasksWithProgress`, Story 5.1, maar voor één taak i.p.v. een lijst — geen `completedAt`-filter hier, een afgeronde taak mag nog steeds bekeken worden). Response: `OpenTaskItem` (Story 5.1, hergebruikt — geen nieuw type nodig).
- [x] Task 3: Nieuwe pagina `app/pages/taken/[id].vue` (route `/taken/{id}`) (AC: #1, #2, #3)
  - [x] `useUserSession`/`loggedIn`-guard. Lees `useState('taak-detail', ...)`: als gezet én `taak.value.id === route.params.id`, gebruik direct (geen fetch). Anders: fetch via `GET /api/tasks/{id}/detail` (Task 2) — zelfde `server: false`-precedent als `taken/index.vue`. Geen taak gevonden (404) → `navigateTo('/taken')`.
  - [x] `detail-back-section`/`detail-back-link` ("← Terug", `aria-label="Terug naar takenoverzicht"`) → `navigateTo('/taken')` (letterlijke bestemming volgens UX-spec, geen browser-history-back — anders dan 6.1's eigen terug-link).
  - [x] `detail-main-section`: `detail-subject` ("{VAK} · {soort taak}", hergebruik `TYPE_LABELS` — zelfde mapping als `taken/index.vue`, overweeg 'm te delen als een derde consument 'm ooit nodig heeft, voor nu een lokale kopie volstaat), `detail-title`, `detail-deadline` ("Deadline: {datum}", NL-datumformattering — check hoe `taak/nieuw.vue` of elders in dit project een datum al formatteert, geen nieuw formaat verzinnen), `detail-progress` (voortgangsbalk + tekst, hergebruik hetzelfde balk-patroon als `taken/index.vue`, Story 5.1 review-patch — volledig afwezig bij `totalSubtasks === 0`, geen "(geen subtaken)"-tekst hier, anders dan 6.1: de UX-spec zegt hier expliciet "Volledig afwezig", geen wireframe-tegenspraak zoals bij 6.1).
  - [x] `detail-action-section`: `detail-delete-button` (secondary/destructief) → toont `detail-delete-confirm-modal`; `detail-edit-button` (primary) → `navigateTo('/taken/{id}/bewerken')` — **besluit Hillebrand, 2026-08-16** (Open Question #1 hiermee opgelost), route bestaat nog niet (Story 5.3, backlog), verwacht een 404 bij live-verificatie.
- [x] Task 4: Verwijder-bevestigingsdialoog (AC: #2)
  - [x] `detail-delete-confirm-modal`: "Taak verwijderen? Dit kan niet ongedaan worden gemaakt." + "Annuleren"/"Verwijderen"-knoppen. Zelfde structuurpatroon als `active-leave-confirm-modal` (Story 4.5) — geen bestaand gedeeld modal-component in dit project (al meermaals gedocumenteerd als bekend, geaccepteerd gat), dus een lokale modal-`<div>`, geen nieuwe abstractie.
  - [x] Bij bevestigen: `DELETE /api/tasks/{id}` aanroepen, **blokkerend** (UX-spec: "client wacht op bevestiging voordat naar 6.1 wordt genavigeerd" — dit is bewust géén fire-and-forget, anders dan de sessie-afronden-stories). Bij succes: `useState('flash-message', ...)` zetten op "Taak verwijderd", dan `navigateTo('/taken')`. Bij falen: modal blijft open, foutmelding tonen, geen navigatie.
- [x] Task 5: `DELETE /api/tasks/{id}`-route + domain-laag (AC: #2)
  - [x] `server/data/tasks.ts`: geen nieuwe functie nodig — `deleteTaskAndSession` en `getSessionForTask` bestaan al.
  - [x] `server/api/tasks/[id].delete.ts` — envelope-/ownership-patroon zelfde als `tasks/[id].get.ts`. Haal de taak op (ownership-check), haal de sessie op (`getSessionForTask`) — als die een `googleEventId` heeft, verwijder eerst het Calendar-event (`deleteHomeworkEvent(task.userId, session.googleEventId)`, zelfde volgorde-precedent als `replanAfterSession`), roep dan `deleteTaskAndSession(taskId, session.id)` aan. Retourneer `{ ok: true }`.
- [x] Task 6: `taken/index.vue` — flash-bevestiging tonen (AC: #2)
  - [x] `onMounted`: als `useState('flash-message', ...)` gezet is, toon 'm en maak de state meteen leeg (zodat een latere paginalaad 'm niet opnieuw toont); de zichtbare melding zelf verdwijnt na een vaste timeout van 3-4 seconden (`setTimeout`, lokale `ref` voor zichtbaarheid — **besluit Hillebrand, 2026-08-16**, Open Question #2 hiermee opgelost, consistent met `taak/nieuw.vue`'s bevestigingspatroon, geen nieuwe animatiebibliotheek).
- [x] Task 7: Verificatie (AC: #1, #2, #3)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live tegen de dev-stage: klik vanaf `/taken` op `Verificatietaak 5.2a` → detailpagina toont correcte gegevens ("STORY5.2TEST · SO", "Deadline: 20 augustus", "0 van 2 subtaken"); netwerkrequests bevestigd via devtools — geen `/api/tasks/{id}/detail`-aanroep bij deze klik.
  - [x] Live: directe navigatie naar `/taken/{id}` (verse paginalaad, geen voorafgaande klik) → detailpagina toont dezelfde gegevens via het terugvalpad.
  - [x] Live: "Annuleren" in de modal → modal sluit, geen verwijdering, taak blijft bestaan (bevestigd door opnieuw te openen).
  - [x] Live: "Verwijderen" → bevestigingsmodal → "Verwijderen" bevestigen → navigatie naar `/taken` met zichtbare flash-bevestiging "Taak verwijderd", lege staat ("Geen openstaande taken"). DB-query bevestigt: taak, sessie én deeltaken volledig verwijderd (geen wees-rijen).
  - [x] Live: "Bewerken" → navigeert naar `/taken/{id}/bewerken`, bevestigde 404 ("Page not found") — bewust, zelfde precedent als 5.1's `tasks-item`-klik naar 6.2 vóórdat déze story bestond.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testtaak (incl. sessie/deeltaken) via de "Verwijderen"-flow zelf al opgeruimd — DB-verificatie bevestigde 0 resterend.

## Dev Notes

### Architectuurcompliance

- **AD-7** (Calendar write-sync synchroon binnen het request-pad): `DELETE /api/tasks/{id}` verwijdert het Calendar-event synchroon binnen dezelfde request, vóór de DB-verwijdering — geen achtergrondtaak.
- **Consistency Conventions** (mutatie-ownership): `DELETE /api/tasks/{id}` roept `deleteTaskAndSession` (data-laag) aan, geen domain-tussenlaag — consistent met hoe dit project simpele CRUD-mutaties al behandelt (zelfde niveau als `sessions/[sessionId]/stop.post.ts`).
- **AD-3** (Task bezit Sessions/Subtasks): verwijderen van een Task verwijdert ook zijn Session/Subtask-kindrijen (`deleteTaskAndSession` doet dit al, geen wees-rijen).
- Geen wijziging aan `server/domain/scheduling/`-bestanden.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- **`app/pages/taken/index.vue`** (Story 5.1, done, al gereviewd) — `openTaak()` krijgt een `useState`-set toegevoegd; `onMounted` krijgt de flash-bevestiging-logica. Lees het bestand volledig, met name de al-bestaande `isLoading`/`hasError`/`isEmpty`-computeds (review-patch uit 5.1) — niet per ongeluk overschrijven.
- **`server/data/tasks.ts`** — `deleteTaskAndSession`/`getSessionForTask` bestaan al (Story 3.1/3.5), voor het eerst hier vanuit een user-facing pad aangeroepen. `getOpenTasksWithProgress` (Story 5.1) is het aggregatie-patroon om te hergebruiken voor de nieuwe `getTaskWithProgress`.
- **`server/api/tasks/[id].get.ts`** (Story 4.3) — blijft ongewijzigd, bedient een andere consument (`TaskPrepResponse`, sessie-tussenscherm). Niet verwarren met de nieuwe `[id]/detail.get.ts`.
- **`server/domain/calendar-sync/homework-events.ts`** — `deleteHomeworkEvent(userId, googleEventId)` bestaat al, hier hergebruikt.
- **`shared/types/tasks.d.ts`** — `OpenTaskItem` (Story 5.1) wordt hier hergebruikt voor zowel de `useState`-doorgifte als de nieuwe `detail.get.ts`-respons — geen nieuw type nodig.

### Previous Story Intelligence (Story 5.1, inclusief de code review)

- **`useFetch(..., { server: false })` + `isLoading`/`hasError`/`isEmpty`-computeds** — zelfde patroon toepassen op `taken/[id].vue`'s terugvalpad-fetch als déze story dat nodig heeft (waarschijnlijk minder kritiek hier, geen lijst maar één taak — beoordeel zelf of een skeleton nodig is voor zo'n korte laadtijd, of dat een simpele "laden..."-tekst volstaat).
- **`router.back()` voor browser-history-navigatie, `navigateTo(...)` voor een letterlijke bestemming** — 6.1's eigen terug-link gebruikt sinds de review `router.back()` (UX-spec eiste dat daar expliciet); 6.2's terug-link heeft een andere UX-spec-tekst ("navigeert naar 6.1-takenoverzicht", geen "browser-history-gedrag") — gebruik hier dus bewust `navigateTo('/taken')`, niet `router.back()`. Niet de twee patronen door elkaar halen.
- **Server-side hervalidatie/ownership-checks op elk mutatie-endpoint** — `DELETE /api/tasks/{id}` volgt hetzelfde "niet-bestaand en niet-eigen krijgen dezelfde 404"-precedent.
- **3-agent adversarial review + structured triage blijft de standaardafronding.**
- **Code review op Story 5.1 vond een spec-conformiteitsgat (ontbrekende voortgangsbalk, alleen tekst)** — dubbelchecken dat déze story's `detail-progress` de balk vanaf het begin meeneemt, niet pas als review-patch.

### Git Intelligence

- Laatste 8 commits (Story 3.5, 4.1-4.7, 5.1): elke nieuwe route/functie volgt een bestaand precedent zo dicht mogelijk (envelope-helper, ownership-check-volgorde, `useState`-doorgifte-naamgeving) — déze story's drie nieuwe stukken (fallback-route, delete-route, flash-mechanisme) doen hetzelfde, met expliciete verwijzingen naar het precedent hierboven.
- Story 5.1 was de eerste story die een eerder "nog niet nodig"-gemarkeerd datamodelstuk (`subtasks.status`) alsnog vervroegd moest bouwen. Déze story doet hetzelfde met `deleteTaskAndSession` (Story 3.1, tot nu toe altijd "later nodig" gebleven, zoals Story 4.7's Dev Notes ook al noteerden).

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 578-597 (Story 5.2's AC's, letterlijk overgenomen hierboven), regel 49 (FR13)
- [Source: design-artifacts/C-UX-Scenarios/06-evelien-beheert-het-takenoverzicht/6.2-taakdetail/6.2-taakdetail.md] — volledige pagina-spec (Object IDs, Technical Notes: blokkerend `DELETE`, Calendar-write-sync-verwijdering)
- [Source: app/pages/taken/index.vue, shared/types/tasks.d.ts] — Story 5.1, `openTaak()`/`OpenTaskItem` worden hier uitgebreid/hergebruikt, niet herbouwd
- [Source: server/data/tasks.ts] — `deleteTaskAndSession`/`getSessionForTask` (Story 3.1/3.5), `getOpenTasksWithProgress` (Story 5.1, aggregatie-patroon)
- [Source: app/pages/taak/nieuw.vue] — Story 3.1, bestaand (ander) flash-bevestiging-patroon, hier bewust niet hergebruikt (ander scenario: cross-pagina i.p.v. zelfde-pagina)

### Review Findings

- [x] [Review][Decision] `DELETE`-route roept geen domain-laag aan voor een écht domain-vormige, meerstaps-mutatie — **besluit Hillebrand, 2026-08-16:** verplaatst naar nieuwe `server/domain/tasks/delete-task.ts` (symmetrisch met `create-task.ts`), route blijft dun — [server/domain/tasks/delete-task.ts, server/api/tasks/[id].delete.ts]
- [x] [Review][Patch] Calendar-verwijdering blokkeert de hele taakverwijdering bij een falende externe aanroep — opgelost in dezelfde `delete-task.ts`-refactor: `deleteHomeworkEvent`-fout wordt gevangen en gelogd, verwijdering gaat door — [server/domain/tasks/delete-task.ts]
- [x] [Review][Patch] `useState('taak-detail', ...)` wordt nooit ongeldig gemaakt na gebruik — opgelost, eenmalig uitgelezen in een lokale `ref` en meteen leeggemaakt — [app/pages/taken/[id].vue]
- [x] [Review][Patch] Stille redirect bij elke niet-401-fout, geen gebruikersfeedback — opgelost, toont nu "Deze taak kon niet worden gevonden." via het flash-mechanisme, live geverifieerd — [app/pages/taken/[id].vue]
- [x] [Review][Patch] Verouderde `deleteError` blijft staan bij annuleren + opnieuw openen — opgelost, gewist in beide handlers — [app/pages/taken/[id].vue]
- [x] [Review][Patch] Voortgangsbalk niet begrensd tegen inconsistente data — opgelost, `progressPercentage()`-helper met `Math.min(100, ...)` — [app/pages/taken/[id].vue]
- [x] [Review][Patch] Misleidende `AD-1`-verwijzing — opgelost, `AD-3` in de nieuwe `delete-task.ts` — [server/domain/tasks/delete-task.ts]
- [x] [Review][Patch] Geen zichtbare "bezig"-status op de verwijder-bevestigingsknop — opgelost, knoptekst wisselt naar "Bezig..." — [app/pages/taken/[id].vue]
- [x] [Review][Defer] Modal mist dialoog-semantiek/focus-management (`role="dialog"`, focus-trap, Escape) [app/pages/taken/[id].vue] — deferred, matcht een al geaccepteerd gat (`active-leave-confirm-modal`, Story 4.5)
- [x] [Review][Defer] Twee gelijktijdige DELETE-verzoeken kunnen racen (tweede wordt een stille no-op) [server/api/tasks/[id].delete.ts] — deferred, zeer lage kans, matcht het ontbreken van DB-locking elders in dit project
- [x] [Review][Defer] DELETE-404 op een al-verwijderde taak (bv. concurrent vanuit een andere tab) niet apart onderscheiden van een echte serverfout [app/pages/taken/[id].vue] — deferred, lage kans, huidige generieke foutmelding blijft redelijk bruikbaar
- [x] [Review][Defer] Generieke, niet-genamespacete `useState`-sleutelnamen (`taak-detail`, `flash-message`) — toekomstig botsingsrisico als een tweede vergelijkbare flow ontstaat [app/pages/taken/[id].vue, app/pages/taken/index.vue] — deferred, speculatief, geen concrete tweede consument nu
- [Source: app/pages/sessie/actief.vue] — Story 4.5, `active-leave-confirm-modal`-structuurpatroon voor `detail-delete-confirm-modal`

## Open Questions

1. 🟢 **Resolved (Hillebrand, 2026-08-16):** Story 5.3's route voor het bewerkformulier wordt `/taken/{id}/bewerken` — bestaat nog niet (Story 5.3, backlog), déze story navigeert er wel al naartoe.
2. 🟢 **Resolved (Hillebrand, 2026-08-16):** flash-bevestiging toont met een vaste timeout van 3-4 seconden, consistent met `taak/nieuw.vue`'s bevestigingspatroon.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-15 | Story aangemaakt via create-story, voortbouwend op Story 5.1 (done). Drie architectuurstukken geïdentificeerd die déze story als eerste nodig heeft: (1) een terugvalpad-fetchroute voor de detailpagina (`GET /api/tasks/{id}/detail`, apart van de bestaande `[id].get.ts` die een andere consument bedient); (2) het eerste echte, user-facing gebruik van `deleteTaskAndSession` (Story 3.1, tot nu toe alleen intern) — expliciet onderscheiden van Story 4.7's `completedAt`-aanpak (die is voor automatische afronding, dit is een destructieve gebruikersactie); (3) een cross-pagina flash-bevestiging-mechanisme (`useState('flash-message', ...)`), nog nergens in dit project aanwezig. Twee kleine, niet-blokkerende Open Questions vastgelegd (voorlopige Story-5.3-route-naam, flash-bevestiging-timing). |
| 2026-08-16 | Beide Open Questions besproken en opgelost met Hillebrand: (1) Story 5.3's bewerkformulier-route wordt `/taken/{id}/bewerken`; (2) flash-bevestiging toont met een vaste timeout van 3-4 seconden. Task 3/6 en beide Open Questions bijgewerkt. |
| 2026-08-16 | Alle 7 taken afgerond: `taken/index.vue`'s `openTaak()` geeft nu de taak mee via `useState('taak-detail', ...)`; nieuwe `getTaskWithProgress`-aggregatie + `GET /api/tasks/{id}/detail`-terugvalpad; nieuwe pagina `app/pages/taken/[id].vue` (detailweergave, verwijder-bevestigingsmodal); nieuwe `DELETE /api/tasks/{id}`-route (eerste user-facing gebruik van `deleteTaskAndSession`); `taken/index.vue` toont nu een flash-bevestiging via `useState('flash-message', ...)`. Eén typecheck-fix nodig: `$fetch`'s methode-type-inferentie koos alleen de GET-variant op een multi-method-route (`/api/tasks/:id` heeft zowel `get` als `delete`) — opgelost met een expliciete generic (`$fetch<{ ok: true }>(...)`). Typecheck/build slagen. Gedeployed naar dev en live geverifieerd: golden path zonder extra fetch (netwerkrequests gecontroleerd), terugvalpad bij directe navigatie, Annuleren laat de taak ongemoeid, Verwijderen verwijdert taak/sessie/deeltaken volledig (DB-query bevestigd) met zichtbare flash-bevestiging, Bewerken geeft de verwachte (bewuste) 404. Status → review. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `$fetch(url, { method: 'DELETE' })` op een route met meerdere HTTP-methoden (`/api/tasks/:id` heeft `get` én `delete`) kreeg een typefout: TS koos alleen de `get`-tak van de gegenereerde Nitro-route-types. Opgelost met een expliciete generic op de aanroep (`$fetch<{ ok: true }>(...)`) i.p.v. op de automatische route-type-inferentie te vertrouwen — eerste keer dat dit project een multi-method-route vanuit de client aanroept.

### Completion Notes List

- **AC #1/#2/#3 zijn end-to-end live geverifieerd**, incl. een expliciete netwerkrequest-controle die bevestigt dat het golden path (klik vanaf 6.1) geen nieuwe fetch doet.
- **Eerste échte gebruik van `deleteTaskAndSession` buiten een interne rollback** — taak/sessie/deeltaken zijn na verwijdering volledig weg, geen wees-rijen (DB-geverifieerd).
- **Beide Open Questions waren al vóór dev-story opgelost** — geen nieuwe blokkerende punten tijdens implementatie.
- **`detail-edit-button` navigeert naar een nog-niet-bestaande route (`/taken/{id}/bewerken`)** — bewust, Story 5.3 (backlog) bouwt de doelpagina; 404 bevestigd als verwacht gedrag.

### File List

**Nieuw:**
- `app/pages/taken/[id].vue`
- `server/api/tasks/[id]/detail.get.ts`
- `server/api/tasks/[id].delete.ts`
- `server/domain/tasks/delete-task.ts` (review-patch)

**Gewijzigd:**
- `app/pages/taken/index.vue` (`openTaak()` geeft data mee via `useState`; flash-bevestiging toegevoegd)
- `server/data/tasks.ts` (`getTaskWithProgress` toegevoegd)

**Live gedeployed:** stage `dev` op `flowz.fyi`. Eén testtaak (met 2 deeltaken) aangemaakt, doorlopen (golden path, terugvalpad, annuleren, bewerken-404, verwijderen) — via de verwijder-flow zelf al volledig opgeruimd, DB-verificatie bevestigde 0 resterend.

### Review Follow-ups (AI)

- [x] [Review-patch][Decision] `DELETE`-route → nieuwe `server/domain/tasks/delete-task.ts` (zie Review Findings hierboven) — `server/domain/tasks/delete-task.ts`, `server/api/tasks/[id].delete.ts`. Typecheck/build geslaagd, gedeployed naar dev, live herverifieerd (verwijder-flow werkt onveranderd correct).
- [x] [Review-patch][Patch] Overige 6 patches (Calendar-fout-tolerantie, `useState`-invalidatie, foutfeedback via flash, `deleteError`-reset, voortgangsbalk-clamp, "Bezig"-status) toegepast — zie Review Findings hierboven. Live herverifieerd: niet-bestaande taak-id toont nu "Deze taak kon niet worden gevonden." (was voorheen een stille redirect), verwijder-flow blijft werken, DB bevestigt volledige opruiming.
