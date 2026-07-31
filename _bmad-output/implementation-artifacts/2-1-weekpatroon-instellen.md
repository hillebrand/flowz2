---
baseline_commit: 2ebad59
---

# Story 2.1: Weekpatroon Instellen

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want per weekdag (ma-zo) mijn beschikbare huiswerktijd instellen met +/- knoppen,
so that de motor met mijn echte beschikbare tijd rekent.

## Acceptance Criteria

1. **Given** Evelien opent `/instellingen/beschikbare-tijd`, **when** de pagina laadt, **then** toont `avail-week-list` 7 dagrijen (ma t/m zo) met de huidige beschikbare tijd per dag (`AvailableTimePattern`, User 1:1), **and** toont een skeleton tijdens het laden (geen spinner).
2. **Given** Evelien staat op de pagina, **when** ze op `avail-day-plus-button` of `avail-day-minus-button` voor een dag klikt, **then** wijzigt de tijd voor die dag direct met 15 minuten, via een eigen, niet-gedebouncete API-call per klik (FR11), **and** kan de tijd niet onder 0 minuten komen (`avail-day-minus-button` wordt disabled bij 0), **and** is er geen bovengrens.

## Tasks / Subtasks

- [x] Task 1: `AvailableTimePattern`-schema + migratie (AC: #1)
  - [x] `server/data/schema.ts` uitbreiden met `availableTimePatterns` (nieuwe tabel, **niet** een nieuw bestand — dit project houdt alle Drizzle-tabellen in één schema.ts, zie de bestaande `users`-export). Kolommen: `id` (UUID PK, `$defaultFn`), `userId` (text, **unique** FK-achtige referentie naar `users.id` — uniek omdat dit `User` 1:1 is, geen losse foreign-key-constraint nodig zolang er geen cross-tabel-joins zijn die dat vereisen), zeven integer-kolommen `monday`..`sunday` (minuten, `notNull`, default 0), `createdAt`/`updatedAt` (zelfde patroon als `users`).
  - [x] **Waarom één rij met 7 kolommen, niet 7 rijen:** de AC zegt letterlijk "`AvailableTimePattern`, User 1:1" — één rij per user is de directe, letterlijke lezing. Zeven rijen (user+weekday) zou "User 1:N" zijn, wat de PRD/epics-tekst niet zegt. Bouw dit niet als een aparte tabel per dag.
  - [x] Migratie genereren en toepassen: `npx sst shell --stage dev -- npx drizzle-kit generate` gevolgd door `npx sst shell --stage dev -- npx drizzle-kit migrate`. **Nooit `push`** (bekende table-recreation-bug tegen libSQL, al twee keer eerder gedocumenteerd in dit project).
- [x] Task 2: Repository + domain-service (AC: #1, #2)
  - [x] `server/data/availability.ts` (nieuw): `getOrCreateWeekPattern(userId)` — leest de rij, en als die nog niet bestaat: insert met alle dagen op 0, analoog aan het lazy-aanmaak-patroon dat dit project al kent (`getDb()` in `db.ts`, de upsert in `users.ts`). Er is geen apart aanmaakmoment bij signup — de eerste keer dat Evelien deze pagina opent, moet de rij vanzelf ontstaan.
  - [x] `server/data/availability.ts`: `updateWeekPatternDay(userId, day, direction)` — `direction` is `'increase' | 'decrease'`. Past de kolom voor die dag aan met ±15, **met een `GREATEST(0, ...)`-achtige ondergrens in de query zelf** (of een equivalente clamp na het lezen, binnen dezelfde repository-functie) zodat de 0-ondergrens niet alleen client-side afgedwongen wordt. Retourneert de bijgewerkte rij.
  - [x] `server/domain/availability/week-pattern.ts` (nieuw domein-submap, analoog aan `server/domain/auth/` uit Story 1.2 — de Structural Seed noemt alleen `tasks/scheduling/calendar-sync`, `availability` is een kleine, redelijke uitbreiding daarvan, geen architectuurwijziging): dunne wrapper die de twee repository-functies aanroept. Route-handlers roepen nooit rechtstreeks `server/data/` aan (mutatie-ownership-regel, Consistency Conventions).
- [x] Task 3: API-routes (AC: #1, #2)
  - [x] `server/api/availability/week.get.ts` — `GET /api/availability/week`. Roept `getOrCreateWeekPattern` aan via het domain-laag, retourneert `{ pattern: { monday: number, tuesday: number, ..., sunday: number } }` (minuten per dag, Engelse sleutels — zie Dev Notes voor waarom).
  - [x] `server/api/availability/week/[day].patch.ts` — `PATCH /api/availability/week/{day}`, Nitro's `[day]`-bestandsnaam-syntax voor de route-param (zelfde mechanisme als elke andere dynamische Nitro-route). Body: `{ direction: 'increase' | 'decrease' }`. Valideer `day` tegen de zeven geldige sleutels vóór aanroep van de domain-laag; ongeldige waarde → 400 met de technische error-envelope (zie hieronder, nieuwe errorcode nodig). Retourneert `{ day: string, minutes: number }` — genoeg voor de client om `avail-day-time` bij te werken zonder de hele pattern opnieuw te moeten ophalen.
  - [x] `server/domain/errors.ts` uitbreiden met één nieuwe code (bijv. `ValidationError: 'validation_error'`) voor de ongeldige-`day`-situatie — **niet** een ad-hoc string in de route zelf verzinnen; de Consistency Conventions eisen één gedeelde vocabulaire in dit bestand.
- [x] Task 4: Front-end — alléén het weekpatroon-gedeelte van 4.1 (AC: #1, #2)
  - [x] `app/pages/instellingen/beschikbare-tijd.vue` (nieuw). Bouw uitsluitend: `avail-back-section`/`avail-back-link`, `avail-page-heading`, `avail-week-heading`, `avail-week-list` met 7× `avail-day-row` (`avail-day-label`, `avail-day-minus-button`, `avail-day-time`, `avail-day-plus-button`). **Bouw NIET** `avail-calendar-section` (dag-specifieke afwijkingen, Story 2.2) of `avail-homework-sync-section` (Calendar-kleur, Story 2.3, FR28) — die staan in dezelfde UX-spec-file omdat WDS de hele scenario-pagina in één document beschrijft, maar horen bij latere stories. Zie Dev Notes voor de volledige object-ID-lijst en het exacte 4.1-Object-model.
  - [x] Laadstate: subtiele skeleton (géén spinner) tijdens de eerste `GET /api/availability/week`. Er is geen bestaande skeleton-component om te hergebruiken — `1.1-hoofdscherm` is zelf nog een placeholder (Epic 4-scope) — dus een eenvoudige, lokale skeleton is voldoende (bv. 7 grijze balken op de plek van de dagrijen).
  - [x] Elke klik op min/plus: directe, niet-gedebouncete `fetch`/`$fetch`-call naar de PATCH-route (bewuste keuze uit de UX-spec, geen debounce/batching ondanks het verkeersrisico bij snel doorklikken — niet "verbeteren"). Minus-knop krijgt `disabled` zodra de lokale waarde 0 is (client-side UX-feedback; de server-side clamp uit Task 2 is het echte vangnet, niet dit).
  - [x] `aria-label`s exact zoals in de UX-spec: "Minder tijd op {dag}" / "Meer tijd op {dag}", met de Nederlandse dagnaam ingevuld. `avail-day-time` krijgt `aria-live="polite"` (bevestigt de nieuwe waarde na elke klik — **let op:** dit is een `polite`-regio die van meet af aan met de juiste waarde gerenderd wordt en pas ná een klik muteert, dus dit heeft niet de valkuil uit Story 1.2/1.3's `assertive`-regio's die pas ná mount gevuld moesten worden om aangekondigd te worden — hier is de content al aanwezig vóór de eerste mutatie, wat voor `polite` prima is).
- [x] Task 5: Verificatie
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live geverifieerd op de dev-stage (API-laag, via een zelf verzegelde sessiecookie tegen de echte gedeployde app — zie Debug Log): geen sessie → 401; eerste bezoek → alle dagen lazy-created op 0; +15 werkt; clamp bij 0 houdt stand (geen negatieve waarde); geen bovengrens (75 na 5 klikken); ongeldige dag/direction → 400 met de juiste error-envelope; persistence klopt bij een herhaalde GET. Middleware beschermt ook de pagina zelf (`/instellingen/beschikbare-tijd` zonder sessie → 302 naar `/inloggen`).
  - [x] **Rendering geverifieerd door Hillebrand** op `https://flowz.fyi/instellingen/beschikbare-tijd` (echte ingelogde sessie, echte browser — de Chrome-extensie was niet verbonden, dus dit kon ik niet zelf via browserautomatisering doen): "Werkt perfect". Skeleton, 7 dagrijen en de +/- interactie bevestigd.
  - [x] Geen secrets of placeholder-waarden in code/commits.

### Review Findings

Code review 2026-07-31 (Blind Hunter + Edge Case Hunter + Acceptance Auditor, alle drie geslaagd). Belangrijkste vondst: de skeleton-verificatie die ik als "geverifieerd" had afgevinkt bleek de laadvolgorde niet écht te dekken — mijn eigen handmatige rendering-check toonde het eindresultaat, niet de volgorde ernaartoe, en die volgorde bleek precies omgekeerd te zijn aan wat de code-comment beweert.

**Decision needed** — de juiste fix is zonder jouw keuze niet eenduidig:

- [x] [Review][Decision] **Besluit: nu fixen.** API-fouten worden alleen gelogd; geen enkele foutmelding of 401-redirect aan de gebruiker. `app/pages/instellingen/beschikbare-tijd.vue:66-69` vangt elke PATCH-fout in een kale `console.error`; `error` wordt uit `useFetch` nooit uitgelezen, dus ook een mislukte eerste `GET` levert een compleet ogende maar lege pagina op. Dit raakt een al bestaand, expliciet voorwaardelijk gedeferred punt: `deferred-work.md`'s entry uit Story 1.3 zegt letterlijk "oppakken zodra Epic 2 de eerste geauthenticeerde API-call introduceert" — en deze story ís precies die eerste call (`useFetch`/`$fetch` naar `/api/availability/week*`). De trigger is dus afgegaan. Concreet: verloopt Evelien's sessie terwijl ze op deze pagina zit (exact het scenario waar Story 1.3 voor gebouwd is), dan krijgt ze een stille, dode pagina — `server/middleware/session.ts` stuurt alleen bij `Accept: text/html` een redirect, en `$fetch` stuurt `Accept: */*`, dus ze krijgt een kale 401 zonder enige actie. Opties: (a) nu een minimale fix — een 401 specifiek afvangen en naar `/inloggen` sturen, plus een zichtbare foutmelding bij een mislukte `GET`; (b) opnieuw deferren, met een nieuwe, expliciete reden (dan is dit de tweede keer dat de al afgesproken trigger genegeerd wordt — dat verdient jouw akkoord, niet een stille herhaling).
- [x] [Review][Decision] **Besluit: accepteren, geen wijziging.** `GET /api/availability/week` is niet zonder neveneffect — de eerste aanroep doet een insert.** `server/api/availability/week.get.ts:5` → `getWeekPattern` → `getOrCreateWeekPattern` (`server/data/availability.ts:9-40`) maakt bij het allereerste bezoek de rij aan. Een GET hoort side-effect-vrij te zijn; elke prefetch, retry of monitoring-probe zou een rij aanmaken. Praktisch risico is nu laag (er is geen enkele link naar deze pagina — geen hamburgermenu, dus geen prefetchbare `<NuxtLink>` — en de route vereist een geldige sessie), en herhaalde aanroepen zijn wél idempotent (dezelfde nul-rij, geen state-drift). De "juiste" oplossing verplaatst de aanmaak naar een ander triggermoment (bv. bij signup), maar dat zou Story 1.2's login-flow aan Story 2.1's domein koppelen — precies het soort vooruit-koppelen dat dit project tot nu toe vermeed. Opties: (a) accepteren als bewust, gedocumenteerd gedrag (idempotent, niet side-effect-vrij) — geen code-wijziging; (b) de aanmaak alsnog verplaatsen naar een apart aanmaakmoment.

**Patch** — eenduidig te fixen:

- [x] [Review][Patch] **Skeleton verschijnt ná de content, niet ervoor — AC #1 wordt in de praktijk niet gehaald.** `app/pages/instellingen/beschikbare-tijd.vue:35-36`. Nuxt's `pending` is een `computed` op `status === 'pending'` tenzij `experimental.pendingWhenIdle` aanstaat (staat standaard op `false`, niet overschreven in `nuxt.config.ts`). Met `server: false` draait de SSR-fetch-tak nooit, dus `status` blijft `'idle'` tijdens SSR en de server rendert de `v-else`-tak (de geladen UI, met lege `avail-day-time`-waarden) in plaats van de skeleton. Pas bij hydratie flipt de status alsnog naar `pending`, en verschijnt de skeleton — in omgekeerde volgorde. Dit verklaart ook waarom mijn eigen handmatige verificatie ("Werkt perfect") dit miste: die testte het eindresultaat, niet de laadvolgorde. Fix: `pending`-gate vervangen door een check op `pattern === null` (onafhankelijk van Nuxt's status-timing), of alsnog op de server fetchen met `lazy: true`.
- [x] [Review][Patch] **Plus-knop mist de `!pattern`-guard die de min-knop wél heeft.** `app/pages/instellingen/beschikbare-tijd.vue:109` heeft `:disabled="!pattern || ..."`, `:124` heeft alleen `:disabled="pendingDays.has(day.key)"`. Is `pattern` nog `null` (tijdens de laadvolgorde-bug hierboven, of na een mislukte `GET`) en wordt er toch geklikt, dan vuurt de PATCH gewoon af — de database wordt gemuteerd — maar `if (pattern.value) { ... }` in `wijzig()` slaat de UI-update stilzwijgend over. Fix: dezelfde `!pattern ||`-guard op de plus-knop.
- [x] [Review][Patch] **"← Terug" is een no-op zonder in-app-historie.** `app/pages/instellingen/beschikbare-tijd.vue:27-29`, `router.back()`. Omdat er nog geen hamburgermenu is (bewuste keuze, zie Dev Notes), is een directe URL-navigatie momenteel de enige manier om deze pagina te bereiken — en dan bestaat er geen "terug" om naartoe te gaan. Fix: fallback naar `router.push('/')` als er geen historie is.
- [x] [Review][Patch] **Error-envelope-belofte in de PATCH-route wordt niet overal waargemaakt** — **gedeeltelijk gefixt, zie kanttekening.** De comment bij `validationError()` in `server/api/availability/week/[day].patch.ts:14-19` claimde dat dit bestand nooit iets anders dan de `{error:{code,message}}`-envelope teruggeeft — maar `requireUserSession(event)` en `readBody(event)` gooiden bij een fout h3's eigen foutvorm. Beide aanroepen zijn nu met `.catch(() => null)` afgevangen en herverpakt in de envelope, in beide routebestanden. **Live geverifieerd, en daarbij bleek de fix voor de sessie-helft in de praktijk dode code:** een volledig anonieme request bereikt `requireUserSession` in de route helemaal nooit — `server/middleware/session.ts` (Story 1.2, niet aangeraakt door deze patch) blokkeert `/api/availability/*` al globaal vóórdat de route-handler draait, en gooit dáár zijn eigen h3-vorm (`{"error":true,"statusCode":401,...}`). De `readBody`-helft van de fix werkt wél zoals bedoeld — getest met een ongeldige JSON-body, resultaat: nette `{error:{code:'validation_error',...}}`. Het middleware-niveau 401-gat verhelpen zou `server/middleware/session.ts` moeten aanraken, wat buiten de goedgekeurde scope van déze beslissing viel (die was expliciet beperkt tot "binnen déze twee routebestanden"). Praktisch risico is laag: het is nog steeds een 401, alleen in een andere vorm, en niets in de UI parseert de envelope-vorm specifiek. Vastgelegd, niet stilgehouden.
- [x] [Review][Patch] **Race condition: gelijktijdige PATCH-calls op dezelfde dag kunnen een increment verliezen.** `server/data/availability.ts:52-59` leest de rij, berekent `next` in JavaScript, en schrijft die als losse absolute waarde weg — geen SQL-niveau atomiciteit. Twee tabbladen of twee apparaten die tegelijk op dezelfde dag klikken kunnen elkaar overschrijven. Task 2 stond een "equivalente clamp na het lezen" expliciet toe als alternatief voor een in-query-clamp, dus dit is geen taakschending — maar de in-query-variant is net zo eenvoudig en lost het wél op: `sql\`MAX(0, ${availableTimePatterns[day]} + ${delta})\`` i.p.v. de JS-berekende absolute waarde.
- [x] [Review][Patch] **`row!`/`updated!` verbergen een echte fout achter een verkeerd geshapete crash.** `server/data/availability.ts:40` en `:62`. Als de race-conditiepath in `getOrCreateWeekPattern` faalt (de her-`select` na `onConflictDoNothing` komt leeg terug), retourneert de functie `undefined` ondanks de `!`-assertion, en de crash verschijnt twee bestanden verderop in `week-pattern.ts` als "Cannot read properties of undefined" — een 500 die niets zegt over de werkelijke oorzaak. Fix: een expliciete `throw new Error(...)` i.p.v. de assertie, op beide plekken.
- [x] [Review][Patch] **`Weekday`-type en response-vormen zijn gedupliceerd in `app/` i.p.v. gedeeld via `shared/`.** `app/pages/instellingen/beschikbare-tijd.vue:3-9`'s eigen argumentatie ("`app/` mag toch al geen types uit `server/` importeren") is feitelijk onjuist voor dit project: `shared/types/auth.d.ts` bestaat al precies voor dit doel, en de mutatie-ownership-regel gaat over runtime-aanroepen, niet over compile-time-type-imports. Risico: een server-side hernoeming van een dagveld typecheckt aan beide kanten schoon en breekt pas op runtime. Fix: `Weekday` en de response-vormen naar `shared/types/availability.d.ts` verplaatsen, in beide lagen importeren.
- [x] [Review][Patch] **`avail-back-link` is niet met Space te activeren, terwijl de UX-spec dat expliciet eist.** De Accessibility-tabel in `4.1-beschikbare-tijd-instellen.md` schrijft "Enter/Space" voor. `app/pages/instellingen/beschikbare-tijd.vue:78-84` is een `<a href="#">` — anchors activeren alleen op Enter, Space scrollt de pagina. Fix: een `<button>` gestyled als link, of een expliciete Space-keydown-handler.
- [x] [Review][Patch] **Geen foreign key van `available_time_patterns.user_id` naar `users.id`.** `server/data/schema.ts` (nieuwe tabel) — verwijderen van een `User` laat de rij permanent wees achter. Fix: `.references(() => users.id)` toevoegen aan de kolom, nieuwe migratie genereren.
- [x] [Review][Patch] **Geen `Cache-Control` op de geauthenticeerde `GET`-respons.** `server/api/availability/week.get.ts` — momenteel onschadelijk doordat SST's Router-standaard `defaultTtl: 0` hanteert, maar dat is een eigenschap van de infrastructuurconfiguratie, niet van de route zelf. Fix: `setResponseHeader(event, 'cache-control', 'private, no-store')`.

**Dismissed als ruis** (5, reden erbij):

- "Geen bovengrens bij `increase`" — dit ís het letterlijk vereiste gedrag: AC #2 zegt expliciet "is er geen bovengrens". Geen bug.
- "Business-regels (deltagrootte, 0-clamp) horen in de domain-laag, niet de data-laag" — een redelijke stijl-nit, maar de daadwerkelijke mutatie-ownership-regel (route-handlers roepen nooit rechtstreeks `server/data/` aan) wordt wél gerespecteerd.
- "Migratie-diff onvolledig" — vals alarm: `meta/_journal.json` en `meta/0001_snapshot.json` bestaan en zijn gecommit, alleen buiten de reviewscope gelaten (zelfde aanpak als bij eerdere reviews, om auto-gegenereerde JSON niet te laten meewegen).
- "Geen testdekking" — duplicaat van het al drie stories op rij vastgelegde, bekende punt in `deferred-work.md`.
- "AC #1's entry-point-tekst is herschreven i.p.v. letterlijk overgenomen" — de inhoud (hamburgermenu ontbreekt, bewust een directe route gebouwd) staat wél volledig beargumenteerd in de Dev Notes; geen functioneel gevolg.

## Dev Notes

### Scope-grens: dit is niet de hele 4.1-pagina

De UX-spec (`4.1-beschikbare-tijd-instellen.md`) beschrijft de complete pagina voor scenario 04, inclusief de dag-specifieke-afwijkingen-kalender (Story 2.2) en de Calendar-kleur-select (Story 2.3, FR28 — vereist bovendien Calendar **write**-scope, die pas in 2.3 wordt aangevraagd). Bouw uit die spec uitsluitend `avail-back-section` en `avail-week-section`. Hetzelfde principe als Story 1.1/1.2: "entities/schermen alleen bouwen wanneer de story die nodig heeft eraan toe is."

### Ontbrekend entry point: er is geen hamburgermenu

AC #1 noemt "via het hamburgermenu" als entry point, maar dat menu bestaat niet — `app/pages/index.vue` is nog een sessie-gated placeholder ("Ingelogd"), het echte hoofdscherm inclusief navigatie-chrome is Epic 4-scope. **Beslissing (geanalogeerd aan hoe Story 1.1/1.2 vergelijkbare gaten oplosten):** bouw de route `/instellingen/beschikbare-tijd` als directe, los aanklikbare pagina; bouw geen hamburgermenu. Verifiëren gebeurt door rechtstreeks naar de URL te navigeren. Wanneer Epic 4 het echte hoofdscherm bouwt, hoort de menu-link naar deze pagina daar thuis, niet hier.

### API-contract (dit ontwerp is niet 1:1 uit de UX-spec over te nemen — die specificeert alleen paden/methods, geen bodies)

- `GET /api/availability/week` → `{ pattern: { monday: number, tuesday: number, wednesday: number, thursday: number, friday: number, saturday: number, sunday: number } }`. Lazy-created bij eerste aanroep, alle dagen op 0.
- `PATCH /api/availability/week/{day}`, body `{ direction: 'increase' | 'decrease' }` → `{ day: string, minutes: number }`. `{day}` is één van de zeven Engelse sleutels hierboven, **niet** de Nederlandse dagnaam uit de UI — zie volgende punt.

**Waarom Engelse sleutels intern, Nederlandse labels alleen in de UI:** consistent met hoe dit project Google's technische begrippen (OAuth scopes, `sub`, `refresh_token`) al Engels/technisch houdt terwijl de UI Nederlands blijft (Story 1.2). PRD-specifieke termen (`studiedruk`, `doelmoment`) blijven wél Nederlands als code-naam per de Consistency Conventions — maar "maandag/dinsdag/..." is geen PRD-specifiek begrip, dus die regel is hier niet van toepassing. Gebruik gewone Engelse weekday-identifiers als kolomnaam/route-param/JSON-sleutel; vertaal pas in `app/` naar "Maandag" etc.

**Server-side clamp is verplicht, niet optioneel:** de UX-spec regelt de 0-ondergrens via een disabled client-knop, maar `/api/availability/week/{day}` is een gewone, rechtstreeks aanroepbare route. Zonder server-side clamp kan een handmatige `PATCH`-call (of een toekomstige bug in de disabled-state) de tijd negatief maken. Dit is geen AC-tekst-vereiste maar wél nodig om het systeem end-to-end correct te laten werken — zie de projectbrede regel dat een story de bestaande situatie werkend moet houden, niet alleen zijn eigen AC's moet afvinken.

### Architectuurcompliance

- **Mutatie-ownership (Consistency Conventions):** `server/api/availability/week*.ts` roept nooit rechtstreeks `server/data/availability.ts` aan — altijd via `server/domain/availability/week-pattern.ts`. Zelfde regel als Story 1.2 op `User` toepaste.
- **Error-envelope (AD-6/Consistency Conventions):** een ongeldige `day`-param is een technische fout, geen tijd-/energiegebrek-melding — gebruik dus de `{error:{code,message}}`-envelope uit `server/domain/errors.ts`, nooit de `Notification`-shape uit `server/domain/notification.ts`. Voeg de nieuwe errorcode toe aan de gedeelde vocabulaire in `errors.ts`, verzin er geen losse string voor in de route.
- **Data & formats (Consistency Conventions):** duur in minuten, integer — dit story's hele datamodel is al zo ontworpen, geen aparte conversie nodig.
- **AD-3 (planning is een berekende weergave):** `AvailableTimePattern` is scheduling-**input**, geen berekende output — deze story schrijft er dus gewoon rechtstreeks naartoe. AD-3 raakt hier niet in de knel; het is relevant zodra een latere epic de weekplanning zelf uit deze data berekent (buiten deze story's scope).
- **AD-4 (Calendar pull-only, geen achtergrondtaken):** deze story raakt Calendar helemaal niet — dat begint pas bij 2.3 (FR28, write-sync). Niet vooruit bouwen.

### Wat expliciet buiten scope valt

- **Dag-specifieke afwijkingen** (`AvailableTimeException`, `avail-calendar-section`) — Story 2.2.
- **Google Calendar-kleur / write-sync** (`avail-homework-sync-section`, FR28, UX-DR24) — Story 2.3. Vereist een nieuwe Calendar write-scope in de OAuth-consent; raak `server/routes/auth/google.get.ts`'s scope-lijst in déze story niet aan.
- **Hamburgermenu / navigatie-chrome** — Epic 4 (hoofdscherm).
- **Skeleton als herbruikbare component** — er is nog niets om te herbruiken; bouw lokaal, generaliseer niet vooruitlopend op toekomstige pagina's die ook een skeleton nodig hebben.

### Testen

Nog steeds geen testframework (drie stories op rij nu als openstaand punt genoteerd — zie `deferred-work.md`). Verificatie via typecheck, build, en een handmatige live-test op de dev-stage: nieuw account → alle dagen 0 → een paar klikken → verversen → waarden blijven staan.

## Previous Story Intelligence (Story 1.3, en cumulatief 1.1-1.3)

- **Secrets/`Resource.*` lazy lezen, nooit op module-scope.** Deze story raakt geen nieuwe secrets, maar volgt wel hetzelfde lazy-patroon voor de databaseverbinding: gebruik de bestaande `getDb()` uit `server/data/db.ts`, maak geen tweede databaseclient aan.
- **`aria-live="assertive"` kondigt niets aan als de content al vóór de eerste mutatie aanwezig is en pas bij een fout-redirect gevuld wordt** (Story 1.2/1.3-bevinding). Dit story's `avail-day-time` gebruikt bewust `polite`, niet `assertive`, en de content is van meet af aan aanwezig (de actuele waarde, geen lege placeholder) — dat val de valkuil niet, zie Task 4.
- **Claims over "dit werkt vanzelf" empirisch verifiëren, niet aannemen** (Story 1.3-les: de sessieklok-aanname bleek fout). Task 2's server-side clamp is zo'n plek: verifieer met een echte `PATCH`-call op 0 minuten dat de tijd niet negatief wordt, neem het niet aan omdat de client-knop disabled is.
- **Mutatie-ownership is nu drie keer consistent toegepast** (`server/domain/auth/`, en analoog hier `server/domain/availability/`) — een dunne wrapper is geen overbodige laag, het is de regel.

## Git Intelligence

Laatste commits (`b073b87`, `9c3ca0e`, `c35434a`, `a4e2180`, `2ebad59`) zijn de vastgelegde stories 1.1-1.3: scaffolding, OAuth-implementatie, sessieverval-fix, en de bijbehorende code-review-artefacten. Patroon dat hieruit overgenomen wordt: kleine, functionele wijziging + uitgebreide code-comments die het *waarom* vastleggen (niet het *wat*) — zie bijvoorbeeld de comments in `server/data/db.ts` en `nuxt.config.ts`. Volg die stijl ook in de nieuwe bestanden van deze story.

## Project Structure Notes

- Nieuw: `server/domain/availability/` (submap, analoog aan `server/domain/auth/` uit 1.2 — kleine, redelijke uitbreiding van de Structural Seed, geen architectuurwijziging), `server/data/availability.ts`, `server/api/availability/` (eerste echte inhoud in deze tot nu toe lege map — was alleen `.gitkeep`), `app/pages/instellingen/beschikbare-tijd.vue` (eerste pagina in een nieuwe `app/pages/instellingen/`-submap).
- Gewijzigd: `server/data/schema.ts` (nieuwe tabel), `server/domain/errors.ts` (nieuwe errorcode), nieuwe migratie onder `server/data/migrations/`.
- Geen conflicten met bestaande structuur.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.1-Weekpatroon-Instellen] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-2] — epic-context, FR11/FR28, NFR6, UX-DR16/UX-DR24
- [Source: _bmad-output/planning-artifacts/epics.md] regel 52 (FR11), regel 78 (NFR6) — FR11/NFR6 staan uitsluitend in epics.md; de PRD heeft geen aparte FR/NFR-sectie (zelfde situatie als Story 1.3's NFR4/NFR5)
- [Source: design-artifacts/C-UX-Scenarios/04-evelien-stelt-beschikbare-tijd-in/4.1-beschikbare-tijd-instellen/4.1-beschikbare-tijd-instellen.md] — volledige UI-spec; **alleen** de secties "Terug-actie" en "Weekpatroon" zijn voor déze story relevant (regels 118-229 van dat bestand); "Dag-specifieke afwijkingen" en "Huiswerk in Agenda" horen bij 2.2/2.3
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-3] — planning als berekende weergave (niet van toepassing op input-data zoals AvailableTimePattern zelf)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-4] — Calendar pull-only (niet geraakt door deze story)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Consistency-Conventions] — mutatie-ownership, ISO 8601/minuten-precisie, error-envelope-vocabulaire
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Structural-Seed] — `server/api/`, `server/domain/`, `server/data/`-indeling
- [Source: _bmad-output/implementation-artifacts/1-2-google-oauth-login-met-calendar-consent.md] — precedent voor `server/domain/<naam>/`-submap als kleine, redelijke Seed-uitbreiding
- [Source: _bmad-output/implementation-artifacts/1-3-sessieverval-opnieuw-inloggen.md] — precedent voor "claims empirisch verifiëren, niet aannemen"
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — bekend, nog open: geen testframework, geen lint/import-boundary-handhaving

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5)

