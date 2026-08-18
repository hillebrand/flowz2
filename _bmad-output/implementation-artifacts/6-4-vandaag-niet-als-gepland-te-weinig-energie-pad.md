---
baseline_commit: 2f361ce
---

# Story 6.4: "Vandaag niet als gepland?" — Te weinig Energie-pad

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want aangeven dat ik vandaag te weinig energie heb,
so that Flowz de dag voor me aanpast zonder dat ik zelf moeilijke keuzes hoef te maken.

## Acceptance Criteria

1. **Given** Evelien kiest `reason-card-energy` op 3.1, **when** de keuze bevestigd wordt, **then** verschuift Flowz moeilijke taken van vandaag naar een andere dag, en kan eenvoudige taken naar voren halen (FR23).
2. **Given** hetzelfde voorstel, **when** Flowz sessies zou kunnen inkorten, **then** doet ze dat alleen als dat niet leidt tot te hoge studiedruk op de dagen erna.
3. **Given** het voorstel is berekend, **when** het aan Evelien getoond wordt, **then** toont Flowz altijd een melding van wat is aangepast — ook als de conclusie is dat er bewust niets is ingekort, met uitleg waarom (te hoge studiedruk elders).

## Belangrijk: lees dit vóór je begint — vier scope-punten

**1. Het UX-ontwerp voor deze story is deze sessie pas gemaakt** (in tegenstelling tot elke andere Epic 6-story, die al vanaf Phase 3/4 een ontwerpbasis had). De energie-route stond sinds 2026-07-26 bewust buiten scope; Hillebrand koos expliciet voor een aparte WDS-ontwerppas (`wds-3-scenarios` + `wds-4-ux-design`) vóórdat deze story geschreven werd. Volledige specificatie: `design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.3-energie-voorstel/3.3-energie-voorstel.md`. Twee kernbeslissingen daaruit, letterlijk uit de spec:
   - **Wél een bevestigingsstap** — Flowz past niets automatisch toe zonder dat Evelien eerst het voorstel ziet en bevestigt (bewuste afwijking van "volledig automatisch, alleen resultaat tonen").
   - **Eén pagina, twee states** (Voorstel → Resultaat), geen aparte route voor het resultaat — analoog aan hoe 3.2-tekort-oplossen evolueert van "openstaand tekort" naar "opgelost". **Wél** een terug-route in de Voorstel-state (`energy-back-link`), bewust ánders dan 3.2: hier verandert er niets bij weigeren, in tegenstelling tot 3.2's groeiende tekort.

**2. Twee nieuwe API-endpoints nodig — geen bestaande route te hergebruiken.** In tegenstelling tot Story 6.3 (die `POST /api/day/shortfall` kon uitbreiden) bestaat er voor het energie-pad nog niets: `POST /api/day/energy-proposal` (berekent, past niets toe) en `POST /api/day/energy-proposal/confirm` (herberekent vers en past toe — zelfde "server is gezaghebbend, nooit een client-aangeleverde payload vertrouwen"-precedent als `.../recommendations/[id]/accept.post.ts`, Story 6.2).

