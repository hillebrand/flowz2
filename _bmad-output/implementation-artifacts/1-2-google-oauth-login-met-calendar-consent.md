---
baseline_commit: b5c89539aea07064e62aec7c451a7b87142ca036
---

# Story 1.2: Google OAuth Login met Calendar-consent

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want in te loggen met mijn Google-account en in dezelfde stap Calendar-toegang te geven,
so that ik direct op het hoofdscherm kom zonder aparte stappen.

## Acceptance Criteria

1. **Given** Evelien ziet het inlogscherm, **when** ze op `login-google-button` klikt, **then** start de Google OAuth-flow met scope voor login + Calendar lezen (schrijf-scope volgt in Epic 2, Story 2.3), **and** komt bij succesvolle consent een `User`-rij tot stand die 1:1 aan het Google-account (OAuth-subject-id) gekoppeld is, zonder wachtwoordveld (AD-2), **and** wordt het Calendar access-/refresh-token bij diezelfde `User`-rij opgeslagen, **and** wordt een sessiecookie gezet, gevalideerd in Nitro-middleware voor alle volgende requests, **and** navigeert de browser direct naar `/` (FR27).
2. **Given** Evelien weigert de Google-consent of de flow mislukt, **when** ze terugkeert in Flowz, **then** toont 5.1-inlogscherm de foutstate (`login-error`, "Inloggen mislukt") met `aria-live="assertive"`, **and** kan ze opnieuw op `login-google-button` klikken.

## Tasks / Subtasks

