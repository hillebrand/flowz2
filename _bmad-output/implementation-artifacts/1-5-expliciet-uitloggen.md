---
baseline_commit: 535955b1066362fb70221d3e66f9334e41ec1c92
---

# Story 1.5: Expliciet Uitloggen

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want me op elk moment expliciet kunnen uitloggen,
so that ik op een schoollaptop niet hoef te wachten op de automatische timeout voordat ik veilig wegloop.

## Acceptance Criteria

1. **Given** Evelien is ingelogd (op elk apparaat, publiek of niet), **when** ze in het hamburgermenu op `nav-logout-button` klikt, **then** wordt de sessie serverside beëindigd (roept het bestaande `clearUserSession`-mechanisme aan, zelfde als bij een nieuwe login, Story 1.2) **and** navigeert de browser naar 5.1-inlogscherm.
2. **Given** Evelien is uitgelogd, **when** ze de browser-terugknop gebruikt naar een pagina die authenticatie vereist, **then** stuurt de server haar terug naar 5.1-inlogscherm (geen gecachte, ingelogde weergave zichtbaar).

## Tasks / Subtasks

- [x] Task 1: Uitlogroute (AC: #1)
  - [x] Nieuw bestand `server/routes/auth/logout.get.ts`, naast het bestaande `server/routes/auth/google.get.ts` (zelfde map/conventie: auth-flows leven in `server/routes/auth/`, niet in `server/api/`, en gebruiken geen JSON-envelope maar `sendRedirect`)
  - [x] Handler: roep `clearUserSession(event)` aan (zelfde functie die `startNieuweSessie()` in `google.get.ts` al gebruikt — geen nieuwe sessie-logica verzinnen) en redirect daarna naar `/inloggen` via `sendRedirect(event, '/inloggen')`
  - [x] Bewust een `GET`-route (net als `/auth/google`), geen `POST`: consistent met deze codebase's al bestaande, GET-gebaseerde auth-navigatiepatroon (de hele OAuth-loginflow is ook GET-gebaseerd). Geen client-side `$fetch`/interceptor-laag nodig — een simpele `<a href="/auth/logout">` volstaat, net als de bestaande Google-inlogknop.
  - [x] `/auth/` staat al in `server/middleware/session.ts`'s `PUBLIC_PREFIXES` (prefix-match op `/auth/`) — de nieuwe route heeft dus automatisch geen sessie nodig om bereikbaar te zijn. Geen wijziging aan de publieke-padlijst nodig. Verifieer dit wel expliciet (lees de bestaande `isPublic()`-functie) in plaats van het aan te nemen.

- [x] Task 2: Uitlogknop in het hamburgermenu (AC: #1)
  - [x] `app/components/HamburgerMenu.vue`: het bestaande `ITEMS`-array bevat alleen interne `NuxtLink`-navigatie (Takenoverzicht/Weekoverzicht/Beschikbare tijd) — uitloggen is geen SPA-navigatie maar een volledige paginanavigatie naar een server-route, dus geen nieuw `ITEMS`-item maken. Voeg in plaats daarvan een aparte `<a id="nav-logout-button" href="/auth/logout">Uitloggen</a>` toe, ná de `<ul>` met menu-items, binnen hetzelfde `hamburger-menu-panel`
  - [x] Visueel onderscheiden van de navigatie-items (bv. een scheidingslijn erboven), maar geen nieuwe visuele taal verzinnen — hergebruik de bestaande `.hamburger-menu-item`-stijl als basis
  - [x] Dit component wordt momenteel alleen op `app/pages/index.vue` gebruikt — dat is het enige bereikbare punt voor deze knop, consistent met hoe de andere menu-items nu ook alleen daar werken. Geen andere pagina's aanpassen.

- [x] Task 3: Geen gecachte, ingelogde weergave na uitloggen via de browser-terugknop (AC: #2)
  - [x] Onderzoek eerst of dit al vanzelf werkt: elke pagina in deze app is server-side gerenderd via Nitro, en `server/middleware/session.ts` draait bij élke request die niet in `PUBLIC_PREFIXES` valt. Het risico is specifiek **bfcache** (browser back/forward cache): een browser kan een eerder bezochte, beveiligde pagina uit het geheugen tonen ná een terugknop-klik, zónder daarvoor een nieuwe request naar de server te sturen — in dat geval draait de middleware helemaal niet en ziet Evelien de oude, ingelogde pagina alsnog.
  - [x] **Getest in een echte browser (niet aangenomen) — risico doet zich niet voor.** Zie Dev Agent Record voor de volledige opzet/bewijsvoering: een terugnavigatie na uitloggen triggert een verse `GET /`-request (200, gevolgd door de volledige paginaherlaad-cyclus met alle `_nuxt/*`-assets opnieuw), geen bfcache-herstel. Geen `Cache-Control`-header toegevoegd — dat zou een niet-bestaand probleem oplossen (expliciet uit scope gehouden, conform de eigen instructie van deze subtaak).
  - [x] N.v.t. — geen header toegevoegd, dus geen publieke-paden-uitzondering nodig.
  - [x] Uitkomst gedocumenteerd in de Dev Agent Record, inclusief de gebruikte testopzet (geforceerde sessiecookie + echte Chrome-navigatie + netwerkmonitoring).

- [x] Task 4: Verificatie
  - [x] `npm run typecheck` slaagt
  - [x] `npx nuxt build` slaagt
  - [x] Live/handmatig geverifieerd in een echte Chrome-browser (geen testframework aanwezig, zie Dev Notes → Testen): (a) ingelogd (geforceerde testsessie) → op `nav-logout-button` klikken → landt op 5.1-inlogscherm; (b) browser-terugknop gebruiken → verse serverrequest (netwerkmonitoring bevestigt `GET /` met status 200, gevolgd door volledige paginaherlaad), geen gecachte ingelogde weergave — zie Debug Log voor de volledige testopzet
  - [x] Geen secrets of placeholder-waarden in code/commits; het tijdelijke diagnostische hulpbestand (`server/routes/auth/debug-set-session.get.ts`) en alle geforceerde testcookies/scripts zijn na gebruik verwijderd, niet gecommit

## Dev Notes

### Dit is de kleinste story van Epic 1 tot nu toe — bouw 'm ook zo

Story 1.2/1.3/1.4 hebben alle sessie-primitieven al gebouwd: `clearUserSession`, de sessie-validerende middleware, het publieke-padlijst-mechanisme. Deze story voegt uitsluitend een **aanroeppunt** toe (een route + een knop) — geen nieuwe sessie-mechaniek. Als je jezelf betrapt op het herontwerpen van hoe sessies werken, ben je verdwaald: gebruik `clearUserSession(event)` exact zoals `startNieuweSessie()` in `server/routes/auth/google.get.ts` dat al doet.

### Waarom een GET-route en geen POST

Uitloggen is een state-wijzigende actie, en een GET daarvoor is in de REST-theorie een anti-patroon. Dit project kiest er hier bewust voor om **consistent te zijn met het bestaande patroon** in plaats van een nieuwe conventie te introduceren: de volledige Google-OAuth-inlogflow (`/auth/google`) is zelf ook een GET-gebaseerde, server-redirect-gedreven flow, zonder client-side `$fetch`/interceptor-laag. Een `POST`-only uitlogroute zou een heel nieuw patroon (client-side fetch-aanroep, foutafhandeling daarvan, geen `<a href>` meer) introduceren voor één knop, in een codebase die verder nergens zo'n patroon heeft (de enige bestaande `$fetch`-interceptor, `app/plugins/sessie-verval.client.ts` uit Story 1.3's deferred-work, reageert op 401's — hij initieert geen requests). Een simpele `<a href="/auth/logout">` past bij de rest van de auth-laag. Bouw geen client-side fetch-wrapper voor deze ene knop.

### `/auth/` is al publiek — geen wijziging aan de middleware nodig voor bereikbaarheid

`server/middleware/session.ts`'s `PUBLIC_PREFIXES` bevat al `'/auth/'` met een `startsWith`-match (nodig voor de bestaande OAuth-start/-callback). `/auth/logout` valt daar automatisch onder. Voeg **niets** toe aan `PUBLIC_PREFIXES` voor Task 1 — dat zou een niet-bestaand probleem oplossen.

### Bfcache is de enige echte onzekerheid in deze story — verifieer, neem niet aan

AC #2 vraagt iets specifieks: geen gecachte, ingelogde weergave na de browser-terugknop. Voor de meeste requests lost de bestaande middleware dit al op (`session.user` ontbreekt na `clearUserSession` → redirect). Het randgeval is specifiek de browser die een pagina uit het **back/forward cache** toont zonder de server opnieuw te bevragen. Of dit daadwerkelijk gebeurt hangt af van response-headers die deze app nu nergens zet (`grep` op `cache-control`/`Cache-Control` in `nuxt.config.ts` en `server/middleware/` levert niets op). Test dit echt in een browser (niet alleen met `curl`, want `curl` heeft geen bfcache) voordat je Task 3's `Cache-Control`-header toevoegt — als het probleem zich niet voordoet, is de header een oplossing voor een niet-bestaand probleem en hoeft-ie niet gebouwd te worden. Documenteer de uitkomst hoe dan ook.

### Bestanden die je aanraakt (huidige staat)

| Bestand | Huidige staat | Wat deze story doet |
| --- | --- | --- |
| `server/routes/auth/logout.get.ts` | Bestaat niet. | **NIEUW** — `clearUserSession` + redirect naar `/inloggen` (Task 1) |
| `app/components/HamburgerMenu.vue` | `ITEMS`-array met 3 `NuxtLink`-items, gebruikt op `index.vue`. | **UPDATE** — `nav-logout-button`-link toevoegen ná de `<ul>` (Task 2) |
| `server/middleware/session.ts` | Publieke-padlijst + `session.user`-check + (sinds Story 1.4) inactiviteitscheck voor publieke-computer-sessies. | **MOGELIJK UPDATE** — `Cache-Control: no-store` alleen als Task 3's onderzoek een echt bfcache-probleem aantoont |
| `server/routes/auth/google.get.ts` | OIDC-login, `startNieuweSessie()`, publieke-computer-cookielogica (Story 1.4, incl. code-review-fixes). | **NIET AANRAKEN** — deze story voegt een symmetrische uitlogroute toe, geen wijziging aan de inlogflow |

### Wat expliciet buiten scope valt

- **Geen wijziging aan de sessie-timeout-logica van Story 1.4.** Uitloggen is voor élke sessie beschikbaar (publiek-computer of niet) — er is geen aparte "alleen voor publieke computers"-variant van deze knop.
- **Geen bevestigingsdialoog vóór het uitloggen.** Noch de PRD (UJ-10) noch de epics.md-AC vragen daarom; bouw 'm niet vooruitlopend.
- **Geen wijziging aan `app/plugins/sessie-verval.client.ts`** (de 401-interceptor uit Story 1.3's deferred-work) — die reageert op verlopen sessies, niet op een bewuste uitlogactie. Een geslaagde uitlog-redirect triggert geen 401, dus er is geen overlap.
- **Geen "je bent uitgelogd"-melding.** Consistent met Story 1.3's precedent (geen "sessie verlopen"-melding): landen op het gewone inlogscherm is voldoende.

### Testen

Nog steeds geen testframework (zie `deferred-work.md`). Verificatie via typecheck, build, en een **echte browser-test** voor Task 3/AC #2 specifiek — dit is een van de weinige plekken in dit project waar `curl` niet volstaat, omdat bfcache-gedrag curl-onzichtbaar is.

## Previous Story Intelligence (Story 1.4)

- **`clearUserSession(event)` is de enige primitieve die nodig is** om een sessie te beëindigen — geen cookie-header-strippen zoals `startNieuweSessie()` dat doet voor een verse `createdAt` bij inloggen. Dat strippen was nodig omdát er meteen dáárna een nieuwe sessie werd aangemaakt in dezelfde request; uitloggen maakt geen nieuwe sessie aan, dus dat mechanisme is hier niet van toepassing. Kopieer het niet klakkeloos.
- **Code-review-precedent uit Story 1.4:** kleine, secundaire foutpaden (daar: mislukte/afgebroken logins) verdienen expliciete aandacht — een reviewer vond twee gevallen waarin een cookie niet werd opgeruimd buiten het hoofdpad. Voor déze story: er is geen vergelijkbare secundaire state om op te ruimen (uitloggen heeft geen tussentijdse cookie), maar wees alert op een analoog patroon mocht Task 3's bfcache-header ergens een uitzonderingspad missen.
- **Live verificatie tegen de dev-stage vereist `npx sst shell --stage dev -- npm run dev`** (niet de default persoonlijke stage — die heeft geen secrets) en een geldige AWS-sessie (`aws sts get-caller-identity`).

## Git Intelligence

Laatste commit (`535955b`) is Epic 6 + Turso-concurrency-fixes. Story 1.4's wijzigingen (`server/routes/auth/google.get.ts`, `server/middleware/session.ts`, `shared/types/auth.d.ts`, `app/pages/inloggen.vue`) staan nog ongecommit in de working tree op het moment dat deze story wordt aangemaakt — deze story bouwt daar dus bovenop, niet op de laatste commit alleen.

## Project Structure Notes

Eén nieuw bestand (`server/routes/auth/logout.get.ts`), geen nieuwe mappen, geen schemawijziging, geen migratie. Volgt de bestaande Structural Seed ongewijzigd.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.5-Expliciet-Uitloggen] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1-Inloggen-Fundament] — epic-context, FR32
- [Source: _bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md#UJ-10] — brontekst: uitlogknop voor elke sessie op de schoollaptop
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-9] — "een expliciete uitlog-route (nieuw, roept het al bestaande `clearUserSession` aan) is beschikbaar voor elke sessie, niet alleen publieke-computer-sessies"
- [Source: _bmad-output/implementation-artifacts/1-4-openbare-computer-vinkje-inactiviteitstimeout.md] — vorige story: sessie-/authpatronen, `clearUserSession`-gebruik, live-verificatiemethode (`sst shell --stage dev`), code-review-precedent voor secundaire foutpaden
- [Source: server/routes/auth/google.get.ts] — bestaande auth-routeconventies (GET-gebaseerd, `sendRedirect`, geen JSON-envelope)
- [Source: server/middleware/session.ts] — `PUBLIC_PREFIXES`, sessie-validatie, redirect-/401-logica
- [Source: app/components/HamburgerMenu.vue] — bestaand menu-component en zijn huidige enige gebruiksplek (`index.vue`)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — `app/plugins/sessie-verval.client.ts` (401-interceptor, niet te verwarren met deze bewuste uitlog-actie)

## Review Findings

Code review 2026-08-23 (`/code-review`, forked review-sessie op de uncommitted wijzigingen). Eén bevinding, **CONFIRMED** en direct gefixt.

- [x] [Review] **Logout-CSRF: de route had geen bescherming tegen een cross-site aanroep.** `nuxt-session` is `SameSite=Lax` (nodig voor de OAuth-callback, zie `google.get.ts`), en gaat dus mee op een top-level cross-site GET-navigatie. Een externe pagina kon Evelien daardoor stilzwijgend forceren om uit te loggen (`window.location = '.../auth/logout'` of een simpele link), zonder enige interactie behalve het bezoeken van die pagina. **Fix:** de route weigert nu een aanroep waarvan de `Sec-Fetch-Site`-header expliciet `cross-site` is (een door de browser gecontroleerde, niet-vervalsbare Fetch-Metadata-header) — `clearUserSession` wordt dan niet aangeroepen, alleen een neutrale redirect naar `/inloggen`. Geen CSRF-token/POST-laag toegevoegd: dat zou het bewust gekozen GET-gebaseerde authpatroon van deze story ondermijnen voor een low-impact risico (geen accountovername, alleen een ongewenste uitlog). Live geverifieerd met drie curl-scenario's (`Sec-Fetch-Site: cross-site` → sessie blijft intact; `same-origin` en geen header (oudere browsers) → sessie wordt gewoon gewist), exact zoals bedoeld.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Bfcache-test, volledige opzet:** geen testframework en geen bestaande echte gebruiker lokaal beschikbaar, dus een geforceerde sessiecookie gebruikt (zelfde iron-webcrypto-sealtechniek als Story 1.4/1.3, met de échte `SessionPassword` via `npx sst shell --stage dev`). Omdat de echte sessiecookie `httpOnly` is (niet zetbaar via `document.cookie` vanuit page-JS), is een tijdelijke, alleen-lokale diagnostische route toegevoegd (`server/routes/auth/debug-set-session.get.ts`, onder het al publieke `/auth/`-prefix) die de meegegeven waarde als een echte, server-gezette `Set-Cookie` plaatst — functioneel identiek aan een geslaagde login, zonder de OAuth-flow te hoeven doorlopen. Na gebruik direct verwijderd (bevestigd: niet in de uiteindelijke `git status`).
- **Chrome-browsertest (claude-in-chrome):** genavigeerd naar de diagnostische route → geauthenticeerde Home-pagina laadt (skeleton/foutstate door de fictieve testgebruiker-id, irrelevant voor deze test) → hamburgermenu geopend → `nav-logout-button` ("Uitloggen") geklikt → landt op 5.1-inlogscherm (met Story 1.4's "openbare computer"-checkbox zichtbaar ernaast, bevestigt dat beide stories elkaar niet in de weg zitten). Netwerkverzoeken gewist vlak vóór de terugknop-test, daarna `navigate(url:"back")`: het netwerklog toont een verse `GET http://localhost:4175/` met status `200`, gevolgd door de volledige asset-herlaadcyclus (`_nuxt/*`) — dit is het gedrag van een echte, nieuwe paginalading, niet van een bfcache-restore (die geen enkel netwerkverzoek zou tonen). **Conclusie: het in Task 3 beschreven risico doet zich in deze omgeving niet voor**, dus is er geen `Cache-Control`-header toegevoegd — conform de eigen instructie van de story ("een oplossing voor een niet-bestaand probleem hoeft niet gebouwd te worden").
- Alle tijdelijke bestanden (diagnostische route, forge-script, geforceerde cookiewaarden) zijn na gebruik verwijderd; `git status` ná afloop toont uitsluitend de vier bedoelde wijzigingen/nieuwe bestanden.

### Completion Notes List

- **AC #1 (uitlogknop → serverside sessie-einde → inlogscherm):** `server/routes/auth/logout.get.ts` roept `clearUserSession(event)` aan (dezelfde primitieve als `startNieuweSessie()` in `google.get.ts` al gebruikt) en redirect naar `/inloggen`. `app/components/HamburgerMenu.vue` heeft een `nav-logout-button`-link (`<a href="/auth/logout">`, bewust geen `NuxtLink`/`ITEMS`-entry — volledige paginanavigatie, geen SPA-routing). Live bevestigd in een echte browser.
- **AC #2 (geen gecachte ingelogde weergave na terugknop):** onderzocht en empirisch weerlegd als risico in de huidige opzet — zie Debug Log. Geen code toegevoegd voor een niet-waargenomen probleem.
- **Bewust geen `POST`-route, geen client-side fetch-laag, geen bevestigingsdialoog, geen "je bent uitgelogd"-melding** — allemaal expliciete, beargumenteerde scope-keuzes uit de story zelf (consistentie met het bestaande GET-gebaseerde authpatroon; geen PRD/AC-eis voor de overige punten).
- **Kleinste story van Epic 1 tot nu toe:** één nieuw bestand (12 regels), één bestaand component uitgebreid met een link+stijl, geen wijziging aan sessie-mechaniek zelf.

### File List

**Nieuw:**
- `server/routes/auth/logout.get.ts` (na code review: `Sec-Fetch-Site`-check tegen logout-CSRF toegevoegd)

**Gewijzigd:**
- `app/components/HamburgerMenu.vue` (`nav-logout-button`-link + scheidingslijn-stijl)

**Niet gewijzigd:** `server/middleware/session.ts`, `server/routes/auth/google.get.ts`, `shared/types/auth.d.ts`, `app/pages/inloggen.vue` (Story 1.4's bestanden — deze story raakt ze bewust niet aan)

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-23 | Story aangemaakt via create-story, na afronding van Story 1.4 (openbare-computer-vinkje + inactiviteitstimeout, status review) en diens code-review-fixes. |
| 2026-08-23 | Tasks 1-4 geïmplementeerd en geverifieerd, inclusief een echte Chrome-browsertest (niet alleen curl) voor AC #2's bfcache-risico — bleek in de praktijk niet op te treden. Typecheck/build schoon. Status → review. |
| 2026-08-23 | Code review: 1 bevinding (logout-CSRF via de `SameSite=Lax`-cookie op een cross-site GET), gefixt met een `Sec-Fetch-Site`-check in `server/routes/auth/logout.get.ts`. Typecheck/build schoon; fix live met drie curl-scenario's geverifieerd tegen de dev-stage. Status blijft `review`. |
