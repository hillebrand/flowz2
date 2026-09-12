---
baseline_commit: 0302814
---

# Story 8.1: Alleen-lezen Detectie-spike

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As developer,
I want een watch-kanaal + syncToken-sync bouwen die uitsluitend logt wat er gedetecteerd wordt,
so that de echo-detectie-aanname (Google's `updated`/`etag`-gedrag) tegen de échte Calendar gevalideerd is vóór er iets gemuteerd wordt.

## ⚠️ Dit is een experiment, geen feature — lees dit voordat je AC's als een gewone checklist behandelt

**Doel van deze story is een JA/NEE-antwoord voor Hillebrand, niet een afgeronde tweewegs-sync.** Epic 8 is expliciet **gated** achter AD-11 (`ARCHITECTURE-SPINE.md`, status PROPOSED, niet ADOPTED) — Story 8.2 (mutatie: een handmatige verplaatsing overnemen) en 8.3 (debounce) mogen **niet** gebouwd worden vóórdat déze spike is uitgevoerd, de uitkomst met Hillebrand besproken is, en hij AD-11 expliciet naar ADOPTED zet. Deze story zelf is de bewuste uitzondering op die gate — het IS het experiment waarvan de uitkomst die beslissing informeert.

**Wat dit betekent voor de implementatie:**
- **Geen mutatie aan `sessions`/`tasks`.** Deze spike mag Google Calendar-wijzigingen detecteren en erover loggen — nooit een sessie verplaatsen, een taak aanpassen, of iets terugschrijven naar Calendar buiten de al-bestaande `syncHomeworkBlocksForDate`-flow.
- **CloudWatch-logs zijn de uitkomst, geen nieuwe UI.** Geen dialoog, geen dashboard — een handmatige verplaatsing van een huiswerk-event moet gewoon een duidelijk herkenbare logregel opleveren (zie Task 5/6 voor het exacte experiment en de rapportage-vorm).
- **Rapporteer, besluit niet zelf.** Aan het einde van deze story hoort een concrete uitkomst ("de echo-detectie werkte/werkte niet, met dit bewijs") in de Completion Notes, plus een aanbeveling — de daadwerkelijke AD-11-GO/NO-GO-beslissing is aan Hillebrand, niet aan de implementatie van deze story.

## Acceptance Criteria (experiment-deliverables, geen klassieke feature-AC's)

1. **Given** Evelien (of een testaccount) heeft een gekoppelde huiswerk-Calendar-kleur ingesteld (Story 2.3), **when** een watch-kanaal voor die Calendar geregistreerd wordt, **then** ontvangt Flowz bij een wijziging aan die Calendar een push-notificatie op een nieuw, publiek webhook-endpoint, geverifieerd via `X-Goog-Channel-Token`.
2. **Given** een binnenkomende notificatie, **when** de (nieuwe) Cron-tick 'm binnen het debounce-venster oppikt, **then** wordt `events.list` met de opgeslagen `syncToken` aangeroepen, en voor elk gewijzigd event vergeleken of het Google `updated`-veld overeenkomt met wat Flowz zelf laatst schreef (`homeworkCalendarBlocks.lastKnownUpdated`) — resultaat gaat als een duidelijk herkenbare regel naar CloudWatch, nooit naar `sessions`/`tasks`.
3. **Given** Flowz zelf een huiswerk-event schrijft (via de al-bestaande `syncHomeworkBlocksForDate`-flow, bv. door een taak aan te maken), **when** de volgende Cron-tick die wijziging oppikt, **then** wordt die herkend als "eigen schrijfactie" (geen valse positief) — dit is de kern van wat de spike moet bewijzen.
4. **Given** een testgebruiker verplaatst een huiswerk-event handmatig in Google Calendar, **when** de volgende Cron-tick draait, **then** wordt die wijziging herkend als "externe/handmatige wijziging", onderscheidbaar van punt 3's "eigen schrijfactie"-regel.
5. **Given** een watch-kanaal nadert zijn vervaltermijn (Calendar: max. 7 dagen), **when** de Cron-tick draait, **then** wordt het kanaal vóór het verloopt vervangen door een nieuw kanaal (zelfde `syncToken`-continuïteit).
6. **Given** de spike heeft 24-48 uur live gedraaid, **when** Hillebrand de uitkomst opvraagt, **then** is er een concreet, in de Completion Notes vastgelegd antwoord op: klopte de echo-detectie-aanname, met welk bewijs (CloudWatch-regels/tijdstippen), en wat is de aanbeveling voor AD-11.

[Source: _bmad-output/planning-artifacts/epics.md, regels 951-963 (Epic 8/Story 8.1); _bmad-output/planning-artifacts/research/technical-google-calendar-tweewegs-synchronisatie-voor-huiswerk-blokken-research-2026-09-12.md, secties "Google Calendar API — detectiemechanismen", "Echo/lus-preventie", "Voorgestelde verwerkingspijplijn", "Gefaseerde opbouw" (Fase 1)]

## Belangrijk: technisch ontwerp — lees dit vóór je begint

**1. Twee Google Calendar-mechanismen, niet één, en ze zijn geen alternatieven voor elkaar.** `events.watch` (push-notificatie) levert **nooit de wijziging zelf** — alleen headers (`X-Goog-Resource-State: exists`, `X-Goog-Channel-ID`, geen body). Elke notificatie is dus alleen een trigger om `events.list` met de opgeslagen `syncToken` aan te roepen voor de daadwerkelijke diff. Zie het onderzoek se "Google Calendar API — detectiemechanismen" voor de volledige onderbouwing (met Source-links naar Google's eigen documentatie).

**2. Debounce via de Cron-tick, geen apart AWS-primitief.** Elke binnenkomende notificatie zet alleen `calendarWatchChannels.lastChangeNotifiedAt` (nieuw veld, zie Task 1) op "nu" — de webhook-route zelf doet verder niets, antwoordt meteen 200. De Cron-tick (elke ~2 minuten, zie Task 4) verwerkt een user pas als `lastChangeNotifiedAt` langer dan het debounce-venster (voorstel: 2 minuten) geleden is — dat vangt een snelle reeks wijzigingen (bv. Evelien ruilt twee sessies in twee stappen) op als één verwerkingsronde i.p.v. voortijdig te reageren op de eerste helft.

**3. Echo-detectie is GEEN kant-en-klaar Google-patroon — eigen boekhouding nodig.** Elk Calendar-event heeft een `updated`-veld dat Google bij ELKE schrijfactie bijwerkt, ook Flowz' eigen `updateHomeworkEvent`-aanroepen. Sla dat veld op het moment van Flowz' eigen schrijfactie op (nieuwe kolom `homeworkCalendarBlocks.lastKnownUpdated`, Task 1) — bij de volgende sync-diff: komt het binnenkomende `updated` overeen met de opgeslagen waarde → eigen echo, negeren; wijkt het af → een externe wijziging. Dit vraagt een wijziging aan `server/domain/calendar-sync/homework-events.ts` (`createHomeworkEvent`/`updateHomeworkEvent` geven vandaag alleen `{googleEventId}` terug, niet `updated` — zie Task 2) én aan `server/domain/calendar-sync/homework-blocks.ts`/`server/data/homework-blocks.ts` (die het nieuwe veld moeten opslaan).

**4. De Cron-handler draait BUITEN de Nuxt/Nitro-runtime — `server/data/db.ts`'s `getDb()` werkt daar niet ongewijzigd.** `getDb()` roept `useRuntimeConfig()` aan, een Nuxt-auto-import die niet bestaat in een losse Lambda-handler (`sst.aws.Cron`'s `job`-functie is een eigen, apart gebundelde Lambda, geen Nitro-route). De Cron-handler heeft zijn eigen, kale Turso-clientverbinding nodig (rechtstreeks `TURSO_DATABASE_URL` uit zijn eigen environment lezen, `Resource.TursoAuthToken.value` werkt wel gewoon via SST-linking) — geen `server/data/db.ts` hergebruiken zonder aanpassing. Zelfde aandachtspunt voor `decryptToken`/`encryptToken` (`server/data/crypto.ts`, gebruikt `Resource.TokenEncryptionKey` — dat werkt wél ongewijzigd, want die module gebruikt geen `useRuntimeConfig`).

**5. Geen mooie UI voor kanaal-registratie — één simpele, geauthenticeerde route is genoeg voor een spike.** Geen instellingenpagina-knop bouwen; een nieuwe `POST /api/calendar/homework-watch/register`-route die Evelien/Hillebrand eenmalig zelf aanroept (bv. via een browser-`fetch` in de devtools-console, of gewoon een curl met een geldige sessie-cookie) is voldoende. Bewust minimaal — als AD-11 een GO krijgt, hoort een echte UX-flow bij Epic 8's latere stories, niet bij deze spike.

**6. Beveiliging van het webhook-endpoint.** `X-Goog-Channel-Token`: een zelfgekozen, geheim token dat je meegeeft bij het aanmaken van het watch-kanaal (`events.watch`'s `token`-veld); het endpoint verifieert dat elke binnenkomende notificatie exact dat token in de `X-Goog-Channel-Token`-header heeft, anders 404/403 zonder verdere verwerking. Sla het token op in `calendarWatchChannels` (niet als apart SST-secret — het is per-user/per-kanaal, geen app-breed geheim, AD-5 is hier niet van toepassing). De webhook-route zelf heeft geen gebruikerssessie (Google roept 'm aan, niet Eveliens browser) — authenticatie loopt volledig via dit token.

**7. Registratie gebruikt dezelfde Calendar als waar huiswerk-events al in staan.** `events.watch` registreren op `calendars/primary/events` (zelfde `CALENDAR_EVENTS_URL` als `homework-events.ts` al gebruikt voor schrijven) — niet op de beschikbare-tijd-agenda (die blijft onder AD-4's onvoorwaardelijke pull-only-regel, AD-11 geldt uitsluitend voor de huiswerk-Calendar, zie de architectuur se AD-11-tekst).

## Tasks / Subtasks

- [ ] **Task 1: Datamodel** (AC #1, #2, #5)
  - [ ] Nieuwe tabel `server/data/schema.ts`: `calendarWatchChannels` — `id` (uuid pk), `userId` (fk `users.id`, unique — één actief kanaal per user voor deze spike), `channelId` (text, het zelf-gekozen kanaal-id dat je aan Google meegeeft), `channelToken` (text, "Belangrijk" punt 6), `resourceId` (text, door Google teruggegeven bij `events.watch`), `syncToken` (text, nullable — leeg tot de eerste volledige sync), `expiresAt` (text, ISO-tijdstip), `lastChangeNotifiedAt` (text, nullable — "Belangrijk" punt 2), `createdAt`/`updatedAt`.
  - [ ] `homeworkCalendarBlocks` (bestaande tabel, `server/data/schema.ts:334`): nieuwe kolom `lastKnownUpdated` (text, nullable) — "Belangrijk" punt 3.
  - [ ] `npx sst shell -- npx drizzle-kit generate` + `npx sst shell -- npx drizzle-kit migrate` (nooit `push`, zie `README.md`).

- [ ] **Task 2: `updated`-veld vastleggen bij Flowz' eigen schrijfacties** (AC #3, "Belangrijk" punt 3)
  - [ ] `server/domain/calendar-sync/homework-events.ts`: `createHomeworkEvent`/`updateHomeworkEvent` lezen Google's respons-`updated`-veld uit (`created.updated`/de PATCH-respons se `updated`) en geven die mee terug (`CreateHomeworkEventResult`/nieuw retourtype voor `updateHomeworkEvent`, die vandaag `void` teruggeeft).
  - [ ] `server/data/homework-blocks.ts`/`server/domain/calendar-sync/homework-blocks.ts`: `insertHomeworkBlock`/`updateHomeworkBlockTimes` slaan dat `updated`-veld op in de nieuwe `lastKnownUpdated`-kolom.

- [ ] **Task 3: Kanaal-registratie + webhook-ontvangroute** (AC #1)
  - [ ] Nieuwe `server/api/calendar/homework-watch/register.post.ts`: auth-gated, roept Google's `POST https://www.googleapis.com/calendar/v3/calendars/primary/events/watch` aan (`type: "web_hook"`, `address` = het publieke webhook-endpoint hieronder, zelf-gegenereerd `channelId`/`channelToken`), slaat het resultaat (`resourceId`, `expiration`) op in `calendarWatchChannels`. Bewust geen UI-knop ("Belangrijk" punt 5).
  - [ ] Nieuwe `server/api/calendar/homework-watch/notifications.post.ts`: **geen sessie-auth** (Google roept dit aan) — valideert `X-Goog-Channel-Token` tegen de opgeslagen `channelToken` voor het `channelId` in `X-Goog-Channel-ID`; bij een match: `lastChangeNotifiedAt` op "nu" zetten voor die user, antwoord 200. Geen match / onbekend kanaal: 404, geen verdere actie ("Belangrijk" punt 6).

- [ ] **Task 4: Cron-tick — kanaal-hernieuwing + syncToken-diff + detectie-logging** (AC #2, #3, #4, #5)
  - [ ] `sst.config.ts`: nieuw `sst.aws.Cron("CalendarWatchTick", { schedule: "rate(2 minutes)", job: "server/cron/calendar-watch-tick.handler" })`, `link: [tursoAuthToken, tokenEncryptionKey]` (zelfde secrets als de Nuxt-component, zie "Belangrijk" punt 4 voor waarom de handler zijn eigen DB-verbinding nodig heeft).
  - [ ] Nieuw `server/cron/calendar-watch-tick.ts` (`handler`-export): (a) elk kanaal met `expiresAt` binnen 24u: hernieuwen (nieuwe `events.watch`-aanroep, kanaal-rij bijwerken, `syncToken` behouden); (b) elke user met `lastChangeNotifiedAt` ouder dan het debounce-venster (2 min) én nog niet verwerkt: `events.list` met de opgeslagen `syncToken` aanroepen, per gewijzigd event de `updated`-vergelijking uit "Belangrijk" punt 3 doen, een duidelijk grep-bare regel loggen (bv. `console.log(\`[calendar-watch-spike] ECHO user=${userId} googleEventId=${event.id}\`)` vs. `EXTERNAL-CHANGE`), nieuwe `syncToken` opslaan, `lastChangeNotifiedAt` terug op `null`.
  - [ ] Nooit een sessie/taak aanpassen vanuit deze handler — puur logging (herhaling van de scope-grens hierboven, dit is de belangrijkste regel van de hele story).

- [ ] **Task 5: Live-experiment**
  - [ ] Deploy naar de dev-stage. Registreer een kanaal voor een testaccount (via Task 3's route).
  - [ ] Trigger een "eigen schrijfactie" (bv. een testtaak aanmaken met een huiswerk-kleur ingesteld) en bevestig in CloudWatch dat de volgende tick 'm als `ECHO` herkent — geen valse `EXTERNAL-CHANGE`.
  - [ ] Verplaats het bijbehorende huiswerk-event handmatig in Google Calendar en bevestig dat de volgende tick 'm als `EXTERNAL-CHANGE` logt.
  - [ ] Laat het kanaal 24-48 uur live staan (of tot vlak vóór de 7-dagen-vervaltermijn, wat het eerst komt) en bevestig dat de kanaal-hernieuwing (Task 4a) zichtbaar in CloudWatch draait zonder gat in de dekking.

- [ ] **Task 6: Rapportage** (AC #6)
  - [ ] Uitkomst + concreet bewijs (CloudWatch-tijdstempels/regels) + aanbeveling voor AD-11 vastleggen in de Completion Notes hieronder — geen eigen GO/NO-GO-besluit, dat is aan Hillebrand.

## Dev Notes

### Architectuurcompliance

- **AD-11 (PROPOSED)** — deze story ÍS de spike die AD-11's Rule beschrijft: uitsluitend voor de huiswerk-Calendar, één Cron-component, geen uitbreiding naar de beschikbare-tijd-agenda. Status blijft PROPOSED totdat Hillebrand na Task 6 een expliciet GO geeft.
- **AD-4/AD-7 (pull-only/synchroon, "geen achtergrondtaken")** — deze story bouwt de EERSTE, bewust afgebakende uitzondering (via AD-11). Alle overige Calendar-toegang in dit project (de beschikbare-tijd-agenda, alle bestaande schrijfacties) blijft ONVERANDERD onder AD-4/AD-7's onvoorwaardelijke regel — deze story raakt die code niet.
- **AD-5 (secrets nooit in de repo)** — `channelToken` is geen app-secret (per-user/per-kanaal, opgeslagen in de DB, niet via `sst.Secret`) — dat is bewust, geen AD-5-schending.
- **Mutatie-ownership** — de webhook-route/Cron-handler muteren alleen hun eigen nieuwe tabellen (`calendarWatchChannels`), nooit `sessions`/`tasks` — dat is de kern-scope-grens van deze story, geen architectuurregel die al bestond, maar wel een die hier voor het eerst expliciet is.

### Bestaande code die deze story raakt (lezen vóór implementatie)

- `server/domain/calendar-sync/homework-events.ts` — `createHomeworkEvent`/`updateHomeworkEvent`/`calendarRequestMetVerversing` (token-refresh-patroon, hergebruiken voor de Cron-handler se eigen Calendar-calls). `CALENDAR_EVENTS_URL` is de basis-URL voor zowel schrijven (bestaand) als `watch`/`list` (nieuw).
- `server/domain/calendar-sync/homework-blocks.ts` + `server/data/homework-blocks.ts` — `syncHomeworkBlocksForDate`, `insertHomeworkBlock`, `updateHomeworkBlockTimes` — Task 2 raakt deze, verandert hun bestaande gedrag niet, voegt alleen het nieuwe veld toe.
- `server/domain/auth/calendar-token.ts` — `refreshCalendarAccessToken`, nodig in de Cron-handler (die geen sessie heeft, dus niet via `calendarRequestMetVerversing`'s bestaande user-sessie-pad, maar rechtstreeks met een opgehaalde+ontsleutelde `User`-rij).
- `server/data/crypto.ts` — `decryptToken` voor de Cron-handler se eigen Calendar-token-ontsleuteling (werkt ongewijzigd buiten Nitro, zie "Belangrijk" punt 4).
- `server/data/db.ts` — **niet rechtstreeks hergebruiken vanuit de Cron-handler** (zie "Belangrijk" punt 4) — wel als referentie voor hoe de Turso-clientverbinding eruitziet.
- `sst.config.ts` — huidige stack heeft alleen `sst.aws.Nuxt`; dit is de eerste toevoeging van een tweede component.
- `server/data/schema.ts:334` — `homeworkCalendarBlocks`, de tabel die Task 2 uitbreidt.

### Project Structure Notes

- Nieuwe map `server/cron/` voor de Cron-handler — bestaat nog niet, geen bestaande conventie om van af te wijken.
- `server/api/calendar/homework-watch/` — nieuwe submap, consistent met de bestaande `server/api/calendar/`-structuur (zie `homework-events`'s aanroepers).

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 951-963 (Epic 8, Story 8.1)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-12.md] — volledige rationale, Epic 8/AD-11
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md] — AD-4, AD-7, AD-11 (PROPOSED)
- [Source: _bmad-output/planning-artifacts/research/technical-google-calendar-tweewegs-synchronisatie-voor-huiswerk-blokken-research-2026-09-12.md] — volledige technische onderbouwing; sectie "Google Calendar API — detectiemechanismen" (met Google-eigen-documentatie-Source-links), "Echo/lus-preventie", "Voorgestelde verwerkingspijplijn", "Debounce/coalescing", "Gefaseerde opbouw" (Fase 1 = deze story)
- [Source: server/domain/calendar-sync/homework-events.ts, homework-blocks.ts] — bestaande Calendar-write-patronen die Task 2/3/4 hergebruiken/uitbreiden

## Open Questions

- Exact debounce-venster (2 minuten, "Belangrijk" punt 2) is een beargumenteerd voorstel uit het onderzoek, geen vastgesteld cijfer — door de implementatie tijdens Task 5's live-experiment eventueel bij te stellen.
- Hoe de Cron-handler precies aan zijn eigen `TURSO_DATABASE_URL` komt (apart environment-var op het Cron-component in `sst.config.ts`, of een andere route) is niet vooraf uitgewerkt — "Belangrijk" punt 4 signaleert het probleem, de exacte oplossing is aan de implementatie.
- Geen beslissing over wat er met de gelogde detectie-resultaten gebeurt ná deze spike (bewaren voor Story 8.2's beslisregels, of weggooien zodra Hillebrand de uitkomst gezien heeft) — puur CloudWatch-logs volstaan voor déze story se doel (AC #6).

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-09-12 | Story aangemaakt via create-story, voortbouwend op sprint-change-proposal-2026-09-12.md/het technisch onderzoek. Epic 8 gemarkeerd `in-progress` (eerste story). Status meteen `ready-for-dev` — expliciet een experiment-story, geen normale feature (zie de eigen waarschuwing boven de AC's). |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