### Debug Log References

- **Duplicate-ID-bug gevonden en zelf gecorrigeerd vóór typecheck/build.** De eerste versie van `beschikbare-tijd.vue` gaf de vier herhaalde Object IDs (`avail-day-label`, `avail-day-minus-button`, `avail-day-time`, `avail-day-plus-button`) letterlijk als DOM-`id` mee binnen de `v-for`-lus — dat levert zeven keer dezelfde `id` op, ongeldige HTML. De WDS-spec markeert `avail-day-row` zelf al als "herhaalbaar ×7"; voor zulke componenten is de Object ID een basisnaam, geen letterlijk uniek DOM-id. Opgelost door elk ID te suffixen met de weekdag-sleutel (`avail-day-label-monday`, enz.) vóórdat er getypecheckt of gebouwd werd.
- **Live E2E-verificatie via een zelf verzegelde sessiecookie** (zelfde techniek als de verificaties in Story 1.2/1.3): `iron-webcrypto`'s `seal()` met het echte `SessionPassword` uit SST, tegen Hillebrand's echte `User`-rij. Acht scenario's getest tegen de gedeployde dev-stage: geen sessie → 401; eerste bezoek → lazy-create met alle dagen op 0; `PATCH increase` → +15; `PATCH decrease` vanaf 0 → blijft 0 (server-side clamp, niet client-side); vijf keer `increase` → 75 (geen bovengrens); ongeldige `day` → 400 met `{error:{code:'validation_error',...}}`; ongeldige `direction` → zelfde envelope; herhaalde `GET` → waarden persisteren. Na de test zijn `monday`/`tuesday` teruggezet naar 0 via een rechtstreekse UPDATE, zodat Hillebrand geen testwaarden zag bij zijn eigen bezoek.
- **Rendering (skeleton, 7 dagrijen, disabled-state) kon ik niet zelf verifiëren.** De Chrome-browserextensie was niet verbonden ("Browser extension is not connected"), dus browserautomatisering was niet beschikbaar. Dit vereist bovendien een echte ingelogde sessie plus clientside JavaScript (`server:false`-fetch) — niet te simuleren met een server-side request zoals de API-tests hierboven. Hillebrand heeft dit zelf gecontroleerd op `flowz.fyi` en bevestigd: "Werkt perfect."
- Migratie `0001_amazing_magdalene.sql` gegenereerd en toegepast; geverifieerd via `PRAGMA table_info` dat de live Turso-tabel exact het schema volgt (alle zeven dagkolommen `INTEGER NOT NULL DEFAULT 0`). Geen herhaling van de Story 1.2-valkuil (CLI-foutmelding die wordt ingeslikt) — deze migratie slaagde in één keer.

