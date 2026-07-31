---
baseline_commit: 5752965
---

# Story 2.3: Huiswerk-kleur Kiezen & Calendar Write-Sync-Service

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want een vaste Google Calendar-kleur kiezen voor mijn huiswerk-afspraken,
so that Flowz mijn geplande sessies zichtbaar in mijn agenda zet en nooit meer een vals conflict meldt over mijn eigen huiswerktijd.

## Acceptance Criteria

1. **Given** Evelien staat op de beschikbare-tijd-pagina, sectie "Huiswerk in Agenda", **when** ze een kleur kiest in `avail-homework-color-select` (Google Calendar's 11 vaste kleuren), **then** wordt de keuze direct opgeslagen (`PATCH /api/settings/homework-calendar-color`, geen debounce), **and** vraagt de OAuth-consent (indien nog niet gegeven) alsnog om Calendar write-scope aan te vullen — dit vereist een her-consent-stap bovenop Story 1.2's lees-scope.
2. **Given** een huiswerk-kleur is ingesteld, **when** `server/domain/calendar-sync/` wordt aangeroepen met een sessie (nieuw, verschoven, of vervallen), **then** voert de service `POST /api/calendar/homework-events` (nieuw), `PATCH .../{sessionId}` (tijd verschoven) of `DELETE .../{sessionId}` (sessie/taak vervalt) uit — titel "Huiswerk: {vak} — {titel}", kleur = de gekozen huiswerk-kleur, **and** is deze service synchroon aanroepbaar binnen een request-pad (geen achtergrondtaak/webhook, conform AD-4/AD-7), onafhankelijk toetsbaar met een losse testsessie — de daadwerkelijke aanroep vanuit de scheduling-flow volgt in Epic 3+ (zie Story 3.1).
3. **Given** Evelien heeft een door Flowz aangemaakt Calendar-event zelf handmatig aangepast of verwijderd, **when** Flowz die sessie later opnieuw (her)plant, **then** overschrijft/hermaakt Flowz het event gewoon (Flowz is bron van waarheid voor eigen events, geen conflict-detectie met handmatige wijzigingen in v1).
4. **Given** geen huiswerk-kleur is ingesteld, **when** een sessie gepland/herpland wordt, **then** gebeurt er geen Calendar-write — dit veld is optioneel en Flowz blijft dan volledig alleen-lezend zoals voorheen.

## Tasks / Subtasks

- [ ] Task 1: Schema — kleurvoorkeur + write-scope-vlag (AC: #1, #2, #4)
  - [ ] `server/data/schema.ts` uitbreiden: `users` krijgt twee nieuwe kolommen: `homeworkCalendarColorId` (integer, nullable, 1-11 — Google's `colorId`, zie Dev Notes voor de exacte mapping) en `hasCalendarWriteScope` (integer, `notNull().default(0)`, boolean-achtig — SQLite kent geen echt boolean-type, dit project heeft nog geen precedent hiervoor, kies `integer` met 0/1 net als je in Drizzle's SQLite-dialect gewend bent).
  - [ ] **Bewuste keuze: op `users`, niet op `availableTimePatterns`** — zie Dev Notes voor de argumentatie (kort: de write-sync-service moet zowel de kleur als de scope-vlag samen met de tokens lezen; alles op één rij houdt dat één simpele lookup i.p.v. een join over twee tabellen).
  - [ ] Migratie genereren en toepassen: `npx sst shell --stage dev -- npx drizzle-kit generate` gevolgd door `npx sst shell --stage dev -- npx drizzle-kit migrate`. **Nooit `push`.**
- [ ] Task 2: OAuth-scope-upgrade (AC: #1)
  - [ ] `server/routes/auth/google.get.ts` aanpassen: de `scope`-array wordt conditioneel op een queryparam (bv. `?scope=write`) — **standaard blijft de bestaande `calendar.readonly`-scope** voor gewone logins (least-privilege, niet alle gebruikers krijgen ongevraagd write-scope), en alleen bij de expliciete upgrade-aanroep wordt `https://www.googleapis.com/auth/calendar` (het volledige lees-/schrijf-scope, een superset van `calendar.readonly` — dus niet allebei tegelijk aanvragen) gebruikt.
  - [ ] De gememoïseerde `_handler`-aanpak (bestaand, `let _handler` op moduleniveau) moet twee varianten kunnen leveren i.p.v. één — bv. twee gescheiden gememoïseerde instanties, of een kleine factory die per scope-variant lazy opbouwt. Behoud de bestaande reden voor lazy opbouw (`Resource.*` gooit bij een inactieve SST-link, dus niet op moduleniveau aanroepen).
  - [ ] `onSuccess`: leid `hasCalendarWriteScope` af uit `tokens.scope` (bevat de daadwerkelijk toegekende scopes, ruimte-gescheiden) — controleer op de aanwezigheid van de write-scope-string, vertrouw de échte respons van Google boven wat er is aangevraagd. Geef dit door aan de bestaande `loginWithGoogle`/`upsertUserByGoogleSubjectId`-keten (die moet dit veld nu ook zetten, naast de kleur die via een apart schrijfpad loopt — zie Task 3).
  - [ ] **Niet aanraken:** de standaard-scope-lijst voor een normale login blijft `calendar.readonly` — dit is de eerste story die `server/routes/auth/google.get.ts` weer aanraakt sinds Story 1.2/1.3, wees precies in wat je wijzigt.
- [ ] Task 3: `PATCH /api/settings/homework-calendar-color` (AC: #1, #4)
  - [ ] Nieuwe route, buiten `server/api/availability/` (de UX-spec's eigen pad is expliciet `/api/settings/...`, niet `/api/availability/...` — dit is bewust geen tijd-/beschikbaarheidsconcept). Body: `{ colorId: number | null }` (`null` = "leeg laten", betekent: geen sync, kleur wissen — expliciet toegestaan per de UX-spec: "Verplicht: Nee").
  - [ ] Valideer `colorId`: moet `null` zijn, of een geheel getal 1-11. Ongeldig → 400 met de bestaande error-envelope.
  - [ ] Schrijfpad via `server/domain/` (mutatie-ownership-regel, ook hier van toepassing — geen rechtstreekse `server/data/`-aanroep vanuit de route).
  - [ ] Response: `{ colorId: number | null, needsReconsent: boolean }`. `needsReconsent` is `true` alleen wanneer `colorId` niet-null wordt gezet én de gebruiker (nog) geen `hasCalendarWriteScope` heeft — bij het wissen van een kleur (`colorId: null`) is `needsReconsent` altijd `false`, wissen vereist nooit extra scope.
- [ ] Task 4: `server/domain/calendar-sync/` — de write-sync-service (AC: #2, #3, #4)
  - [ ] **Eerste echte inhoud van deze map** — de Structural Seed reserveerde 'm al (`server/domain/calendar-sync/.gitkeep`), nu voor het eerst gevuld.
  - [ ] Input-vorm voor een "sessie" is bewust **niet** gekoppeld aan een DB-model — `Task`/`Session` bestaan nog niet (Epic 3). Gebruik een plain interface met wat de service nodig heeft om een event te bouwen: een logisch `sessionId` (string — de aanroeper in Epic 3+ bepaalt wat dat wordt, dit is voor déze story een ondoorzichtige identifier), `subject` (vak), `title`, `startsAt`/`endsAt` (ISO 8601 UTC datetimes).
  - [ ] Drie functies, elk **zelf-bewakend op de kleurinstelling** (AC #4 — de aanroeper hoeft dus niet zelf te onthouden "alleen aanroepen als er een kleur is ingesteld"; de service checkt dit intern en doet niets als er geen kleur is):
    - `createHomeworkEvent(userId, session): Promise<{ googleEventId: string } | null>` — `POST` naar `https://www.googleapis.com/calendar/v3/calendars/primary/events`. Titel-template: `` `Huiswerk: ${subject} — ${title}` `` (AC #2, letterlijk). Retourneert `null` (geen event aangemaakt) als er geen kleur is ingesteld — dat is geen foutpad, dat is het bedoelde AC #4-gedrag.
    - `updateHomeworkEvent(userId, googleEventId, session): Promise<void>` — `PATCH` naar `.../events/{googleEventId}`.
    - `deleteHomeworkEvent(userId, googleEventId): Promise<void>` — `DELETE` naar `.../events/{googleEventId}`.
  - [ ] **`googleEventId`-opslag is expliciet buiten scope van déze story.** De create-functie retourneert het aangemaakte event-id aan de aanroeper; het is aan de Epic 3+-aanroeper (wanneer `Session` als DB-entiteit bestaat) om dat id ergens op te slaan zodat een latere `update`/`delete` het kan terugvinden. Bouw hier geen tussentabel of mapping vooruitlopend op een datamodel dat nog niet vastligt — zie Dev Notes.
  - [ ] **Synchroon, binnen het request-pad — AD-7, niet optioneel.** Geen achtergrondtaak, geen wachtrij, geen retry-met-vertraging. Een falende Calendar-call mag de aanroepende request laten falen (of, in déze story, gewoon een foutmelding teruggeven aan de test-aanroep) — bouw geen infrastructuur die dat ontkoppelt.
  - [ ] `colorId` → Google's eventresource-veld `colorId` (een string van het getal, bv. `"7"` — de Calendar API verwacht dit als string, niet als getal, ook al is de opgeslagen `homeworkCalendarColorId` in dit project een integer 1-11).
- [ ] Task 5: Access-token-vernieuwing (AC: #2 — impliciete vereiste, zie Dev Notes)
  - [ ] Er bestaat nog **geen enkele token-refresh-logica** in dit project — Story 1.2/1.3 bouwden alleen de login-flow en de sessieverval-logica, niet het verversen van het Google access-token zelf (dat verloopt na ~1 uur, los van de Flowz-sessiecookie die 7 dagen meegaat). Zonder dit faalt elke Calendar-call die niet toevallig binnen het eerste uur na inloggen gebeurt.
  - [ ] Patroon: **probeer-dan-ververs-bij-401**, niet vooraf-altijd-verversen (geen nieuwe kolom voor de vervaltijd nodig, geen extra state). Bij een `401` van de Calendar API: wissel het opgeslagen `calendarRefreshToken` in bij Google's tokenendpoint (`https://oauth2.googleapis.com/token`, `grant_type=refresh_token`) voor een nieuw access-token, sla dat op (via `server/data/users.ts`'s bestaande encrypt/decrypt-laag — niet in platte tekst), en probeer de Calendar-call exact éénmaal opnieuw.
  - [ ] Structuurkeuze aan de dev-agent: dit past logisch bij `server/domain/auth/` (het is een auth-/tokenconcern, ook al bestaat het uitsluitend om `calendar-sync` te bedienen) of bij `server/domain/calendar-sync/` zelf — beide zijn verdedigbaar, geen architectuurimpact.
- [ ] Task 6: Front-end — kleur-select (AC: #1)
  - [ ] `app/pages/instellingen/beschikbare-tijd.vue` **bijwerken** (bestaand bestand). Toevoegen: `avail-homework-sync-section`, `avail-homework-sync-heading`, `avail-homework-sync-description`, `avail-homework-color-select`. Deze sectie komt ná `avail-calendar-section`, als zusje (**niet** genest — Story 2.2's code review vond precies deze fout bij de vorige sectie-toevoeging, herhaal 'm niet).
  - [ ] Native `<select>` met 11 opties (Google's kleuren, zie Dev Notes voor de exacte Nederlandse namen + `colorId`-mapping) plus een lege "Geen kleur"-optie. Een gekleurde swatch náást de select (voor de huidige keuze) is voldoende — een volledig custom dropdown met swatch per optie is meer dan deze story proportioneel vraagt, tenzij je zelf oordeelt dat het weinig extra moeite kost.
  - [ ] `onChange` → directe `PATCH`-call (geen debounce, zelfde patroon als de rest van deze pagina — hergebruik `is401`/`navigateTo('/inloggen')` voor sessieverval).
  - [ ] Bij `needsReconsent: true` in de respons: **volledige paginanavigatie** naar `/auth/google?scope=write` (niet een `fetch`, consistent met hoe de rest van dit project OAuth-redirects altijd als echte browser-navigatie behandelt, nooit als API-call — zie `login-google-button` in `inloggen.vue`). De kleurkeuze is dan al opgeslagen vóór de redirect (Task 3's PATCH liep immers eerst), dus die overleeft de round-trip zonder dat er state doorgegeven hoeft te worden.
  - [ ] Gedeelde types (`ColorId` oid., response-vormen) naar `shared/types/availability.d.ts` of een nieuw `shared/types/settings.d.ts` — niet lokaal in `app/` dupliceren (Story 2.1/2.2-les).
- [ ] Task 7: Verificatie
  - [ ] `npm run typecheck` slaagt.
  - [ ] `npx nuxt build` slaagt.
  - [ ] **Live verificatie van de write-sync-service is onvermijdelijk echt** — er is geen manier om `createHomeworkEvent`/`updateHomeworkEvent`/`deleteHomeworkEvent` te testen zonder een echte Google Calendar-aanroep te doen tegen een echt account. Gebruik een duidelijk als test gemarkeerde titel (bv. "TEST — Flowz-verificatie, kan genegeerd worden") en **ruim het testevent direct op** (roep zelf `deleteHomeworkEvent` aan, of verwijder het via de Calendar API) zodra create/update bevestigd zijn — laat niets rondslingeren op Hillebrand's/Evelien's echte agenda.
  - [ ] Verifieer expliciet: kleur instellen zonder eerdere write-scope → `needsReconsent: true`, en na de her-consent-flow → `hasCalendarWriteScope` klopt in de database. Kleur wissen → `needsReconsent: false`, altijd.
  - [ ] Verifieer AC #4: zonder ingestelde kleur retourneert `createHomeworkEvent` `null` en doet geen Calendar-call (geen bijwerking, dus niets om achteraf op te ruimen — maar wel te verifiëren dat er écht niets naar Google gaat, bv. door te controleren dat er geen nieuw event verschijnt).
  - [ ] Verifieer token-refresh: forceer een `401` (bv. door tijdelijk een ongeldig access-token in de database te zetten) en bevestig dat de service zelf ververst en de call alsnog slaagt.
  - [ ] Geen secrets of placeholder-waarden in code/commits.

## Dev Notes

### Google Calendar's 11 vaste kleuren — geverifieerde mapping (web-onderzoek juli 2026)

| `colorId` | Engelse naam (Google) | Nederlandse naam (UX-spec) |
|---|---|---|
| 1 | Lavender | Lavendel |
| 2 | Sage | Salie |
| 3 | Grape | Druif |
| 4 | Flamingo | Flamingo |
| 5 | Banana | Banaan |
| 6 | Tangerine | Mandarijn |
| 7 | Peacock | Pauw |
| 8 | Graphite | Grafiet |
| 9 | Blueberry | Bosbes |
| 10 | Basil | Basilicum |
| 11 | Tomato | Tomaat |

Bevestigd tegen Google's officiële Colors-API-documentatie — de Nederlandse UX-spec-volgorde komt exact overeen met Google's `colorId`-volgorde 1-11, geen eigen mapping nodig. `colorId` wordt in de Calendar API als **string** verstuurd (`"7"`, niet `7`), ook al is de kolom in dit project een integer.

### Waarom `homeworkCalendarColorId`/`hasCalendarWriteScope` op `users`, niet op `availableTimePatterns`

De UX-spec plaatst de kleur-select op dezelfde pagina als het weekpatroon, wat een verleiding is om 'm ook op `availableTimePatterns` te zetten (zoals Story 2.1 daar wél voor koos). Maar de write-sync-service heeft per aanroep **zowel de kleur als de write-scope-vlag én de tokens** nodig — die laatste twee staan al op `users`. Alles op `availableTimePatterns` zetten zou de service dwingen tot een join over twee tabellen voor elke aanroep; alles op `users` zetten is één simpele lookup. UI-co-locatie op dezelfde pagina hoeft de DB-co-locatie niet te dicteren — dit is een bewuste afwijking van het "volg de pagina"-instinct.

### Token-refresh: probeer-dan-ververs, geen vervaltijd-kolom

Overwogen alternatief: een `calendarAccessTokenExpiresAt`-kolom bijhouden en proactief verversen vóór elke call. Verworpen — extra state, extra migratie, en een preventieve refresh op élke call verspilt een netwerk-rondje in het meest voorkomende geval (het token is nog gewoon geldig). Het probeer-dan-ververs-bij-401-patroon is het standaard OAuth2-clientpatroon en heeft niets extra's nodig behalve de bestaande `calendarRefreshToken`-kolom (al aanwezig sinds Story 1.2).

### Scope-upgrade: query-param, geen nieuwe route

`?scope=write` op de bestaande `/auth/google`-route in plaats van een aparte upgrade-route — hergebruikt de volledige bestaande OAuth-machinerie (state/nonce/PKCE-validatie, de vangnet-try/catch, de foutstate-redirect) zonder duplicatie. `prompt=consent` staat al standaard aan, dus Google toont vanzelf een (incrementeel) consentscherm voor de bredere scope. Geen state hoeft over de redirect heen bewaard te worden, want de kleurkeuze is al opgeslagen vóórdat de client naar `/auth/google?scope=write` navigeert.

### Wat expliciet buiten scope valt

- **`googleEventId`-opslag/-mapping** — hoort bij `Session` zodra die als DB-entiteit bestaat (Epic 3). Bouw hier geen vooruitlopende tussentabel.
- **De daadwerkelijke aanroep vanuit de scheduling-flow** (wanneer wordt een sessie gepland/herpland en dus deze service aangeroepen) — AC #2 zegt dit letterlijk: "de daadwerkelijke aanroep vanuit de scheduling-flow volgt in Epic 3+". Deze story bouwt de service en bewijst 'm met een losse testsessie, niet de integratie.
- **Conflict-detectie tussen handmatige en automatische Calendar-wijzigingen** — AC #3 is expliciet: Flowz is bron van waarheid voor eigen events, geen detectie in v1.
- **UJ-7's conflict-detectie bij opstarten** (het lées-gedeelte van `calendar-sync/`) — deze story bouwt alleen de schrijf-kant. Lezen/conflict-detectie is Epic 6.

### Architectuurcompliance

- **AD-7 (nieuw sinds 2026-07-26):** Calendar write-sync is synchroon binnen het request-pad, geen achtergrondverwerking. Dit is de architectuurregel die déze story letterlijk uitvoert — lees 'm in het architectuurdocument voor de volledige tekst.
- **AD-4:** blijft gelden voor lézen (geen webhook-abonnement) — niet geraakt door déze story, die alleen schrijft.
- **Mutatie-ownership:** `server/api/settings/homework-calendar-color.patch.ts` roept nooit rechtstreeks `server/data/` aan.
- **AD-5 (secrets):** niets nieuws hier — de bestaande `GoogleOAuthClientSecret` wordt hergebruikt voor de token-refresh-aanroep, geen nieuw secret nodig.
- **Encryptie van tokens (Story 1.2-precedent):** een ververst access-token gaat via dezelfde encrypt-laag in `server/data/users.ts` de database in als de bestaande tokens — nooit in platte tekst opslaan.

### Testen

Nog steeds geen testframework. Dit is de eerste story met een externe, betaalde-consequenties-hebbende side-effect (een écht Calendar-event op een écht account) — extra reden om bij elke live-test expliciet en zichtbaar op te ruimen, zoals Task 7 voorschrijft.

## Previous Story Intelligence (Story 2.1/2.2, code reviews)

- **Sectienesting fout maken is makkelijk, controleer het expliciet** — Story 2.2's review vond dat `avail-calendar-section` per ongeluk genest zat in `avail-week-section` i.p.v. ernaast. Doe hetzelfde voor `avail-homework-sync-section`: `grep` na het bouwen op de open/sluit-tags om te bevestigen dat het een zusje is, geen kind.
- **Regex-only-validatie is niet genoeg voor semantisch beperkte waarden** — Story 2.2's `colorId`-analoog hier is de kleurwaarde zelf: valideer op een echt geheel getal 1-11, niet alleen "is het een getal".
- **Live verificatie kan een gedeeltelijk gefixte aanname blootleggen** — bij zowel 1.2 als 2.1/2.2 bleek een "dit werkt vanzelf"-aanname bij het echt testen net iets anders te liggen dan gedacht (Google's refresh_token-garantie, de sessieklok, `db.transaction()`'s mode-default, de maandwissel-bug). Neem voor déze story niets aan over hoe Google's Calendar API zich in de praktijk gedraagt (foutcodes, rate limits, exacte scope-string-vorm in `tokens.scope`) zonder het live te bevestigen.
- **`server/routes/auth/google.get.ts` is nu voor het eerst weer aangeraakt sinds Story 1.2/1.3** — lees dat bestand volledig voordat je 't wijzigt (zie huidige inhoud hieronder), en behoud alle bestaande bescherming (state/nonce/PKCE, de vangnet-try/catch, de sessie-reset-logica in `startNieuweSessie`).
- **Shared types/utils blijven de gewoonte, niet de uitzondering** — als deze story een `Weekday`-achtig type of een pure functie nodig heeft die zowel server als client raakt, hoort dat in `shared/`, niet lokaal gedupliceerd.

## Git Intelligence

Laatste relevante commits: `663c8f6`/`96d2274` (Story 2.2 + review-patches), `89d941a`/`5752965` (24-uursplafond, een kleine post-hoc productwijziging op zowel 2.1 als 2.2 na expliciet verzoek van Hillebrand — patroon: `shared/utils/availability.ts` als centrale plek voor kleine, gedeelde constanten/logica die zowel server als client nodig hebben, blijkt inmiddels drie stories op rij bruikbaar).

## Project Structure Notes

- Nieuw: `server/domain/calendar-sync/` krijgt voor het eerst echte inhoud (was `.gitkeep`), `server/api/settings/homework-calendar-color.patch.ts` (nieuwe `server/api/settings/`-submap), mogelijk `server/domain/auth/` uitgebreid met token-refresh (Task 5, structuurkeuze aan de dev-agent).
- Gewijzigd: `server/data/schema.ts` (twee nieuwe kolommen op `users`), `server/routes/auth/google.get.ts` (scope-upgrade), `app/pages/instellingen/beschikbare-tijd.vue` (nieuwe sectie), `shared/types/`.
- Geen conflicten met bestaande structuur.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.3-Huiswerk-kleur-Kiezen-Calendar-Write-Sync-Service] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-7] — "Calendar write-sync is synchroon binnen het request-pad, geen nieuwe achtergrondverwerking" [TOEGEVOEGD 2026-07-26], expliciete verruiming van AD-4 voor schrijven
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-4] — Calendar pull-only voor lezen (niet geraakt door deze story)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Structural-Seed] — `calendar-sync/`-map al gereserveerd sinds Story 1.1
- [Source: design-artifacts/C-UX-Scenarios/04-evelien-stelt-beschikbare-tijd-in/4.1-beschikbare-tijd-instellen/4.1-beschikbare-tijd-instellen.md] — **alleen** de sectie "Huiswerk in Agenda" (Object IDs + Technical Notes "Google Calendar write-sync") is voor déze story relevant
- [Source: design-artifacts/C-UX-Scenarios/05-evelien-start-met-flowz/5.1-inlogscherm/5.1-inlogscherm.md] — Technical Notes over de write-scope-uitbreiding van de OAuth-consent
- [Source: _bmad-output/implementation-artifacts/1-2-google-oauth-login-met-calendar-consent.md] — bestaande OAuth-implementatie, `startNieuweSessie`-logica die behouden moet blijven
- [Source: _bmad-output/implementation-artifacts/2-1-weekpatroon-instellen.md] en [2-2-dag-specifieke-afwijkingen-instellen.md] — `shared/`-precedent, error-envelope-patroon, sectienesting-les
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — bekend, nog open: geen testframework, geen lint/import-boundary-handhaving
- Web-onderzoek (juli 2026, geverifieerd tegen Google's officiële documentatie, niet aangenomen):
  - [Colors: get — Google Calendar API](https://developers.google.com/workspace/calendar/api/v3/reference/colors/get) en [Colors](https://developers.google.com/workspace/calendar/api/v3/reference/colors) — de 11 kleuren + `colorId`-mapping
  - [Events: insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Events: patch](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch), [Events: delete](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete) — endpoint-paden en requestvorm voor de write-sync-service

## Open Questions

Geen — de twee architecturale keuzes die deze story vereiste (kleur/scope-vlag op `users` i.p.v. `availableTimePatterns`; probeer-dan-ververs i.p.v. een vervaltijd-kolom voor token-refresh; query-param-gebaseerde scope-upgrade i.p.v. een aparte route) zijn hierboven als beargumenteerde keuzes vastgelegd. Als je een van deze anders wilt, zeg het vóór implementatie — met name de eerste (waar de kleur/scope-vlag wonen) is niet triviaal terug te draaien zonder een tweede migratie.
