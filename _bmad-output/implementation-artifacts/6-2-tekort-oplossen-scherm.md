---
baseline_commit: fe5c556
---

# Story 6.2: Tekort-Oplossen-Scherm

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want een tekort oplossen door concrete, oplopend zware aanbevelingen te accepteren of af te wijzen,
so that ik zelf kan sturen hoe het tekort wordt opgelost, zonder dat het als een verwijt voelt.

## Acceptance Criteria

1. **Given** Evelien komt op 3.2-tekort-oplossen, **when** de pagina laadt, **then** toont `shortfall-remaining` het exacte tekort en `shortfall-recommendations` maximaal 3 aanbeveling-kaarten tegelijk, beginnend bij het laagste niveau (Uitstellen) (FR17), en worden aanbevelingen uit een zwaarder niveau pas toegevoegd zodra het huidige niveau het tekort niet meer kan dekken.
2. **Given** Evelien klikt op `shortfall-recommendation-accept-button` bij een kaart, **when** de server de wijziging doorvoert, **then** wordt de tijdwinst afgetrokken van `shortfall-remaining`, verdwijnt de kaart, en vult een volgende aanbeveling de vrijgekomen plek — is het tekort 0, dan verschijnt "Tekort opgelost!" en navigeert de pagina automatisch naar 1.1-Home.
3. **Given** Evelien klikt op `shortfall-recommendation-reject-button`, **when** de actie verwerkt wordt, **then** verdwijnt de kaart zonder effect op het tekort, en komt ze terug als laatste redmiddel zodra alle overige opties (incl. hogere niveaus) op zijn.
4. **Given** het tekort is nog niet opgelost, **when** Evelien de pagina probeert te verlaten, **then** is er geen ontsnappingsroute — dit scherm moet volledig opgelost worden.

## Belangrijk: lees dit vóór je begint — twee blokkerende scope-vragen, en de escalatie-service is er al

**1. Story 6.1 (done) bouwde de volledige escalatie-service — hergebruik 'm, herbouw 'm niet.** `server/domain/scheduling/shortfall.ts` exporteert alles wat déze story nodig heeft: `detectShortfallForDate`/`detectAnyShortfall`, `generateShortfallRecommendations` (de 4-niveau-keten, al escalerend, al "laagste prioriteit eerst"), `buildShortfallNotification`, en `calculateStudiedrukScore`. Lees dit bestand volledig — met name de code-review-geschiedenis in de comments (twee kritieke bugs gevonden en gepatcht: niveau 2 mocht niet meer het hele tekort in één keer dekken, niveau 3/4 mogen dezelfde taak allebei als kandidaat hebben). Een `ShortfallRecommendation` heeft al een stabiel, niet-persisterend `id` (bijv. `herplannen:{taskId}`, `verruimen:{date}`, `inkorten:{taskId}`, `vervallen:{taskId}`) — precies wat de UX-spec's accept/reject-routes nodig hebben.

**2. Blokkerend — welke route levert de éérste set aanbevelingen (Data Sources: "Meegegeven via de response van 3.1's `/api/day/shortfall`")?** De UX-spec (`3.2-tekort-oplossen.md`) zegt letterlijk dat 3.2 zélf geen laad-state heeft — de data komt mee vanuit 3.1-reden-kiezen se `POST /api/day/shortfall`-aanroep (Story 6.3, nog `backlog`). Maar de epic se eigen Implementation Notes zeggen: "Stories binnen dit epic bouwen de service eerst op (tekort-oplossen, meest volledige uitwerking), daarna de hergebruikende schermen" — d.w.z. 6.2 hoort vóór 6.3 gebouwd te worden, wat betekent dat 6.2 niet op 6.3's route kan leunen om zelfstandig testbaar te zijn. Zie Open Question #1 — moet déze story `POST /api/day/shortfall` zelf bouwen (met Story 6.3 straks als tweede aanroeper van dezelfde route, in plaats van de oorspronkelijke bouwer), of moet 3.2 op een andere manier standalone te laden zijn (bijv. een eigen `GET`-route die zelf een datum kiest via `detectAnyShortfall`)?

