---
baseline_commit: c091c95
---

# Story 8.2: Handmatige Verplaatsing Overnemen

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want dat een door mij handmatig verplaatst huiswerk-event wordt overgenomen in de planning,
so that ik niet naar Flowz hoef om te verplaatsen.

## ⚠️ Belangrijk: dit bouwt op Story 8.1's spike, niet op de oorspronkelijke research-schets

Story 8.1 (alleen-lezen detectie-spike, `done`) heeft de infrastructuur al gebouwd én live geverifieerd: kanaal-registratie/-hernieuwing/-teardown, webhook-ontvangst, `syncToken`-diff, en de `ECHO`/`EXTERNAL-CHANGE`-detectielogica (`server/cron/calendar-watch-tick.ts`). Story 8.1's code review (Opus 5, 2026-09-13) heeft daarna 14 patches doorgevoerd — deze story bouwt op de **gepatchte** staat, niet op de oorspronkelijke schets. Belangrijkste dingen die al bestaan en hergebruikt worden:

- `logEventDiff` (`server/cron/calendar-watch-tick.ts`) logt momenteel alleen `ECHO`/`EXTERNAL-CHANGE`/`DELETED` — **deze story voegt de daadwerkelijke mutatie toe** aan het `EXTERNAL-CHANGE`-pad (en, voor Beslissing D hieronder, het `DELETED`-pad). Nooit meer sessions/tasks aanraken in het `ECHO`-pad — dat blijft ongewijzigd een no-op.
- `getHomeworkBlockByGoogleEventId(userId, googleEventId)` (`server/data/homework-blocks.ts`) — al `userId`-gescoped sinds de code review, geeft de bestaande `homeworkCalendarBlocks`-rij terug (met `date`, `startsAt`, `endsAt`) die bij het gewijzigde Google-event hoort.
- De teardown/registratie-routes (`server/api/calendar/homework-watch/register.{post,delete}.ts`) blijven ongewijzigd — dit story raakt ze niet.
- `stopWatchChannel`/`calendarRequestMetVerversing` (`server/domain/calendar-sync/homework-events.ts`) — herbruikbaar voor eventuele extra Calendar-aanroepen, waarschijnlijk niet nodig voor déze story (er wordt niets terug naar Calendar geschreven — zie Beslissing E).

**Wat dit betekent voor de implementatie:** deze story is de eerste die daadwerkelijk `sessions`/`tasks` muteert vanuit het Cron-pad. De scope-grens uit Story 8.1 ("nooit sessions/tasks aanraken") geldt dus niet langer onvoorwaardelijk — wél nog steeds: **uitsluitend** via de hieronder beschreven, expliciete regels, nooit een ad-hoc aanpassing die niet in deze story's Tasks staat.

## Acceptance Criteria

