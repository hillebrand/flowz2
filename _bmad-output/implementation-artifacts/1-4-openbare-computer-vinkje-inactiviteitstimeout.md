---
baseline_commit: 535955b1066362fb70221d3e66f9334e41ec1c92
---

# Story 1.4: Openbare-computer-vinkje & Inactiviteitstimeout

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want op een gedeelde schoollaptop kunnen aangeven dat het een openbare computer is,
so that mijn sessie daar niet onbeperkt blijft openstaan als ik vergeet af te sluiten.

## Acceptance Criteria

1. **Given** Evelien ziet 5.1-inlogscherm, **when** de pagina laadt, **then** toont ze naast `login-google-button` een aanvinkbare `login-public-computer-checkbox` ("Dit is een openbare computer"), standaard uit.
2. **Given** Evelien vinkt `login-public-computer-checkbox` aan en rondt de Google-login af, **when** de sessie wordt aangemaakt, **then** wordt `isPublicComputer: true` en een initiële `lastActivity`-timestamp als top-level velden in de sessie zelf opgeslagen (`nuxt-auth-utils`' `UserSession`, geen nieuwe sessietabel) **and** vernieuwt de bestaande sessie-validerende Nitro-middleware `lastActivity` bij elke geauthenticeerde request (sliding window).
3. **Given** een sessie heeft `isPublicComputer: true`, **when** er meer dan 30 minuten verstrijken zonder geauthenticeerde request, **then** verklaart de middleware de sessie serverside ongeldig (`clearUserSession`) bij de eerstvolgende request, onafhankelijk van de cookie's eigen (absolute, niet-schuivende) vervaldatum, **and** wordt Evelien bij die eerstvolgende request naar 5.1-inlogscherm geleid, zoals bij een reguliere sessieverval (Story 1.3).
4. **Given** een sessie heeft `isPublicComputer` niet aangevinkt (het gebruikelijke geval, bv. haar eigen telefoon), **when** er tijd verstrijkt zonder activiteit, **then** geldt geen inactiviteitstimeout — alleen de bestaande 7-dagen refresh-token-vervaldatum (Story 1.3) is van toepassing.

## Tasks / Subtasks

- [x] Task 1: Type-uitbreiding `UserSession` (AC: #2)
  - [x] `shared/types/auth.d.ts` uitbreiden: naast de bestaande `interface User { id: string }`-augmentatie, de `#auth-utils`-module ook een `interface UserSession { isPublicComputer?: boolean; lastActivity?: number }` laten augmenteren (of toevoegen aan een bestaande gedeclareerde interface als die er al is — controleer eerst, `nuxt-auth-utils`' eigen `UserSession` heeft een index signature dus dit is puur voor typechecker-comfort, niet functioneel noodzakelijk)
  - [x] `npm run typecheck` blijft schoon na deze wijziging

- [x] Task 2: Checkbox op het inlogscherm (AC: #1)
  - [x] `app/pages/inloggen.vue`: een `ref<boolean>` (bv. `publicComputer`, default `false`) plus een `<input type="checkbox" id="login-public-computer-checkbox">` met een gekoppeld `<label>` ("Dit is een openbare computer"), visueel onder `login-google-button` of ernaast — volg de bestaande kaart-stijl (zelfde `.login-card`-context), geen nieuwe visuele taal verzinnen
  - [x] De huidige `login-google-button` is een kale `<a href="/auth/google">` — dit moet een **computed href** worden die, als `publicComputer` aan staat, `?publicComputer=1` toevoegt (bv. `/auth/google?publicComputer=1`), anders het kale pad. Behoud `onLoginClick`/`busy`-gedrag ongewijzigd.

- [x] Task 3: Vinkje overleeft de OAuth-round-trip (AC: #2) — **kernrisico van deze story, lees dit volledig voordat je begint**
  - [x] Google echoot onbekende query-params op de `redirect_uri` **niet** terug (zelfde beperking als de bestaande `?scope=write`-param, zie de comment boven `getHandler` in `server/routes/auth/google.get.ts`) — `?publicComputer=1` is dus bij de **callback**-leg (`?code=...&state=...`) alweer verdwenen. Er is een aparte drager nodig die de round-trip naar Google en terug overleeft, exact zoals de oidc-provider dat al doet voor `state`/nonce/PKCE via eigen cookies.
  - [x] In de buitenste `defineEventHandler` (onderaan het bestand, vóór `getHandler(variant)(event)` wordt aangeroepen): als dit de **eerste leg** is (`getQuery(event).code` ontbreekt) én `getQuery(event).publicComputer === '1'`, zet dan een kortlevende cookie (`flowz-oauth-public-computer`, `httpOnly: true, secure: !isDevelopment, sameSite: 'lax', maxAge: 600, path: '/'` — zelfde conventie als nuxt-auth-utils' eigen `OAUTH_COOKIE_MAX_AGE`/`secure`-instelling voor de PKCE-cookie, zodat het ook op localhost werkt) via `setCookie(event, ...)`
  - [x] In `onSuccess` (de **callback**-leg): lees die cookie via `getCookie(event, 'flowz-oauth-public-computer')`, bepaal daarmee `isPublicComputer` voor de nieuwe sessie, en ruim de cookie direct op met `deleteCookie(event, 'flowz-oauth-public-computer', { path: '/' })` — laat 'm niet nodeloos staan
  - [x] **Volgorde-afhankelijkheid:** dit moet gebeuren vóór `startNieuweSessie(event)` de cookies opschoont/aanmaakt, maar de tijdelijke cookie zelf hoeft niet door `startNieuweSessie`'s cookie-stripping geraakt te worden (die stript specifiek `nuxt-session`, niet andere cookies) — lees 'm dus gewoon uit vóór of na die aanroep, zolang het vóór `deleteCookie` gebeurt

- [x] Task 4: Vinkje overleeft een scope-upgrade-re-login (AC: #2, randgeval)
  - [x] `startNieuweSessie(event)` roept `clearUserSession` aan en verwijdert de sessiecookie volledig, dus een **al ingelogde** gebruiker die via `/auth/google?scope=write` opnieuw door de OAuth-flow gaat (Story 2.3's her-consent-stap voor Calendar-schrijftoegang) verliest daarmee stilzwijgend een eerder gezette `isPublicComputer`-vlag, tenzij die expliciet wordt meegenomen
  - [x] Los dit op door, vóór `startNieuweSessie(event)` wordt aangeroepen in `onSuccess`, de **huidige** sessie op te vragen (`await getUserSession(event)`) en diens `isPublicComputer`/`lastActivity` te bewaren als fallback wanneer de tijdelijke cookie (Task 3) ontbreekt — zo blijft een eerder gezet vinkje intact bij een her-consent, zonder dat Story 2.3's UI iets hoeft te weten van deze vlag
  - [x] Documenteer deze afweging kort in de Dev Agent Record — dit is een interactie tussen deze story en een al bestaande, afgeronde story (2.3), geen wijziging aan 2.3's eigen bestanden

- [x] Task 5: Sessie aanmaken met de nieuwe velden (AC: #2)
  - [x] `onSuccess`'s `setUserSession(event, { user: { id: dbUser.id } })`-aanroep uitbreiden: als `isPublicComputer` (uit Task 3/4) waar is, ook `isPublicComputer: true` en `lastActivity: Date.now()` meegeven in hetzelfde object; anders geen van beide velden zetten (afwezig = "geen publieke computer", niet `false` — zie Dev Notes over waarom dit onderscheid er niet toe doet voor de middleware-check, maar wel voor leesbaarheid)

- [x] Task 6: Inactiviteitstimeout in de middleware (AC: #3, #4)
  - [x] `server/middleware/session.ts`: ná `getUserSession(event)` en de `session.user`-check, vóór de vroege `return`: als `session.isPublicComputer` waar is, bereken `Date.now() - (session.lastActivity ?? 0)`; is dat `> 30 * 60 * 1000`, behandel de sessie dan als afwezig (roep `clearUserSession(event)` aan en val door naar dezelfde redirect-/401-logica die al bestaat voor een ontbrekende sessie — dupliceer die logica niet, hergebruik het bestaande pad)
  - [x] Is de sessie een publieke-computer-sessie én **niet** verlopen: vernieuw `lastActivity` via `setUserSession(event, { lastActivity: Date.now() })` (deze merget met de bestaande sessie-data, `user`/`isPublicComputer` blijven ongemoeid — zie Dev Notes voor het bewijs van dit merge-gedrag) vóórdat de middleware `return`t
  - [x] Sessies **zonder** `isPublicComputer`: geen enkele wijziging aan het bestaande gedrag — geen `lastActivity`-veld, geen extra `setUserSession`-aanroep per request (voorkomt onnodige cookie-churn op elke request voor het normale, niet-publieke geval)

- [x] Task 7: Verificatie
  - [x] `npm run typecheck` slaagt
  - [x] `npx nuxt build` slaagt
  - [x] Live/handmatig geverifieerd (geen testframework aanwezig, zie Dev Notes → Testen): (a) inloggen met het vinkje **uit** → sessie zonder `isPublicComputer`, geen timeout ook na >30 min inactiviteit; (b) inloggen met het vinkje **aan** → sessie met `isPublicComputer: true`, na kunstmatig >30 min inactiviteit (bv. door `lastActivity` in een testcookie terug te dateren, zelfde truc als Story 1.3's `createdAt`-test) volgt bij de eerstvolgende request een redirect naar `/inloggen`; (c) een publieke-computer-sessie die **binnen** 30 minuten actief blijft, blijft ingelogd (verifieer dat `lastActivity` daadwerkelijk vernieuwt tussen twee requests) — **uitgevoerd, zie Debug Log**
  - [x] Geen secrets of placeholder-waarden in code/commits

## Dev Notes

### Waarom dit geen sliding window kan zijn via de cookie zelf

Story 1.3 heeft al vastgesteld (en empirisch bewezen) dat h3's ingebouwde `maxAge` **absoluut** is, gebaseerd op `createdAt`, en nooit ververst bij latere requests (`node_modules/h3/dist/index.mjs`, `unsealSession`: `Date.now() - unsealed.createdAt > maxAge`). Er is dus geen manier om via de cookie-configuratie zelf een écht schuivend inactiviteitsvenster te krijgen dat afwijkt van de globale 7-dagen-instelling in `nuxt.config.ts` (`runtimeConfig.session.maxAge`, gebruikt door élke sessie). Vandaar AD-9's keuze: de 30-minuten-inactiviteitstimeout wordt **los van** die cookie-`maxAge` gehandhaafd, met eigen top-level sessievelden (`isPublicComputer`, `lastActivity`) die de al-bestaande sessie-validerende middleware (`server/middleware/session.ts`) controleert. Bouw geen aparte `maxAge`-override per sessie — dat lost dit probleem niet op en zou bovendien de absolute-niet-schuivende-eigenschap die Story 1.3/NFR5 nodig heeft, verstoren voor die ene sessie.

### `setUserSession` merget — bewijs uit deze codebase, niet aanname

Story 1.3's review dook hier al in: `setUserSession` loopt uiteindelijk via h3's `updateSession`, die de nieuwe data samenvoegt met de bestaande sessie-data (defu-achtige merge) in plaats van te vervangen. Dat betekent dat `setUserSession(event, { lastActivity: Date.now() })` in de middleware **niet** het bestaande `user`- of `isPublicComputer`-veld wist — je hoeft die niet opnieuw mee te geven. Gebruik hiervoor **niet** `replaceUserSession` (dat vervangt wél volledig) — dat zou `user` verliezen en de gebruiker effectief uitloggen bij elke request.

### Waarom `?publicComputer=1` niet gewoon "gewoon werkt"

Dit is de belangrijkste valkuil in deze story. De bestaande `?scope=write`-query-param op `/auth/google` wordt uitsluitend gelezen op de **eerste leg** (vóór de redirect naar Google) om te kiezen welke van de twee gememoïseerde OIDC-handler-varianten (readonly/write) de config voor de uitgaande autorisatie-URL bouwt. Google's callback (`redirect_uri`) krijgt die param nooit terug — het commentaar in de bestaande code is daar expliciet over: *"Op de callback-leg (`?code=...`) ontbreekt deze queryparam sowieso (Google echoot 'm niet terug)"*. Een naïeve implementatie die `getQuery(event).publicComputer` leest **binnen** `onSuccess` zal dus altijd `undefined` zien, ook als het vinkje was aangevinkt. De oidc-library lost exact dit probleem voor `state`/nonce/PKCE al op via eigen kortlevende cookies die de round-trip overleven (`nuxt-auth-state`/`-nonce`/`-pkce`) — Task 3 past hetzelfde patroon toe voor het publieke-computer-vinkje, met een eigen cookienaam.

### Bestanden die je aanraakt (huidige staat)

| Bestand | Huidige staat | Wat deze story doet |
| --- | --- | --- |
| `app/pages/inloggen.vue` | Statisch inlogscherm: merknaam, tagline, foutstate, één `<a href="/auth/google">`-knop met "Bezig"-state. Geen formulier, geen andere interactieve elementen. | **UPDATE** — checkbox toevoegen, knop-href computed maken (Task 2) |
| `server/routes/auth/google.get.ts` | OIDC-provider (twee gememoïseerde varianten voor scope), `onSuccess` doet `loginWithGoogle` → `startNieuweSessie` → `setUserSession` → redirect naar `/`. Buitenste `defineEventHandler` leest alleen `?scope`. | **UPDATE** — tijdelijke cookie zetten/lezen (Task 3/4), `setUserSession`-call uitbreiden (Task 5) |
| `server/middleware/session.ts` | Publieke-padlijst + `getUserSession`-check; geen sessie → redirect (HTML) of 401 (overig). Geen enkele vorm van tijdgebonden logica. | **UPDATE** — inactiviteitscheck + `lastActivity`-refresh toevoegen (Task 6), vóór de bestaande vroege `return` |
| `shared/types/auth.d.ts` | Eén module-augmentatie: `interface User { id: string }`. | **UPDATE** — `UserSession`-augmentatie toevoegen (Task 1) |
| `server/domain/auth/users.ts` | `loginWithGoogle`, gebruikersopslag/-lookup, tokenversleuteling. Geen sessie-gerelateerde logica. | **NIET AANRAKEN** — deze story raakt alleen de sessielaag, niet de user-persistence |

### Wat expliciet buiten scope valt

- **Geen uitlog-knop/route.** Dat is Story 1.5 — deze story bouwt alleen het vinkje en de timeout-handhaving. Na een timeout belandt Evelien op hetzelfde inlogscherm als bij een reguliere sessieverval (Story 1.3) — geen nieuwe pagina-state, geen melding (consistent met Story 1.3's besluit "geen sessie-verlopen-melding").
- **Geen wijziging aan Story 2.3's Calendar-kleur-instelscherm of scope-upgrade-UI.** Task 4 lost de flag-interactie server-side op, zonder dat client-code in Epic 2 iets hoeft te weten van `isPublicComputer`.
- **Geen aanpassing van de globale `session.maxAge` (7 dagen, NFR5/Story 1.3).** Die blijft voor élke sessie gelden, ook publieke-computer-sessies — de 30-minutentimeout is een aanvullende, striktere check die alleen voor die sessies geldt, geen vervanging.

### Testen

Nog steeds geen testframework (zie `deferred-work.md`, meermaals doorgeschoven — geen goed moment om dat hier te forceren, deze story voegt relatief geïsoleerde sessie-logica toe). Verificatie loopt via typecheck, build en handmatige/live tests, zoals Story 1.3 dat deed voor de 7-dagen-vervaltermijn. Hergebruik dezelfde truc: een sessiecookie handmatig verzegelen met een teruggedateerd `lastActivity`-veld (i.p.v. `createdAt`) om de 30-minutengrens te toetsen zonder 30 minuten te hoeven wachten.

## Previous Story Intelligence (Story 1.3)

- **Het vervalvenster-mechanisme is absoluut, niet schuivend** — expliciet geverifieerd tegen de geïnstalleerde `h3`-broncode. Deze story bouwt bewust een aanvullend, wél schuivend mechanisme ernaast, niet erbovenop.
- **`clearUserSession()` alleen is niet genoeg om een sessie écht te vernieuwen** — het verwijdert de sessie uit `event.context`, maar een volgende `getSession` leest de cookie gewoon opnieuw uit de request-header. `startNieuweSessie()` in `google.get.ts` lost dit al op door ook de `nuxt-session`-cookie uit de requestheader te strippen. Voor Task 6 is dit niet relevant (`clearUserSession` bij een timeout hoeft niet gevolgd te worden door een nieuwe sessie in dezelfde request), maar voor Task 3/4 (die in dezelfde `onSuccess`-flow zitten als `startNieuweSessie`) is het goed om te weten dat cookie-stripping daar specifiek en bewust is, niet incidenteel.
- **Geen "sessie verlopen"-melding is een bewuste, herbevestigde ontwerpkeuze van Hillebrand** (Story 1.3) — deze story volgt hetzelfde patroon voor een timeout-uitlog: stil terug naar het inlogscherm, geen vierde page-state.
- **Empirisch verifiëren, niet aannemen** — Story 1.3's review verwierp meerdere "voor de hand liggende" aannames over hoe h3 sessies precies bijwerkt. Verifieer Task 5/6's merge-gedrag en de cookie-round-trip in Task 3 net zo empirisch (live tegen de dev-stage of lokaal met `npx sst shell -- npm run dev`) voordat je ze als correct in de Dev Agent Record vastlegt.

## Git Intelligence

Laatste commit (`535955b`) is Epic 6 (tijdgebrek-detectie t/m agendaconflicten) + projectbrede Turso-concurrency-fixes — geen raakvlak met de authlaag. De meest recente auth-relevante commit is Story 1.2/1.3 (OIDC-login, sessieverval), waarvan de patronen hierboven zijn overgenomen.

## Project Structure Notes

Volgt de bestaande Structural Seed ongewijzigd — geen nieuwe mappen, geen schemawijziging, geen migratie. Alle wijzigingen vallen binnen de al bestaande auth-/sessielaag (`server/routes/auth/`, `server/middleware/`, `shared/types/`).

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4-Openbare-computer-vinkje-Inactiviteitstimeout] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1-Inloggen-Fundament] — epic-context, FR31/FR32/NFR10
- [Source: _bmad-output/planning-artifacts/epics.md] — NFR10: 30-minuten-inactiviteitstimeout voor publieke-computer-sessies, sliding window, los van cookie-vervaldatum
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-9] — publieke-computer-vlag en `lastActivity` als top-level sessievelden, middleware-handhaving, expliciet los van h3's absolute `maxAge`
- [Source: _bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md#UJ-10] — brontekst: schoollaptop, openbare-computer-vinkje, 30 min inactiviteit, uitlogknop (Story 1.5)
- [Source: _bmad-output/implementation-artifacts/1-3-sessieverval-opnieuw-inloggen.md] — vorige story: bewijs dat `maxAge` absoluut/niet-schuivend is, `setUserSession`-mergegedrag, "geen melding"-precedent, empirische-verificatie-aanpak
- [Source: server/routes/auth/google.get.ts] — huidige OIDC-implementatie, `startNieuweSessie()`, `?scope=write`-patroon (analoog voor `?publicComputer=1`)
- [Source: server/middleware/session.ts] — huidige sessie-validatie, publieke-padlijst, redirect-/401-logica

## Review Findings

Code review 2026-08-23 (`/code-review`, uitgevoerd als losse forked review-sessie op de uncommitted wijzigingen). Twee bevindingen, beide **CONFIRMED** en direct gefixt — geen blockers overgebleven.

- [x] [Review] **Stale pending-cookie overleeft een mislukte inlogpoging.** `flowz-oauth-public-computer` werd alleen in `onSuccess` gelezen/verwijderd; een poging die daarvóór faalt (ontbrekende `refresh_token`, `onError`, of de buitenste catch — bv. een token-exchange- of userinfo-fout) liet de cookie tot 10 minuten staan. Een latere, ongerelateerde poging zónder het vinkje erfde 'm dan alsnog. **Fix:** de cookie wordt nu altijd eerst verwijderd op de eerste leg (vóór een eventuele nieuwe `setCookie`), én expliciet opgeruimd in `onError` en de buitenste `catch` — niet alleen in het succespad. Empirisch geverifieerd (tijdelijke diagnostische kortsluiting, direct weer verwijderd): cookie zetten → volgende poging zonder vinkje → cookie komt terug als `Max-Age=0`.
- [x] [Review] **De bestaande-sessie-fallback (Task 4) was te breed.** Bedoeld voor uitsluitend Story 2.3's scope-upgrade-her-consent (`?scope=write`), maar gold voor élke `/auth/google`-aanroep zonder pending-cookie — dus ook een gewone her-login (bv. via bookmark) terwijl er nog een actieve publieke-computer-sessie bestond, wat het vinkje dan ongewenst opnieuw oplegde. **Fix:** de fallback is nu gegateld op `variant === 'write'` (dezelfde variabele die al bepaalt welke OAuth-scope wordt aangevraagd) — bij de gewone `readonly`-variant telt uitsluitend de pending-cookie. Logisch/statisch geverifieerd (typecheck + build schoon); niet apart live getest omdat dat een echte tweede Google-consent vanuit een al actieve sessie vereist, wat zonder browserinteractie niet reproduceerbaar is.

**Bijkomende aanscherping tijdens de fix (niet in de oorspronkelijke review-bevindingen, wel logisch noodzakelijk):** het lezen/verwijderen van de pending-cookie in `onSuccess` is verplaatst naar vóór de `refresh_token`-guard — anders zou precies het door de reviewer genoemde voorbeeld ("Google levert geen refresh_token") de cookie alsnog laten overleven, omdat die vroege `return` vóór de oorspronkelijke lees/verwijder-regel lag.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

- **AWS-sessie verlopen bij eerste poging** (`aws sts get-caller-identity` faalde), waardoor `npm run dev` zonder SST-link faalde (`server/plugins/sst-secrets.ts` gooit "It does not look like SST links are active" op élke route). Na hernieuwde AWS-login (Hillebrand) opgelost.
- **Eerste `sst shell`-poging faalde alsnog** met `"SessionPassword" is not linked` — bleek de verkeerde stage: zonder `--stage` valt `sst shell` terug op een persoonlijke stage (`hillebrand`), die geen secrets heeft. `npx sst secret list --stage dev` bevestigde dat alle vier secrets alleen op stage `dev` staan. Opgelost met `npx sst shell --stage dev -- npm run dev -- --port 4173`.
- **Live geverifieerd tegen de dev-stage database/secrets, lokaal draaiend (`localhost:4173`):**
  - `GET /auth/google?publicComputer=1` → `Set-Cookie: flowz-oauth-public-computer=1; Max-Age=600; Path=/; HttpOnly; SameSite=Lax` (geen `Secure` — `NODE_ENV=development`, zoals bedoeld). `GET /auth/google` (zonder de param) zet deze cookie niet. Bevestigt Task 3's eerste helft; de volledige OAuth-round-trip zelf kon niet end-to-end (Google-consent vereist een echte browser + Hillebrands account), maar dat gedeelte hangt uitsluitend van de al langer bestaande, ongewijzigde oidc-library af.
  - **Sessie-timeout end-to-end getest met geforceerde sessiecookies**, verzegeld met de échte `SessionPassword` (via `npx sst shell --stage dev -- node <script>`, exact zoals Story 1.3's `createdAt`-truc, nu toegepast op `lastActivity`): drie scenario's, elk met een `curl --cookie` tegen `GET /`:
    - **Publiek + 5 min inactief** → `200 OK`, **met een vers `Set-Cookie`** (nieuwe verzegelde waarde, andere hash dan de ingestuurde) — bevestigt dat de middleware `lastActivity` daadwerkelijk vernieuwt (sliding window, AC #2/derde subtaak van Task 6).
    - **Publiek + 31 min inactief** → `302 Found` naar `/inloggen`, met `Set-Cookie: nuxt-session=;` (leeg = `clearUserSession`) — exact AC #3.
    - **Normale sessie (geen `isPublicComputer`)** → `200 OK`, **geen** extra `Set-Cookie` — bevestigt zowel AC #4 (geen timeout) als Task 6's derde subtaak (geen onnodige cookie-churn voor het normale geval).
  - `curl http://localhost:4173/inloggen` toont `login-public-computer-checkbox` en het label "Dit is een openbare computer" in de HTML — bevestigt AC #1.
- Tijdelijk forceer-script (`forge-cookie.tmp.mjs`) en gegenereerde testcookies zijn na gebruik verwijderd, niet gecommit — geen testartefacten achtergelaten in de repo.
- `npm run typecheck` en `npx nuxt build` slagen (meermaals gedraaid, telkens schoon).

### Completion Notes List

- **AC #1 (checkbox zichtbaar):** `app/pages/inloggen.vue` toont nu `login-public-computer-checkbox` met label "Dit is een openbare computer", standaard uit (`ref(false)`), visueel onder de Google-knop binnen dezelfde `.login-card`.
- **AC #2 (vlag + timestamp bij inloggen, sliding refresh):** getraceerd door de volledige keten: checkbox aan → `googleLoginHref` voegt `?publicComputer=1` toe → buitenste handler zet op de eerste leg (`!getQuery(event).code`) een kortlevende `flowz-oauth-public-computer`-cookie → `onSuccess` leest die cookie (+ valt terug op een bestaand sessievinkje voor de scope-upgrade-case, Task 4) → `setUserSession` krijgt `isPublicComputer: true, lastActivity: Date.now()` mee. Middleware vernieuwt `lastActivity` bij elke geauthenticeerde request via `setUserSession(event, { lastActivity: Date.now() })`, dat merget (bevestigd via Story 1.3's eerdere reviewbewijs van h3's `updateSession`-mergegedrag — niet opnieuw empirisch getest in déze sessie wegens het credential-gat hierboven).
- **AC #3 (timeout na 30 min, redirect):** `server/middleware/session.ts` berekent `Date.now() - (session.lastActivity ?? 0)`, roept bij overschrijding `clearUserSession` aan en valt door naar de al bestaande, ongewijzigde redirect-/401-logica (geen duplicatie). **Live bevestigd** met een geforceerde 31-minuten-oude sessie: `302` naar `/inloggen`, sessiecookie geleegd.
- **AC #4 (geen timeout zonder vinkje):** sessies zonder `isPublicComputer` doorlopen de nieuwe `if`-tak niet en volgen exact het oude pad (`return` direct na `session.user`-check) — geen enkele regel gewijzigd gedrag voor het normale geval. **Live bevestigd**: `200 OK`, geen extra `Set-Cookie`.
- **Randgeval (Task 4) expliciet opgelost, niet alleen genoteerd:** een scope-upgrade-her-consent (`?scope=write`, Story 2.3) leest nu de bestaande sessie vóór `startNieuweSessie()` 'm wist, en draagt een eerder gezet `isPublicComputer` over als er geen pending-cookie is. Geen wijziging aan Story 2.3's eigen bestanden nodig. Niet apart live getest (vereist een echte tweede OAuth-round-trip vanuit een reeds ingelogde sessie) — wel logisch getraceerd tegen de code.
- **Sliding window expliciet bevestigd, niet aangenomen:** een publieke-computer-sessie van 5 minuten oud kreeg bij het volgende request een vers verzegeld cookie terug (andere hash), het bewijs dat `setUserSession`'s merge-gedrag (eerder alleen uit Story 1.3's codereview afgeleid) hier ook echt zo werkt.

### File List

**Gewijzigd:**
- `shared/types/auth.d.ts` (`UserSession`-augmentatie: `isPublicComputer`, `lastActivity`)
- `app/pages/inloggen.vue` (checkbox + computed login-href + stijl)
- `server/routes/auth/google.get.ts` (kortlevende cookie zetten/lezen, scope-upgrade-fallback, `setUserSession`-uitbreiding; na code review: cookie-cleanup verplaatst/uitgebreid naar `onError`+buitenste catch, fallback gegateld op `variant === 'write'`)
- `server/middleware/session.ts` (inactiviteitscheck + `lastActivity`-refresh)

**Niet gewijzigd:** `server/domain/auth/users.ts`, `nuxt.config.ts`, `app/pages/instellingen/beschikbare-tijd.vue`

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-23 | Story aangemaakt via create-story, na afronding van PRD-update (UJ-10) en architecture-update (AD-9). |
| 2026-08-23 | Code review: 2 bevindingen (stale pending-cookie na mislukte poging; te brede scope-upgrade-fallback), beide gefixt in `server/routes/auth/google.get.ts`. Typecheck/build schoon; fix voor bevinding 1 empirisch geverifieerd (tijdelijke diagnostische kortsluiting tegen de dev-stage, direct verwijderd). Status blijft `review` — klaar voor menselijke/vervolgreview. |
| 2026-08-23 | Tasks 1-7 geïmplementeerd (typecheck/build schoon). Live/handmatige verificatie kon aanvankelijk niet worden uitgevoerd (geen geldige AWS-sessie); na hernieuwde AWS-login door Hillebrand alsnog volledig uitgevoerd tegen de dev-stage (lokaal, `sst shell --stage dev`), inclusief geforceerde sessiecookies met de échte `SessionPassword` om de 30-minuten-inactiviteitstimeout end-to-end te bewijzen (alle drie scenario's: publiek+vers, publiek+verlopen, normaal). Alle 4 AC's empirisch bevestigd. Status → review. |
| 2026-08-23 | Hillebrand markeert de story als `done` — code review afgehandeld, geen verdere actie nodig. Status → done. |
