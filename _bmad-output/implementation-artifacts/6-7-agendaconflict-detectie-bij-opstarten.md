---
baseline_commit: 2f361ce74d633aad22cd0a78d56135a4c81292b8
---

# Story 6.7: Agendaconflict-detectie bij Opstarten

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want gewaarschuwd worden als mijn ingestelde beschikbare tijd niet meer klopt met mijn agenda,
So that mijn planning nooit stiekem verkeerd is zonder dat ik het weet.

## Acceptance Criteria

**Given** Evelien opent de app
**When** 1.1-Home laadt en de opstart-check (`GET /api/availability/conflicts`) conflicten vindt
**Then** verschijnt `conflict-modal` bovenop 1.1-Home (geen eigen route) met het eerste conflict (FR18)
**And** worden agenda-items met de ingestelde huiswerk-kleur (Epic 2, Story 2.3) al server-side uitgesloten van deze check
**And** heeft de modal een focus-trap en sluit niet automatisch via Escape

**Given** de modal toont een conflict
**When** Evelien op `conflict-not-applicable-button` ("Nee, dit ís mijn huiswerktijd") klikt
**Then** wordt dit conflict als opgelost gemarkeerd; is er een volgend conflict, dan verschijnt dat in dezelfde modal, anders sluit de modal terug naar 1.1-Home (FR19)

**Given** de modal toont een conflict
**When** Evelien op `conflict-adjust-button` klikt
**Then** navigeert ze naar het in Story 6.6 gebouwde 8.2-beschikbare-tijd-aanpassen, nu met de echte conflict-context vanuit de modal

**Given** er zijn geen conflicten
**When** 1.1-Home laadt
**Then** verschijnt de modal niet

## Belangrijk: lees dit vóór je begint — vier scope-punten

