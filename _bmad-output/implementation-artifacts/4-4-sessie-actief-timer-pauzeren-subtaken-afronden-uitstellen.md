---
baseline_commit: 62f0933fa4a923ae4388a6d20cac1f1ee602da40
---

# Story 4.4: Sessie-actief — Timer, Pauzeren, Subtaken Afronden/Uitstellen

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want tijdens een werksessie de tijd zien lopen en subtaken één voor één afwerken,
so that ik gefocust kan werken zonder de rest van de taak te hoeven overzien.

## Acceptance Criteria

1. **Given** Evelien is op 1.3-sessie-actief, **when** de sessie start, **then** loopt `active-timer` oplopend (niet aftellend) door, tenzij gepauzeerd, **and** toont `active-progress-indicator` "Subtaak {huidig} van {totaal}" (alleen als de taak subtaken heeft), **and** toont de huidige subtaak (`active-subtask-name`) met `active-subtask-done-button` ("Klaar") en `active-subtask-later-button` ("Later") (FR3, FR4).
2. **Given** Evelien klikt op `active-subtask-done-button`, **when** dit de laatste subtaak was, **then** vervangt `active-all-done-message` ("Alle subtaken klaar!") de subtaak-sectie.
3. **Given** Evelien klikt op `active-subtask-later-button`, **when** de actie verwerkt wordt, **then** wordt de huidige subtaak niet afgerond maar uitgesteld (telt nog mee als te doen, komt later in de sessie terug) en verschijnt de volgende subtaak (FR4).
4. **Given** de taak heeft geen subtaken, **when** 1.3 laadt, **then** toont het scherm i.p.v. de subtaak-sectie vak + taaknaam als context (`active-task-context-fallback`), zonder "Klaar"/"Later".
5. **Given** Evelien klikt op `active-pause-button`, **when** de sessie gepauzeerd wordt, **then** bevriest de timer, wisselt de knoptekst naar "Hervatten"; nogmaals klikken hervat (FR5).
6. **Given** de geplande sessietijd is verstreken, **when** Evelien nog niet gestopt is, **then** blijft de sessie actief met een subtiel visueel signaal (geen alarm) (FR6).

## Belangrijk: een echte datagap tussen 1.2 en 1.3 die déze story moet dichten, plus een bewuste scope-grens met Story 4.5

**Datagap:** `TaskPrepResponse` (Story 4.3, `shared/types/tasks.d.ts`) — de vorm die zowel `GET /api/tasks/[id]` teruggeeft als wat `useState('sessie-start-taak', ...)`/`useState('sessie-actief-taak', ...)` doorgeeft — bevat **geen subtaken**. Zonder subtaken kan 1.3 z'n kernfunctionaliteit (AC #1-#4, de hele subtaak-wachtrij) niet bouwen. Er bestaat ook nog geen `getSubtasksForTask`-achtige leesfunctie in `server/data/tasks.ts` (`createTaskAndSession` schrijft subtaken al sinds Story 3.2, maar niets leest ze nog terug). **Déze story breidt `TaskPrepResponse` uit met `subtasks`** (Task 1) — een additieve, backwards-compatibele uitbreiding van Story 4.3's endpoint/type, geen breaking change.

