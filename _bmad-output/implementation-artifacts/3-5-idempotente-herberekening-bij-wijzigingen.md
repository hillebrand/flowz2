---
baseline_commit: 45f5b5a4db6f8787e4c4c1a74a2d0c0f869a72ae
---

# Story 3.5: Idempotente Herberekening bij Wijzigingen

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want dat mijn planning altijd klopt met de actuele situatie, ongeacht wanneer of in welke volgorde wijzigingen binnenkomen,
so that ik kan vertrouwen op wat ik zie, ook na meerdere snelle aanpassingen.

## Acceptance Criteria

1. **Given** de benodigde tijd van een taak wijzigt, een sessie/taak wordt afgerond, of tijd-/energiegebrek wordt aangegeven (triggers uit latere epics), **when** een herberekening wordt aangeroepen, **then** gaat die altijd uit van de actuele Task/Session/Subtask/AvailableTime-staat, nooit van een tussentijds opgeslagen planningsstaat (AD-1, NFR8), **and** levert een herhaalde aanroep met dezelfde actuele staat exact hetzelfde resultaat op (idempotent), **and** is dit endpoint herbruikbaar als het gedeelde herberekenings-mechanisme voor Epic 4/5/6's replan-triggers.

## Belangrijk: net als Story 3.4 een pure engine-story — maar dit keer mét een echte mutatie én een schema-uitbreiding

**Geen API-route** — zelfde redenering als Story 3.4 (Epic 4/5/6, de enige beoogde triggers, zijn nog volledig `backlog`), maar hier met een directer precedent: Story 2.3's eigen decision-needed-resolutie (Hillebrand, 2026-08-01) stelde al vast dat AC-tekst die een "endpoint" noemt, in dít project shorthand is voor "de service/het mechanisme" — geen aparte HTTP-route, want dit project se vaste patroon is dat routes altijd dunne wrappers om domain-functies zijn, nooit interne HTTP-hops. Toekomstige aanroepers (Epic 4/5/6's eigen routes) importeren de domain-functie hieronder rechtstreeks, zodra ze bestaan.

**Wél een echte mutatie, in tegenstelling tot Story 3.4** — "idempotente herberekening" betekent hier: de sessie van een *bestaande* taak herpositioneren op basis van de actuele staat, niet alleen een leesfunctie. Dat onthulde tijdens het schrijven van deze story een reëel, nog niet opgelost gat:

- **`googleEventId` wordt nergens opgeslagen.** `createHomeworkEvent` (Story 2.3) retourneert 'm, maar `server/domain/tasks/create-task.ts` gooit die waarde weg (Story 3.1's Dev Notes noemden dit expliciet als "nog steeds Story 2.3's eigen, geldende scope-grens" — voor déze story wordt het een blokkerend gat: zonder een opgeslagen `googleEventId` kan een herberekening het bijbehorende Calendar-event niet bijwerken via `updateHomeworkEvent`, alleen een nieuw, dubbel event aanmaken via `createHomeworkEvent`). Task 1/2 hieronder lossen dit op.
- **Zelf-botsing in de capaciteitscheck.** `findSessionDate`/`sumPlannedMinutesForUserOnDate` tellen alle sessies van de user op die dag mee — inclusief de sessie van de taak die je juist aan het herberekenen bent. Zonder correctie zou een taak nooit terug op haar eigen huidige dag geplaatst kunnen worden (haar eigen, nog-niet-verplaatste sessie telt dan dubbel mee als "al bezet"). Task 3/4 hieronder lossen dit op met een `excludeTaskId`-parameter.

Beide zijn **noodzakelijke correcties voor déze story's AC, geen scope creep** — zonder beide is idempotente herberekening met Calendar-sync simpelweg niet correct te implementeren.

## Tasks / Subtasks