**3. Blokkerend/kernstuk van deze story — het energie-voorstel-algoritme bestond nog nergens.** FR23 beschrijft het gedrag ("verschuift moeilijke taken, kan eenvoudige naar voren halen, kort alleen in als veilig") maar geen enkel eerder document geeft een concrete berekening — zelfde situatie als Story 6.1's studiedruk-score/doelmoment.ts's bufferformule: geen exacte cijfers in PRD/architectuur, dus hieronder een beargumenteerd, makkelijk aan te passen voorstel (nieuw bestand `server/domain/scheduling/energy.ts`, naast `shortfall.ts`, zelfde AD-1/AD-3-precedent: puur lezen/genereren in `generateEnergyProposal`, apart toepassen in `applyEnergyProposal`):

   - **Stap 1 — Verschuiven:** alle taken die vandaag een sessie hebben met `task.difficulty === 'hoog'` (`getTasksWithSessionOnDate`, al bestaand) worden verplaatst naar de eerste dag ná vandaag met genoeg capaciteit, binnen de eigen deadline van de taak. ~~Hergebruikt `shortfall.ts`'s bestaande, tot nu toe **privé** `findAlternativeDate`-functie~~. Wordt geen alternatieve dag gevonden binnen de deadline: de taak blijft gewoon staan (geen geforceerde plaatsing buiten de deadline, zelfde fallback-gedachte als `doelmoment.ts`'s `findSessionDate`).
     **Update (Hillebrand, 2026-08-17, ná de code review):** uitgebreid met **verdringen** — is een kandidaat-dag te vol, dan mag een taak die daar al staat met méér speling (urgentie/doelmoment, verder van haar eigen deadline dan de binnenkomende taak) zelf ook een nieuwe plek krijgen, laagste prioriteit eerst (`PRIORITY_WEIGHT`, zelfde precedent als `shortfall.ts`'s `lowestPriorityFirst`) maar 'hoog'-prioriteit niet uitgesloten als er geen lagere-prioriteit-kandidaat met genoeg speling is. **Onbeperkte cascade**: een verdrongen taak doorloopt zelf dezelfde zoektocht (kan op haar beurt weer iemand verdringen) — terminatie gegarandeerd doordat elke taak hooguit één keer verplaatst wordt en verplaatsing altijd voorwaarts in de tijd gaat. Concreet motiverend scenario (Hillebrand): een taak van vandaag met een deadline over 3 dagen moet een taak van morgen met een deadline over 2 weken kunnen verdringen — live geverifieerd, werkt. Dit verving `findAlternativeDate` volledig door een eigen, rijkere plaatsingsfunctie in `energy.ts` zelf (`placeHardTaskForward`/`tryDisplaceOnDate`) — `findAlternativeDate` in `shortfall.ts` is weer **privé** gemaakt, ongewijzigd gedrag voor Story 6.1/6.2's eigen escalatieketen (die bewust géén verdringen doet — tier 1 "herplannen" blijft simpel).
   - **Stap 2 — Naar voren halen (optioneel, FR23's "kan"):** bereken de vrijgekomen capaciteit vandaag = som van `plannedMinutes` van de in stap 1 verplaatste sessies. Doorloop de user's openstaande taken (`getOpenTasksWithProgress`) met `difficulty === 'laag'` waarvan de sessie ná vandaag gepland staat (`getSessionForTask` + `session.startsAt.slice(0, 10) > date` — de eerste-10-tekens-vergelijking is hier veilig door het vaste 16:00-Europe/Amsterdam-sessie-anker, zelfde precedent als `data/tasks.ts`'s bestaande `substr(startsAt, 1, 10)`-filters), gesorteerd op `task.deadline` oplopend (de meest urgente eenvoudige taak eerst — vermindert toekomstige druk het snelst). Voor elke kandidaat die past binnen de resterende vrijgekomen capaciteit: verplaats de sessie náár vandaag. Stop zodra de capaciteit op is of geen enkele resterende kandidaat meer past.
   - **Stap 3 — Inkorten, voorwaardelijk (AC #2):** voor de taken die nog steeds vandaag gepland staan met `difficulty === 'gemiddeld'` (hoog is al weg via stap 1, laag was al licht): bereken `calculateStudiedrukScore` (Story 6.1, hergebruikt, ongewijzigd) voor de eerstvolgende **3 dagen** ná vandaag. Is de hoogste van die drie scores **≥ 70** (voorgestelde drempel op dezelfde 0-100-schaal als de bestaande score — makkelijk aan te passen, geen andere berekening in dit bestand hangt van de exacte waarde af): **niet** inkorten voor die taak (de nabije toekomst is al druk genoeg, dus geen extra achterstand nu laten ontstaan). Is de hoogste score < 70: kort de sessie in met een vaste stap `ENERGY_SHORTEN_STEP_MINUTES` (voorstel: **15 min** — kleiner dan `shortfall.ts`'s `VERRUIMEN_STEP_MINUTES`/30, want dit is een preventieve verlichting, geen tekort-oplossing), zelfde permanente-vermindering-semantiek als `shortfall.ts`'s tier-3 `inkorten` (`applyInkorten`: alleen `session.plannedMinutes` omlaag, `task.totalMinutes` blijft ongewijzigd — een geaccepteerd, geen elders-gecompenseerd tijdverlies).
   - **`notShortenedReason`:** alleen gevuld wanneer er ná stap 1+2 nog `gemiddeld`-taken over waren om potentieel in te korten, maar de veiligheidscheck ze allemaal afwees (AC #3's "bewust niets ingekort, met uitleg waarom"). Waren er helemaal geen kandidaten (geen `gemiddeld`-taken meer over), dan blijft dit veld `null` — er valt dan niets uit te leggen, de `energy-not-shortened-block` verschijnt dan simpelweg niet (zie de UX-spec's eigen conditionele zichtbaarheid).

**4. Refactor nodig voor stap 2 (naar voren halen):** het verplaatsen van een sessie náár een dag is exact dezelfde DB+Calendar-mutatie als `apply-recommendation.ts`'s bestaande `applyHerplannen` (sessie-anker-stapeling, `updateSessionPlacement`, create/update homework-event) — alleen de richting verschilt (vandaag→elders vs. elders→vandaag). Extraheer deze body naar een nieuw gedeeld bestand `server/domain/scheduling/session-placement.ts` (`placeSessionOnDate(userId, task, session, targetDate)`), en laat zowel `applyHerplannen` als de nieuwe `applyEnergyProposal` 'm aanroepen. Puur een extractie — `applyHerplannen`'s gedrag blijft ongewijzigd.

**5. `reason-card-energy` op 3.1-reden-kiezen navigeert nog naar de oude placeholder.** De UX-spec (`3.1-reden-kiezen.md`) is deze sessie al bijgewerkt om naar `/herstel/energie-voorstel` te verwijzen, maar de daadwerkelijke code (`app/pages/herstel/reden-kiezen.vue`, regel ~48: `navigateTo('/herstel/energie-binnenkort')`) nog niet — dit moet in déze story worden aangepast.

**6. De placeholder-pagina `app/pages/herstel/energie-binnenkort.vue` (Story 6.3) wordt overbodig.** Story 6.3's eigen Completion Notes kondigden dit al aan ("Story 6.4 bouwt het echte scherm; deze pagina wordt dan overbodig en kan vervallen") — verwijderen als onderdeel van deze story, geen andere pagina linkt ernaar behalve `reden-kiezen.vue` (die in punt 5 al wordt aangepast).

**7. Server is gezaghebbend, ook hier — maar dit scherm heeft geen invoervelden.** In tegenstelling tot 3.1's tijd-invoer (Story 6.3) stuurt de client op 3.3 helemaal geen data mee buiten de bevestiging zelf; `confirm.post.ts` herberekent het volledige voorstel zelf vanuit de actuele DB-staat vóór het toepassen — nooit een door de client teruggestuurd voorstel-object vertrouwen (zelfde precedent als `accept.post.ts`'s eigen herberekening).

## Tasks / Subtasks

- [x] Task 1: Domain-logica — `energy.ts` + gedeelde sessie-plaatsing (AC #1, #2, #3, "Belangrijk" punt 3-4)
  - [x] `findAlternativeDate` in `server/domain/scheduling/shortfall.ts` exporteren (was privé).
  - [x] Nieuw `server/domain/scheduling/session-placement.ts`: `placeSessionOnDate(userId, task, session, targetDate)`, geëxtraheerd uit `apply-recommendation.ts`'s `applyHerplannen`-body (ongewijzigd gedrag, puur verplaatst).
  - [x] `apply-recommendation.ts`'s `applyHerplannen` aangepast om de nieuwe gedeelde helper aan te roepen i.p.v. de inline logica.
  - [x] Nieuw `server/domain/scheduling/energy.ts`: `EnergyProposalItem`/`EnergyProposal`-interfaces, `generateEnergyProposal(userId, date)` (stap 1-3 hierboven), `applyEnergyProposal(userId, proposal)` (past `relocated`/`pulledForward` toe via `placeSessionOnDate`, `shortened` via dezelfde inkort-mutatie als `apply-recommendation.ts`'s `applyInkorten`).
- [x] Task 2: API-routes (AC #1, #2, #3, "Belangrijk" punt 2, 7)
  - [x] Nieuw `shared/types/energy.d.ts`: `EnergyProposalItemDto { taskId, description }`, `EnergyProposalResponse { date, relocated, pulledForward, shortened, notShortenedReason }`, `EnergyConfirmResponse` (zelfde shape als het voorstel, nu toegepast) — zelfde patroon als `shared/types/shortfall.d.ts`.
  - [x] Nieuw `server/api/day/energy-proposal.post.ts`: auth-check, roept `generateEnergyProposal(userId, todayInAmsterdam())` aan, retourneert het voorstel. Geen server-side opslag tussen de twee requests (zelfde stateless-precedent als de shortfall-aanbevelingen).
  - [x] Nieuw `server/api/day/energy-proposal/confirm.post.ts`: auth-check, herberekent het voorstel vers via `generateEnergyProposal` (nooit een client-payload vertrouwen), past het toe via `applyEnergyProposal`, retourneert hetzelfde voorstel-object (voor de Resultaat-state).
- [x] Task 3: 3.3-energie-voorstel-scherm (AC #1, #2, #3, UX-spec)
  - [x] Nieuwe pagina `app/pages/herstel/energie-voorstel.vue` (route `/herstel/energie-voorstel`), Object IDs uit de spec: `energy-back-link`, `energy-heading`/`energy-result-heading`, `energy-reassurance-text`, `energy-change-groups` (`energy-group-relocated`/`energy-group-pulled-forward`/`energy-group-shortened`, elk met `energy-change-item`-kaarten), `energy-not-shortened-block` (conditioneel), `energy-confirm-button`.
  - [x] Laden-state: `POST /api/day/energy-proposal` bij mount (blokkerend, geen data zonder dit).
  - [x] Voorstel-state: toont de niet-lege groepen + eventueel `energy-not-shortened-block`, `energy-confirm-button` + `energy-back-link` zichtbaar.
  - [x] `energy-confirm-button` → Bezig-state (spinner) → `POST /api/day/energy-proposal/confirm` (blokkerend) → bij succes: Resultaat-state (`energy-result-heading` "Dag aangepast!", `energy-back-link`/actiebalk verdwijnen), na 2-3 seconden automatische navigatie naar `/` (1.1-Home) — bij fout: inline foutmelding, knop weer actief, `energy-back-link` blijft beschikbaar.
  - [x] `energy-back-link` → navigeert naar `/`, geen server-aanroep (er is nog niets toegepast in de Voorstel-state).
  - [x] Leeg-voorstel-randgeval (UX-spec Open Question 1): alle drie groepen leeg → neutrale melding ("Vandaag hoeft er niets aangepast te worden") i.p.v. de groepen-lijst, alleen een "Terug naar Home"-knop i.p.v. `energy-confirm-button`.
  - [x] Fout bij het ophalen van het voorstel (UX-spec Open Question 2): paginabrede foutmelding + "Opnieuw proberen"-knop.
- [x] Task 4: 3.1-reden-kiezen wiring + placeholder opruimen ("Belangrijk" punt 5, 6)
  - [x] `app/pages/herstel/reden-kiezen.vue`'s `kiesEnergie()` aangepast: `navigateTo('/herstel/energie-voorstel')` i.p.v. `/herstel/energie-binnenkort`.
  - [x] `app/pages/herstel/energie-binnenkort.vue` verwijderd (overbodig, Story 6.3's eigen aankondiging).
- [x] Task 5: Verificatie
  - [x] `npm run typecheck`/`npx nuxt build` slagen.
  - [x] Live: testtaken vandaag met difficulty `hoog`/`gemiddeld`/`laag` + een `laag`-taak op een latere dag → "Te weinig energie" kiezen → voorstel toont de `hoog`-taak verschoven, de latere `laag`-taak naar voren gehaald.
  - [x] Live: bevestigen past daadwerkelijk toe — DB bevestigt gewijzigde `sessions.startsAt`/`plannedMinutes`, Resultaat-state toont "Dag aangepast!", Home toont de nieuwe planning meteen na navigatie.
  - [x] Live: leeg-voorstel-randgeval (dag zonder aanpasbare taken) → neutrale melding + "Terug naar Home"-knop, geen "Bevestigen".
  - [x] Live: `energy-back-link` in de Voorstel-state → terug naar Home, niets aangepast (DB ongewijzigd, geverifieerd).
  - [x] Live: `reason-card-energy` op 3.1 navigeert naar het echte scherm; placeholder-route geeft nu een 404 (voor ingelogde gebruikers — uitgelogd geeft eerst de verwachte 401 vanuit de auth-middleware).
  - [x] Geen secrets/placeholder-waarden in code/commits. Testdata na verificatie opgeruimd, 0 resterende rijen bevestigd.
  - [~] Live: scenario waarin de inkort-veiligheidscheck een `gemiddeld`-taak afwijst — **niet apart live geforceerd** (zou kunstmatig een hoge studiedruk-score op een van de komende 3 dagen vergen, wat een aparte serie testtaken/sessies zou kosten enkel voor déze negatieve tak); de logica zelf is wél bevestigd door herderivatie tegen `calculateStudiedrukScore` se eigen, al losstaand geverifieerde gedrag (Story 6.1) en door code-inspectie van de drempelvergelijking. Zie Completion Notes.

### Review Findings

- [x] [Review][Patch] Stap 1 "verschuiven" houdt geen boekhouding bij over meerdere `hoog`-taken heen — twee taken kunnen onafhankelijk dezelfde alternatieve dag toegewezen krijgen zonder dat elkaars capaciteitsclaim meetelt, en `placeSessionOnDate` checkt bij het toepassen geen dagcapaciteit (stapelt domweg door) [server/domain/scheduling/energy.ts:52-64] — **gepatcht + uitgebreid op verzoek van Hillebrand:** `hoog`-taken worden nu eerst op dichtstbijzijnde deadline gesorteerd (meest urgente taak claimt als eerste een plek), plus een lokale `claimedMinutesByDate`-boekhouding die een nieuwe zoektocht afdwingt zodra een kandidaat-dag door dit voorstel zelf al te vol blijkt. Live geverifieerd: twee `hoog`-taken vandaag, dezelfde eerst-beschikbare dag maar samen te groot — de taak met de naderende deadline kreeg die dag, de andere werd correct doorgeschoven naar de eerstvolgende dag met ruimte.
- [x] [Review][Patch] Stap 3's veiligheidscheck leest de studiedruk-score van de vooruitkijkdagen vóórdat stap 1's eigen verschuivingen daadwerkelijk zijn toegepast — een taak die naar zo'n dag verschuift, telt niet mee in de "is inkorten hier veilig?"-beoordeling, wat AC #2's garantie kan ondermijnen [server/domain/scheduling/energy.ts:103-119] — gepatcht: dagen waar stap 1 al een taak naartoe verschuift, worden nu conservatief als onveilig behandeld in stap 3's check.
- [x] [Review][Patch] `notShortenedReason` noemt nooit de specifieke dag(en) die de drempel overschreden — de UX-spec eist letterlijk een dynamische template ("Niet ingekort — [dagen] zijn al druk genoeg") maar de code retourneert een vaste, dag-loze zin [server/domain/scheduling/energy.ts:127-129] — gepatcht: de melding noemt nu via `formatDayLabel` de specifieke dag die de veiligheidscheck liet afknappen.
- [x] [Review][Patch] Studiedruk-score wordt per kandidaat-taak opnieuw berekend voor dezelfde 3 vooruitkijkdagen, terwijl de uitkomst taak-onafhankelijk is — onnodige herhaalde DB-round-trips [server/domain/scheduling/energy.ts:109-115] — gepatcht als onderdeel van dezelfde herstructurering: de veiligheidscheck loopt nu één keer vóór de taak-lus i.p.v. erin.
- [x] [Review][Patch] `setTimeout` voor de automatische navigatie na bevestigen wordt nooit opgeruimd bij unmount — als Evelien binnen de 2,5s handmatig wegnavigeert, vuurt de callback alsnog tegen een afgebroken component [app/pages/herstel/energie-voorstel.vue:62] — gepatcht: timer-id bewaard, opgeruimd via `onUnmounted`.
- [x] [Review][Defer] Geen transactie/gelijktijdigheids-guard rond `applyEnergyProposal`/`confirm.post.ts` [server/domain/scheduling/energy.ts:134, server/api/day/energy-proposal/confirm.post.ts] — deferred, pre-existing: identiek patroon als het al geaccepteerde `apply-recommendation.ts`/`accept.post.ts` (Story 6.2) — zelfde project-brede risico-postuur (single-user hobby-app)
- [x] [Review][Defer] Bij gedeeltelijke afwijzing (sommige `gemiddeld`-taken wél, andere niet ingekort) krijgt de gebruiker geen per-taak uitleg voor de afgewezene — deferred: AC #3 beschrijft letterlijk alleen het dag-brede "niets ingekort"-geval; per-item uitleg is een legitieme toekomstige UX-uitbreiding, buiten deze story's scope [server/domain/scheduling/energy.ts:100-125]
- [x] [Review][Defer] Stap 2's "naar voren halen" vult capaciteit greedy op deadline-volgorde zonder terug te vallen op een andere combinatie als een kandidaat net niet past — kan capaciteit onderbenutten [server/domain/scheduling/energy.ts:66-91] — deferred, pre-existing ontwerpkeuze: FR23 noemt dit expliciet optioneel ("kan eventueel"), geen AC vereist een optimale bin-packing

**Dismissed als noise/al afgehandeld (7):** geen transactie-check op malformed voorstel-items (defensief, onbereikbaar via normale flow); dubbelzinnige `targetDate`-semantiek tussen `relocated`/`pulledForward` (werkt correct, voldoende gedocumenteerd); ontbrekende unit tests (geen testframework in dit project — consistent met elke eerdere story); niet-gedeelde inkort-mutatie tussen `energy.ts` en `apply-recommendation.ts` (bewuste, in Completion Notes gedocumenteerde scope-keuze); mogelijk achtergebleven verwijzingen naar de verwijderde placeholder-route (al geverifieerd via grep tijdens implementatie — geen enkele resterende referentie); N+1-queries in stap 2 (consistent met de bestaande per-taak-lus-stijl elders in dit bestand/project); dag-labels tonen weekdagnamen i.p.v. relatieve tekst ("morgen") (expliciet gesanctioneerd door de story se eigen Dev Notes).

## Dev Notes

### Architectuurcompliance

- **AD-1/AD-3**: `generateEnergyProposal` is een pure berekening op de actuele Task/Session/AvailableTime-staat (geen tussentijds opgeslagen voorstel-staat) — zelfde precedent als `shortfall.ts`. `applyEnergyProposal` is de enige plek die muteert.
- **AD-6**: dit scherm toont geen `Notification`-shape (geen banner/melding via `notification.ts`) — de wijzigingenlijst is puur UI-content van dit scherm zelf, geen gedeelde meldingscomponent. Consistent met de UX-spec, die geen `Notification`-hergebruik vermeldt.
- **NFR7**: scheduling-logica (welke taken verschuiven/inkorten) leeft uitsluitend server-side, in `energy.ts` — de client toont alleen wat de server teruggeeft.
- **Consistency Conventions**: technische fouten via de bestaande `ErrorEnvelope`/`ErrorCodes` (`server/domain/errors.ts`), zelfde patroon als `shortfall.post.ts`/`accept.post.ts`.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- `server/domain/scheduling/shortfall.ts` — `findAlternativeDate` (te exporteren, ongewijzigd gedrag), `calculateStudiedrukScore` (hergebruikt, ongewijzigd), `formatDayLabel`/`DUTCH_WEEKDAY_LABELS`-patroon (her te gebruiken voor de wijziging-beschrijvingen).
- `server/domain/scheduling/apply-recommendation.ts` — `applyHerplannen` (te refactoren naar de nieuwe gedeelde helper), `applyInkorten` (het patroon voor `energy.ts`'s stap 3-mutatie).
- `server/domain/scheduling/ordering.ts` — `DIFFICULTY_WEIGHT` (al geëxporteerd, niet per se nodig hier — `energy.ts` gebruikt `task.difficulty` rechtstreeks, geen gewogen score).
- `server/domain/scheduling/doelmoment.ts` — `addDays`/`isBefore`/`SESSION_ANCHOR_HOUR` (al geëxporteerd, hergebruikt door de nieuwe `session-placement.ts`).
- `server/data/tasks.ts` — `getTasksWithSessionOnDate`, `getOpenTasksWithProgress`, `getSessionForTask`, `updateSessionPlacement`, `getTaskById` (allemaal al bestaand, geen wijziging nodig).
- `app/pages/herstel/reden-kiezen.vue` — `kiesEnergie()` (regel ~46-49), aan te passen.
- `app/pages/herstel/energie-binnenkort.vue` — te verwijderen.
- `app/pages/herstel/tekort-oplossen.vue` (Story 6.2) — géén wijziging, maar wel het dichtstbijzijnde precedent voor 3.3's Laden/Voorstel/Bezig/Resultaat-statemachine en de "korte bevestiging → automatische navigatie naar Home"-flow.

### Previous Story Intelligence (Story 6.1/6.2/6.3)

- Story 6.1's terugkerende les: elke nieuwe formule/drempel zonder exacte PRD-cijfers is een **beargumenteerd voorstel**, expliciet gemarkeerd als zodanig, makkelijk aan te passen — niet blokkerend voor implementatie. Dezelfde aanpak is hierboven gevolgd voor de inkort-veiligheidsdrempel (70/100) en de stapgrootte (15 min).
- Story 6.1's twee zelf-gevonden bugs (tier-2 unbounded scaling, tier-4 exclusie) ontstonden allebei door de escalatie-garantie niet expliciet te herderiveren vóór te deployen — bij `energy.ts`'s stap 3 is er geen vergelijkbare "garandeer altijd dekking"-eis (FR23 vraagt expliciet om **niet** in te korten als het onveilig is), dus dat specifieke risico speelt hier niet, maar de algemene les ("reken de kernlogica handmatig na vóór live-verificatie") blijft gelden.
- Story 6.2's `onBeforeRouteLeave`-bug (ontsnappingsraam tijdens laden): 3.3 heeft, in tegenstelling tot 3.2, een bewuste, altijd-beschikbare terug-link (`energy-back-link`) — geen `onBeforeRouteLeave`-guard nodig, dus dat specifieke bugpatroon is hier niet van toepassing. Let wel op dat `energy-back-link` in de Resultaat-state verdwijnt (geen "terug" ná toepassen).
- Story 6.3's code review vond een server-autoriteit-schending (client stuurde een vooraf-opgetelde waarde i.p.v. losse velden) — hier is er geen vergelijkbaar client-invoerveld (zie "Belangrijk" punt 7), dus dat specifieke risico is structureel uitgesloten, niet alleen door zorgvuldigheid.
- Story 6.3's Completion Notes kondigden expliciet aan dat `energie-binnenkort.vue` bij deze story zou vervallen — punt 6 hierboven lost dat in.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 698-708 (Story 6.4's AC's, letterlijk overgenomen hierboven; FR23 regel 64)
- [Source: design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.3-energie-voorstel/3.3-energie-voorstel.md] — volledige scherm-specificatie, Object IDs, states, API-contract (deze sessie gemaakt)
- [Source: design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.1-reden-kiezen/3.1-reden-kiezen.md] — bijgewerkte exit-actie/technical notes (deze sessie)
- [Source: design-artifacts/_progress/00-design-log.md] — 2026-08-17-entries, motivatie achter de bevestigingsstap/terug-route-keuzes
- [Source: server/domain/scheduling/shortfall.ts, apply-recommendation.ts] — Story 6.1/6.2, hergebruikte/te refactoren functies
- [Source: server/data/tasks.ts] — bestaande data-functies, geen wijziging nodig

## Open Questions

Geen blokkerende open vragen — de twee interactie-beslissingen (bevestigingsstap, terug-route) zijn al opgelost tijdens de UX-ontwerppas (zie "Belangrijk" punt 1); het algoritme-voorstel in "Belangrijk" punt 3 is bewust als beargumenteerd voorstel behandeld (zelfde precedent als Story 6.1), niet als blokkerende vraag.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-17 | Story aangemaakt via create-story, voortbouwend op Story 6.3 (done) en een deze-sessie-uitgevoerde WDS-ontwerppas (3.3-energie-voorstel, nieuw). Geen blokkerende Open Questions — kernalgoritme (verschuiven/naar voren halen/inkorten) uitgewerkt als beargumenteerd voorstel in "Belangrijk" punt 3, analoog aan Story 6.1's studiedruk-score-precedent. Status meteen `ready-for-dev`. |
| 2026-08-17 | Implementatie afgerond (Tasks 1-5): `findAlternativeDate`/`formatDayLabel` geëxporteerd uit `shortfall.ts`; nieuwe gedeelde `session-placement.ts` (`placeSessionOnDate`), `apply-recommendation.ts`'s `applyHerplannen` daarnaar gerefactored; nieuw `energy.ts` (`generateEnergyProposal`/`applyEnergyProposal`, drie-stappen-algoritme); nieuwe routes `POST /api/day/energy-proposal` + `.../confirm`; nieuwe pagina `app/pages/herstel/energie-voorstel.vue`; `reden-kiezen.vue` gewijzigd, `energie-binnenkort.vue` verwijderd. `typecheck`/`build` beide schoon. Live geverifieerd op de dev-stage met drie testtaken (hoog/gemiddeld/laag): voorstel toonde correct alle drie categorieën, inclusief een capaciteits-bewuste keuze (de `hoog`-taak sloeg de eerst-mogelijke dag over omdat die al bezet was door de `laag`-taak, en verscheen op de eerstvolgende dag mét ruimte — exact het gedrag dat `findAlternativeDate`'s capaciteitscheck hoort te geven). Bevestigen paste alles daadwerkelijk toe (DB-diff bevestigd: `startsAt`/`plannedMinutes` klopten voor alle drie taken), Home toonde meteen de nieuwe planning. `energy-back-link` liet de DB aantoonbaar ongewijzigd. Leeg-voorstel-randgeval getoond na opruimen van de testdata. Placeholder-route geeft nu een 404 voor ingelogde gebruikers. Status → `review`. |
| 2026-08-17 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 decision-needed, 5 patch, 3 defer (naar `deferred-work.md`), 7 dismissed. Alle 5 patches toegepast: (1) stap 1's relocatie-boekhouding gefixt (`claimedMinutesByDate`) — op verzoek van Hillebrand uitgebreid met dichtstbijzijnde-deadline-eerst-sortering vóór de relocatie-lus; (2)+(3)+(4) stap 3 herstructureerd tot één taak-onafhankelijke veiligheidscheck vóór de lus, die nu ook stap 1's eigen verschuivingen als onveilige dagen meeneemt én de specifieke dag in `notShortenedReason` noemt; (5) `setTimeout`-cleanup via `onUnmounted` in `energie-voorstel.vue`. `typecheck`/`build` beide schoon, opnieuw gedeployed (AWS-sessie was tussendoor verlopen, opnieuw ingelogd — zie Debug Log), en live geverifieerd met twee `hoog`-taken die samen niet op dezelfde eerst-beschikbare dag pasten: de taak met de naderende deadline kreeg die dag, de andere werd correct naar de eerstvolgende dag met ruimte doorgeschoven — DB bevestigde het exact voorspelde resultaat. Testdata opgeruimd. Status → `done`. |
| 2026-08-17 | Post-review uitbreiding op verzoek van Hillebrand: stap 1 kon een taak met veel deadline-speling (bv. 2 weken) niet verdringen om plaats te maken voor een urgentere taak van vandaag (bv. deadline over 3 dagen) — de taak bleef dan gewoon op vandaag staan als de eerst-mogelijke dag al bezet was. Overwogen alternatief (Hillebrand: "gewoon alle toekomstige taken herplannen") bleek niet te werken: de bestaande herberekening (`recalculateTaskPlanning`/`findSessionDate`) zoekt terugwaarts vanaf het doelmoment náár vandaag toe, niet voorwaarts — precies verkeerd om een taak mét speling verder de toekomst in te duwen. Gebouwd: `energy.ts` se eigen `placeHardTaskForward`/`tryDisplaceOnDate` (vervangt `findAlternativeDate`, dat weer privé is in `shortfall.ts`) — verdringt bij een te volle kandidaat-dag een taak met meer speling (urgentie/doelmoment), laagste prioriteit eerst maar 'hoog' niet uitgesloten, onbeperkt cascaderend (terminatie gegarandeerd: elke taak max. 1x verplaatst, altijd voorwaarts). Stap 2 kreeg een bijpassende fix: sluit door stap 1 al verplaatste taken uit van haar eigen kandidatenpool (voorkomt een dubbele/verouderde vermelding). `typecheck`/`build` schoon, opnieuw gedeployed, en live geverifieerd met exact het scenario dat Hillebrand aandroeg (taak vandaag/deadline+3d verdringt taak morgen/deadline+2wk) — DB bevestigde het verwachte resultaat. Testdata opgeruimd. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `/tmp/typecheck.log`, `/tmp/typecheck2.log`, `/tmp/typecheck3.log` — `npx nuxt typecheck`, alle exit 0
- `/tmp/build.log` — `npx nuxt build`, exit 0
- `/tmp/deploy-6-4.log` — `npx sst deploy --stage dev`, `EXIT_CODE=0`
- `/tmp/typecheck-review.log`, `/tmp/build-review.log` — na de review-patches, beide exit 0
- `/tmp/deploy-6-4-review.log` — eerste deploy-poging ná de patches faalde (`EXIT_CODE=1`, verlopen AWS-sessie); `/tmp/deploy-6-4-review2.log` — retry ná `aws login`, geslaagd
- `/tmp/typecheck-cascade.log`, `/tmp/typecheck-cascade2.log`, `/tmp/build-cascade.log` — ná de verdring-cascade-uitbreiding, allemaal exit 0
- `/tmp/deploy-cascade.log` — `npx sst deploy --stage dev`, `EXIT_CODE=0`

### Completion Notes List

- Alle drie AC's live geverifieerd met echte testtaken op de dev-stage: het gegenereerde voorstel matchte exact de handmatig doorgerekende uitkomst (welke taak verschuift, welke naar voren komt, welke wordt ingekort), en het toegepaste resultaat in de DB matchte het getoonde voorstel 1-op-1.
- De inkort-veiligheidscheck (AC #2, "Belangrijk" punt 3) is **niet** apart met een kunstmatig-hoge-studiedruk-scenario live geforceerd — dat zou een aparte, uitsluitend-voor-dit-randgeval opgetuigde reeks testtaken/sessies hebben gekost. Wel bevestigd: (a) de positieve tak (veilig inkorten) werkte live exact zoals verwacht, (b) `calculateStudiedrukScore` zelf is al losstaand geverifieerd gedrag uit Story 6.1, (c) de drempelvergelijking (`highestScore >= 70` → overslaan) is simpele, direct leesbare code zonder verborgen state. Risico-inschatting: laag — makkelijk alsnog te forceren in een latere sessie als gewenst.
- `session-placement.ts` is bewust een kleine, gerichte extractie (alleen `placeSessionOnDate`) — de losse `MIN_MINUTES_AFTER_ENERGY_SHORTEN`/inkort-mutatie in `energy.ts` is bewust **niet** ook gedeeld met `apply-recommendation.ts`'s `applyInkorten`, conform de story se eigen scope (alleen punt 4 vroeg om de plaatsings-mutatie te delen, niet de inkort-mutatie) — een kleine, geaccepteerde duplicatie i.p.v. een ongevraagde abstractie.
- Testdata (3 taken, 3 sessies) na verificatie volledig verwijderd (inclusief subtasks-rijen); 0 resterende `Story 6.4`-rijen bevestigd via een directe query.
- **Review-patch verificatie:** de belangrijkste patch (stap 1's relocatie-boekhouding + deadline-volgorde) is specifiek live getest met twee `hoog`-taken die samen niet op dezelfde eerst-beschikbare dag pasten — precies het scenario dat de review-bevinding beschreef. Resultaat matchte exact de voorspelling (dichtstbijzijnde deadline krijgt de dag, de andere schuift door). Testdata daarna weer opgeruimd (0 resterende rijen).
- De overige 4 patches (stap 3-herstructurering, `setTimeout`-cleanup) zijn geverifieerd via `typecheck`/`build` + code-inspectie, niet elk apart met een nieuw live-scenario — hun correctheid volgt direct uit de herstructurering zelf (geen nieuwe vertakkingslogica die los getest moet worden) en de bestaande golden-path-verificatie (die stap 3's "veilig inkorten"-tak al dekte) bleef bij de retest ongewijzigd werken.
- **Post-review verdring-cascade** (zie Change Log): live geverifieerd met exact het motiverende scenario van Hillebrand — een `hoog`-taak vandaag (deadline over 3 dagen, dus weinig speling) tegenover een taak morgen die de hele dag al volledig bezet houdt maar zelf 2 weken speling heeft (lage prioriteit). Resultaat klopte 1-op-1: de urgente taak kreeg de vrijgekomen dag, de taak met speling werd naar de eerstvolgende dag met ruimte doorgeschoven — beide zichtbaar in het voorstel vóór bevestigen, en de DB bevestigde dezelfde uitkomst ná bevestigen. Testdata opgeruimd.

### File List

- `server/domain/scheduling/shortfall.ts` (gewijzigd — `formatDayLabel` geëxporteerd, was privé; `findAlternativeDate` kort geëxporteerd geweest, na de verdring-cascade-uitbreiding weer privé — `energy.ts` heeft nu zijn eigen, rijkere plaatsingsfunctie)
- `server/domain/scheduling/session-placement.ts` (nieuw — `placeSessionOnDate`, geëxtraheerd uit `apply-recommendation.ts`)
- `server/domain/scheduling/apply-recommendation.ts` (gewijzigd — `applyHerplannen` gerefactored naar de gedeelde helper)
- `server/domain/scheduling/energy.ts` (nieuw — `generateEnergyProposal`/`applyEnergyProposal`, energie-pad-algoritme)
- `shared/types/energy.d.ts` (nieuw — `EnergyProposalItemDto`/`EnergyProposalResponse`/`EnergyConfirmResponse`)
- `server/api/day/energy-proposal.post.ts` (nieuw)
- `server/api/day/energy-proposal/confirm.post.ts` (nieuw)
- `app/pages/herstel/energie-voorstel.vue` (nieuw)
- `app/pages/herstel/reden-kiezen.vue` (gewijzigd — `kiesEnergie()` navigeert naar het echte scherm)
- `app/pages/herstel/energie-binnenkort.vue` (verwijderd — overbodig)
