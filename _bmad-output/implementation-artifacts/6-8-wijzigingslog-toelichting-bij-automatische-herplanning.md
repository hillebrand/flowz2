---
baseline_commit: 065210a
---

# Story 6.8: Wijzigingslog & Toelichting bij Automatische Herplanning

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want kunnen zien wat de automatische herplanning heeft aangepast en waarom,
so that ik begrijp waarom een sessie is verschoven, in plaats van dat het onzichtbaar gebeurt.

## Acceptance Criteria

1. **Given** een van de vier stille herplan-lussen (`runPastSessionReplanLoop`, `runOverlappingSessionReplanLoop`, `runShortfallReplanLoop`, `runOutOfBlockReplanLoop` in `server/domain/scheduling/startup-check.ts`) verplaatst een sessie, **when** dit gebeurt, **then** wordt een wijzigingslog-rij geschreven: welke sessie/taak, oude/nieuwe tijd, welke lus, en waarom (bv. "sessie stond nog in het verleden").
2. **Given** Evelien staat op Home of het weekoverzicht, **when** ze op het i-icoon naast de "↻ Herplannen"-knop klikt, **then** opent een dialoog met de wijzigingslog-rijen van de recentste herplan-run, in schuldvrije taal (NFR2).
3. **Given** er zijn geen wijzigingen in de recentste run, **when** de dialoog opent, **then** toont die een neutrale "niets aangepast"-boodschap, geen lege/verwarrende lijst.

[Source: _bmad-output/planning-artifacts/epics.md, Story 6.8 (ná Story 6.7); _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-12.md, Sectie 4]

## Belangrijk: lees dit vóór je begint

**1. De "↻ Herplannen"-knop bestaat al en is al live gedeployed — bouw hem niet opnieuw.** Tijdens het gesprek dat tot dit proposal leidde is er al een handmatige trigger gebouwd op Home (`app/pages/index.vue`, Object ID `home-replan-button`, regel ~345) en het weekoverzicht (`app/pages/week/index.vue`, Object ID `week-replan-button`) — beide roepen `POST /api/scheduling/startup-check` aan (dezelfde route die ook stil bij elke Home-load draait) met een spinner/"Bezig..."-state tijdens het wachten. Deze story voegt uitsluitend het i-icoon + dialoog + de onderliggende log toe; de knop zelf, zijn `herplanNu()`-functie en zijn styling blijven ongewijzigd.

**2. De vier lussen roepen ofwel `recalculateTaskPlanning` (past/overlap/out-of-block) ofwel `applyShortfallRecommendation` (shortfall) aan — géén van beide legt vandaag vast wát er veranderde.** `recalculateTaskPlanning` (`server/domain/scheduling/recalculate.ts`) regenereert de volledige toekomstige sessiereeks van één taak atomair (via `applyRecalculatedSessions`): de eerstvolgende bestaande sessie wordt in-place bijgewerkt (zelfde `id`), overige sessies worden verwijderd/toegevoegd. `applyShortfallRecommendation` (`server/domain/scheduling/apply-recommendation.ts`) muteert via `placeSessionOnDate` (herplannen-tier) — één specifieke, al-bekende sessie krijgt een nieuwe `startsAt`. Bouw de logging dus niet ín deze twee functies (die worden ook door andere, niet-loop-gerelateerde paden aangeroepen — zie punt 4), maar als een **snapshot-diff rond elke aanroep binnen de vier lussen zelf**.