1. **Given** Evelien verplaatst een huiswerk-event handmatig in Google Calendar naar een nieuwe tijd die binnen een beschikbaar-tijd-blok valt en niet overlapt met een andere sessie, **when** de volgende Cron-tick dit als `EXTERNAL-CHANGE` detecteert, **then** wordt de bijbehorende `sessions`-rij bijgewerkt naar de nieuwe tijd, gemarkeerd met `manuallyPlacedAt` (nieuw tijdstip-veld), en wordt de bijbehorende `homeworkCalendarBlocks`-rij meteen mee-bijgewerkt (geen wachten op een volgende, ongerelateerde sync-trigger).
2. **Given** een taak heeft een sessie met `manuallyPlacedAt` gezet, **when** een van de vier bestaande stille herplan-lussen (`server/domain/scheduling/startup-check.ts`) draait, **then** wordt die specifieke sessie behandeld volgens de regels in "Beslissing A" hieronder (per lus een aparte regel) — nooit stilzwijgend overschreven door `recalculateTaskPlanning`'s reguliere "regenereer de hele reeks"-gedrag.
3. **Given** Evelien verplaatst een huiswerk-event naar een tijd die buiten een beschikbaar-tijd-blok valt, overlapt met een andere sessie, of in het verleden ligt, **when** de Cron-tick dit detecteert, **then** wordt de verplaatsing **niet** overgenomen (geen `manuallyPlacedAt`, geen `sessions`-wijziging) — de volgende reguliere write-sync (`syncHomeworkBlocksForDate`, ongewijzigd bestaand gedrag) zet het Calendar-event terug naar Flowz' eigen tijd — én wordt dit zichtbaar gelogd in de wijzigingslog (i-dialoog, Story 6.8) met een duidelijke, schuldvrije reden.
4. **Given** Evelien verwijdert een huiswerk-event volledig in Google Calendar, **when** de Cron-tick dit als `DELETED` detecteert voor een bij Flowz bekend blok, **then** valt de bijbehorende taak terug op automatische herplanning (`recalculateTaskPlanning`, alsof de sessie nooit had bestaan) — de taak vervalt niet, en de eerstvolgende reguliere write-sync herstelt een nieuw Calendar-event op de nieuw berekende tijd.
5. **Given** Evelien wijzigt alleen de titel van een huiswerk-event (tijd ongewijzigd), **when** de Cron-tick dit detecteert, **then** wordt dit **niet** overgenomen in de taak-titel — Flowz blijft bron van waarheid voor de titel; de volgende write-sync zet 'm terug (bestaand AD-7-gedrag, ongewijzigd door deze story).
6. **Given** een `manuallyPlacedAt`-sessie wordt overgenomen, geweigerd (AC #3), of vervangen na een verwijdering (AC #4), **when** Evelien/Hillebrand de i-dialoog naast de "↻ Herplannen"-knop opent (Story 6.8), **then** toont die dialoog hierover een duidelijke, schuldvrije regel — dezelfde lees-route/dialoog, geen nieuwe UI (zie Beslissing C).
7. **Given** een weigering zoals in AC #3 heeft plaatsgevonden en Evelien/Hillebrand heeft de i-dialoog nog niet geopend sinds die weigering, **when** de "↻ Herplannen"-knop (Home/weekoverzicht) getoond wordt, **then** kleurt het i-icoon ernaast rood (in plaats van de neutrale kleur) — dit blijft zo, ook na een pagina-herlaad, totdat de dialoog geopend is (server-bijgehouden, niet client-only). **Given** de dialoog wordt vervolgens geopend, **when** de weigering-regel daarin zichtbaar wordt, **then** kleurt het i-icoon terug naar neutraal en blijft dat zo bij een volgend bezoek (tot een nieuwe weigering).

[Source: _bmad-output/planning-artifacts/epics.md, regels 951-976 (Epic 8/Story 8.2, FR33); _bmad-output/planning-artifacts/research/technical-google-calendar-tweewegs-synchronisatie-voor-huiswerk-blokken-research-2026-09-12.md, secties "Databeslissing: bevroren/pinned sessie", "Datamodel-wijzigingen", "Gefaseerde opbouw" (Fase 2); _bmad-output/implementation-artifacts/8-1-alleen-lezen-detectie-spike.md (baseline-infrastructuur + code-review-bevindingen)]

## ⚠️ Product-beslissingen — PROPOSED, ter bevestiging bij create-story-afronding

De vijf productbeslissingen die het onderzoek (Research Synthesis, "Vóór fase 2 moeten deze productbeslissingen expliciet bevestigd worden") als openstaand markeerde, zijn hierboven in de AC's al met een **concreet voorstel** verwerkt — niet als onopgeloste vraag doorgeschoven naar de dev-agent. Hillebrand bevestigt deze (of stelt bij) vóórdat `bmad-dev-story` op deze story start:

**Beslissing A — `manuallyPlacedAt`-regel per herplan-lus** (onderzoek se voorstel, ongewijzigd overgenomen):

| Lus | Gedrag bij een `manuallyPlacedAt`-sessie |
|---|---|
| `runPastSessionReplanLoop` | **Negeren** (skip de hele taak, zelfde task-level-uitsluitingspatroon als `lastHeartbeatAt` — zie Dev Notes) — een handmatig geplaatste sessie in het verleden is een bewuste keuze van Evelien. |
| `runOverlappingSessionReplanLoop` | Bij een overlap tussen een gepinde en een niet-gepinde sessie: **de niet-gepinde taak wordt de kandidaat om te herberekenen, nooit de gepinde.** Overlappen twee gepinde sessies met elkaar: geen automatische correctie, wel een wijzigingslog-signaal ("deze twee overlappen, pas zelf aan in Calendar of Flowz"). |
| `runShortfallReplanLoop` / `runOutOfBlockReplanLoop` | De gepinde sessie telt gewoon mee als bezette tijd voor andere taken, maar de **taak met de gepinde sessie wordt zelf niet als kandidaat voorgesteld** door déze twee lussen — skip de hele taak (task-level, zelfde reden als bij `runPastSessionReplanLoop`). |

**Beslissing B — ongeldige verplaatsing (buiten blok / overlap / verleden) → weigeren, niet aanpassen, mét een opvallend signaal** (AC #3, #7 — **uitgebreid op verzoek van Hillebrand, 2026-09-13**): geen `manuallyPlacedAt` zetten, geen `sessions`-wijziging. De bestaande write-sync-flow (`syncHomeworkBlocksForDate`) zet het Calendar-event bij de volgende trigger gewoon terug — exact het al-bestaande AD-7-gedrag ("Flowz overschrijft/hermaakt het event gewoon"), hier bewust ongewijzigd benut i.p.v. een nieuw afwijs-mechanisme te bouwen. Een weigering is voor Evelien potentieel verwarrend (ze verplaatste iets, en het "sprong terug") — daarom moet dit **opvallender** zijn dan de bestaande, neutrale i-dialoog-vermelding: het i-icoon naast de "↻ Herplannen"-knop kleurt **rood** zodra er een ongelezen weigering is, en blijft dat (ook na herlaad, dus server-bijgehouden, geen client-only state) totdat de dialoog geopend wordt. Zie Beslissing C voor het onderliggende mechanisme.

**Beslissing C — wijzigingslog-integratie + ongelezen-weigering-indicator** (herzien tijdens implementatie, 2026-09-13 — zie onderaan waarom de oorspronkelijke versie van deze beslissing niet klopte): twee nieuwe `LoopSource`-waarden — `'manual_accepted'` (AC #1/#4) en `'manual_rejected'` (AC #3) — naast de bestaande `'past' | 'overlap' | 'shortfall' | 'out_of_block'` (`shared/types/replan-log.d.ts`). Twee losse waarden i.p.v. één `'manual'`: nodig om Beslissing B's rode-icoon-logica precies op de weigering te kunnen richten (loste ook de oorspronkelijke Open Question "één of twee waarden" op).

**Waarom de Cron-schrijfacties NIET via `recordReplanRun`/`replanRuns` lopen (afwijking van het oorspronkelijke voorstel):** `getLatestReplanLogEntriesForUser` (Story 6.8) toont uitsluitend de entries van "de meest recente `replanRuns`-rij". `runStartupReplanCheck` (Story 6.7) schrijft daar een rij bij élke Home-load. De Cron-tick draait elke ~2 minuten, veel vaker dan Evelien de app opent. Zou de Cron-handler ook via `recordReplanRun` een `replanRuns`-rij schrijven, dan is "de meest recente run" bij elke volgende Home-load bijna altijd een (lege) Cron-tick-run i.p.v. die Home-load se eigen automatische-herplan-run — een regressie op Story 6.8's AC #2/#3 (de bestaande i-dialoog zou dan meestal "Niets aangepast" tonen, zelfs als de opstart-check net wél iets herplande). **Fix:** de Cron-handler schrijft `replanChangeLog`-rijen met een lokaal gegenereerde `runId` (`crypto.randomUUID()`) die NOOIT in `replanRuns` terechtkomt — dat houdt "de meest recente automatische run" voor Story 6.8's bestaande gedrag volledig onaangetast.

**Hoe manual-entries dan wél zichtbaar worden:** `server/data/replan-log.ts` krijgt een nieuwe functie die, onafhankelijk van `replanRuns`, alle `replanChangeLog`-rijen met `loopSource IN ('manual_accepted', 'manual_rejected')` ophaalt die nog niet gelezen zijn (`createdAt` ná `users.lastReadManualRejectionAt`, of ná niets als die kolom `null` is). `getLatestReplanLogEntriesForUser`'s aanroeper (`GET /api/scheduling/replan-log/latest`) combineert dit resultaat met de bestaande "laatste automatische run"-entries tot één lijst (AC #6) — de dialoog toont dus altijd beide, ongeacht hoeveel Home-loads er tussen de Cron-mutatie en het openen van de dialoog in zaten.

**Nieuw voor het rode-icoon-mechanisme (server-bijgehouden, AC #7):**
- Nieuwe kolom `users.lastReadManualRejectionAt` (nullable timestamp) — bepaalt zowel welke manual-entries "ongelezen" zijn (hierboven) als het rode icoon.
- `GET /api/scheduling/replan-log/latest` krijgt een extra veld `hasUnreadRejection: boolean` in de respons (`ReplanLogResponse`) — `true` als er, binnen de ongelezen manual-entries hierboven, minstens één `loopSource = 'manual_rejected'` is.
- Nieuwe route `POST /api/scheduling/replan-log/mark-rejection-read` — zet `users.lastReadManualRejectionAt` op nu (dit "leest" zowel `manual_accepted` als `manual_rejected`-entries, ondanks de naam die zich op AC #7 richt — bijvangst, geen probleem: een gelezen accepted-melding hoeft niet apart getrackt te worden). Aangeroepen door `ReplanLogDialog.vue` zodra de dialoog geopend wordt (ná een succesvolle load van de entries, best-effort/fire-and-forget, zelfde precedent als andere niet-kritieke nevenacties in dit project).
- `ReplanLogDialog.vue` roept de leesroute nu ook **bij mount** aan (niet alleen bij openen) om `hasUnreadRejection` te weten vóór er geklikt is — het i-icoon moet immers al rood zijn zonder dat de dialoog ooit open is geweest.

**Beslissing D — verwijderd event → terugvallen op automatische herplanning, taak niet laten vervallen** (AC #4): sluit aan bij hoe elke andere stille herplan-lus al werkt (nooit werk laten verdwijnen, altijd een geldig alternatief plannen). Een taak volledig laten vervallen bij een verwijderd Calendar-event zou een onomkeerbare actie zijn op basis van een ambigue signaal (verwijderen kan ook "even wegklikken" betekenen, niet "annuleren").

**Beslissing E — titel-wijziging wordt niet overgenomen** (AC #5): Flowz blijft bron van waarheid voor vak/titel (ongewijzigd t.o.v. vandaag) — alleen `startsAt`/`endsAt` worden ooit uit Calendar gelezen.

## Tasks / Subtasks

- [x] **Task 1: Datamodel** (AC #1, #2, #7)
  - [x] Nieuwe kolom `sessions.manuallyPlacedAt` (text, nullable, ISO-tijdstip) — `server/data/schema.ts`.
  - [x] Nieuwe kolom `users.lastReadManualRejectionAt` (text, nullable, ISO-tijdstip) — Beslissing C/AC #7.
  - [x] `npx sst shell --stage dev -- npx drizzle-kit generate` (`0026_overconfident_arachne.sql`) + `migrate` — beide geslaagd tegen de dev-database.
  - [x] `shared/types/replan-log.d.ts`: `LoopSource` uitgebreid met `'manual_accepted'` en `'manual_rejected'`. `ReplanLogResponse` heeft nu `hasUnreadRejection: boolean`. `LOOP_REASONS`-record (`server/domain/scheduling/startup-check.ts`) uitgebreid met teksten voor beide nieuwe waarden. Noot: dit maakt `latest.get.ts` tijdelijk niet-compilerend (`hasUnreadRejection` ontbreekt in de respons) — opgelost in Task 1b, dat de daadwerkelijke berekening implementeert; bewuste, kortlevende tussenstap binnen deze aaneengesloten implementatiesessie, geen afgerond-gerapporteerde task met een kapotte build.

- [x] **Task 2: Mutatielogica in de Cron-handler** (AC #1, #3, #4, #5)
  - [x] `server/cron/calendar-watch-tick.ts`: `EventsListItem` uitgebreid met `start`/`end`.
  - [x] Nieuwe `findTaskAndSessionForBlock`/`acceptOrRejectManualMove`/`acceptDeletion`/`logManualEntry`-helpers. `acceptOrRejectManualMove` valideert (verleden-check, `getAvailableBlocksForDate`, `sessionsOverlap` — geëxporteerd uit `startup-check.ts`, parametertype verbreed) en muteert geldig binnen `withSessionPlacementLocks`, of weigert (alleen loggen) bij een ongeldige nieuwe tijd. `acceptDeletion` roept `recalculateTaskPlanning` rechtstreeks aan (GEEN eigen lock-wrap — die functie regelt haar eigen locking al intern, zelfde precedent als de vier bestaande herplan-lussen).
  - [x] `updateSessionPlacement` (`server/data/tasks.ts`) uitgebreid met optionele `manuallyPlacedAt`; `updateHomeworkBlockTimes` (`server/data/homework-blocks.ts`) uitgebreid met optionele `date` (een verplaatsing naar een andere dag moet het blok se `date`-kolom meenemen, anders raakt die uit sync met `startsAt`).
  - [x] Wijzigingslog-rijen via `insertReplanLogEntries`, met een lokaal gegenereerde `runId` (`crypto.randomUUID()`) die NOOIT in `replanRuns` komt (zie Beslissing C).
  - [x] `npm run typecheck` groen voor deze wijzigingen (de resterende fout in `latest.get.ts` — `hasUnreadRejection` ontbreekt — is de bekende, bewuste tussenstap uit Task 1, opgelost in Task 1b).

- [x] **Task 1b: Ongelezen-manual-entries + rode i-icoon** (AC #6, #7, Beslissing B/C)
  - [x] `server/data/replan-log.ts`: nieuwe `getUnreadManualLogEntriesForUser(userId)`, los van `replanRuns`. Grouping-logica hergebruikt via nieuwe gedeelde `groupByTaskAndLoopSource`-helper (ook door `getLatestReplanLogEntriesForUser` gebruikt, gedrag ongewijzigd).
  - [x] `server/data/users.ts`: `updateLastReadManualRejectionAt(userId, timestamp)`.
  - [x] Nieuwe route `server/api/scheduling/replan-log/mark-rejection-read.post.ts` (auth-gated, POST).
  - [x] `latest.get.ts`: combineert automatische-run-entries + ongelezen manual-entries tot één lijst, plus `hasUnreadRejection`.
  - [x] `app/components/ReplanLogDialog.vue`: `onMounted` haalt `hasUnreadRejection` op vóór een klik; `.replan-log-info-button--unread` (hergebruikt bestaande `--color-danger`-token) kleurt het icoon rood; `open()` markeert optimistisch als gelezen. `npm run typecheck` volledig groen.

- [x] **Task 3: `manuallyPlacedAt` respecteren in de vier stille herplan-lussen** (AC #2, Beslissing A)
  - [x] `findTaskWithPastIncompleteSession`: task-level uitsluiting, zelfde patroon als `lastHeartbeatAt`.
  - [x] `findTaskWithOverlappingSession`: bij een overlappend paar wint de gepinde sessie altijd (de niet-gepinde taak wordt kandidaat); bij twee gepinde sessies: geen kandidaat, wel een `logManualOverlapSignal`-wijzigingslogregel (`loopSource: 'overlap'`).
  - [x] `findTaskWithSessionOutsideAvailableBlock`: task-level uitsluiting (checkt ALLE sessies van de taak, niet alleen de offending sessie).
  - [x] `runShortfallReplanLoop`: filtert `herplanRecommendations` op taken met een gepinde sessie vóór toepassing (aan de toepassingskant, `detectAnyShortfall`/`shortfall.ts` zelf ongewijzigd — bekende restbeperking gedocumenteerd in de code-comment: een tekort uitsluitend door een gepinde sessie kan de iteratiegrens uitputten, geen datacorruptie).
  - [x] `sessionsOverlap` geëxporteerd uit `startup-check.ts` (hergebruikt door Task 2). `npm run typecheck` groen.

- [ ] **Task 4: Live-verificatie**
  - [ ] Deploy naar `dev`. Test AC #1 (geldige verplaatsing), AC #3 (buiten blok/overlap/verleden — kies minstens één van de drie live te testen, de andere twee via codepad-inspectie), AC #4 (event verwijderen), AC #5 (titel-wijziging) tegen de échte Calendar, met hetzelfde testaccount/kanaal-patroon als Story 8.1 (`POST /api/calendar/homework-watch/register`).
  - [ ] Bevestig AC #2 door een taak met een `manuallyPlacedAt`-sessie te laten meedraaien in minstens één van de vier lussen (bv. via de "↻ Herplannen"-knop) en te controleren dat de regel uit Beslissing A daadwerkelijk wordt toegepast.
  - [ ] Bevestig AC #6: i-dialoog toont de nieuwe `'manual_accepted'`/`'manual_rejected'`-regels correct, met een leesbare, schuldvrije tekst.
  - [ ] Bevestig AC #7: na een geweigerde verplaatsing kleurt het i-icoon rood zonder dat de dialoog geopend is (nieuwe paginalaad simuleren), blijft rood tot de dialoog geopend wordt, en kleurt daarna terug naar neutraal — ook na een volgende paginalaad (server-bijgehouden, niet client-only).

- [ ] **Task 5: Rapportage**
  - [ ] Completion Notes: welke AC's live bevestigd, welke alleen via codepad-inspectie (en waarom dat voldoende was), eventuele afwijkingen t.o.v. Beslissing A-E met motivatie.

## Dev Notes

### Bestaande code die deze story raakt (lezen vóór implementatie)

- **`server/domain/scheduling/recalculate.ts`** (`recalculateTaskPlanning`) — regenereert bij élke aanroep de VOLLEDIGE toekomstige sessiereeks van een taak (herbouwt vanaf `planSessionSlots`), en behoudt alleen de sessie met de kleinste `startsAt` (in-place herpositioneerd), de rest wordt verwijderd/opnieuw ingevoegd. **Kernconsequentie voor deze story:** deze functie heeft geen enkel mechanisme om één specifieke sessie "met rust te laten" — het aanroepen ervan voor een taak met een `manuallyPlacedAt`-sessie zou die pin gegarandeerd vernietigen, ongeacht welke sessie het "probleem" was. Dit is exact dezelfde klasse bug die Story 6.8's code review al vond voor `lastHeartbeatAt` (zie hieronder) — de oplossing is dezelfde: task-level uitsluiting VOORDAT `recalculateTaskPlanning` ooit aangeroepen wordt voor die taak, niet een aanpassing binnen `recalculateTaskPlanning` zelf.
- **`server/domain/scheduling/startup-check.ts`** — de vier `find*`-functies (`findTaskWithPastIncompleteSession` regel ~198, `findTaskWithOverlappingSession` regel ~258, `findTaskWithSessionOutsideAvailableBlock` regel ~377) selecteren welke taak als kandidaat voor `recalculateTaskPlanning` wordt voorgesteld. `findTaskWithPastIncompleteSession` sluit al taken uit met een sessie die `lastHeartbeatAt` heeft (Story 6.8's code review, task-level — zie de comment bij die functie voor de exacte redenering) — Task 3 van déze story voegt een vergelijkbare `manuallyPlacedAt`-uitsluiting toe, zelfde patroon, andere kolom. `runShortfallReplanLoop` (regel ~317) haalt zijn kandidaten via `detectAnyShortfall`/`generateShortfallRecommendations` (`shortfall.ts`) — die kandidaatselectie moet ook `manuallyPlacedAt` respecteren, niet alleen `findTaskWithSessionOutsideAvailableBlock`.
- **`server/domain/scheduling/session-placement.ts`** (`placeSessionOnDate`) — **NIET rechtstreeks te hergebruiken** voor Task 2's validatie: deze functie ZOEKT zelf een vrij plekje binnen een blok (`findBlockAwareSlot`) op een gegeven datum; Evelien's handmatige verplaatsing komt met een EXACT gewenst tijdstip (uit Google's event), niet "vind een plekje op deze dag". Task 2 heeft zijn eigen, nieuwe validatie nodig: "past dit exacte tijdstip binnen een beschikbaar-tijd-blok (`server/domain/availability/calendar-blocks.ts`) en overlapt het niet met een andere sessie van diezelfde user op die dag (exclusief de sessie zelf)". `sessionsOverlap`/`findTaskWithOverlappingSession`'s overlap-logica (`startup-check.ts`) is een goed startpunt voor de overlap-check.
- **`server/data/tasks.ts`** — `withSessionPlacementLocks(userId, dates, fn)` (bestaand, hergebruiken voor Task 2's mutatie, zelfde precedent als `session-placement.ts`/`recalculate.ts`), `updateSessionPlacement(sessionId, {startsAt, plannedMinutes})` (bestaand — Task 2 heeft een variant nodig die ook `manuallyPlacedAt` zet, of een los `SET manuallyPlacedAt`-statement erna binnen dezelfde lock).
- **`server/data/homework-blocks.ts`** — `getHomeworkBlockByGoogleEventId(userId, googleEventId)` (Story 8.1, code review) geeft de bestaande blok-rij; `updateHomeworkBlockTimes(id, startsAt, endsAt, lastKnownUpdated?)` (bestaand) voor Task 2's "meteen mee-bijwerken"-vereiste (AC #1). Let op: het blok is gekoppeld aan een datum+tijdvak, niet direct aan een `sessionId` — Task 2 moet zelf uitzoeken welke `sessions`-rij bij een `homeworkCalendarBlocks`-rij hoort (via `date`+`startsAt`-match binnen `getTasksWithSessionOnDateIncludingCompleted`, zelfde matching-aanpak als `homework-blocks.ts`'s eigen `syncHomeworkBlocksForDate`/`matchBlocks` al gebruikt) — er is geen directe foreign key.
- **`server/domain/calendar-sync/homework-blocks.ts`** (`syncHomeworkBlocksForDate`) — ONGEWIJZIGD door deze story: AC #1's "meteen mee-bijwerken" gebeurt binnen Task 2's eigen mutatie, niet door deze functie aan te roepen (dat zou een volledige, potentieel overbodige Calendar-schrijfronde triggeren voor iets dat Calendar-kant al klopt — Evelien heeft het event immers al zelf op de juiste tijd staan).
- **`shared/types/replan-log.d.ts`**, **`server/data/replan-log.ts`** (Story 6.8) — zie Beslissing C, rechtstreeks hergebruiken vanuit de Cron-handler.
- **`server/cron/calendar-watch-tick.ts`** (Story 8.1 + code review) — `logEventDiff` is het exacte punt waar Task 2's mutatie-logica bij komt; zie de bestaande `ECHO`/`EXTERNAL-CHANGE`/`DELETED`-vertakking.
- **`app/components/ReplanLogDialog.vue`** (Story 6.8) — huidige structuur: `open()` (regel ~30) doet de fetch en zet `isOpen`; het i-icoon is `<button class="replan-log-info-button">ⓘ</button>` (regel ~61-67) met CSS in `.replan-log-info-button` (regel ~99-114, momenteel `background: var(--color-surface)`/`color: var(--color-text-muted)`, neutraal). Task 1b voegt toe: een `onMounted`-fetch (nieuw, er is nu geen enkele fetch vóór een klik), een `hasUnreadRejection`-ref, een CSS-modifierklasse (bv. `.replan-log-info-button--unread` met een rode achtergrond/rand — gebruik een bestaande error/waarschuwings-kleurtoken uit het project se designsysteem, geen nieuwe kleur verzinnen — zoek naar hoe andere componenten in `app/` al een "let op"-status kleuren) op de knop, en een `mark-rejection-read`-aanroep in `open()`. Zelfde `idPrefix`-patroon (`home-`/`week-`) blijft ongewijzigd van toepassing.
- **`app/pages/index.vue`**, **`app/pages/week/index.vue`** (Story 6.8) — gebruiken `<ReplanLogDialog id-prefix="home" />` resp. `"week"` zonder verdere props; geen wijziging nodig hier — de nieuwe `onMounted`-fetch/rode-icoon-logica leeft volledig binnen het component zelf.

### Architectuurcompliance

- **AD-11 (ADOPTED, 2026-09-13)** — deze story IS de "Fase 2: mutatie" die AD-11 beschrijft. AD-11's rule staat uitsluitend de huiswerk-Calendar toe (niet de beschikbare-tijd-agenda) en precies één Cron-component (al bestaand, Story 8.1) — deze story voegt geen nieuwe infrastructuur toe, alleen mutatielogica binnen de bestaande Cron-handler.
- **AD-4/AD-7 (voorbehoud)** — de "geen conflict-detectie, Flowz overschrijft gewoon"-regel (AD-7) blijft ONVERANDERD gelden voor élke ongeldige verplaatsing (Beslissing B) en voor titel-wijzigingen (Beslissing E) — deze story vervangt dat gedrag niet, voegt er een nieuw, aanvullend pad naast toe (de geldige verplaatsing, AC #1).
- **Mutatie-ownership** — in tegenstelling tot Story 8.1 (uitsluitend loggen) muteert deze story wél `sessions`/`tasks`/`homeworkCalendarBlocks` vanuit het Cron-pad — dat is de kern van deze story, niet een scope-overschrijding. Elke mutatie loopt via de bestaande `server/domain/scheduling/`-services (`recalculateTaskPlanning`, `updateSessionPlacement`) — nooit een directe schrijfactie vanuit `server/cron/` zelf op tabellen die niet expliciet in deze story staan (Consistency Conventions, ARCHITECTURE-SPINE.md).

### Project Structure Notes

- Geen nieuwe mappen — alle wijzigingen in bestaande bestanden (`server/cron/`, `server/domain/scheduling/`, `server/data/`, `shared/types/`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 951-976 (Epic 8, Story 8.2, FR33)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md] — AD-11 (ADOPTED), AD-4/AD-7-voorbehoud
- [Source: _bmad-output/planning-artifacts/research/technical-google-calendar-tweewegs-synchronisatie-voor-huiswerk-blokken-research-2026-09-12.md] — "Databeslissing: bevroren/pinned sessie" (Beslissing A se tabel, ongewijzigd overgenomen), "Datamodel-wijzigingen", "Gefaseerde opbouw" (Fase 2), Research Synthesis (de vijf openstaande productbeslissingen, hier als Beslissing A-E ingevuld)
- [Source: _bmad-output/implementation-artifacts/8-1-alleen-lezen-detectie-spike.md] — baseline-infrastructuur (Tasks 1-4), Review Findings (14 patches — deze story bouwt op de gepatchte staat)
- [Source: _bmad-output/implementation-artifacts/6-8-wijzigingslog-toelichting-bij-automatische-herplanning.md] — `LoopSource`/wijzigingslog-patroon, hergebruikt voor Beslissing C
- [Source: server/domain/scheduling/recalculate.ts, startup-check.ts, session-placement.ts] — bestaande scheduling-mechanismen die deze story respecteert/uitbreidt

## Open Questions

- **Exacte kleur/styling van het rode i-icoon** (AC #7, Beslissing B) — welk kleurtoken uit het bestaande designsysteem hiervoor gebruikt wordt is aan de dev-agent (Dev Notes verwijst naar "zoek een bestaand let-op-kleurtoken"); geen exacte hex-waarde vastgesteld.
- **Overlap-signaal bij twee gepinde sessies** (Beslissing A, `runOverlappingSessionReplanLoop`): de exacte wijzigingslog-tekst hiervoor ("deze twee overlappen, pas zelf aan") is een voorstel, geen vastgestelde tekst.
- **`homeworkCalendarBlocks`-matching zonder foreign key naar `sessions`** (zie Dev Notes) — als de datum+tijdvak-matching in de praktijk onvoldoende betrouwbaar blijkt (bv. bij twee sessies van dezelfde taak op dezelfde dag met vergelijkbare tijden), overweeg dan alsnog een directe `sessionId`-kolom op `homeworkCalendarBlocks` toe te voegen — bewust niet vooraf aangenomen nodig te zijn.
- **Beslissing D's "terugvallen op automatische herplanning" bij een verwijderd event dat de LAATSTE/enige sessie van een taak was en de taak's deadline al gepasseerd is** — geen expliciete regel hiervoor vastgesteld; waarschijnlijk hetzelfde gedrag als een normale `runPastSessionReplanLoop`-trigger, maar niet apart getest.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-09-13 | Story aangemaakt via create-story, ná Hillebrand se expliciete GO op AD-11 (ADOPTED, zie Story 8.1's Change Log). Bouwt op Story 8.1's gepatchte infrastructuur (na de 14-patch-code-review). Vijf productbeslissingen uit het technisch onderzoek verwerkt als concrete voorstellen (Beslissing A-E) i.p.v. als onopgeloste vraag doorgeschoven — ter bevestiging bij Hillebrand vóór dev-story start. Status meteen `ready-for-dev`. |
| 2026-09-13 | **Beslissing B uitgebreid op verzoek van Hillebrand**: een geweigerde verplaatsing moet zichtbaarder zijn dan de neutrale i-dialoog-vermelding — nieuwe AC #7 (rood i-icoon naast de "↻ Herplannen"-knop, server-bijgehouden "ongelezen"-status, blijft rood tot de dialoog geopend is). Beslissing C uitgebreid: `LoopSource` krijgt `'manual_accepted'`/`'manual_rejected'` (twee waarden i.p.v. één `'manual'`) zodat het rode icoon precies op de weigering gericht kan worden — dit lost tegelijk de oorspronkelijke Open Question "één of twee waarden" op. Nieuwe kolom `users.lastReadManualRejectionAt`, nieuwe route `POST /api/scheduling/replan-log/mark-rejection-read`, nieuwe Task 1b. |
| 2026-09-13 | Tasks 1, 2, 1b, 3 geïmplementeerd. Tijdens implementatie bleek Beslissing C's oorspronkelijke aanname onjuist: de Cron-run via `recordReplanRun` laten meelopen in `replanRuns` zou Story 6.8's bestaande "toon de meest recente run"-dialoog laten leeglopen bij elke Home-load ná een Cron-tick (regressie). Herzien: de Cron schrijft `replanChangeLog`-rijen met een lokale, nooit-in-`replanRuns`-geregistreerde `runId`; een nieuwe `getUnreadManualLogEntriesForUser` (los van `replanRuns`) levert de manual-entries, gemerged met de bestaande automatische-run-entries in `latest.get.ts`. Zie Beslissing C voor de volledige herziene uitleg. `npm run typecheck` + `npx nuxt build` groen na elke task. HALT vóór Task 4: vereist een `sst deploy` en live Google-Calendar-acties (verplaatsen/verwijderen van een event) die de dev-agent niet zelf kan uitvoeren — zelfde HALT-patroon als Story 8.1's Task 5. Status blijft `in-progress`. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- Tasks 1, 2, 1b, 3 volledig geïmplementeerd en getypecheckt (`npm run typecheck` + `npx nuxt build`, beide groen na elke task).
- Beslissing C is tijdens de implementatie herzien (zie Change Log) — de story se tekst hierboven is al bijgewerkt naar de daadwerkelijk geïmplementeerde, correcte versie.
- **HALT vóór Task 4** (live-verificatie): vereist (a) een `sst deploy --stage dev` — expliciete goedkeuring/uitvoering door Hillebrand nodig, en (b) live Google Calendar-acties (een event verplaatsen naar een geldige/ongeldige tijd, een event verwijderen, een titel wijzigen) die de dev-agent niet zelf kan uitvoeren (geen Google-inloggegevens). Task 5's rapportage kan pas na Task 4's bewijsmateriaal.
- Aanbeveling voor het vervolg: Hillebrand keurt de deploy goed, voert de live-acties uit uit Task 4's checklist (evt. samen met de dev-agent die meekijkt in CloudWatch/de database, zelfde samenwerkingspatroon als Story 8.1's Task 5).

### File List

- `server/data/schema.ts` (Task 1: `sessions.manuallyPlacedAt`, `users.lastReadManualRejectionAt`)
- `server/data/migrations/0026_overconfident_arachne.sql` (Task 1, nieuw)
- `server/data/migrations/meta/_journal.json`, `server/data/migrations/meta/0026_snapshot.json` (Task 1, migratie-metadata)
- `shared/types/replan-log.d.ts` (Task 1: `LoopSource`-uitbreiding, `hasUnreadRejection`)
- `server/domain/scheduling/startup-check.ts` (Task 1: `LOOP_REASONS`; Task 3: task-level `manuallyPlacedAt`-uitsluiting in alle vier lussen, `sessionsOverlap` geëxporteerd + verbreed, nieuwe `logManualOverlapSignal`)
- `server/cron/calendar-watch-tick.ts` (Task 2: `EventsListItem.start/end`, nieuwe `findTaskAndSessionForBlock`/`acceptOrRejectManualMove`/`acceptDeletion`/`logManualEntry`, `runId` per verwerkingsronde)
- `server/data/tasks.ts` (Task 2: `updateSessionPlacement` uitgebreid met `manuallyPlacedAt`)
- `server/data/homework-blocks.ts` (Task 2: `updateHomeworkBlockTimes` uitgebreid met `date`)
- `server/data/replan-log.ts` (Task 1b: `getUnreadManualLogEntriesForUser`, gedeelde `groupByTaskAndLoopSource`-helper)
- `server/data/users.ts` (Task 1b: `updateLastReadManualRejectionAt`)
- `server/api/scheduling/replan-log/latest.get.ts` (Task 1b: merge automatische + ongelezen manual-entries, `hasUnreadRejection`)
- `server/api/scheduling/replan-log/mark-rejection-read.post.ts` (Task 1b, nieuw)
- `app/components/ReplanLogDialog.vue` (Task 1b: `onMounted`-fetch, rode `--unread`-icoonstijl, `mark-rejection-read`-aanroep)
