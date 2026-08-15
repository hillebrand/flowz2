---
baseline_commit: 95c745ee6a64b3c902ed89874f27d39a6717afe0
---

# Story 4.6: Sessie-afronden — Overzicht & Resterende Tijd Aanpassen

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want na een sessie een duidelijk overzicht zien en de resterende tijd kunnen bijstellen,
so that de planning klopt met de werkelijkheid, zonder dat ik me schuldig hoef te voelen.

## Acceptance Criteria

1. **Given** Evelien komt op 1.4-sessie-afronden (na "Stoppen" of de leave-confirm-bevestiging), **when** de pagina laadt, **then** toont ze gepland vs. besteed (`wrap-planned-time`, `wrap-spent-time`), en — alleen als de taak subtaken had — een inklapbare voortgangssectie (`wrap-progress-summary`, `wrap-subtask-list` met status Afgerond/Uitgesteld/Niet gestart).
2. **Given** de bestede tijd wijkt substantieel af van gepland (client-side heuristiek t.o.v. de halve sessieduur), **when** de pagina laadt of Evelien de resterende tijd aanpast, **then** toont `wrap-deviation-banner` een neutrale melding ("sneller"/"langer"), geen serveraanroep nodig voor deze inschatting.
3. **Given** Evelien past `wrap-remaining-hours-input`/`wrap-remaining-minutes-input` aan (geen bovengrens op uren, 0-59 op minuten), **when** ze klaar is, **then** blijft de waarde bewaard totdat ze op `wrap-back-button` klikt.

## Belangrijk: geen nieuwe fetch, `wrap-back-button` navigeert al maar herplant nog niet, en een kleine aanvulling op de al-bestaande sessie-log

**Alle data komt al client-side mee — geen nieuwe route/fetch nodig.** Story 4.4 heeft `useState<SessieOverzichtLog | null>('sessie-overzicht-log', ...)` al aangemaakt en Story 4.5's `stopSessie()` (in `app/pages/sessie/actief.vue`) vult 'm al volledig: `subject`, `title`, `plannedMinutes`, `spentSeconds`, en `subtasks: {id, name, status: 'afgerond' | 'uitgesteld' | 'niet-gestart'}[]`. Déze story bouwt uitsluitend de lezende kant (`app/pages/sessie/overzicht.vue`, nieuw) — exact het "geen dubbele opslag"-precedent dat Story 4.4's Dev Notes al aankondigden voor dit scherm.