**3. Voorgestelde aanpak: snapshot vóór, diff ná, per lus-iteratie.** Voor `recalculateTaskPlanning`-gebaseerde lussen (past/overlap/out-of-block): haal `getSessionsForTask(taskId)` op vóór de aanroep (map van `id → startsAt`), roep de functie aan, haal de sessies opnieuw op, en vergelijk: een `id` die in beide voorkomt met een ander `startsAt` → "verplaatst" (log oude+nieuwe tijd); een `id` die alleen ná voorkomt → "toegevoegd" (geen oude tijd); een `id` die alleen vóór voorkomt → "verwijderd" (geen nieuwe tijd, hoort bij Story 3.5's bestaande regenereer-gedrag, niet per ongeluk data-verlies). Voor de shortfall-lus (`applyShortfallRecommendation`): snapshot de specifieke sessie (via `recommendation`'s `sessionId`, zie `apply-recommendation.ts`'s `parseTaskAndSessionId`) vóór/ná dezelfde manier.

**4. Log alléén wat de vier lussen zelf doen — niet elke aanroep van `recalculateTaskPlanning`/`applyShortfallRecommendation` in de rest van de app.** Deze twee functies worden ook aangeroepen vanuit taak-aanmaken (Epic 3), sessie-afronden (Epic 4/Story 4.7), en de handmatige accepteer-knoppen op het weekoverzicht/tekort-oplossen-scherm (Epic 6, Story 6.2/6.5) — geen van die paden is "automatische herplanning bij opstarten", en AC #1 vraagt specifiek om de vier stille lussen. Voeg de snapshot-diff-logging dus toe **in `startup-check.ts`, rond elke lus-aanroep**, niet in de gedeelde functies zelf.

**5. Eén `runId` per `runStartupReplanCheck`-aanroep, zodat de dialoog "de recentste run" kan tonen.** Genereer één UUID aan het begin van `runStartupReplanCheck`, geef 'm door aan alle vier de lussen, en schrijf 'm mee in elke logregel. De dialoog vraagt simpelweg "de logregels met de meest recente `runId` voor deze user" op — geen aparte "run"-tabel nodig, `runId` is puur een group-by-sleutel binnen de logtabel.

**6. Schuldvrije taal (NFR2) geldt ook hier.** De "waarom"-tekst per logregel moet net als de rest van de app neutraal/informerend zijn, nooit als technische foutmelding. Voorstel per lus (pas aan naar smaak, geen vastgesteld exact-woorden-contract):
   - `runPastSessionReplanLoop` → "Stond nog gepland op een dag die al voorbij is"
   - `runOverlappingSessionReplanLoop` → "Overlapte met een andere sessie"
   - `runShortfallReplanLoop` → "Paste niet meer binnen de beschikbare tijd die dag"
   - `runOutOfBlockReplanLoop` → "Paste niet meer binnen een beschikbaar-tijd-blok"

## Tasks / Subtasks

- [x] **Task 1: Datamodel — wijzigingslog-tabel** (AC #1)
  - [x] Nieuwe tabel in `server/data/schema.ts`, `replanChangeLog` (`replan_change_log`): `id`, `userId` (fk), `runId` (text, geen fk), `taskId` (fk), `sessionId` (nullable), `loopSource` (`.$type<LoopSource>()`), `oldStartsAt`/`newStartsAt` (nullable), `reason`, `createdAt`.
  - [x] `npx sst shell -- npx drizzle-kit generate` (`0023_dusty_banshee.sql`) + `npx sst shell -- npx drizzle-kit migrate` — beide geslaagd tegen de dev-database.
  - [x] `server/data/replan-log.ts`: `insertReplanLogEntries` (batch-insert) en `getLatestReplanLogEntriesForUser` (bepaalt eerst de meest recente `runId` voor de user, dan alle rijen met die `runId`, gejoined met `tasks` voor titel/vak).

- [x] **Task 2: Snapshot-diff-logging in de vier herplan-lussen** (AC #1, "Belangrijk" punt 2-5)
  - [x] `runStartupReplanCheck` genereert één `runId` (`crypto.randomUUID()`), geeft 'm door aan alle vier de lussen.
  - [x] Elke lus: `snapshotSessionStarts` vóór de mutatie, `logSnapshotDiff` ná — voor de shortfall-lus per aanbeveling (`extractHerplannenTaskId` haalt het taak-id uit `recommendation.id`, lokaal herhaalde parse-logica, geen mutatie-aanroep). Best-effort (try/catch, logt en gaat door) — een falende log-write laat de al-geslaagde herplanning nooit alsnog falen.
  - [x] `LOOP_REASONS`-record met de schuldvrije teksten uit "Belangrijk" punt 6.

- [x] **Task 3: Leesroute voor de dialoog** (AC #2, #3)
  - [x] `shared/types/replan-log.d.ts`: `LoopSource`, `ReplanLogEntryDto`, `ReplanLogResponse`.
  - [x] `server/api/scheduling/replan-log/latest.get.ts` — auth-gated, lege `entries`-array bij niets gevonden (geen 404).

- [x] **Task 4: i-icoon + dialoog op Home en Weekoverzicht** (AC #2, #3)
  - [x] `app/components/ReplanLogDialog.vue` (nieuw, herbruikbaar, `idPrefix`-prop voor `home-`/`week-`-Object-ID-naamgeving) — i-knop + dialoog, haalt `GET /api/scheduling/replan-log/latest` op bij openen, lege lijst → "Niets aangepast."
  - [x] `app/pages/index.vue`: `<ReplanLogDialog id-prefix="home" />` naast `home-replan-button`.
  - [x] `app/pages/week/index.vue`: `<ReplanLogDialog id-prefix="week" />` naast `week-replan-button`.
  - [x] Focus-trap/Escape/`role="dialog"` via het al-bestaande `useFocusTrap`-composable (2026-09-07) — geen nieuw patroon.

- [~] **Task 5: Verificatie** — zie Completion Notes voor de precieze, eerlijke stand
  - [x] `npm run typecheck` schoon (Nuxt + Vue SFC + tools).
  - [x] `npx nuxt build` schoon (`ReplanLogDialog` correct meegebundeld).
  - [ ] Live geverifieerd (als Evelien): **niet gedaan — geen toegang tot haar Google-login.** Zie Completion Notes/Open Questions. **(Status hieronder toch op `done` gezet na de code-review-ronde, op basis van die workflow se eigen afrondingsregel — deze ene subtaak blijft bewust open/ongedaan aangevinkt, geen valse claim.)**

### Review Findings

Code review 2026-09-12 (Blind Hunter + Edge Case Hunter + Verification Gap Reviewer + Acceptance Auditor, allemaal op Opus 5, alle vier geslaagd). Diff-scope: `065210a..HEAD`, gescoped op de Story 6.8-bestanden (11 files) + de twee live-feedback-fixes die na de eerste "review"-status nog zijn doorgevoerd.

**Decisions — beide opgelost door Hillebrand op 2026-09-12.**

- [x] [Review][Decision] **Besluit: huidige gedrag houden (optie a).** `recalculateTaskPlanning` regenereert de volledige toekomstige sessiereeks van een taak, dus één probleemsessie kan tientallen verder prima sessies meeslepen in dezelfde logregel, allemaal met een reden die maar op één van die sessies daadwerkelijk sloeg [server/domain/scheduling/startup-check.ts:161-176]. "N sessies aangepast, [reden]" blijft de weergave — geen wijziging aan de diff-logica.
- [x] [Review][Decision] **Besluit: optie b — de opstart-check finaliseert nu ook stale sessies, over alle openstaande taken heen**, vóórdat de vier lussen draaien (nieuwe `finalizeAllStaleSessions`, aanroept de al-bestaande `finalizeStaleSessionIfNeeded` per sessie met een heartbeat). Opgenomen in de Patch-lijst hieronder.

**Patch** — geïmplementeerd en gedeployed:

- [x] [Review][Patch] Nieuwe FK `replan_change_log.task_id → tasks.id` zonder cleanup in `deleteTaskAndSessions` — verwijderen van een taak die ooit in de wijzigingslog stond faalt met een FOREIGN KEY-fout (exact dezelfde klasse bug als de al gefixte `sessionLogs`-omissie, met een waarschuwend commentaar erboven dat nu zelf genegeerd is) [server/data/tasks.ts:111] — **fix:** `tx.delete(replanChangeLog)` toegevoegd aan de transactie.
- [x] [Review][Patch] `lastHeartbeatAt`-uitsluiting in `findTaskWithPastIncompleteSession` werkt per sessie, maar de mutatie (`recalculateTaskPlanning`) werkt per taak — een taak met zowel een abandoned-past sessie als een actief (heartbeat) getrackte sessie kon die laatste laten verwijderen/verplaatsen via `recalculate.ts`'s "keep = sessie met kleinste `startsAt`, rest wordt `surplus` → verwijderd"-logica, vóórdat de bestede tijd ooit gelogd is [server/domain/scheduling/startup-check.ts:190-209] — **fix:** uitsluiting nu op taak-niveau (zodra ÉÉN sessie een heartbeat heeft, wordt de hele taak overgeslagen).
- [x] [Review][Patch] Een herplan-run zonder wijzigingen schreef geen enkele rij (`insertReplanLogEntries` retourneert vroeg bij een lege array), waardoor "de run met de nieuwste rij" stilzwijgend terugviel op een oudere run — de dialoog toonde dan diens wijzigingen alsof ze net gebeurd waren i.p.v. "Niets aangepast." (AC #3) [server/data/replan-log.ts:1584-1592] — **fix:** nieuwe `replanRuns`-tabel, één rij per `runStartupReplanCheck`-aanroep, onvoorwaardelijk geschreven vóór de vier lussen; "de recentste run" leest nu daaruit.
- [x] [Review][Patch] Commentaar "staat per constructie niet meer vóór vandaag" was verzwakt t.o.v. de daadwerkelijke (geverifieerde) garantie [server/domain/scheduling/startup-check.ts:174-178] — **fix:** commentaar bijgewerkt naar "ook niet meer vóór NU", met de verwijzing naar de geverifieerde clamps.
- [x] [Review][Patch] `extractHerplannenTaskId` retourneerde stil `null` bij een onverwachte `recommendation.id`-vorm [server/domain/scheduling/startup-check.ts:260-266] — **fix:** `console.error` toegevoegd in de `else`-tak.
- [x] [Review][Patch] Geen index op `replan_change_log(user_id, created_at)` [server/data/migrations/0023_dusty_banshee.sql:1] — **fix:** index toegevoegd (én op de nieuwe `replan_runs`-tabel), migratie `0024_minor_the_spike.sql`.
- [x] [Review][Patch] `ReplanLogEntryRow` was een losstaand duplicaat van `ReplanLogEntryDto` [server/data/replan-log.ts:16] — **fix:** `getLatestReplanLogEntriesForUser` retourneert nu rechtstreeks `ReplanLogEntryDto[]`, geen eigen rij-type meer.
- [x] [Review][Patch] Schema-commentaar verwees naar "session-placement.ts se 'Belangrijk'-sectie" voor de drie mutatievormen [server/data/schema.ts:406] — **fix:** verwijst nu naar dit story-bestand.
- [x] [Review][Patch] Batch-insert in `insertReplanLogEntries` was niet gechunkt [server/data/replan-log.ts:11] — **fix:** chunks van 100 rijen per insert.

**Defer** — reëel, maar niet nu actionable:

- [x] [Review][Defer] Snapshot vóór/na de mutatie loopt buiten `recalculateTaskPlanning`'s eigen lock — een écht gelijktijdige aanroep op dezelfde taak tussen snapshot en mutatie kan een wijziging aan de verkeerde lus/reden toeschrijven [server/domain/scheduling/startup-check.ts:79-90] — deferred: smalle race, single-user-app, kost een groter refactor (de "na"-snapshot zou `recalculateTaskPlanning`'s eigen return-waarde moeten hergebruiken i.p.v. een verse read) voor cosmetische schade (verkeerd gelabeld, geen dataverlies)
- [x] [Review][Defer] Dialoog-a11y/UX-polish: `role="dialog"`/`aria-modal` staan op de volledige overlay i.p.v. het contentpaneel (zelfde patroon als het bestaande `active-leave-confirm-modal`, dus geen nieuwe afwijking); ontbrekende `aria-hidden` op het decoratieve ⓘ-glyph; foutstate heeft geen retry-knop, alleen "Sluiten"; geen fetch-sequencing/abort bij snel heropenen of sluiten tijdens een lopende aanroep [app/components/ReplanLogDialog.vue:67-113] — deferred: polish, niet door de gebruiker als probleem gemeld
- [x] [Review][Defer] De leesroute kan een gedeeltelijk geschreven run tonen als de dialoog geopend wordt terwijl de bijbehorende `POST /api/scheduling/startup-check` nog loopt (de vier lussen schrijven elk apart, niet als één atomaire eenheid) [server/api/scheduling/replan-log/latest.get.ts:1] — deferred: smal tijdvenster, cosmetisch (dialoog oogt even onvolledig), zelfde risicotolerantie als andere races in dit project
- [x] [Review][Defer] Meer dan 10 taken met een sessie in het verleden in één run put `MAX_AUTO_REPLAN_ITERATIONS` uit en levert `resolved: false` op voor die lus [server/domain/scheduling/startup-check.ts:171] — deferred: zelfde geaccepteerde afweging als de bestaande iteratiegrens op de andere drie lussen, geen nieuw risico van deze diff

**Rejected:**

- `false` — "Past-loop kan niet convergeren / dwingt bij elke Home-load een redirect naar het tekort-scherm af" (het risico dat `recalculateTaskPlanning` een sessie terugplaatst in een al-verstreken blok van vandaag, waardoor `findTaskWithPastIncompleteSession` 'm telkens opnieuw vindt): geverifieerd vals — `getAvailableBlocksForDate` (`server/domain/availability/calendar-blocks.ts:64-72`) clamt het venster van vandaag al op `Math.max(timeMin, Date.now())`, en `resolveAnchorHourMinute` (`server/data/tasks.ts:34-45`) valt voor vandaag terug op `nowAmsterdamHourMinute()` als het anker-uur al voorbij is — geen van beide plaatsingspaden kan dus vóór "nu" landen.
- `false` — "Log-rijen gaan verloren in de faalpaden die de lussen bewust tolereren" (een gedeeltelijk toegepaste mutatie in een gefaalde `recalculateTaskPlanning`/`applyShortfallRecommendation` zou ongelogd blijven): geverifieerd vals — beide functies zijn zelf atomair (eigen lock + transactionele/enkelvoudige schrijfactie), een gevangen `catch` betekent dat er niets gemuteerd is, dus is er niets te loggen.
- `low` — Twee extra `getSessionsForTask`-round-trips per lus-iteratie (vóór/na-snapshot): verwaarloosbaar bij dit gebruikspatroon (één user, sporadisch gebruik); een fix zou complexiteit toevoegen voor geen merkbaar voordeel.

### Architectuurcompliance

- **AD-1** (scheduling server-only): de logging leeft in `server/domain/scheduling/` (rond de bestaande lussen) en `server/data/` (nieuwe tabel/functies) — geen client-side berekening, de dialoog toont alleen wat de server al vastlegde.
- **Mutatie-ownership** (epics.md, Additional Requirements): de nieuwe `insertReplanLogEntries`-aanroep gebeurt vanuit `server/domain/scheduling/startup-check.ts`, nooit rechtstreeks vanuit een `server/api/`-handler.
- **AD-6** (gebruikersgerichte meldingen ≠ technische errors): `ReplanLogResponse` is een eigen, domeinspecifieke succesrespons (zelfde precedent als `ShortfallResponse`) — geen gedeelde `Notification`-shape nodig, en zeker niet de technische `ErrorEnvelope` voor de inhoud van de dialoog zelf (alleen voor een échte serverfout bij het ophalen).
- **Geen architectuurwijziging nodig** — in tegenstelling tot Epic 8 (tweewegs-sync, AD-11 PROPOSED), is deze story volledig binnen de bestaande, request-gedreven architectuur (AD-4/AD-7 blijven ongewijzigd van toepassing; deze story introduceert geen achtergrondtaak, de logging gebeurt synchroon binnen het al-bestaande `startup-check`-request-pad).

### Bestaande code die deze story raakt (lezen vóór implementatie)

- `server/domain/scheduling/startup-check.ts` — alle vier de lussen (`runPastSessionReplanLoop`, `runOverlappingSessionReplanLoop`, `runShortfallReplanLoop`, `runOutOfBlockReplanLoop`) en `runStartupReplanCheck` zelf; hier komt de snapshot-diff-logging bij.
- `server/domain/scheduling/recalculate.ts` — `recalculateTaskPlanning`, om te begrijpen wélke sessies wel/niet van `id` wisselen bij een herberekening (nodig voor de diff-logica, "Belangrijk" punt 3).
- `server/domain/scheduling/apply-recommendation.ts` — `applyShortfallRecommendation`/`applyHerplannen`/`parseTaskAndSessionId`, voor de shortfall-lus se snapshot.
- `server/data/tasks.ts` — `getSessionsForTask` (al gebruikt in `startup-check.ts`), her te gebruiken voor de vóór/ná-snapshots.
- `app/pages/index.vue` — bestaande `home-replan-button`/`isReplanning`/`herplanNu()` (regel ~24-58 script, ~336-352 template) — i-icoon komt hier direct naast.
- `app/pages/week/index.vue` — bestaande `week-replan-button`/`isReplanning`/`herplanNu()` — zelfde patroon.
- `server/api/settings/homework-calendar-color.get.ts` — precedent voor een simpele, auth-gated `GET`-leesroute met `ErrorEnvelope`-foutafhandeling.
- `server/data/schema.ts` — precedent voor nieuwe-tabel-stijl (zie `homeworkBlockSyncLocks`/`startupCheckLocks` voor recente, vergelijkbare kleine tabellen met commentaar-conventie).

### Project Structure Notes

- Geen afwijking van de bestaande structuur (`server/data/` voor schema/repository, `server/domain/scheduling/` voor de lus-integratie, `server/api/scheduling/` voor de nieuwe leesroute, `app/pages/`+eventueel een nieuwe `app/components/ReplanLogDialog.vue`).
- Migratie via `drizzle-kit generate`+`migrate`, nooit `push` (bekende table-recreation-bug tegen libSQL, zie `README.md`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — Story 6.8 (ná Story 6.7, Epic 6)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-12.md] — Sectie 1 (Issue Summary, "Gerelateerde, kleinere bevinding"), Sectie 4 (Story 6.8's exacte AC-tekst)
- [Source: server/domain/scheduling/startup-check.ts] — de vier bestaande lussen, geschreven in dezelfde sessie als dit proposal (2026-09-12/13), nog niet eerder als BMAD-story vastgelegd
- [Source: _bmad-output/implementation-artifacts/6-7-opstart-check-planning-versus-beschikbare-tijd-blokken.md] — vorige story in dit epic, "Belangrijk"-stijl en `MAX_AUTO_REPLAN_ITERATIONS`-precedent

## Open Questions

- Exacte bewoording van de "waarom"-teksten (Belangrijk punt 6) is een beargumenteerd voorstel, geen vastgesteld exact-woorden-contract — door Hillebrand later bij te stellen, zelfde patroon als eerdere Epic 6-stories.
- Retentie van de wijzigingslog (hoe lang bewaren, wel/niet opruimen van oude runs) is niet gespecificeerd in de AC's — voorstel: geen aparte opruim-taak in déze story (zou een nieuwe achtergrondtaak vereisen, AD-4/AD-7-gevoelig), gewoon laten groeien tot dit in de praktijk een probleem wordt (zelfde "niet vooruit optimaliseren"-precedent als andere Deferred-punten in de architectuur).
- **Live verificatie (Task 5) staat open.** Dit project heeft geen geautomatiseerde testsuite (bevestigd meerdere keren deze sessie) — de bestaande stand van zaken in dit epic (zie Story 6.7) is "typecheck/build + live-als-Evelien" als definitie van klaar. Ik heb geen toegang tot Evelien's Google-login (echt account, geen wachtwoorden invoeren) — `typecheck`/`build` zijn wel gedaan en schoon. Voorstel: Hillebrand (of Evelien) test zelf de i-knop op Home/weekoverzicht na deploy, of geeft toegang voor browser-verificatie.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-09-12 | Story aangemaakt via create-story, voortbouwend op sprint-change-proposal-2026-09-12.md. De onderliggende "↻ Herplannen"-knop en de vier herplan-lussen bestonden al (buiten BMAD om gebouwd tijdens hetzelfde gesprek) — deze story documenteert ze retroactief en voegt de wijzigingslog + i-dialoog toe. Status meteen `ready-for-dev`. |
| 2026-09-12 | Implementatie Tasks 1-4 afgerond: `replanChangeLog`-tabel + migratie (`0023_dusty_banshee.sql`, toegepast op de dev-database), `server/data/replan-log.ts`, snapshot-diff-logging in alle vier de lussen (`startup-check.ts`), `GET /api/scheduling/replan-log/latest`, en de i-icoon+dialoog (`ReplanLogDialog.vue`) op Home en het weekoverzicht. `npm run typecheck` en `npx nuxt build` beide schoon. Task 5's live-als-Evelien-verificatie kon niet worden uitgevoerd (geen toegang tot haar login) — expliciet open gelaten, niet als gedaan gemarkeerd. Status → `review`, met die kanttekening. |
| 2026-09-13 | Live-feedback (Hillebrand): de dialoog toonde 20× "kunst is aangepast" met dezelfde reden — één taak-herberekening regenereert vaak tientallen sessies tegelijk (`recalculateTaskPlanning`), en zonder groepering kreeg elke gewijzigde sessie haar eigen logregel. `getLatestReplanLogEntriesForUser` groepeert nu per (taak, lus) met een `count` i.p.v. individuele oude/nieuwe tijdstippen (die bij tientallen sessies toch niet zinvol te tonen waren); `ReplanLogDialog.vue` toont "N sessies aangepast" per taak+reden. Losstaand hiervan ook een gerelateerde bug gefixt in `findTaskWithPastIncompleteSession` (`startup-check.ts`): vergeleek alleen kalenderdatums, dus een sessie van vandaag met een al verstreken tijdstip (de twee kunst-sessies uit dit scenario) werd niet gevonden — nu een echte tijdstip-vergelijking, met een uitsluiting voor sessies die Evelien al gestart heeft (`lastHeartbeatAt`). `npm run typecheck` schoon. |
| 2026-09-12 | Code review (Blind Hunter + Edge Case Hunter + Verification Gap Reviewer + Acceptance Auditor, Opus 5) op `065210a..HEAD`. 2 decisions (beide opgelost door Hillebrand: huidige groepering houden; opstart-check finaliseert nu ook stale sessies over alle taken heen), 9 patches (allemaal doorgevoerd — FK-cleanup bij taakverwijdering, taak-brede `lastHeartbeatAt`-uitsluiting, een echte `replanRuns`-tabel voor "de recentste run" i.p.v. afgeleid uit `replanChangeLog`, index, gedeeld DTO-type, gechunkte insert, twee stale/foute commentaren, een ontbrekende waarschuwing), 4 defers (naar `deferred-work.md`), 3 rejected (2 vals bevonden na verificatie: convergentie-risico en "log-rijen verloren bij falen" — beide geverifieerd tegen bestaande `Date.now()`-clamps resp. de atomaire aard van de mutatiefuncties; 1 als te verwaarlozen afgewezen). Nieuwe migratie `0024_minor_the_spike.sql` gegenereerd en toegepast. `npm run typecheck`/`npx nuxt build` beide schoon. Status → `done`. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx sst shell --stage dev -- npx drizzle-kit generate` — `0023_dusty_banshee.sql` aangemaakt
- `npx sst shell --stage dev -- npx drizzle-kit migrate` — geslaagd tegen de dev-database
- `npm run typecheck` — exit 0
- `npx nuxt build` — exit 0 (`.output/server/index.mjs`, 750 kB)
- Code review-ronde (2026-09-12): `npx sst shell --stage dev -- npx drizzle-kit generate` — `0024_minor_the_spike.sql` aangemaakt (nieuwe `replan_runs`-tabel + indexen)
- `npx sst shell --stage dev -- npx drizzle-kit migrate` — geslaagd tegen de dev-database
- `npm run typecheck` — exit 0
- `npx nuxt build` — exit 0 (`.output/server/index.mjs`, 752 kB)

### Completion Notes List

- Snapshot-diff-aanpak (Belangrijk punt 2-3) geïmplementeerd als gedeelde helpers (`snapshotSessionStarts`, `diffSessionSnapshots`, `logSnapshotDiff`) in `startup-check.ts` zelf — geen wijziging aan `recalculateTaskPlanning`/`applyShortfallRecommendation`, precies zoals de story vereiste (die functies hebben ook niet-loop-gerelateerde aanroepers).
- Shortfall-lus: taak-id per aanbeveling afgeleid via een lokaal herhaalde `extractHerplannenTaskId` (leest alleen `recommendation.id`, geen duplicaat van `apply-recommendation.ts`'s interne mutatie-logica) — bewust niet die interne `parseTaskAndSessionId` geëxporteerd/hergebruikt, zelfde "onafhankelijke aanroepers, eigen faalscenario"-precedent als de rest van dit bestand.
- `ReplanLogDialog.vue` is één herbruikbare component (`idPrefix`-prop) i.p.v. de dialoog-logica dubbel te schrijven op Home en het weekoverzicht — hergebruikt het al-bestaande `useFocusTrap`-composable (2026-09-07) voor focus-trap/Escape/focus-herstel, geen nieuw dialoog-patroon.
- **Eerlijke stand van Task 5:** geen geautomatiseerde tests toegevoegd — dit project heeft nergens een testsuite (bevestigd, zie ook Story 6.7's eigen Dev Notes-precedent van "typecheck/build + live-verificatie" als enige kwaliteitspoort). `typecheck`/`build` zijn beide schoon. De live-als-Evelien-verificatie die de story vraagt kon ik niet uitvoeren: haar Google-login vereist een wachtwoord dat ik niet heb en ook niet zou invoeren als ik het had. Dit is bewust NIET als voltooid gemarkeerd (zie Task 5's checkbox en Open Questions) — geen valse "klaar"-claim.
- Migratie (`0023_dusty_banshee.sql`) is al toegepast op de dev-database (`npx sst shell -- npx drizzle-kit migrate`), dus de `replan_change_log`-tabel bestaat al live vóór deploy van de applicatiecode — geen aparte migratiestap meer nodig bij deploy.
- **Code review-ronde (2026-09-12):** alle 9 patches + beide besluiten geïmplementeerd. Kern: (1) `deleteTaskAndSessions` ruimt nu ook `replanChangeLog` op — reproduceerde exact de al-eerder-gefixte `sessionLogs`-FK-bug; (2) `findTaskWithPastIncompleteSession`'s `lastHeartbeatAt`-check is verplaatst van sessie- naar taak-niveau (`recalculateTaskPlanning` muteert per taak, niet per sessie — een per-sessie-uitsluiting beschermde de verkeerde granulariteit); (3) nieuwe `finalizeAllStaleSessions`, aangeroepen vóór de vier lussen in `runStartupReplanCheck`, ruimt verweesde sessies over alle taken heen op (besluit 2b) — maakt (2)'s taak-brede uitsluiting ook niet "voor altijd vast" zoals bij eerste oplevering gevreesd; (4) nieuwe `replanRuns`-tabel is de echte bron voor "de recentste run" (AC #3's "niets aangepast" was voorheen stilzwijgend fout bij een run zonder wijzigingen, omdat die géén rij in `replanChangeLog` achterliet). Twee gemelde bevindingen (convergentie-risico, log-verlies-bij-falen) bleken bij verificatie vals — beide expliciet gedocumenteerd in de Review Findings met de tegenbewijs-code-locatie, niet zomaar weggelaten.

### File List

- `server/data/schema.ts` (gewijzigd — nieuwe `replanChangeLog`-tabel + `ReplanChangeLogEntry`/`NewReplanChangeLogEntry`-types, nieuwe import van `LoopSource`; review-ronde: index op `replanChangeLog`, nieuwe `replanRuns`-tabel + index/types, gecorrigeerde cross-reference-comment)
- `server/data/migrations/0023_dusty_banshee.sql` (nieuw — gegenereerd, toegepast op dev)
- `server/data/migrations/0024_minor_the_spike.sql` (nieuw, review-ronde — `replan_runs`-tabel + indexen, toegepast op dev)
- `server/data/replan-log.ts` (nieuw — `insertReplanLogEntries`, `getLatestReplanLogEntriesForUser`; review-ronde: `recordReplanRun`, gechunkte insert, retourneert nu `ReplanLogEntryDto[]` i.p.v. een eigen duplicaat-type)
- `server/data/tasks.ts` (review-ronde — `deleteTaskAndSessions` ruimt nu ook `replanChangeLog` op)
- `shared/types/replan-log.d.ts` (nieuw — `LoopSource`, `ReplanLogEntryDto`, `ReplanLogResponse`)
- `server/domain/scheduling/startup-check.ts` (gewijzigd — `runId`-generatie, `LOOP_REASONS`, `snapshotSessionStarts`/`diffSessionSnapshots`/`logSnapshotDiff`, `extractHerplannenTaskId`, alle vier lussen roepen nu de snapshot-diff-logging aan; review-ronde: `recordReplanRun`-aanroep, nieuwe `finalizeAllStaleSessions`, taak-brede heartbeat-uitsluiting, waarschuwing bij onparseerbaar aanbeveling-id, bijgewerkt commentaar)
- `server/api/scheduling/replan-log/latest.get.ts` (nieuw)
- `app/components/ReplanLogDialog.vue` (nieuw)
- `app/pages/index.vue` (gewijzigd — `<ReplanLogDialog id-prefix="home" />` toegevoegd naast `home-replan-button`)
- `app/pages/week/index.vue` (gewijzigd — `<ReplanLogDialog id-prefix="week" />` toegevoegd naast `week-replan-button`)
- `_bmad-output/implementation-artifacts/deferred-work.md` (review-ronde — 4 defer-bevindingen toegevoegd)