**3. Blokkerend — hoe wordt een aanbeveling daadwerkelijk *toegepast* bij "Accepteren"?** Story 6.1's `generateShortfallRecommendations` genereert alleen (leest, muteert niets — zie shortfall.ts's eigen top-commentaar). Voor elk van de vier niveaus is een échte mutatie nodig, en voor drie van de vier bestaat nog geen kant-en-klare domain-functie die precies dit doet:
   - **Niveau 1 "herplannen":** de sessie moet naar een specifieke, al-bekende datum verplaatst worden (die datum zat al in de aanbeveling se `description`, via `findAlternativeDate`). `recalculateTaskPlanning` (Story 3.5) is hier **niet** geschikt — die herberekent een nieuw doelmoment vanaf de huidige taakstaat en zou de sessie niet per se op déze specifieke, al-gekozen dag plaatsen. Een nieuwe, kleinere domain-functie is nodig die een sessie direct naar een gegeven datum verplaatst (hergebruikt `updateSessionPlacement`, Story 3.5, en de Calendar-sync-aanroep uit `recalculateTaskPlanning`/`createTask` als sjabloon).
   - **Niveau 2 "tijd verruimen":** de beschikbare-tijd-exceptie voor die dag moet verhoogd worden (`updateExceptionForDate`, Story 2.2, bestaat al en is direct bruikbaar).
   - **Niveau 3 "inkorten":** de sessie se `plannedMinutes` moet verkort worden met de aanbevolen tijdwinst — geen bestaande functie hiervoor; waarschijnlijk een kleine uitbreiding op `updateSessionPlacement`-niveau, of een nieuwe `shortenSession`-achtige domain-functie.
   - **Niveau 4 "laten vervallen":** de taak moet als "niet gedaan" worden afgesloten — **dit is geen "klaar" in de betekenis van Story 4.7's `logSessionAndCompleteTask`** (die staat voor "succesvol afgerond", met een `sessionLogs`-rij die `actualMinutes` vastlegt voor een toekomstige adaptieve-tijdschatting-functie). "Niet doen" is semantisch iets anders (nooit uitgevoerd, geen bestede tijd om te loggen) — zie Open Question #2: moet dit hetzelfde `tasks.completedAt`-veld hergebruiken (met een `actualMinutes: 0`-log, of zónder log), of is een nieuw veld/status nodig om "afgerond" van "laten vervallen" te kunnen onderscheiden (relevant voor een toekomstige adaptieve-tijdschatting die "vervallen" taken niet als betrouwbare tijdsdata mag meetellen)?

**4. Server is gezaghebbend bij "Accepteren"/"Afwijzen" — nooit de client se `gainMinutes`/`description` vertrouwen.** De route ontvangt alleen het aanbeveling-`id`; de server roept zélf opnieuw `generateShortfallRecommendations` aan, zoekt de aanbeveling met dat `id` erin op (her-afgeleid uit de actuele DB-staat, niet uit een cache), en past die toe. Bestaat het `id` niet meer in de vers-herberekende lijst (bv. de taak is inmiddels al door iets anders gewijzigd), dan is dat een terecht-mislukte actie (Fout-state op de kaart, UX-spec), geen crash.

**5. Afwijzen-geheugen (UX-spec: "komt terug als laatste redmiddel zodra alle overige opties op zijn") is puur cliëntgedreven state, geen serveropslag.** Zelfde categorie beslissing als Story 5.3's "Heropenen" (client-side formulier-state, geen aparte tabel) — de pagina houdt een lijst afgewezen `id`'s bij en sluit die uit bij het aanvullen van de zichtbare 3 kaarten, totdat alle overige (incl. zwaardere niveaus) op zijn, dan komen ze alsnog terug. Geen nieuwe DB-tabel nodig (AD-3: geen opgeslagen "Recommendation"-staat).

## Tasks / Subtasks

