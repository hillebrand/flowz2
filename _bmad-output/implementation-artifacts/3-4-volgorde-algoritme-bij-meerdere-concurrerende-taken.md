---
baseline_commit: ef263fe7edd03f781952d0a5f75bb7defd834973
---

# Story 3.4: Volgorde-algoritme bij Meerdere Concurrerende Taken

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want dat Flowz automatisch de juiste volgorde bepaalt als meerdere taken om dezelfde beschikbare tijd concurreren,
so that de belangrijkste/dringendste taken voorrang krijgen zonder dat ik dat zelf hoef te regelen.

## Acceptance Criteria

1. **Given** twee of meer taken hebben overlappende beschikbare tijd nodig op dezelfde dag, **when** de scheduling-engine de dagplanning berekent, **then** bepaalt ze de volgorde op basis van: urgentie (hoe weinig ruimte een taak nog heeft tot haar doelmoment), kans op uitloop (moeilijkheid × omvang), en prioriteit (FR25), **and** is deze berekening deterministisch (zelfde input → zelfde volgorde).

## Belangrijk: dit is een pure engine-story, geen UI, geen API-route

In tegenstelling tot Story 3.1-3.3 (allemaal uitbreidingen van het `/taak/nieuw`-formulier) heeft déze story **geen enkele consument**: Epic 4 (Werksessie Doorlopen) is nog volledig `backlog`, met name Story 4.1 "Hoofdscherm — Dagplanning & Eerstvolgende Taak" — dát is de story die deze volgorde-logica ooit gaat aanroepen vanuit een echt hoofdscherm. AD-3 is expliciet: *"De dag- en weekplanning (UJ-1, UJ-5) worden on-demand berekend uit Task + Session + Subtask + AvailableTime; een cache mag, maar nooit de autoritatieve bron zijn"* — er bestaat dus nog geen "dagplanning"-concept in de code, alleen los-per-taak-geplande `Session`-rijen (Story 3.1/3.2). Epics.md's eigen Implementation Notes voor Epic 3 zeggen het letterlijk: *"Bevat de kern-scheduling-engine (doelmoment, volgorde, idempotente herberekening) die door alle latere epics wordt hergebruikt — bewust hier gebouwd, niet als losse 'technische' epic."*

**Consequentie voor scope:** deze story bouwt uitsluitend een herbruikbare `server/domain/scheduling/`-functie die, gegeven een verzameling taken die op dezelfde dag een sessie hebben, die taken in de juiste volgorde teruggeeft. **Geen nieuwe API-route, geen nieuw formulier-veld, geen wijziging aan `findSessionDate`/`createTask`'s dag-selectie** (die blijft ongewijzigd — capaciteits-gebaseerd, zie Story 3.1). Een API-route zonder consument zou dode code zijn; die hoort bij Story 4.1 wanneer het hoofdscherm er daadwerkelijk is. Zeg het als je hier een andere aanname bij had (zie Open Questions).

## Tasks / Subtasks