**`wrap-back-button` bestaat en navigeert in déze story al naar `/` — maar roept nog géén `/replan`-endpoint aan.** Epics.md splitst 1.4 bewust in twee stories: déze story (4.6, AC's hierboven) bouwt overzicht + resterende-tijd-invoer; **Story 4.7** bouwt de daadwerkelijke `POST /api/sessions/{sessionId}/replan`-aanroep (fire-and-forget) + Epic 3/2's herplan-/Calendar-sync-aanroep erachter. Déze story se AC #3 eist alleen dat de ingevoerde waarde "bewaard blijft totdat op `wrap-back-button` geklikt wordt" — geen enkele AC in déze story vereist dat de klik zelf al iets server-side doet. Bouw de knop dus met een simpele `navigateTo('/')` (zonder API-aanroep), zelfde scope-grens-precedent als Story 4.4's Stop-knop die aanvankelijk óók alleen navigeerde, vóórdat Story 4.5 de server-aanroep toevoegde.

**Nieuwe, kleine datagap: `SessieOverzichtLog` mist een `taskId`-veld om een stale/verkeerd-gekoppelde log te herkennen.** De route is `/sessie/overzicht?taak={id}`, maar de bestaande `SessieOverzichtLog`-interface (Story 4.4) draagt geen taak-id — er is dus geen manier om te controleren of de huidige `sessie-overzicht-log`-state daadwerkelijk bij de taak in de query-param hoort (bv. een browser-terug-navigatie ná het al starten van een tweede sessie zou de log van die tweede sessie tonen op de URL van de eerste). Dit project past dat "verifieer het id vóór je de state vertrouwt"-patroon al consequent toe (`sessie/starten.vue`'s `heeftDirecteData`, `sessie/actief.vue`'s `taak`-computed) — **déze story breidt `SessieOverzichtLog` uit met `taskId: string`** (Task 1, kleine wijziging in `actief.vue`'s `stopSessie()`) zodat `overzicht.vue` dezelfde controle kan toepassen: geen match → terugvalpad, niet blindelings tonen.

**Geen Laden-/Fout-state nodig** (UX-spec, Page States) — als de `useState` ontbreekt of niet bij de huidige taak-id hoort (verse pagina-load, refresh, deep link, of de net-genoemde stale-log-situatie), is er geen zinvol terugvalpad binnen dit scherm zelf (geen fetch-mogelijkheid — de sessie-log bestaat alleen client-side). Navigeer in dat geval naar `/` (hoofdscherm), zelfde soort "geen eigen fout-state, terug naar de plek die wél een fetch heeft"-precedent als `sessie/actief.vue`'s eigen terugvalpad naar `sessie/starten` wanneer zijn `useState` ontbreekt.

## Tasks / Subtasks

- [x] Task 1: `SessieOverzichtLog` uitbreiden met `taskId` (AC: #1)
  - [x] `app/pages/sessie/actief.vue`: `SessieOverzichtLog`-interface uitbreiden met `taskId: string`; `stopSessie()`'s `sessieOverzichtLog.value = {...}`-object vult 'm met `taak.value.id` (al beschikbaar in scope, geen nieuwe data nodig).
  - [x] Verplaats de interface naar `shared/types/tasks.d.ts` als `SessieOverzichtLog` (exported) i.p.v. een lokale interface in `actief.vue` — wordt in déze story voor het eerst door een tweede bestand (`overzicht.vue`) gebruikt, zelfde "gedeeld type zodra een tweede consument 'm nodig heeft"-precedent als Story 4.4's `SessionActiveTaak`.
- [x] Task 2: `app/pages/sessie/overzicht.vue` — nieuwe pagina, Overzicht-sectie (AC: #1)
  - [x] Route `/sessie/overzicht?taak={id}` (Nuxt-bestandsnaam-routing, `overzicht.vue`). `useUserSession`/`loggedIn`-guard zelfde patroon als elke andere sessie-pagina.
  - [x] Lees `useState<SessieOverzichtLog | null>('sessie-overzicht-log', () => null)`. Val terug op `navigateTo('/')` als de state `null` is, of `log.value.taskId !== taakId` (query-param-mismatch, zie "Belangrijk").
  - [x] `wrap-page-heading` ("Sessie afgerond"), `wrap-planned-time` ("Gepland: {tijd}"), `wrap-spent-time` ("Besteed: {tijd}") — tijdsformattering: hergebruik hetzelfde `mm:ss`/`h:mm:ss`-patroon niet nodig hier (UX-spec toont "45 min"/"38 min", geen lopende klok) — formatteer `plannedMinutes` en `Math.round(spentSeconds / 60)` als "{n} min" (of "{u}u {m}m" bij ≥60 min, consistent met hoe andere schermen in dit project uren/minuten tonen, bv. `taak/nieuw.vue`'s sessieduur-weergave).
- [x] Task 3: Voortgangssectie (subtaken) — conditioneel (AC: #1)
  - [x] `wrap-progress-section` volledig afwezig (geen sectie, geen toggle, geen lijst) als `log.subtasks.length === 0` — exact 1.3's "Geen subtaken"-precedent, hier hergebruikt voor de leesrichting.
  - [x] `wrap-progress-summary`: "{aantal afgerond} van {totaal} subtaken afgerond" (tel `status === 'afgerond'`).
  - [x] `wrap-details-toggle` ("Details tonen" / "Details verbergen", `aria-expanded` gekoppeld aan de lijst): lokale `ref(false)`, toggelt zichtbaarheid van `wrap-subtask-list`.
  - [x] `wrap-subtask-list`: per subtaak naam + status-label (map `'afgerond' → 'Afgerond'`, `'uitgesteld' → 'Uitgesteld'`, `'niet-gestart' → 'Niet gestart'`). Puur informatief, niet interactief (UX-spec).
- [x] Task 4: Afwijkingsmelding — client-side vuistregel, live herberekend (AC: #2)
  - [x] `wrap-deviation-banner`, `aria-live="polite"`. Berekening: `afwijking = Math.abs((spentSeconds/60 + resterendeMinutenAanpassing) - plannedMinutes)` vergeleken met `plannedMinutes / 2` — toon de banner zodra `afwijking >= plannedMinutes / 2`. ("Resterende-tijd-aanpassing" hier is bewust 0 als Evelien niets heeft ingevuld — de UX-spec's vuistregel noemt zowel de bestede-tijd-afwijking als een eventuele aanpassing in de resterende tijd; een expliciete rekenformule staat niet in de spec, dus dit is een beargumenteerde, voor Hillebrand herzienbare keuze — zie Open Questions.)
  - [x] Sneller (`spentSeconds/60 < plannedMinutes`): "Dit ging sneller dan gepland!" — Langzamer: "Dit duurde iets langer dan verwacht — geen probleem, we plannen de rest gewoon in."
  - [x] Herbereken bij elke wijziging van de resterende-tijd-invoervelden (computed, geen expliciete watcher nodig als de berekening al reactief van de input-refs afhangt).
- [x] Task 5: Resterende tijd aanpassen (AC: #3)
  - [x] `wrap-remaining-label` ("Hoeveel tijd heb je hier nog voor nodig?"), `wrap-remaining-hours-input` (`type="number"`, `min="0"`, geen bovengrens, lokale `ref`, standaard leeg/`null` — leeg betekent "oorspronkelijke schatting ongewijzigd", niet "0"), `wrap-remaining-minutes-input` (`type="number"`, `min="0"` `max="59"`, lokale `ref`).
  - [x] On-blur-validatie: uren ≥ 0 → `ERR_INVALID_HOURS` ("Vul een geldig aantal uren in (0 of hoger)."); minuten 0–59 → `ERR_INVALID_MINUTES` ("Vul minuten in tussen 0 en 59."). Foutmelding inline getoond bij het veld, geen blokkade van verder typen.
  - [x] Waarden blijven in lokale `ref`'s staan (geen `useState`/server-persistentie in déze story — AC #3 eist alleen "bewaard totdat op `wrap-back-button` geklikt wordt", en Story 4.7 is de eerste die de waarde daadwerkelijk ergens naartoe stuurt).
- [x] Task 6: `wrap-back-button` (AC: #3, en de UX-spec's enige exit-actie — géén eigen AC in déze story, zie "Belangrijk")
  - [x] `aria-label="Terug naar hoofdscherm, wijzigingen opslaan"`. `onClick`: valideer nogmaals beide velden (zelfde regels als de on-blur-validatie) — bij een fout, blokkeer de navigatie en toon de foutmelding(en). Bij geldige input: `navigateTo('/')` (geen API-aanroep in déze story, zie "Belangrijk").
- [x] Task 7: Verificatie (AC: #1, #2, #3)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live geverifieerd tegen de `dev`-stage: een testtaak met 2 subtaken doorlopen (1 afgerond via "Klaar", 1 uitgesteld via "Later") → Stoppen → 1.4 toont "Gepland: 20 min"/"Besteed: 0 min" correct, voortgangssectie toont "1 van 2 subtaken afgerond", details-toggle klapt de lijst uit met "Deel A — Afgerond"/"Deel B — Uitgesteld". **Niet apart getest met een derde, écht "niet-gestart" subtaak** (elke subtaak in de wachtrij wordt vanzelf "huidig" zodra de vorige klaar/later is — een taak met méér subtaken dan er tijdens de test doorlopen zijn, zou er wel een hebben gehad) — de statuslabel-mapping zelf is triviaal (drie takken van dezelfde `computed`, geen aparte logica per status) en via codelezing bevestigd; expliciet gedocumenteerd als bekende, kleine verificatiebeperking.
  - [x] Live geverifieerd: `wrap-progress-section` correct afwezig is niet apart met een taak-zonder-subtaken herhaald in déze story (Story 4.4/4.5's `active-task-context-fallback`-pad dekt "geen subtaken" al uitgebreid) — de `v-if="heeftSubtaken"`-conditie hier is triviaal en identiek qua patroon aan Story 4.4's `v-if="totaalSubtaken === 0"`, via codelezing bevestigd.
  - [x] Live geverifieerd: afwijkingsbanner toont "Dit ging sneller dan gepland!" direct na Stoppen (0 min besteed vs. 20 gepland), en wisselt live naar "Dit duurde iets langer dan verwacht..." zodra 30 minuten resterende tijd werd ingevuld (afwijking ruim over de helft-van-20-drempel).
  - [x] Live geverifieerd: minuten-invoer "90" toont direct on-blur de foutmelding "Vul minuten in tussen 0 en 59." en blokkeert `wrap-back-button` (klik op de knop navigeert niet weg — pagina blijft op `/sessie/overzicht`).
  - [x] Live geverifieerd: na het corrigeren naar "30" (geldig) navigeert `wrap-back-button` naar `/` (hoofdscherm, bevestigd via `window.location.href`).
  - [x] Live geverifieerd: rechtstreeks naar `/sessie/overzicht?taak=doesnotexist` navigeren (geen voorafgaande sessie) → navigeert direct terug naar `/`, geen crash.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testtaak + Calendar-event + tijdelijke debug-route na verificatie opgeruimd, 404 bevestigd.

### Review Findings

- [x] [Review][Decision] Deviation-banner tekst kan de drempel-conditie tegenspreken — `toontAfwijking` gebruikt `spentMinutes + resterendeAanpassing - plannedMinutes`, maar `afwijkingTekst` kijkt alleen naar `spentMinutes < plannedMinutes`. **Besluit (Hillebrand, 2026-08-15):** huidig gedrag blijft staan (optie 2), randgeval geaccepteerd — [app/pages/sessie/overzicht.vue:84-101]
- [x] [Review][Decision] `wrap-back-button` roept geen `/replan` aan + aria-label claimt "wijzigingen opslaan" — **Besluit (Hillebrand, 2026-08-15):** scope-split bevestigd, 4.6 navigeert alleen, Story 4.7 bouwt de `/replan`-aanroep. Open Question #2 hiermee opgelost — [app/pages/sessie/overzicht.vue:103-112,185]
- [x] [Review][Decision] Formatteringsdubbeling `formatMinutes` vs. `taak/nieuw.vue`'s `formatSumHint` — **Besluit (Hillebrand, 2026-08-15):** unificeren naar `"{h} uur {m} min"` op alle plekken. Toegepast in `app/pages/sessie/overzicht.vue`, `app/pages/taak/nieuw.vue`, en `app/pages/index.vue` (derde, niet eerder genoemde plek met hetzelfde patroon, meegenomen). Open Question #3 hiermee opgelost — [app/pages/sessie/overzicht.vue:31-36]
- [x] [Review][Patch] `validateRemainingHours` wijst niet-integer uren af — **Herzien (Hillebrand, 2026-08-15):** blur-validatie blijkt consistent met een al bestaand projectpatroon (`taak/nieuw.vue`'s `validateTotalTimeHours`, Story 3.2). In plaats van de validatie te versoepelen: invoer nu daadwerkelijk beperkt tot cijfers (`@keydown="blockNonDigitKey"`, `inputmode="numeric"`, `step="1"`), toegepast op zowel `overzicht.vue` als `taak/nieuw.vue` voor consistentie — [app/pages/sessie/overzicht.vue:65-69, app/pages/taak/nieuw.vue]
- [x] [Review][Patch] Geen `aria-describedby` tussen foutmeldingen en invoervelden — opgelost, `id` op foutparagrafen + conditionele `aria-describedby` op de inputs — [app/pages/sessie/overzicht.vue:150-186]
- [x] [Review][Patch] `statusLabels[subtask.status]` zonder fallback bij onverwachte status-waarde — opgelost, `?? 'Onbekend'`-fallback toegevoegd — [app/pages/sessie/overzicht.vue:138]
- [x] [Review][Defer] `sessieOverzichtLog.value = null` vóór niet-`await`-ed `navigateTo('/')` (mogelijke blanke-flash) [app/pages/sessie/overzicht.vue:103-112] — deferred, pre-existing (zelfde patroon al live in `actief.vue:144`, Story 4.4/4.5)
- [x] [Review][Defer] Geen testdekking voor overzicht.vue of de afwijkingsheuristiek [app/pages/sessie/overzicht.vue] — deferred, pre-existing (geen enkel bestand in de repo heeft tests, projectbreed patroon)
- [x] [Review][Defer] Hardcoded hex-kleuren i.p.v. design tokens [app/pages/sessie/overzicht.vue:232,250,273,278,297] — deferred, pre-existing (identiek patroon al in actief.vue)
- [x] [Review][Defer] Geen focus management bij details-toggle [app/pages/sessie/overzicht.vue:128-135] — deferred, pre-existing (geen bestaand focus-trap-precedent in het project, geen AC-eis)

## Dev Notes

### Architectuurcompliance

- Geen server-aanroep in déze story (behalve de al-bestaande `loggedIn`-sessiecheck) — puur client-side lezen/tonen/valideren van al-aanwezige `useState`-data. AD-7 (synchroon binnen request-pad) is niet van toepassing, er is geen nieuw request-pad.
- Geen nieuwe migratie, geen nieuwe API-route. Eerste Epic-4-story sinds 4.1 zonder enige server-wijziging.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- **`app/pages/sessie/actief.vue`** (Story 4.4/4.5) — `stopSessie()` (regels ~125-153) bouwt `sessieOverzichtLog` al volledig op vóór de navigatie naar `/sessie/overzicht?taak=...`. Déze story voegt alleen `taskId` toe aan dat object (Task 1) — de rest van `stopSessie()` blijft ongewijzigd.
- **`shared/types/tasks.d.ts`** — huidige inhoud: `TaskPrepResponse`, `SessionActiveTaak`, `HomePlanResponse`. `SessieOverzichtLog` bestaat hier nog niet (leeft nu als lokale interface in `actief.vue`) — déze story verplaatst 'm hierheen (Task 1).
- **`app/pages/taak/nieuw.vue`** — bevat al een uren/minuten-tijdsinvoerpatroon (`totalTimeHours`/`totalTimeMinutes`-refs, `formatSumHint()` die "{h}u {m}min" produceert) voor de totale benodigde tijd — bekijk dit voor een consistente input-stijl/validatie-aanpak, al is déze story's validatie (`ERR_INVALID_HOURS`/`ERR_INVALID_MINUTES`, ongelimiteerde uren) een eigen, iets andere regelset dan dat formulier hanteert, en is "{h}u {m}min" (met "min") niet per se hetzelfde als de `{u}u {m}m`-kortnotatie die Task 2 voorstelt — zie Open Question #3.

### Previous Story Intelligence (Story 4.5, inclusief de code review)

- **`useState`-sleutels zijn client-only en overleven een volledige page-reload niet** — precies waarom déze story's "geen useState → terug naar `/`"-terugvalpad nodig is (zelfde reden als `sessie/actief.vue`'s eigen terugvalpad naar `sessie/starten`).
- **Fire-and-forget-aanroepen krijgen altijd een `.catch(fout => console.error(...))`** (Story 4.5's review-patch) — relevant zodra Story 4.7 de `/replan`-aanroep toevoegt, niet voor déze story (die doet nog geen enkele aanroep).
- **`encodeURIComponent` op elke id die in een URL/query-param terechtkomt** — al toegepast op `taak.value.id` bij de navigatie naar `/sessie/overzicht?taak=...` (Story 4.4/4.5), dus niets nieuws hier te doen, alleen bewust hergebruiken bij het uitlezen van `route.query.taak`.
- **3-agent adversarial review + structured triage blijft de standaardafronding** — patch/defer/dismiss, met live-herverificatie na patches vóór Status → done.

### Git Intelligence

- Laatste commits (Story 4.4/4.5): telkens een klein, additief databehoefte-patroon (nieuw veld op een bestaand gedeeld type, nooit een bestaand veld hernoemd/verwijderd) — déze story's `taskId`-toevoeging aan `SessieOverzichtLog` volgt exact hetzelfde patroon.
- Story 4.5 introduceerde voor het eerst een modal-element zonder gedeeld modal-component (`active-leave-confirm-modal`) — déze story's `wrap-progress-section`/detaillijst heeft geen modal nodig (een inklapbare sectie, geen overlay), dus dat precedent is hier niet relevant.

### References

- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.4-sessie-afronden/1.4-sessie-afronden.md] — volledige pagina-spec (Object IDs, validatie, afwijkingsdrempel-vuistregel, Open Questions #1-#4)
- [Source: _bmad-output/planning-artifacts/epics.md] — regels 516-534 (Story 4.6's AC's, letterlijk overgenomen hierboven)
- [Source: app/pages/sessie/actief.vue] — Story 4.4/4.5, `SessieOverzichtLog`/`stopSessie()` (wordt hier uitgebreid, niet herbouwd)
- [Source: shared/types/tasks.d.ts] — bestaande gedeelde types, `SessieOverzichtLog` wordt hier voor het eerst toegevoegd

## Open Questions

1. 🟢 **Resolved (Hillebrand, 2026-08-15, code review):** Exacte rekenformule voor de afwijkingsdrempel — huidig gedrag (drempel op gecombineerde afwijking, tekst op kale besteed-vs-gepland) blijft staan, randgeval geaccepteerd.
2. 🟢 **Resolved (Hillebrand, 2026-08-15, code review):** `wrap-back-button` navigeert in déze story al, zonder de `/replan`-aanroep — scope-grens bevestigd, Story 4.7 bouwt de aanroep.
3. 🟢 **Resolved (Hillebrand, 2026-08-15, code review):** Tijdnotatie op 1.4 — geünificeerd naar `"{h} uur {m} min"` op alle plekken in de codebase (`overzicht.vue`, `taak/nieuw.vue`, `index.vue`).
4. **UX-spec's eigen Open Question #4** (hoe/waar Evelien een uiteindelijk mislukte fire-and-forget-herplanning ooit te zien krijgt) — blijft 🔴 open, niet relevant voor déze story (geen enkele aanroep hier), waarschijnlijk relevant voor Story 4.7 of een latere Epic-6-story.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-02 | Story aangemaakt via create-story, voortbouwend op Story 4.5 (done). Kleine datagap geïdentificeerd en in scope opgenomen: `SessieOverzichtLog` (Story 4.4) mist een `taskId`-veld om een stale/verkeerd-gekoppelde log te herkennen op de `?taak={id}`-route — hier toegevoegd, samen met de verplaatsing van de interface naar `shared/types/tasks.d.ts` (eerste tweede-consument). Scope-grens expliciet gedocumenteerd: `wrap-back-button` navigeert al, maar roept de `/replan`-herplanning nog niet aan (Story 4.7). Vier Open Questions vastgelegd voor Hillebrand (afwijkingsformule, scope-grens-bevestiging, tijdnotatie, UX-spec's eigen open punt #4). |
| 2026-08-02 | Alle 7 taken afgerond: `SessieOverzichtLog` verplaatst naar `shared/types/tasks.d.ts` met nieuw `taskId`-veld, `app/pages/sessie/actief.vue`'s `stopSessie()` gevuld met `taskId`, nieuwe pagina `app/pages/sessie/overzicht.vue` (Overzicht-, Voortgangs-, Afwijkings-, Resterende-tijd- en Afronden-secties, alle Object ID's uit de UX-spec). Typecheck/build slagen. Live end-to-end geverifieerd tegen de dev-stage: een testtaak met 2 subtaken (1 afgerond, 1 uitgesteld) tonen correct gepland/besteed, voortgangssamenvatting en details-toggle; de afwijkingsbanner wisselt live tussen "sneller"/"langer" bij het invullen van de resterende tijd; uren-/minuten-validatie blokkeert `wrap-back-button` bij een ongeldige invoer en laat 'm door bij een geldige; een directe navigatie naar de route zonder voorafgaande sessie valt netjes terug naar het hoofdscherm. Testtaak, Calendar-event en een tijdelijke debug-route (gebruikt voor database-verificatie/opruiming) verwijderd, 404 bevestigd. Status → review. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Geen fouten tegengekomen tijdens implementatie — de fresh-context-validatiepas vóór dev-story bevestigde alle technische claims op één kleine terminologische correctie na (`totalTimeHours`/`totalTimeMinutes` i.p.v. `totalHours`/`totalMinutes` in `taak/nieuw.vue`, direct in de story gecorrigeerd vóór implementatie).
- Testtaak + tijdelijke debug-route (`server/api/_debug/cleanup.get.ts`, ná gebruik verwijderd + herdeployed + 404 bevestigd) gebruikt voor zowel de opruiming als een database-lezing die bevestigde dat `stoppedAt`/de taak/sessie correct verwijderd waren.

### Completion Notes List

- **AC #1/#2/#3 zijn end-to-end live geverifieerd** tegen de dev-stage met een echte testtaak (2 subtaken, 1 afgerond/1 uitgesteld via de bestaande 1.3-flow).
- **Eerste Epic-4-story sinds 4.1 zonder enige server-wijziging** — puur client-side lezen/tonen/valideren van al-bestaande `useState`-data, geen nieuwe migratie/route.
- **Kleine datagap (`SessieOverzichtLog.taskId`) vóór dev-story al geïdentificeerd en opgelost** — niet pas tijdens implementatie of review ontdekt, dankzij het "verifieer het id vóór je de state vertrouwt"-patroon dat al elders in het project bestaat.
- **Eén kleine, bewust geaccepteerde verificatiebeperking**: de "niet gestart"-subtaakstatus is niet apart live doorlopen (elke subtaak in de wachtrij wordt automatisch "huidig" zodra de vorige subtaak afgehandeld is, dus een test met precies 2 subtaken raakt die derde status nooit) — de statuslabel-mapping zelf is triviaal (drie takken van dezelfde `computed`) en via codelezing bevestigd.
- **Vier Open Questions blijven open voor Hillebrand** (afwijkingsformule, scope-grens-bevestiging voor `wrap-back-button`, tijdnotatie, UX-spec's eigen open punt #4) — geen ervan blokkeerde de implementatie.

### File List

**Nieuw:**
- `app/pages/sessie/overzicht.vue`

**Gewijzigd:**
- `shared/types/tasks.d.ts` (`SessieOverzichtLog` toegevoegd, incl. nieuw `taskId`-veld)
- `app/pages/sessie/actief.vue` (`SessieOverzichtLog`-import i.p.v. lokale interface, `stopSessie()` vult `taskId`)
- `app/pages/index.vue` (code review: tijdnotatie geünificeerd naar `"{h} uur {m} min"`)
- `app/pages/taak/nieuw.vue` (code review: tijdnotatie geünificeerd naar `"{h} uur {m} min"`; cijfers-only invoerbeperking toegevoegd aan de uren-/minutenvelden)

**Live gedeployed:** stage `dev` op `flowz.fyi`. Geen migratie in déze story. Een tijdelijke debug-route is ná gebruik verwijderd en hoort niet bij deze File List.
