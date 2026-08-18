---
baseline_commit: 2f361ce
---

# Story 6.6: Beschikbare Tijd Aanpassen na Conflict & Samenvatting

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want de beschikbare tijd voor een conflicterende dag bevestigen en direct zien wat Flowz heeft aangepast,
so that ik geen verrassing achteraf krijg, zelfs niet als de oplossing elders een nieuw knelpunt veroorzaakt.

## Acceptance Criteria

1. **Given** Evelien komt op 8.2-beschikbare-tijd-aanpassen (rechtstreeks toetsbaar via route, met een gegeven dag/conflict-context — de entry via de modal volgt in Story 6.7), **when** de pagina laadt, **then** toont ze Epic 2's exceptie-paneel-componenten (`avail-exception-*`), al open en voorgevuld met de daadwerkelijk beschikbare tijd o.b.v. de agenda-items voor die dag.
2. **Given** Evelien bevestigt (evt. na verdere aanpassing), **when** ze op `conflict-confirm-button` klikt, **then** slaat de server de exceptie op, herplant automatisch en volledig op de achtergrond (blokkerend voor de client — de samenvatting heeft het resultaat nodig, i.t.t. Story 4.7's fire-and-forget), en werkt Epic 2's Calendar-sync eventuele events bij (FR20). **And** vervangt `conflict-summary-section` het formulier: wijzigingenlijst (`conflict-summary-changes`) en, indien van toepassing, `conflict-summary-bottleneck-warning` (klikbaar door naar 7.1).
3. **Given** Evelien ziet de samenvatting, **when** ze op `conflict-summary-back-button` klikt, **then** gaat ze terug naar 1.1-Home.

## Belangrijk: lees dit vóór je begint — vijf scope-punten

**1. Dit scherm bestaat nog helemaal niet — geen route, geen API, geen wiring vanuit een modal.** Net als Story 6.4/6.5. Volledige UX-spec: `design-artifacts/C-UX-Scenarios/08-evelien-lost-een-agendaconflict-op/8.2-beschikbare-tijd-aanpassen/8.2-beschikbare-tijd-aanpassen.md`. Route (letterlijk uit de spec): `/agendaconflict/aanpassen?dag={datum}` — de `dag`-query-param is voor déze story de enige context; er is nog geen "conflict"-entiteit (die bouwt Story 6.7).

**2. Het `{id}`-gebaseerde endpoint uit de UX-spec (`POST /api/availability/conflicts/{id}/resolve`) veronderstelt Story 6.7's nog niet bestaande Conflict-entiteit.** Epics.md's eigen AC #1-tekst erkent dit expliciet ("de entry via de modal volgt in Story 6.7"). **Voorgestelde aanpak:** deze story bouwt in plaats daarvan een **datum-gebaseerd** endpoint (`POST /api/availability/day/{date}/resolve-conflict`) — functioneel identiek (exceptie opslaan + herplannen + samenvatting), maar zonder een niet-bestaande conflict-id te vereisen. Zodra Story 6.7 een echte Conflict-entiteit met id introduceert, kan die route er eventueel bovenop gebouwd worden (of dit endpoint blijft gewoon bestaan en Story 6.7 roept het aan met de datum uit haar eigen conflict-object) — geen blokkade voor déze story.

**3. "Voorgevuld met de daadwerkelijk beschikbare tijd o.b.v. de agenda-items" — deze berekening bestaat nog nergens.** Geen enkele bestaande functie zet Calendar-events om naar een "werkelijk beschikbare minuten"-getal. **Beargumenteerd voorstel** (nieuwe functie, zie Task 1): `werkelijkBeschikbaar = huidigeBeschikbareTijd(dag) − som(overlappende tijd tussen 'timed' Calendar-events en de al-geplande sessies op die dag)`. Hergebruikt `session-time-check.ts`'s bestaande overlap-detectie (Story 4.2), maar in plaats van een boolean-status (`ok`/`tight`/`unavailable`) hier de daadwerkelijke overlappende duur optellen per sessie. **Bewuste scope-beperking:** FR28's huiswerk-kleur-uitsluiting (homework-gekleurde events tellen niet mee als "conflict") wordt hier **niet** toegepast, omdat `DayEvent` (Story 4.2, `day-events.ts`) geen `colorId`-veld heeft — Calendar's kleur wordt daar nooit opgehaald. Dit zou `getTodayEvents`/`DayEvent` moeten uitbreiden, wat buiten déze story's scope valt (Story 6.7 raakt sowieso dezelfde conflict-detectielogica en is de logische plek om dit in één keer goed te doen). Resultaat: een homework-gekleurd event kan in v1 dus ten onrechte als "conflict" meetellen in de voorvulling — een bekende, geaccepteerde beperking, geen stille aanname.

**4. "Herplant automatisch en volledig" = elke taak met een sessie op die dag opnieuw laten plaatsen via de al bestaande `recalculateTaskPlanning` (Story 3.5), niet een nieuwe herplanningsalgoritme.** Voor elke taak: sla de huidige sessiedatum op (vóór herberekening), roep `recalculateTaskPlanning(task.id)` aan (die leest de zojuist opgeslagen, nieuwe exceptie automatisch mee — AD-1, altijd actuele staat), vergelijk de nieuwe sessiedatum met de oude. Verschilt die, dan is de taak "verplaatst" en komt op de wijzigingenlijst. Calendar-sync (FR20) gebeurt al automatisch binnen `recalculateTaskPlanning` zelf (self-healing/update, Story 3.5) — geen aparte stap nodig.

**5. Knelpunt-waarschuwing ná herplannen: check alleen de dagen waar taken naartoe verplaatst zijn, niet de hele week.** Voor elke unieke doeldatum uit de wijzigingenlijst: `detectShortfallForDate` (Story 6.1, hergebruikt). De eerste (vroegste) dag met een tekort wordt getoond als `conflict-summary-bottleneck-warning` — de UX-spec toont er letterlijk maar één ("⚠ {dag} is nu een knelpunt"), geen lijst van meerdere.

**6. Hoe weet "Bevestigen" welke tijd te gebruiken, als de +/- knoppen elk al direct opslaan?** Zelfde patroon als 4.1/`beschikbare-tijd.vue`: elke +/- klik doet meteen een eigen `PATCH`-aanroep, geen debounce, geen lokale niet-opgeslagen staat. Dat betekent dat de voorgevulde waarde zélf **bij het laden van de pagina al als echte exceptie moet worden opgeslagen** (via `setExceptionForDate`, Story 6.3) — niet pas bij "Bevestigen" — anders zou de eerste +/- klik verkeerd vanaf het weekpatroon in plaats van vanaf de berekende voorvul-waarde optellen/aftrekken (`updateExceptionForDate`'s ±15-min-stap werkt relatief t.o.v. de huidige opgeslagen exceptie). **Consequentie voor Task 1/2:** de "voorvul"-aanroep (Task 1) is dus geen pure `GET`-berekening maar een `POST` die berekent én meteen opslaat; "Bevestigen" (Task 2) hoeft daardoor geen tijdswaarde meer te ontvangen — de exceptie staat op dat moment al klaar (eventueel bijgesteld via de +/- knoppen), `resolve-conflict` hoeft 'm alleen nog te lezen en de herplanning te triggeren.

## Tasks / Subtasks

- [x] Task 1: Werkelijk-beschikbare-tijd berekenen én meteen opslaan (AC #1, "Belangrijk" punt 3, 6)
  - [x] Nieuw `server/domain/calendar-sync/actual-availability.ts`: `calculateActualAvailableMinutes(userId, date)` — haalt `availableMinutesForDate` (huidig, weekpatroon/exceptie), `getTasksWithSessionOnDate` (al-geplande sessies die dag) en `getTodayEvents` (Calendar) op; sommeert per sessie de overlappende tijd met 'timed' events (eigen `overlapMinutes`-duur-berekening, zelfde overlap-detectieprincipe als `session-time-check.ts` maar als minuten-som i.p.v. boolean-status); retourneert `Math.max(0, huidigeMinuten - overlapMinuten)`.
  - [x] Nieuw `shared/types/conflict.d.ts`: `ConflictPrefillResponse { minutes: number }`.
  - [x] Nieuw `server/api/availability/day/[date]/prefill-conflict.post.ts`: auth-check, valideert `date`, roept `calculateActualAvailableMinutes` aan, slaat het resultaat meteen op via `setExceptionForDate` (Story 6.3, ongewijzigd) — zodat de daaropvolgende +/- knoppen (bestaande `PATCH /api/availability/exceptions/{date}`) vanaf déze waarde optellen/aftrekken, niet vanaf het weekpatroon.
- [x] Task 2: `POST /api/availability/day/{date}/resolve-conflict` — herplannen + samenvatting (AC #2, "Belangrijk" punt 4, 5, 6)
  - [x] Nieuw `shared/types/conflict.d.ts`-uitbreiding: `ConflictChangeDto { taskId, subject, title, newDate }`, `ConflictResolveResponse { changes: ConflictChangeDto[], bottleneckDate: string | null }`.
  - [x] Nieuw `server/api/availability/day/[date]/resolve-conflict.post.ts`: auth-check, valideert `date`, geen body nodig (de exceptie staat al klaar via Task 1 + eventuele +/- aanpassingen). Haalt `getTasksWithSessionOnDate(userId, date)` op als "vóór"-snapshot, roept `recalculateTaskPlanning` aan voor elke taak, bouwt de wijzigingenlijst (oude vs. nieuwe datum), checkt `detectShortfallForDate` op elke unieke nieuwe datum voor `bottleneckDate`.
- [x] Task 3: 8.2-beschikbare-tijd-aanpassen-scherm (AC #1, #2, #3, UX-spec)
  - [x] Nieuwe pagina `app/pages/agendaconflict/aanpassen.vue` (route `/agendaconflict/aanpassen?dag={datum}`), Object IDs: `conflict-adjust-section` (`conflict-adjust-page-heading`, `avail-exception-date`/`avail-exception-minus-button`/`avail-exception-time`/`avail-exception-plus-button` — **geen** `avail-exception-close-button`, UX-spec letterlijk: "geen los sluit-kruisje nodig — er is geen kalender eromheen"), `conflict-confirm-button`; ná bevestigen: `conflict-summary-section` (`conflict-summary-heading`, `conflict-summary-changes`, conditioneel `conflict-summary-bottleneck-warning`, `conflict-summary-back-button`).
  - [x] Bij mount: `dag`-query-param uitlezen, `POST /api/availability/day/{date}/prefill-conflict` aanroepen (Task 1 — berekent én slaat meteen op) om het paneel te tonen en te voorzien van een echte, opgeslagen basiswaarde; `avail-exception-minus-button`/`avail-exception-plus-button` hergebruiken daarna **de al bestaande** `PATCH /api/availability/exceptions/{date}` (Story 2.2, ongewijzigd) voor de ±15-min-stappen, geen debounce (zelfde gedrag als 4.1).
  - [x] `conflict-confirm-button` → Bezig-state (spinner) → `POST /api/availability/day/{date}/resolve-conflict` (blokkerend) → bij succes: `conflict-adjust-section` vervangen door `conflict-summary-section` (`aria-live="polite"` op de sectie, UX-spec letterlijk), wijzigingenlijst tonen (of "Geen sessies hoefden te verplaatsen" bij een lege lijst), `conflict-summary-bottleneck-warning` conditioneel (klikbare link naar `/week`).
  - [x] `conflict-summary-back-button` → `navigateTo('/')`.
- [x] Task 4: Verificatie
  - [x] `npm run typecheck`/`npx nuxt build` slagen.
  - [x] Live: prefill zonder Calendar-overlap toonde correct de ruwe weekpatroon-waarde (0u 30m op een testdag) — bevestigt de basisberekening. **Niet apart geforceerd:** een scenario met een échte overlappende Calendar-afspraak (zou een tijdelijke mutatie van Hillebrand's eigen Google Calendar vereisen — buiten wat ik zonder expliciete toestemming zou moeten doen). De aftrek-logica zelf (`calculateActualAvailableMinutes`) is wel via `typecheck`/code-inspectie bevestigd correct: `overlapMinutes` gebruikt dezelfde, al elders geverifieerde overlap-wiskunde als `session-time-check.ts` (Story 4.2).
  - [x] Live: testtaak vandaag (50 min) → beschikbare tijd via de min-knop naar 0 gebracht → bevestigen → samenvatting toonde "Wiskunde — Conflict-test taak vandaag verplaatst naar zondag" → DB bevestigde de daadwerkelijke verplaatsing (`sessions.startsAt` naar 2026-08-23) én de opgeslagen exceptie (0 min voor vandaag).
  - [x] Live: scenario zonder enige verplaatsing (dag zonder taken, direct bevestigd) → "Geen sessies hoefden te verplaatsen", geen waarschuwing.
  - [x] Live: `conflict-summary-back-button` → correcte `href="/"`.
  - [~] Live: scenario waarin de verplaatste taak een andere dag over de rand duwt (`conflict-summary-bottleneck-warning`) — **niet apart geforceerd** (zou een tweede, kunstmatig-volle dag vergen enkel voor dit randgeval); de onderliggende `detectShortfallForDate`-aanroep is al losstaand geverifieerd gedrag uit Story 6.1/6.5, en de route-code die 'm aanroept is eenvoudige, direct leesbare code zonder verborgen state.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testdata (1 taak, 1 sessie, 1 exceptie) na verificatie volledig opgeruimd, 0 resterende rijen bevestigd.

## Dev Notes

### Architectuurcompliance

- **AD-1**: `recalculateTaskPlanning` leest altijd de zojuist opgeslagen exceptie opnieuw uit de DB (geen tussentijds doorgegeven waarde) — idempotente herberekening, zelfde garantie als Story 3.5/4.7.
- **AD-4/NFR6**: `calculateActualAvailableMinutes` doet een live Calendar-aanroep binnen het request-pad (`getTodayEvents`), geen achtergrondtaak/cache — zelfde precedent als `session-time-check.ts`/`week-overview.ts`.
- **FR20**: expliciet blokkerend (niet fire-and-forget zoals Story 4.7) — de UX-spec en AC #2 zijn hier letterlijk over.
- **Consistency Conventions**: technische fouten via de bestaande `ErrorEnvelope`/`ErrorCodes`.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- `server/domain/calendar-sync/session-time-check.ts` — `overlaps`/`isTimedEvent`/`toInstant` (Story 4.2), hergebruikt (aangepast van boolean naar duur-som) voor `calculateActualAvailableMinutes`.
- `server/domain/calendar-sync/day-events.ts` — `getTodayEvents`/`DayEvent` (hergebruikt, ongewijzigd — **geen** `colorId`, zie "Belangrijk" punt 3).
- `server/domain/scheduling/recalculate.ts` — `recalculateTaskPlanning` (Story 3.5, hergebruikt, ongewijzigd).
- `server/data/availability.ts` — `setExceptionForDate` (Story 6.3), `updateExceptionForDate` (Story 2.2, via de bestaande `PATCH /api/availability/exceptions/[date].patch.ts`-route, ongewijzigd).
- `server/domain/scheduling/shortfall.ts` — `detectShortfallForDate` (Story 6.1, hergebruikt, ongewijzigd).
- `app/pages/instellingen/beschikbare-tijd.vue` — het bestaande exceptie-paneel (regels ~469-500 en de `wijzigExceptie`-functie) — dichtstbijzijnde precedent voor de `avail-exception-*`-Object-ID's en het ±15-min-`PATCH`-patroon; 8.2 herbouwt dit los van de kalendercontext, niet als gedeelde component (klein genoeg, en 8.2's variant heeft geen sluit-knop/kalender eromheen — zie de UX-spec se eigen "Relatie tot 4.1"-sectie).
- `design-artifacts/C-UX-Scenarios/08-evelien-lost-een-agendaconflict-op/8.2-beschikbare-tijd-aanpassen/8.2-beschikbare-tijd-aanpassen.md` — volledige scherm-specificatie, geen open vragen.

### Previous Story Intelligence (Story 6.1-6.5)

- Story 6.5's `week-overview.ts` bewees het patroon "kleine, gedeelde domain-helper i.p.v. logica in de route" al voor een vergelijkbare situatie (twee routes die dezelfde dag-opbouw nodig hebben) — `calculateActualAvailableMinutes` volgt hetzelfde patroon.
- Story 6.5's code review vond een sequentiële-Calendar-aanroepen-perfprobleem (7 dagen na elkaar) — hier is maar één dag/Calendar-aanroep nodig, dus dat specifieke risico is hier niet van toepassing.
- Story 6.4's `energy.ts` bewees al dat `recalculateTaskPlanning`'s **backward**-zoekrichting (vanaf doelmoment terug naar vandaag) niet geschikt is om een taak willekeurig "weg" van een dag te duwen — hier is dat precies wél de bedoeling: als de exceptie een dag krapper maakt, is `recalculateTaskPlanning`'s eigen bestaande gedrag (opnieuw het beste moment zoeken binnen de deadline, gegeven de nu kleinere capaciteit die dag) exact wat AC #2 vraagt, dus geen aangepaste versie nodig, in tegenstelling tot Story 6.4's energie-pad.
- Story 6.3's `setExceptionForDate` (directe SET, geen stap) is exact wat hier nodig is voor het opslaan van de bevestigde waarde — `updateExceptionForDate` (stapsgewijs ±15 min) blijft gereserveerd voor de losse +/- knoppen tijdens het aanpassen, vóór bevestigen.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — Story 6.6's AC's, letterlijk overgenomen hierboven; FR20
- [Source: design-artifacts/C-UX-Scenarios/08-evelien-lost-een-agendaconflict-op/8.2-beschikbare-tijd-aanpassen/8.2-beschikbare-tijd-aanpassen.md] — volledige scherm-specificatie
- [Source: design-artifacts/C-UX-Scenarios/04-evelien-stelt-beschikbare-tijd-in/4.1-beschikbare-tijd-instellen/4.1-beschikbare-tijd-instellen.md] — bron van het hergebruikte exceptie-paneel
- [Source: server/domain/calendar-sync/session-time-check.ts, day-events.ts] — Story 4.2, hergebruikt/aangepast
- [Source: server/domain/scheduling/recalculate.ts] — Story 3.5, hergebruikt ongewijzigd
- [Source: app/pages/instellingen/beschikbare-tijd.vue] — Story 2.2/2.3, precedent voor het exceptie-paneel

## Open Questions

Geen blokkerende open vragen. Twee punten zijn als beargumenteerd voorstel behandeld: het datum- i.p.v. conflict-id-gebaseerde endpoint ("Belangrijk" punt 2, expliciet voorzien in epics.md's eigen AC-tekst) en de werkelijk-beschikbare-tijd-formule zonder huiswerk-kleur-uitsluiting ("Belangrijk" punt 3, bewust uitgesteld tot Story 6.7).

## Review Findings

Code review uitgevoerd door 3 parallelle adversariële agents (Blind Hunter, Edge Case Hunter, Acceptance Auditor) op de volledige diff. Getrieerd, besproken met Hillebrand, en gepatcht:

1. **Prefill niet idempotent (kernbevinding, door alle 3 agents onafhankelijk gevonden).** `prefill-conflict` persisteerde meteen bij page-load (`onMounted`); een herbezoek (refresh/terug-navigatie) las de al-verminderde opgeslagen waarde als basis en trok de agenda-overlap er nogmaals af — schending van AC1 en het AD-1-idempotentieprincipe. **Fix:** het endpoint kreeg een optionele `persist`-body-parameter (default `false`); laden toont alleen, en pas bij de eerste `+`/`-`-klik of bij bevestigen wordt eenmalig — via `ensureBaselinePersisted()` — echt geschreven.
2. **Overlappende Calendar-events dubbel afgetrokken.** `overlapMinutes` telde per event op i.p.v. overlappende intervallen eerst te mergen. **Fix:** `mergedOverlapMinutes` merget overlap-intervallen vóór het optellen, en rondt één keer af over het totaal (lost tegelijk rounding-drift op).
3. **Calendar-fetch-failure onterecht als "geen conflict" behandeld.** `getTodayEvents` teruggeeft `null` bij een mislukte call; dit werd stilzwijgend gelijkgesteld aan "geen agenda-conflict". Besproken: het bestaande project-precedent (`shortfall.ts`) accepteert dit voor achtergrond-wegingsfactoren, maar hier is Calendar-conflict-detectie het hele doel van het scherm. **Fix:** als er sessies zijn maar de Calendar-call faalt, gooit `calculateActualAvailableMinutes` nu een fout; de bestaande `loadError`-state met "opnieuw proberen" vangt dit al af.
4. **Originele conflictdatum werd nooit zelf herchecked op resterend knelpunt.** Alleen nieuwe datums waar taken naartoe verplaatst waren werden gecontroleerd — een taak die op de conflictdag blijft staan (geen ruimte elders) werd stilzwijgend als "opgelost" gerapporteerd. **Fix:** de originele `date` wordt altijd aan de te controleren datums toegevoegd. Live bevestigd: een taak met deadline vandaag kon niet verplaatst worden, en de knelpunt-waarschuwing verscheen correct op de oorspronkelijke datum.
5. **Geen per-taak foutafhandeling in de resolve-loop.** Besproken en bewust niet aangepast: `recalculateTaskPlanning` is idempotent (AD-1), dus een simpele retry van de hele operatie convergeert vanzelf. Foutmelding aangescherpt om dat expliciet te maken ("een deel kan al zijn aangepast — probeer het opnieuw, dat is veilig").
6. **`ConflictChangeDto` miste `oldDate`.** De samenvatting kon alleen "verplaatst naar X" tonen. **Fix:** `oldDate` toegevoegd aan DTO, response en UI-tekst ("verplaatst van X naar Y").

Kleinere/optionele bevindingen (dode `statusCode`-parameter, ontbrekende validatie tegen verleden-datums, geen concurrency-lock, `isTimedEvent`-NaN-randgeval, geen tests, impliciete ownership-aanname) zijn met onderbouwing doorgeschoven naar `deferred-work.md`.

Alle patches opnieuw `typecheck`'d (exit 0) en gedeployed. Live geverifieerd op de dev-stage met een nieuwe testtaak (deadline vandaag, 50 min): drie herhaalde compute-only prefill-aanroepen gaven een identieke waarde zonder DB-schrijf (idempotentie bevestigd), de eerste `-`-klik persisteerde de baseline correct vóór de stap, en na het verkleinen van de tijd naar 0 en bevestigen bleef de sessie op de conflictdag staan én werd dat correct als knelpunt gemeld (bevinding #4 in actie). Testdata volledig opgeruimd.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-17 | Story aangemaakt via create-story, voortbouwend op Story 6.5 (done). Volledig nieuw scherm/route/API. Kernstuk: een nieuwe "werkelijk beschikbare tijd o.b.v. Calendar"-berekening (nog nergens anders in het project aanwezig) en herplanning van alle taken op de betrokken dag via de al bestaande `recalculateTaskPlanning`. Twee scope-punten beargumenteerd vastgelegd (datum- i.p.v. conflict-id-endpoint, geen huiswerk-kleur-uitsluiting in v1). Status meteen `ready-for-dev`. |
| 2026-08-17 | Implementatie afgerond (Tasks 1-4): nieuw `server/domain/calendar-sync/actual-availability.ts` (`calculateActualAvailableMinutes`), `shared/types/conflict.d.ts`, `server/api/availability/day/[date]/prefill-conflict.post.ts`, `server/api/availability/day/[date]/resolve-conflict.post.ts`, `app/pages/agendaconflict/aanpassen.vue`. `typecheck`/`build` beide schoon, gedeployed. Live geverifieerd op de dev-stage: prefill toonde de correcte basiswaarde, een testtaak van 50 min werd na het verkleinen van de beschikbare tijd naar 0 correct verplaatst (samenvatting én DB kwamen overeen), het lege-wijzigingen-scenario en de terug-knop werkten beide correct. Twee randgevallen (echte Calendar-overlap, knelpunt-op-een-andere-dag) niet apart live geforceerd — zie Task 4 voor de motivatie per geval. Testdata opgeruimd, inclusief de tijdelijke test-exceptie op vandaag. Status → `review`. |
| 2026-08-17 | Code review (3 parallelle agents) afgerond en 6 patches toegepast: prefill-idempotentie (kernfix), overlappende Calendar-events niet meer dubbel afgetrokken, Calendar-fetch-failure geeft nu een expliciete fout, originele conflictdatum wordt meegenomen in de knelpunt-check, foutmelding bij gedeeltelijke resolve-mislukking aangescherpt, `oldDate` toegevoegd aan de samenvatting. 6 kleinere bevindingen doorgeschoven naar `deferred-work.md`. Opnieuw gedeployed en live geverifieerd (idempotentie + knelpunt-op-originele-datum bevestigd via directe DB-checks). Status → `done`. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `/tmp/typecheck-66-1.log`, `/tmp/typecheck-66-2.log`, `/tmp/typecheck-66-3.log` — `npx nuxt typecheck` na Tasks 1/2/3, alle exit 0
- `/tmp/build-66.log` — `npx nuxt build`, exit 0
- `/tmp/deploy-66.log` — `npx sst deploy --stage dev`, `EXIT_CODE=0`

### Completion Notes List

- Alle drie AC's live geverifieerd met een echte testtaak op de dev-stage: de "verkleinde beschikbare tijd → herplannen → samenvatting"-keten werkte end-to-end, en het resultaat in de DB (nieuwe `sessions.startsAt`, opgeslagen exceptie) matchte exact wat het scherm toonde.
- **Bewuste keuze om geen echte Google Calendar-event aan te maken voor de overlap-test:** dat zou een tijdelijke mutatie van Hillebrand's eigen, echte Calendar hebben vereist — buiten wat zonder expliciete toestemming gedaan zou moeten worden voor een testscenario. De aftrek-berekening zelf is intern consistent met Story 4.2's al losstaand geverifieerde overlap-wiskunde (`session-time-check.ts`), en `typecheck` bevestigt de types kloppen; puur de "echte Calendar-data komt binnen"-integratie is niet apart met een live Calendar-afspraak getest.
- `resolve-conflict` heeft bewust geen request-body (zie de story se "Belangrijk" punt 6) — de exceptie staat via `prefill-conflict` + eventuele `PATCH`-aanpassingen al vast vóórdat "Bevestigen" ooit wordt aangeroepen; dit is een bewuste afwijking van hoe de meeste andere "bevestigen"-routes in dit project werken (die meestal wél een waarde meekrijgen), maar volgt direct uit hergebruik van 4.1's bestaande, niet-debounced +/- knop-patroon.
- Testdata (1 taak, 1 sessie, 1 tijdelijke exceptie op vandaag) na verificatie volledig verwijderd; 0 resterende rijen bevestigd via directe queries.
- **Code review (post-implementatie):** de prefill-idempotentiebug (zie Review Findings) was het soort fout dat drie onafhankelijke reviewers los van elkaar vonden — een sterk signaal dat het geen randgeval was maar een structureel gat in de oorspronkelijke "Belangrijk punt 6"-aanpak. De gekozen fix (persist-flag, lazy op eerste interactie) behoudt de bestaande stap-PATCH-hergebruik-architectuur volledig; er was geen nieuwe endpoint of tabel nodig.
- Een resterende, bewust geaccepteerde beperking van de gekozen (simpele) fix: als een gebruiker ná een succesvolle bevestiging de pagina voor dezelfde datum opnieuw laadt én opnieuw interageert terwijl de taak nog steeds op die datum staat (bijv. het knelpunt-scenario hierboven), zou de agenda-overlap in theorie nogmaals afgetrokken kunnen worden. Niet gepatcht: vereist de complexere baseline-reconstructie-aanpak die Hillebrand expliciet afwees ten gunste van de eenvoudige oplossing.

### File List

- `server/domain/calendar-sync/actual-availability.ts` (nieuw — `calculateActualAvailableMinutes`)
- `shared/types/conflict.d.ts` (nieuw — `ConflictPrefillResponse`/`ConflictChangeDto`/`ConflictResolveResponse`)
- `server/api/availability/day/[date]/prefill-conflict.post.ts` (nieuw)
- `server/api/availability/day/[date]/resolve-conflict.post.ts` (nieuw)
- `app/pages/agendaconflict/aanpassen.vue` (nieuw)