- [x] Task 1: `POST /api/day/shortfall` — eerste tekort + aanbevelingen (AC #1)
  - [x] Hergebruikt `detectShortfallForDate`/`detectAnyShortfall` + `generateShortfallRecommendations` (Story 6.1, ongewijzigd). Story 6.2 bouwt deze route zelf (Open Question #1's uitkomst); Story 6.3 wordt later de tweede aanroeper.
  - [x] Retourneert `shortfallMinutes` + de volledige, geëscaleerde aanbevelingen-lijst (client kiest daaruit de eerste 3 die nog niet afgewezen zijn, Open Question #3's voorstel).
- [x] Task 2: Schema-migratie + domain-functies voor "Accepteren" per niveau (AC #2, "Belangrijk" punt 3)
  - [x] Nieuwe migratie: `tasks.droppedAt` (nullable text, zelfde vorm als `completedAt`) — zie Dev Notes "Vervallen-model". Bestaande `isNull(tasks.completedAt)`-filters (`getTasksWithSessionOnDate`, `getOpenTasksWithProgress`, `sumPlannedMinutesForUserOnDate`) uitgebreid naar `isNull(tasks.completedAt) AND isNull(tasks.droppedAt)`.
  - [x] Niveau 1: `applyHerplannen` in nieuw `server/domain/scheduling/apply-recommendation.ts` — verplaatst de sessie naar `recommendation.targetDate` (intern veld op `ShortfallRecommendation`, Story 6.1's shape uitgebreid) + Calendar-sync.
  - [x] Niveau 2: `applyVerruimen` hergebruikt `updateExceptionForDate` (Story 2.2, ongewijzigd) — tweemaal aangeroepen (`DELTA_MINUTES` 15 × 2 = `VERRUIMEN_STEP_MINUTES` 30).
  - [x] Niveau 3: `applyInkorten` verkort `session.plannedMinutes` + Calendar-sync.
  - [x] Niveau 4: `applyVervallen` zet `tasks.droppedAt` (nieuwe `dropTask`-data-functie, géén `sessionLogs`-rij) en verwijdert het Calendar-event.
  - [x] Elke mutatie via `server/domain/`, nooit rechtstreeks vanuit de route (Consistency Conventions, herhaaldelijk bevestigd sinds Story 5.2/5.3).
- [x] Task 3: `POST /api/day/shortfall/recommendations/{id}/accept` + `.../reject` (AC #2, #3)
  - [x] `accept`: server herberekent `generateShortfallRecommendations`, vindt de aanbeveling bij `id`, past de bijbehorende niveau-mutatie (Task 2) toe, retourneert het nieuwe tekort + de volledige, verse aanbevelingen-lijst.
  - [x] `reject`: geen mutatie, retourneert de volledige, actuele aanbevelingen-lijst; "afgewezen"-status is client-side bijgehouden (zie "Belangrijk" punt 5).
  - [x] Server is gezaghebbend (zie "Belangrijk" punt 4) — nooit client-aangeleverde `gainMinutes`/`description` gebruikt, `id` wordt server-side opnieuw opgezocht in een verse berekening.
- [x] Task 4: 3.2-tekort-oplossen-scherm (AC #1, #2, #3, #4)
  - [x] Nieuwe pagina `app/pages/herstel/tekort-oplossen.vue` (route `/herstel/tekort-oplossen`, UX-spec).
  - [x] `shortfall-heading`, `shortfall-reassurance-text`, `shortfall-remaining` (live update, `aria-live="polite"`), `shortfall-recommendations` (max 3 kaarten, escalerend gevuld, afgewezen kaarten als laatste redmiddel terug — zie "Belangrijk" punt 5).
  - [x] Aanbeveling-kaart: niveau-aanduiding, omschrijving, tijdwinst (`+{tijd}`), Afwijzen/Accepteren-knoppen met Bezig-/Fout-states per kaart (UX-spec, geen paginabrede laad/fout-state).
  - [x] Tekort 0 → "Tekort opgelost!" → automatische navigatie naar 1.1-Home (AC #2).
  - [x] Geen ontsnappingsroute zolang tekort > 0 (AC #4) — `onBeforeRouteLeave`-guard (Story 4.5's precedent), zonder bevestigingsdialoog: er is domweg geen weg terug totdat het tekort 0 is.
- [x] Task 5: Verificatie
  - [x] `npm run typecheck`/`npx nuxt build` slagen.
  - [x] Live: tekort + eerste aanbevelingen laden correct, geëscaleerd volgens niveau (getest met 3 en met 5 taken, telkens exacte cijfers geverifieerd tegen handmatige berekening).
  - [x] Live: accepteren van elke niveau-soort past de onderliggende data daadwerkelijk aan — niveau 1 (sessie verplaatst naar nieuwe datum, DB bevestigd), niveau 2 (beschikbare-tijd-exceptie +30 min, DB bevestigd), niveau 3 (`session.plannedMinutes` verkort, DB bevestigd), niveau 4 (`tasks.droppedAt` gezet, DB bevestigd).
  - [x] Live: afwijzen heeft geen effect op het tekort, komt terug als laatste redmiddel (kaart verschoof naar de laatste positie, tekort ongewijzigd).
  - [x] Live: tekort naar 0 → "Tekort opgelost!" → automatische navigatie naar Home.
  - [x] Live: wegnavigeren (in-app, via `history.pushState`+`popstate`) zonder opgelost tekort wordt geblokkeerd — URL bleef op `/herstel/tekort-oplossen`.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testdata (2 scenario's, incl. beschikbaarheids-excepties) na verificatie opgeruimd, 0 resterende rijen bevestigd.

## Dev Notes

### Architectuurcompliance

- **AD-1/AD-3**: alle mutaties gaan via `server/domain/`, geen opgeslagen "Recommendation"-staat.
- **AD-6**: gebruikersgerichte berichten via de `Notification`-shape (al aanwezig, Story 6.1).
- **AD-7**: elke sessie-herplaatsing (niveau 1/3) die de sessie se tijdstip/duur wijzigt, moet de Calendar-sync synchroon binnen hetzelfde request bijwerken (zelfde precedent als `recalculateTaskPlanning`).
- **Consistency Conventions**: mutatie-ownership in `server/domain/`, nooit rechtstreeks in de route.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- `server/domain/scheduling/shortfall.ts` (Story 6.1, done) — volledig lezen, inclusief de code-review-comments.
- `server/domain/scheduling/recalculate.ts` (Story 3.5) — sjabloon voor "sessie verplaatsen + Calendar-sync bijwerken", maar niet rechtstreeks bruikbaar (zie "Belangrijk" punt 3).
- `server/data/availability.ts`'s `updateExceptionForDate` (Story 2.2) — direct bruikbaar voor niveau 2.
- `server/domain/scheduling/replan.ts` (Story 4.7) — `logSessionAndCompleteTask`/`logSessionAndUpdateRemaining` als precedent, maar "vervallen" is semantisch iets anders dan "succesvol afgerond" (zie Open Question #2).
- `server/domain/notification.ts` (Story 6.1) — `Notification`/`NotificationAction`/`RecommendationTier`.

### Previous Story Intelligence (Story 6.1)

- De escalatie-service is een pure, ongewired leesfunctie — déze story is de eerste échte consument (precies zoals Story 6.1's eigen Dev Notes aankondigden).
- Story 6.1's code review vond bugs die pas bij een groter, opzettelijk-forcerend testscenario aan het licht kwamen (een klein scenario dat toevallig al bij niveau 2 volstond, verborg de niveau-3/4-bugs) — pas dezelfde discipline toe bij déze story's verificatie: test niet alleen het gelukkige pad (één aanbeveling accepteren, tekort meteen 0), maar ook een scenario dat meerdere niveaus/meerdere accept-cycli nodig heeft.
- Story 5.3's terugkerende les (los teststappen dekt niet hetzelfde als een doorlopende flow) geldt hier evenzeer: verifieer "laad scherm → accepteer → volgende kaart verschijnt → accepteer opnieuw → tekort 0 → navigatie" als één ononderbroken keten, niet als losse stappen.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 650-673 (Story 6.2's AC's, letterlijk overgenomen hierboven)
- [Source: design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.2-tekort-oplossen/3.2-tekort-oplossen.md] — volledige scherm-specificatie, Object IDs, API-contract
- [Source: server/domain/scheduling/shortfall.ts] — Story 6.1, de escalatie-service die déze story consumeert
- [Source: server/domain/scheduling/recalculate.ts, replan.ts] — sjablonen voor sessie-herplaatsing/Calendar-sync/afronding-varianten

## Open Questions

1. 🟢 **Resolved (Hillebrand, 2026-08-17):** Story 6.2 bouwt `POST /api/day/shortfall` zelf — Story 6.3 wordt later de tweede aanroeper van dezelfde route.
2. 🟢 **Resolved (Hillebrand, 2026-08-17):** apart onderscheid tussen "afgerond" en "vervallen" — nieuw veld/status i.p.v. `tasks.completedAt` hergebruiken (zie Dev Notes → "Vervallen-model" hieronder voor het voorgestelde schema).
3. 🟡 **Niet-blokkerend, voorstel:** Het "verdelen" van de eerste max-3-aanbevelingen (welke van `generateShortfallRecommendations`'s volledige, langere lijst meteen getoond worden) — voorstel: de server retourneert bij elke aanroep (initieel + na elke accept/reject) opnieuw de *volledige* geëscaleerde lijst, en de client kiest daaruit de eerste 3 die nog niet afgewezen zijn (client-side afwijs-geheugen, "Belangrijk" punt 5) — simpeler dan de server een afwijs-lijst te laten bijhouden.

### Vervallen-model (Open Question #2's uitkomst)

Nieuwe, nullable kolom `tasks.droppedAt` (`text`, ISO-timestamp, zelfde vorm als `completedAt`) — analoog aan hoe `completedAt` zelf werd geïntroduceerd (Story 4.7): `null` = niet vervallen, gezet = definitief laten vervallen op dat moment. Semantisch strikt gescheiden van `completedAt`:
- **`completedAt` gezet** = succesvol afgerond (Story 4.7's bestaande betekenis, ongewijzigd) — telt mee voor een toekomstige adaptieve-tijdschatting (gepland-vs-besteed is betrouwbare data).
- **`droppedAt` gezet** = bewust laten vervallen via de escalatieketen (déze story) — telt **niet** mee als betrouwbare tijdsdata (geen `sessionLogs`-rij nodig/gewenst, er is geen "bestede tijd" om te loggen), maar taak/sessie/deeltaken blijven wél bestaan als historisch record (zelfde "geen verwijdering, alleen een filter-veld"-precedent als `completedAt`).
- Beide velden zijn wederzijds exclusief in de praktijk (een taak wordt óf afgerond óf laten vervallen, nooit beide) — geen check-constraint nodig op DB-niveau (SQLite/Drizzle-schema in dit project legt zulke invarianten niet af in het schema zelf, zie bestaande precedenten), wel een aanname die de domain-laag bewaakt.
- Filters die nu `isNull(tasks.completedAt)` gebruiken (`getTasksWithSessionOnDate`, `getOpenTasksWithProgress`, Story 6.1's `sumPlannedMinutesForUserOnDate`) moeten uitgebreid worden naar `isNull(tasks.completedAt) AND isNull(tasks.droppedAt)` — een vervallen taak is net zo "niet meer open" als een afgeronde taak, voor élke plek die nu al op `completedAt` filtert. Nieuwe migratie nodig (`drizzle-kit generate` + `migrate`, niet `push`, zelfde precedent als elke eerdere schema-wijziging in dit project).

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-17 | Story aangemaakt via create-story, voortbouwend op Story 6.1 (done, de escalatie-service). Twee blokkerende Open Questions vastgelegd: (1) welke route de eerste tekort+aanbevelingen levert, gegeven de spanning tussen de UX-spec (data komt van Story 6.3's route) en de epic se eigen volgorde-eis (6.2 vóór 6.3 gebouwd); (2) hoe "laten vervallen" zich onderscheidt van "succesvol afgerond" in het datamodel. Eén niet-blokkerend voorstel gedaan voor de aanbevelingen-verdeling. |
| 2026-08-17 | Beide Open Questions besproken en opgelost met Hillebrand: (1) Story 6.2 bouwt `POST /api/day/shortfall` zelf, Story 6.3 wordt later de tweede aanroeper; (2) nieuw `tasks.droppedAt`-veld i.p.v. `completedAt` hergebruiken — schema-voorstel toegevoegd aan Dev Notes, incl. de bestaande `isNull(tasks.completedAt)`-filters die uitgebreid moeten worden. Story is nu `ready-for-dev`, geen blokkerende punten meer. |
| 2026-08-17 | Implementatie afgerond (Tasks 1-5): migratie `tasks.droppedAt` toegepast; `POST /api/day/shortfall` (eerste tekort+aanbevelingen, hergebruikt Story 6.1's service ongewijzigd); vier nieuwe mutatiefuncties in `server/domain/scheduling/apply-recommendation.ts` (één per escalatieniveau — sessie verplaatsen/Calendar-sync, `updateExceptionForDate` hergebruikt, sessie verkorten/Calendar-sync, `dropTask`); `POST /api/day/shortfall/recommendations/{id}/accept|reject` (server herberekent en past server-zelf-gevonden aanbevelingen toe, nooit client-data); nieuwe pagina `app/pages/herstel/tekort-oplossen.vue` (max-3-kaarten, client-side afwijs-geheugen, `onBeforeRouteLeave`-blokkade). Live geverifieerd met twee scenario's op de dev-stage: (1) 3 taken, alle drie via niveau 1 opgelost, incl. het volledige "Tekort opgelost!"-navigatiepad naar Home; (2) 5 taken, bewust zo geconstrueerd dat niveau 2, 3 én 4 alle drie daadwerkelijk bereikt en geaccepteerd werden — elke DB-wijziging (sessiedatum, sessieduur, beschikbare-tijd-exceptie, `droppedAt`) exact bevestigd. Afwijzen en de wegnavigeer-blokkade (AC #3/#4) apart getest en correct bevonden. Alle testdata opgeruimd. Status → `review`. |
| 2026-08-17 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor — alle drie geslaagd). Twee kritieke, onafhankelijk gevonden AC #4-bugs in de wegnavigeer-blokkade: (1) `shortfallMinutes` begon op `0` totdat de eerste fetch klaar was, waardoor er tijdens het laden een echt ontsnappingsraam bestond (`0 <= 0` liet de guard 'm door); (2) de guard ving óók de eigen `navigateTo('/inloggen')`-redirect bij een 401 af, waardoor een verlopen sessie de gebruiker permanent op deze pagina vastzette. Beide gepatcht: de guard blokkeert nu standaard tijdens het laden, staat expliciet `/inloggen` als navigatiedoel toe, en laat door bij een laadfout (anders zou een onherstelbare fout de gebruiker alsnog voorgoed vastzetten). Eén kleinere, gerelateerde bug ook gepatcht: een 404 bij "Accepteren" (aanbeveling niet meer geldig) liet een verouderde kaart zonder herstelmogelijkheid staan — herlaadt nu de actuele lijst. Eén naamgevings-nitpick opgelost (`taskIdFromId` → `stripRecommendationIdPrefix`, droeg ook een datum voor niveau 2, niet alleen taak-id's). Alle drie de guard-scenario's (tijdens laden, na laden met open tekort, `/inloggen`-uitzondering) opnieuw live geverifieerd. Overige, niet-blokkerende bevindingen bewust gedefereerd (zie Completion Notes). Status → `done`. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Tijdelijk niet gecommit: geen debug-routes nodig deze keer — de nieuwe UI-pagina zelf diende als testinstrument (in tegenstelling tot Story 6.1, die géén UI had en dus wél een tijdelijke `_debug`-route nodig had).
- Om niveau 3/4 daadwerkelijk (i.p.v. alleen niveau 1/2) te forceren tijdens verificatie was een bewust geconstrueerd scenario nodig (5 taken met kleine sessies, beschikbare tijd tijdelijk naar 0 gezet) — een toevallig scenario met te veel beschikbare capaciteit had, net als bij Story 6.1's eigen review-les, de niveau 3/4-mutaties ongetest gelaten.

### Completion Notes List

- Alle 4 AC's live geverifieerd op flowz.fyi/dev-stage. AC #1 (laden + escalerend vullen), AC #2 (accepteren past data aan + "Tekort opgelost!"-navigatie), AC #3 (afwijzen zonder effect, laatste-redmiddel-gedrag), AC #4 (wegnavigeer-blokkade) stuk voor stuk bevestigd.
- Niveau 1 "herplannen" kiest telkens een nieuwe alternatieve dag op basis van de *actuele* DB-staat (niet een vooraf vastgelegde) — bevestigd doordat de tweede en derde taak in scenario 1 naar een latere dag verschoven zodra de eerder geaccepteerde taak de eerstvolgende beschikbare dag al had ingenomen.
- Server-gezaghebbendheid (AC-onafhankelijke architectuureis, "Belangrijk" punt 4) geverifieerd door constructie: de accept-route herberekent altijd vers en aanvaardt geen enkel client-veld anders dan het aanbeveling-`id` en de datum.
- `Open Question #1`'s uitkomst (Story 6.2 bouwt de route zelf) betekent dat Story 6.3 straks een tweede, ongewijzigde aanroeper van `POST /api/day/shortfall` wordt — geen wijziging aan déze route te verwachten, wel mogelijk een uitbreiding van `ShortfallRequestInput` met een handmatige beschikbare-tijd-override.
- Niet-blokkerende reviewbevindingen bewust gedefereerd (geen AC-schending, of pre-existent patroon elders in dit project): `applyVerruimen`'s twee losse `updateExceptionForDate`-aanroepen kunnen in theorie elk apart tegen `MAX_MINUTES_PER_DAY` aanlopen (zeer onwaarschijnlijk bij realistische beschikbare-tijd-waarden); `applyHerplannen`'s stapelings-uurberekening heeft geen bovengrens-check (identiek aan het bestaande patroon in `recalculate.ts`/`create-task.ts`, niet nieuw in déze story); geen idempotentie-bescherming tegen een dubbele gelijktijdige accept-aanroep (laag risico, single-user hobby-app, consistent met de meeste andere routes in dit project); `afwijzen` toont geen zichtbare foutstate bij een mislukte herberekening (UX-spec vraagt bewust geen Bezig-state hier, het is geen kritiek pad); dezelfde taak kan tegelijk een niveau 3- én niveau 4-kaart tonen (bewuste, in Story 6.1 al gedocumenteerde keuze — twee alternatieve aanbevelingen, geen dubbele mutatie, want de client accepteert er hooguit één van); `reject.post.ts` valideert het aanbeveling-`id` niet tegen de verse lijst (onschadelijk, reject muteert toch niets).

### File List

- `shared/types/shortfall.d.ts` (nieuw)
- `server/api/day/shortfall.post.ts` (nieuw)
- `server/api/day/shortfall/recommendations/[id]/accept.post.ts` (nieuw)
- `server/api/day/shortfall/recommendations/[id]/reject.post.ts` (nieuw)
- `server/domain/scheduling/apply-recommendation.ts` (nieuw; review-patch: `stripRecommendationIdPrefix` hernoemd)
- `server/domain/scheduling/shortfall.ts` (gewijzigd — `ShortfallRecommendation.targetDate` intern veld toegevoegd, alleen voor niveau 1)
- `server/data/schema.ts` (gewijzigd — `tasks.droppedAt`)
- `server/data/migrations/0013_brown_shockwave.sql` (nieuw, toegepast op dev)
- `server/data/tasks.ts` (gewijzigd — `dropTask` toegevoegd; `getTasksWithSessionOnDate`/`getOpenTasksWithProgress`/`sumPlannedMinutesForUserOnDate` filteren nu ook op `isNull(tasks.droppedAt)`)
- `app/pages/herstel/tekort-oplossen.vue` (nieuw; review-patch: `onBeforeRouteLeave`-guard gefixt (laad-fase-ontsnapping + geblokkeerde `/inloggen`-redirect), 404-hersteldpad bij accepteren toegevoegd)
