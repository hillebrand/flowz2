---
baseline_commit: 065210a
---

# Story 6.8: Wijzigingslog & Toelichting bij Automatische Herplanning

Status: review

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
  - [ ] Live geverifieerd (als Evelien): **niet gedaan — geen toegang tot haar Google-login.** Zie Completion Notes/Open Questions.

## Dev Notes

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

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx sst shell --stage dev -- npx drizzle-kit generate` — `0023_dusty_banshee.sql` aangemaakt
- `npx sst shell --stage dev -- npx drizzle-kit migrate` — geslaagd tegen de dev-database
- `npm run typecheck` — exit 0
- `npx nuxt build` — exit 0 (`.output/server/index.mjs`, 750 kB)

### Completion Notes List

- Snapshot-diff-aanpak (Belangrijk punt 2-3) geïmplementeerd als gedeelde helpers (`snapshotSessionStarts`, `diffSessionSnapshots`, `logSnapshotDiff`) in `startup-check.ts` zelf — geen wijziging aan `recalculateTaskPlanning`/`applyShortfallRecommendation`, precies zoals de story vereiste (die functies hebben ook niet-loop-gerelateerde aanroepers).
- Shortfall-lus: taak-id per aanbeveling afgeleid via een lokaal herhaalde `extractHerplannenTaskId` (leest alleen `recommendation.id`, geen duplicaat van `apply-recommendation.ts`'s interne mutatie-logica) — bewust niet die interne `parseTaskAndSessionId` geëxporteerd/hergebruikt, zelfde "onafhankelijke aanroepers, eigen faalscenario"-precedent als de rest van dit bestand.
- `ReplanLogDialog.vue` is één herbruikbare component (`idPrefix`-prop) i.p.v. de dialoog-logica dubbel te schrijven op Home en het weekoverzicht — hergebruikt het al-bestaande `useFocusTrap`-composable (2026-09-07) voor focus-trap/Escape/focus-herstel, geen nieuw dialoog-patroon.
- **Eerlijke stand van Task 5:** geen geautomatiseerde tests toegevoegd — dit project heeft nergens een testsuite (bevestigd, zie ook Story 6.7's eigen Dev Notes-precedent van "typecheck/build + live-verificatie" als enige kwaliteitspoort). `typecheck`/`build` zijn beide schoon. De live-als-Evelien-verificatie die de story vraagt kon ik niet uitvoeren: haar Google-login vereist een wachtwoord dat ik niet heb en ook niet zou invoeren als ik het had. Dit is bewust NIET als voltooid gemarkeerd (zie Task 5's checkbox en Open Questions) — geen valse "klaar"-claim.
- Migratie (`0023_dusty_banshee.sql`) is al toegepast op de dev-database (`npx sst shell -- npx drizzle-kit migrate`), dus de `replan_change_log`-tabel bestaat al live vóór deploy van de applicatiecode — geen aparte migratiestap meer nodig bij deploy.

### File List

- `server/data/schema.ts` (gewijzigd — nieuwe `replanChangeLog`-tabel + `ReplanChangeLogEntry`/`NewReplanChangeLogEntry`-types, nieuwe import van `LoopSource`)
- `server/data/migrations/0023_dusty_banshee.sql` (nieuw — gegenereerd, toegepast op dev)
- `server/data/replan-log.ts` (nieuw — `insertReplanLogEntries`, `getLatestReplanLogEntriesForUser`)
- `shared/types/replan-log.d.ts` (nieuw — `LoopSource`, `ReplanLogEntryDto`, `ReplanLogResponse`)
- `server/domain/scheduling/startup-check.ts` (gewijzigd — `runId`-generatie, `LOOP_REASONS`, `snapshotSessionStarts`/`diffSessionSnapshots`/`logSnapshotDiff`, `extractHerplannenTaskId`, alle vier lussen roepen nu de snapshot-diff-logging aan)
- `server/api/scheduling/replan-log/latest.get.ts` (nieuw)
- `app/components/ReplanLogDialog.vue` (nieuw)
- `app/pages/index.vue` (gewijzigd — `<ReplanLogDialog id-prefix="home" />` toegevoegd naast `home-replan-button`)
- `app/pages/week/index.vue` (gewijzigd — `<ReplanLogDialog id-prefix="week" />` toegevoegd naast `week-replan-button`)