1. **`DayEvent` krijgt een `colorId`-veld — de eerste wijziging aan een bestaand, al door meerdere stories gebruikt bestand.** `server/domain/calendar-sync/day-events.ts`'s `getTodayEvents` haalt Google's `colorId` momenteel niet op (Story 6.6 documenteerde dit expliciet als bewuste scope-beperking, met de aantekening "op te lossen zodra Story 6.7 dezelfde conflict-detectie-Calendar-aanroep uitbreidt" — dit is dat moment). Voeg `colorId?: string` toe aan de `DayEvent`-interface en de mapping in `getTodayEvents` (`event.colorId` uit Google's respons, optioneel/ongezet als Google niks teruggeeft). **Alle drie bestaande consumenten** (`server/api/home/plan.get.ts`, `server/domain/scheduling/week-overview.ts`, `server/domain/scheduling/shortfall.ts`, `server/domain/calendar-sync/actual-availability.ts` — Story 6.6) blijven ongewijzigd werken: een extra optioneel veld op een gedeeld interface is non-breaking, geen van hen filtert op kleur.
2. **Huiswerk-kleur-uitsluiting: vergelijk als string.** `users.homeworkCalendarColorId` is een `integer` (1-11, Story 2.3), maar Google's Events-API retourneert (en verwacht, zie `homework-events.ts`'s `colorId: String(colorId)`) een **string**. Vergelijk dus `event.colorId === String(user.homeworkCalendarColorId)`, nooit los numeriek. Is `homeworkCalendarColorId` `null` (huiswerk-sync nooit ingesteld), dan is er niks om op te filteren — alle timed events tellen dan mee als potentieel conflict.
3. **Nieuwe tabel nodig voor "als opgelost markeren".** Er bestaat nog geen mechanisme om een individueel conflict (een specifiek Calendar-event, op een specifieke datum, voor een specifieke user) blijvend als "niet van toepassing" te markeren — zonder dat zou hetzelfde conflict bij elke volgende Home-load opnieuw verschijnen. Voeg een nieuwe tabel `dismissed_conflicts` toe aan `server/data/schema.ts` (Drizzle-migratie via `npx drizzle-kit generate`, zelfde patroon als elke eerdere schema-wijziging in dit project — zie bijv. migratie `0004_sleepy_wong.sql` voor `homework_calendar_color_id`): kolommen `id`, `userId` (FK), `date` (`YYYY-MM-DD`, zelfde vorm als `availableTimeExceptions.date`), `googleEventId` (Google's event-`id`, niet nullable — dat is de identiteit van "dit specifieke conflict"), `createdAt`. Unieke index op `(userId, date, googleEventId)` (zelfde precedent als `available_time_exceptions_user_date_unique`). Let op: **de "tijd aanpassen"-route heeft géén eigen dismissal-rij nodig** — zodra Evelien via 8.2 de exceptie daadwerkelijk aanpast (Story 6.6), verdwijnt het conflict vanzelf bij de eerstvolgende check omdat de agenda-overlap dan niet langer boven de (nu correcte) beschikbare tijd uitkomt, of omdat de taak van die dag verplaatst is. Alleen `conflict-not-applicable-button` heeft persistente state nodig, want dáár verandert er in de onderliggende data niets.
4. **Detectievenster: dezelfde 7 dagen als Story 6.5's weekoverzicht, niet alleen vandaag.** De AC/UX-spec noemen geen expliciete datumgrens, en "Beschikbare tijd aanpassen voor {dag}" in de UX-spec (§8.1 Data & API Requirements) impliceert dat het conflict niet per se op vandaag hoeft te liggen. Hergebruik `WEEK_DAYS = 7` (het patroon uit `server/api/week.get.ts`) en scan `[vandaag, vandaag+6]` — consistent met hoe Story 6.5 al "de komende week" definieert, en voorkomt een derde, afwijkende definitie van "binnenkort" in dit project. Voor elke dag in dat venster: zijn er sessies gepland (`getTasksWithSessionOnDate`) én overlapt een niet-huiswerk-gekleurd Calendar-event met de beschikbare tijd voor die dag (zelfde overlap-wiskunde als Story 6.6's `calculateActualAvailableMinutes`/Story 4.2's `session-time-check.ts`)? Zo ja: één conflict-entry per overlappend event (niet per dag) — een dag met twee losse conflicterende afspraken toont dus twee conflicten na elkaar in de modal.

## Tasks / Subtasks

- [x] **Task 1: `DayEvent.colorId` + huiswerk-kleur-uitsluiting helper** (AC: server-side uitsluiting)
  - [x] `colorId?: string` toevoegen aan `DayEvent` (`server/domain/calendar-sync/day-events.ts`) en aan de Google-respons-mapping in `getTodayEvents`
  - [x] `npx nuxt typecheck` — bevestig dat de drie bestaande consumenten (home/plan, week-overview, shortfall, actual-availability) ongewijzigd compileren
- [x] **Task 2: `dismissed_conflicts`-tabel + migratie**
  - [x] Nieuwe Drizzle-tabel `dismissedConflicts` in `server/data/schema.ts` (kolommen per "Belangrijk" punt 3), unieke index op `(userId, date, googleEventId)`
  - [x] `npx drizzle-kit generate` om de migratie te genereren, controleer het gegenereerde SQL-bestand
  - [x] Data-laagfuncties in `server/data/` (of een nieuw bestand): `getDismissedConflictIds(userId, date)` en `dismissConflict(userId, date, googleEventId)` (upsert/insert, `onConflictDoNothing` — hergebruik hetzelfde idempotente-insert-patroon als `getOrCreateWeekPattern`)
- [x] **Task 3: Conflict-detectie-domain-logica**
  - [x] Nieuw `server/domain/calendar-sync/conflict-detection.ts` (of vergelijkbare naam): `detectAgendaConflicts(userId, today)` — scant het 7-dagen-venster (Belangrijk punt 4), per dag: sessies ophalen, Calendar-events ophalen, huiswerk-kleur uitsluiten, overlap berekenen (hergebruik/spiegel de overlap-mergelogica uit `actual-availability.ts`'s `mergedOverlapMinutes`/`overlapInterval` — geen re-implementatie van dezelfde wiskunde), dismissed conflicts uitsluiten
  - [x] Retourneert een array van conflict-objecten: `{ date, googleEventId, eventTitle }` (minimaal wat de UX-spec's `conflict_description`-template nodig heeft: "Op {dag} {datum} staat '{agenda-item}' gepland...")
  - [x] Fail-safe bij een mislukte Calendar-call voor een specifieke dag (`getTodayEvents` → `null`): die dag levert simpelweg geen conflicten op, geen 500 voor de hele check (zelfde precedent als `shortfall.ts`'s agendaFactor — dit is, anders dan Story 6.6's `calculateActualAvailableMinutes`, een achtergrond-signaleringscheck, geen scherm waarvan conflict-detectie het hele doel is)
- [x] **Task 4: API-routes**
  - [x] `GET /api/availability/conflicts` — retourneert de array uit Task 3 als `shared/types/conflict.d.ts`'s (uit te breiden) `AgendaConflictDto[]`
  - [x] `POST /api/availability/conflicts/dismiss` — body `{ date, googleEventId }`, roept `dismissConflict` aan (AC: `conflict-not-applicable-button`)
- [x] **Task 5: `conflict-modal`-component + integratie op 1.1-Home**
  - [x] Nieuw component (bijv. `app/components/ConflictModal.vue`) met Object IDs uit 8.1-conflictmelding.md: `conflict-modal`, `conflict-heading`, `conflict-description`, `conflict-not-applicable-button`, `conflict-adjust-button`
  - [x] Focus-trap + geen Escape-sluiting (zelfde soort a11y-eis als eerdere modals in dit project — zie `deferred-work.md`'s reeds meerdere keren doorgeschoven modal-a11y-categorie: dit is de eerste modal die het wél vanaf het begin correct implementeert, dus geen nieuwe entry daaraan toevoegen)
  - [x] `app/pages/index.vue`: fetch `/api/availability/conflicts` (zelfde `server: false`-precedent als de bestaande `plan`-fetch, om SSR-race te vermijden), toont de modal met het eerste conflict uit de array als die niet leeg is
  - [x] `conflict-not-applicable-button` → `POST .../dismiss`, haalt daarna de conflictenlijst opnieuw op (niet lokaal spliced — zelfde les als Story 6.5's zelfgevonden bug: vertrouw de server-staat, niet een lokale aanname) en toont het volgende conflict of sluit de modal
  - [x] `conflict-adjust-button` → `navigateTo('/agendaconflict/aanpassen?dag=' + conflict.date)` (hergebruikt Story 6.6's bestaande route/query-param ongewijzigd)
- [x] **Task 6: Live verificatie op de dev-stage**
  - [x] `npx nuxt typecheck` schoon, `npx sst deploy --stage dev`
  - [x] Open Question opgelost: Hillebrand koos expliciet voor een echte (tijdelijke) Calendar-testafspraak i.p.v. alleen domain-logica-niveau te testen. Testscenario met een tijdelijke echte taak/sessie + een echte, direct-nadien-verwijderde Calendar-testafspraak: conflict verscheen correct in zowel `GET /api/availability/conflicts` als de `conflict-modal` op Home, kleur-uitsluiting bevestigd (een tweede testafspraak met de huiswerk-kleur werd correct NIET als conflict gemeld), `conflict-not-applicable-button` liet een `dismissed_conflicts`-rij achter en het conflict verdween daarna uit zowel de API-respons als de modal, `conflict-adjust-button` navigeerde correct naar `/agendaconflict/aanpassen?dag=2026-08-17`
  - [x] Testdata (1 taak, 1 sessie, 3 tijdelijke Calendar-testafspraken na elkaar, `dismissed_conflicts`-rijen) volledig opgeruimd; Calendar en DB geverifieerd leeg (op de gebruiker se eigen pre-existente afspraken na)

## Dev Notes

### Architectuurcompliance

- **AD-4/NFR6 (Calendar reads zijn pull-only, geen caching):** de conflict-check draait bij elke Home-load opnieuw, geen achtergrondjob, geen opgeslagen "laatst bekende conflicten"-staat (behalve de expliciete dismissal, wat een gebruikersbeslissing is, geen cache).
- **AD-6 (Notification-shape voor gebruikersgerichte berichten):** niet van toepassing hier — `conflict-modal` is geen `Notification`-gebaseerd component (dat patroon is voor de escalatie-aanbevelingen uit Story 6.1/6.2), dit is een simpele, direct-uit-de-API-data gerenderde modal, zelfde niveau als 8.2's eigen `ConflictPrefillResponse`/`ConflictResolveResponse`.
- **Server-side validatie/autorisatie:** zowel `GET .../conflicts` als `POST .../conflicts/dismiss` volgen het bestaande envelope-/`requireUserSession`-patroon van alle andere `server/api/availability/*`-routes (zie `prefill-conflict.post.ts`/`resolve-conflict.post.ts` uit Story 6.6 als direct sjabloon).

### Bestaande code die déze story raakt (lezen vóór implementatie)

- **`server/domain/calendar-sync/day-events.ts`** — `DayEvent`/`getTodayEvents`, ongewijzigd gedrag behalve het nieuwe optionele `colorId`-veld (zie Belangrijk punt 1). Gelezen: bevestigd dat Google's respons-mapping nu alleen `id`/`summary`/`start`/`end` uitleest, `colorId` ontbreekt volledig.
- **`server/domain/calendar-sync/homework-events.ts`** — bevestigt het `colorId: String(colorId)`-schrijfpatroon (regel 33), de bron voor Belangrijk punt 2's string-vergelijking.
- **`server/domain/calendar-sync/actual-availability.ts`** (Story 6.6, net gereviewd) — `mergedOverlapMinutes`/`overlapInterval`/`isTimedEvent`/`toInstant`: dezelfde overlap-wiskunde die déze story voor conflict-*detectie* nodig heeft (i.p.v. Story 6.6's *aftrek van beschikbare tijd*). Hergebruik deze functies rechtstreeks (exporteer ze als het nog niet publiek is) i.p.v. een tweede implementatie van dezelfde overlap-berekening te schrijven — exact het soort duplicatie dat dit project bewust vermijdt (zie `session-time-check.ts`'s precedent, dat zelf ook al eerder bewust gedupliceerd werd toen er nog geen derde consument was; nu ís er met déze story een derde consument, dus dit keer wél delen).
- **`server/api/week.get.ts`** (Story 6.5) — bron van het `WEEK_DAYS = 7`-precedent (Belangrijk punt 4) en het `Promise.all`-per-dag-patroon (review-patch van diezelfde story) — gebruik ditzelfde patroon voor de 7 parallelle dag-checks i.p.v. een sequentiële lus.
- **`server/data/users.ts`** — `getUserById`, retourneert `homeworkCalendarColorId: number | null`.
- **`app/pages/index.vue`** — bestaande `plan`-fetch met `server: false` or SSR-race-preventie; de nieuwe conflicten-fetch volgt hetzelfde patroon, als een aparte `useFetch`-aanroep naast de bestaande.
- **`app/pages/agendaconflict/aanpassen.vue`** (Story 6.6, zojuist gereviewd/done) — bestaande route/query-contract (`?dag=YYYY-MM-DD`), ongewijzigd te hergebruiken vanuit `conflict-adjust-button`.

### Previous Story Intelligence (Story 6.6)

- **Idempotentie-les:** Story 6.6's code review vond een idempotentiebug in de prefill-berekening (herhaalde aanroepen trokken agenda-overlap cumulatief af). Relevant hier: de conflict-*detectie* zelf schrijft niets weg (behalve expliciete dismissals), dus ditzelfde risico bestaat niet — maar wees alert bij het hergebruiken van `actual-availability.ts`'s functies dat je alleen de pure berekenfuncties (`mergedOverlapMinutes` e.d.) hergebruikt, niet `calculateActualAvailableMinutes` als geheel (die leest de opgeslagen exceptie als baseline, wat voor detectie een andere vraag is dan voor 8.2's prefill).
- **Calendar-fetch-failure-precedent, net herzien:** Story 6.6's review besloot expliciet dat *daar* (waar Calendar-conflict-detectie het hele doel van het scherm is) een mislukte Calendar-call zichtbaar moet falen. Déze story is het tegenovergestelde geval — een achtergrond-signaleringscheck bij elke Home-load — dus hier geldt weer het oorspronkelijke `shortfall.ts`-precedent: fail-safe, geen conflicten voor die dag, geen foutmelding op Home. Niet zomaar hetzelfde patroon kopiëren als 6.6 zonder deze context.
- **Testdata-aanpak:** Story 6.6 verifieerde zonder een echte Google Calendar-afspraak aan te maken (bewuste keuze, zie die story's Completion Notes) door i.p.v. daarvan de beschikbare tijd via de exceptie-knoppen te verlagen tot een taak niet meer past. Voor déze story is een vergelijkbare aanpak niet direct mogelijk — de conflict-detectie vergelijkt expliciet tégen échte Calendar-events, niet tegen de exceptie zelf. Overweeg bij Task 6 een a11y-/functionaliteitstest die de domain-functie (`detectAgendaConflicts`) met een tijdelijk aangepaste beschikbare tijd combineert zodat een sessie zelf al buiten de (verlaagde) beschikbare tijd valt zonder een agenda-event nodig te hebben — controleer of dat voor déze detectielogica een valide test-substituut is, of dat een korte, direct-nadien-verwijderde testafspraak in de Calendar (met expliciete toestemming vooraf) toch nodig is om de kleur-uitsluiting en de echte overlap-tak te dekken.

### References

- Epics: `_bmad-output/planning-artifacts/epics.md`, Story 6.7 (regel 750-775)
- UX-spec: `design-artifacts/C-UX-Scenarios/08-evelien-lost-een-agendaconflict-op/8.1-conflictmelding/8.1-conflictmelding.md`
- UX-scenario: `design-artifacts/C-UX-Scenarios/08-evelien-lost-een-agendaconflict-op/08-evelien-lost-een-agendaconflict-op.md`
- Vorige story: `_bmad-output/implementation-artifacts/6-6-beschikbare-tijd-aanpassen-na-conflict-samenvatting.md` (done, incl. Review Findings-sectie)

## Open Questions

- ~~**Task 6's testaanpak**~~ — Opgelost: Hillebrand koos voor een echte (tijdelijke) Calendar-testafspraak, direct na verificatie verwijderd. Zie Task 6/Completion Notes.
- **Volgorde bij meerdere conflicten:** de AC/UX-spec zeggen niets over de volgorde waarin conflicten na elkaar getoond worden (chronologisch op datum? op event-starttijd?). Voorstel geïmplementeerd: chronologisch (vroegste dag eerst, `Array.from({length: WEEK_DAYS})`-volgorde) — meest voorspelbaar voor Evelien, zelfde impliciete volgorde als Story 6.5's weekoverzicht (dag 0..6). Niet apart met meerdere gelijktijdige conflicten getest (Task 6 gebruikte één testafspraak per keer); de volgorde volgt direct en aantoonbaar uit de code (`Promise.all` resultaat-array behoudt input-volgorde, `flat()` verandert die niet), dus verder live testen voegde weinig zekerheid toe.

## Review Findings

Code review uitgevoerd door 3 parallelle adversariële agents (Blind Hunter, Edge Case Hunter, Acceptance Auditor — de laatste moest na een verbindingsfout opnieuw draaien). Getrieerd, besproken met Hillebrand, en gepatcht:

1. **Blokkerende top-level `await` op de conflicten-fetch, tegen de eigen code-comment in.** `app/pages/index.vue` gebruikte `await useFetch(...)` voor de conflicten-check, terwijl de comment erboven expliciet claimt "dit is een achtergrond-signalering, geen kritiek pad" — een top-level `await` in `<script setup>` maakt de component juist async en blokkeert Home's eerste render tot de call klaar is, precies het tegenovergestelde. Onafhankelijk gevonden door zowel Blind Hunter als de Acceptance Auditor. **Fix:** `await` verwijderd, zelfde niet-blokkerende patroon als de bestaande `plan`-fetch.
2. **Mislukte dismiss-poging werd stil geslikt.** Bij een niet-401-fout op `POST .../dismiss` (netwerk/500) werd de fout genegeerd en toch de conflictenlijst herladen — het conflict kwam terug zonder enige uitleg waarom de klik niets deed. Door alle 3 agents in verschillende bewoordingen gevonden. **Fix:** nieuwe `dismissError`-state, doorgegeven aan `ConflictModal` als `error`-prop, toont "Kon dit niet opslaan. Probeer het opnieuw." in de modal zelf.
3. **`googleEventId` werd niet op type/inhoud gevalideerd.** `dismiss.post.ts` accepteerde elke truthy waarde (getal, object); een lege string (de fallback voor Calendar-events zonder `id`) werd afgekeurd zonder duidelijke reden. **Fix:** expliciete `typeof === 'string' && length > 0`-check.
4. **Eén mislukte dag liet de hele 7-dagen-check 500'en.** `getTasksWithSessionOnDate`/`getDismissedConflictIds` waren niet per dag afgeschermd (in tegenstelling tot de Calendar-call, die dat al wél was) — een DB-hikje op één dag verborg conflicten op alle andere dagen achter een generieke foutmelding. **Fix:** de hele dag-check in een try/catch, zelfde fail-safe-redenering als de Calendar-call.

Drie bevindingen expliciet verworpen na verificatie (geen echte issues): Escape die niets doet zonder visuele aanwijzing (dit ís de AC-eis, correct geïmplementeerd), onzekerheid over de `?dag=`-navigatie naar 8.2 (geverifieerd correct in de echte code), en niet-chronologische volgorde binnen één dag (Google's `orderBy: 'startTime'` staat al in de query).

Zes kleinere bevindingen (7 losse Calendar-calls i.p.v. één ranged query, geen server-side check op een gedismiste combinatie, gedupliceerde sessie-eindtijd-berekening, conflicten op al-verstreken tijdstippen vandaag, onbereikbaar `plannedMinutes === 0`-randgeval, geen tests) zijn met onderbouwing doorgeschoven naar `deferred-work.md`.

Alle patches opnieuw `typecheck`'d (exit 0) en gedeployed. Live geverifieerd: Home laadt nog steeds direct (geen regressie door de niet-blokkerende fetch), de `googleEventId`-validatie wijst lege strings en niet-strings correct af (400) en accepteert geldige strings (200). De per-dag-foutafscherming is niet apart geforceerd (zou een echte DB-fout vereisen); vertrouwd op typecheck + code-inspectie, consistent met hoe vergelijkbare fail-safe-patches eerder in dit project zijn behandeld. Testdata opgeruimd.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-17 | Story aangemaakt via create-story, voortbouwend op Story 6.6 (done). Sluit Epic 6 als laatste story af — de "entree via modal" die 6.6 al voorzag. Vier scope-punten vastgelegd: `DayEvent.colorId` toevoegen (Story 6.6's expliciet aangekondigde openstaande punt), string-vergelijking voor kleur-uitsluiting, nieuwe `dismissed_conflicts`-tabel/migratie, en een 7-dagen-detectievenster (Story 6.5-precedent). Eén open vraag over de testaanpak voor Task 6, niet blokkerend voor start. Status meteen `ready-for-dev`. |
| 2026-08-17 | Implementatie afgerond (Tasks 1-6): `DayEvent.colorId` toegevoegd, nieuwe `dismissed_conflicts`-tabel + migratie (`0014_tired_jocasta.sql`), `server/data/dismissed-conflicts.ts`, `server/domain/calendar-sync/conflict-detection.ts` (`detectAgendaConflicts`, hergebruikt `actual-availability.ts`'s overlap-primitieven, nu geëxporteerd), `GET /api/availability/conflicts` + `POST /api/availability/conflicts/dismiss`, `shared/types/conflict.d.ts` uitgebreid, nieuw `app/components/ConflictModal.vue` (met eigen focus-trap, geen Escape-sluiting) geïntegreerd op `app/pages/index.vue`. `typecheck` schoon, gedeployed. Open Question over de testaanpak opgelost: Hillebrand koos voor een echte, tijdelijke Calendar-testafspraak i.p.v. alleen domain-niveau-tests. Live geverifieerd op de dev-stage: conflict-detectie, kleur-uitsluiting (homework-gekleurd event correct genegeerd), dismiss-flow (idempotent, DB-rij bevestigd, conflict verdwijnt daarna), adjust-flow (navigeert correct naar 8.2 met de juiste datum), en de baseline (geen valse conflicten bij een lege agenda). Alle testdata (taak/sessie, 3 Calendar-testafspraken, dismissed-conflicts-rijen) volledig opgeruimd. Status → `review`. |
| 2026-08-17 | Code review (3 parallelle agents, Acceptance Auditor eenmaal opnieuw gestart na verbindingsfout) afgerond en 4 patches toegepast: niet-blokkerende conflicten-fetch (kernfix), zichtbare foutmelding bij mislukte dismiss, `googleEventId`-validatie, per-dag-foutafscherming in de 7-dagen-check. 6 kleinere bevindingen doorgeschoven naar `deferred-work.md`. Opnieuw gedeployed en live geverifieerd (geen render-regressie, validatie bevestigd via directe API-calls). Epic 6 is hiermee volledig `done`. Status → `done`. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `/tmp/typecheck-67-1.log` t/m `/tmp/typecheck-67-5.log` — `npx nuxt typecheck` na elke task, alle exit 0
- `/tmp/deploy-67.log` — `npx sst deploy --stage dev`, `EXIT_CODE=0`

### Completion Notes List

- Alle vier AC's live geverifieerd op de dev-stage met een echte testtaak/-sessie én een echte, tijdelijke Calendar-testafspraak (met expliciete toestemming van Hillebrand, zie de opgeloste Open Question): het conflict verscheen correct in zowel de API-respons als de `conflict-modal` op Home, de huiswerk-kleur-uitsluiting werkte (een gelijktijdig aangemaakte testafspraak met kleur 3 — Hillebrand's ingestelde huiswerkkleur — werd correct genegeerd), `conflict-not-applicable-button` liet een blijvende `dismissed_conflicts`-rij achter waarna het conflict niet meer terugkwam, en `conflict-adjust-button` navigeerde naar de juiste Story 6.6-route met de juiste datum.
- **Focus-trap/geen-Escape-sluiting** geïmplementeerd als handmatige `keydown`-listener op `ConflictModal.vue` (Tab/Shift+Tab cyclisch binnen de modal, Escape `preventDefault()`) — bewust niet het bestaande `active-leave-confirm-modal`-patroon gekopieerd, dat mist deze semantiek al meerdere stories lang (zie `deferred-work.md`). Focus wordt bij mount naar de modal verplaatst en bij unmount teruggegeven aan het element dat vóór de modal focus had.
- **Hergebruik i.p.v. herimplementatie:** `overlapInterval`/`isTimedEvent`/`toInstant` uit Story 6.6's `actual-availability.ts` zijn geëxporteerd en rechtstreeks hergebruikt in `conflict-detection.ts`, zoals de story's Dev Notes voorschreven — geen tweede implementatie van dezelfde overlap-wiskunde.
- Testdata (1 taak, 1 sessie, 3 opeenvolgende tijdelijke Calendar-testafspraken, alle `dismissed_conflicts`-testrijen) na verificatie volledig verwijderd; Calendar en DB geverifieerd leeg op de gebruiker se eigen pre-existente afspraken na.
- **Code review (post-implementatie):** de blokkerende-`await`-bug is een goed voorbeeld van hoe een correcte code-comment een echte bug kan maskeren tijdens zelf-verificatie — de comment beschreef het gewenste gedrag ("achtergrond, geen kritiek pad"), maar de regel eronder deed het tegenovergestelde. Twee onafhankelijke reviewers vonden dit apart, wat het vertrouwen in de fix vergroot.
- Epic 6 ("Studiedruk Signaleren & Oplossen") is met deze story volledig afgerond — alle 7 stories `done`.

### File List

- `server/domain/calendar-sync/day-events.ts` (gewijzigd — `DayEvent.colorId` toegevoegd)
- `server/data/schema.ts` (gewijzigd — nieuwe `dismissedConflicts`-tabel)
- `server/data/migrations/0014_tired_jocasta.sql` (nieuw)
- `server/data/dismissed-conflicts.ts` (nieuw — `getDismissedConflictIds`/`dismissConflict`)
- `server/domain/calendar-sync/actual-availability.ts` (gewijzigd — `isTimedEvent`/`toInstant`/`overlapInterval`/`SessionWindow` geëxporteerd)
- `server/domain/calendar-sync/conflict-detection.ts` (nieuw — `detectAgendaConflicts`)
- `shared/types/conflict.d.ts` (gewijzigd — `AgendaConflictDto`/`AgendaConflictsResponse`/`DismissConflictResponse` toegevoegd)
- `server/api/availability/conflicts.get.ts` (nieuw)
- `server/api/availability/conflicts/dismiss.post.ts` (nieuw)
- `app/components/ConflictModal.vue` (nieuw)
- `app/pages/index.vue` (gewijzigd — conflicten-fetch + `ConflictModal`-integratie)