**Code review (2026-07-31), toepassen van de patches:**

- **Root-cause van vier gelijktijdige typecheck-fouten was er één:** na het verplaatsen van `Weekday` naar `shared/types/availability.d.ts` vergat ik het aanvankelijk opnieuw te exporteren vanuit `server/data/schema.ts` (`export type { Weekday }`). Dat brak niet alleen de directe imports (`"has no exported member named 'Weekday'"`), maar liet ook `availableTimePatterns[day]`-indexering en de `WeekPattern`/`Record<Weekday,number>`-typecompatibiliteit falen — allemaal knock-on-effecten van hetzelfde ontbrekende re-export. Eén regel toegevoegd, alle vier de fouten tegelijk opgelost. Les: bij een cascade van schijnbaar losse typefouten eerst de meest fundamentele import-keten controleren voordat je losse symptomen gaat patchen.
- **De FK-migratie (`ALTER TABLE ... ALTER COLUMN ... REFERENCES ...`) is Turso/libSQL-specifieke syntax, geen standaard-SQLite** — vanilla SQLite ondersteunt normaal geen `ALTER COLUMN` om een FK aan een bestaande kolom toe te voegen (dat vereist normaal een table-rebuild). `drizzle-kit`'s Turso-dialect genereerde dit correct en de migratie slaagde; live geverifieerd met `PRAGMA foreign_key_list` dat de constraint (`user_id → users.id`) daadwerkelijk bestaat in Turso.
- **Live verificatie van de patches (zelfde sealed-cookie-techniek als eerder) legde één onvolledige fix bloot, die ik niet heb weggemoffeld:** de error-envelope-patch voor `requireUserSession`-fouten bleek voor een volledig anonieme request dode code — `server/middleware/session.ts` (Story 1.2, niet aangeraakt) blokkeert `/api/availability/*` al globaal vóórdat de route-handler draait, met zijn eigen niet-enveloped 401. Zie de patch-toelichting hierboven voor de volledige analyse en de afweging om dit niet alsnog op te lossen (zou buiten de goedgekeurde scope van déze beslissing gaan, en het praktische risico is laag).
- **Race-condition-fix live bewezen, niet alleen gelezen:** twee gelijktijdige `PATCH increase`-calls op dezelfde dag (`Promise.all`) resulteerden in `+30` (15 → 30), niet in een verloren increment. Vóór de fix zou dit `+15` zijn geweest (beide requests lezen dezelfde oude waarde, beide schrijven dezelfde nieuwe waarde). Dit is het enige scenario in deze review dat een race conditie daadwerkelijk *reproduceert* in plaats van hem alleen theoretisch te beargumenteren.
- **Skeleton-volgorde-fix live bevestigd via de rauwe SSR-HTML:** `avail-skeleton` aanwezig, `avail-week-list` afwezig in de initiële server-gerenderde payload — exact de volgorde die AC #1 eist en die de vorige versie niet haalde.