- [x] Task 1: Schema — `sessions.googleEventId` (AC: #1)
  - [x] Nieuwe kolom `googleEventId: text('google_event_id')` op `sessions` — nullable (bestaande sessies vóór deze migratie, en sessies aangemaakt zonder actieve Calendar-write-scope, hebben 'm niet). Geen `.default(...)` nodig (nullable kolommen hebben geen non-null-default-eis bij `ALTER TABLE ADD COLUMN`, in tegenstelling tot Story 3.3's `needs`-kolom).
  - [x] Migratie genereren (`drizzle-kit generate`) en live toepassen, geverifieerd via `PRAGMA table_info`. — migratie `0008_bored_wendell_rand.sql` (`ALTER TABLE sessions ADD google_event_id text`).
- [x] Task 2: `server/domain/tasks/create-task.ts` — `googleEventId` daadwerkelijk opslaan (AC: #1, randvoorwaarde)
  - [x] Ná een geslaagde `createHomeworkEvent`-aanroep: sla `result.googleEventId` op via een nieuwe data-laagfunctie (Task 3) i.p.v. de waarde weg te gooien zoals nu. `createHomeworkEvent` retourneert `null` als er geen Calendar-write-scope/kleur is (AC #4, Story 2.3) — in dat geval niets opslaan (blijft `NULL`, self-healing bij een latere herberekening zodra de gebruiker alsnog een kleur instelt, zie Task 5).
- [x] Task 3: `server/data/tasks.ts` — nieuwe data-functies (AC: #1)
  - [x] `getTaskById(taskId: string): Promise<Task | null>` — enkele-rij-lookup, `null` als niet gevonden (geen `throw`, in tegenstelling tot `getUserById`: een niet-bestaande taak is voor de aanroeper hieronder een legitiem, af te handelen scenario, geen programmeerfout).
  - [x] `getSessionForTask(taskId: string): Promise<Session | null>` — huidige architectuur (AD-3, Story 3.1/3.2) kent precies 1 sessie per taak; `null` als er onverwacht geen sessie is (zou wijzen op een eerdere datacorruptie, niet iets om stil te negeren).
  - [x] `updateSessionPlacement(sessionId: string, input: { startsAt: string, plannedMinutes: number, googleEventId: string | null }): Promise<Session>` — één `UPDATE`, geen delete+insert (bewuste keuze, zie Dev Notes "Waarom UPDATE, geen delete+insert").
  - [x] `sumPlannedMinutesForUserOnDate` (huidige signatuur: `userId, date`) uitbreiden met een optionele **derde** parameter `excludeTaskId?: string` — sluit sessies van déze taak uit van de som (voorkomt de zelf-botsing hierboven). Backwards-compatibel: bestaande aanroepen (Story 3.1/3.2's `createTaskAndSession`) blijven ongewijzigd werken zonder het nieuwe argument mee te geven.
- [x] Task 4: `server/domain/scheduling/doelmoment.ts` — `findSessionDate` uitbreiden (AC: #1)
  - [x] Optionele vijfde parameter `excludeTaskId?: string`, doorgegeven aan `sumPlannedMinutesForUserOnDate` (Task 3). Zelfde backwards-compatibiliteitsgarantie.
- [x] Task 5: `server/domain/scheduling/recalculate.ts` — de herberekenings-functie zelf (AC: #1)
  - [x] Nieuw bestand, naast `doelmoment.ts`/`ordering.ts` in dezelfde map.
  - [x] `recalculateTaskPlanning(taskId: string): Promise<{ task: Task, session: Session }>`:
    1. `getTaskById`/`getSessionForTask` (Task 3) — bestaat de taak/sessie niet, gooi een expliciete `Error` (programmeerfout bij de aanroeper, geen legitiem "niets gevonden"-pad zoals bij de losse lookups zelf).
    2. `today = todayInAmsterdam()`, `avgAvailableMinutes = await averageDailyAvailableMinutes(userId)` (beide bestaand, hergebruikt).
    3. `doelmoment = calculateDoelmoment(task.deadline, task.totalMinutes, task.difficulty, task.priority, avgAvailableMinutes, today)` (bestaand, hergebruikt — **niet** een nieuwe doelmoment-berekening verzinnen).
    4. `sessionDate = await findSessionDate(userId, doelmoment, task.defaultSessionDuration, today, task.id)` — met `excludeTaskId` (Task 4), sluit de eigen, nog-niet-verplaatste sessie uit.
    5. Stapelings-offset opnieuw berekenen voor `sessionDate` — **zelfde formule als `createTaskAndSession` in `server/data/tasks.ts`** (`sessionAnchorHour + Math.floor(existingMinutes/60)`, minuten via `% 60`), maar met `sumPlannedMinutesForUserOnDate(userId, sessionDate, task.id)` (excludeTaskId) i.p.v. zonder. **Bewust een kleine, losse herimplementatie i.p.v. `createTaskAndSession` te hergebruiken/refactoren** (die zit diep verweven in een insert-transactie, niet zomaar herbruikbaar voor een update-pad) — zie Dev Notes voor de afweging. `SESSION_ANCHOR_HOUR` geëxporteerd uit `create-task.ts` (was lokaal, moet gelijk blijven tussen creatie en herberekening).
    6. **`plannedMinutes` = `task.defaultSessionDuration`** (zelfde bron als `createTaskAndSession`'s oorspronkelijke `plannedMinutes: input.defaultSessionDuration` — niet `task.totalMinutes`, dat blijft de bufferformule's eigen invoer, geen sessieduur). Roep `updateSessionPlacement` (Task 3) aan met de nieuwe `startsAt`/`plannedMinutes` en de **huidige, nog ongewijzigde** `session.googleEventId` (dus gewoon de waarde die de sessie al had, óók als die `null` is) — dit is de enige write die op dit punt al zeker weet welke `startsAt` moet worden vastgelegd.
    7. Calendar-sync, **ná** stap 6's write (zodat de nieuwe sessieplaatsing sowieso al vastligt, ongeacht of Calendar-sync hierna slaagt — zie Dev Notes "Waarom geen rollback"): heeft de sessie (vóór stap 6, of gewoon de zojuist gelezen `session.googleEventId`) een waarde? Roep `updateHomeworkEvent` aan met de nieuwe `startsAt`/`endsAt` — geen tweede write nodig, `googleEventId` zelf verandert niet. Was 'm `null`? Roep `createHomeworkEvent` aan (self-healing — bv. als de gebruiker inmiddels alsnog een kleur heeft ingesteld); retourneert die een resultaat (niet `null`, dus write-scope/kleur zijn nu wél aanwezig), doe dan een **tweede, gerichte** `updateSessionPlacement`-aanroep die alléén `googleEventId` bijwerkt (zelfde `startsAt`/`plannedMinutes` als stap 6, nu aangevuld met de nieuwe `googleEventId`) — zodat een volgende herberekening dat event kan hergebruiken i.p.v. steeds opnieuw aan te maken.
    8. **Geen compenserende opruiming bij een falende Calendar-call** (bewuste afwijking van `create-task.ts`'s patroon, zie Dev Notes "Waarom geen rollback bij herberekening") — de nieuwe sessieplaatsing blijft staan, ook als de Calendar-sync faalt; de fout wordt gewoon doorgegooid (AD-7: "een falende Calendar-call laat deze aanroep gewoon falen").
- [x] Task 6: Verificatie — debug-route + echte Calendar-events, geen browser (AC: #1)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] **Idempotentie-check**: taak `RecalcVerify35` aangemaakt, `recalculateTaskPlanning` twee keer na elkaar aangeroepen via een tijdelijke debug-route (`server/api/_debug/recalculate-test.post.ts`, nooit gecommit) zonder tussentijdse wijziging → beide antwoorden waren byte-voor-byte identiek (`startsAt`, `plannedMinutes`, `googleEventId`).
  - [x] **Zelf-botsing-check**: dezelfde herberekening plaatste de taak terug op precies haar eigen, al-bestaande `startsAt` — zonder de `excludeTaskId`-fix zou de eigen sessie zichzelf als "al bezet" hebben geteld.
  - [x] **`googleEventId`-opslag + update-sync**: bij het aanmaken stond `googleEventId` meteen in de database (voorheen nooit, zie de story's "Belangrijk"-sectie). `deadline` direct in de database gewijzigd (2026-08-30 → 2026-09-10), `recalculateTaskPlanning` aangeroepen → `startsAt` daadwerkelijk veranderd (2026-08-29 → 2026-09-09), `googleEventId` **identiek** gebleven. Rechtstreeks bij Google bevestigd: hetzelfde event-`id`, `start.dateTime` bijgewerkt naar de nieuwe datum/tijd, `status: confirmed` — geen duplicaat.
  - [x] **Self-healing-check**: kleur tijdelijk op `NULL` gezet (write-scope ongemoeid), taak `SelfHealVerify35` aangemaakt → `googleEventId` bleef `NULL` (bevestigd: geen Calendar-call gedaan). Kleur teruggezet, `recalculateTaskPlanning` aangeroepen → er verscheen alsnog een Calendar-event en `googleEventId` werd alsnog opgeslagen.
  - [x] Geen secrets/placeholder-waarden in code/commits. Alle testtaken (incl. hun echte Google Calendar-events) na verificatie opgeruimd. Debug-route verwijderd, herdeployed, verwijdering bevestigd met een `404`.

### Review Findings

- [x] [Review][Patch] `server/domain/scheduling/recalculate.ts` importeerde `SESSION_ANCHOR_HOUR` uit `server/domain/tasks/create-task.ts` — keert de bestaande, eenrichtings-afhankelijkheidsrichting om (`tasks/` → `scheduling/`, zie `create-task.ts`'s eigen import van `calculateDoelmoment`), en creëert tweerichtings-koppeling tussen de twee mappen [server/domain/scheduling/recalculate.ts:6, server/domain/tasks/create-task.ts:39] — constante verplaatst naar `server/domain/scheduling/doelmoment.ts` (zelfde categorie fix als Story 3.1's `shared/utils/scheduling.ts` voor een vergelijkbaar layering-probleem), `create-task.ts` importeert 'm nu vandaar.
- [x] [Review][Patch] `getSessionForTask` gaf stilzwijgend een willekeurige rij terug als de "precies 1 sessie per taak"-aanname ooit geschonden zou worden — geen signaal dat er iets mis is [server/data/tasks.ts:159-162] — expliciete check toegevoegd die gooit bij >1 rij, zelfde discipline als Story 2.3's "stil zwijgen kan een integratiebug verbergen"-les.
- [x] [Review][Patch] `recalculateTaskPlanning` herleidt `plannedMinutes` altijd van `task.defaultSessionDuration`, zonder commentaar dat dit een bewuste keuze is (in tegenstelling tot andere niet-triviale beslissingen in ditzelfde bestand, die wél expliciet toegelicht worden) [server/domain/scheduling/recalculate.ts:38] — verduidelijkende comment toegevoegd.
- [x] [Review][Patch] **Verweesd Calendar-event bij een falende `updateSessionPlacement` ná een geslaagde `createHomeworkEvent`, in `create-task.ts`** — de buitenste catch ruimt alleen Task/Session/Subtask-rijen op (`deleteTaskAndSession`), niet het al-aangemaakte Calendar-event; dat blijft dan permanent op Eveliens échte agenda staan zonder dat er nog een sessie naar verwijst [server/domain/tasks/create-task.ts:113-119] — geneste try/catch toegevoegd die het Calendar-event alsnog verwijdert (`deleteHomeworkEvent`) vóórdat de fout wordt doorgegooid.
- [x] [Review][Patch] **Zelfde verweesd-event-risico in `recalculateTaskPlanning`'s self-healing-tak, maar met een ernstiger gevolg** — faalt de `updateSessionPlacement` die het nieuwe `googleEventId` moet vastleggen, dan blijft de sessie op `null` staan; de eerstvolgende herberekening zou de self-healing-tak dan opnieuw triggeren en een ongebreidelde reeks duplicaat-events kunnen aanmaken (erger dan het algemene, bewust geaccepteerde "geen rollback"-gedrag, dat alleen tijdelijk stale wordt) [server/domain/scheduling/recalculate.ts:69-71] — zelfde geneste try/catch-fix als hierboven.
- [x] [Review][Dismiss] TOCTOU-race tussen `recalculateTaskPlanning`'s stapelings-som-lezing en de daaropvolgende write — al expliciet gedocumenteerd en bewust geaccepteerd in de Dev Notes ("Bekende, bewust geaccepteerde TOCTOU-race"), geen stilzwijgend gat. Alle drie reviewers vonden 'm onafhankelijk, wat bevestigt dat 'ie reëel is — precies waarom 'm al gedocumenteerd stond.
- [x] [Review][Dismiss] Gedupliceerde stapelings-offset-formule tussen `createTaskAndSession` en `recalculateTaskPlanning` — al expliciet gedocumenteerd en beargumenteerd in de Dev Notes ("Waarom createTaskAndSession's stapelings-logica niet hergebruikt/gerefactored wordt").
- [x] [Review][Dismiss] Geen rollback bij een falende Calendar-call tijdens herberekening (het algemene geval, niet de twee specifieke orphan-scenario's die wél gepatcht zijn) — al expliciet gedocumenteerd en beargumenteerd in de Dev Notes ("Waarom geen rollback bij herberekening").
- [x] [Review][Dismiss] `updateHomeworkEvent` no-opt stil als write-scope/kleur na het aanmaken van een `googleEventId` alsnog wordt ingetrokken — bestaand, al-gereviewd gedrag van Story 2.3's `updateHomeworkEvent` zelf, niet iets dat deze story introduceert of verandert.
- [x] [Review][Dismiss] Zero test coverage voor `recalculate.ts` — projectbreed, al herhaaldelijk gevonden en getrackt, niet uniek aan deze story; dit specifieke bestand is wel uitgebreid live geverifieerd (4 echte scenario's, incl. rechtstreekse Google-bevestiging).
- [x] [Review][Dismiss] Migratie-metadatabestanden ontbraken in de gereviewde diff — beide reviewers bevestigden onafhankelijk dat ze wél op schijf bestaan en correct zijn; puur een artefact van hoe de diff voor de review was samengesteld, geen echt gat.
- [x] [Review][Dismiss] `updateSessionPlacement`'s signatuur dwingt elke aanroeper alle drie de velden te herhalen, ook als maar één veld daadwerkelijk wijzigt — speculatieve toekomstige-misbruik-zorg; beide huidige aanroepplekken zijn al correct.
- [x] [Review][Dismiss] Idempotentie is "veld-scoped" (`updatedAt` verandert altijd) — standaard, verwacht DB-gedrag; AC #1's idempotentie-eis gaat over de planningsuitkomst, niet over interne boekhoudkundige timestamps.
- [x] [Review][Dismiss] `Subtask`-staat wordt niet live herafgeleid (`task.totalMinutes` blijft de bij creatie berekende waarde) — correct buiten scope, Acceptance Auditor bevestigt: dit is Epic 5's toekomstige edit-flow se taak, niet stilzwijgend een gat in déze story.
- [x] [Review][Defer] Geen vroegtijdige no-op-detectie — elke aanroep doet onvoorwaardelijk een DB-write + Calendar-aanroep, ook als de herberekende plaatsing identiek is aan de huidige. Reële optimalisatie, geen huidige aanroeper (Epic 4/5/6 nog `backlog`), en de self-healing-tak zou sowieso altijd moeten blijven controleren.
- [x] [Review][Defer] `updateHomeworkEvent` onderscheidt geen echte 404 (een blijvend verwijderd event) van Story 2.3's al-geteste tombstone/200-scenario (handmatig verwijderd via de Google-UI) — bij een echte 404 zou de aanroep gewoon falen i.p.v. self-healing te triggeren. Zeer zeldzaam randgeval, Story 2.3's live-testen dekten alleen het realistische pad.
- [x] [Review][Defer] Geen gebruikerszichtbaar signaal als een sessie met een `googleEventId` stil "verweest" raakt doordat write-scope/kleur na het aanmaken wordt ingetrokken — het event blijft dan stilzwijgend stale tot write-scope ooit hersteld wordt én een herberekening toevallig loopt.

**Code review compleet (Blind Hunter + Edge Case Hunter + Acceptance Auditor, 2026-08-02):** 0 decision-needed, 5 patch, 3 defer, 8 als ruis afgewezen. Alle 5 patches toegepast, typecheck + build opnieuw geslaagd, opnieuw gedeployed en de kernscenario's (idempotentie, zelf-botsing, `googleEventId`-opslag/update-sync, self-healing) opnieuw live herbevestigd.

## Dev Notes

### Waarom UPDATE, geen delete+insert, voor de sessie-herplaatsing

Een `UPDATE` op de bestaande sessierij (i.p.v. de sessie verwijderen en een nieuwe aanmaken) houdt `session.id`/`createdAt` stabiel — belangrijk omdat `googleEventId` aan die rij hangt en een delete+insert 'm zou laten verweesd raken (het Calendar-event zou dan een `googleEventId` hebben die nergens meer naar verwijst). Een `UPDATE` is bovendien letterlijker "idempotent": twee keer dezelfde waarde schrijven is een no-op-in-effect, twee keer verwijderen+aanmaken zou telkens een nieuwe `id`/`createdAt` genereren — geen stabiel resultaat, ook al zou de *inhoud* (datum/tijd) wel gelijk blijven.

### Waarom geen rollback bij een falende Calendar-call tijdens herberekening (in tegenstelling tot `create-task.ts`)

`create-task.ts`'s compenserende opruiming (Story 3.1's review) bestaat omdat een falende Calendar-call na de initiële insert een **verweesde, betekenisloze** Task/Session zou achterlaten — een taak die nooit had moeten bestaan zonder haar Calendar-tegenhanger. Bij een herberekening ligt dat anders: de taak **bestond al geldig** vóór deze aanroep. Een falende Calendar-sync tijdens het herberekenen betekent niet dat de nieuwe sessieplaatsing zelf ongeldig is — alleen dat de Calendar-spiegel tijdelijk niet gesynchroniseerd is. Die terugdraaien (naar de oude, inmiddels achterhaalde plaatsing) zou het hele doel van herberekenen ondermijnen. De eerstvolgende herberekening (of Epic 6's toekomstige tekortdetectie) synchroniseert vanzelf opnieuw.

### Waarom `createTaskAndSession`'s stapelings-logica niet hergebruikt/gerefactored wordt

De stapelings-offset-berekening (`sessionAnchorHour + Math.floor(existingMinutes/60)`) zit nu op twee plekken: `createTaskAndSession` (insert-pad, binnen een transactie) en deze story's nieuwe `recalculateTaskPlanning` (update-pad, buiten een transactie — er wordt niets nieuws toegevoegd, alleen een bestaande rij bijgewerkt). Een gedeelde helper zou mooi zijn, maar `createTaskAndSession` zit diep verweven in de insert-transactie (de stapelings-som-lezing gebeurt *binnen* dezelfde transactie als de insert, cruciaal voor de TOCTOU-race-fix uit Story 3.2's review) — die logica er zomaar uittrekken zou dat transactionele garanties kunnen breken. Bewust een kleine, geïsoleerde duplicatie geaccepteerd i.p.v. bestaand, al-gereviewd code aan te raken voor een DRY-winst — zelfde afweging als Story 3.4's gedeferde join-patroon-bevinding.

### Bekende, bewust geaccepteerde TOCTOU-race in `recalculateTaskPlanning` (fresh-context-validatiepas)

In tegenstelling tot `createTaskAndSession` (waar de stapelings-som-lezing en de insert in dezelfde transactie zitten, precies om de TOCTOU-race uit Story 3.2's review te dichten) lopen `recalculateTaskPlanning`'s stapelings-som-lezing (stap 5) en de daaropvolgende `updateSessionPlacement`-write (stap 6) hier **niet** in één transactie — twee gelijktijdige herberekeningen voor dezelfde user/dag zouden dezelfde "al gepland"-som kunnen lezen en overlappende sessies kunnen plaatsen. **Bewust geaccepteerd, niet stilzwijgend afwezig**: er bestaat vandaag geen enkele aanroeper (Epic 4/5/6 zijn nog `backlog`), dus dit risico is momenteel puur theoretisch. Oppakken zodra de eerste echte replan-trigger-story dit daadwerkelijk gelijktijdig kan laten gebeuren — dan is een transactie rond stap 5+6 de voor de hand liggende fix, zelfde patroon als `createTaskAndSession` al toepast.

### Architectuurcompliance

- AD-1 (scheduling server-only), NFR7 — bevestigd, alles in `server/domain/`.
- AD-3 (planning is een berekende weergave) — de *berekening* is on-demand vanuit actuele staat (AC's letterlijke eis), maar het *resultaat* (de sessie-startsAt) blijft wél een opgeslagen rij, zoals Story 3.1 dat al vastlegde — dit verandert niet, alleen wanneer die rij wordt bijgewerkt.
- AD-7 (Calendar write-sync synchroon binnen het request-pad) — bevestigd, geen achtergrondtaak.
- Mutatie-ownership-regel — `recalculateTaskPlanning` is zelf al een domain-functie; een toekomstige route (Epic 4/5/6) roept 'm rechtstreeks aan, nooit rechtstreeks de data-laag.

### Project Structure Notes

`server/domain/scheduling/recalculate.ts` is nieuw, naast `doelmoment.ts`/`ordering.ts`. `server/data/tasks.ts` en `server/domain/scheduling/doelmoment.ts` worden uitgebreid (nieuwe/aangepaste functies), niet vervangen. `server/domain/tasks/create-task.ts` krijgt een kleine wijziging (Task 2).

### Testen

Geen testframework in dit project. Grotendeels DB- én Calendar-gebonden (in tegenstelling tot Story 3.4's pure `sortByVolgorde`), dus verificatie leunt zwaar op een tijdelijke debug-route + echte Google Calendar-aanroepen — zelfde discipline als Story 2.3's Calendar-verificatie (testevents duidelijk markeren, direct opruimen).

## Previous Story Intelligence (Story 3.4, inclusief de code review)

- **`server/data/`-modules zijn niet los van Nitro te draaien** — nogmaals van toepassing (Task 6's debug-route-aanpak), nu voor de derde keer expliciet meegenomen zodat het niet nogmaals herontdekt hoeft te worden.
- **Bestaande functiesignaturen backwards-compatibel uitbreiden met optionele parameters** i.p.v. bestaande aanroepers te breken — toegepast op `sumPlannedMinutesForUserOnDate`/`findSessionDate` (Task 3/4).
- **Precies naslaan wat bestaande code al doet vóór je 'm hergebruikt** — Story 3.4's Debug Log illustreerde dit; hier toegepast door `createHomeworkEvent`/`updateHomeworkEvent`/`deleteHomeworkEvent` (Story 2.3) grondig te lezen vóór het ontwerpen van Task 5's Calendar-sync-stap, in plaats van aan te nemen hoe die werken.
- **Live verifiëren, niet aannemen** — Story 2.3's eigen 404-aanname bleek empirisch fout (Google's tombstone-gedrag); dezelfde voorzichtigheid hier bij de self-healing-aanname (Task 6's self-healing-check test dit expliciet, niet alleen in theorie).

## Git Intelligence

Laatste commit: `45f5b5a` (Story 3.4 incl. code review). Deze story is de eerste sinds Story 2.3 die weer een schema-migratie combineert met een echte Calendar-mutatie — het meest solide precedent is dus Story 2.3, niet 3.1-3.4 (die waren allemaal create-only of read-only).

## References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 380-390 (Story 3.5's User Story + AC, brontekst), regel 306 (Epic 3 Implementation Notes)
- [Source: server/domain/calendar-sync/homework-events.ts] — bestaande `createHomeworkEvent`/`updateHomeworkEvent`/`deleteHomeworkEvent`, hergebruikt door Task 5
- [Source: _bmad-output/implementation-artifacts/2-3-huiswerk-kleur-kiezen-calendar-write-sync-service.md] — het "endpoint = shorthand voor service"-precedent (decision-needed-resolutie), de tombstone-/self-healing-lessen
- [Source: _bmad-output/implementation-artifacts/3-4-volgorde-algoritme-bij-meerdere-concurrerende-taken.md] — "geen UI/API-route"-scope-precedent, debug-route-verificatietechniek

## Open Questions

1. **Geen API-route** (zie bovenaan) — gebaseerd op Story 2.3's precedent. Zeg het als je 'm liever nu al aan een (tijdelijke) route hangt.
2. **Geen rollback bij een falende Calendar-call tijdens herberekening** (zie Dev Notes) — bewuste asymmetrie met `create-task.ts`'s patroon. Zeg het als je hier toch consistentie met het creatie-pad verwachtte.
3. **Kleine, geïsoleerde duplicatie van de stapelings-offset-formule** i.p.v. hergebruik van `createTaskAndSession`'s interne logica (zie Dev Notes) — zeg het als je liever een grotere refactor had gezien om dit te delen.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-02 | Story aangemaakt via create-story, voortbouwend op Story 3.4 (done). Fresh-context-validatiepas vond en fixte vóór dev-story begon: een gebroken interne kruisverwijzing in Task 5 (verwees naar niet-bestaande Dev Notes), een verkeerd parameteraantal voor `sumPlannedMinutesForUserOnDate` (derde, niet vijfde), een niet-gespecificeerde `plannedMinutes`-bron, en een self-healing-testinstructie die vacuously kon slagen (kleur-NULL alleen is onvoldoende zonder `hasCalendarWriteScope` expliciet te bevestigen). Ook een niet-stilzwijgend geaccepteerde TOCTOU-race toegevoegd aan de Dev Notes (herberekening loopt, in tegenstelling tot `createTaskAndSession`, niet in een transactie — bewust aanvaard, geen huidige aanroeper). |
| 2026-08-02 | Task 1 (schema) afgerond: nieuwe `sessions.googleEventId`-kolom (nullable), migratie `0008_bored_wendell_rand.sql` gegenereerd en live toegepast. |
| 2026-08-02 | Task 2-5 afgerond: `googleEventId` wordt nu daadwerkelijk opgeslagen in `create-task.ts` (voorheen weggegooid); `getTaskById`/`getSessionForTask`/`updateSessionPlacement` toegevoegd; `sumPlannedMinutesForUserOnDate`/`findSessionDate` uitgebreid met een optionele `excludeTaskId` (backwards-compatibel); nieuwe `recalculateTaskPlanning` in `server/domain/scheduling/recalculate.ts` — herberekent doelmoment/sessiedatum/stapelingsoffset vanuit actuele staat, update de bestaande sessierij in-place, synct het Calendar-event (update bij een bestaande `googleEventId`, self-healing create anders), geen rollback bij een falende Calendar-call (bewuste asymmetrie met creatie, zie Dev Notes). `SESSION_ANCHOR_HOUR` geëxporteerd uit `create-task.ts` voor hergebruik. Typecheck en build slagen. |
| 2026-08-02 | Task 6 (verificatie) afgerond: live end-to-end getest tegen de dev-stage via een tijdelijke debug-route — idempotentie (twee identieke aanroepen), zelf-botsing (taak blijft op eigen dag), `googleEventId`-opslag + update-sync (hetzelfde Calendar-event bijgewerkt, rechtstreeks bij Google bevestigd, geen duplicaat), self-healing (event alsnog aangemaakt zodra een ontbrekende kleur wordt hersteld). Debug-route en alle testdata (incl. Google Calendar-events) opgeruimd, verwijdering bevestigd met een `404`. Status → review. |
| 2026-08-02 | Formele code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor): 0 decision-needed, 5 patch, 3 defer, 8 als ruis afgewezen (grotendeels herbevestigingen van de story's eigen, al gedocumenteerde tradeoffs — alle drie reviewers vonden de TOCTOU-race/duplicatie/geen-rollback-beslissingen onafhankelijk, wat bevestigt dat ze reëel zijn, precies waarom ze al vooraf gedocumenteerd stonden). Alle 5 patches toegepast: `SESSION_ANCHOR_HOUR` verplaatst naar `doelmoment.ts` (loste een layering-inversie op — `scheduling/` importeerde van `tasks/`, de omgekeerde richting van de rest van het project); `getSessionForTask` bewaakt nu expliciet de "1 sessie per taak"-aanname; verduidelijkende comment bij `plannedMinutes`'s herkomst; en de belangrijkste twee — een verweesd-Calendar-event-fix in zowel `create-task.ts` als `recalculateTaskPlanning`'s self-healing-tak (compenserende `deleteHomeworkEvent` als de sessie-write ná een geslaagde Calendar-aanroep alsnog faalt; zonder de fix in de self-healing-tak had dit tot een ongebreidelde reeks duplicaat-events kunnen leiden). Opnieuw gedeployed en de kernscenario's (idempotentie, zelf-botsing, `googleEventId`-consistentie) opnieuw live herbevestigd tegen de dev-stage. Status → done. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Fresh-context-validatiepas vond vier reële gaten vóór dev-story begon**, alle vóóraf gecorrigeerd: een gebroken interne kruisverwijzing, een verkeerd parameteraantal, een niet-gespecificeerde `plannedMinutes`-bron, en een self-healing-testinstructie die stil kon slagen zonder iets te bewijzen (write-scope niet expliciet bevestigd). Zie het Change Log voor details.
- **AWS-sessie verliep twee keer tijdens live-verificatie**, wat één testaanroep liet lijken alsof-ie faalde (lokale timeout) terwijl de server-side aanroep intussen wél was doorgegaan — de eerstvolgende "vóór"-meting bleek daardoor stiekem al een "ná"-meting te zijn. Herkend doordat de her-uitgevoerde deadline-wijziging-test geen verandering in `startsAt` liet zien terwijl dat wel verwacht werd; opgelost door de test met een expliciet gelogde "huidige staat vóór wijziging"-stap opnieuw te draaien in plaats van op een aanname te vertrouwen.
- **Live-verificatie bevestigde alle vier de kernclaims rechtstreeks**, inclusief bij Google zelf (niet alleen via de eigen database): hetzelfde Calendar-event-`id` met een bijgewerkte `start.dateTime` na een deadline-wijziging, en een nieuw event dat pas verscheen ná het herstellen van de kleur (self-healing).

### Completion Notes List

- **AC #1 is end-to-end geverifieerd**: herberekening gaat aantoonbaar uit van actuele staat (deadline-wijziging direct in de DB werd correct opgepikt), is idempotent (twee identieke aanroepen, byte-voor-byte gelijk resultaat), en is herbruikbaar als domain-functie (geen route, per de story's Story 2.3-precedent).
- **Twee reële, vóóraf onbekende gaten opgelost die niet in de oorspronkelijke epics.md-tekst stonden**: `googleEventId` werd nooit opgeslagen (Story 2.3/3.1's bewuste, toen-geldende scope-grens), en een zelf-botsing in de capaciteitscheck die een taak nooit terug op haar eigen dag had kunnen plaatsen. Beide waren noodzakelijk om AC #1 daadwerkelijk correct te implementeren, geen scope creep.
- **Bewuste asymmetrie met `create-task.ts`**: geen compenserende rollback bij een falende Calendar-call tijdens herberekening (in tegenstelling tot bij taakcreatie) — de taak bestond al geldig, de nieuwe sessieplaatsing blijft dus staan. Expliciet gedocumenteerd in Dev Notes, niet stilzwijgend anders dan het creatie-pad.
- **Drie Open Questions blijven open voor Hillebrand** (geen API-route, geen rollback bij Calendar-falen, geïsoleerde stapelings-offset-duplicatie) — geen van alle blokkeerde de implementatie.

### File List

**Nieuw:**
- `server/domain/scheduling/recalculate.ts`
- `server/data/migrations/0008_bored_wendell_rand.sql` (+ bijbehorende meta-bestanden)

**Gewijzigd:**
- `server/data/schema.ts` (nieuwe `sessions.googleEventId`-kolom)
- `server/data/tasks.ts` (`getTaskById`, `getSessionForTask`, `updateSessionPlacement`, `sumPlannedMinutesForUserOnDate` uitgebreid met `excludeTaskId`)
- `server/domain/scheduling/doelmoment.ts` (`findSessionDate` uitgebreid met `excludeTaskId`; code review: `SESSION_ANCHOR_HOUR` hier geplaatst, was oorspronkelijk in `create-task.ts`)
- `server/domain/tasks/create-task.ts` (`googleEventId` daadwerkelijk opgeslagen, incl. compenserende Calendar-event-opruiming bij een falende opslag; code review: `SESSION_ANCHOR_HOUR` nu geïmporteerd i.p.v. lokaal gedefinieerd)

**Live gedeployed:** stage `dev` op `flowz.fyi`, migratie toegepast op de echte Turso-database. Tijdelijke debug-route (`server/api/_debug/recalculate-test.post.ts`) en verificatiescripts zijn ná gebruik verwijderd en horen niet bij deze File List.