- [x] Task 1: `server/domain/scheduling/ordering.ts` — de volgorde-functie (AC: #1)
  - [x] Nieuw bestand (geen bestaand bestand om uit te breiden — eerste inhoud van dit specifieke concept, naast het al bestaande `doelmoment.ts` in dezelfde map).
  - [x] **Lexicografische (getrapte) sortering, geen gewogen som** — FR25/PRD geven geen numerieke weegfactoren om urgentie/kans-op-uitloop/prioriteit onderling te combineren tot één score (zelfde situatie als Story 3.1's bufferformule, die ook geen PRD-cijfers had). Een gewogen-som-aanpak zou zulke cijfers móéten verzinnen (hoeveel "kans op uitloop" weegt op tegen hoeveel "prioriteit"?) zonder enige onderbouwing. Een getrapte sortering — eerst op urgentie, bij gelijkstand op kans op uitloop, bij gelijkstand op prioriteit, bij gelijkstand een deterministische tiebreaker — vermijdt dat probleem en is direct te herleiden tot FR25's opsomming. **Dit is een productbeslissing zonder objectief "juist" antwoord — zeg het vóór/na implementatie als je een gewogen-som-aanpak met specifieke cijfers bedoelde** (zie Open Questions).
  - [x] **Urgentie** = `doelmoment - vandaag` in dagen (hoe minder dagen, hoe urgenter → sorteert eerder). Bereken `doelmoment` door `calculateDoelmoment` (bestaand, `server/domain/scheduling/doelmoment.ts`) opnieuw aan te roepen met de taak's eigen opgeslagen `deadline`/`totalMinutes`/`difficulty`/`priority` + de user's actuele `averageDailyAvailableMinutes` — **niet** een ooit-opgeslagen doelmoment-waarde uitlezen, want die bestaat niet als kolom (Story 3.1 persisteerde 'm nooit, alleen de resulterende `sessionDate`). Consistent met AD-1/Story 3.5's aankomende "altijd uit actuele staat, nooit een tussentijds opgeslagen planningsstaat"-principe: hergebruik van de bestaande pure functie i.p.v. een nieuwe, mogelijk inconsistente berekening.
  - [x] **Kans op uitloop** = `moeilijkheid × omvang`, letterlijk uit FR25. `omvang` = `task.totalMinutes` (al server-gezaghebbend berekend, Story 3.2). `moeilijkheid` = een nieuwe, aan dít bestand lokale `DIFFICULTY_WEIGHT`-mapping (`laag: 1, gemiddeld: 2, hoog: 3`) — **bewust een aparte constante van `doelmoment.ts`'s `DIFFICULTY_ADJUSTMENT`** (die is een signed buffer-percentage-aanpassing, een ander doel/schaal; hergebruik zou toevallig werken maar semantisch verwarrend zijn). Hoe hoger de score, hoe eerder in de volgorde (grotere kans op uitloop = eerder aanpakken).
  - [x] **Prioriteit**: nieuwe lokale `PRIORITY_WEIGHT`-mapping (`laag: 1, gemiddeld: 2, hoog: 3`, zelfde redenering als hierboven — apart van `doelmoment.ts`'s `PRIORITY_ADJUSTMENT`). Hoger = eerder in de volgorde.
  - [x] **Tiebreaker**: `task.id` (string-vergelijking) als allerlaatste, deterministische stap — garandeert AC's "zelfde input → zelfde volgorde"-eis ook wanneer alle drie de factoren toevallig gelijk zijn (bv. twee taken met identieke deadline/moeilijkheid/prioriteit/omvang).
  - [x] Functiesignatuur: `sortByVolgorde(items: { task: Task, session: Session }[], today: string, avgDailyMinutes: number): { task: Task, session: Session }[]` — pure functie, geen eigen databasetoegang (testbaar zonder DB, zelfde stijl als `calculateBufferPercentage`/`calculateDoelmoment` in `doelmoment.ts`). Parameternaam bewust `avgDailyMinutes`, niet gelijk aan `doelmoment.ts`'s eigen async `averageDailyAvailableMinutes`-functienaam — voorkomt verwarring tussen "de async functie die dit ophaalt" en "de al opgehaalde waarde die hier binnenkomt".
- [x] Task 2: `server/data/tasks.ts` — data-laag voor "welke taken vallen op deze dag" (AC: #1)
  - [x] Nieuwe functie `getTasksWithSessionOnDate(userId: string, date: string): Promise<{ task: Task, session: Session }[]>` — join `tasks`+`sessions` op `sessions.taskId = tasks.id`, filter op `tasks.userId` en `substr(sessions.startsAt, 1, 10) = date` (zelfde datumvergelijkingstechniek als `sumPlannedMinutesForUserOnDate`/`createTaskAndSession` hierboven in ditzelfde bestand — het vaste 16:00 Europe/Amsterdam-anker ligt nooit dicht genoeg bij middernacht UTC om de datumgrens te kunnen overschrijden).
- [x] Task 3: Verificatie — puur op functieniveau, geen browser/curl (AC: #1)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] **Unit-achtige verificatie van `sortByVolgorde`** — 6 taken geconstrueerd via een los `tsx`-script (geen DB nodig, pure functie): Taak A (dichtbij deadline, klein) vs. Taak B (verre deadline, groot/moeilijk/hoge prioriteit) bevestigde dat urgentie vóór kans-op-uitloop/prioriteit gaat (A eerst, B laatst, ondanks B's veel hogere score op de andere twee factoren). Taken C/D (zelfde doelmoment, verschillende moeilijkheid/prioriteit) bevestigden dat kans-op-uitloop vóór prioriteit gaat (C vóór D, ondanks D's hogere prioriteit). Taken E/F (volledig identiek behalve `id`) bevestigden de tiebreaker (oplopend op `id`). Alle verwachtingen slaagden.
  - [x] **Live geverifieerd: `getTasksWithSessionOnDate` via een tijdelijke debug-route** (`server/api/_debug/ordering-test.get.ts`, nooit gecommit) — 3 echte taken aangemaakt met dezelfde deadline (2026-08-25), kleine `defaultSessionDuration` (10 min) en een expliciete `totalMinutesOverride` per taak, exact volgens het voorgestelde recept. Alle drie landden op dezelfde dag (2026-08-24, bevestigd via de database). De debug-route retourneerde de drie taken in de volgorde X (hoog/laag/200 min) → Z (gemiddeld/gemiddeld/100 min) → Y (laag/hoog/50 min) — met `avgDailyMinutes=77.14` hadden alle drie toevallig hetzelfde herberekende doelmoment (2026-08-24), dus besliste kans-op-uitloop (600 → 200 → 50) de volgorde, exact zoals verwacht (X's hogere kans-op-uitloop wint zelfs van Y's hogere prioriteit). Debug-route ná gebruik verwijderd, herdeployed, verwijdering bevestigd met een `404` op een geauthenticeerde request.
  - [x] Determinisme-check: `sortByVolgorde` twee keer aangeroepen met exact dezelfde input (incl. de E/F-taken met identieke deadline/moeilijkheid/prioriteit/omvang, alleen een andere `id`) → identieke output beide keren.
  - [x] Geen secrets/placeholder-waarden in code/commits. Alle testtaken (incl. hun echte Google Calendar-events) na verificatie opgeruimd.

### Review Findings

- [x] [Review][Patch] `urgentieDagen`/`calculateDoelmoment` werd binnen `Array.sort`'s comparator herhaaldelijk aangeroepen — voor `n` items O(n log n) keer i.p.v. één keer per taak, exact dezelfde taak telkens opnieuw herberekend [server/domain/scheduling/ordering.ts:54-67] — herschreven naar een Schwartzian transform: elke sorteersleutel (urgentie/kans-op-uitloop/prioriteit) één keer vooraf berekend, de comparator vergelijkt alleen nog de al-berekende sleutels. Geen prestatieprobleem bij de huidige schaal, maar dit is ook gewoon schonere code, ongeacht schaal — sluit Open Question #3. Her-geverifieerd: exact dezelfde volgorde/determinisme als vóór de refactor.
- [x] [Review][Patch] `TaskSession` was niet geëxporteerd, terwijl de story's eigen Dev Notes Story 4.1 als de beoogde toekomstige aanroeper noemt — die zou de vorm dan moeten dupliceren of op structurele typering leunen zonder 'm expliciet te kunnen importeren [server/domain/scheduling/ordering.ts:31-34] — nu geëxporteerd.
- [x] [Review][Dismiss] Geen enkele consument, geen gecommitte tests, verificatiescript/debug-route na gebruik verwijderd — dit is exact de story's eigen, uitgebreid gedocumenteerde scope-beslissing (zie "Belangrijk"-sectie bovenaan + Open Question #2): Epic 4/Story 4.1 is de enige beoogde aanroeper en is nog `backlog`. Geen testframework in dit project (projectbreed, herhaaldelijk gedocumenteerd sinds Story 1.2) — niet uniek aan deze story.
- [x] [Review][Dismiss] Geen doc-comment/runtime-validatie die afdwingt dat alle `items` dezelfde dag delen — toegevoegd als duidelijke precondition-comment bij de Schwartzian-refactor hierboven (geen runtime-assertie: dat zou `startsAt`-parsing in een verder pure functie introduceren voor een contractschending die alleen via een programmeerfout kan optreden, niet via gebruikersinvoer).
- [x] [Review][Dismiss] Structurele "duplicatie" tussen `getTasksWithSessionOnDate`'s inline `{ task: Task, session: Session }[]`-returntype en `ordering.ts`'s (nu geëxporteerde) `TaskSession` — TypeScript's structurele typering maakt dit al onschadelijk (geen risico op een type-mismatch); `data/tasks.ts` laten importeren uit `domain/ordering.ts` zou bovendien de architectuur se eenrichtings-afhankelijkheidspijl (routes → domain → data) omkeren, precies het probleem dat Story 3.1 al eens moest oplossen door gedeelde pure functies naar `shared/` te verplaatsen. Status-quo (twee structureel identieke, onafhankelijk gedeclareerde types) is hier de betere keuze dan beide alternatieven.
- [x] [Review][Dismiss] Uitgebreide rationale-commentaren in `ordering.ts` ("hoog commentaar-op-code-ratio") — dit is de consistente, doorgezette documentatiestijl van dit hele project (elk bestand sinds Story 1.2 legt niet-triviale product-/architectuurbeslissingen uit in commentaar), geen afwijking of nieuw probleem.
- [x] [Review][Dismiss] Tiebreaker (`task.id`-stringvergelijking) veronderstelt ASCII-UUID's — `crypto.randomUUID()` is de consistente, projectbrede ID-generatiemethode (elke tabel in `schema.ts`), een stabiele, gedocumenteerde API-garantie, geen fragiele aanname. Speculatief randgeval zonder huidig risico.
- [x] [Review][Dismiss] Geen rij-limiet op `getTasksWithSessionOnDate` — query is al beperkt tot één user se taken op één dag, realistisch nooit meer dan een handvol rijen; een limiet zou verdedigende code zijn voor een niet-bestaand schaalprobleem.
- [x] [Review][Dismiss] Een taak met meerdere sessies op dezelfde dag is niet expliciet getest — momenteel onbereikbaar (niets in de huidige codebase voegt een tweede `Session` toe aan een bestaande `Task`; dat is Epic 4/5's toekomstige sessie-runner/herplanning-taak), en het beschreven gedrag (beide rijen sorteren identiek, adjacent via sorteerstabiliteit) is sowieso redelijk als het ooit wél voorkomt.
- [x] [Review][Defer] Het join+`substr(startsAt,1,10)`-datumfilterpatroon staat nu drie keer onafhankelijk in `server/data/tasks.ts` (`createTaskAndSession`, `sumPlannedMinutesForUserOnDate`, `getTasksWithSessionOnDate`) — een gedeelde helper zou de "16:00 Amsterdam-anker kruist nooit UTC-middernacht"-aanname op één plek houden i.p.v. drie. Buiten scope voor déze story (zou de twee bestaande, al-gereviewde functies aanraken voor een bescheiden DRY-winst); wel een reëel toekomstig opruimpunt.

**Code review compleet (Blind Hunter + Acceptance Auditor, 2026-08-02):** Edge Case Hunter tweemaal gefaald op een transiënte infrastructuurfout (API-verbinding gestrand/gesloten midden-respons, niet inhoudelijk) — doorgegaan met de twee voltooide lagen, conform de skill se eigen fallback-instructie. 0 decision-needed, 2 patch, 1 defer, 7 als ruis afgewezen. Beide patches toegepast, typecheck + de unit-achtige verificatie opnieuw gedraaid (identieke volgorde/determinisme bevestigd na de Schwartzian-refactor).

## Dev Notes

### Waarom geen doelmoment-kolom, en waarom dat hier pas een probleem wordt

Story 3.1 berekent `doelmoment` puur als tussenstap richting `findSessionDate`'s dag-zoeklus — de waarde zelf wordt nooit op `Task` opgeslagen, alleen de uiteindelijke `session.startsAt` (die door capaciteitsdruk kan afwijken van het oorspronkelijke doelmoment, zie `findSessionDate`'s terugwaartse zoeklus). Voor déze story, die "hoe weinig ruimte tot doelmoment" nodig heeft vóór elke taak, is herberekenen via de bestaande `calculateDoelmoment`-functie (met de taak's eigen opgeslagen velden) de AD-1-consistente keuze — geen nieuwe kolom, geen risico op een stale opgeslagen waarde die niet meer klopt zodra bijvoorbeeld het weekpatroon wijzigt.

### Architectuurcompliance

- AD-1 (scheduling server-only) — deze hele story leeft in `server/domain/scheduling/`, niets clientside.
- AD-3 (planning is een berekende weergave) — `sortByVolgorde`/`getTasksWithSessionOnDate` zijn beide read-only/computed, muteren niets. Geen enkele bestaande sessie wordt verplaatst of herschreven door deze story (dat zou een "bump"-mechanisme vereisen dat noch de AC noch de architectuur op dit moment vraagt — de AC gaat over de vólgorde binnen een dag, niet over het herverdelen van dagen).
- Mutatie-ownership-regel — niet van toepassing, geen mutaties in deze story.
- NFR7 (scheduling-logica uitsluitend server-side) — bevestigd, geen client-berekening.

### Project Structure Notes

`server/domain/scheduling/ordering.ts` is nieuw, naast het bestaande `doelmoment.ts` in dezelfde map — geen nieuwe top-level map nodig. `server/data/tasks.ts` krijgt er één functie bij, zelfde bestand als Story 3.1/3.2/3.3's andere `tasks`-datafuncties.

### Testen

Geen testframework in dit project (herhaaldelijk genoteerd sinds Story 1.2, zie `deferred-work.md`). Omdat deze story geen UI/API heeft, is de verificatie dit keer geen curl/sealed-cookie/browser-sessie, maar: een puur in-process Node-script voor Task 1's pure sorteerfunctie (geen DB nodig), en een **tijdelijke, nooit-gecommitte debug-route** voor Task 2's DB-lezende functie (zie hieronder — géén los `sst shell -- node`-script, dat werkt hier niet).

### `server/data/`-modules zijn niet los van Nitro te draaien (herhaalde les, fresh-context-validatiepas)

`getDb()` (`server/data/db.ts`) roept `useRuntimeConfig()` aan — een Nitro-auto-import die niet bestaat in een los `sst shell -- node script.mjs`-proces (geeft een `ReferenceError`). Dit is al drie keer eerder vastgesteld en gedocumenteerd (Story 1.2, Story 2.3, Story 3.1's Previous Story Intelligence) maar 3.2/3.3 hadden dit niet nodig (die verifieerden via echte HTTP-routes). Voor déze story, die voor het eerst sinds 3.1 weer databasegebonden verificatie zonder bestaande HTTP-route nodig heeft: bouw een tijdelijke `server/api/_debug/*`-route (zelfde patroon als Story 1.2/2.3), roep 'm aan met een zelf-verzegelde sessiecookie, verwijder 'm ná gebruik en bevestig de verwijdering met een `404`-check.

## Previous Story Intelligence (Story 3.3, inclusief de code review, + herhaalde lessen uit Story 1.2/2.3/3.1)

- **`server/data/`-modules zijn niet los van Nitro te draaien** — zie Dev Notes hierboven; deze les werd door Story 3.3's eigen Previous-Story-Intelligence-sectie gemist (die alleen naar 3.2 keek) omdat 3.2/3.3 'm toevallig niet nodig hadden. Hier expliciet weer meegenomen vóórdat het opnieuw een reviewbevinding wordt.
- **Server is altijd gezaghebbend, herbereken vanuit actuele staat i.p.v. een opgeslagen tussenwaarde te vertrouwen** — direct toegepast op de doelmoment-herberekenings-keuze hierboven (Dev Notes), i.p.v. achteraf als reviewbevinding.
- **Race-condities in async paden grondig doordenken vóór implementatie** — niet van toepassing hier (deze story heeft geen async UI-interactie, puur server-side berekeningen binnen één request/script-aanroep), maar de onderliggende discipline (exact naslaan wat de code écht doet, niet aannemen) is waarom Task 3 hierboven een expliciete determinisme-check bevat i.p.v. dat losjes aan te nemen.
- **Gedeelde/herbruikbare functies boven lokale duplicatie** — `calculateDoelmoment`/`averageDailyAvailableMinutes` worden hier hergebruikt, niet opnieuw geïmplementeerd, zelfde les als Story 3.2/3.3's `SubtaskInput`/`CreateTaskInput`-duplicatiebevindingen.
- **Live verifiëren vóórdat iets als "klaar" geldt** — Story 3.3's Debug Log illustreerde waarom; hier ingevuld met een debug-route-gebaseerde verificatie ondanks het ontbreken van een UI (Task 3).

## Git Intelligence

Laatste commit: `ef263fe` (Story 3.3 incl. code review). Patroon blijft: kleine, gerichte commits per taaklaag; ditmaal geen schema-migratie (geen nieuwe kolommen/tabellen nodig) en geen front-end-taak — de kortste Epic 3-story tot nu toe qua bestandenaantal.

## References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 366-378 (Story 3.4's User Story + AC, brontekst), regel 66 (FR25), regel 79 (NFR7), regel 306 (Epic 3 Implementation Notes — "kern-scheduling-engine... hergebruikt door alle latere epics")
- [Source: _bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md] — regel 26 (FR25's brontekst in de PRD, identiek aan epics.md)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md] — AD-1, AD-3 (planning is een berekende weergave)
- [Source: server/domain/scheduling/doelmoment.ts] — bestaande `calculateDoelmoment`/`averageDailyAvailableMinutes`/`findSessionDate`, hergebruikt resp. ongewijzigd gelaten door deze story
- [Source: _bmad-output/implementation-artifacts/3-1-taak-aanmaken-kerngegevens-met-doelmoment-berekening.md] — oorspronkelijke bufferformule-Open-Question, zelfde patroon hier gevolgd voor de volgorde-formule

## Open Questions

1. **Lexicografische sortering (urgentie → kans op uitloop → prioriteit → task-id) i.p.v. een gewogen-som-formule** (zie Task 1) — geen PRD-cijfers om anders te onderbouwen. Zeg het als je specifieke gewichten/een andere combinatiemethode bedoelde.
2. **Geen API-route/UI in deze story** (zie bovenaan) — bewuste keuze omdat Epic 4/Story 4.1 nog `backlog` is en de enige beoogde consument wordt. Zeg het als je 'm liever nu al aan een (tijdelijke) route hangt.
3. **Urgentie herberekend via `calculateDoelmoment`, niet uit een opgeslagen waarde** (zie Dev Notes) — consistent met AD-1, maar betekent wel een extra `averageDailyAvailableMinutes`-aanroep per vergeleken taak. Geen prestatieprobleem bij de huidige schaal (enkele taken per dag), zeg het als je hier al aan grotere schaal dacht.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-02 | Story aangemaakt via create-story, voortbouwend op Story 3.3 (done). Fresh-context-validatiepas vond en fixte vóór dev-story begon: Task 2/3 gingen ervan uit dat een los `sst shell -- node`-script `getTasksWithSessionOnDate` kon aanroepen — `getDb()` roept echter `useRuntimeConfig()` aan, een Nitro-auto-import die daar niet werkt (herhaalde les uit Story 1.2/2.3/3.1, gemist doordat Story 3.3's Previous-Story-Intelligence 'm niet meenam). Gecorrigeerd naar een tijdelijke debug-route, zelfde patroon als Story 1.2/2.3. Ook een naamgevings-nitpick opgelost (`avgDailyMinutes`-parameter i.p.v. dezelfde naam als `doelmoment.ts`'s async functie). |
| 2026-08-02 | Task 1 (`server/domain/scheduling/ordering.ts`) en Task 2 (`getTasksWithSessionOnDate`) afgerond: lexicografische sortering (urgentie → kans op uitloop → prioriteit → `task.id`-tiebreaker), urgentie herberekend via de bestaande `calculateDoelmoment`. Typecheck slaagt. |
| 2026-08-02 | Task 3 (verificatie) afgerond: `sortByVolgorde` unit-achtig getest met 6 geconstrueerde taken (elke factor afzonderlijk bevestigd, incl. determinisme), `getTasksWithSessionOnDate` live geverifieerd tegen de dev-stage via een tijdelijke debug-route met 3 echte taken die (bedoeld) op dezelfde dag landden — de teruggegeven volgorde klopte exact met de handmatig berekende verwachting. Debug-route en alle testdata (incl. Google Calendar-events) opgeruimd, verwijdering bevestigd met een `404`. Status → review. |
| 2026-08-02 | Formele code review (Blind Hunter + Acceptance Auditor — Edge Case Hunter tweemaal gefaald op een transiënte infrastructuurfout, doorgegaan met de twee voltooide lagen conform de skill se fallback): 0 decision-needed, 2 patch, 1 defer, 7 als ruis afgewezen (grotendeels herhalingen van de story's eigen, al gedocumenteerde scope-beslissingen). Beide patches toegepast: `sortByVolgorde` herschreven naar een Schwartzian transform (elke sorteersleutel één keer vooraf berekend i.p.v. herhaaldelijk in de comparator, sluit Open Question #3), `TaskSession` geëxporteerd voor Story 4.1's toekomstig gebruik. Typecheck en de unit-achtige verificatie opnieuw gedraaid — identieke volgorde/determinisme bevestigd na de refactor. Status → done. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Fresh-context-validatiepas vond een herhaalde, al drie keer eerder gedocumenteerde les vóór dev-story begon**: `server/data/`-modules zijn niet los van Nitro te draaien (`useRuntimeConfig()`-`ReferenceError` buiten een echt Nitro-proces). Story 3.2/3.3 hadden dit toevallig niet nodig (verificatie via echte HTTP-routes), waardoor hun Previous-Story-Intelligence-secties de les niet doorgaven. Voorkomen door de story vooraf te corrigeren i.p.v. het tijdens dev-story opnieuw te ontdekken.
- **Live-verificatie bevestigde de volgorde-berekening exact**: drie taken met bewust verschillende moeilijkheid/prioriteit/omvang maar (onbedoeld, door een toevallige `avgDailyMinutes`-waarde) identiek herberekend doelmoment — precies het scenario waarin kans-op-uitloop de beslissende factor wordt. De teruggegeven volgorde (X → Z → Y, aflopend op kans-op-uitloop) bevestigde zowel de kans-op-uitloop-berekening als dat urgentie-gelijkstand correct doorvalt naar de volgende factor, in de echte omgeving, niet alleen in het geïsoleerde unit-achtige script.

### Completion Notes List

- **AC #1 is end-to-end geverifieerd, zowel unit-achtig (geïsoleerde `sortByVolgorde`-scenario's per factor) als live tegen de dev-stage** (echte taken, echte `calculateDoelmoment`-herberekening, echte capaciteits-plaatsing).
- **Scope strak gehouden conform de story's eigen "geen UI/API-route"-beslissing**: geen nieuwe route, geen wijziging aan `createTask`/`findSessionDate` — puur een nieuwe, herbruikbare domain-functie + databasequery, klaar voor Epic 4/Story 4.1 om aan te roepen zodra die er is.
- **Drie Open Questions blijven open voor Hillebrand** (lexicografische sortering vs. gewogen som, geen API-route nu, herberekenen i.p.v. opslaan) — geen van alle blokkeerde de implementatie.

### File List

**Nieuw:**
- `server/domain/scheduling/ordering.ts`

**Gewijzigd:**
- `server/data/tasks.ts` (nieuwe `getTasksWithSessionOnDate`)

**Live gedeployed:** stage `dev` op `flowz.fyi`. Tijdelijke debug-route (`server/api/_debug/ordering-test.get.ts`) en verificatiescripts zijn ná gebruik verwijderd en horen niet bij deze File List. Geen schema-migratie nodig (geen nieuwe kolommen/tabellen).