### Completion Notes List

- **Alle taken voltooid, beide AC's end-to-end geverifieerd** — AC #1 (7 dagrijen, skeleton, `User` 1:1) en AC #2 (+/- 15 min per klik, directe niet-gedebouncete call, 0-ondergrens met disabled-knop, geen bovengrens) zijn zowel op API-niveau (door mij) als op rendering-niveau (door Hillebrand) bevestigd.
- **Scope strak gehouden:** alleen `avail-back-section` en `avail-week-section` uit de 4.1-UX-spec gebouwd. `avail-calendar-section` (Story 2.2) en `avail-homework-sync-section`/Calendar-write-scope (Story 2.3, FR28) zijn niet aangeraakt — geverifieerd door `server/routes/auth/google.get.ts`'s scope-lijst ongewijzigd te laten.
- **Twee ontwerpbeslissingen uit de story-Dev Notes zijn zonder wijziging geïmplementeerd:** het "User 1:1 → één rij, zeven kolommen"-datamodel, en de directe route zonder hamburgermenu. Geen van beide bleek tijdens implementatie problematisch.
- **Nieuwe precedenten voor toekomstige stories:** dit is de eerste keer dat `server/domain/errors.ts`'s `ErrorEnvelope` daadwerkelijk gebruikt wordt (eerder alleen gedefinieerd, nul aanroepen) — geïmplementeerd als een rechtstreeks geretourneerd object (`setResponseStatus` + de envelope teruggeven), niet via h3's `createError`, omdat die laatste een andere JSON-vorm serialiseert dan de architectuur voorschrijft. Ook de eerste keer dat een pagina een herhaalbaar Object-ID-patroon (`×7`) heeft — de suffix-per-instantie-aanpak (zie Debug Log) is nu het precedent voor Story 2.2's kalenderdagen.
- **Server-side clamp is empirisch bevestigd, niet aangenomen** (les uit Story 1.3): scenario 4 in de E2E-test bewijst dat `decrease` vanaf 0 op 0 blijft via de API zelf, los van de disabled-knop op de client.
- **Code review: 2 decision-needed, 10 patch, 0 defer, 5 dismissed.** Beide beslispunten door Hillebrand opgelost (401/foutafhandeling: nu fixen; GET met neveneffect: accepteren). Alle 10 patches toegepast en live geverifieerd, op één na volledig (zie Debug Log voor de eerlijke kanttekening bij de error-envelope-patch). Belangrijkste vondst: de skeleton-verificatie die ik eerder als "geverifieerd" had afgevinkt testte het eindresultaat, niet de laadvolgorde — alle drie de reviewlagen vonden onafhankelijk van elkaar dat de skeleton in werkelijkheid ná de content verscheen, niet ervoor. Zelf teruggeleid tot in Nuxt's broncode (`pendingWhenIdle` staat standaard uit) en met een structurele fix opgelost (skeleton-gate op `pattern === null` i.p.v. op Nuxt's interne `pending`-status).