- [x] Task 1: Google Cloud OAuth-client + secrets voorbereiden (AC: #1)
  - [x] Google Cloud Console: OAuth 2.0 Client ID (Web application) aanmaken, Testing-modus (AD-2 — bewust geen verificatie), redirect-URI's voor zowel lokale dev (`http://localhost:3000/...`) als `https://flowz.fyi/...` toevoegen — Client ID: `741979887322-...apps.googleusercontent.com`, redirect_uri live geverifieerd (zie Dev Agent Record)
  - [x] Hillebrand (en eventueel Evelien) als testgebruiker toevoegen aan het OAuth-consentscherm + Calendar-lees-scope toegevoegd aan de "Data Access"-sectie van het consentscherm — impliciet bevestigd: Hillebrand heeft de echte inlogflow succesvol doorlopen (zie Task 5)
  - [x] `sst.Secret("GoogleOAuthClientSecret")` van de Story 1.1-placeholder naar de echte client secret — voltooid, live geverifieerd (redirect naar Google's echte consentscherm met het juiste `client_id`)
  - [x] Nieuw `sst.Secret` voor de sessie-cookie-sealing-sleutel toevoegen aan `sst.config.ts` (analoog aan de twee bestaande secrets), gelinkt aan de Nuxt-component; waarde gezet via `sst secret set` — voltooid: secret aangemaakt, echte waarde gezet (`openssl rand -base64 32`), `sst deploy --stage dev` gedraaid, live geverifieerd op `flowz.fyi`
  - [x] Client ID (niet geheim) beschikbaar maken via `runtimeConfig` — hoeft niet via `sst.Secret`, alleen de secret zelf valt onder AD-5
- [x] Task 2: Turso-database + Drizzle-schema (AC: #1)
  - [x] Turso-database aanmaken voor de `dev`-stage; `sst.Secret("TursoAuthToken")` van de Story 1.1-placeholder naar het echte auth-token — voltooid (zie Dev Agent Record voor de valkuil: eerst per ongeluk een account-API-token i.p.v. een database-token gebruikt)
  - [x] `server/data/schema.ts`: `User`-tabel (Drizzle schema, libSQL-dialect) — UUID-id, Google OAuth-subject-id (uniek), Calendar access-token, Calendar refresh-token, timestamps; nadrukkelijk **geen** wachtwoordveld (AD-2)
  - [x] `drizzle.config.ts` (Turso-dialect), eerste migratie via `drizzle-kit generate` + `drizzle-kit migrate` — **niet** `drizzle-kit push` — voltooid en live geverifieerd: `users`-tabel bestaat in Turso met exact het verwachte schema (`PRAGMA table_info` gecontroleerd)
  - [x] `server/data/`: repository-functie voor upsert-by-Google-subject-id (geen rechtstreekse Drizzle-calls buiten `server/data/`)
- [x] Task 3: Google OAuth-flow + sessiecookie (AC: #1)
  - [x] `nuxt-auth-utils` toevoegen als dependency; `runtimeConfig.oauth.google.{clientId,clientSecret}` en `runtimeConfig.session` wiren vanuit de SST-secrets/env (zie Dev Notes voor de exacte config-vorm) — via `server/plugins/sst-secrets.ts` i.p.v. rechtstreeks in `nuxt.config.ts` (zie Completion Notes, expliciet genoemd als alternatief in Dev Notes)
  - [x] OAuth-route-handler (`defineOAuthGoogleEventHandler`) met scope die Calendar **lezen** toevoegt aan de standaard login-scope, en `offline`/`consent`-achtige config zodat een refresh-token terugkomt — exacte optienaam geverifieerd tegen de geïnstalleerde module-versie (`authorizationParams: { access_type, prompt }`, zie Completion Notes)
  - [x] `onSuccess`: roept de Task 2-repository aan (upsert `User` via `server/domain/`, nooit een rechtstreekse DB-write vanuit de route-handler zelf — consistent met de mutatie-ownership-regel voor Task/Session/Subtask, hier naar analogie toegepast op `User`), zet de sessie, redirect naar `/`
  - [x] `onError`: redirect naar `/inloggen` met een foutindicatie die de front-end kan omzetten naar `login-error` (bv. een querystring-vlag) — geen technische error-envelope (AD-6 geldt strikt genomen voor UJ-6/7/8-meldingen, maar dezelfde scheiding-in-shape-gedachte is hier op zijn plaats: dit is een gebruikersgerichte melding, geen API-fout)
- [x] Task 4: Front-end afronden (AC: #1, #2)
  - [x] `app/pages/inloggen.vue`: `loginFailed` niet langer een hardcoded `false`-stub, maar afgeleid van de foutindicatie uit Task 3; `login-google-button` krijgt een werkende navigatie naar de OAuth-startroute (volledige page-navigatie, geen `fetch` — dus geen schending van de "`app/` mag alleen `server/api/` aanroepen"-regel, die over data-calls gaat, niet over browser-redirects)
  - [x] `app/pages/index.vue`: de onvoorwaardelijke `navigateTo('/inloggen')` vervangen door een sessie-afhankelijke afweging (ingelogd → blijf op `/`; niet ingelogd → `/inloggen`) — **let op scope:** het echte 1.1-hoofdscherm hoort bij Epic 4 en wordt hier niet gebouwd; `/` toont voor een ingelogde gebruiker in déze story een minimale placeholder (bv. "Ingelogd" of vergelijkbaar), niet de volledige hoofdscherm-UI
- [x] Task 5: Verificatie
  - [x] End-to-end geverifieerd: succesvolle OAuth-flow (op `flowz.fyi`-dev-stage) resulteert in een nieuwe `User`-rij, sessiecookie, redirect naar `/` — **door Hillebrand zelf doorlopen en bevestigd**; concreet geverifieerd in Turso: precies 1 `User`-rij (`id`, `google_subject_id`, timestamps, geen wachtwoordveld) — exact AC #1. Lokale verificatie (`localhost:3000`) niet apart gedaan, niet vereist bovenop de live E2E.
  - [x] Foutpad geverifieerd: consent geweigerd → `login-error` zichtbaar met `aria-live="assertive"`, opnieuw inloggen werkt — **live geverifieerd op `flowz.fyi`**
  - [x] `nuxt typecheck` slaagt — ook via `sst shell --stage dev -- npm run typecheck` (met actieve SST-link)
  - [x] Geen secrets of placeholder-waarden in code/commits (alleen via `sst.Secret`)

### Review Findings

Code review 2026-07-30 (Blind Hunter + Edge Case Hunter + Acceptance Auditor, alle drie geslaagd). Alle bevindingen zijn geverifieerd tegen de daadwerkelijk geïnstalleerde library-broncode in `node_modules/`, niet tegen aannames.

**Decisions — alle vijf opgelost door Hillebrand op 2026-07-30.** De resulterende acties staan in de Patch- en Defer-lijsten hieronder.

- [x] [Review][Decision] **Besluit: overstappen op de `oidc`-provider.** Geen `state`/CSRF-validatie op de OAuth-callback — `nuxt-auth-utils`' Google-provider stuurt `state: query.state || ""` mee en verifieert die bij de callback nergens (`node_modules/nuxt-auth-utils/dist/runtime/server/lib/oauth/google.js:32`). `handleState`/`handleInvalidState` bestaan wél in `lib/utils.js` en worden door 14 van de 48 providers gebruikt — `google.js` is er geen van. Gevolg: login-CSRF is mogelijk (aanvaller laat Evelien inloggen op zíjn account; haar planning en Calendar-writes landen dan bij hem). `SameSite=Lax` blokkeert dit niet, want het is een top-level navigatie. Verzachtend: het consentscherm staat in Testing-modus met een allowlist, dus een aanvaller heeft zelf een toegelaten Google-account nodig. Opties: (a) `state` handmatig implementeren in de route, (b) overstappen op de generieke `oidc`-provider die `handleState` wél gebruikt, (c) bewust accepteren voor de MVP en vastleggen in `deferred-work.md`.
- [x] [Review][Decision] **Besluit: doorgeschoven naar Story 1.3** — reden: 1.3 gaat expliciet over sessieverval; daar in één keer consistent maken met NFR5's 7-dagen-refresh-tokenverval. Sessiecookie heeft geen enkele vervaldatum — er is nergens `session.maxAge` gezet; de module-default is alleen `{name, password, cookie:{sameSite}}` (`node_modules/nuxt-auth-utils/dist/module.mjs:78-84`). Twee gevolgen tegelijk, allebei ongewenst: h3 verzegelt met `ttl: 0` (= nooit verlopen, dus een gelekte cookie blijft onbeperkt geldig en is alleen te herroepen door `SessionPassword` te roteren), én `expires: config.maxAge ? … : void 0` (`node_modules/h3/dist/index.mjs:1429`) maakt er een browser-sessiecookie van, dus Evelien is uitgelogd zodra ze haar browser afsluit. De Dev Notes noemden `runtimeConfig.session.maxAge` expliciet als in te stellen. Hoe lang moet Evelien ingelogd blijven? Let op de samenhang met NFR5 (refresh-tokens verlopen na 7 dagen), formeel Story 1.3-scope.
- [x] [Review][Decision] **Besluit: de server-middleware echt laten afdwingen** (`requireUserSession` op een padprefix, met een expliciete lijst publieke paden: `/inloggen`, `/auth/*`). De Nitro-middleware handhaaft niets, en er is geen enkele auth-laag voor toekomstige pagina's — `server/middleware/session.ts:5` roept `getUserSession(event)` aan en gooit het resultaat weg. h3 slikt een mislukte unseal expliciet in (`node_modules/h3/dist/index.mjs:1384`, `unsealSession(...).catch(() => {})`), dus een vervalste cookie levert stilzwijgend een lege sessie op; er wordt niets geweigerd. `requireUserSession` komt in de hele repo niet voor, `app/middleware/` bestaat niet en er is geen `definePageMeta`. De enige feitelijke gate is de setup-check in `app/pages/index.vue:6` — die moet vanaf Epic 4 in elke nieuwe pagina handmatig herhaald worden en staat default open. Bijkomend: omdat `getSession` bij een ontbrekende `session.id` meteen `updateSession` aanroept, krijgt élke anonieme request een nieuwe `Set-Cookie`, wat alle SSR-responses oncachebaar maakt op CloudFront. AC #1 eist "gevalideerd in Nitro-middleware voor alle volgende requests" — dat wordt nu niet waargemaakt. Opties: (a) de middleware echt laten afdwingen op een padprefix, (b) een `auth.global.ts`-route-middleware in `app/`, (c) middleware schrappen en per beschermde route `requireUserSession` gebruiken. **De comment op regel 3 ("Gooit bij een corrupte/vervalste cookie") is hoe dan ook feitelijk onjuist en moet weg, welke optie je ook kiest.**
- [x] [Review][Decision] **Besluit: geaccepteerd, doorgeschoven** — reden: er is momenteel maar één stage, dus het probleem is latent; oppakken zodra er een tweede stage bijkomt. `flowz.fyi` is hardcoded voor élke stage — en hangt nu ook de OAuth-redirect eraan — `sst.config.ts:29` zet `NUXT_PUBLIC_SITE_URL: "https://flowz.fyi"` en `domain.name` staat op `flowz.fyi`, allebei zonder `$app.stage`-vertakking. Via `server/routes/auth/google.get.ts:18` bouwt elke stage daaruit zijn `redirectURL`, dus een tweede stage stuurt gebruikers na consent naar de dev-site én vecht om hetzelfde CloudFront-alias. Dat het domein niet stage-gated is, was jouw bewuste beslissing in Story 1.1; nieuw in 1.2 is dat de OAuth-flow er nu van afhangt. Opnieuw afwegen of accepteren?
- [x] [Review][Decision] **Besluit: encryptie-at-rest toevoegen** (nieuw SST-secret als sleutel, encrypt/decrypt in `server/data/users.ts`). Calendar access- en refresh-tokens staan plaintext in Turso — `server/data/schema.ts:8-9`, DDL `calendar_access_token text NOT NULL, calendar_refresh_token text NOT NULL`, geen crypto in `server/data/`. Wie het `TursoAuthToken`, een database-export of een Turso-lek heeft, heeft losstaand van Flowz doorlopende toegang tot Eveliens echte Google Calendar. AD-5 dekt app-secrets, niet gebruikerstokens; de architectuur schrijft hier niets voor. Opties: encryptie-at-rest met een SST-secret als sleutel, of expliciet als geaccepteerd MVP-risico vastleggen.

**Patch** — eenduidig te fixen:

- [x] [Review][Patch] Overstappen op de `oidc`-provider zodat `state`/CSRF-validatie via `handleState` meeloopt (uit besluit 1) [server/routes/auth/google.get.ts:12]
- [x] [Review][Patch] `server/middleware/session.ts` echt laten afdwingen met `requireUserSession` op een padprefix, plus de feitelijk onjuiste comment weghalen (uit besluit 3) [server/middleware/session.ts:1]
- [x] [Review][Patch] Calendar-tokens versleutelen at-rest met een nieuw SST-secret als sleutel (uit besluit 5) [server/data/users.ts:1]
- [x] [Review][Patch] Geweigerde Google-consent bereikt de foutstate nooit; de gebruiker gaat terug naar Google [server/routes/auth/google.get.ts:38]
- [x] [Review][Patch] Uitzonderingen in de callback-keten ontsnappen aan `onError` en geven een rauwe 500 [server/routes/auth/google.get.ts:25]
- [x] [Review][Patch] `tokens.refresh_token` gaat ongecontroleerd naar een NOT NULL-kolom [server/routes/auth/google.get.ts:29]
- [x] [Review][Patch] `aria-live="assertive"` kondigt niets aan omdat de foutstate via een volledige paginanavigatie binnenkomt [app/pages/inloggen.vue:17]
- [x] [Review][Patch] Te kort `SessionPassword` legt élke route plat, inclusief `/inloggen` [server/plugins/sst-secrets.ts:10]
- [x] [Review][Patch] `onError` gooit de error weg — productiefouten zijn niet te diagnosticeren [server/routes/auth/google.get.ts:38]
- [x] [Review][Patch] `?? ""` in `sst.config.ts` maakt een vergeten env var tot een groene maar kapotte deploy [sst.config.ts:25]
- [x] [Review][Patch] Page state "Bezig" uit de 5.1-spec is niet geïmplementeerd [app/pages/inloggen.vue:26]
- [x] [Review][Patch] `Resource.*` op module-scope — de lazy-fix uit `db.ts` is hier niet doorgevoerd [server/routes/auth/google.get.ts:14]
- [x] [Review][Patch] `drizzle.config.ts` valt buiten elke typecheck-scope [drizzle.config.ts:1]
- [x] [Review][Patch] `$defaultFn` op de timestamps is dode code en levert geen DDL-DEFAULT op [server/data/schema.ts:10]
- [x] [Review][Patch] `.gitignore` negeert een `.env.example` die niet bestaat [.gitignore:19]

**Na de patches gedeployed en geverifieerd (2026-07-30, dev-stage op `flowz.fyi`).** `nuxt typecheck`, `tsc -p tsconfig.tools.json` en `nuxt build` slagen; `TokenEncryptionKey` is aangemaakt en gezet; `npx sst deploy --stage dev` geslaagd en `sst-env.d.ts` door SST zelf opnieuw gegenereerd (mijn handmatige aanvulling is nu de echte gegenereerde inhoud).

Live geverifieerd:

- `GET /auth/google` → 302 naar Google met `state=<waarde>`, `nonce=<waarde>`, `code_challenge=<waarde>` en `code_challenge_method=S256` — de OIDC-provider draait, waar de oude handler een lege `&state&` en geen PKCE stuurde.
- **Blocker opgelost:** `GET /auth/google?error=access_denied&state=xyz` → 302 → `/inloggen?login_error=1`. Vóór de patch belandde dit in de `if (!query.code)`-tak en stuurde het de gebruiker terug naar Google's consentscherm. **AC #2's foutpad is hiermee voor het eerst écht gedekt.**
- `GET /inloggen?login_error=1` → 200, met `<p id="login-error" class="login-error" aria-live="assertive" style="display:none;"></p>` — de live-regio is bij SSR bewust leeg en verborgen, zodat het invullen ná mount een echte mutatie is die screenreaders aankondigen. Object ID en attribuut blijven exact zoals AC #2 en de 5.1-spec eisen.
- Middleware-handhaving: `GET /` met een browser-`Accept` → 302 → `/inloggen`; met `Accept: application/json` → 401. Precies de bedoelde splitsing tussen paginanavigatie en data-request.
- De "Bezig"-state is uitgeleverd: `login-google-button--busy` en "Bezig met inloggen…" zitten in de clientbundel (`/_nuxt/AqDhHYM2.js`).

**Succespad van AC #1 geverifieerd (2026-07-30):** Hillebrand heeft na de deploy opnieuw ingelogd op `flowz.fyi`. Controle in Turso (via `sst shell`, met een tijdelijk script dat alleen vorm/lengte/prefix logt, nooit tokenwaarden):

- Precies 1 `User`-rij, `id` ongewijzigd (`6cce9875-…`), `created_at` 14:53:52Z, `updated_at` 19:57:15Z — het upsert-conflictpad is dus gelopen, geen tweede rij. Dat bevestigt ook de voorspelling dat de oude platte-tekst-rij zichzelf heelt: beide tokenkolommen zijn ter plekke overschreven met versleutelde waarden. Geen datamigratie nodig geweest.
- `calendar_access_token`: 382 tekens opgeslagen, vorm `iv.authTag.ciphertext` correct, decryptie met `TokenEncryptionKey` **geslaagd** → 253 tekens klaartekst beginnend met `ya29.` (echt Google-access-token).
- `calendar_refresh_token`: 182 tekens opgeslagen, vorm correct, decryptie **geslaagd** → 103 tekens beginnend met `1//03` (echt Google-refresh-token).
- `TokenEncryptionKey` is 32 bytes, zoals `server/data/crypto.ts` eist.
- Dat er een refresh-token is, bewijst dat de nieuwe guard in `onSuccess` het happy path niet blokkeert en dat `access_type=offline`/`prompt=consent` via `params.authorization_endpoint` correct zijn doorgegeven aan de OIDC-provider.

Daarmee is AC #1 in zijn geheel gedekt onder de nieuwe implementatie: `User` 1:1 aan het Google-account via de OAuth-subject-id, geen wachtwoordveld, beide Calendar-tokens op diezelfde rij (nu versleutelde at-rest), sessiecookie gezet, en redirect naar `/`. AC #2 was al geverifieerd. `server/data/crypto.ts` heeft nu daadwerkelijk gedraaid.

**Defer** — reëel, maar niet door deze story veroorzaakt:

- [x] [Review][Defer] Migraties worden niet door de deploy toegepast en er is geen drift-detectie [README.md:71] — deferred, pre-existing
- [x] [Review][Defer] Geen automatische tests; correctheid rust volledig op één handmatige live run [package.json:8] — deferred, pre-existing
- [x] [Review][Defer] Geen lint-/import-boundary-handhaving [package.json:1] — deferred, pre-existing
- [x] [Review][Defer] Sessiecookie zonder `maxAge`: geen serverzijdig verval én browser-sessiecookie [nuxt.config.ts:23] — deferred: 1.3 gaat expliciet over sessieverval; daar in één keer consistent maken met NFR5's 7-dagen-refresh-tokenverval
- [x] [Review][Defer] `flowz.fyi` hardcoded voor élke stage, inclusief de OAuth-`redirect_uri` [sst.config.ts:29] — deferred: er is momenteel maar één stage, dus latent; oppakken zodra er een tweede stage bijkomt

## Dev Notes

- **Scope-grens:** dit is de eerste story met echte auth-logica, een database en een externe OAuth-integratie. De 7-dagen-verval-check van het refresh-token (NFR5, AD-2) hoort bij Story 1.3 — hier alleen opslaan, nog niet valideren/verlopen. Calendar-**schrijf**-scope hoort bij Story 2.3 — hier alleen lees-scope aanvragen.
- **Het echte hoofdscherm (1.1-hoofdscherm) bestaat nog niet** — dat is Epic 4-scope. AC #1's "navigeert naar `/`" is letterlijk te nemen: de root-route, niet per se een uitgewerkte UI. Bouw hier geen vooruitlopende hoofdscherm-features; een minimale, sessie-gated placeholder op `/` is voldoende (zelfde principe als Story 1.1: "entities/schermen alleen bouwen wanneer de story die nodig heeft eraan toe is").
- **Teststrategie is nog steeds niet vastgesteld** (zelfde open punt als in Story 1.1's Dev Notes, epics.md Additional Requirements: "nog niet besloten, hoort bij deze epic/story-fase"). Dit is de eerste story met voor het eerst echte te testen logica (OAuth-callback-verwerking, User-upsert) — een goed moment om dit alsnog te beslissen, maar geen blocker voor déze story; end-to-end-verificatie (zoals Task 5) is voor nu voldoende bewijs van correctheid.
- **Geen lint/import-boundary-handhaving aanwezig** (bekend, gedeferred issue uit Story 1.1's review — zie `deferred-work.md`). Let dus handmatig op de foldergrenzen: `app/` roept nooit rechtstreeks `server/domain/` of `server/data/` aan; mutaties op `User` lopen via `server/domain/`, nooit rechtstreekse Drizzle-calls vanuit `server/api/`- of route-handlers.
- **Aanbevolen library: `nuxt-auth-utils`** — een module specifiek voor Nuxt/Nitro die sealed-cookie-sessies én kant-en-klare OAuth-provider-handlers (waaronder Google) combineert, wat precies aansluit bij de architectuur-eis "sessiecookie, gevalideerd in Nitro-middleware" (Consistency Conventions). Bevestigde API-vorm (web-onderzoek, juli 2026):
  - Route-handler: `server/routes/auth/google.get.ts` (of een ander pad — het is een gewone Nitro event-handler, geen hard vereist pad) met `export default defineOAuthGoogleEventHandler({ config: {...}, async onSuccess(event, { user, tokens }) {...}, onError(event, error) {...} })`
  - Sessie zetten: `await setUserSession(event, { user: {...} })`; lezen: `getUserSession(event)` / `requireUserSession(event)` (401 als er geen sessie is) — dit laatste is de basis voor de "Nitro-middleware die elke volgende request valideert"-eis
  - Config via `runtimeConfig.oauth.google.{clientId,clientSecret}`; sessie-sealing via `runtimeConfig.session.password` (≥32 tekens)
  - **Belangrijk — hoe de SST-secrets hier terechtkomen:** SST-secrets zijn géén gewone env-vars. Ze worden pas runtime toegankelijk via `import { Resource } from "sst"` → `Resource.GoogleOAuthClientSecret.value` (bevestigd: architectuur SST v3/Ion). Zet die waarde dus **niet** in een `.env`-bestand of als letterlijke `NUXT_OAUTH_GOOGLE_CLIENT_SECRET`-omgevingsvariabele (schendt AD-5) — vul `runtimeConfig` in `nuxt.config.ts` (of een Nitro-plugin die bij startup runtimeConfig aanvult) met `Resource.GoogleOAuthClientSecret.value` / de nieuwe sessie-secret / `Resource.TursoAuthToken.value`. Client ID is niet geheim en mag gewoon een letterlijke waarde of gewone env-var zijn.
  - Sessie-`maxAge` instelbaar via `runtimeConfig.session.maxAge`
  - **Niet geverifieerd tijdens deze story-voorbereiding:** de exacte config-optie voor extra scopes (Calendar) en voor `access_type=offline`/`prompt=consent` (nodig om daadwerkelijk een refresh-token terug te krijgen — Google geeft die standaard alleen bij de eerste consent). Controleer dit tegen de TypeScript-types van de geïnstalleerde module-versie vóór je de config schrijft; niet blind een optienaam verzinnen.
  - Alternatief als `nuxt-auth-utils` tijdens implementatie niet goed past: een handmatige Nitro OAuth-route (`h3` primitives) — mag ook, zolang de sessiecookie/Nitro-middleware-eis overeind blijft. Geen harde library-eis in de architectuur, alleen het gedragscontract.
- **Turso/Drizzle voor het eerst echt in gebruik** (Story 1.1 had alleen `.gitkeep`-mappen). Architectuur-Stack-tabel: migraties via `drizzle-kit generate` + `migrate`, expliciet niet `push` (bekende table-recreation-bug tegen libSQL). Houd ook rekening met het al gedocumenteerde bundling-risico van `@libsql/client`'s platformspecifieke binaries (Rollup/esbuild kan ze verwijderen — bij een `runtime "Cannot find module"`-fout na deploy, expliciet als Nitro-`external` configureren; zie architectuur Deferred).
- **AD-2 blijft leidend:** `User` is 1:1 aan een Google-account gekoppeld via de OAuth-subject-id, geen wachtwoordveld, ooit. Consentscherm blijft in Testing-modus (bewuste keuze) — vandaar de handmatige testgebruiker-stap in Task 1.
- **AD-6-scheiding ook hier toepassen in geest, niet naar de letter:** AD-6 zelf gaat over UJ-6/7/8-meldingen, maar de onderliggende gedachte (technische error-envelope nooit voor gebruikersgerichte meldingen) is ook hier relevant voor de "Inloggen mislukt"-foutstate — gebruik niet de `{error:{code,message}}`-envelope uit `server/domain/errors.ts` daarvoor.
- **Bestaande front-end-stubs uit Story 1.1** (`app/pages/inloggen.vue`, `app/pages/index.vue`) zijn expliciet aangemerkt als tijdelijk in hun eigen code-comments ("Toont pas iets zodra Story 1.2 de OAuth-flow aansluit", "Tijdelijk: er is nog geen auth-middleware") — deze story is precies het moment om ze definitief te maken.

### Project Structure Notes

- Volgt de bestaande Structural Seed (ongewijzigd sinds Story 1.1): `server/api/` voor Nitro-routes, `server/domain/` voor mutatie-ownership, `server/data/` voor Drizzle-schema/repositories.
- Nieuw in déze story: `server/data/schema.ts` (of vergelijkbaar) krijgt voor het eerst echte inhoud (de `User`-tabel); `server/domain/` krijgt een plek voor de User-upsert-logica — de Structural Seed noemt alleen `tasks/`, `scheduling/`, `calendar-sync/` als submappen; `User` past bij geen van drieën. Kies een passende plek (bv. een nieuwe `server/domain/auth/`-submap) — dit is een kleine, redelijke uitbreiding van de Seed, geen architectuurwijziging (de mutatie-ownership-*regel* geldt onverkort, alleen de exacte submap-naam is niet vooraf vastgelegd).
- Geen conflicten met bestaande structuur: `app/`, `server/api/`, `server/domain/{tasks,scheduling,calendar-sync}`, `server/data/` bestaan al (grotendeels nog als `.gitkeep`-placeholders) uit Story 1.1.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.2-Google-OAuth-Login-met-Calendar-consent] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1-Inloggen-Fundament] — epic-context, FR27/NFR4/NFR5
- [Source: _bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md] — FR27 (Google-login + Calendar-consent in één stap), NFR4 (één-staps-consent), NFR5 (refresh-tokens verlopen na 7 dagen)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-2] — Google-account als enige identiteit, Testing-modus-consequenties
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-5] — secrets uitsluitend via SST
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-6] — technische error-envelope vs. Notification-shape, apart gehouden
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Consistency-Conventions] — mutatie-ownership via `server/domain/`, ISO 8601 UTC / minuten-precisie, sessiecookie via Nitro-middleware
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Stack] — Drizzle ORM (libSQL-driver, migraties via generate+migrate, niet push), Turso Cloud
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Deferred] — `@libsql/client`-bundling-risico
- [Source: design-artifacts/C-UX-Scenarios/05-evelien-start-met-flowz/5.1-inlogscherm/5.1-inlogscherm.md] — volledige UI-spec incl. Page States (Standaard/Bezig/Fout), Calendar-scope-notitie ("lees én schrijf" — schrijf pas vanaf 2.3)
- [Source: _bmad-output/implementation-artifacts/1-1-project-scaffolding-inlogscherm-ui.md] — vorige story: bestaande stubs (`inloggen.vue`, `index.vue`), bestaande placeholder-secrets (`GoogleOAuthClientSecret`, `TursoAuthToken`), Debug Log-notitie dat beide secrets nog een echte waarde nodig hebben
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — bekend, nog open: geen lint/import-boundary-handhaving
- Web-onderzoek (juli 2026, niet-officiële samenvatting, tijdens implementatie tegen de daadwerkelijk geïnstalleerde versie te verifiëren): `nuxt-auth-utils` (https://nuxt.com/modules/auth-utils) — `defineOAuthGoogleEventHandler`, `setUserSession`/`requireUserSession`, `NUXT_SESSION_PASSWORD`, `runtimeConfig.session.maxAge`; Drizzle+Turso (https://orm.drizzle.team/docs/get-started/turso-new) — Turso-dialect in `drizzle.config.ts`, `drizzle-kit generate`/`migrate`-workflow

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- AWS-sessie was verlopen bij aanvang; Hillebrand koos eerst voor "code-only doorwerken zonder AWS", en heeft later in de sessie alsnog opnieuw ingelogd ("Ik ben ingelogd in AWS"), waarna de AWS/SST-afhankelijke stappen alsnog zijn uitgevoerd (zie hieronder). Credentials moesten expliciet geëxporteerd worden (`eval "$(aws configure export-credentials --format env)"`) — de kale `aws sts get-caller-identity` werkte al, maar `sst`-commando's niet zonder die export.
- `Resource.*` rechtstreeks importeren in `nuxt.config.ts` (Dev Notes' eerste suggestie) breekt `nuxt prepare`/`typecheck`/`npm install`'s `postinstall` volledig zonder actieve SST-link. Opgelost via het Dev Notes-alternatief: secrets pas lezen op het punt van gebruik in server-runtime-code (niet in `nuxt.config.ts`, dat alleen bij config-load/typecheck wordt geëvalueerd, niet uitgevoerd).
- Eerste versie van die fix (een Nitro-plugin die `useRuntimeConfig()` muteerde) bleek zelf stuk: Nitro's `useRuntimeConfig()` retourneert een **deep-frozen** object (`Object.freeze`, zie `nitropack/dist/runtime/internal/config.mjs`) — de mutatie gooide `"Cannot assign to read only property 'clientSecret'"` bij elke request. Root-cause-analyse via de nitropack-broncode gaf twee vervolg-oplossingen: (a) `session.password` via `process.env.NUXT_SESSION_PASSWORD` zetten in de Nitro-plugin — nuxt-auth-utils leest dat env var lazy en rechtstreeks (niet via de frozen config) bij de allereerste sessie-aanroep; (b) `clientSecret`/`TursoAuthToken` niet via runtimeConfig maar rechtstreeks via `Resource.*` op de plek van gebruik (`server/routes/auth/google.get.ts`, `server/data/db.ts`) — beide zijn nu zo geïmplementeerd, `server/plugins/sst-secrets.ts` doet alleen nog de env-var-zet voor de sessiewachtwoord.
- `nuxt typecheck` gaf 2 fouten: (1) `noUncheckedIndexedAccess: true` maakt `.returning()`-destructuring een `T | undefined` — opgelost met een `user!`-assertion (upsert retourneert altijd exact één rij). (2) De gegenereerde `.nuxt/tsconfig.server.json` sluit root-bestanden buiten `server/`/`shared/` uit, dus `sst-env.d.ts` werd niet meegenomen — opgelost via `nitro.typescript.tsConfig.include`.
- Na AWS-herauthenticatie: `SessionPassword`-secret aangemaakt + echte waarde gezet (`openssl rand -base64 32`), gevolgd door `sst deploy --stage dev` (met Hillebrands expliciete akkoord, want dit zet work-in-progress-code live op `flowz.fyi`). Eerste deploy crashte de Lambda (502): `Runtime.ImportModuleError: Cannot find module '@libsql/linux-x64-gnu'` — precies het al-gedocumenteerde bundling-risico uit de architectuur-Deferred-sectie, maar erger dan verwacht: `nitro.externals` alleen was niet genoeg, want npm installeert optionele platform-specifieke native bindings alleen voor het huidige OS (macOS-devmachine), niet voor de Lambda's linux-x64-runtime. Root-fix: overgestapt op de native-binding-vrije `@libsql/client/web`-build (bedoeld voor edge/serverless-omgevingen) — maar `drizzle-orm/libsql` (zonder `/web`) importeert zélf statisch de native `@libsql/client`, dus ook de Drizzle-driver-import moest naar `drizzle-orm/libsql/web`. Na deze fix: geen `libsql`-package meer in `.output/server/package.json`, en `nitro.externals` kon weer weg.
- Tweede deploy-poging crashte anders (502 → `LibsqlError: URL_INVALID: The URL '' is not in a valid format`) omdat de libSQL-client **module-scope** (bij Lambda-cold-start) werd aangemaakt met een nog-lege `tursoDatabaseUrl` — dit liet zelfs routes zonder databasetoegang (`/`, `/inloggen`) crashen. Opgelost door de client lazy te maken (`getDb()`, pas aangemaakt bij de eerste echte query) — nu blijft de rest van de app werken ook al is Turso nog niet aangesloten.
- Na deze fix + herdeploy: live geverifieerd op `flowz.fyi` — zie Completion Notes voor de volledige lijst geverifieerde routes/gedrag.
- Kleine valkuil onderweg: `curl -I` stuurt een **HEAD**-request, niet GET — leverde eerst een vals-negatieve 404 op voor de (alleen-GET) `/auth/google`-route. Met een echte GET bleek de route gewoon te werken.
- Er draaide al een oude, kapotte `nuxt dev`-instance (PID 1808, sinds 2026-07-28) van vóór deze sessie op poort 3000 (500'de op elke request sinds deze story Resource-linking vereist) — gestopt, want die blokkeerde de lock die `sst shell -- npm run dev` nodig had, en leverde toch alleen nog foutieve responses op.
- **Turso API-token vs. database-token (Hillebrand's observatie):** eerste `TursoAuthToken`-poging resulteerde in `SERVER_ERROR: Server returned HTTP status 400` op zelfs een kale `SELECT 1` — leek eerst een SQL-syntaxfout (drizzle-orm's generieke libSQL-migrator gebruikt `SERIAL PRIMARY KEY`, een Postgres-isme, voor zijn interne bookkeeping-tabel), maar bleek volledig irrelevant: een test-script met een minimale query faalde net zo hard. Root cause: Hillebrand had een **account-niveau Turso API-token** aangemaakt (voor Turso's eigen beheer-API) i.p.v. een **database-specifiek auth-token** (voor de libSQL-client zelf) — te herkennen aan de JWT-payload (`org_id`-claim i.p.v. een `rid`/database-scope-claim). Opgelost door een echt databasetoken te genereren; nadien slaagde zowel de connectiviteitstest als de migratie in één keer.
- **`sst shell`/`sst deploy` serveren gecachete secret-waarden** — na het zetten van een nieuwe secret-waarde bleef een testscript de vorige (18-tekens-lange placeholder-)waarde zien totdat een volledige `sst deploy --stage dev` was gedraaid. Les: na élke `sst secret set` van een waarde die een lopende `sst shell`-sessie nodig heeft, eerst `sst deploy` draaien voordat je verder test.
- **`drizzle-kit migrate`'s CLI slikt de onderliggende foutmelding volledig in** (toont alleen een spinner + "exit status 1", ook met `CI=true`/`< /dev/null`). Omzeild door de migratie via een klein los Node-script te draaien dat rechtstreeks `migrate()` uit `drizzle-orm/libsql/migrator` aanroept met dezelfde `@libsql/client/web`-client als de app — dat wél de volledige stack trace/foutmelding toont. Nuttig voor toekomstige migratie-debugging.
- **Kritieke bug gevonden ná de eerste succesvolle `/auth/google`-redirect:** de `redirect_uri` die naar Google werd gestuurd was `https://<lambda-function-url>.lambda-url.eu-west-1.on.aws/auth/google` i.p.v. `https://flowz.fyi/auth/google` — zou in de praktijk een `redirect_uri_mismatch`-fout van Google hebben opgeleverd voor elke echte gebruiker. Oorzaak: `nuxt-auth-utils`' `getOAuthRedirectURL()` gebruikt h3's `getRequestURL(event)` zónder `xForwardedHost`-optie, dus het valt terug op de kale `Host`-header van de request die Nitro ziet — en CloudFront stuurt richting de Lambda Function URL-origin blijkbaar de origin's eigen hostname door, niet de oorspronkelijke `flowz.fyi`-Host van de browser. Opgelost door **niet** te vertrouwen op dynamische host-detectie in productie: een expliciete `NUXT_PUBLIC_SITE_URL`-env-var (`https://flowz.fyi`, gezet via `sst.config.ts`) + een `redirectURL`-override in de OAuth-config, alleen toegepast als die env-var gezet is (leeg op localhost, waar dynamische detectie wél klopt). Geverifieerd: `redirect_uri` toont nu correct `https://flowz.fyi/auth/google`.

### Completion Notes List

- **Volledig geïmplementeerd én live geverifieerd op `flowz.fyi` (dev-stage), met écht werkende Google-client en Turso-database:**
  - `GET /` → 302 → `/inloggen` (niet ingelogd, sessie-afhankelijke afweging werkt)
  - `GET /inloggen` → 200, alle Object IDs correct, `login-error` standaard verborgen (`display:none`)
  - `GET /inloggen?login_error=1` → 200, `login-error` zichtbaar (`aria-live="assertive"`) — **AC #2 geverifieerd**
  - `GET /auth/google` → 302 naar Google's échte consentscherm, met het juiste `client_id`, de juiste scopes (`openid email profile calendar.readonly`), `access_type=offline`, `prompt=consent`, **en** de correcte `redirect_uri` (`https://flowz.fyi/auth/google` — zie Debug Log voor de host-detectie-bug die dit eerst verkeerd toonde)
  - Sessiecookie (`nuxt-session`, sealed, `HttpOnly; Secure; SameSite=Lax`) wordt bij elke request gezet/gevalideerd via de Nitro-middleware — **AC #1's sessiecookie-vereiste geverifieerd**
  - Turso-database `flowz-hillebrand` (regio `aws-eu-west-1`, zelfde regio als de Lambda) bevat de gemigreerde `users`-tabel, schema geverifieerd via `PRAGMA table_info` — exact schema.ts, geen wachtwoordveld
  - `nuxt typecheck` slaagt, ook via `sst shell --stage dev` (met echte Resource-linking actief)
  - Geen native-binary-crashes meer (`@libsql/client/web` + `drizzle-orm/libsql/web`), geen crash meer op routes die geen database raken (lazy `getDb()`)
- **Task 5 afgerond door Hillebrand:** de echte inlogflow op `https://flowz.fyi` is door Hillebrand zelf doorlopen en gemeld als succesvol. Aansluitend geverifieerd in Turso: exact 1 `User`-rij (`id`: UUID, `google_subject_id`: numeriek Google-subject-id, `created_at`/`updated_at` ISO-timestamps, geen wachtwoordveld) — **AC #1 volledig bevestigd, inclusief het succesvolle-consent-pad.** Dit bevestigt impliciet ook dat de testgebruiker/Calendar-scope-instelling in Google Cloud Console (Task 1) correct stond, anders had de consent gefaald.
- **Ontwerpkeuzes afwijkend van de oorspronkelijke Dev Notes-aannames (zie Debug Log voor de volledige redenering):** (1) secrets worden gelezen op het punt van gebruik (`Resource.*` in `server/routes/auth/google.get.ts`/`server/data/db.ts`, env-var-trucje in `server/plugins/sst-secrets.ts` voor de sessiewachtwoord) i.p.v. via `runtimeConfig`-mutatie, want die laatste bleek deep-frozen; (2) `@libsql/client/web` + `drizzle-orm/libsql/web` i.p.v. de default node-variant, om de native-binary-bundlingfout (architectuur-Deferred-risico, erger uitgepakt dan gedocumenteerd) te vermijden; (3) de Turso-client wordt lazy aangemaakt (`getDb()`) i.p.v. module-scope, zodat niet-database-routes blijven werken zolang Turso nog niet is aangesloten; (4) een expliciete `NUXT_PUBLIC_SITE_URL` i.p.v. dynamische host-detectie voor de OAuth `redirect_uri`, want die laatste faalt achter CloudFront + Lambda Function URL.
- Alle taken/subtaken afgevinkt, alle acceptatiecriteria end-to-end geverifieerd (niet alleen code geschreven) — inclusief het succesvolle-consent-pad. Status → **review**.

### File List

**Nieuw:**
- `drizzle.config.ts`
- `server/data/schema.ts`
- `server/data/db.ts`
- `server/data/users.ts`
- `server/domain/auth/users.ts`
- `server/routes/auth/google.get.ts`
- `server/middleware/session.ts`
- `server/plugins/sst-secrets.ts`
- `shared/types/auth.d.ts`

**Gewijzigd:**
- `sst.config.ts` (nieuw `SessionPassword`-secret, niet-geheime env vars voor Client ID/Turso-URL/`NUXT_PUBLIC_SITE_URL`)
- `sst-env.d.ts` (auto-gegenereerd door een echte `sst deploy`, bevat nu ook `SessionPassword`)
- `nuxt.config.ts` (`nuxt-auth-utils`-module, minimale niet-geheime `runtimeConfig` incl. `public.siteUrl`, `nitro.typescript.tsConfig.include`)
- `server/data/migrations/` (nieuw: `0000_slow_vindicator.sql` + meta — eerste migratie, toegepast op Turso)
- `package.json` / `package-lock.json` (`nuxt-auth-utils`, `drizzle-orm`, `@libsql/client`, `drizzle-kit`)
- `app/pages/inloggen.vue` (`loginFailed` afgeleid van querystring, werkende `login-google-button`-navigatie)
- `app/pages/index.vue` (sessie-afhankelijke afweging i.p.v. onvoorwaardelijke redirect)
- `README.md` (dev-workflow via `sst shell`, 3 secrets, migratie-commando's)
- `server/api/.gitkeep`, `server/domain/{tasks,scheduling,calendar-sync}/.gitkeep` (ongewijzigd — even aangeraakt/teruggezet tijdens het werk, geen inhoudelijke wijziging)

**Live gedeployed (dev-stage, `flowz.fyi`):** meerdere deploys tijdens deze sessie (secret-linking, native-binary-fix, lazy-db-fix, secret-resync, redirect_uri-fix) — huidige live versie bevat alle bovenstaande code-wijzigingen én een écht werkende Google-client + Turso-database.

**Turso:** database `flowz-hillebrand` (regio `aws-eu-west-1`), `users`-tabel gemigreerd en schema-geverifieerd.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-07-30 | Task 3 en 4 volledig geïmplementeerd; Task 1/2 deels (code klaar, externe Google/Turso-stappen geblokkeerd). Status blijft in-progress. |
| 2026-07-30 | Na Hillebrands AWS-herauthenticatie: `SessionPassword`-secret aangemaakt en gezet, deploys gedraaid (met akkoord) — 2 productiebugs gevonden en gefixt (native-`libsql`-bundlingcrash → `@libsql/client/web`+`drizzle-orm/libsql/web`; module-scope DB-client crashte niet-database-routes → lazy `getDb()`). Foutpad (AC #2) en sessiecookie-mechaniek (AC #1) live geverifieerd op `flowz.fyi`. |
| 2026-07-30 | Hillebrand levert echte Google OAuth Client ID + Turso database-URL aan. `GoogleOAuthClientSecret` en `TursoAuthToken` gezet (na een valkuil: eerst per ongeluk een Turso account-API-token i.p.v. een database-token). Eerste Drizzle-migratie gedraaid en geverifieerd tegen de echte Turso-database. Kritieke bug gevonden en gefixt: OAuth `redirect_uri` toonde de rauwe Lambda Function URL i.p.v. `flowz.fyi` (CloudFront/Lambda-Function-URL host-detectie-probleem) — opgelost met een expliciete `NUXT_PUBLIC_SITE_URL`. `/auth/google` redirect nu volledig correct naar Google's echte consentscherm. |
| 2026-07-30 | Hillebrand doorloopt de echte inlogflow op `flowz.fyi` succesvol. Nieuwe `User`-rij geverifieerd in Turso. Alle taken/subtaken afgevinkt, beide acceptatiecriteria end-to-end bevestigd. Status → review. |
| 2026-07-30 | Code review (3 parallelle lagen): 20 bevindingen, 2 high. Blocker gevonden die AC #2 raakt — een geweigerde consent bereikte de foutstate nooit, want de Google-provider leest `query.error` niet en behandelde de callback als een nieuwe autorisatiestart. Tweede high: uitzonderingen (400 `invalid_grant`, userinfo-fout, databasefout) ontsnapten allemaal aan `onError` en gaven een rauwe 500. Alle 5 beslispunten door Hillebrand genomen, alle 15 patches toegepast: overgestapt op de `oidc`-provider (state + nonce + PKCE, en getypeerde tokens i.p.v. `any`), vangnet-`try/catch` om de hele keten, refresh-token-guard, echte handhaving in de Nitro-middleware, AES-256-GCM-encryptie voor de Calendar-tokens, fail-fast op ontbrekende env vars en een te korte `SessionPassword`, `aria-live` die nu daadwerkelijk aankondigt, en de ontbrekende "Bezig"-state. Typecheck en build slagen; live verificatie staat nog open. Status → in-progress. |
| 2026-07-30 | `TokenEncryptionKey` aangemaakt en gezet, `sst deploy --stage dev` geslaagd (met Hillebrands akkoord). Live geverifieerd op `flowz.fyi`: autorisatie-URL bevat nu `state`, `nonce` en `code_challenge_method=S256`; geweigerde consent landt op `/inloggen?login_error=1` (de blocker is weg); middleware stuurt browsers naar `/inloggen` en geeft data-requests een 401; "Bezig"-state uitgeleverd. Het succespad van AC #1 blijft ongetest — dat vereist een echte Google-consent door Hillebrand, en daarmee is `server/data/crypto.ts` nog nooit uitgevoerd. Status blijft in-progress. |
| 2026-07-30 | Hillebrand logt opnieuw in op `flowz.fyi`. Turso-controle: 1 `User`-rij (id ongewijzigd, upsert-conflictpad gelopen), beide tokenkolommen nu versleuteld met correcte `iv.authTag.ciphertext`-vorm, decryptie met `TokenEncryptionKey` geslaagd en klaartekst herkenbaar als echte Google-tokens (`ya29.` / `1//03`). De oude platte-tekst-rij heeft zichzelf geheeld zoals voorspeld. AC #1 en #2 beide volledig geverifieerd onder de nieuwe OIDC-implementatie. Alle 15 patches toegepast en live bevestigd, 5 items bewust gedeferd met reden. Status → done. |