**Race-conditie bij "Start" op 1.2, ook aan te pakken:** `sessie/starten.vue`'s `taak`-computed (Story 4.3's review-fix) geeft voorrang aan de op-de-achtergrond-gefetchte `fetchedTaak` zodra die binnen is, maar valt daarvóór terug op `sessieStartTaak` (de `useState` vanuit 1.1, van het type `HomePlanResponse['nextTask']` — **heeft nooit subtaken gehad en zal die ook nooit krijgen**, want 1.1's eigen endpoint bouwt geen subtaak-join). Als Evelien op "Start" klikt vóórdat de achtergrond-fetch is voltooid, zou `SessieActiefTaak` zonder subtaken naar 1.3 doorgegeven worden — een taak mét subtaken zou dan als "geen subtaken" verschijnen. **Déze story verhardt `startSessieActief` (Task 2)**: wacht de fetch af (indien nog niet voltooid) vóór het navigeren, zodat 1.3 altijd de gegarandeerd-volledige data krijgt. Gegeven hoe snel deze fetch al vanaf page-load draait (Story 4.3), is de praktische wachttijd voor een mens die eerst de taakkaart leest vrijwel nooit merkbaar — dit is een correctheids-garantie, geen waargenomen vertraging.

**Bewuste scope-grens met Story 4.5 (Wegnavigeer-bescherming):** de UX-spec van 1.3 beschrijft ook `active-leave-confirm-modal`, de `beforeunload`/`sendBeacon`-afhandeling, en de sessie-heartbeat (`POST /api/sessions/{id}/heartbeat`) — dat is **letterlijk Story 4.5's eigen titel en AC-lijst** in `epics.md`, niet déze story's. Bouw dat hier niet vooruit. **Ook de "Stoppen"-knop se serverkant (`POST /api/sessions/{id}/stop`, sessie-loggen) hoort niet bij déze story's AC-lijst** (geen van de zes AC's hierboven noemt "Stoppen" of een API-aanroep) — die logica komt bij Story 4.5 (dat expliciet dat endpoint bouwt) en Story 4.7 (fire-and-forget-herplanning). Déze story bouwt de "Stoppen"-knop wél als navigatie-element (nodig voor een bruikbare pagina, UX-spec's enige exit-point, zelfde precedent als Story 4.1-4.3's "bouw de knop, de bestemming volgt later") — puur client-side: sessie-log (bestede tijd + per-subtaak-status) verzamelen in een nieuwe `useState`, navigeren naar `/sessie/overzicht?taak={id}` (Story 4.6's route, **bestaat nog niet — verwachte 404** tot Story 4.6 gebouwd wordt). Geen API-aanroep vanuit déze story.

## Tasks / Subtasks

- [x] Task 1: Subtaken-datagap dichten — `server/data/tasks.ts` + `server/api/tasks/[id].get.ts` + `shared/types/tasks.d.ts` (AC: #1, #4)
  - [x] `getSubtasksForTask(taskId: string): Promise<Subtask[]>` (nieuw, `server/data/tasks.ts`) — simpele `select().from(subtasks).where(eq(subtasks.taskId, taskId))`, zelfde stijl als `getSessionForTask`.
  - [x] `TaskPrepResponse` (`shared/types/tasks.d.ts`) uitbreiden met `subtasks: { id: string, name: string, minutes: number | null }[]`.
  - [x] `GET /api/tasks/[id]` (Story 4.3, `server/api/tasks/[id].get.ts`) roept `getSubtasksForTask` aan (binnen de bestaande try/catch) en neemt het resultaat op in de response.
  - [x] Nieuw gedeeld type `SessionActiveTaak` (`shared/types/tasks.d.ts`, i.p.v. `sessie/starten.vue`'s lokale `SessieActiefTaak`-interface — DRY-les uit Story 4.2's review): `TaskPrepResponse & { starttijdstip: string }`.
- [x] Task 2: `app/pages/sessie/starten.vue` verharden (AC: #1, #4 — indirect, voorkomt datacorruptie bij navigatie)
  - [x] `startSessieActief` wacht de achtergrond-fetch af (`await fetchTaak()`, of — als die al voltooid is — gebruikt het resultaat direct) vóórdat 'ie `useState('sessie-actief-taak', ...)` zet en navigeert, zodat `subtasks` gegarandeerd de volledige, servergevalideerde lijst is (nooit de subtaak-loze `useState('sessie-start-taak', ...)`-fallback).
  - [x] Lokale `interface SessieActiefTaak` vervangen door het nieuwe gedeelde `SessionActiveTaak`-type (Task 1).
- [x] Task 3: `app/pages/sessie/actief.vue` — nieuwe pagina (AC: #1, #2, #3, #4, #5, #6)
  - [x] Sessie-gate bovenaan, zelfde patroon als elke bestaande pagina.
  - [x] Lees `useState<SessionActiveTaak | null>('sessie-actief-taak', () => null)`. **Geen eigen fetch-terugvalpad** (UX-spec: "Geen aparte Laden/Fout-state... subtaakgegevens komen mee vanuit de taakdata") — als de data ontbreekt of het id niet overeenkomt met de `taak`-query-param, navigeer terug naar `/sessie/starten?taak={id}` (Story 4.3's pagina heeft wél een volwaardig terugvalpad — hergebruik dat i.p.v. de fetch/laadstaat-machinery hier te dupliceren).
  - [x] **Timer** (`active-timer`, AC #1/#5/#6): wandklok-gebaseerd (`accumulatedMs` + `runStartedAt`-tijdstip + een 1-seconde-`setInterval`-`tick` die alleen een reactieve "nu"-ref bijwerkt) i.p.v. een simpele opgehoogde teller — voorkomt drift bij een vertraagde/gethrottlede interval-tick (bv. een achtergrondtab). `MM:SS`-formaat (`H:MM:SS` zodra ≥ 1 uur). Geen `aria-live` (UX-spec: zou screenreaders overspoelen).
  - [x] **Pauzeren** (`active-pause-button`, AC #5): toggle tussen "Pauzeren"/"Hervatten" (`aria-label` idem). Pauzeren = `runStartedAt` naar `null`, tel `Date.now() - runStartedAt` op bij `accumulatedMs` vóór het nullen. Hervatten = `runStartedAt` weer op `Date.now()`.
  - [x] **Subtiel signaal na geplande tijd** (AC #6): `computed(() => elapsedMs >= taak.plannedMinutes * 60_000)` — een CSS-klasse-wissel op `active-timer` (bv. subtiele kleurverandering), geen tekst/alarm/melding.
  - [x] **Subtaak-wachtrij** (AC #1/#2/#3): lokale reactieve state — `queue: string[]` (subtaak-id's, initieel in de volgorde van `taak.subtasks`), `doneIds: Set<string>`, `laterIds: Set<string>` (bijgehouden voor Story 4.6's Afgerond/Uitgesteld/Niet-gestart-classificatie, zie Task 3's laatste subtaak). Huidige subtaak = `taak.subtasks.find(s => s.id === queue[0])`.
    - `active-subtask-done-button` → `doneIds.add(queue[0])`, `queue.shift()`.
    - `active-subtask-later-button` → `laterIds.add(queue[0])`, verplaats `queue[0]` naar het einde van `queue` (niet verwijderen).
    - `active-progress-indicator` ("Subtaak {huidig} van {totaal}"): `huidig = doneIds.size + 1`, `totaal = taak.subtasks.length` — bewuste keuze: "Later" verandert `huidig` niet (dezelfde positie in de sequentie, alleen een andere subtaak op dat moment zichtbaar), alleen "Klaar" telt op. Zie Open Questions.
    - `active-all-done-message` (AC #2): zichtbaar zodra `queue.length === 0`, vervangt de hele subtaak-sectie, `aria-live="polite"` (UX-spec, eenmalige aankondiging bij verschijnen — niet op de timer).
  - [x] **Geen-subtaken-variant** (AC #4): `taak.subtasks.length === 0` → `active-task-context-fallback` (`active-task-subject-fallback`, `active-task-name-fallback`, h1-rol) i.p.v. de subtaak-sectie; geen `active-progress-indicator`, geen "Klaar"/"Later".
  - [x] **"Stoppen"-knop** (`active-stop-button`, niet in de AC-lijst maar wél de UX-spec's enige exit-point — zie "Belangrijk"): altijd zichtbaar, rechts in de bovenste rij. `onClick` → bouwt een sessie-log (`{ subject, title, plannedMinutes, spentSeconds: Math.round(elapsedMs / 1000), subtasks: taak.subtasks.map(s => ({ id: s.id, name: s.name, status: doneIds.has(s.id) ? 'afgerond' : laterIds.has(s.id) ? 'uitgesteld' : 'niet-gestart' })) }`), zet die in een nieuwe `useState('sessie-overzicht-log', () => null)`, navigeert naar `/sessie/overzicht?taak={encodeURIComponent(id)}` (Story 4.6's route — **bestaat nog niet, verwachte 404**). Geen API-aanroep (zie "Belangrijk").
  - [x] `onUnmounted`: ruim de `setInterval` op (`clearInterval`) — voorkomt een lekkende timer bij het verlaten van de pagina.
- [x] Task 4: Verificatie (AC: #1, #2, #3, #4, #5, #6)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live geverifieerd tegen de dev-stage: taak mét subtaken (3+) — timer loopt op, voortgangsindicator "Subtaak 1 van N", "Klaar" op de eerste → "Subtaak 2 van N" met de tweede subtaak; "Later" op een subtaak → volgende subtaak verschijnt, voortgangsteller blijft gelijk, de uitgestelde subtaak komt aan het einde terug.
  - [x] Live geverifieerd: alle subtaken op "Klaar" → `active-all-done-message` vervangt de sectie.
  - [x] Live geverifieerd: taak zónder subtaken → `active-task-context-fallback` (vak+taaknaam), geen voortgangsindicator/Klaar/Later.
  - [x] Live geverifieerd: "Pauzeren" bevriest de timer (herhaalde screenshots tonen dezelfde waarde), knoptekst wordt "Hervatten"; nogmaals klikken hervat het oplopen.
  - [x] Live geverifieerd: "Stoppen" navigeert naar `/sessie/overzicht?taak=<id>` (verwachte 404, `useState`-inhoud geverifieerd via codelezing — zelfde erkende introspectiebeperking als eerdere stories).
  - [x] Live geverifieerd: de race-conditie-hardening (Task 2) — direct op "Start" klikken op 1.2 (zonder te wachten) resulteert alsnog in subtaken op 1.3 (niet de "geen subtaken"-fallback voor een taak die er wél heeft).
  - [x] Geen secrets/placeholder-waarden in code/commits. Testtaken na verificatie opgeruimd.

## Dev Notes

### Architectuurcompliance

- AD-3 (planning is een berekende weergave) — niet van toepassing, déze story doet geen planningsberekeningen; puur sessie-UI-state.
- Mutatie-ownership-regel — niet van toepassing, déze story voegt geen mutaties toe (Task 1's `getSubtasksForTask` is puur lezend, in de bestaande route zonder domain-tussenlaag — zelfde precedent als de rest van `[id].get.ts`).
- Story 3.1's Dev Notes voorspelden dit al: *"Epic 4's sessie-runner voegt die later toe via een eigen migratie"* (doelend op een `status`/`actualMinutes`-kolom op `Session`) — **déze story bouwt géén nieuwe kolom/migratie**. Subtaak-status (afgerond/uitgesteld/niet-gestart) is hier bewust puur client-side sessie-state, nooit naar de database geschreven binnen déze story's scope — dat gebeurt pas bij een latere Epic-4-story (waarschijnlijk 4.5's stop-endpoint of 4.7's replan-aanroep), niet hier.

### Project Structure Notes

`app/pages/sessie/actief.vue` is de derde pagina in `app/pages/sessie/` (naast `starten.vue`, Story 4.3). Geen nieuwe server-routes — Task 1 breidt alleen de bestaande `[id].get.ts` uit.

### Testen

Geen testframework in dit project. Live verificatie via de browser, inclusief de timer/pauze-tijdswaarnemingen (screenshots met een korte wachttijd ertussen, zelfde discipline als Story 4.1's skeleton-verificatie).

## Previous Story Intelligence (Story 4.3, inclusief de code review)

- **Achtergrond-fetch-zonder-laadstaat-op-het-primaire-pad is een bewust, herbruikbaar patroon** (Story 4.3's kritieke review-fix: `useFetch` niet `await`en, `taak`-computed laat de gefetchte data voorrang krijgen zodra beschikbaar) — déze story's Task 2-hardening bouwt hier direct op voort, geen nieuw patroon.
- **`is401`/`server: false`/`encodeURIComponent`-op-id-in-navigatie** blijven van toepassing overal waar déze story fetcht/navigeert.
- **Gedeelde types boven lokale duplicatie** (Story 4.2's DRY-les, hier toegepast op `SessieActiefTaak` → `SessionActiveTaak` in `shared/types/tasks.d.ts`).
- **Live-verificatie kan reële datamodel-gaten blootleggen die de UX-spec zelf niet noemt** (Story 4.3 vond de "later-list mist needs"-bug pas tijdens het testen) — voor déze story is de subtaken-datagap al vóóraf tijdens het schrijven van deze story ontdekt (niet pas tijdens dev-story), maar de les blijft: test ook met een taak die écht subtaken heeft, niet alleen de "geen subtaken"-variant.

## Git Intelligence

Laatste commit: `62f0933` (Story 4.3 incl. code review — sessie-tussenscherm, eerste ownership-check, kritieke needs-bugfix). Déze story is de eerste die daadwerkelijk sessie-tijd/voortgang bijhoudt (nog geen enkele Epic-4-story deed dat) en de derde die een volgend-404-doel bouwt (`/sessie/overzicht`, Story 4.6).

## References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 462-494 (Story 4.4's User Story + AC, brontekst), regels 496-524 (Story 4.5/4.6/4.7, ter afbakening van wat NIET bij 4.4 hoort)
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.3-sessie-actief/1.3-sessie-actief.md] — volledige paginaspecificatie (Object IDs, states, Technical Notes over herplanning-timing en de sendBeacon-open-vraag)
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.4-sessie-afronden/1.4-sessie-afronden.md] — regel 21 (`Route: /sessie/overzicht?taak={id}`), regels 140-196 (`wrap-planned-time`/`wrap-spent-time`/`wrap-progress-summary`/`wrap-subtask-list`, bepaalt welke velden de sessie-log-`useState` moet dragen)
- [Source: server/data/schema.ts] — regels 168-178 (`subtasks`-tabel: `id`, `taskId`, `name`, `minutes` — geen status-kolom)
- [Source: server/api/tasks/[id].get.ts] — Story 4.3, wordt hier uitgebreid (niet herbouwd)
- [Source: app/pages/sessie/starten.vue] — Story 4.3, `startSessieActief`/`SessieActiefTaak` worden hier verhard/verplaatst (niet herbouwd)

## Open Questions

1. **`active-progress-indicator`'s `huidig`-telling bij "Later"** — beargumenteerde keuze (`huidig = doneIds.size + 1`, "Later" verandert de teller niet). UX-spec specificeert dit gedrag niet expliciet. Zeg het als "Later" de teller wél moet laten oplopen (dus een andere semantiek: "hoeveelste subtaak-weergave", niet "hoeveelste afgeronde").
2. **Sessie-heartbeat en de "Stoppen"-server-aanroep zijn bewust NIET in déze story** (Story 4.5's scope, zie "Belangrijk") — de "Stoppen"-knop navigeert dus zonder enige serverbevestiging dat de sessie ooit "gestopt" is gelogd. Zeg het als dit toch al in déze story moet, i.p.v. te wachten op 4.5.
3. **`/sessie/overzicht` bestaat nog niet (Story 4.6)** — zelfde bewuste "gat door in volgorde bouwen" als elke eerdere Epic-4-story. AC's noemen dit exit-point niet expliciet, maar de UX-spec's Layout Structure wel.
4. **Timer-formaat bij zeer lange sessies (≥ 1 uur)** — `H:MM:SS` aangenomen, UX-spec geeft alleen het `MM:SS`-voorbeeld ("12:34"). Zeg het als een ander formaat gewenst is.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-02 | Story aangemaakt via create-story, voortbouwend op Story 4.3 (done). Tijdens het schrijven zelf een echte datagap ontdekt en in scope opgenomen: subtaken werden nog nergens van 1.2 naar 1.3 doorgegeven (`TaskPrepResponse` had geen `subtasks`-veld, geen leesfunctie in de data-laag bestond). Ook een race-conditie geïdentificeerd tussen 1.2's Start-knop en de achtergrond-fetch uit Story 4.3's eigen review-fix, en een hardening-taak toegevoegd om die te sluiten vóórdat dev-story begint. |
| 2026-08-02 | Taken 1-4 afgerond: `getSubtasksForTask` (nieuw), `TaskPrepResponse`/`SessionActiveTaak` uitgebreid, `[id].get.ts` levert nu subtaken, `sessie/starten.vue`'s `startSessieActief` verhard (wacht de fetch af), `app/pages/sessie/actief.vue` (nieuw — timer, pauzeren, subtaak-wachtrij, geen-subtaken-fallback, alle-klaar-melding, Stoppen). Typecheck/build slagen. Live end-to-end geverifieerd tegen de dev-stage: taak met 3 subtaken — Klaar/Later/wachtrij-herordening/teller allemaal correct, "Alle subtaken klaar!" bij de laatste; Pauzeren bevestigd bevroren (3s wachttijd, zelfde waarde) en Hervatten hervat zonder sprong/drift; race-conditie-hardening bevestigd (direct op Start klikken op 1.2 gaf alsnog de volledige subtaken-lijst door); Stoppen navigeert naar de verwachte 404 (`/sessie/overzicht`); geen-subtaken-variant toont correct de taak-context-fallback zonder voortgang/Klaar/Later. Testtaken opgeruimd via een tijdelijke debug-route (zelfde patroon als eerdere stories). Status → review. |
| 2026-08-02 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor — alle drie succesvol) afgerond en verwerkt: 9 patches toegepast, waaronder een door alle drie reviewers onafhankelijk gevonden ontbrekende `ORDER BY` op de subtaken-query (zie Review Findings), 3 items naar `deferred-work.md`, 7 dismissed. Typecheck/build opnieuw bevestigd, herdeployed naar `dev`, de subtaakvolgorde-fix én de gecapte voortgangsteller bij "alle klaar" live herbevestigd met een nieuwe testtaak (subtaken "Alpha"/"Beta" verschenen in de juiste volgorde, teller bleef "2 van 2" i.p.v. "3 van 2"). Status → done. |

## Review Findings

_Code review uitgevoerd 2026-08-02 door drie parallelle adversariële reviewlagen (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — alle drie succesvol afgerond, geen failed_layers. Triage: 0 decision-needed, 9 patch, 3 defer, 7 dismiss._

### Patches toegepast

1. **Ontbrekende `ORDER BY` op `getSubtasksForTask`** (alle drie reviewers onafhankelijk gevonden — sterkste signaal van de hele review) — zonder expliciete ordening is de rijvolgorde uit de database niet gegarandeerd, terwijl AC #1's hele "Subtaak {huidig} van {totaal}"-wachtrij daarvan afhangt. `.orderBy(subtasks.createdAt)` toegevoegd. `server/data/tasks.ts`. Live herbevestigd met een nieuwe testtaak (subtaken verschenen in de juiste aanmaakvolgorde).
2. **Voortgangsindicator verdween volledig bij "alle subtaken klaar", in tegenspraak met AC #1's letterlijke tekst** (Acceptance Auditor) — AC #2 vervangt alleen de "subtaak-sectie", niet de voortgangsindicator in de kopregel. Indicator blijft nu zichtbaar, met `huidigNummer` gecapt op `totaalSubtaken` (voorkomt een onzinnige "4 van 3"-weergave). `app/pages/sessie/actief.vue`. Live herbevestigd ("Subtaak 2 van 2" naast "Alle subtaken klaar!").
3. **Race-conditie-hardening degradeerde stilzwijgend naar de "geen subtaken"-fallback bij een mislukte achtergrond-fetch, wat AC #4 kan misrepresenteren** (Acceptance Auditor + Blind Hunter) — `startSessieActief` navigeert nu alleen nog door als de gefetchte (subtaak-volledige) data daadwerkelijk binnen is; blijft die uit, dan blijft Evelien op 1.2 staan waar de al-bestaande foutstatus zichtbaar is, i.p.v. door te navigeren met verzonnen lege `subtasks`. `app/pages/sessie/starten.vue`.
4. **Lokale sessie-state (wachtrij/timer) zou kunnen "lekken" tussen twee taken bij een directe route-wissel** (Blind Hunter) — Vue hergebruikt de paginacomponent bij een navigatie tussen twee `/sessie/actief?taak=...`-URL's. Een `watch` op `taakId` reset nu `queue`/`doneIds`/`laterIds`/`accumulatedMs`/`runStartedAt`. `app/pages/sessie/actief.vue`.
5. **Geen bescherming tegen een dubbele klik op "Start" tijdens de afgewachte achtergrond-fetch** (Blind Hunter + Edge Case Hunter) — `isStarting`-guard toegevoegd (vroege return + knop `disabled` tijdens het wachten). `app/pages/sessie/starten.vue`.
6. **`await fetchTaak()` niet beschermd tegen een onverwachte throw** (Edge Case Hunter) — `.catch(() => {})` als extra bescherming, ook al vangt `useFetch` fouten normaliter al zelf af in de `error`-ref. `app/pages/sessie/starten.vue`.
7. **`elapsedMs` kon in theorie negatief worden bij een teruggezette systeemklok** (Edge Case Hunter) — `Math.max(0, ...)`-clamp toegevoegd. `app/pages/sessie/actief.vue`.
8. **`overGeplandeTijd` zou bij een (in theorie mogelijke) 0-minuten-taak meteen bij sessiestart actief worden** (Edge Case Hunter) — `plannedMinutes > 0`-guard toegevoegd. `app/pages/sessie/actief.vue`.
9. **`stopSessie` liet `sessieActiefTaak`-useState ongewijzigd staan** (Edge Case Hunter) — een browser-terug-navigatie na "Stoppen" zou 1.3 met een reset timer/wachtrij kunnen heropenen voor een al-gestopte sessie. Nu expliciet leeggemaakt vóór het navigeren. `app/pages/sessie/actief.vue`.

### Uitgesteld (`deferred-work.md`)

- Timer-weergave kan tijdelijk bevriezen in een achtergrondtab (onderliggende berekening blijft correct, alleen de zichtbare tekst update vertraagd).
- Kleur-only signaal voor "over de geplande tijd", geen tekst/aria-alternatief.
- Geen click-guard tegen een zeer snelle dubbele klik op "Klaar"/"Later".

### Dismissed

- "Later" kan een subtaak in theorie oneindig blijven uitstellen zonder 'm ooit af te ronden — werkt zoals ontworpen; geen productvereiste voor een geforceerde afronding, "Stoppen" blijft altijd beschikbaar.
- Non-null assertion (`runStartedAt.value!`) in `togglePause` — logisch veilig zoals geschreven (alleen bereikt binnen de al-geverifieerde "niet gepauzeerd"-tak).
- `SessionActiveTaak`'s Engelse naam tussen overwegend Nederlandse variabelenamen — matcht de al-bestaande projectconventie (Engelse typenamen, Nederlandse domeinnamen, zie `TaskPrepResponse`/`HomePlanResponse`).
- Hardcoded kleurwaarden in scoped CSS — matcht elke andere pagina in dit project (geen design-tokensysteem aanwezig).
- `stopSessie` navigeert naar een nog niet bestaande route (404) — bewust, expliciet gedocumenteerd, zelfde precedent als elke voorgaande Epic-4-story.
- Nul testdekking — staand projectbreed punt, geen testframework aanwezig.
- Zorg dat andere consumenten van `TaskPrepResponse` zouden kunnen breken door de nieuwe verplichte `subtasks`-veld — ongegrond, typecheck bevestigde geen breuk (`sessieStartTaak` is een ander type, `HomePlanResponse['nextTask']`, niet `TaskPrepResponse`).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Typefout tijdens implementatie**: `sessie/starten.vue`'s `taak`-computed kon niet langer `PrepTaak | null` (nu met verplichte `subtasks`) typen, omdat de useState-fallback (`sessieStartTaak`) nooit `subtasks` heeft en dat ook nooit zal krijgen. Gefixt door `taak`'s type te wijzigen naar `Omit<PrepTaak, 'subtasks'> | null` (1.2 toont subtasks toch nergens) en `startSessieActief` `subtasks` expliciet apart te laten komen uit `fetchedTaak.value?.subtasks ?? []` i.p.v. impliciet via de spread.
- **Live-verificatie bevestigde de race-conditie-hardening werkt**: direct na page-load op "Start" klikken (zonder te wachten) gaf alsnog de volledige subtaken-lijst door aan 1.3 — de `await fetchTaak()`-hardening ving de in-flight-fetch correct af.
- **Timer/pauze-verificatie via herhaalde screenshots met een wachttijd ertussen** (zelfde discipline als Story 4.1's skeleton-verificatie): bevestigde zowel dat "Pauzeren" de timer echt bevriest (3s wachttijd, identieke weergegeven waarde) als dat "Hervatten" zonder sprong/drift doorloopt.
- Testtaken opgeruimd via een tijdelijke, nooit-gecommitte debug-route (`server/api/_debug/cleanup-story-4-4.get.ts`, zelfde patroon als eerdere stories) — gedeployed, aangeroepen, verwijderd, opnieuw gedeployed, 404 bevestigd.

### Completion Notes List

- **AC #1-#6 zijn allemaal end-to-end live geverifieerd**, inclusief de subtaak-wachtrij-herordening bij "Later" en de teller-semantiek (alleen "Klaar" laat 'm oplopen).
- **Eerste story die daadwerkelijk sessietijd/voortgang bijhoudt** — alle voorgaande Epic-4-stories bouwden alleen navigatie/data-doorgifte.
- **Een echte datagap (subtaken ontbraken tussen 1.2 en 1.3) en een race-conditie werden al tijdens het schrijven van de story zelf geïdentificeerd en in scope opgenomen** — niet pas tijdens dev-story of de code review ontdekt, in tegenstelling tot Story 4.2/4.3's eigen bevindingen tijdens implementatie/verificatie.
- **Vier Open Questions blijven open voor Hillebrand** (progress-teller-semantiek bij "Later", bewust géén heartbeat/stop-endpoint in déze story, `/sessie/overzicht`-404 tot Story 4.6, timer-formaat bij lange sessies) — geen van alle blokkeerde de implementatie.

### File List

**Nieuw:**
- `app/pages/sessie/actief.vue`

**Gewijzigd:**
- `server/data/tasks.ts` (`getSubtasksForTask`)
- `server/api/tasks/[id].get.ts` (subtaken toegevoegd aan de response)
- `shared/types/tasks.d.ts` (`TaskPrepResponse.subtasks`, `SessionActiveTaak`)
- `app/pages/sessie/starten.vue` (`startSessieActief` verhard, lokale interface vervangen door gedeeld type)

**Live gedeployed:** stage `dev` op `flowz.fyi`. Geen schema-migratie nodig (geen nieuwe kolommen/tabellen — `subtasks` bestond al sinds Story 3.2). Tijdelijke debug-route is ná gebruik verwijderd en hoort niet bij deze File List.