### File List

**Nieuw:**
- `server/data/availability.ts`
- `server/domain/availability/week-pattern.ts`
- `server/api/availability/week.get.ts`
- `server/api/availability/week/[day].patch.ts`
- `app/pages/instellingen/beschikbare-tijd.vue`
- `shared/types/availability.d.ts` (code review: `Weekday` + response-types gedeeld i.p.v. gedupliceerd)
- `server/data/migrations/0001_amazing_magdalene.sql` (+ bijbehorende meta-bestanden)
- `server/data/migrations/0002_needy_guardsmen.sql` (code review: FK `available_time_patterns.user_id → users.id`, + bijbehorende meta-bestanden)

**Gewijzigd:**
- `server/data/schema.ts` (nieuwe `availableTimePatterns`-tabel; na code review: `Weekday` komt uit `shared/`, FK-referentie toegevoegd)
- `server/domain/errors.ts` (nieuwe `ValidationError`-code; na code review: `Unauthorized`-code toegevoegd)
- `server/data/availability.ts` (na code review: atomaire SQL-clamp i.p.v. JS-berekende read-modify-write, expliciete throws i.p.v. non-null-assertions)
- `server/api/availability/week.get.ts` (na code review: error-envelope voor `requireUserSession`, `Cache-Control`-header)
- `server/api/availability/week/[day].patch.ts` (na code review: error-envelope voor `requireUserSession`/`readBody`)
- `app/pages/instellingen/beschikbare-tijd.vue` (na code review: skeleton-gate herzien, plus-knop-guard, terug-knop-fallback + toetsenbordtoegankelijkheid, 401-afhandeling, gedeelde types)

