---
baseline_commit: 5752965
---

# Story 2.3: Huiswerk-kleur Kiezen & Calendar Write-Sync-Service

Status: done

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

> **Amendement (Hillebrand, 2026-08-01, na code review):** AC #1 en #4's "optioneel"/"Verplicht: Nee" zijn omgedraaid — huiswerk-kleur is nu **verplicht**. Reden: wissen kon eerder eerder aangemaakte Calendar-events voorgoed weeskind maken, en "alle bestaande items automatisch bijwerken bij een kleurwissel" (het geprefereerde alternatief) is niet bouwbaar zolang de `googleEventId`-opslag naar Epic 3+ is doorgeschoven. AC #4's letterlijke scenario ("geen kleur ingesteld") bestaat nu alleen nog kortstondig, vóór een gebruiker deze pagina voor het eerst bezoekt — niet meer als actieve, blijvende keuze. Zie Dev Agent Record → Completion Notes voor de volledige implementatie.

## Tasks / Subtasks

- [x] Task 1: Schema — kleurvoorkeur + write-scope-vlag (AC: #1, #2, #4)
  - [x] `server/data/schema.ts` uitbreiden: `users` krijgt twee nieuwe kolommen: `homeworkCalendarColorId` (integer, nullable, 1-11 — Google's `colorId`, zie Dev Notes voor de exacte mapping) en `hasCalendarWriteScope` (integer, `notNull().default(0)`, boolean-achtig — SQLite kent geen echt boolean-type, dit project heeft nog geen precedent hiervoor, kies `integer` met 0/1 net als je in Drizzle's SQLite-dialect gewend bent).
  - [x] **Bewuste keuze: op `users`, niet op `availableTimePatterns`** — zie Dev Notes voor de argumentatie (kort: de write-sync-service moet zowel de kleur als de scope-vlag samen met de tokens lezen; alles op één rij houdt dat één simpele lookup i.p.v. een join over twee tabellen).
  - [x] Migratie genereren en toepassen: `npx sst shell --stage dev -- npx drizzle-kit generate` gevolgd door `npx sst shell --stage dev -- npx drizzle-kit migrate`. **Nooit `push`.** — live geverifieerd via `PRAGMA table_info(users)`: beide kolommen exact zoals verwacht.
- [x] Task 2: OAuth-scope-upgrade (AC: #1)
  - [x] `server/routes/auth/google.get.ts` aanpassen: de `scope`-array wordt conditioneel op een queryparam (bv. `?scope=write`) — **standaard blijft de bestaande `calendar.readonly`-scope** voor gewone logins (least-privilege, niet alle gebruikers krijgen ongevraagd write-scope), en alleen bij de expliciete upgrade-aanroep wordt `https://www.googleapis.com/auth/calendar` (het volledige lees-/schrijf-scope, een superset van `calendar.readonly` — dus niet allebei tegelijk aanvragen) gebruikt.
  - [x] De gememoïseerde `_handler`-aanpak (bestaand, `let _handler` op moduleniveau) moet twee varianten kunnen leveren i.p.v. één — bv. twee gescheiden gememoïseerde instanties, of een kleine factory die per scope-variant lazy opbouwt. Behoud de bestaande reden voor lazy opbouw (`Resource.*` gooit bij een inactieve SST-link, dus niet op moduleniveau aanroepen). — geïmplementeerd als `_handlers: Partial<Record<OAuthScopeVariant, ...>>`, plus `include_granted_scopes: 'true'` toegevoegd (web-geverifieerd, zie Dev Notes) zodat een latere gewone readonly-login de eerder toegekende write-scope niet stilzwijgend laat "verdwijnen" uit `tokens.scope`.
  - [x] `onSuccess`: leid `hasCalendarWriteScope` af uit `tokens.scope` (bevat de daadwerkelijk toegekende scopes, ruimte-gescheiden) — controleer op de aanwezigheid van de write-scope-string, vertrouw de échte respons van Google boven wat er is aangevraagd. Geef dit door aan de bestaande `loginWithGoogle`/`upsertUserByGoogleSubjectId`-keten (die moet dit veld nu ook zetten, naast de kleur die via een apart schrijfpad loopt — zie Task 3).
  - [x] **Niet aanraken:** de standaard-scope-lijst voor een normale login blijft `calendar.readonly` — dit is de eerste story die `server/routes/auth/google.get.ts` weer aanraakt sinds Story 1.2/1.3, wees precies in wat je wijzigt.
- [x] Task 3: `PATCH /api/settings/homework-calendar-color` (AC: #1, #4)
  - [x] Nieuwe route, buiten `server/api/availability/` (de UX-spec's eigen pad is expliciet `/api/settings/...`, niet `/api/availability/...` — dit is bewust geen tijd-/beschikbaarheidsconcept). Body: `{ colorId: number | null }` (`null` = "leeg laten", betekent: geen sync, kleur wissen — expliciet toegestaan per de UX-spec: "Verplicht: Nee").
  - [x] Valideer `colorId`: moet `null` zijn, of een geheel getal 1-11. Ongeldig → 400 met de bestaande error-envelope.
  - [x] Schrijfpad via `server/domain/` (mutatie-ownership-regel, ook hier van toepassing — geen rechtstreekse `server/data/`-aanroep vanuit de route). — geïmplementeerd als `setHomeworkCalendarColorFor` in het bestaande `server/domain/auth/users.ts` (naast `loginWithGoogle`), niet als nieuwe `server/domain/settings/`-map: het is een pure User-veldmutatie, geen calendar-sync-aanroep.
  - [x] Response: `{ colorId: number | null, needsReconsent: boolean }`. `needsReconsent` is `true` alleen wanneer `colorId` niet-null wordt gezet én de gebruiker (nog) geen `hasCalendarWriteScope` heeft — bij het wissen van een kleur (`colorId: null`) is `needsReconsent` altijd `false`, wissen vereist nooit extra scope.
- [x] Task 4: `server/domain/calendar-sync/` — de write-sync-service (AC: #2, #3, #4)
  - [x] **Eerste echte inhoud van deze map** — de Structural Seed reserveerde 'm al (`server/domain/calendar-sync/.gitkeep`), nu voor het eerst gevuld. (`.gitkeep` verwijderd, consistent met hoe `server/domain/auth/` en `server/domain/availability/` dat eerder deden zodra er echte inhoud kwam.)
  - [x] Input-vorm voor een "sessie" is bewust **niet** gekoppeld aan een DB-model — `Task`/`Session` bestaan nog niet (Epic 3). Gebruik een plain interface met wat de service nodig heeft om een event te bouwen: een logisch `sessionId` (string — de aanroeper in Epic 3+ bepaalt wat dat wordt, dit is voor déze story een ondoorzichtige identifier), `subject` (vak), `title`, `startsAt`/`endsAt` (ISO 8601 UTC datetimes).
  - [x] Drie functies, elk **zelf-bewakend op de kleurinstelling** (AC #4 — de aanroeper hoeft dus niet zelf te onthouden "alleen aanroepen als er een kleur is ingesteld"; de service checkt dit intern en doet niets als er geen kleur is):
    - `createHomeworkEvent(userId, session): Promise<{ googleEventId: string } | null>` — `POST` naar `https://www.googleapis.com/calendar/v3/calendars/primary/events`. Titel-template: `` `Huiswerk: ${subject} — ${title}` `` (AC #2, letterlijk). Retourneert `null` (geen event aangemaakt) als er geen kleur is ingesteld — dat is geen foutpad, dat is het bedoelde AC #4-gedrag.
    - `updateHomeworkEvent(userId, googleEventId, session): Promise<void>` — `PATCH` naar `.../events/{googleEventId}`.
    - `deleteHomeworkEvent(userId, googleEventId): Promise<void>` — `DELETE` naar `.../events/{googleEventId}`.
    - `updateHomeworkEvent`/`deleteHomeworkEvent` guarden op dezelfde manier als `create` (no-op zonder kleur) — AC #4's "Flowz blijft dan volledig alleen-lezend" is gelezen als: geldt voor élke Calendar-write, niet alleen het aanmaken.
  - [x] **`googleEventId`-opslag is expliciet buiten scope van déze story.** De create-functie retourneert het aangemaakte event-id aan de aanroeper; het is aan de Epic 3+-aanroeper (wanneer `Session` als DB-entiteit bestaat) om dat id ergens op te slaan zodat een latere `update`/`delete` het kan terugvinden. Bouw hier geen tussentabel of mapping vooruitlopend op een datamodel dat nog niet vastligt — zie Dev Notes.
  - [x] **Synchroon, binnen het request-pad — AD-7, niet optioneel.** Geen achtergrondtaak, geen wachtrij, geen retry-met-vertraging. Een falende Calendar-call mag de aanroepende request laten falen (of, in déze story, gewoon een foutmelding teruggeven aan de test-aanroep) — bouw geen infrastructuur die dat ontkoppelt.
  - [x] `colorId` → Google's eventresource-veld `colorId` (een string van het getal, bv. `"7"` — de Calendar API verwacht dit als string, niet als getal, ook al is de opgeslagen `homeworkCalendarColorId` in dit project een integer 1-11).
- [x] Task 5: Access-token-vernieuwing (AC: #2 — impliciete vereiste, zie Dev Notes)
  - [x] Er bestaat nog **geen enkele token-refresh-logica** in dit project — Story 1.2/1.3 bouwden alleen de login-flow en de sessieverval-logica, niet het verversen van het Google access-token zelf (dat verloopt na ~1 uur, los van de Flowz-sessiecookie die 7 dagen meegaat). Zonder dit faalt elke Calendar-call die niet toevallig binnen het eerste uur na inloggen gebeurt.
  - [x] Patroon: **probeer-dan-ververs-bij-401**, niet vooraf-altijd-verversen (geen nieuwe kolom voor de vervaltijd nodig, geen extra state). Bij een `401` van de Calendar API: wissel het opgeslagen `calendarRefreshToken` in bij Google's tokenendpoint (`https://oauth2.googleapis.com/token`, `grant_type=refresh_token`) voor een nieuw access-token, sla dat op (via `server/data/users.ts`'s bestaande encrypt/decrypt-laag — niet in platte tekst), en probeer de Calendar-call exact éénmaal opnieuw.
  - [x] Structuurkeuze aan de dev-agent: dit past logisch bij `server/domain/auth/` (het is een auth-/tokenconcern, ook al bestaat het uitsluitend om `calendar-sync` te bedienen) of bij `server/domain/calendar-sync/` zelf — beide zijn verdedigbaar, geen architectuurimpact. — gekozen voor `server/domain/auth/calendar-token.ts` (`refreshCalendarAccessToken`), aangeroepen vanuit een nieuwe `calendarRequestMetVerversing`-wrapper in `homework-events.ts` die bij precies één 401 ververst en exact éénmaal opnieuw probeert.
- [x] Task 6: Front-end — kleur-select (AC: #1)
  - [x] `app/pages/instellingen/beschikbare-tijd.vue` **bijwerken** (bestaand bestand). Toevoegen: `avail-homework-sync-section`, `avail-homework-sync-heading`, `avail-homework-sync-description`, `avail-homework-color-select`. Deze sectie komt ná `avail-calendar-section`, als zusje (**niet** genest — Story 2.2's code review vond precies deze fout bij de vorige sectie-toevoeging, herhaal 'm niet). — met `grep` op de open/sluit-`<section>`-tags bevestigd dat alle vier secties op hetzelfde nestingsniveau staan.
  - [x] Native `<select>` met 11 opties (Google's kleuren, zie Dev Notes voor de exacte Nederlandse namen + `colorId`-mapping) plus een lege "Geen kleur"-optie. Een gekleurde swatch náást de select (voor de huidige keuze) is voldoende — een volledig custom dropdown met swatch per optie is meer dan deze story proportioneel vraagt, tenzij je zelf oordeelt dat het weinig extra moeite kost. — swatch-hexwaarden zijn Google Calendar's officiële Colors-API-waarden.
  - [x] `onChange` → directe `PATCH`-call (geen debounce, zelfde patroon als de rest van deze pagina — hergebruik `is401`/`navigateTo('/inloggen')` voor sessieverval).
  - [x] Bij `needsReconsent: true` in de respons: **volledige paginanavigatie** naar `/auth/google?scope=write` (niet een `fetch`, consistent met hoe de rest van dit project OAuth-redirects altijd als echte browser-navigatie behandelt, nooit als API-call — zie `login-google-button` in `inloggen.vue`). De kleurkeuze is dan al opgeslagen vóór de redirect (Task 3's PATCH liep immers eerst), dus die overleeft de round-trip zonder dat er state doorgegeven hoeft te worden. — geïmplementeerd via `window.location.href` (programmatische equivalent van een echte browser-navigatie, i.p.v. `navigateTo`, dat binnen de SPA blijft).
  - [x] Gedeelde types (`ColorId` oid., response-vormen) naar `shared/types/availability.d.ts` of een nieuw `shared/types/settings.d.ts` — niet lokaal in `app/` dupliceren (Story 2.1/2.2-les). — nieuw `shared/types/settings.d.ts`.
  - [x] **Bekende beperking, bewust overgenomen uit de UX-spec:** de pagina haalt de huidige huiswerk-kleur niet op bij het laden — de 4.1-spec's eigen "Data Sources"-tabel noemt alleen `week_pattern` en `calendar_exceptions`, geen kleur-bron. Na een paginaverversing toont de select dus weer "Geen kleur", ook al staat een eerder gekozen kleur nog gewoon in de database (de PATCH zelf werkt correct, alleen de rehydratie ontbreekt). Niet stilzwijgend opgelost door een ongevraagde GET-route toe te voegen — zie Completion Notes.
- [x] Task 7: Verificatie
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] **Live verificatie van de write-sync-service is onvermijdelijk echt** — er is geen manier om `createHomeworkEvent`/`updateHomeworkEvent`/`deleteHomeworkEvent` te testen zonder een echte Google Calendar-aanroep te doen tegen een echt account. Gebruik een duidelijk als test gemarkeerde titel (bv. "TEST — Flowz-verificatie, kan genegeerd worden") en **ruim het testevent direct op** (roep zelf `deleteHomeworkEvent` aan, of verwijder het via de Calendar API) zodra create/update bevestigd zijn — laat niets rondslingeren op Hillebrand's/Evelien's echte agenda. — uitgevoerd tegen `https://flowz.fyi` (echte deployment, echte Lambda, dus werkende `useRuntimeConfig()`/`Resource.*`) via een tijdelijke `server/api/_debug/calendar-sync-test.post.ts`-route (nooit gecommit) en een zelfgeconstrueerde, geldig-verzegelde sessiecookie (`iron-webcrypto` + de echte `SessionPassword`, zelfde techniek als Stories 1.2/1.3/2.1/2.2). Onderweg bleek Google's Calendar API nog niet geactiveerd te staan voor het OAuth-project (403 `SERVICE_DISABLED`) — geen codefout, opgelost door Hillebrand de API te laten activeren in Google Cloud Console. Event `rvcp7ipfim3b72mvvb42akjo10` aangemaakt, bijgewerkt (titel + tijd, rechtstreeks bij Google geverifieerd: juiste titel-template, `colorId: "7"`, juiste tijd) en daarna verwijderd (bevestigd: `status: "cancelled"`). Debug-route en alle tijdelijke scripts verwijderd; herdeployed; 404 bevestigd voor de debug-route met een geldige sessie (dus écht weg, niet toevallig 401 door de globale auth-middleware).
  - [x] Verifieer expliciet: kleur instellen zonder eerdere write-scope → `needsReconsent: true`, en na de her-consent-flow → `hasCalendarWriteScope` klopt in de database. Kleur wissen → `needsReconsent: false`, altijd. — Hillebrand doorliep de echte OAuth-her-consent-flow via de UI (kleur "Druif" gekozen); database bevestigde nadien `has_calendar_write_scope: 1`. Kleur wissen (`colorId: null`) via een directe PATCH tegen de live route gaf `needsReconsent: false`; een kleur opnieuw instellen mét bestaande write-scope gaf ook `needsReconsent: false` (alleen de eerste keer zónder scope is `true`). Ongeldige `colorId` (12) gaf de verwachte 400-envelope.
  - [x] Verifieer AC #4: zonder ingestelde kleur retourneert `createHomeworkEvent` `null` en doet geen Calendar-call (geen bijwerking, dus niets om achteraf op te ruimen — maar wel te verifiëren dat er écht niets naar Google gaat, bv. door te controleren dat er geen nieuw event verschijnt). — bevestigd: met `homeworkCalendarColorId: null` gaf de debug-route een lege `204 No Content` (h3's serialisatie van een `null`-return), geen Calendar-call.
  - [x] Verifieer token-refresh: forceer een `401` (bv. door tijdelijk een ongeldig access-token in de database te zetten) en bevestig dat de service zelf ververst en de call alsnog slaagt. — access-token rechtstreeks in de database gecorrumpeerd (buiten de encrypt-laag om een niet-bestaand token versleuteld opgeslagen), daarna `updateHomeworkEvent` aangeroepen: slaagde alsnog (`{ok:true}`), en `users.updated_at` sprong naar het moment van de call — enig ander schrijfpad naar die kolom op dat moment was de refresh zelf, dus dat bevestigt dat `refreshCalendarAccessToken` daadwerkelijk liep en een nieuw token opsloeg (niet dat Google het corrupte token toch accepteerde).
  - [x] Geen secrets of placeholder-waarden in code/commits. — alle tijdelijke verificatiescripts (die wél Resource-secrets/tokens aanraakten) zijn verwijderd vóór het einde van deze taak, nooit gecommit.

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

### Review Findings

- [x] [Review][Decision] AC #2's literale endpointcontract (`POST/PATCH/DELETE /api/calendar/homework-events`) is nooit gebouwd — alleen `server/domain/calendar-sync/`-functies bestaan, geen Flowz-eigen HTTP-routes. **Opgelost (Hillebrand, 2026-08-01): dismissed.** AC #2's paden zijn shorthand voor "de service doet een create/update/delete" — de domain-functies volstaan, een Epic 3+-aanroeper importeert ze rechtstreeks, consistent met dit project's vaste patroon dat routes altijd dunne wrappers om domain-functies zijn, nooit interne HTTP-hops. Geen routes toegevoegd.
- [x] [Review][Patch] Verlopen kleuren-hexwaarden in `HOMEWORK_COLORS` kloppen niet met Google's officiële palet [app/pages/instellingen/beschikbare-tijd.vue:268] — 3 hexwaarden gecorrigeerd (colorId 5/6/11).
- [x] [Review][Patch] Kleur wissen kan events voorgoed weeskind maken — `deleteHomeworkEvent` guardt (net als create/update) op `homeworkCalendarColorId === null`, dus opruimen van een eerder aangemaakt event lukt niet meer zodra de kleur gewist is [server/domain/calendar-sync/homework-events.ts:126] — guard verwijderd uit `deleteHomeworkEvent` (create/update behouden 'm, want die starten juist nieuwe write-sync-activiteit). Grotendeels ingehaald door de kleur-verplicht-beslissing hieronder (wissen kan sowieso niet meer via de UI), maar de guard-verwijdering blijft defensief correct voor de korte "nog nooit gekozen"-toestand van nieuwe gebruikers. Live geverifieerd: delete met `homeworkCalendarColorId: null` in de database ging gewoon door.
- [x] [Review][Patch] `createHomeworkEvent`/`updateHomeworkEvent` guarden alleen op de kleur, niet op `hasCalendarWriteScope` — een kleur die is opgeslagen terwijl de her-consent-redirect nooit is afgemaakt, leidt tot een onafgevangen 403 i.p.v. het bedoelde no-op-gedrag [server/domain/calendar-sync/homework-events.ts:81] — guard uitgebreid met `!user.hasCalendarWriteScope`. Live geverifieerd: create met colorId gezet maar `hasCalendarWriteScope` op `null`-scenario gaf `null` terug, geen Calendar-call.
- [x] [Review][Patch] `updateHomeworkEvent` herstelt een handmatig verwijderd event niet — een 404 laat de aanroep falen i.p.v. AC #3's "overschrijft/hermaakt Flowz het event gewoon" [server/domain/calendar-sync/homework-events.ts:106] — **oorspronkelijke aanpak (404-detectie + recreate) bleek fout tijdens live-verificatie en is gecorrigeerd**: een PATCH naar een handmatig verwijderd Google-event geeft géén 404 — Google bewaart het als een onzichtbare `status:"cancelled"`-tombstone en accepteert de PATCH gewoon met 200. Losse live-testaanroep bevestigde dat expliciet `status:'confirmed'` meesturen zo'n tombstone laat "herleven" met hetzelfde `googleEventId`. `toEventResource` stuurt dit nu altijd mee (no-op op een gewoon actief event); `updateHomeworkEvent`'s returntype hoefde daardoor niet te wijzigen. Live geverifieerd: event handmatig bij Google verwijderd → `updateHomeworkEvent` aangeroepen → rechtstreeks bij Google bevestigd `status: "confirmed"`, juiste titel.
- [x] [Review][Patch] `wijzigHomeworkColor`'s catch-tak bij een niet-401-fout herstelt de zichtbare `<select>`-waarde niet en toont geen foutmelding — een mislukte PATCH kan zo een niet-opgeslagen kleur tonen alsof die wél is opgeslagen [app/pages/instellingen/beschikbare-tijd.vue:307] — catch-tak zet `select.value` nu expliciet terug naar `homeworkColorId.value` en toont een zichtbare foutmelding (`avail-homework-color-error`). Niet apart live geverifieerd (vereist een gefaked netwerkfalen in de browser) — wel code-gereviewd: eenvoudige, synchrone DOM-toewijzing zonder verdere afhankelijkheden.
- [x] [Review][Patch] De bekende rehydratie-beperking (kleur laadt niet opnieuw na paginaverversing) staat wel in de Completion Notes maar nog niet in `deferred-work.md`, in tegenstelling tot elke eerdere story's gewoonte — **niet gedeferred maar meteen gefixed**, op verzoek van Hillebrand nadat kleur verplicht werd (het gat woog toen zwaarder: een terugkerende gebruiker leek zijn keuze kwijt). Nieuwe `GET /api/settings/homework-calendar-color`-route + rehydratie-fetch op de pagina. Live geverifieerd: select toont bij laden meteen de eerder opgeslagen kleur ("3"/Druif).
- [x] [Review][Defer] `hasCalendarWriteScope` synct nooit terug als de gebruiker Calendar-toegang buiten Flowz om intrekt — geen enkel herstelpad naar een nieuwe consent-prompt [server/routes/auth/google.get.ts:144] — deferred, pre-existing (geen enkele intrekkingsdetectie bestaat al ergens in de OAuth-flow, niet specifiek aan deze diff)
- [x] [Review][Defer] Geen geautomatiseerde testdekking voor de write-sync-service, ondanks echte externe/betaalde neveneffecten — deferred, pre-existing (nog steeds geen testframework in het hele project, al bekend)
- [x] [Review][Defer] Geen DB-CHECK-constraint op `homework_calendar_color_id`'s 1-11-bereik [server/data/schema.ts] — deferred, pre-existing (consistent met dit project se bestaande patroon: validatie zit overal alleen in de applicatielaag, nooit als DB-constraint)
- [x] [Review][Defer] Geen onderscheid tussen een permanent ongeldig refresh-token en een tijdelijke fout — beide gooien een generieke `Error` [server/domain/auth/calendar-token.ts] — deferred, pre-existing (consistent met de rest van de domain-laag, die ook overal platte `Error`s gooit; onbereikbaar zonder een Epic 3+-aanroeper)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Domain-laagkeuzes, beide beargumenteerd i.p.v. de voor de hand liggende nieuwe map:** `setHomeworkCalendarColorFor` in het bestaande `server/domain/auth/users.ts` (naast `loginWithGoogle`) i.p.v. een nieuwe `server/domain/settings/` — het is een pure `User`-veldmutatie, geen calendar-sync-aanroep. `refreshCalendarAccessToken` in een nieuw `server/domain/auth/calendar-token.ts` — de story liet beide varianten (auth/ of calendar-sync/) expliciet toe als gelijkwaardig.
- **`updateHomeworkEvent`/`deleteHomeworkEvent` zelf-bewakend gemaakt op de kleurinstelling, net als `createHomeworkEvent`** — de story specificeerde dit letterlijk alleen voor create, maar AC #4's "Flowz blijft dan volledig alleen-lezend" is gelezen als een eis die voor élke Calendar-write geldt, niet alleen het aanmaken. Vastgelegd als expliciete keuze, niet stilzwijgend aangenomen.
- **Live verificatie liep tegen een échte externe blocker aan, geen codefout:** de eerste `createHomeworkEvent`-aanroep tegen de gedeployde omgeving gaf een 403 `SERVICE_DISABLED` — Google's Calendar API stond nog niet geactiveerd voor het gekoppelde OAuth-project. Gevonden via CloudWatch-logs (`aws logs tail`), niet aangenomen. Opgelost doordat Hillebrand de API zelf activeerde in Google Cloud Console; geen enkele codewijziging nodig.
- **Server/domain/server/data-modules zijn niet los van Nitro te draaien** (`useRuntimeConfig()` is een Nitro-auto-import, bestaat niet in een los `sst shell -- node script.mjs`-proces) — vastgesteld door het eerst te proberen en de `ReferenceError` te zien. Opgelost door de write-sync-service via een **tijdelijke, nooit-gecommitte debug-route** (`server/api/_debug/calendar-sync-test.post.ts`) binnen de échte Lambda aan te roepen, geauthenticeerd met een zelf-verzegelde sessiecookie (`iron-webcrypto`'s `seal()` + de echte `SessionPassword` via `Resource.SessionPassword.value` — zelfde techniek als Stories 1.2/1.3/2.1/2.2, hier voor het eerst gecombineerd met een nieuw, tijdelijk API-oppervlak in plaats van een bestaande route).
- **Live e2e-verificatie tegen `https://flowz.fyi`, met Hillebrand's echte Google-account:**
  - Her-consent-flow: Hillebrand doorliep `?scope=write` via de echte UI (kleur "Druif" gekozen) → database bevestigde nadien `has_calendar_write_scope: 1`.
  - `PATCH /api/settings/homework-calendar-color`: kleur wissen → `{colorId:null, needsReconsent:false}`; kleur instellen mét bestaande write-scope → `{colorId:7, needsReconsent:false}`; ongeldige `colorId:12` → 400-envelope.
  - AC #4 (geen kleur ingesteld): debug-route retourneerde een lege `204 No Content` (h3's serialisatie van `createHomeworkEvent`'s `null`-return) — bevestigt dat er géén Calendar-call plaatsvond.
  - `createHomeworkEvent` → event `rvcp7ipfim3b72mvvb42akjo10` aangemaakt; rechtstreeks bij Google opgehaald (los script, eigen decrypt van het opgeslagen access-token) en bevestigd: `summary: "Huiswerk: Wiskunde — TEST — Flowz-verificatie, kan genegeerd worden"`, `colorId: "7"`, juiste tijd.
  - `updateHomeworkEvent` → titel + tijd gewijzigd, opnieuw rechtstreeks bij Google bevestigd (nieuwe titel, nieuwe tijd in Europe/Amsterdam correct omgerekend vanuit de UTC-input).
  - Token-refresh: `calendar_access_token` in de database rechtstreeks gecorrumpeerd (buiten de app om), daarna `updateHomeworkEvent` opnieuw aangeroepen → slaagde alsnog (`{ok:true}`). `users.updated_at` sprong naar het moment van die aanroep — het enige schrijfpad naar die kolom op dat moment was `updateCalendarAccessToken` binnen `refreshCalendarAccessToken` zelf, dus dit is sluitend bewijs dat de refresh daadwerkelijk liep (niet dat Google het corrupte token alsnog accepteerde).
  - `deleteHomeworkEvent` → event verwijderd; rechtstreeks bij Google bevestigd (`status: "cancelled"`).
  - Opruiming: testevent verwijderd, kleur teruggezet naar Hillebrand's echte keuze ("Druif", `colorId:3`), debug-route en alle tijdelijke scripts (`_usercheck.mjs`, `_sealcookie.mjs`, `_corrupttoken.mjs`, `_geteventcheck.mjs`) verwijderd, opnieuw gedeployed, en met een geldige sessiecookie een `404` op de oude debug-route bevestigd (dus écht weg, niet toevallig 401 door de globale auth-middleware — die geeft 401 op elk `/api/*`-pad zonder sessie, ook op niet-bestaande routes, wat eerst tot een verkeerde conclusie had kunnen leiden).

### Completion Notes List

- **Alle 4 AC's zijn live end-to-end geverifieerd tegen de echte, gedeployde omgeving en een echt Google-account** — niet alleen typecheck/build, en niet alleen tegen aannames over hoe Google's API zich gedraagt (de `SERVICE_DISABLED`-blocker bewijst waarom dat onderscheid hier expliciet ertoe deed).
- **Scope strak gehouden, conform de story's eigen "buiten scope"-lijst:** geen `googleEventId`-opslag/mapping-tabel, geen aanroep vanuit een scheduling-flow (die bestaat nog niet — Epic 3+), geen conflict-detectie.
- **Tijdelijke testinfrastructuur (debug-route + scripts) is volledig en verifieerbaar opgeruimd, twee keer** — eerst na Task 7, opnieuw na de code-reviewpatches (die de write-sync-service opnieuw raakten en dus opnieuw een debug-route nodig hadden). Beide keren expliciet bevestigd met een `404`-check via een geauthenticeerde request tegen de productieomgeving, niet alleen "zou moeten weg zijn".

#### Code review (2026-08-01) — patches en een post-review productbeslissing

Na de formele `bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor) zijn 6 patches toegepast en 1 decision-needed item opgelost (zie Review Findings hierboven). Tijdens het bespreken van één patch (het weeskind-risico bij kleur wissen) besliste Hillebrand een grotere productwijziging: **huiswerk-kleur wordt verplicht**, in plaats van optioneel — dit keert de UX-spec's oorspronkelijke "Verplicht: Nee" en AC #1/#4's "geen kleur → alleen-lezend"-scenario om. Reden: "alle items automatisch aanpassen bij kleurwissel" (het mooiste alternatief) is niet bouwbaar zonder de `googleEventId`-opslag die Task 4 bewust naar Epic 3+ doorschoof, dus een waarschuwing was het enige haalbare alternatief voor "verplicht" — en Hillebrand koos voor verplicht.

Gevolgen, allemaal doorgevoerd en live geverifieerd:
- `PATCH /api/settings/homework-calendar-color` wijst `colorId: null`/ontbrekend nu af (400) i.p.v. het als "wissen" te accepteren. `setHomeworkCalendarColorFor`/`updateHomeworkCalendarColorId`'s signatuur versmald naar `colorId: number` (niet meer `| null`).
- De kolom `homeworkCalendarColorId` blijft **wél** nullable in het schema — bewuste keuze, geen migratie: `null` vertegenwoordigt nu uitsluitend de korte, voorbijgaande toestand vóórdat een gebruiker deze pagina voor het eerst bezoekt, niet een actieve keuze.
- Front-end: "Geen kleur"-optie verwijderd uit de select, vervangen door een `disabled`-placeholder ("Kies een kleur") die nooit een geldige klikbare waarde oplevert.
- **Rehydratie (oorspronkelijk een bewust geaccepteerde beperking, zie de nu-verwijderde Completion Note hierboven) is alsnog gebouwd**, op Hillebrands expliciete verzoek — het gat woog zwaarder zodra kleur verplicht werd (een terugkerende gebruiker leek dan zijn keuze kwijt, niet alleen een lege select te zien). Nieuwe `GET /api/settings/homework-calendar-color` + nieuwe domain-functie `getHomeworkCalendarColorFor`.
- **Een oorspronkelijke aanname bleek empirisch fout tijdens het verifiëren van de AC #3-patch, en is gecorrigeerd, niet verdedigd:** de eerste implementatie ving een 404 op `updateHomeworkEvent` af om het event te hermaken. Een losse live-testaanroep toonde dat Google een handmatig verwijderd event bewaart als een onzichtbare `status:"cancelled"`-tombstone en een PATCH ernaartoe gewoon met **200** beantwoordt (nooit 404) — de 404-tak werd dus nooit bereikt. Vervangen door `status:'confirmed'` altijd mee te sturen in elke PATCH, wat zo'n tombstone laat "herleven" met hetzelfde `googleEventId` (bevestigd met een losse test: cancelled → confirmed, zelfde id). `updateHomeworkEvent`'s returntype bleef daardoor `Promise<void>`, geen wijziging nodig.
- Live her-getest na de patches: rehydratie toont "3"/Druif bij laden; `PATCH` met `null` → 400; normale kleurwijziging → `needsReconsent:false`; create/update no-oppen correct bij ontbrekende kleur óf ontbrekende write-scope; handmatig verwijderd event herleeft via update; delete werkt door ongeacht kleurinstelling (guard verwijderd, getest met een direct-in-de-database-genulde kleur — niet via de app, want dat kan niet meer).

### File List

**Nieuw:**
- `server/api/settings/homework-calendar-color.patch.ts`
- `server/api/settings/homework-calendar-color.get.ts` (rehydratie, toegevoegd tijdens code review)
- `server/domain/calendar-sync/homework-events.ts`
- `server/domain/auth/calendar-token.ts`
- `shared/types/settings.d.ts`
- `server/data/migrations/0004_sleepy_wong.sql` (+ bijbehorende meta-bestanden)

**Gewijzigd:**
- `server/data/schema.ts` (`users`: `homeworkCalendarColorId`, `hasCalendarWriteScope`)
- `server/routes/auth/google.get.ts` (twee gememoïseerde scope-varianten, `include_granted_scopes`, `hasCalendarWriteScope` afgeleid uit `tokens.scope`)
- `server/domain/auth/users.ts` (`loginWithGoogle`'s input uitgebreid; nieuwe `setHomeworkCalendarColorFor`/`getHomeworkCalendarColorFor`)
- `server/data/users.ts` (`hasCalendarWriteScope` in de upsert; nieuwe `getUserById`, `updateHomeworkCalendarColorId`, `updateCalendarAccessToken`)
- `app/pages/instellingen/beschikbare-tijd.vue` (`avail-homework-sync-section` toegevoegd als zusje van `avail-calendar-section`; kleur-select nu verplicht met rehydratie en foutherstel)

**Verwijderd:**
- `server/domain/calendar-sync/.gitkeep` (map heeft nu echte inhoud)

**Live gedeployed:** dev-stage op `flowz.fyi`, migratie toegepast op de echte Turso-database. Tijdelijke debug-route (`server/api/_debug/calendar-sync-test.post.ts`) en verificatiescripts zijn ná gebruik verwijderd en horen niet bij deze File List.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-07-31 | Story aangemaakt via create-story. Drie architecturale keuzes vooraf beargumenteerd vastgelegd: kleur/scope-vlag op `users` i.p.v. `availableTimePatterns`, probeer-dan-ververs-bij-401 i.p.v. een vervaltijd-kolom, query-param-gebaseerde scope-upgrade i.p.v. een aparte route. |
| 2026-07-31 | Task 1 (schema) afgerond: `homeworkCalendarColorId`/`hasCalendarWriteScope` op `users`, migratie `0004_sleepy_wong.sql` gegenereerd en live toegepast, geverifieerd via `PRAGMA table_info`. |
| 2026-07-31 | Task 2 (OAuth-scope-upgrade) afgerond: de gememoïseerde `_handler` vervangen door twee varianten (readonly/write), `include_granted_scopes` toegevoegd om scope-downgrade bij een latere gewone login te voorkomen, `hasCalendarWriteScope` afgeleid uit de daadwerkelijke `tokens.scope`-respons. |
| 2026-07-31 | Task 3 (`PATCH /api/settings/homework-calendar-color`) en Task 4 (`server/domain/calendar-sync/`-write-sync-service, alle drie functies zelf-bewakend op de kleurinstelling) geïmplementeerd en getypecheckt. |
| 2026-07-31 | Task 5 (token-refresh, probeer-dan-ververs-bij-401) geïmplementeerd: nieuw `server/domain/auth/calendar-token.ts`, opgehaald ná precies één 401 vanuit de write-sync-service. |
| 2026-07-31 | Task 6 (front-end kleur-select) toegevoegd aan `beschikbare-tijd.vue` als zusje van `avail-calendar-section` (nestingsfout uit Story 2.2 expliciet vermeden en met een grep bevestigd). Typecheck en build slagen. |
| 2026-08-01 | Gedeployed naar de dev-stage. Task 7 gestart: Hillebrand doorliep de echte OAuth-her-consent-flow via de UI (kleur "Druif"), bevestigde `hasCalendarWriteScope`/`needsReconsent`-gedrag live. |
| 2026-08-01 | Blocker gevonden tijdens live-verificatie van de write-sync-service: Google Calendar API stond niet geactiveerd voor het OAuth-project (403 `SERVICE_DISABLED`) — geen codefout. Door Hillebrand geactiveerd in Google Cloud Console. |
| 2026-08-01 | Task 7 afgerond: create/update/delete van een echt Calendar-event geverifieerd via een tijdelijke, nooit-gecommitte debug-route + zelf-verzegelde sessiecookie — titel-template, `colorId`, tijd en verwijdering rechtstreeks bij Google bevestigd. AC #4 (geen kleur → `null`, geen Calendar-call) en token-refresh-bij-401 (bevestigd via het `updated_at`-zijeffect) beide bevestigd. Testevent en alle tijdelijke test-infrastructuur verwijderd, herdeployed, verwijdering bevestigd met een `404` op de oude debug-route. Status → review. |
| 2026-08-01 | Formele code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor): 1 decision-needed (AC #2's letterlijke `/api/calendar/...`-routecontract), 6 patch, 4 defer, 5 als ruis afgewezen. Decision-needed opgelost door Hillebrand: dismissed, AC #2's paden zijn shorthand voor de service, geen aparte HTTP-routes nodig. |
| 2026-08-01 | **Post-review productbeslissing (Hillebrand):** huiswerk-kleur wordt verplicht (keert AC #1/#4's "optioneel" om) — zie het Amendement bij de Acceptance Criteria. Reden: kleur wissen kon events voorgoed weeskind maken op de echte agenda, en "alle bestaande items automatisch bijwerken" (het geprefereerde alternatief) is niet bouwbaar zonder de naar Epic 3+ doorgeschoven `googleEventId`-opslag. Op Hillebrands verzoek meteen ook de rehydratie-beperking gefixed (nieuwe `GET /api/settings/homework-calendar-color`) — die woog zwaarder zodra kleur verplicht werd. |
| 2026-08-01 | Alle 6 patches + de kleur-verplicht-wijziging doorgevoerd. Onderweg bleek de AC #3-fix se oorspronkelijke aanname (404 bij een handmatig verwijderd event) empirisch fout: Google geeft 200 terug op een tombstone-event, nooit 404. Gecorrigeerd naar `status:'confirmed'` altijd meesturen, live bevestigd (cancelled → confirmed, zelfde `googleEventId`). Typecheck, build en volledige live her-verificatie (rehydratie, verplichte validatie, write-scope-guard, delete-zonder-kleur-guard, event-herstel) geslaagd tegen de echte omgeving. Tijdelijke debug-route en scripts opnieuw opgeruimd en verwijderd bevestigd. |
