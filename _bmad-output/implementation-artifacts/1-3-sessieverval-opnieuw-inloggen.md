---
baseline_commit: b5c89539aea07064e62aec7c451a7b87142ca036
---

# Story 1.3: Sessieverval & Opnieuw Inloggen

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want automatisch gevraagd te worden opnieuw in te loggen zodra mijn sessie verlopen is,
so that ik nooit vastloop op een onduidelijke fout na 7 dagen inactiviteit.

## Acceptance Criteria

1. **Given** Evelien's Calendar-refresh-token is ouder dan 7 dagen (NFR5), **when** ze een pagina opent of een API-call doet die authenticatie vereist, **then** wordt ze naar het 5.1-inlogscherm geleid om opnieuw in te loggen, **and** blijft eerder ingevoerde, nog niet opgeslagen data (voor zover van toepassing) niet stilzwijgend verloren zonder melding.
2. **Given** de gebruikerslijst van het Google Cloud OAuth-consentscherm (Testing-modus, cap ~100 testgebruikers), **when** een nieuw account voor het eerst probeert in te loggen, **then** werkt dit alleen als dat account vooraf handmatig als testgebruiker is toegevoegd — operationeel gegeven, **geen UI-consequentie en geen code in deze story**.

## Tasks / Subtasks

- [x] Task 1: Sessievervaltermijn instellen op 7 dagen (AC: #1)
  - [x] `runtimeConfig.session.maxAge` in `nuxt.config.ts` op 7 dagen zetten (`60 * 60 * 24 * 7` = `604800`, in seconden). Er staat nu **geen** `session`-blok in `runtimeConfig` — voeg het toe naast `oauth`. De module-default vult alleen `{ name, password, cookie: { sameSite } }` aan, dus zonder deze wijziging is er géén vervaltermijn (zie Dev Notes voor het bewijs).
  - [x] Verifiëren dat de sessiecookie nu een `Max-Age`/`Expires` meekrijgt (nu ontbreekt die volledig → browser-sessiecookie) — live bevestigd: `Expires=Thu, 06 Aug 2026 21:20:42 GMT`, exact 7 dagen vooruit, met `HttpOnly; Secure; SameSite=Lax` behouden.
- [x] Task 2: Verlopen sessie leidt naar het inlogscherm (AC: #1)
  - [x] Controleren dat `server/middleware/session.ts` (uit Story 1.2) een verlopen sessie afhandelt zoals een ontbrekende sessie: paginanavigatie → redirect `/inloggen`, data-request → 401. **Waarschijnlijk is hier géén codewijziging nodig** — zie Dev Notes, de bedrading bestaat al. Verifieer het, bouw niets opnieuw. — **Bevestigd: nul regels code gewijzigd.**
  - [x] Handmatig testen met een kunstmatig korte `maxAge` — **bewust anders aangepakt, zie Debug Log:** in plaats van `maxAge` te verlagen en tweemaal te herdeployen, zijn sessiecookies verzegeld met een teruggedateerde `createdAt`. Dat toetst de échte 7-dagengrens.
- [x] Task 3: Géén "sessie verlopen"-melding — bewust (AC: #1)
  - [x] **Besluit Hillebrand, 2026-07-30: geen melding.** Een verlopen sessie landt zwijgend op het gewone inlogscherm, conform de 5.1-Standaard-state ("terugkeer na een eerdere sessie zonder geldige login"). Er komt géén vierde page state en géén querystringvlag.
  - [x] Dit betekent concreet: **`app/pages/inloggen.vue` en `server/middleware/session.ts` blijven ongewijzigd.** Bouw hier niets. Voeg geen `?sessie_verlopen=1`-vlag toe, geen extra tekst, geen extra live-regio. — Beide bestanden zijn inderdaad niet aangeraakt.
  - [x] Vastleggen in de Dev Agent Record dat dit een bewuste ontwerpkeuze is en geen omissie, zodat een latere review het niet als ontbrekende functionaliteit aanmerkt.
- [x] Task 4: Verificatie
  - [x] `npm run typecheck` slaagt (draait sinds Story 1.2 zowel `nuxt typecheck` als `tsc -p tsconfig.tools.json`) — exit 0, beide projecten schoon.
  - [x] `npx nuxt build` slaagt — exit 0; `"session": { …, "maxAge": 604800 }` staat in `.output/server/index.mjs`.
  - [x] Live geverifieerd op de dev-stage: met een geldige sessie blijft `/` bereikbaar; met een verlopen sessie volgt een redirect naar `/inloggen`. — Drie gevallen getoetst, zie Debug Log.
  - [x] Geen secrets of placeholder-waarden in code/commits (alleen via `sst.Secret`) — de enige codewijziging is een getalconstante.

## Dev Notes

### Kernanalyse: dit is één mechanisme, geen twee

De AC noemt de **leeftijd van het refresh-token**, maar de te bouwen guard is de **sessievervaltermijn**. Die vallen hier samen, en dat is geen toeval:

- `server/routes/auth/google.get.ts` stuurt `prompt=consent` mee bij élke login. Google geeft daardoor bij iedere login een **nieuw** refresh-token uit.
- De sessie wordt op datzelfde moment aangemaakt (`setUserSession` in `onSuccess`).
- Refresh-token-leeftijd en sessieleeftijd starten dus altijd op hetzelfde moment.

**Gevolg:** `session.maxAge = 7 dagen` laat de sessie precies verlopen wanneer het refresh-token verloopt. Er is géén aparte tokenleeftijd-administratie nodig, géén extra kolom, en géén databasequery per request. Bouw dat dus niet.

**Verifieer die aanname wel** als je `prompt=consent` ooit weghaalt — dan ontkoppelen de twee en vervalt deze redenering.

### Waarom er nu geen vervaltermijn is (bewijs, niet aanname)

Geverifieerd in de geïnstalleerde broncode tijdens de code review van Story 1.2:

- `node_modules/nuxt-auth-utils/dist/module.mjs:78-84` — de module vult `runtimeConfig.session` aan tot `{ name: 'nuxt-session', password: '', cookie: { sameSite: 'lax' } }`. **Geen `maxAge`.**
- `node_modules/h3/dist/index.mjs`, `sealSession`: `ttl: config.maxAge ? config.maxAge * 1e3 : 0` — zonder `maxAge` is de ttl `0`, wat in iron "nooit verlopen" betekent.
- `updateSession`: `expires: config.maxAge ? new Date(session.createdAt + config.maxAge * 1e3) : void 0` — zonder `maxAge` krijgt de cookie geen `Expires`, dus is het een browser-sessiecookie.

Beide helften zijn nu verkeerd tegelijk: serverzijdig verloopt een gelekte cookie nooit, terwijl Evelien juist uitgelogd raakt zodra ze haar browser afsluit.

### Het vervalvenster is absoluut, niet schuivend

`node_modules/h3/dist/index.mjs`, `unsealSession`:

```js
if (config.maxAge) {
  const age = Date.now() - (unsealed.createdAt || Number.NEGATIVE_INFINITY);
  if (age > config.maxAge * 1e3) throw new Error("Session expired!");
}
```

`createdAt` wordt alleen gezet bij het aanmaken van de sessie en **niet** ververst bij volgende requests. Het venster loopt dus vanaf de login, niet vanaf de laatste activiteit. Dat is precies wat NFR5 vraagt — een refresh-token van 7 dagen oud verloopt ook ongeacht activiteit. Bouw hier geen sliding window van.

### De redirect-bedrading bestaat al — bouw niets opnieuw

Dit is de belangrijkste anti-duplicatie-instructie van deze story:

1. `unsealSession` gooit `"Session expired!"` bij een verlopen sessie.
2. `getSession` vangt dat af met `unsealSession(...).catch(() => {})` (`h3/dist/index.mjs:1384`) en levert stilzwijgend een **lege** sessie op.
3. `server/middleware/session.ts` (Story 1.2) ziet dan geen `session.user` en doet al precies wat AC #1 vraagt: bij een `Accept: text/html`-request een `sendRedirect(event, '/inloggen')`, anders een 401.

**Verwachting: Task 2 vergt nul regels nieuwe code.** Verifieer het gedrag; schrijf geen tweede vervalcheck. Als je tóch iets moet aanpassen, beschrijf in de Dev Agent Record waaróm de bestaande keten niet volstond.

### Bestanden die je aanraakt (huidige staat)

| Bestand | Huidige staat | Wat deze story doet |
| --- | --- | --- |
| `nuxt.config.ts` | `runtimeConfig` bevat `oauth.oidc.clientId`, `tursoDatabaseUrl`, `public.siteUrl`. Geen `session`-blok. | **UPDATE** — `session: { maxAge: 604800 }` toevoegen. Raak `oauth.oidc` niet aan; die key moet blijven bestaan omdat de OIDC-handler `useRuntimeConfig(event).oauth.oidc` zónder optional chaining leest. |
| `server/middleware/session.ts` | Handhaaft de sessie met een publieke-padlijst (`/inloggen`, `/auth/`, `/api/_auth/`, `/_nuxt/`, …); browsers krijgen een redirect, data-requests een 401. | **VERIFY ONLY — niet wijzigen.** Het besluit "geen melding" maakt een querystringvlag overbodig. |
| `app/pages/inloggen.vue` | Toont `login-error` via `?login_error=1`; tekst wordt ná mount gezet zodat `aria-live` daadwerkelijk aankondigt. Heeft een "Bezig"-state. | **NIET AANRAKEN.** Geen "sessie verlopen"-melding, conform het besluit hieronder. |
| `server/routes/auth/google.get.ts` | OIDC-provider met state/nonce/PKCE, vangnet-`try/catch`, refresh-token-guard. | **NIET AANRAKEN.** Verander `prompt=consent` niet — de hele redenering hierboven hangt daarvan af. |

### Wat expliciet buiten scope valt

- **Geen refresh-token-vernieuwing tegen Google.** Het token wordt in deze story nergens gebruikt om een nieuw access-token te halen; dat hoort bij Epic 2 (Calendar-sync), waar `invalid_grant` reactief afgehandeld moet worden. Bouw hier geen refresh-flow.
- **Geen "onopgeslagen data"-bescherming in de UI.** AC #1's clausule zegt letterlijk "voor zover van toepassing". Er bestaan op dit moment geen formulieren: `/` is een placeholder ("Ingelogd") en `/inloggen` heeft alleen een knop. Het taakformulier komt in Epic 3, de wegnavigeer-bescherming is een eigen story (4.5). Noteer dit als bewust niet-van-toepassing; bouw geen vooruitlopende beforeunload-logica.
- **AC #2 vereist geen code** — testgebruikers toevoegen in de Google Cloud Console is een operationele handeling.
- **Geen sessie-invalidatie serverzijdig.** Sessies zijn stateless verzegelde cookies; herroepen kan alleen door `SessionPassword` te roteren (wat iedereen uitlogt). Dat is een bekende eigenschap, geen bug om hier op te lossen.

### Openstaande punten uit de code review van Story 1.2 die hier langskomen

Uit `_bmad-output/implementation-artifacts/deferred-work.md`:

- **Sessiecookie zonder `maxAge`** — bewust doorgeschoven naar déze story met als reden: "1.3 gaat expliciet over sessieverval; daar in één keer consistent maken met NFR5's 7-dagen-refresh-tokenverval." Task 1 lost dit op.
- Het punt over het niet-stage-gated `flowz.fyi`-domein blijft open en hoort **niet** bij deze story.

### Testen

Er is nog steeds geen testframework en geen teststrategie (`epics.md` Additional Requirements: "Nog niet besloten, hoort bij deze epic/story-fase"; twee keer eerder doorgeschoven). Deze story voegt weinig nieuwe logica toe — de kern is een configuratiewaarde — dus dit is geen goed moment om die beslissing te forceren. Verificatie loopt via typecheck, build en een handmatige live-test met een tijdelijk verkorte `maxAge`.

**Praktische testtruc:** zet `maxAge` tijdelijk op `60`, log in, wacht een minuut, ververs `/`. Je hoort dan op `/inloggen` te belanden. Zet de waarde daarna terug op `604800` en vermeld in de Dev Agent Record dat je dit gedaan hebt.

## Previous Story Intelligence (Story 1.2)

Story 1.2 is `done`, maar kwam daar via een code review met 20 bevindingen. Wat daarvan hier telt:

- **De OAuth-handler is niet meer de Google-provider.** `defineOAuthOidcEventHandler` verving `defineOAuthGoogleEventHandler`, omdat die laatste `state` nooit verifieerde, `query.error` niet las en `tokens` als `any` typeerde. De env var heet daarom `NUXT_OAUTH_OIDC_CLIENT_ID`, niet `..._GOOGLE_...`. Verwar dit niet bij het lezen van oudere documentatie.
- **`aria-live` kondigt niets aan als de tekst al in de SSR-HTML staat.** Een live-regio meldt alleen mutaties ná registratie. De oplossing in `inloggen.vue` is: element leeg en verborgen renderen, tekst pas in `onMounted` invullen. Herhaal dit patroon als Task 3 een melding toevoegt.
- **`Resource.*` gooit bij een inactieve SST-link.** Daarom worden secrets lazy gelezen (`getDb()`, `getHandler()`, `getKey()`), niet op module-scope — anders trekt één ontbrekende link de hele bundel mee, inclusief `/inloggen`. Volg dit patroon bij nieuwe `Resource`-toegang.
- **Calendar-tokens staan versleuteld in de database** (`server/data/crypto.ts`, AES-256-GCM, sleutel uit `Resource.TokenEncryptionKey`). `server/data/users.ts` versleutelt bij schrijven en ontsleutelt bij teruggeven, zodat `server/domain/` altijd klaartekst ziet. Raak deze grens niet aan.
- **Lokaal draaien vereist `npx sst shell -- npm run dev`**, anders faalt elke request. Deploys hebben `GOOGLE_OAUTH_CLIENT_ID` en `TURSO_DATABASE_URL` in de omgeving nodig (zie `.env.example`); ontbreken ze, dan faalt de deploy nu expliciet in plaats van stilzwijgend.

## Git Intelligence

`git log` toont alleen `b5c8953` en `bdcc653` — **alle applicatiecode uit Story 1.1 en 1.2 staat nog ongecommit** in de working tree. De `baseline_commit` hierboven wijst dus naar een commit zónder applicatiecode; een diff daartegen bevat het werk van drie stories, niet alleen dit. Houd daar rekening mee bij de code review van deze story, of commit het bestaande werk eerst.

## Project Structure Notes

Volgt de bestaande Structural Seed ongewijzigd. Deze story voegt geen nieuwe mappen of modules toe: het zwaartepunt ligt in `nuxt.config.ts`, met mogelijk een kleine wijziging in `app/pages/inloggen.vue` en `server/middleware/session.ts` afhankelijk van de open vraag. Geen schemawijziging, geen migratie.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.3-Sessieverval-Opnieuw-Inloggen] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1-Inloggen-Fundament] — epic-context, FR27/NFR4/NFR5
- [Source: _bmad-output/planning-artifacts/epics.md] regels 76-77 — **NFR4 en NFR5 staan uitsluitend hier gedefinieerd**; de PRD (`prd-Flowz-2026-07-11/prd.md`) heeft geen NFR-sectie. Citeer voor NFR5 dus epics.md, niet de PRD.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-2] — regel 45: Testing-modus betekent dat refresh-tokens na 7 dagen verlopen en opnieuw inloggen vereist is; testgebruikers handmatig toevoegen (cap ~100)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Consistency-Conventions] — sessiecookie gevalideerd in Nitro-middleware
- [Source: design-artifacts/C-UX-Scenarios/05-evelien-start-met-flowz/5.1-inlogscherm/5.1-inlogscherm.md#Page-States] — regel 156: de **Standaard**-state dekt expliciet "terugkeer na een eerdere sessie zonder geldige login". Er is géén aparte "sessie verlopen"-state gespecificeerd.
- [Source: _bmad-output/planning-artifacts/epics.md#UX-Design-Requirements] — UX-DR17: inlogscherm toont merknaam, tagline, één Google-knop, foutstate bij geweigerde/mislukte consent
- [Source: _bmad-output/implementation-artifacts/1-2-google-oauth-login-met-calendar-consent.md] — vorige story: OIDC-implementatie, middleware, crypto-laag, en de Review Findings-sectie
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — sessie-`maxAge` bewust hierheen doorgeschoven

### Review Findings

Code review 2026-07-30. **Alleen de Acceptance Auditor is gedraaid** (keuze Hillebrand, gezien de omvang van de diff) — Blind Hunter en Edge Case Hunter zijn bewust overgeslagen, dus deze review is smaller dan die van Story 1.2. Alles is geverifieerd tegen de geïnstalleerde broncode en tegen de live dev-stage.

**Decision needed:**

> **Opgelost (Hillebrand, 2026-07-31): optie (b) — de klok wordt bij het inloggen expliciet gereset.** Geïmplementeerd als `startNieuweSessie()` in `server/routes/auth/google.get.ts`, aangeroepen in `onSuccess` vlak vóór `setUserSession`. Empirisch bepaald welke aanpak wérkt, met een echte h3-server (drie varianten getest):
>
> | Variant | Klok gereset? |
> | --- | --- |
> | huidige implementatie (`setUserSession`) | **nee** — oude `createdAt` behouden |
> | `clearUserSession()` + opnieuw aanmaken | **nee** — oude `createdAt` behouden |
> | `clearUserSession()` + de `nuxt-session`-cookie uit de request-header strippen | **ja** — `22:08:30` → `22:08:31` |
>
> De middelste variant is de intuïtieve, en die faalt precies zoals de auditor waarschuwde: `clearSession` verwijdert de sessie uit `event.context`, maar de volgende `getSession` leest de cookie opnieuw uit de *request*-header en herstelt de oude `createdAt`. Alleen door h3 die bron te ontnemen ontstaat een werkelijk nieuwe sessie.
>
> **Live bevestigd op `flowz.fyi` (Hillebrand, 2026-07-31).** Incognitovenster → `/` → bounce naar `/inloggen` (anonieme cookie gezet, `Expires` = `2026-08-07T06:57:39.732Z`) → ~3,5 minuut gewacht → ingelogd → `Expires` = `2026-08-07T07:01:19.321Z`. Verschil: 3 min 39,6 s, exact de wachttijd. Zonder de fix was die waarde ongewijzigd gebleven. Daarmee is ook de laatste afgeleide aanname waargenomen in plaats van beredeneerd: Nitro's aws-lambda-preset levert wél `event.node`, dus de header-mutatie heeft effect in productie.
>
> Er wordt uitsluitend `nuxt-session` gestript, niet de hele cookie-header. Veilig op dat punt: de OIDC-handler verbruikt zijn `nuxt-auth-state`/`-nonce`/`-pkce`-cookies op regels 26-28, ruim vóór `onSuccess` op regel 87. De functie ruimt zowel `event.node.req.headers` als de web-varianten op, omdat h3's `_getReqHeader` `event.node` exclusief voorrang geeft maar naar `event.request`/`event.headers` terugvalt als die ontbreekt.

- [x] [Review][Decision] **De sessieklok start niet bij de login — claim 1 uit de Dev Notes is aantoonbaar onjuist.** `getSession` zet `createdAt` uitsluitend wanneer er nog geen geldige sessie is (`node_modules/h3/dist/index.mjs:1393-1402`, `if (!session.id)`), en `setUserSession` loopt via `session.update(defu(data, session.data))` naar `updateSession` (`h3/dist/index.mjs:1416-1433`), dat alleen `session.data` samenvoegt en `createdAt` nooit herschrijft. Een anonieme `GET /` mint al een sessiecookie (live bevestigd: 302 naar `/inloggen` mét `Set-Cookie … Expires` +7 dagen), en die cookie is `SameSite=Lax`, dus hij gaat mee op de top-level callback naar `/auth/google` en wordt daar succesvol ontzegeld met behoud van de oude `createdAt`. **Gevolg:** wie op `/` landt, naar `/inloggen` wordt gestuurd en pas dagen later inlogt, krijgt een sessie die te vroeg verloopt — in het uiterste geval na één dag terwijl haar verse refresh-token zeven dagen geldig is. Opnieuw inloggen terwijl je al ingelogd bent reset de klok evenmin (`/inloggen` staat in `PUBLIC_PREFIXES`). **Richting van de fout is de veilige kant:** `createdAt` ligt altijd vóór of op het moment van tokenuitgifte, dus de sessie verloopt hooguit eerder dan het refresh-token, nooit later; de eigenschap waar NFR5 om draait (nooit een sessie bedienen met een >7 dagen oud refresh-token) blijft dus overeind. De faalmodus is voortijdig uitloggen, geen beveiligingsgat. **Waarschuwing bij oppakken:** `replaceUserSession` lost dit níét op — `clear()` verwijdert `event.context.sessions[name]`, waarna `update()` opnieuw `getSession` aanroept, die de cookie uit de *request*-header herleest (`h3/dist/index.mjs:1377-1392`) en de oude `createdAt` terugzet. Elke fix moet empirisch geverifieerd worden, niet aangenomen. Opties: (a) gedrag accepteren en de onjuiste comment/Dev Notes corrigeren tot wat de code echt doet; (b) de klok bij login expliciet resetten met een aantoonbaar werkende methode; (c) de anonieme cookie-minting voorkomen zodat de klok pas bij login start.
> **Besluit (Hillebrand, 2026-07-31): deferren.** Reden: er is nog geen enkele geauthenticeerde API-call in de app om een interceptor tegen te testen; die zonder aanroeper bouwen is precies het soort vooruitlopende code dat de stories tot nu toe hebben vermeden. Oppakken zodra Epic 2 de eerste geauthenticeerde API-call introduceert — zie `deferred-work.md`.

- [x] [Review][Decision] **AC #1's API-helft is niet geïmplementeerd.** De AC eist: "when ze een pagina opent **of een API-call doet die authenticatie vereist**, then wordt ze naar het 5.1-inlogscherm geleid". `server/middleware/session.ts:43-47` stuurt alleen bij `Accept: text/html` een redirect; al het andere krijgt een kale 401 (live bevestigd: `Accept: application/json` → 401, geen redirect). Er is geen `app/middleware/`, geen `$fetch`-`onResponseError`-interceptor en geen `definePageMeta`-guard, dus niets zet die 401 om in een gang naar het inlogscherm. **Nu onobserveerbaar** — er is nog geen client-code die een geauthenticeerde API-call doet (`index.vue` is een statische placeholder, `/api/_auth/session` is publiek) — maar het is gespecificeerd gedrag dat niet is gebouwd én nergens als deferred is vastgelegd. Epic 2/3 is de eerste code die hierop stuit. Opties: (a) nu een client-interceptor toevoegen; (b) bewust deferren tot de eerste geauthenticeerde API-call bestaat, mét ledger-entry.

**Patch:**

- [x] [Review][Patch] Onjuiste claim gecorrigeerd in de code-comment: die zei dat sessie- en tokenleeftijd vanzelf gelijk oplopen. Dat is nu wél waar, maar alleen omdat het wordt afgedwongen — de comment benoemt nu expliciet dat `startNieuweSessie()` daarvoor zorgt, en welke twee wijzigingen de aanname zouden breken [nuxt.config.ts:35]
- [x] [Review][Patch] Debug Log overdrijft de cookie-churn-fix: churn blijft bestaan op elk beschermd pad (anonieme `GET /` geeft nog steeds een `Set-Cookie` op de 302), en de verbetering op `/inloggen` komt uit Story 1.2's `PUBLIC_PREFIXES`, niet uit deze story [1-3-sessieverval-opnieuw-inloggen.md]
- [x] [Review][Patch] De "onopgeslagen data"-verplichting uit AC #1 is nu als vlak besluit vastgelegd, terwijl de AC-clausule voorwaardelijk is en herleeft bij het eerste formulier (Epic 3) en story 4.5 — vastleggen in `deferred-work.md` zodat het daar opduikt [deferred-work.md]

**Defer:**

- [x] [Review][Defer] De 401 uit de middleware gebruikt niet de voorgeschreven `{error:{code,message}}`-envelope uit `server/domain/errors.ts` [server/middleware/session.ts:47] — deferred, pre-existing (ontstaan in Story 1.2, stond nog niet in het ledger)
- [x] [Review][Defer] Het oorspronkelijk gevraagde pad gaat verloren bij opnieuw inloggen: de middleware redirect naar een kale `/inloggen` en `onSuccess` landt altijd op `/` [server/middleware/session.ts:44] — deferred, voldoet aan AC #1; wordt pas zichtbaar bij deep-linkbare pagina's (Epic 4+)

**Claims die de toets doorstonden** (expliciet vastgelegd, zodat een latere review ze niet opnieuw hoeft uit te zoeken):

- Claim 2 — het vervalvenster is absoluut en niet schuivend, en dat is precies wat NFR5 vraagt. `getUserSession` is read-only en herzegelt de cookie niet, dus gewone requests verlengen het venster niet. De iron-`ttl` is een tweede, onafhankelijke vervaldatum vanaf zegelmoment, maar die kan alleen naar later schuiven, dus de `createdAt`-toets is altijd bindend.
- Claim 3 — voor paginanavigaties klopt de nul-regels-conclusie exact: verlopen cookie → `unsealSession` gooit → `.catch(() => {})` → lege sessie → geen `session.user` → redirect.
- Claim 4 — geen "sessie verlopen"-melding is correct, en de 5.1-spec steunt dat sterker dan de story citeerde: de Technical Notes van dat document stellen letterlijk dat het periodieke opnieuw-inloggen na tokenverval "geen apart scenario" is.
- Claim 5 — de "onopgeslagen data"-clausule is vandaag echt niet van toepassing; er bestaan geen formuliervelden (de 5.1-spec merkt Form Validation zelf aan als "n.v.t.").

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5)

### Debug Log References

- **Verificatiemethode bewust afgeweken van de story.** Task 2 stelde voor `maxAge` tijdelijk op 60 seconden te zetten, een minuut te wachten en dan terug te zetten. Dat vereist twee extra deploys en toetst bovendien een ándere waarde dan die in productie staat. In plaats daarvan is met een wegwerpscript (`iron-webcrypto`'s `seal` + iron's `defaults` + `ttl: maxAge * 1000`, exact zoals h3 zelf verzegelt) een sessiecookie gemaakt met een **teruggedateerde `createdAt`**, en die naar de live site gestuurd. Dat toetst de echte 7-dagengrens tegen de echt gedeployede configuratie, zonder iets tijdelijk te verlagen.
- **Uitkomst van die test (drie gevallen, met het echte `SessionPassword` uit SST):**
  - `createdAt` = nu (0,0 dagen) → **200**, blijft op `/`
  - `createdAt` = 8 dagen terug → **302 → `/inloggen`** — dit is AC #1
  - `createdAt` = 6,9 dagen terug → **200**, nog net binnen het venster
  Het derde geval is het belangrijkste: het sluit uit dat "elke oude of onbekende cookie faalt" en legt de grens vast op precies 7 dagen. Zonder die controle had een willekeurige unseal-fout hetzelfde resultaat kunnen geven als echt verval.
- **Task 2 kostte inderdaad nul regels code**, zoals de story voorspelde. De keten uit Story 1.2 doet het werk: `unsealSession` gooit `"Session expired!"` bij overschrijding, `getSession` vangt dat af met `.catch(() => {})` en levert een lege sessie op, en `server/middleware/session.ts` ziet dan geen `session.user` en stuurt browsers naar `/inloggen`.
- **Neveneffect, aanvankelijk te sterk geformuleerd (gecorrigeerd na review):** `/inloggen` geeft géén `Set-Cookie` meer, omdat dat pad in de publieke-padlijst van de middleware staat en de sessie daar dus nooit wordt aangeraakt. Maar de cookie-churn uit de Story 1.2-review is dáármee **niet** opgelost: elk beschermd pad zet nog steeds een `Set-Cookie`, ook op een 302 of een 401 voor een anonieme bezoeker — de `GET /` die hierboven als bewijs is aangehaald laat dat zelf zien. Bovendien komt die verbetering op `/inloggen` uit Story 1.2's `PUBLIC_PREFIXES`, niet uit deze story. Het punt blijft dus open.
- **Geen testframework aanwezig**, dus de red-green-refactor-cyclus uit de workflow is niet doorlopen — er is niets om een falende test in te schrijven. Dit staat al twee stories open in `deferred-work.md` en de Dev Notes van deze story sluiten het expliciet uit als moment om die beslissing te forceren. De verificatie hierboven is empirisch en reproduceerbaar, maar niet geautomatiseerd; een regressie in dit gedrag wordt op dit moment door niets gevangen.
- De bestaande sessie van Hillebrand is door deze wijziging niet ongeldig geworden: zijn cookie heeft een `createdAt` van vandaag, dus de nieuwe leeftijdstoets laat 'm door.

### Completion Notes List

- **Eén codewijziging in totaal:** `runtimeConfig.session.maxAge = 60 * 60 * 24 * 7` in `nuxt.config.ts`. Verder niets — geen schemawijziging, geen migratie, geen nieuwe bestanden, geen aanpassing aan de middleware of het inlogscherm.
- **AC #1 gedekt.** Een sessie ouder dan 7 dagen leidt bij een paginanavigatie tot een redirect naar het 5.1-inlogscherm; data-requests krijgen een 401. De clausule over "nog niet opgeslagen data" is niet van toepassing: er bestaan nog geen formulieren (`/` is een placeholder, `/inloggen` heeft alleen een knop). Het taakformulier komt in Epic 3, wegnavigeer-bescherming is story 4.5.
- **AC #2 vereist geen code** — testgebruikers toevoegen aan het Google-consentscherm is een operationele handeling in de Cloud Console, expliciet zo benoemd in de acceptatiecriteria.
- **Géén "sessie verlopen"-melding is een bewuste ontwerpkeuze van Hillebrand (2026-07-30), geen omissie.** Een verlopen sessie landt zwijgend op het gewone inlogscherm, conform de Standaard-state van de 5.1-spec, die letterlijk "terugkeer na een eerdere sessie zonder geldige login" dekt. Er is dus geen vierde page state gebouwd en de UX-spec hoefde niet gewijzigd te worden. Een latere review moet dit niet als ontbrekende functionaliteit aanmerken.
- **De 7-dagenwaarde hangt aan `prompt=consent`.** Omdat de OAuth-config bij elke login een nieuw refresh-token afdwingt, starten sessieleeftijd en refresh-tokenleeftijd gelijk op en dekt één vervaltermijn allebei. Verdwijnt `prompt=consent` ooit uit `server/routes/auth/google.get.ts`, dan ontkoppelen die twee en klopt deze story niet meer. Dat staat als waarschuwing in de code-comment.

### File List

**Gewijzigd:**
- `nuxt.config.ts` (`runtimeConfig.session.maxAge`)
- `server/routes/auth/google.get.ts` (`startNieuweSessie()` — reviewfix, reset de sessieklok bij het inloggen)

**Niet gewijzigd, wel geverifieerd:** `server/middleware/session.ts`, `app/pages/inloggen.vue`

**Live gedeployed:** dev-stage op `flowz.fyi` (`npx sst deploy --stage dev`, met Hillebrands akkoord om de story live te verifiëren)

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-07-30 | Story aangemaakt via create-story. Open vraag over een "sessie verlopen"-melding voorgelegd aan Hillebrand; besluit: geen melding, conform de 5.1-Standaard-state. Story daarmee teruggebracht tot één configuratiewijziging. |
| 2026-07-31 | Resterend beslispunt (AC #1's API-helft) gedeferred — geen aanroeper om een interceptor tegen te testen, oppakken zodra Epic 2 de eerste geauthenticeerde API-call heeft. Alle review-items nu afgehandeld: 1 gefixt en live geverifieerd, 5 gedeferred met reden. Status → done. |
| 2026-07-31 | Code review (alleen Acceptance Auditor, keuze Hillebrand): 7 bevindingen, geen blockers. Claim 1 uit de Dev Notes bleek onjuist — de sessieklok startte bij het eerste request dat de sessie aanraakte, niet bij de login. Fout in de veilige richting (sessie kan alleen te vroeg verlopen, nooit te laat), maar de redenering die één vervaltermijn rechtvaardigde klopte niet. Opgelost met `startNieuweSessie()`, na drie varianten empirisch tegen een echte h3-server te hebben getest — de intuïtieve `clearUserSession()`-aanpak werkt aantoonbaar níét. Gedeployed en regressie-geverifieerd; de klok-reset zelf wacht nog op een echte login. Vier van de vijf claims doorstonden de toets en zijn expliciet vastgelegd. |
| 2026-07-30 | `session.maxAge` op 7 dagen gezet, typecheck en build groen, gedeployed naar de dev-stage. Verval end-to-end geverifieerd met teruggedateerde verzegelde sessiecookies (0 dagen → 200, 6,9 dagen → 200, 8 dagen → 302 naar `/inloggen`) en de cookie draagt nu `Expires` +7 dagen. Task 2 vergde nul regels code, zoals voorspeld. Status → review. |

## Open Questions

**Beantwoord (Hillebrand, 2026-07-30) — geen open vragen meer.**

_Vraag:_ krijgt Evelien te zien dát haar sessie verlopen is, of belandt ze zwijgend op het gewone inlogscherm?

_Besluit:_ **geen melding, gewoon naar het inlogscherm.** Dit volgt de 5.1-spec, waarvan de Standaard-state expliciet "terugkeer na een eerdere sessie zonder geldige login" dekt. Er komt geen vierde page state en de spec hoeft niet gewijzigd te worden.

_Gevolg voor de implementatie:_ deze story raakt uitsluitend `nuxt.config.ts`. `app/pages/inloggen.vue` en `server/middleware/session.ts` blijven ongewijzigd.