**Live gedeployed:** dev-stage op `flowz.fyi`, alle migraties toegepast op de echte Turso-database.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-07-31 | Story aangemaakt via create-story, direct aansluitend op het afsluiten van Epic 1. Twee gaten (datamodel voor "User 1:1", ontbrekend hamburgermenu) als beargumenteerde keuzes vastgelegd i.p.v. als open vraag. |
| 2026-07-31 | Alle vier implementatietaken voltooid: schema + migratie, repository + domain-laag, twee API-routes, front-end beperkt tot het weekpatroon-gedeelte van 4.1. Eigen duplicate-ID-bug gevonden en gecorrigeerd vóór typecheck. Typecheck en build slagen, migratie live toegepast en schema-geverifieerd. Acht API-scenario's end-to-end getest tegen de dev-stage via een zelf verzegelde sessiecookie. Rendering kon niet door mij geverifieerd worden (Chrome-extensie niet verbonden) — door Hillebrand zelf gecontroleerd en bevestigd: "Werkt perfect." Status → review. |
| 2026-07-31 | Code review (3 lagen parallel): 17 bevindingen na triage. Belangrijkste: de skeleton bleek ná i.p.v. vóór de content te verschijnen — de eigen rendering-verificatie testte het eindresultaat, niet de laadvolgorde. Beide beslispunten opgelost (401-afhandeling nu gefixt, GET-neveneffect geaccepteerd), alle 10 patches toegepast: skeleton-gate herzien, race condition met atomaire SQL-clamp opgelost (live bewezen met gelijktijdige requests), plus-knop-guard, FK-constraint, gedeelde types via `shared/`, terug-knop-fallback + toetsenbordtoegankelijkheid, non-null-assertions vervangen, `Cache-Control`-header, error-envelope voor twee van de drie faalpaden (de derde — middleware-niveau 401 — bleek buiten scope en is expliciet vastgelegd, niet verzwegen). Alle fixes live gedeployed en geverifieerd. Status → done. |
| 2026-07-31 | **Na `done`, op expliciete productbeslissing van Hillebrand:** een plafond van 24 uur (`MAX_MINUTES_PER_DAY`, `shared/utils/availability.ts`) toegevoegd aan `updateWeekPatternDay`'s `increase`-pad, wijkt af van de UX-spec's "geen bovengrens". Typecheck en build slagen. Zie ook Story 2.2's Change Log voor dezelfde wijziging aan de exceptie-kant. |
| 2026-07-31 | Gedeployed en live geverifieerd na Hillebrand's AWS-herauthenticatie: `friday` rechtstreeks op 1440 gezet en `increase` geprobeerd → bleef 1440 (niet 1455); `decrease` vanaf het plafond werkt nog gewoon (→ 1425); reguliere increment/decrement op `saturday` ongewijzigd. Plafond bevestigd op beide richtingen zonder de bestaande 0-ondergrens te breken. |

## Open Questions

Geen — de twee gaten die deze story raakte (welk datamodel voor "User 1:1", en het ontbrekende hamburgermenu) zijn hierboven als gemaakte, beargumenteerde keuzes vastgelegd, niet als open vragen. Als je een van beide anders wilt, zeg het vóór implementatie.
